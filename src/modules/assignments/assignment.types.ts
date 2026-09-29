export type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

export type LearningAssignment = {
  id: string;
  tenantId: string;
  employeeId: string;
  courseId: string;
  trainingCycle: string;
  status: AssignmentStatus;
  assignedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

export type AssignCourseCommand = Readonly<{
  tenantId: string;
  employeeId: string;
  courseId: string;
  trainingCycle: string;
}>;

export type AssignCourseResult = {
  outcome: 'CREATED' | 'UNCHANGED';
  assignment: LearningAssignment;
};
