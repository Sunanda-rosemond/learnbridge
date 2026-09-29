import type {
  AssignCourseCommand,
  AssignCourseResult,
  LearningAssignment,
} from './assignment.types.js';

export interface AssignmentRepository {
  findExisting(
    identity: AssignCourseCommand,
  ): Promise<LearningAssignment | null>;

  createIfAbsent(assignment: LearningAssignment): Promise<AssignCourseResult>;
}
