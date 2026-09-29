import { randomUUID } from 'node:crypto';

import type { EmployeeRepository } from '../employees/employee.repository.js';
import type { CourseRepository } from '../courses/course.repository.js';
import type { AssignmentRepository } from './assignment.repository.js';

import type {
  AssignCourseCommand,
  AssignCourseResult,
  LearningAssignment,
} from './assignment.types.js';

import { AssignmentError } from './assignment.errors.js';

export class AssignmentService {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly employees: EmployeeRepository,
    private readonly courses: CourseRepository,
  ) {}

  async assign(command: AssignCourseCommand): Promise<AssignCourseResult> {
    const trainingCycle = command.trainingCycle.trim();

    if (trainingCycle.length === 0) {
      throw new AssignmentError(
        'INVALID_TRAINING_CYCLE',
        'Training cycle must not be empty',
      );
    }

    const identity: AssignCourseCommand = {
      ...command,
      trainingCycle,
    };

    const employee = await this.employees.findById(
      identity.tenantId,
      identity.employeeId,
    );

    if (!employee) {
      throw new AssignmentError('EMPLOYEE_NOT_FOUND', 'Employee not found');
    }

    const course = await this.courses.findById(
      identity.tenantId,
      identity.courseId,
    );

    if (!course) {
      throw new AssignmentError('COURSE_NOT_FOUND', 'Course not found');
    }

    const existing = await this.assignments.findExisting(identity);

    if (existing) {
      return {
        outcome: 'UNCHANGED',
        assignment: existing,
      };
    }

    if (employee.employmentStatus !== 'ACTIVE') {
      throw new AssignmentError(
        'EMPLOYEE_INACTIVE',
        'Cannot assign learning to an inactive employee',
      );
    }

    if (!course.isActive) {
      throw new AssignmentError(
        'COURSE_INACTIVE',
        'Cannot assign an inactive course',
      );
    }

    const now = new Date();

    const assignment: LearningAssignment = {
      id: randomUUID(),
      ...identity,
      status: 'ASSIGNED',
      assignedAt: now,
      completedAt: null,
      updatedAt: now,
    };

    return this.assignments.createIfAbsent(assignment);
  }
}
