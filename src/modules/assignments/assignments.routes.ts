import { Router } from 'express';

import { createAssignmentHandler } from './assignments.controller.js';
import type { AssignmentService } from './assignment.service.js';

export function createAssignmentsRouter(service: AssignmentService) {
  const router = Router();

  router.post(
    '/',
    createAssignmentHandler(service, {
      tenantId: 'demo-employer',
    }),
  );

  return router;
}
