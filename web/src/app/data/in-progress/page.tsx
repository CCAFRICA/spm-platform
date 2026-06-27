'use client';

/**
 * /data/in-progress — the luminous In-Progress surface (DS-031 §3.1/§3.4).
 * Center = the StatusSpine per file (live, polled). The membrane map and the
 * EvidenceRail are rendered as INERT seam slots (visible-but-forthcoming, §4) —
 * the future Quarantine/Library/Policy/Audit surfaces are later slices.
 * Gated through the existing data.import capability (Invariant 9).
 */

import Link from 'next/link';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { StatusSpine } from '@/components/prism/StatusSpine';
import { useFileObjects } from '@/components/prism/useFileObjects';
import { CARD, CARD_PAD } from '@/components/insights/ds003/ds003-tokens';
import { Loader2, FileStack } from 'lucide-react';

const STAGES: { label: string; href?: string; current?: boolean; forthcoming?: boolean }[] = [
  { label: 'Submit', href: '/data/submit' },
  { label: 'In Progress', href: '/data/in-progress', current: true },
  { label: 'Quarantine', forthcoming: true },
  { label: 'Library', forthcoming: true },
  { label: 'Policy', forthcoming: true },
  { label: 'Audit', forthcoming: true },
];

function MembraneMap() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STAGES.map((s) =>
        s.forthcoming ? (
          <span
            key={s.label}
            className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground/60"
            title="Forthcoming"
          >
            {s.label} · soon
          </span>
        ) : (
          <Link
            key={s.label}
            href={s.href!}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              s.current ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:bg-muted'
            }`}
          >
            {s.label}
          </Link>
        ),
      )}
    </div>
  );
}

function InProgressInner() {
  const { files, loading, error } = useFileObjects(2000);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prism · Membrane</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">In Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Files moving through quarantine → scan → promotion, in real time.
        </p>
      </header>

      <div className="mb-6">
        <MembraneMap />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {error && (
            <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {loading && files.length === 0 && (
            <div className={`${CARD} ${CARD_PAD} flex items-center gap-3 text-muted-foreground`}>
              <Loader2 className="h-5 w-5 animate-spin" /> Loading the membrane…
            </div>
          )}

          {!loading && files.length === 0 && (
            <div className={`${CARD} ${CARD_PAD} flex flex-col items-center gap-2 py-12 text-center`}>
              <FileStack className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium text-foreground">Nothing in the membrane yet</p>
              <p className="text-sm text-muted-foreground">
                <Link href="/data/submit" className="font-medium underline underline-offset-2">
                  Submit a file →
                </Link>
              </p>
            </div>
          )}

          {files.map((file) => (
            <StatusSpine key={file.id} file={file} />
          ))}
        </div>

        {/* Inert seam: EvidenceRail (forthcoming slice) */}
        <aside className="space-y-3">
          <div className={`${CARD} ${CARD_PAD} border-dashed`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Evidence · soon</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              The audit trail, scan certificates, and downloadable evidence for each file arrive in a later slice.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function InProgressPage() {
  return (
    <RequireCapability capability="data.import">
      <InProgressInner />
    </RequireCapability>
  );
}
