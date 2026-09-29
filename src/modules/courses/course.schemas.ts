import { z } from 'zod';

export const createCourseSchema = z
  .object({
    title: z.string().trim().min(1),
  })
  .strict();

export const courseParamsSchema = z.object({
  courseId: z.string().uuid(),
});

export const setCourseAvailabilitySchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();
