export class EmployeeIdentityConflictError extends Error {
  constructor() {
    super('An employee with this external identity already exists');
    this.name = 'EmployeeIdentityConflictError';
  }
}
