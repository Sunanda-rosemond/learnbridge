import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createDatabasePool } from '../../database/pool.js';
import { PostgresEmployeeRepository } from './postgres-employee.repository.js';
import type { Employee } from './employee.types.js';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required');
}

if (new URL(connectionString).pathname !== '/learnbridge_test') {
  throw new Error('Database tests must use learnbridge_test');
}

const pool = createDatabasePool(connectionString);
const repository = new PostgresEmployeeRepository(pool);

// Unique tenant IDs keep this run separate from other test runs.
const tenantA = `test-${randomUUID()}`;
const tenantB = `test-${randomUUID()}`;

before(async () => {
  const result = await pool.query('SELECT current_database()');

  assert.equal(result.rows[0].current_database, 'learnbridge_test');
});

after(async () => {
  try {
    // Delete only records belonging to this test run.
    await pool.query(
      'DELETE FROM employees WHERE tenant_id = ANY($1::text[])',
      [[tenantA, tenantB]],
    );
  } finally {
    await pool.end();
  }
});

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  const now = new Date();

  return {
    id: randomUUID(),
    tenantId: tenantA,
    sourceSystem: 'test-hr',
    externalEmployeeId: `EMP-${randomUUID()}`,
    workEmail: 'employee@example.com',
    employmentStatus: 'ACTIVE',
    managerExternalId: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('PostgreSQL: saves, retrieves and updates an employee', async () => {
  const employee = makeEmployee();

  await repository.save(employee);

  const stored = await repository.findByExternalIdentity(
    employee.tenantId,
    employee.sourceSystem,
    employee.externalEmployeeId,
  );

  assert.deepEqual(stored, employee);

  const updated: Employee = {
    ...employee,
    workEmail: 'updated@example.com',
    employmentStatus: 'INACTIVE',
    updatedAt: new Date(employee.updatedAt.getTime() + 1000),
  };

  await repository.save(updated);

  const retrieved = await repository.findByExternalIdentity(
    employee.tenantId,
    employee.sourceSystem,
    employee.externalEmployeeId,
  );

  assert.deepEqual(retrieved, updated);
});

test('PostgreSQL: prevents duplicate external identities within a tenant', async () => {
  const employee = makeEmployee();

  await repository.save(employee);

  const duplicate = {
    ...employee,
    id: randomUUID(),
  };

  await assert.rejects(() => repository.save(duplicate), {
    code: '23505',
    constraint: 'employees_external_identity_unique',
  });

  // The same external identity is allowed in another tenant.
  const otherTenantEmployee = {
    ...duplicate,
    tenantId: tenantB,
  };

  await repository.save(otherTenantEmployee);

  const stored = await repository.findByExternalIdentity(
    tenantB,
    employee.sourceSystem,
    employee.externalEmployeeId,
  );

  assert.equal(stored?.id, otherTenantEmployee.id);
});

test('PostgreSQL: allows a same-tenant manager and rejects a cross-tenant manager', async () => {
  const manager = makeEmployee();

  await repository.save(manager);

  const employee = makeEmployee({
    managerId: manager.id,
    managerExternalId: manager.externalEmployeeId,
  });

  await repository.save(employee);

  const stored = await repository.findByExternalIdentity(
    employee.tenantId,
    employee.sourceSystem,
    employee.externalEmployeeId,
  );

  assert.equal(stored?.managerId, manager.id);

  const otherTenantEmployee = makeEmployee({
    tenantId: tenantB,
    managerId: manager.id,
    managerExternalId: manager.externalEmployeeId,
  });

  await assert.rejects(() => repository.save(otherTenantEmployee), {
    code: '23503',
    constraint: 'employees_manager_same_tenant_fk',
  });
});
