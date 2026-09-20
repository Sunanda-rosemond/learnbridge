import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createDatabasePool } from '../../database/pool.js';
import { PostgresEmployeeRepository } from './postgres-employee.repository.js';
import type { Employee } from './employee.types.js';
import { EmployeeIdentityConflictError } from './employee.errors.js';
import { EmployeeProvisioningService } from './employee-provisioning.service.js';
import type { EmployeeRepository } from './employee.repository.js';

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

  // await assert.rejects(() => repository.save(duplicate), {
  //   code: '23505',
  //   constraint: 'employees_external_identity_unique',
  // });

  await assert.rejects(
    () => repository.save(duplicate),
    EmployeeIdentityConflictError,
  );

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

test('PostgreSQL: concurrent identical provisioning creates one employee', async () => {
  let arrivals = 0;
  let release: () => void = () => {};

  const bothReady = new Promise<void>((resolve) => {
    release = resolve;
  });

  const racingRepository: EmployeeRepository = {
    findByExternalIdentity: (tenantId, sourceSystem, externalId) =>
      repository.findByExternalIdentity(tenantId, sourceSystem, externalId),
    resolvePendingManagerLinks: (manager) =>
      repository.resolvePendingManagerLinks(manager),
    async save(employee) {
      arrivals += 1;

      if (arrivals === 2) {
        release();
      }

      // Both requests must reach save before either can insert.
      await bothReady;

      await repository.save(employee);
    },
  };

  const service = new EmployeeProvisioningService(racingRepository);

  const command = {
    tenantId: tenantA,
    sourceSystem: 'test-hr',
    externalEmployeeId: `RACE-${randomUUID()}`,
    workEmail: 'race@example.com',
    employmentStatus: 'ACTIVE' as const,
  };

  const results = await Promise.all([
    service.execute(command),
    service.execute(command),
  ]);

  assert.deepEqual(results.map((result) => result.outcome).sort(), [
    'CREATED',
    'UNCHANGED',
  ]);

  assert.equal(results[0]!.employee.id, results[1]!.employee.id);

  const rows = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM employees
      WHERE tenant_id = $1
        AND source_system = $2
        AND external_employee_id = $3
    `,
    [command.tenantId, command.sourceSystem, command.externalEmployeeId],
  );

  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0]!.id, results[0]!.employee.id);
});
test('PostgreSQL: resolves pending managers only within the same tenant and source', async () => {
  const manager = makeEmployee();

  const waiting = makeEmployee({
    managerExternalId: manager.externalEmployeeId,
  });

  const otherTenant = makeEmployee({
    tenantId: tenantB,
    managerExternalId: manager.externalEmployeeId,
  });

  const otherSource = makeEmployee({
    sourceSystem: 'another-hr',
    managerExternalId: manager.externalEmployeeId,
  });

  // Employees arrive before the manager.
  await repository.save(waiting);
  await repository.save(otherTenant);
  await repository.save(otherSource);

  await repository.save(manager);

  const resolved = await repository.resolvePendingManagerLinks(manager);

  assert.equal(resolved, 1);

  for (const original of [waiting, otherTenant, otherSource]) {
    const stored = await repository.findByExternalIdentity(
      original.tenantId,
      original.sourceSystem,
      original.externalEmployeeId,
    );

    assert.ok(stored);

    if (original.id === waiting.id) {
      assert.equal(stored.managerId, manager.id);
      assert.equal(stored.managerExternalId, manager.externalEmployeeId);
      assert.deepEqual(stored.createdAt, original.createdAt);
    } else {
      assert.deepEqual(stored, original);
    }
  }

  const resolvedAgain = await repository.resolvePendingManagerLinks(manager);

  assert.equal(resolvedAgain, 0);
});
