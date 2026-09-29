import type { Pool } from 'pg';

import type { Course } from './course.types.js';
import type { CourseRepository } from './course.repository.js';

type CourseRow = {
  id: string;
  tenant_id: string;
  title: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresCourseRepository implements CourseRepository {
  constructor(private readonly pool: Pool) {}

  async findById(tenantId: string, courseId: string): Promise<Course | null> {
    const result = await this.pool.query<CourseRow>(
      `
        SELECT id, tenant_id, title, is_active, created_at, updated_at
        FROM courses
        WHERE tenant_id = $1
          AND id = $2
      `,
      [tenantId, courseId],
    );

    const row = result.rows[0];

    return row ? toCourse(row) : null;
  }

  async save(course: Course): Promise<void> {
    const result = await this.pool.query(
      `
        INSERT INTO courses (
          id,
          tenant_id,
          title,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          is_active = EXCLUDED.is_active,
          updated_at = EXCLUDED.updated_at
        WHERE courses.tenant_id = EXCLUDED.tenant_id
        RETURNING id
      `,
      [
        course.id,
        course.tenantId,
        course.title,
        course.isActive,
        course.createdAt,
        course.updatedAt,
      ],
    );

    if (result.rowCount === 0) {
      throw new Error('Cannot change the tenant of an existing course');
    }
  }
}
