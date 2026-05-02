import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface Item {
  id: string;
  message: string;
  kind: string;
  entity: string;
  createdAt: Date | string;
}

const KIND_COLOR: Record<string, string> = {
  create: 'bg-primary',
  paid: 'bg-success',
  update: 'bg-warning',
  delete: 'bg-danger',
};

export function ActivityFeed({ items }: { items: Item[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet. Create your first project to get started.</p>
        ) : (
          <ol className="space-y-4">
            {items.map((it) => (
              <li key={it.id} className="flex items-start gap-3">
                <span
                  className={`mt-1 inline-block h-2 w-2 rounded-full ${
                    KIND_COLOR[it.kind] ?? 'bg-muted-foreground'
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm">{it.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(it.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
