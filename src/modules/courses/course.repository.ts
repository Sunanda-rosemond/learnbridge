import type { Course } from './course.types.js';

export interface CourseRepository {
  findById(tenantId: string, courseId: string): Promise<Course | null>;

  save(course: Course): Promise<void>;
}
