import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Receipt } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { env, features } from '@/lib/env';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { InvoiceForm } from '@/components/invoice-form';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');

  const where = session.user.role === 'ADMIN' ? {} : { ownerId: session.user.id };
  const [invoices, projects] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  // Lazy mark overdue (display-only).
  const now = Date.now();
  for (const inv of invoices) {
    if (
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      inv.dueDate &&
      inv.dueDate.getTime() < now
    ) {
      inv.status = 'OVERDUE';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            {features.stripe ? 'Stripe is connected — you can send checkout links.' : 'Stripe is not configured — invoices are local-only until you set STRIPE_SECRET_KEY.'}
          </p>
        </div>
        <InvoiceForm projects={projects} defaultCurrency={env.STRIPE_DEFAULT_CURRENCY} />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Create an invoice with line items, then send a Stripe Checkout link to your client."
          action={<InvoiceForm projects={projects} defaultCurrency={env.STRIPE_DEFAULT_CURRENCY} />}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Amount</TH>
                <TH>Due</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((inv) => (
                <TR key={inv.id}>
                  <TD>
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.number}
                    </Link>
                  </TD>
                  <TD>{inv.client}</TD>
                  <TD>
                    {inv.project ? (
                      <Link href={`/projects/${inv.project.id}`} className="text-muted-foreground hover:underline">
                        {inv.project.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD><StatusBadge kind="invoice" value={inv.status} /></TD>
                  <TD>{formatMoney(inv.amountCents, inv.currency)}</TD>
                  <TD className="text-muted-foreground">{formatDate(inv.dueDate)}</TD>
                  <TD className="text-muted-foreground">{formatDate(inv.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
