import { z } from 'zod';

export const provisionEmployeeSchema = z
  .object({
    externalEmployeeId: z.string().trim().min(1),
    workEmail: z.string().trim().email(),
    employmentStatus: z.enum(['ACTIVE', 'INACTIVE']),
    managerExternalId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((data) => data.managerExternalId !== data.externalEmployeeId, {
    message: 'An employee cannot be their own manager',
    path: ['managerExternalId'],
  });

export type ProvisionEmployeeBody = z.infer<typeof provisionEmployeeSchema>;
