'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select } from './ui/select';
import { taskPriorities, taskStatuses } from '@/schemas/task';

interface Props {
  projectId?: string;
  projects?: { id: string; name: string }[];
  initial?: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: Date | string | null;
    projectId: string;
  };
  trigger?: React.ReactNode;
}

export function TaskForm({ projectId, projects, initial, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const dueRaw = String(fd.get('dueDate') ?? '');
    const payload: Record<string, unknown> = {
      title: String(fd.get('title') ?? '').trim(),
      description: String(fd.get('description') ?? '').trim() || null,
      status: String(fd.get('status') ?? 'TODO'),
      priority: String(fd.get('priority') ?? 'MEDIUM'),
      dueDate: dueRaw ? new Date(dueRaw).toISOString() : '',
    };
    if (!isEdit) payload.projectId = projectId ?? String(fd.get('projectId') ?? '');

    start(async () => {
      const url = isEdit ? `/api/tasks/${initial!.id}` : '/api/tasks';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Save failed');
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const dueLocal =
    initial?.dueDate ? new Date(initial.dueDate).toISOString().slice(0, 16) : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!isEdit && !projectId && projects ? (
            <div className="space-y-2">
              <Label htmlFor="projectId">Project</Label>
              <Select id="projectId" name="projectId" required>
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required defaultValue={initial?.title} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={initial?.description ?? ''} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={initial?.status ?? 'TODO'}>
                {taskStatuses.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue={initial?.priority ?? 'MEDIUM'}>
                {taskPriorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due</Label>
              <Input id="dueDate" name="dueDate" type="datetime-local" defaultValue={dueLocal} />
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
