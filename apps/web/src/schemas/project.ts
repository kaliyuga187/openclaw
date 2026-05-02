import { z } from 'zod';

export const projectStatuses = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(projectStatuses).default('PLANNING'),
  client: z.string().trim().max(120).optional().nullable(),
  hourlyRate: z.coerce.number().int().nonnegative().max(100_000_00).optional().nullable(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
