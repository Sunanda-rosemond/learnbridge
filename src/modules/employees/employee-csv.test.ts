import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEmployeeCsv } from './employee-csv.parser.js';
import { validateEmployeeCsv } from './employee-csv.validator.js';
import { detectEmployeeDuplicates } from './employee-csv.duplicates.js';
import { EmployeeImportService } from './employee-import.service.js';
import { EmployeeProvisioningService } from './employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from './in-memory-employee.repository.js';

test('CSV: rejects conflicting duplicates and keeps unrelated employees', () => {
  const csv = [
    'externalEmployeeId,workEmail,employmentStatus,managerExternalId',
    'EMP-204,rose@example.com,ACTIVE,',
    'EMP-204,rose@example.com,INACTIVE,',
    'EMP-300,manager@example.com,ACTIVE,',
  ].join('\n');

  const parsed = parseEmployeeCsv(csv);
  const validated = validateEmployeeCsv(parsed);
  const plan = detectEmployeeDuplicates(validated);

  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0]?.primary.data.externalEmployeeId, 'EMP-300');
  assert.deepEqual(plan.groups[0]?.duplicateRows, []);

  assert.deepEqual(
    plan.rejectedRows.map((row) => ({
      row: row.row,
      status: row.status,
      reason: row.reason,
    })),
    [
      {
        row: 2,
        status: 'REJECTED',
        reason: 'CONFLICTING_DUPLICATE',
      },
      {
        row: 3,
        status: 'REJECTED',
        reason: 'CONFLICTING_DUPLICATE',
      },
    ],
  );
});
test('CSV: groups identical duplicates into one operation', () => {
  const csv = [
    'externalEmployeeId,workEmail,employmentStatus,managerExternalId',
    'EMP-204,rose@example.com,ACTIVE,',
    'EMP-204,rose@example.com,ACTIVE,',
  ].join('\n');

  const plan = detectEmployeeDuplicates(
    validateEmployeeCsv(parseEmployeeCsv(csv)),
  );

  assert.deepEqual(plan.rejectedRows, []);
  assert.equal(plan.groups.length, 1);

  const group = plan.groups[0];

  assert.ok(group);
  assert.equal(group.primary.row, 2);
  assert.equal(group.primary.data.externalEmployeeId, 'EMP-204');
  assert.equal(group.primary.data.managerExternalId, null);
  assert.deepEqual(group.duplicateRows, [3]);
});
test('CSV: an invalid duplicate blocks the valid row for the same employee', () => {
  const csv = [
    'externalEmployeeId,workEmail,employmentStatus,managerExternalId',
    'EMP-204,rose@example.com,ACTIVE,',
    'EMP-204,not-an-email,INACTIVE,',
  ].join('\n');

  const plan = detectEmployeeDuplicates(
    validateEmployeeCsv(parseEmployeeCsv(csv)),
  );

  assert.deepEqual(plan.groups, []);

  assert.deepEqual(
    plan.rejectedRows.map(({ row, reason }) => ({ row, reason })),
    [
      { row: 2, reason: 'CONFLICTING_DUPLICATE' },
      { row: 3, reason: 'INVALID_ROW' },
    ],
  );
});
test('CSV: imports accepted employees and safely handles a repeat import', async () => {
  const repository = new InMemoryEmployeeRepository();
  const provisioning = new EmployeeProvisioningService(repository);
  const importer = new EmployeeImportService(provisioning);

  const context = {
    tenantId: 'test-employer',
    sourceSystem: 'test-hr',
  };

  const csv = [
    'externalEmployeeId,workEmail,employmentStatus,managerExternalId',
    'EMP-100,manager@example.com,ACTIVE,',
    'EMP-204,rose@example.com,ACTIVE,EMP-100',
    'EMP-204,rose@example.com,ACTIVE,EMP-100',
    'EMP-300,other@example.com,ACTIVE,',
    'EMP-300,other@example.com,INACTIVE,',
  ].join('\n');

  const first = await importer.execute(csv, context);

  assert.deepEqual(
    first.rows.map(({ row, status }) => ({ row, status })),
    [
      { row: 2, status: 'CREATED' },
      { row: 3, status: 'CREATED' },
      { row: 4, status: 'DUPLICATE' },
      { row: 5, status: 'REJECTED' },
      { row: 6, status: 'REJECTED' },
    ],
  );

  assert.equal(first.totalRows, 5);
  assert.equal(first.created, 2);
  assert.equal(first.updated, 0);
  assert.equal(first.unchanged, 0);
  assert.equal(first.duplicates, 1);
  assert.equal(first.rejected, 2);

  const manager = await repository.findByExternalIdentity(
    context.tenantId,
    context.sourceSystem,
    'EMP-100',
  );

  const employee = await repository.findByExternalIdentity(
    context.tenantId,
    context.sourceSystem,
    'EMP-204',
  );

  assert.ok(manager);
  assert.ok(employee);
  assert.equal(employee.managerId, manager.id);

  const rejectedEmployee = await repository.findByExternalIdentity(
    context.tenantId,
    context.sourceSystem,
    'EMP-300',
  );

  assert.equal(rejectedEmployee, null);

  const repeated = await importer.execute(csv, context);

  assert.equal(repeated.created, 0);
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.unchanged, 2);
  assert.equal(repeated.duplicates, 1);
  assert.equal(repeated.rejected, 2);

  const employeeAfterRepeat = await repository.findByExternalIdentity(
    context.tenantId,
    context.sourceSystem,
    'EMP-204',
  );

  assert.deepEqual(employeeAfterRepeat, employee);
});
