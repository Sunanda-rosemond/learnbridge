import { Router } from 'express';

import { createProvisionEmployeeHandler } from './employees.controller.js';
import type { EmployeeProvisioningService } from './employee-provisioning.service.js';

export function createEmployeesRouter(service: EmployeeProvisioningService) {
  const router = Router();

  router.post(
    '/provision',
    createProvisionEmployeeHandler(service, {
      tenantId: 'demo-employer',
      sourceSystem: 'demo-hr',
    }),
  );

  return router;
}
