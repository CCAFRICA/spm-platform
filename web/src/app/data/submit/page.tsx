'use client';

/**
 * /data/submit — the Prism Submit surface (DS-031 §3.4).
 * Gated through the EXISTING capability primitive (data.import) — no new auth
 * path (OB-246 Invariant 9). Registered in the data-integration nav section.
 */

import Link from 'next/link';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { SubmitDropzone } from '@/components/prism/SubmitDropzone';

function SubmitInner() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prism · Acquisition</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Submit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring data into Vialuce. Every file is isolated in quarantine and scanned before it reaches the platform.
        </p>
      </header>

      <SubmitDropzone />

      <p className="mt-6 text-xs text-muted-foreground">
        Track everything moving through the membrane on{' '}
        <Link href="/data/in-progress" className="font-medium underline underline-offset-2">
          In Progress →
        </Link>
      </p>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <RequireCapability capability="data.import">
      <SubmitInner />
    </RequireCapability>
  );
}
