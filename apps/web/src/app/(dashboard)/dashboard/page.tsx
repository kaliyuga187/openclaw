import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { FolderKanban, ListTodo, Receipt, AlertTriangle } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { features, env } from '@/lib/env';
import { StatCard } from '@/components/stat-card';
import { ActivityFeed } from '@/components/activity-feed';
import { SystemStatusCard, type StatusItem } from '@/components/system-status-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');
  const userId = session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  const ownerFilter = isAdmin ? {} : { ownerId: userId };

  const [projectCount, projectsByStatus, taskCount, openTasks, invoices, activity] = await Promise.all([
    prisma.project.count({ where: ownerFilter }),
    prisma.project.groupBy({ by: ['status'], where: ownerFilter, _count: true }),
    prisma.task.count({ where: { project: ownerFilter } }),
    prisma.task.count({
      where: { project: ownerFilter, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
    }),
    prisma.invoice.findMany({ where: ownerFilter, select: { status: true, amountCents: true, currency: true, dueDate: true } }),
    prisma.activityEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
  ]);

  const now = Date.now();
  let outstandingCents = 0;
  let paidCents = 0;
  let overdueCount = 0;
  let displayCurrency = 'usd';
  for (const inv of invoices) {
    displayCurrency = inv.currency;
    if (inv.status === 'PAID') paidCents += inv.amountCents;
    else if (inv.status !== 'VOID') outstandingCents += inv.amountCents;
    if (
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      inv.dueDate &&
      inv.dueDate.getTime() < now
    ) {
      overdueCount += 1;
    }
  }

  const buildSteps = [
    { name: 'Database connected', done: true },
    { name: 'Auth secret set', done: env.NEXTAUTH_SECRET.length >= 16 },
    { name: 'Public app URL set', done: Boolean(env.NEXT_PUBLIC_APP_URL) },
    { name: 'Stripe configured', done: features.stripe },
    { name: 'Stripe webhook configured', done: features.stripeWebhook },
    { name: 'Google OAuth configured', done: features.google },
  ];
  const completionPct = Math.round((buildSteps.filter((s) => s.done).length / buildSteps.length) * 100);

  const statusItems: StatusItem[] = [
    { name: 'Database', tone: 'green', detail: 'Postgres connection verified at request time' },
    {
      name: 'Authentication',
      tone: env.NEXTAUTH_SECRET.length >= 16 ? 'green' : 'red',
      detail: features.google ? 'Email + Google enabled' : 'Email/password only',
    },
    {
      name: 'Stripe payments',
      tone: features.stripe ? 'green' : 'amber',
      detail: features.stripe ? 'Live or test key configured' : 'Add STRIPE_SECRET_KEY to enable invoices',
    },
    {
      name: 'Stripe webhook',
      tone: features.stripeWebhook ? 'green' : 'grey',
      detail: features.stripeWebhook ? 'Signed webhook will mark invoices PAID' : 'Optional, but required for auto-marking',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{session.user.name ? `, ${session.user.name}` : ''} — here’s where things stand.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={projectCount} hint={`${projectsByStatus.find((s) => s.status === 'ACTIVE')?._count ?? 0} active`} icon={FolderKanban} />
        <StatCard label="Open tasks" value={openTasks} hint={`of ${taskCount} total`} icon={ListTodo} tone="warning" />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstandingCents, displayCurrency)}
          hint={`${formatMoney(paidCents, displayCurrency)} collected`}
          icon={Receipt}
          tone="success"
        />
        <StatCard
          label="Overdue invoices"
          value={overdueCount}
          hint={overdueCount === 0 ? 'You’re all caught up' : 'Past due date'}
          icon={AlertTriangle}
          tone={overdueCount > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Build completion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Production readiness checklist</span>
              <span className="font-medium">{completionPct}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {buildSteps.map((s) => (
                <li key={s.name} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      s.done ? 'bg-success' : 'bg-muted-foreground'
                    }`}
                  />
                  <span className={s.done ? '' : 'text-muted-foreground'}>{s.name}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <SystemStatusCard items={statusItems} />
      </div>

      <ActivityFeed items={activity} />
    </div>
  );
}
