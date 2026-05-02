'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button } from './ui/button';

export function CheckoutButton({ invoiceId, disabled }: { invoiceId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const res = await fetch(`/api/invoices/${invoiceId}/checkout`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Could not create checkout');
        return;
      }
      if (body?.url) {
        window.open(body.url, '_blank', 'noopener,noreferrer');
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={pending || disabled}>
        <ExternalLink className="mr-2 h-4 w-4" />
        {pending ? 'Creating link…' : 'Send checkout link'}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
