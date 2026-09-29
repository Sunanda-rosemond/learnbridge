export type AssignmentErrorCode =
  | 'INVALID_TRAINING_CYCLE'
  | 'EMPLOYEE_NOT_FOUND'
  | 'COURSE_NOT_FOUND'
  | 'EMPLOYEE_INACTIVE'
  | 'COURSE_INACTIVE';

export class AssignmentError extends Error {
  constructor(
    public readonly code: AssignmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssignmentError';
  }
}
