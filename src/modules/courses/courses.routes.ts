import { Router } from 'express';

import type { CourseService } from './course.service.js';
import {
  createCourseHandler,
  setCourseAvailabilityHandler,
} from './courses.controller.js';

export function createCoursesRouter(service: CourseService) {
  const router = Router();

  const context = {
    tenantId: 'demo-employer',
  };

  router.post('/', createCourseHandler(service, context));

  router.patch(
    '/:courseId/availability',
    setCourseAvailabilityHandler(service, context),
  );

  return router;
}
