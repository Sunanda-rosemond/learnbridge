import { Router, text } from 'express';

import { createProvisionEmployeeHandler } from './employees.controller.js';
import { createEmployeeImportHandler } from './employee-import.controller.js';
import { EmployeeImportService } from './employee-import.service.js';

import type { EmployeeProvisioningService } from './employee-provisioning.service.js';

export function createEmployeesRouter(service: EmployeeProvisioningService) {
  const router = Router();

  const context = {
    tenantId: 'demo-employer',
    sourceSystem: 'demo-hr',
  };

  const importer = new EmployeeImportService(service);

  router.post('/provision', createProvisionEmployeeHandler(service, context));

  router.post(
    '/import',
    text({ type: 'text/csv', limit: '1mb' }),
    createEmployeeImportHandler(importer, context),
  );

  return router;
}
