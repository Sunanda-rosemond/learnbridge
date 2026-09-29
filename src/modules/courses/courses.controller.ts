import type { RequestHandler } from 'express';

import type { CourseService } from './course.service.js';
import {
  CourseNotFoundError,
  InvalidCourseTitleError,
} from './course.errors.js';
import {
  createCourseSchema,
  courseParamsSchema,
  setCourseAvailabilitySchema,
} from './course.schemas.js';

type CourseContext = {
  tenantId: string;
};

export function createCourseHandler(
  service: CourseService,
  context: CourseContext,
): RequestHandler {
  return async (req, res, next) => {
    const parsed = createCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.issues,
      });
      return;
    }

    try {
      const course = await service.create({
        title: parsed.data.title,
        tenantId: context.tenantId,
      });

      res.status(201).json({ course });
    } catch (error: unknown) {
      if (error instanceof InvalidCourseTitleError) {
        res.status(400).json({
          error: 'INVALID_COURSE_TITLE',
          message: error.message,
        });
        return;
      }

      next(error);
    }
  };
}

export function setCourseAvailabilityHandler(
  service: CourseService,
  context: CourseContext,
): RequestHandler {
  return async (req, res, next) => {
    const params = courseParamsSchema.safeParse(req.params);
    const body = setCourseAvailabilitySchema.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        issues: [
          ...(params.success ? [] : params.error.issues),
          ...(body.success ? [] : body.error.issues),
        ],
      });
      return;
    }

    try {
      const result = await service.setAvailability({
        tenantId: context.tenantId,
        courseId: params.data.courseId,
        isActive: body.data.isActive,
      });

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof CourseNotFoundError) {
        res.status(404).json({
          error: 'COURSE_NOT_FOUND',
          message: error.message,
        });
        return;
      }

      next(error);
    }
  };
}
