import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createDatabasePool } from '../../database/pool.js';
import { PostgresCourseRepository } from './postgres-course.repository.js';
import type { Course } from './course.types.js';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is required');
}

if (new URL(connectionString).pathname !== '/learnbridge_test') {
  throw new Error('Database tests must use learnbridge_test');
}

const pool = createDatabasePool(connectionString);
const repository = new PostgresCourseRepository(pool);

const tenantA = `test-${randomUUID()}`;
const tenantB = `test-${randomUUID()}`;

before(async () => {
  const result = await pool.query('SELECT current_database()');

  assert.equal(result.rows[0].current_database, 'learnbridge_test');
});

after(async () => {
  try {
    await pool.query('DELETE FROM courses WHERE tenant_id = ANY($1::text[])', [
      [tenantA, tenantB],
    ]);
  } finally {
    await pool.end();
  }
});

function makeCourse(): Course {
  const now = new Date();

  return {
    id: randomUUID(),
    tenantId: tenantA,
    title: 'Security Awareness',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

test('PostgreSQL courses: saves, retrieves and updates availability', async () => {
  const course = makeCourse();

  await repository.save(course);

  assert.deepEqual(await repository.findById(tenantA, course.id), course);

  const deactivated: Course = {
    ...course,
    isActive: false,
    updatedAt: new Date(course.updatedAt.getTime() + 1000),
  };

  await repository.save(deactivated);

  assert.deepEqual(await repository.findById(tenantA, course.id), deactivated);
});

test('PostgreSQL courses: another tenant cannot retrieve the course', async () => {
  const course = makeCourse();

  await repository.save(course);

  assert.equal(await repository.findById(tenantB, course.id), null);

  assert.deepEqual(await repository.findById(tenantA, course.id), course);
});

test('PostgreSQL courses: rejects reassignment to another tenant', async () => {
  const course = makeCourse();

  await repository.save(course);

  await assert.rejects(
    () =>
      repository.save({
        ...course,
        tenantId: tenantB,
        title: 'Attempted replacement',
        isActive: false,
      }),
    {
      message: 'Cannot change the tenant of an existing course',
    },
  );

  assert.deepEqual(await repository.findById(tenantA, course.id), course);

  assert.equal(await repository.findById(tenantB, course.id), null);
});
