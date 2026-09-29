import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createDatabasePool } from '../../database/pool.js';
import { PostgresAssignmentRepository } from './postgres-assignment.repository.js';
import { PostgresEmployeeRepository } from '../employees/postgres-employee.repository.js';
import { PostgresCourseRepository } from '../courses/postgres-course.repository.js';

import type { LearningAssignment } from './assignment.types.js';
import { setTimeout as delay } from 'node:timers/promises';
import { AssignmentError } from './assignment.errors.js';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required');
}

if (new URL(connectionString).pathname !== '/learnbridge_test') {
  throw new Error('Database tests must use learnbridge_test');
}

const pool = createDatabasePool(connectionString);

const assignments = new PostgresAssignmentRepository(pool);
const employees = new PostgresEmployeeRepository(pool);
const courses = new PostgresCourseRepository(pool);

const tenantId = `test-${randomUUID()}`;

before(async () => {
  const result = await pool.query('SELECT current_database()');

  assert.equal(result.rows[0].current_database, 'learnbridge_test');
});

after(async () => {
  try {
    // Remove assignments before the records they reference.
    await pool.query('DELETE FROM learning_assignments WHERE tenant_id = $1', [
      tenantId,
    ]);

    await pool.query('DELETE FROM courses WHERE tenant_id = $1', [tenantId]);

    await pool.query('DELETE FROM employees WHERE tenant_id = $1', [tenantId]);
  } finally {
    await pool.end();
  }
});

async function setupAssignment() {
  const now = new Date();
  const employeeId = randomUUID();
  const courseId = randomUUID();

  await employees.save({
    id: employeeId,
    tenantId,
    sourceSystem: 'test-hr',
    externalEmployeeId: `EMP-${randomUUID()}`,
    workEmail: 'assignment-test@example.com',
    employmentStatus: 'ACTIVE',
    managerExternalId: null,
    managerId: null,
    createdAt: now,
    updatedAt: now,
  });

  const course = {
    id: courseId,
    tenantId,
    title: 'Security Awareness',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await courses.save(course);

  const assignment: LearningAssignment = {
    id: randomUUID(),
    tenantId,
    employeeId,
    courseId,
    trainingCycle: '2026',
    status: 'ASSIGNED',
    assignedAt: now,
    completedAt: null,
    updatedAt: now,
  };

  return { assignment, course };
}

test('PostgreSQL assignments: persists an assignment and preserves it on repeat', async () => {
  const { assignment } = await setupAssignment();

  const first = await assignments.createIfAbsent(assignment);

  assert.equal(first.outcome, 'CREATED');
  assert.deepEqual(first.assignment, assignment);

  assert.deepEqual(await assignments.findExisting(assignment), assignment);

  // A second request proposes a new ID for the same obligation.
  const repeated = await assignments.createIfAbsent({
    ...assignment,
    id: randomUUID(),
    assignedAt: new Date(assignment.assignedAt.getTime() + 1000),
    updatedAt: new Date(assignment.updatedAt.getTime() + 1000),
  });

  assert.equal(repeated.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.assignment, assignment);
});

test('PostgreSQL assignments: rechecks course eligibility before inserting', async () => {
  const { assignment, course } = await setupAssignment();

  // The candidate was prepared while the course was active.
  // The course becomes inactive before the repository inserts it.
  await courses.save({
    ...course,
    isActive: false,
    updatedAt: new Date(),
  });

  await assert.rejects(() => assignments.createIfAbsent(assignment), {
    name: 'AssignmentError',
    code: 'COURSE_INACTIVE',
  });

  assert.equal(await assignments.findExisting(assignment), null);
});
test('PostgreSQL assignments: waits for deactivation and rejects the inactive course', async () => {
  const { assignment, course } = await setupAssignment();
  const blocker = await pool.connect();

  let transactionOpen = false;
  let attempt: Promise<unknown> | undefined;

  try {
    await blocker.query('BEGIN');
    transactionOpen = true;

    const session = await blocker.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );

    const blockerPid = session.rows[0]!.pid;

    // Change the course, but deliberately do not commit yet.
    await blocker.query(
      `
        UPDATE courses
        SET is_active = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND id = $2
      `,
      [course.tenantId, course.id],
    );

    // Start assignment creation while deactivation holds the lock.
    // Capture rejection immediately to avoid an unhandled rejection.
    attempt = assignments.createIfAbsent(assignment).then(
      () => null,
      (error: unknown) => error,
    );

    let observedWaiting = false;

    for (let poll = 0; poll < 50; poll += 1) {
      const waiting = await pool.query<{ blocked: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND $1::integer = ANY(pg_blocking_pids(pid))
          ) AS blocked
        `,
        [blockerPid],
      );

      if (waiting.rows[0]?.blocked) {
        observedWaiting = true;
        break;
      }

      await delay(100);
    }

    assert.equal(
      observedWaiting,
      true,
      'Assignment creation should wait for the deactivation lock',
    );

    await blocker.query('COMMIT');
    transactionOpen = false;

    const error = await attempt;

    assert.ok(error instanceof AssignmentError);
    assert.equal(error.code, 'COURSE_INACTIVE');

    assert.equal(await assignments.findExisting(assignment), null);
  } finally {
    try {
      if (transactionOpen) {
        await blocker.query('ROLLBACK');
      }
    } finally {
      blocker.release();
      await attempt;
    }
  }
});
