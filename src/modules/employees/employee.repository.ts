import type { Employee } from './employee.types.js';

export interface EmployeeRepository {
  findByExternalIdentity(
    tenantId: string,
    sourceSystem: string,
    externalEmployeeId: string,
  ): Promise<Employee | null>;

  save(employee: Employee): Promise<void>;
  resolvePendingManagerLinks(manager: Employee): Promise<number>;
}
