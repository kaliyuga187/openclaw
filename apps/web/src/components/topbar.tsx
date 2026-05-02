'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/settings', label: 'Settings' },
];

export function Topbar() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium md:hidden">OpenClaw</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-sm text-muted-foreground">
          {session?.user?.email}
        </span>
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
      {open ? (
        <nav
          className={cn(
            'absolute left-0 right-0 top-14 border-b bg-background p-3 shadow-md md:hidden'
          )}
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
