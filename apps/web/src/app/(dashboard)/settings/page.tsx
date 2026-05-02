import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { env, features } from '@/lib/env';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemStatusCard, type StatusItem } from '@/components/system-status-card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');

  const items: StatusItem[] = [
    { name: 'NEXTAUTH_SECRET', tone: env.NEXTAUTH_SECRET.length >= 16 ? 'green' : 'red', detail: 'Used to sign session JWTs' },
    { name: 'NEXT_PUBLIC_APP_URL', tone: env.NEXT_PUBLIC_APP_URL ? 'green' : 'red', detail: env.NEXT_PUBLIC_APP_URL || 'unset' },
    { name: 'DATABASE_URL', tone: env.DATABASE_URL ? 'green' : 'red', detail: 'Postgres connection (value hidden)' },
    { name: 'Google OAuth', tone: features.google ? 'green' : 'grey', detail: features.google ? 'Both client id + secret set' : 'GOOGLE_CLIENT_ID/SECRET not set' },
    { name: 'Stripe', tone: features.stripe ? 'green' : 'amber', detail: features.stripe ? 'STRIPE_SECRET_KEY present' : 'Set STRIPE_SECRET_KEY to enable invoicing' },
    { name: 'Stripe webhook', tone: features.stripeWebhook ? 'green' : 'grey', detail: features.stripeWebhook ? 'STRIPE_WEBHOOK_SECRET present' : 'Set STRIPE_WEBHOOK_SECRET to auto-mark paid invoices' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Account profile and server configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed-in user details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name" value={session.user.name ?? '—'} />
          <Row label="Email" value={session.user.email ?? '—'} />
          <Row label="Role" value={<Badge variant={session.user.role === 'ADMIN' ? 'default' : 'muted'}>{session.user.role}</Badge>} />
          <Row label="User ID" value={<code className="text-xs">{session.user.id}</code>} />
        </CardContent>
      </Card>

      <SystemStatusCard items={items} title="Server configuration" />

      <Card>
        <CardHeader>
          <CardTitle>Operational</CardTitle>
          <CardDescription>Default values used by new resources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Default invoice currency" value={env.STRIPE_DEFAULT_CURRENCY.toUpperCase()} />
          <Row label="Rate limit" value={`${env.RATE_LIMIT_PER_MINUTE} req / IP / minute`} />
          <Row label="Log level" value={env.LOG_LEVEL} />
          <Row label="Node env" value={env.NODE_ENV} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
