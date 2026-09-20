import express from 'express';
import type { ErrorRequestHandler } from 'express';

import { employeesRouter } from './modules/employees/employees.routes.js';

export const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'learnbridge-api' });
});

app.use('/employees', employeesRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (
    error instanceof SyntaxError &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Request body must contain valid JSON',
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
  });
};

app.use(errorHandler);
