import type { AssignmentRepository } from './assignment.repository.js';
import type {
  AssignCourseCommand,
  AssignCourseResult,
  LearningAssignment,
} from './assignment.types.js';

function identityKey(identity: AssignCourseCommand): string {
  return JSON.stringify([
    identity.tenantId,
    identity.employeeId,
    identity.courseId,
    identity.trainingCycle,
  ]);
}

export class InMemoryAssignmentRepository implements AssignmentRepository {
  private readonly assignments = new Map<string, LearningAssignment>();

  async findExisting(
    identity: AssignCourseCommand,
  ): Promise<LearningAssignment | null> {
    const assignment = this.assignments.get(identityKey(identity));

    return assignment ? structuredClone(assignment) : null;
  }

  async createIfAbsent(
    assignment: LearningAssignment,
  ): Promise<AssignCourseResult> {
    const key = identityKey(assignment);
    const existing = this.assignments.get(key);

    if (existing) {
      return {
        outcome: 'UNCHANGED',
        assignment: structuredClone(existing),
      };
    }

    this.assignments.set(key, structuredClone(assignment));

    return {
      outcome: 'CREATED',
      assignment: structuredClone(assignment),
    };
  }
}
