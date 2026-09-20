import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';

import { createApp } from '../../app.js';

test('HTTP import: reports mixed results and handles a repeat upload', async () => {
  const app = createApp();

  const csv = [
    'externalEmployeeId,workEmail,employmentStatus,managerExternalId',
    'EMP-100,manager@example.com,ACTIVE,',
    'EMP-204,rose@example.com,ACTIVE,EMP-100',
    'EMP-204,rose@example.com,ACTIVE,EMP-100',
    'EMP-300,other@example.com,ACTIVE,',
    'EMP-300,other@example.com,INACTIVE,',
    'EMP-400,not-an-email,ACTIVE,',
  ].join('\n');

  const first = await request(app)
    .post('/employees/import')
    .set('Content-Type', 'text/csv')
    .send(csv)
    .expect(200);

  assert.equal(first.body.totalRows, 6);
  assert.equal(first.body.created, 2);
  assert.equal(first.body.updated, 0);
  assert.equal(first.body.unchanged, 0);
  assert.equal(first.body.duplicates, 1);
  assert.equal(first.body.rejected, 3);

  const repeated = await request(app)
    .post('/employees/import')
    .set('Content-Type', 'text/csv')
    .send(csv)
    .expect(200);

  assert.equal(repeated.body.totalRows, 6);
  assert.equal(repeated.body.created, 0);
  assert.equal(repeated.body.updated, 0);
  assert.equal(repeated.body.unchanged, 2);
  assert.equal(repeated.body.duplicates, 1);
  assert.equal(repeated.body.rejected, 3);

  assert.deepEqual(
    repeated.body.rows.map((row: { row: number; status: string }) => ({
      row: row.row,
      status: row.status,
    })),
    [
      { row: 2, status: 'UNCHANGED' },
      { row: 3, status: 'UNCHANGED' },
      { row: 4, status: 'DUPLICATE' },
      { row: 5, status: 'REJECTED' },
      { row: 6, status: 'REJECTED' },
      { row: 7, status: 'REJECTED' },
    ],
  );
});

test('HTTP import: rejects malformed CSV with 400', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/employees/import')
    .set('Content-Type', 'text/csv')
    .send(
      'externalEmployeeId,workEmail,employmentStatus\n' + 'EMP-204,"unfinished',
    )
    .expect(400);

  assert.equal(response.body.error, 'INVALID_CSV');
});

test('HTTP import: rejects unsupported content types with 415', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/employees/import')
    .send({ employee: 'EMP-204' })
    .expect(415);

  assert.equal(response.body.error, 'UNSUPPORTED_MEDIA_TYPE');
});

test('HTTP import: rejects oversized bodies with 413', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/employees/import')
    .set('Content-Type', 'text/csv')
    .send('a'.repeat(1024 * 1024 + 1))
    .expect(413);

  assert.equal(response.body.error, 'PAYLOAD_TOO_LARGE');
});
