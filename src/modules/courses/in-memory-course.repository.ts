import type { Course } from './course.types.js';
import type { CourseRepository } from './course.repository.js';

export class InMemoryCourseRepository implements CourseRepository {
  private readonly courses = new Map<string, Course>();

  async findById(tenantId: string, courseId: string): Promise<Course | null> {
    const course = this.courses.get(courseId);

    if (!course || course.tenantId !== tenantId) {
      return null;
    }

    return structuredClone(course);
  }

  async save(course: Course): Promise<void> {
    const existing = this.courses.get(course.id);

    if (existing && existing.tenantId !== course.tenantId) {
      throw new Error('Cannot change the tenant of an existing course');
    }

    this.courses.set(course.id, structuredClone(course));
  }
}
