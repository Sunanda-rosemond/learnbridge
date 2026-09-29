export class CourseNotFoundError extends Error {
  constructor() {
    super('Course not found');
    this.name = 'CourseNotFoundError';
  }
}

export class InvalidCourseTitleError extends Error {
  constructor() {
    super('Course title must not be empty');
    this.name = 'InvalidCourseTitleError';
  }
}
