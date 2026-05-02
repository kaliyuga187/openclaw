import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessResource } from '@/lib/permissions';
import { features } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { CheckoutButton } from '@/components/checkout-button';
import { DeleteButton } from '@/components/delete-button';
import { formatDate, formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { paid?: string; cancelled?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { items: true, project: { select: { id: true, name: true } } },
  });
  if (!invoice || !canAccessResource({ id: session.user.id, role: session.user.role }, invoice.ownerId)) {
    notFound();
  }

  const isOverdue =
    invoice.status !== 'PAID' &&
    invoice.status !== 'VOID' &&
    invoice.dueDate &&
    invoice.dueDate.getTime() < Date.now();
  const displayStatus = isOverdue ? 'OVERDUE' : invoice.status;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/invoices"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to invoices</Link>
      </Button>

      {searchParams.paid ? (
        <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Payment completed. The webhook will mark this invoice as paid within a few seconds.
        </div>
      ) : null}
      {searchParams.cancelled ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Checkout cancelled. The invoice has been returned to draft.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
            <StatusBadge kind="invoice" value={displayStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            For {invoice.client} — {invoice.email}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {invoice.status !== 'PAID' && invoice.status !== 'VOID' ? (
            <CheckoutButton invoiceId={invoice.id} disabled={!features.stripe} />
          ) : null}
          {invoice.status !== 'PAID' ? (
            <DeleteButton url={`/api/invoices/${invoice.id}`} redirectTo="/invoices" />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH>Qty</TH>
                  <TH>Unit</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.items.map((it) => (
                  <TR key={it.id}>
                    <TD>{it.description}</TD>
                    <TD>{it.quantity}</TD>
                    <TD>{formatMoney(it.unitCents, invoice.currency)}</TD>
                    <TD className="text-right font-medium">
                      {formatMoney(it.unitCents * it.quantity, invoice.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="mt-4 flex justify-end border-t pt-4 text-base font-semibold">
              Total: {formatMoney(invoice.amountCents, invoice.currency)}
            </div>
            {invoice.notes ? (
              <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">{invoice.notes}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Status" value={<StatusBadge kind="invoice" value={displayStatus} />} />
            <Row label="Currency" value={invoice.currency.toUpperCase()} />
            <Row label="Due date" value={formatDate(invoice.dueDate)} />
            <Row label="Paid at" value={formatDate(invoice.paidAt)} />
            <Row
              label="Project"
              value={
                invoice.project ? (
                  <Link href={`/projects/${invoice.project.id}`} className="hover:underline">
                    {invoice.project.name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            {invoice.stripeCheckoutUrl ? (
              <Row
                label="Checkout link"
                value={
                  <a
                    href={invoice.stripeCheckoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    Open
                  </a>
                }
              />
            ) : null}
          </CardContent>
        </Card>
      </div>
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
