import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ListTodo } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { TaskForm } from '@/components/task-form';
import { DeleteButton } from '@/components/delete-button';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/sign-in');

  const projectFilter = session.user.role === 'ADMIN' ? {} : { ownerId: session.user.id };
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: { project: projectFilter },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: { project: { select: { id: true, name: true } } },
      take: 200,
    }),
    prisma.project.findMany({ where: projectFilter, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">All tasks across all projects.</p>
        </div>
        {projects.length > 0 ? <TaskForm projects={projects} /> : null}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Create a project first"
          description="Tasks belong to projects — add a project from the Projects page."
          action={
            <Button asChild variant="outline">
              <Link href="/projects">Go to projects</Link>
            </Button>
          }
        />
      ) : tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks yet" action={<TaskForm projects={projects} />} />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Priority</TH>
                <TH>Due</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {tasks.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">{t.title}</TD>
                  <TD>
                    <Link href={`/projects/${t.project.id}`} className="text-muted-foreground hover:underline">
                      {t.project.name}
                    </Link>
                  </TD>
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
        </Card>
      )}
    </div>
  );
}
