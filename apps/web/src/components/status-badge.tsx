import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'warning' | 'danger' | 'muted' | 'default';

const PROJECT: Record<string, { label: string; variant: Variant }> = {
  PLANNING: { label: 'Planning', variant: 'muted' },
  ACTIVE: { label: 'Active', variant: 'success' },
  ON_HOLD: { label: 'On hold', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  ARCHIVED: { label: 'Archived', variant: 'muted' },
};
const TASK: Record<string, { label: string; variant: Variant }> = {
  TODO: { label: 'To do', variant: 'muted' },
  IN_PROGRESS: { label: 'In progress', variant: 'default' },
  BLOCKED: { label: 'Blocked', variant: 'danger' },
  DONE: { label: 'Done', variant: 'success' },
};
const PRIORITY: Record<string, { label: string; variant: Variant }> = {
  LOW: { label: 'Low', variant: 'muted' },
  MEDIUM: { label: 'Medium', variant: 'default' },
  HIGH: { label: 'High', variant: 'warning' },
  URGENT: { label: 'Urgent', variant: 'danger' },
};
const INVOICE: Record<string, { label: string; variant: Variant }> = {
  DRAFT: { label: 'Draft', variant: 'muted' },
  SENT: { label: 'Sent', variant: 'default' },
  PAID: { label: 'Paid', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  VOID: { label: 'Void', variant: 'muted' },
};

export function StatusBadge({
  kind,
  value,
  className,
}: {
  kind: 'project' | 'task' | 'invoice' | 'priority';
  value: string;
  className?: string;
}) {
  const map = kind === 'project' ? PROJECT : kind === 'task' ? TASK : kind === 'priority' ? PRIORITY : INVOICE;
  const cfg = map[value] ?? { label: value, variant: 'muted' as Variant };
  return <Badge variant={cfg.variant} className={cn(className)}>{cfg.label}</Badge>;
}
