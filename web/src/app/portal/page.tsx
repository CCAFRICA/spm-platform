'use client';

/**
 * /portal — the CDA's focused delivery surface (DS-032 §6).
 *
 * Trust before the drop: the CDA sees they are delivering to THEIR organization
 * (the real tenant record), that the data is private to it, and that it is secured
 * (the actual posture — encryption, tenant isolation, scan). Then the upload hero
 * (membrane SubmitDropzone, customer voice) and the CDA's OWN deliveries (owner-
 * scoped by the file_objects RLS — /api/prism/files returns only owner_id = auth.uid()).
 * No operator chrome. Gated on data.upload via the EXISTING RequireCapability.
 */

import { Lock, Building2, ShieldCheck } from 'lucide-react';
import { RequireCapability } from '@/components/auth/RequireCapability';
import { SubmitDropzone } from '@/components/prism/SubmitDropzone';
import { StatusSpine } from '@/components/prism/StatusSpine';
import { useFileObjects } from '@/components/prism/useFileObjects';
import { useTenant } from '@/contexts/tenant-context';

// Real posture (not fictional): Supabase encrypts at rest + TLS in transit; the
// file_objects/storage RLS isolates each tenant; the membrane quarantines + scans
// every file before it reaches the platform (OB-245).
const ASSURANCES = [
  { icon: Lock, text: 'Encrypted in transit and at rest' },
  { icon: Building2, text: 'Isolated to your organization' },
  { icon: ShieldCheck, text: 'Scanned before it reaches the platform' },
];

function SecurityBand() {
  return (
    <div className="mt-4 flex flex-col gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {ASSURANCES.map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

function PortalInner() {
  // One adaptive membrane poll for the whole portal; the dropzone consumes it (HF-347).
  const { files, refresh } = useFileObjects(2000);
  const { currentTenant, isLoading } = useTenant();
  const org = currentTenant?.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-6 text-center">
        {org ? (
          <p className="text-sm text-muted-foreground">
            Delivering to <span className="font-medium text-foreground">{org}</span>
          </p>
        ) : isLoading ? (
          // Never substitute a literal org name — skeleton until the real one loads.
          <div className="mx-auto mb-2 h-4 w-44 animate-pulse rounded bg-muted" aria-hidden />
        ) : null /* tenant load failed — omit the line rather than pulse forever or fake an org */}
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Deliver your data</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Drop a file below. It stays private to your organization — we secure it the moment it arrives and confirm
          when it&apos;s cleared.
        </p>
      </header>

      {/* The upload is the hero. It consumes the page's single poll (no duplicate interval). */}
      <SubmitDropzone audience="customer" files={files} refresh={refresh} />

      {/* Quiet security assurance — the real posture. */}
      <SecurityBand />

      {/* The CDA's own deliveries (owner-scoped via RLS). */}
      {files.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your deliveries</h2>
          <div className="space-y-3">
            {files.map((f) => (
              <StatusSpine key={f.id} file={f} audience="customer" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PortalPage() {
  return (
    <RequireCapability capability="data.upload">
      <PortalInner />
    </RequireCapability>
  );
}
