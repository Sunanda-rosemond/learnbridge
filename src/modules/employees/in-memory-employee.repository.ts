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
  async resolvePendingManagerLinks(manager: Employee): Promise<number> {
    let resolved = 0;
    const now = new Date();

    for (const employee of this.employees.values()) {
      const matches =
        employee.tenantId === manager.tenantId &&
        employee.sourceSystem === manager.sourceSystem &&
        employee.managerExternalId === manager.externalEmployeeId &&
        employee.managerId === null &&
        employee.id !== manager.id;

      if (!matches) continue;

      this.employees.set(employee.id, {
        ...employee,
        managerId: manager.id,
        updatedAt: now,
      });

      resolved += 1;
    }

    return resolved;
  }
}
