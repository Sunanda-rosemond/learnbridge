import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AssignmentService } from './assignment.service.js';
import { InMemoryAssignmentRepository } from './in-memory-assignment.repository.js';

import { EmployeeProvisioningService } from '../employees/employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from '../employees/in-memory-employee.repository.js';

import { CourseService } from '../courses/course.service.js';
import { InMemoryCourseRepository } from '../courses/in-memory-course.repository.js';

async function setup() {
  const employees = new InMemoryEmployeeRepository();
  const courses = new InMemoryCourseRepository();
  const assignments = new InMemoryAssignmentRepository();

  const provisioning = new EmployeeProvisioningService(employees);
  const courseService = new CourseService(courses);

  const employeeResult = await provisioning.execute({
    tenantId: 'tenant-1',
    sourceSystem: 'test-hr',
    externalEmployeeId: 'EMP-204',
    workEmail: 'rose@example.com',
    employmentStatus: 'ACTIVE',
  });

  const course = await courseService.create({
    tenantId: 'tenant-1',
    title: 'Security Awareness',
  });

  const service = new AssignmentService(assignments, employees, courses);

  const command = {
    tenantId: 'tenant-1',
    employeeId: employeeResult.employee.id,
    courseId: course.id,
    trainingCycle: '2026',
  };

  return {
    service,
    assignments,
    employees,
    courses,
    provisioning,
    courseService,
    command,
  };
}

test('assigns an active course to an active employee', async () => {
  const { service, assignments, command } = await setup();

  const result = await service.assign(command);

  assert.equal(result.outcome, 'CREATED');
  assert.ok(result.assignment.id);
  assert.equal(result.assignment.tenantId, command.tenantId);
  assert.equal(result.assignment.employeeId, command.employeeId);
  assert.equal(result.assignment.courseId, command.courseId);
  assert.equal(result.assignment.trainingCycle, '2026');
  assert.equal(result.assignment.status, 'ASSIGNED');
  assert.equal(result.assignment.completedAt, null);

  assert.deepEqual(await assignments.findExisting(command), result.assignment);
});

test('repeating the assignment preserves its identity and timestamps', async () => {
  const { service, command } = await setup();

  const first = await service.assign(command);
  const repeated = await service.assign(command);

  assert.equal(repeated.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.assignment, first.assignment);
});
test('rejects a new assignment for an inactive employee', async () => {
  const { service, assignments, provisioning, command } = await setup();

  await provisioning.execute({
    tenantId: command.tenantId,
    sourceSystem: 'test-hr',
    externalEmployeeId: 'EMP-204',
    workEmail: 'rose@example.com',
    employmentStatus: 'INACTIVE',
  });

  await assert.rejects(() => service.assign(command), {
    name: 'AssignmentError',
    code: 'EMPLOYEE_INACTIVE',
  });

  assert.equal(await assignments.findExisting(command), null);
});

test('rejects a new assignment for an inactive course', async () => {
  const { service, assignments, courseService, command } = await setup();

  await courseService.setAvailability({
    tenantId: command.tenantId,
    courseId: command.courseId,
    isActive: false,
  });

  await assert.rejects(() => service.assign(command), {
    name: 'AssignmentError',
    code: 'COURSE_INACTIVE',
  });

  assert.equal(await assignments.findExisting(command), null);
});
test('a new training cycle creates a separate assignment', async () => {
  const { service, assignments, command } = await setup();

  const original = await service.assign(command);

  const refresherCommand = {
    ...command,
    trainingCycle: '2027',
  };

  const refresher = await service.assign(refresherCommand);

  assert.equal(refresher.outcome, 'CREATED');
  assert.notEqual(refresher.assignment.id, original.assignment.id);
  assert.equal(refresher.assignment.trainingCycle, '2027');
  assert.equal(refresher.assignment.status, 'ASSIGNED');

  assert.deepEqual(
    await assignments.findExisting(command),
    original.assignment,
  );

  assert.deepEqual(
    await assignments.findExisting(refresherCommand),
    refresher.assignment,
  );
});
test('returns an existing assignment unchanged after course deactivation', async () => {
  const { service, assignments, courseService, command } = await setup();

  const original = await service.assign(command);

  await courseService.setAvailability({
    tenantId: command.tenantId,
    courseId: command.courseId,
    isActive: false,
  });

  const repeated = await service.assign(command);

  assert.equal(repeated.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.assignment, original.assignment);

  const nextCycle = {
    ...command,
    trainingCycle: '2027',
  };

  await assert.rejects(() => service.assign(nextCycle), {
    name: 'AssignmentError',
    code: 'COURSE_INACTIVE',
  });

  assert.equal(await assignments.findExisting(nextCycle), null);
});
