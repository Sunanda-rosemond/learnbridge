import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';

import { createApp } from '../../app.js';

test('HTTP courses: creates, deactivates, reactivates and handles a repeat', async () => {
  const app = createApp();

  const created = await request(app)
    .post('/courses')
    .send({ title: '  Security Awareness  ' })
    .expect(201);

  const course = created.body.course;

  assert.ok(course.id);
  assert.equal(course.tenantId, 'demo-employer');
  assert.equal(course.title, 'Security Awareness');
  assert.equal(course.isActive, true);

  const endpoint = `/courses/${course.id}/availability`;

  const deactivated = await request(app)
    .patch(endpoint)
    .send({ isActive: false })
    .expect(200);

  assert.equal(deactivated.body.outcome, 'UPDATED');
  assert.equal(deactivated.body.course.isActive, false);
  assert.equal(deactivated.body.course.id, course.id);
  assert.equal(deactivated.body.course.createdAt, course.createdAt);

  const reactivated = await request(app)
    .patch(endpoint)
    .send({ isActive: true })
    .expect(200);

  assert.equal(reactivated.body.outcome, 'UPDATED');
  assert.equal(reactivated.body.course.isActive, true);

  const repeated = await request(app)
    .patch(endpoint)
    .send({ isActive: true })
    .expect(200);

  assert.equal(repeated.body.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.body.course, reactivated.body.course);
});

test('HTTP courses: rejects a blank title', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/courses')
    .send({ title: '   ' })
    .expect(400);

  assert.equal(response.body.error, 'VALIDATION_ERROR');
});

test('HTTP courses: rejects a string boolean without changing availability', async () => {
  const app = createApp();

  const created = await request(app)
    .post('/courses')
    .send({ title: 'Security Awareness' })
    .expect(201);

  const endpoint = `/courses/${created.body.course.id}/availability`;

  const rejected = await request(app)
    .patch(endpoint)
    .send({ isActive: 'false' })
    .expect(400);

  assert.equal(rejected.body.error, 'VALIDATION_ERROR');

  const unchanged = await request(app)
    .patch(endpoint)
    .send({ isActive: true })
    .expect(200);

  assert.equal(unchanged.body.outcome, 'UNCHANGED');
  assert.deepEqual(unchanged.body.course, created.body.course);
});

test('HTTP courses: rejects a malformed course ID', async () => {
  const app = createApp();

  const response = await request(app)
    .patch('/courses/not-a-uuid/availability')
    .send({ isActive: false })
    .expect(400);

  assert.equal(response.body.error, 'VALIDATION_ERROR');
});

test('HTTP courses: returns 404 for a valid but missing course ID', async () => {
  const app = createApp();

  const response = await request(app)
    .patch(`/courses/${randomUUID()}/availability`)
    .send({ isActive: false })
    .expect(404);

  assert.equal(response.body.error, 'COURSE_NOT_FOUND');
});
