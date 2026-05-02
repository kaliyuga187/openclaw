import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';

type Tone = 'green' | 'amber' | 'red' | 'grey';

const DOT: Record<Tone, string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-danger',
  grey: 'bg-muted-foreground',
};

const LABEL: Record<Tone, string> = {
  green: 'Operational',
  amber: 'Needs setup',
  red: 'Broken',
  grey: 'Not configured',
};

export interface StatusItem {
  name: string;
  tone: Tone;
  detail?: string;
}

export function SystemStatusCard({ items, title = 'System status' }: { items: StatusItem[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((it) => (
          <div key={it.name} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex items-center gap-3">
              <span className={cn('inline-block h-2.5 w-2.5 rounded-full', DOT[it.tone])} />
              <div>
                <p className="text-sm font-medium">{it.name}</p>
                {it.detail ? <p className="text-xs text-muted-foreground">{it.detail}</p> : null}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{LABEL[it.tone]}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
