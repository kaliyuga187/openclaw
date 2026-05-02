import { z } from 'zod';

export const invoiceStatuses = ['DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE'] as const;

const cuid = z.string().min(1).max(64);

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().positive().max(10_000),
  unitCents: z.coerce.number().int().nonnegative().max(100_000_00),
});

export const createInvoiceSchema = z.object({
  client: z.string().trim().min(1).max(120),
  email: z.string().email().max(254),
  projectId: cuid.optional().nullable(),
  currency: z.string().length(3).toLowerCase().default('usd'),
  notes: z.string().trim().max(2000).optional().nullable(),
  dueDate: z
    .union([z.string().datetime({ offset: true }), z.string().length(0), z.null()])
    .optional()
    .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required').max(100),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  status: z.enum(invoiceStatuses).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

export function computeTotalCents(items: InvoiceItemInput[]): number {
  return items.reduce((sum, it) => sum + it.quantity * it.unitCents, 0);
}
