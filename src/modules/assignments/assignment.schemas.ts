import { z } from 'zod';

export const assignCourseSchema = z
  .object({
    employeeId: z.string().uuid(),
    courseId: z.string().uuid(),
    trainingCycle: z.string().trim().min(1),
  })
  .strict();
