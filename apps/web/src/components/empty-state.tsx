import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
