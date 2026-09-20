import type { Pool } from 'pg';

import type { EmployeeRepository } from './employee.repository.js';
import type { Employee, EmploymentStatus } from './employee.types.js';
import { EmployeeIdentityConflictError } from './employee.errors.js';

type EmployeeRow = {
  id: string;
  tenant_id: string;
  source_system: string;
  external_employee_id: string;
  work_email: string;
  employment_status: EmploymentStatus;
  manager_external_id: string | null;
  manager_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceSystem: row.source_system,
    externalEmployeeId: row.external_employee_id,
    workEmail: row.work_email,
    employmentStatus: row.employment_status,
    managerExternalId: row.manager_external_id,
    managerId: row.manager_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresEmployeeRepository implements EmployeeRepository {
  constructor(private readonly pool: Pool) {}

  async findByExternalIdentity(
    tenantId: string,
    sourceSystem: string,
    externalEmployeeId: string,
  ): Promise<Employee | null> {
    const result = await this.pool.query<EmployeeRow>(
      `
        SELECT *
        FROM employees
        WHERE tenant_id = $1
          AND source_system = $2
          AND external_employee_id = $3
      `,
      [tenantId, sourceSystem, externalEmployeeId],
    );

    const row = result.rows[0];

    return row ? toEmployee(row) : null;
  }

  async save(employee: Employee): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO employees (
          id,
          tenant_id,
          source_system,
          external_employee_id,
          work_email,
          employment_status,
          manager_external_id,
          manager_id,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          work_email = EXCLUDED.work_email,
          employment_status = EXCLUDED.employment_status,
          manager_external_id = EXCLUDED.manager_external_id,
          manager_id = EXCLUDED.manager_id,
          updated_at = EXCLUDED.updated_at
      `,
        [
          employee.id,
          employee.tenantId,
          employee.sourceSystem,
          employee.externalEmployeeId,
          employee.workEmail,
          employee.employmentStatus,
          employee.managerExternalId,
          employee.managerId,
          employee.createdAt,
          employee.updatedAt,
        ],
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'employees_external_identity_unique'
      ) {
        throw new EmployeeIdentityConflictError();
      }
      throw error;
    }
  }
}
