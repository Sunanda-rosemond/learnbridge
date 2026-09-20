import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EmployeeProvisioningService } from './employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from './in-memory-employee.repository.js';
import type { ProvisionEmployeeCommand } from './employee.types.js';

function setup() {
  const repository = new InMemoryEmployeeRepository();
  const service = new EmployeeProvisioningService(repository);

  return { repository, service };
}

const command: ProvisionEmployeeCommand = {
  tenantId: 'tenant-1',
  sourceSystem: 'demo-hr',
  externalEmployeeId: 'EMP-204',
  workEmail: 'employee@example.com',
  employmentStatus: 'ACTIVE',
};

test('creates an employee and persists their data', async () => {
  const { repository, service } = setup();

  const result = await service.execute(command);

  assert.equal(result.outcome, 'CREATED');
  assert.ok(result.employee.id);
  assert.equal(result.employee.managerId, null);

  const stored = await repository.findByExternalIdentity(
    command.tenantId,
    command.sourceSystem,
    command.externalEmployeeId,
  );

  assert.deepEqual(stored, result.employee);
});

test('repeated identical input preserves the employee and timestamps', async () => {
  const { service } = setup();

  const first = await service.execute(command);
  const second = await service.execute(command);

  assert.equal(second.outcome, 'UNCHANGED');
  assert.deepEqual(second.employee, first.employee);
});

test('updates changed fields while preserving identity and creation time', async () => {
  const { repository, service } = setup();

  const first = await service.execute(command);

  const updated = await service.execute({
    ...command,
    workEmail: 'new@example.com',
    employmentStatus: 'INACTIVE',
  });

  assert.equal(updated.outcome, 'UPDATED');
  assert.equal(updated.employee.id, first.employee.id);
  assert.deepEqual(updated.employee.createdAt, first.employee.createdAt);
  assert.equal(updated.employee.workEmail, 'new@example.com');
  assert.equal(updated.employee.employmentStatus, 'INACTIVE');

  const stored = await repository.findByExternalIdentity(
    command.tenantId,
    command.sourceSystem,
    command.externalEmployeeId,
  );

  assert.deepEqual(stored, updated.employee);
});

test('the same external ID in different tenants creates separate employees', async () => {
  const { service } = setup();

  const first = await service.execute(command);
  const second = await service.execute({
    ...command,
    tenantId: 'tenant-2',
  });

  assert.equal(second.outcome, 'CREATED');
  assert.notEqual(second.employee.id, first.employee.id);
});

test('omitting a manager preserves the relationship; null removes it', async () => {
  const { service } = setup();

  const manager = await service.execute({
    ...command,
    externalEmployeeId: 'EMP-100',
    workEmail: 'manager@example.com',
  });

  const employee = await service.execute({
    ...command,
    managerExternalId: 'EMP-100',
  });

  assert.equal(employee.employee.managerId, manager.employee.id);

  const preserved = await service.execute(command);

  assert.equal(preserved.outcome, 'UNCHANGED');
  assert.equal(preserved.employee.managerId, manager.employee.id);

  const cleared = await service.execute({
    ...command,
    managerExternalId: null,
  });

  assert.equal(cleared.outcome, 'UPDATED');
  assert.equal(cleared.employee.managerExternalId, null);
  assert.equal(cleared.employee.managerId, null);
});
test('resolves a waiting employee when their manager arrives later', async () => {
  const { repository, service } = setup();

  const first = await service.execute({
    ...command,
    managerExternalId: 'EMP-100',
  });

  assert.equal(first.employee.managerId, null);
  assert.equal(first.employee.managerExternalId, 'EMP-100');

  const manager = await service.execute({
    ...command,
    externalEmployeeId: 'EMP-100',
    workEmail: 'manager@example.com',
  });

  const employee = await repository.findByExternalIdentity(
    command.tenantId,
    command.sourceSystem,
    command.externalEmployeeId,
  );

  assert.ok(employee);
  assert.equal(employee.id, first.employee.id);
  assert.equal(employee.managerId, manager.employee.id);
  assert.deepEqual(employee.createdAt, first.employee.createdAt);

  // Repeating reconciliation should perform no further updates.
  const resolvedAgain = await repository.resolvePendingManagerLinks(
    manager.employee,
  );

  assert.equal(resolvedAgain, 0);
});
