import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CourseService } from './course.service.js';
import { InMemoryCourseRepository } from './in-memory-course.repository.js';
import {
  CourseNotFoundError,
  InvalidCourseTitleError,
} from './course.errors.js';

function setup() {
  const repository = new InMemoryCourseRepository();
  const service = new CourseService(repository);

  return { repository, service };
}

test('creates an active course with a trimmed title', async () => {
  const { repository, service } = setup();

  const course = await service.create({
    tenantId: 'tenant-1',
    title: '  Security Awareness  ',
  });

  assert.ok(course.id);
  assert.equal(course.title, 'Security Awareness');
  assert.equal(course.isActive, true);
  assert.deepEqual(course.createdAt, course.updatedAt);

  const stored = await repository.findById('tenant-1', course.id);

  assert.deepEqual(stored, course);
});

test('rejects a blank course title', async () => {
  const { service } = setup();

  await assert.rejects(
    () =>
      service.create({
        tenantId: 'tenant-1',
        title: '   ',
      }),
    InvalidCourseTitleError,
  );
});

test('deactivates and reactivates a course while preserving its identity', async () => {
  const { repository, service } = setup();

  const course = await service.create({
    tenantId: 'tenant-1',
    title: 'Security Awareness',
  });

  const deactivated = await service.setAvailability({
    tenantId: 'tenant-1',
    courseId: course.id,
    isActive: false,
  });

  assert.equal(deactivated.outcome, 'UPDATED');
  assert.equal(deactivated.course.isActive, false);
  assert.equal(deactivated.course.id, course.id);
  assert.deepEqual(deactivated.course.createdAt, course.createdAt);

  assert.deepEqual(
    await repository.findById('tenant-1', course.id),
    deactivated.course,
  );

  const reactivated = await service.setAvailability({
    tenantId: 'tenant-1',
    courseId: course.id,
    isActive: true,
  });

  assert.equal(reactivated.outcome, 'UPDATED');
  assert.equal(reactivated.course.isActive, true);
  assert.equal(reactivated.course.id, course.id);
  assert.deepEqual(reactivated.course.createdAt, course.createdAt);

  assert.deepEqual(
    await repository.findById('tenant-1', course.id),
    reactivated.course,
  );
});

test('repeated availability requests preserve the record and timestamps', async () => {
  const { repository, service } = setup();

  const course = await service.create({
    tenantId: 'tenant-1',
    title: 'Security Awareness',
  });

  const deactivated = await service.setAvailability({
    tenantId: 'tenant-1',
    courseId: course.id,
    isActive: false,
  });

  const repeated = await service.setAvailability({
    tenantId: 'tenant-1',
    courseId: course.id,
    isActive: false,
  });

  assert.equal(repeated.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.course, deactivated.course);

  assert.deepEqual(
    await repository.findById('tenant-1', course.id),
    deactivated.course,
  );
});

test('another tenant cannot retrieve or change the course', async () => {
  const { repository, service } = setup();

  const course = await service.create({
    tenantId: 'tenant-1',
    title: 'Security Awareness',
  });

  assert.equal(await repository.findById('tenant-2', course.id), null);

  await assert.rejects(
    () =>
      service.setAvailability({
        tenantId: 'tenant-2',
        courseId: course.id,
        isActive: false,
      }),
    CourseNotFoundError,
  );

  assert.deepEqual(await repository.findById('tenant-1', course.id), course);
});
