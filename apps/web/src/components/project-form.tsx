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
import { projectStatuses } from '@/schemas/project';

interface Props {
  initial?: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    client: string | null;
    hourlyRate: number | null;
  };
  trigger?: React.ReactNode;
}

export function ProjectForm({ initial, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get('name') ?? '').trim(),
      description: String(fd.get('description') ?? '').trim() || null,
      status: String(fd.get('status') ?? 'PLANNING'),
      client: String(fd.get('client') ?? '').trim() || null,
      hourlyRate: fd.get('hourlyRate') ? Math.round(Number(fd.get('hourlyRate')) * 100) : null,
    };
    start(async () => {
      const url = isEdit ? `/api/projects/${initial!.id}` : '/api/projects';
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" /> New project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit project' : 'New project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={initial?.name} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={initial?.description ?? ''} maxLength={2000} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={initial?.status ?? 'PLANNING'}>
                {projectStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input id="client" name="client" defaultValue={initial?.client ?? ''} maxLength={120} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly rate (in your currency)</Label>
            <Input
              id="hourlyRate"
              name="hourlyRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.hourlyRate != null ? (initial.hourlyRate / 100).toFixed(2) : ''}
            />
            <p className="text-xs text-muted-foreground">Stored in cents. Leave blank if unused.</p>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
