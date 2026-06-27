'use client';

/**
 * /portal — the CDA's focused delivery surface (DS-032 §3.3).
 *
 * The upload is the hero (the membrane's SubmitDropzone, re-pointed to customer
 * voice); below it, the CDA's OWN deliveries (owner-scoped by the file_objects
 * RLS — /api/prism/files returns only owner_id = auth.uid()). No operator
 * breadcrumb, no Calculate button, no workspace chrome. Gated on data.upload via
 * the EXISTING RequireCapability primitive (no new auth path, OB-246 Invariant 9).
 */

import { RequireCapability } from '@/components/auth/RequireCapability';
import { SubmitDropzone } from '@/components/prism/SubmitDropzone';
import { StatusSpine } from '@/components/prism/StatusSpine';
import { useFileObjects } from '@/components/prism/useFileObjects';

function PortalInner() {
  const { files } = useFileObjects(2000);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-7 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Deliver your data</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Drop a file below. We secure it the moment it arrives and confirm the instant it&apos;s cleared.
        </p>
      </header>

      {/* The upload is the hero. */}
      <SubmitDropzone audience="customer" />

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
