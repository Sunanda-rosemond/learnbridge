import { randomUUID } from 'node:crypto';

import type { CourseRepository } from './course.repository.js';
import type {
  Course,
  CreateCourseCommand,
  SetCourseAvailabilityCommand,
  SetCourseAvailabilityResult,
} from './course.types.js';

import {
  CourseNotFoundError,
  InvalidCourseTitleError,
} from './course.errors.js';

export class CourseService {
  constructor(private readonly repository: CourseRepository) {}

  async create(command: CreateCourseCommand): Promise<Course> {
    const title = command.title.trim();

    if (title.length === 0) {
      throw new InvalidCourseTitleError();
    }

    const now = new Date();

    const course: Course = {
      id: randomUUID(),
      tenantId: command.tenantId,
      title,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.save(course);

    return course;
  }

  async setAvailability(
    command: SetCourseAvailabilityCommand,
  ): Promise<SetCourseAvailabilityResult> {
    const existing = await this.repository.findById(
      command.tenantId,
      command.courseId,
    );

    if (!existing) {
      throw new CourseNotFoundError();
    }

    if (existing.isActive === command.isActive) {
      return {
        outcome: 'UNCHANGED',
        course: existing,
      };
    }

    const course: Course = {
      ...existing,
      isActive: command.isActive,
      updatedAt: new Date(),
    };

    await this.repository.save(course);

    return {
      outcome: 'UPDATED',
      course,
    };
  }
}
