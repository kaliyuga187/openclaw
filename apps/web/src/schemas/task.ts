import { z } from 'zod';

export const taskStatuses = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const cuid = z.string().min(1).max(64);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(taskStatuses).default('TODO'),
  priority: z.enum(taskPriorities).default('MEDIUM'),
  dueDate: z
    .union([z.string().datetime({ offset: true }), z.string().length(0), z.null()])
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
  projectId: cuid,
  assigneeId: cuid.optional().nullable(),
});

export const updateTaskSchema = createTaskSchema.partial();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
