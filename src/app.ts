import express from 'express';
import type { ErrorRequestHandler } from 'express';

import { createEmployeesRouter } from './modules/employees/employees.routes.js';
import { EmployeeProvisioningService } from './modules/employees/employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from './modules/employees/in-memory-employee.repository.js';
import type { EmployeeRepository } from './modules/employees/employee.repository.js';

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

export function createApp(
  repository: EmployeeRepository = new InMemoryEmployeeRepository(),
) {
  const app = express();

  const service = new EmployeeProvisioningService(repository);

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'learnbridge-api' });
  });

  app.use('/employees', createEmployeesRouter(service));

  app.use(errorHandler);

  return app;
}
