import type { Employee } from './employee.types.js';
import type { EmployeeRepository } from './employee.repository.js';

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly employees = new Map<string, Employee>();

  async findByExternalIdentity(
    tenantId: string,
    sourceSystem: string,
    externalEmployeeId: string,
  ): Promise<Employee | null> {
    for (const employee of this.employees.values()) {
      if (
        employee.tenantId === tenantId &&
        employee.sourceSystem === sourceSystem &&
        employee.externalEmployeeId === externalEmployeeId
      ) {
        return structuredClone(employee);
      }
    }

    return null;
  }

  async save(employee: Employee): Promise<void> {
    this.employees.set(employee.id, structuredClone(employee));
  }
}
