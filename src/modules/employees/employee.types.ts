export type EmploymentStatus = 'ACTIVE' | 'INACTIVE';

export type ProvisionEmployeeCommand = Readonly<{
  tenantId: string;
  sourceSystem: string;
  externalEmployeeId: string;
  workEmail: string;
  employmentStatus: EmploymentStatus;
  managerExternalId?: string | null;
}>;

export type Employee = {
  id: string;
  tenantId: string;
  sourceSystem: string;
  externalEmployeeId: string;
  workEmail: string;
  employmentStatus: EmploymentStatus;
  managerExternalId: string | null;
  managerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProvisionEmployeeResult = {
  outcome: 'CREATED' | 'UPDATED' | 'UNCHANGED';
  employee: Employee;
};
