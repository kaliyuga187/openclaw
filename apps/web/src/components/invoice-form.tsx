'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
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
import { formatMoney } from '@/lib/utils';

interface Item {
  description: string;
  quantity: number;
  unit: number; // major units in the form
}

export function InvoiceForm({
  projects,
  defaultCurrency = 'usd',
}: {
  projects: { id: string; name: string }[];
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 0 }]);
  const [client, setClient] = useState('');
  const [email, setEmail] = useState('');
  const [projectId, setProjectId] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');

  const totalCents = items.reduce((s, it) => s + Math.round(it.unit * 100) * it.quantity, 0);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      client: client.trim(),
      email: email.trim(),
      projectId: projectId || null,
      currency,
      notes: notes.trim() || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : '',
      items: items
        .filter((it) => it.description.trim().length > 0)
        .map((it) => ({
          description: it.description.trim(),
          quantity: it.quantity,
          unitCents: Math.round(it.unit * 100),
        })),
    };
    if (payload.items.length === 0) {
      setError('Add at least one line item.');
      return;
    }
    start(async () => {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Save failed');
        return;
      }
      setOpen(false);
      setItems([{ description: '', quantity: 1, unit: 0 }]);
      setClient('');
      setEmail('');
      setProjectId('');
      setNotes('');
      setDueDate('');
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client">Client name</Label>
              <Input id="client" required value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Client email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectId">Project (optional)</Label>
              <Select id="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.slice(0, 3).toLowerCase())}
                maxLength={3}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 0 }])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_80px_120px_auto] items-end">
                  <div>
                    <Input
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => setItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Unit price"
                      value={it.unit}
                      onChange={(e) => setItem(idx, { unit: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                    aria-label="Remove item"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-medium">
              Total: {formatMoney(totalCents, currency)}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
