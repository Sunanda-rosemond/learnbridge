export type Course = {
  id: string;
  tenantId: string;
  title: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateCourseCommand = Readonly<{
  tenantId: string;
  title: string;
}>;

export type SetCourseAvailabilityCommand = Readonly<{
  tenantId: string;
  courseId: string;
  isActive: boolean;
}>;

export type SetCourseAvailabilityResult = {
  outcome: 'UPDATED' | 'UNCHANGED';
  course: Course;
};
