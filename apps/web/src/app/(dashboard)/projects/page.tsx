import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { FolderKanban } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { ProjectForm } from '@/components/project-form';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');
  const where = session.user.role === 'ADMIN' ? {} : { ownerId: session.user.id };
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { tasks: true, invoices: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Group work by client or initiative.</p>
        </div>
        <ProjectForm />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start tracking tasks and invoicing."
          action={<ProjectForm />}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Client</TH>
                <TH>Status</TH>
                <TH>Tasks</TH>
                <TH>Invoices</TH>
                <TH>Rate</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </TD>
                  <TD>{p.client ?? '—'}</TD>
                  <TD><StatusBadge kind="project" value={p.status} /></TD>
                  <TD>{p._count.tasks}</TD>
                  <TD>{p._count.invoices}</TD>
                  <TD>{p.hourlyRate ? `${formatMoney(p.hourlyRate)} / hr` : '—'}</TD>
                  <TD className="text-muted-foreground">{formatDate(p.updatedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
