import type { RequestHandler } from 'express';

import { AssignmentError } from './assignment.errors.js';
import type { AssignmentErrorCode } from './assignment.errors.js';
import { assignCourseSchema } from './assignment.schemas.js';
import type { AssignmentService } from './assignment.service.js';

const errorStatus: Record<AssignmentErrorCode, number> = {
  INVALID_TRAINING_CYCLE: 400,
  EMPLOYEE_NOT_FOUND: 404,
  COURSE_NOT_FOUND: 404,
  EMPLOYEE_INACTIVE: 409,
  COURSE_INACTIVE: 409,
};

export function createAssignmentHandler(
  service: AssignmentService,
  context: { tenantId: string },
): RequestHandler {
  return async (req, res, next) => {
    const parsed = assignCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
      return;
    }

    try {
      const result = await service.assign({
        ...parsed.data,
        tenantId: context.tenantId,
      });

      res.status(result.outcome === 'CREATED' ? 201 : 200).json(result);
    } catch (error: unknown) {
      if (error instanceof AssignmentError) {
        res.status(errorStatus[error.code]).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      next(error);
    }
  };
}
