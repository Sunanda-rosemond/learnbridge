import express from 'express';
import type { ErrorRequestHandler } from 'express';

import { createEmployeesRouter } from './modules/employees/employees.routes.js';
import { EmployeeProvisioningService } from './modules/employees/employee-provisioning.service.js';
import { InMemoryEmployeeRepository } from './modules/employees/in-memory-employee.repository.js';
import type { EmployeeRepository } from './modules/employees/employee.repository.js';
import { CourseService } from './modules/courses/course.service.js';
import { InMemoryCourseRepository } from './modules/courses/in-memory-course.repository.js';
import { createCoursesRouter } from './modules/courses/courses.routes.js';
import type { CourseRepository } from './modules/courses/course.repository.js';
import { AssignmentService } from './modules/assignments/assignment.service.js';
import { InMemoryAssignmentRepository } from './modules/assignments/in-memory-assignment.repository.js';
import { createAssignmentsRouter } from './modules/assignments/assignments.routes.js';
import type { AssignmentRepository } from './modules/assignments/assignment.repository.js';

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    res.status(413).json({
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the 1 MiB limit',
    });
    return;
  }
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
  courseRepository: CourseRepository = new InMemoryCourseRepository(),
  assignmentRepository: AssignmentRepository = new InMemoryAssignmentRepository(),
) {
  const app = express();

  const service = new EmployeeProvisioningService(repository);
  const courseService = new CourseService(courseRepository);

  const assignmentService = new AssignmentService(
    assignmentRepository,
    repository,
    courseRepository,
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'learnbridge-api' });
  });

  app.use('/employees', createEmployeesRouter(service));
  app.use('/courses', createCoursesRouter(courseService));
  app.use('/assignments', createAssignmentsRouter(assignmentService));
  app.use(errorHandler);

  return app;
}
