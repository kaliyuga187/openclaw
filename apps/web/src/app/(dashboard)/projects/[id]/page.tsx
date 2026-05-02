import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeft, ListTodo } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessResource } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { ProjectForm } from '@/components/project-form';
import { TaskForm } from '@/components/task-form';
import { DeleteButton } from '@/components/delete-button';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { formatDate, formatMoney } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      tasks: { orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }] },
      invoices: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!project || !canAccessResource({ id: session.user.id, role: session.user.role }, project.ownerId)) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/projects"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to projects</Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge kind="project" value={project.status} />
          </div>
          {project.client ? <p className="text-sm text-muted-foreground">Client: {project.client}</p> : null}
        </div>
        <div className="flex gap-2">
          <ProjectForm
            initial={{
              id: project.id,
              name: project.name,
              description: project.description,
              status: project.status,
              client: project.client,
              hourlyRate: project.hourlyRate,
            }}
            trigger={<Button variant="outline">Edit project</Button>}
          />
          <DeleteButton
            url={`/api/projects/${project.id}`}
            redirectTo="/projects"
            confirmTitle={`Delete “${project.name}”?`}
            confirmBody="This will also delete all tasks belonging to this project."
          />
        </div>
      </div>

      {project.description ? (
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6">
            <p>{project.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Tasks</CardTitle>
          <TaskForm projectId={project.id} />
        </CardHeader>
        <CardContent>
          {project.tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No tasks"
              description="Break the work down into tasks to track progress."
              action={<TaskForm projectId={project.id} />}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Status</TH>
                  <TH>Priority</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {project.tasks.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.title}</TD>
                    <TD><StatusBadge kind="task" value={t.status} /></TD>
                    <TD><StatusBadge kind="priority" value={t.priority} /></TD>
                    <TD className="text-muted-foreground">{formatDate(t.dueDate)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <TaskForm
                          initial={{
                            id: t.id,
                            title: t.title,
                            description: t.description,
                            status: t.status,
                            priority: t.priority,
                            dueDate: t.dueDate,
                            projectId: t.projectId,
                          }}
                          trigger={<Button size="sm" variant="outline">Edit</Button>}
                        />
                        <DeleteButton url={`/api/tasks/${t.id}`} label="" />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {project.invoices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Client</TH>
                  <TH>Status</TH>
                  <TH>Amount</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {project.invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD>
                      <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.number}
                      </Link>
                    </TD>
                    <TD>{inv.client}</TD>
                    <TD><StatusBadge kind="invoice" value={inv.status} /></TD>
                    <TD>{formatMoney(inv.amountCents, inv.currency)}</TD>
                    <TD className="text-muted-foreground">{formatDate(inv.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
