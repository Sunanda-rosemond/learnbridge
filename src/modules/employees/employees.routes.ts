import { Router } from 'express';

import { createProvisionEmployeeHandler } from './employees.controller.js';
import { EmployeeProvisioningService } from './employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from './in-memory-employee.repository.js';

const repository = new InMemoryEmployeeRepository();
const service = new EmployeeProvisioningService(repository);

export const employeesRouter = Router();

employeesRouter.post(
  '/provision',
  createProvisionEmployeeHandler(service, {
    tenantId: 'demo-employer',
    sourceSystem: 'demo-hr',
  }),
);
