import { randomUUID } from 'node:crypto';
import type { EmployeeRepository } from './employee.repository.js';
import type {
  Employee,
  ProvisionEmployeeCommand,
  ProvisionEmployeeResult,
} from './employee.types.js';
import { EmployeeIdentityConflictError } from './employee.errors.js';

export class EmployeeProvisioningService {
  constructor(private readonly repository: EmployeeRepository) {}

  private async provisionOnce(
    command: ProvisionEmployeeCommand,
  ): Promise<ProvisionEmployeeResult> {
    const existing = await this.repository.findByExternalIdentity(
      command.tenantId,
      command.sourceSystem,
      command.externalEmployeeId,
    );

    // Omitted: preserve existing reference.
    // Null: remove the manager.
    const managerExternalId =
      command.managerExternalId === undefined
        ? (existing?.managerExternalId ?? null)
        : command.managerExternalId;

    if (managerExternalId === command.externalEmployeeId) {
      throw new Error('An employee cannot be their own manager');
    }

    const manager =
      managerExternalId === null
        ? null
        : await this.repository.findByExternalIdentity(
            command.tenantId,
            command.sourceSystem,
            managerExternalId,
          );

    const managerId = manager?.id ?? null;

    if (!existing) {
      const now = new Date();

      const employee: Employee = {
        id: randomUUID(),
        tenantId: command.tenantId,
        sourceSystem: command.sourceSystem,
        externalEmployeeId: command.externalEmployeeId,
        workEmail: command.workEmail,
        employmentStatus: command.employmentStatus,
        managerExternalId,
        managerId,
        createdAt: now,
        updatedAt: now,
      };

      await this.repository.save(employee);

      return { outcome: 'CREATED', employee };
    }

    const unchanged =
      existing.workEmail === command.workEmail &&
      existing.employmentStatus === command.employmentStatus &&
      existing.managerExternalId === managerExternalId &&
      existing.managerId === managerId;

    if (unchanged) {
      return { outcome: 'UNCHANGED', employee: existing };
    }

    const employee: Employee = {
      ...existing,
      workEmail: command.workEmail,
      employmentStatus: command.employmentStatus,
      managerExternalId,
      managerId,
      updatedAt: new Date(),
    };

    await this.repository.save(employee);

    return { outcome: 'UPDATED', employee };
  }
  async execute(
    command: ProvisionEmployeeCommand,
  ): Promise<ProvisionEmployeeResult> {
    let result: ProvisionEmployeeResult;

    try {
      result = await this.provisionOnce(command);
    } catch (error: unknown) {
      if (!(error instanceof EmployeeIdentityConflictError)) {
        throw error;
      }

      result = await this.provisionOnce(command);
    }

    await this.repository.resolvePendingManagerLinks(result.employee);

    return result;
  }
}
