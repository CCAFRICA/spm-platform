'use client';

/**
 * OB-250 — /data-operations/cleaned ("What Was Cleaned").
 *
 * Gives the OB-249 remediation view a home in the Data-Operations menu (the "see what was cleaned"
 * surface). Reuses the existing RemediationReview component + /api/remediation/review (committed-data
 * truth) — NOT a new standing-browse engine (that is adjacent/next per scope). Gated through the
 * existing capability primitive (data.import); the WORKSPACE-level prism_enabled gate is enforced
 * server-side by middleware (this route is in WORKSPACE_FEATURES) — the menu/page hide is not the gate.
 */

import { RequireCapability } from '@/components/auth/RequireCapability';
import { RemediationReview } from '@/components/remediation/RemediationReview';
import { useTenant } from '@/contexts/tenant-context';

function CleanedInner() {
  const { currentTenant } = useTenant();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data Operations</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">What Was Cleaned</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Remediation the system applied to incoming data before it was imported — each variant collapsed
          to its canonical value, with the original retained.
        </p>
      </header>
      {currentTenant?.id
        ? <RemediationReview tenantId={currentTenant.id} />
        : <p className="text-sm text-muted-foreground">Select a tenant to view remediation.</p>}
    </div>
  );
}

export default function CleanedPage() {
  return (
    <RequireCapability capability="data.import">
      <CleanedInner />
    </RequireCapability>
  );
}
