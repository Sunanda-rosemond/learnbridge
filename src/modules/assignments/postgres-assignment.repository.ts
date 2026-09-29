import type { Pool, PoolClient } from 'pg';

import type { AssignmentRepository } from './assignment.repository.js';
import type {
  AssignCourseCommand,
  AssignCourseResult,
  LearningAssignment,
} from './assignment.types.js';

import { AssignmentError } from './assignment.errors.js';

const assignmentColumns = `
  id,
  tenant_id AS "tenantId",
  employee_id AS "employeeId",
  course_id AS "courseId",
  training_cycle AS "trainingCycle",
  status,
  assigned_at AS "assignedAt",
  completed_at AS "completedAt",
  updated_at AS "updatedAt"
`;

export class PostgresAssignmentRepository implements AssignmentRepository {
  constructor(private readonly pool: Pool) {}

  async findExisting(
    identity: AssignCourseCommand,
  ): Promise<LearningAssignment | null> {
    return this.findUsing(this.pool, identity);
  }

  private async findUsing(
    connection: Pool | PoolClient,
    identity: AssignCourseCommand,
  ): Promise<LearningAssignment | null> {
    const result = await connection.query<LearningAssignment>(
      `
        SELECT ${assignmentColumns}
        FROM learning_assignments
        WHERE tenant_id = $1
          AND employee_id = $2
          AND course_id = $3
          AND training_cycle = $4
      `,
      [
        identity.tenantId,
        identity.employeeId,
        identity.courseId,
        identity.trainingCycle,
      ],
    );

    return result.rows[0] ?? null;
  }

  async createIfAbsent(
    assignment: LearningAssignment,
  ): Promise<AssignCourseResult> {
    const client = await this.pool.connect();
    let discardConnection = false;

    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');

      // Always lock employee first, then course.
      const employeeResult = await client.query<{
        employment_status: string;
      }>(
        `
          SELECT employment_status
          FROM employees
          WHERE tenant_id = $1 AND id = $2
          FOR SHARE
        `,
        [assignment.tenantId, assignment.employeeId],
      );

      const employee = employeeResult.rows[0];

      if (!employee) {
        throw new AssignmentError('EMPLOYEE_NOT_FOUND', 'Employee not found');
      }

      const courseResult = await client.query<{
        is_active: boolean;
      }>(
        `
          SELECT is_active
          FROM courses
          WHERE tenant_id = $1 AND id = $2
          FOR SHARE
        `,
        [assignment.tenantId, assignment.courseId],
      );

      const course = courseResult.rows[0];

      if (!course) {
        throw new AssignmentError('COURSE_NOT_FOUND', 'Course not found');
      }

      const existing = await this.findUsing(client, assignment);

      if (existing) {
        await client.query('COMMIT');

        return {
          outcome: 'UNCHANGED',
          assignment: existing,
        };
      }

      if (employee.employment_status !== 'ACTIVE') {
        throw new AssignmentError(
          'EMPLOYEE_INACTIVE',
          'Cannot assign learning to an inactive employee',
        );
      }

      if (!course.is_active) {
        throw new AssignmentError(
          'COURSE_INACTIVE',
          'Cannot assign an inactive course',
        );
      }

      const inserted = await client.query<LearningAssignment>(
        `
          INSERT INTO learning_assignments (
            id,
            tenant_id,
            employee_id,
            course_id,
            training_cycle,
            status,
            assigned_at,
            completed_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT ON CONSTRAINT assignments_identity_unique
          DO NOTHING
          RETURNING ${assignmentColumns}
        `,
        [
          assignment.id,
          assignment.tenantId,
          assignment.employeeId,
          assignment.courseId,
          assignment.trainingCycle,
          assignment.status,
          assignment.assignedAt,
          assignment.completedAt,
          assignment.updatedAt,
        ],
      );

      const created = inserted.rows[0];

      if (created) {
        await client.query('COMMIT');

        return {
          outcome: 'CREATED',
          assignment: created,
        };
      }

      // Another request inserted the same assignment.
      const winner = await this.findUsing(client, assignment);

      if (!winner) {
        throw new Error('Conflicting assignment could not be retrieved');
      }

      await client.query('COMMIT');

      return {
        outcome: 'UNCHANGED',
        assignment: winner,
      };
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discardConnection = true;
      }

      throw error;
    } finally {
      client.release(discardConnection);
    }
  }
}
