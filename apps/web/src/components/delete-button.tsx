'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

export function DeleteButton({
  url,
  label = 'Delete',
  confirmTitle = 'Delete this item?',
  confirmBody = 'This action cannot be undone.',
  redirectTo,
  size = 'sm',
  variant = 'destructive',
}: {
  url: string;
  label?: string;
  confirmTitle?: string;
  confirmBody?: string;
  redirectTo?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'destructive' | 'outline' | 'ghost';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    start(async () => {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Delete failed');
        return;
      }
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogDescription>{confirmBody}</DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
