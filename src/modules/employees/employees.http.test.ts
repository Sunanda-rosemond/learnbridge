import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';

import { createApp } from '../../app.js';

const employeeBody = {
  externalEmployeeId: 'EMP-204',
  workEmail: 'employee@example.com',
  employmentStatus: 'ACTIVE',
};

test('HTTP: creates an employee and handles an identical retry', async () => {
  const app = createApp();

  const created = await request(app)
    .post('/employees/provision')
    .send(employeeBody)
    .expect(201);

  assert.equal(created.body.outcome, 'CREATED');
  assert.ok(created.body.employee.id);
  assert.equal(created.body.employee.tenantId, 'demo-employer');
  assert.equal(created.body.employee.sourceSystem, 'demo-hr');

  const repeated = await request(app)
    .post('/employees/provision')
    .send(employeeBody)
    .expect(200);

  assert.equal(repeated.body.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.body.employee, created.body.employee);
});

test('HTTP: invalid input returns 400 without modifying the employee', async () => {
  const app = createApp();

  const created = await request(app)
    .post('/employees/provision')
    .send(employeeBody)
    .expect(201);

  const rejected = await request(app)
    .post('/employees/provision')
    .send({
      ...employeeBody,
      workEmail: 'not-an-email',
      employmentStatus: 'INACTIVE',
    })
    .expect(400);

  assert.equal(rejected.body.error, 'VALIDATION_ERROR');
  assert.ok(
    rejected.body.issues.some(
      (issue: { path: string[] }) => issue.path[0] === 'workEmail',
    ),
  );

  const repeated = await request(app)
    .post('/employees/provision')
    .send(employeeBody)
    .expect(200);

  assert.equal(repeated.body.outcome, 'UNCHANGED');
  assert.deepEqual(repeated.body.employee, created.body.employee);
});

test('HTTP: malformed JSON returns a client error', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/employees/provision')
    .set('Content-Type', 'application/json')
    .send('{"externalEmployeeId":')
    .expect(400);

  assert.deepEqual(response.body, {
    error: 'INVALID_JSON',
    message: 'Request body must contain valid JSON',
  });
});
