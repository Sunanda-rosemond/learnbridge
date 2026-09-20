import type { RequestHandler } from 'express';

import type { EmployeeProvisioningService } from './employee-provisioning.service.js';
import { provisionEmployeeSchema } from './provision-employee.schema.js';

type ProvisioningContext = {
  tenantId: string;
  sourceSystem: string;
};

export function createProvisionEmployeeHandler(
  service: EmployeeProvisioningService,
  context: ProvisioningContext,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = provisionEmployeeSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          issues: parsed.error.issues,
        });
        return;
      }

      const result = await service.execute({
        ...parsed.data,
        tenantId: context.tenantId,
        sourceSystem: context.sourceSystem,
      });

      const status = result.outcome === 'CREATED' ? 201 : 200;

      res.status(status).json(result);
    } catch (error) {
      next(error);
    }
  };
}
