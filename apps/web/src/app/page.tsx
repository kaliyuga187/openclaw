import Link from 'next/link';
import { ArrowRight, CheckCircle2, ListTodo, Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

const FEATURES = [
  { icon: ListTodo, title: 'Projects & tasks', body: 'Group work, assign owners, track status from to-do to done.' },
  { icon: Receipt, title: 'Stripe invoicing', body: 'Generate invoices with line items and bill via Stripe Checkout.' },
  { icon: ShieldCheck, title: 'Production-grade auth', body: 'Bcrypt + JWT sessions, optional Google OAuth, role-aware APIs.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <span className="font-semibold">OpenClaw</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-20">
        <section className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            Built for freelancers and small agencies
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            Track projects. Ship tasks. Get paid.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            One dashboard for the project, the work, and the invoice. Bring your own Postgres,
            wire up Stripe, and ship it on Vercel or any VPS in an afternoon.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Create an account <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="space-y-2 p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} OpenClaw — open source, self-hosted, built with Next.js.
      </footer>
    </div>
  );
}
