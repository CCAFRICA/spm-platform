/**
 * OB-253 Phase 3 — consolidation: joint-recognition resolutions write back to the shared signal
 * surface (classification_signals), so each facet's co-present assessment AND the joint resolution
 * become readable (via the read adapter) by the next run, the calculation engine, and convergence.
 * This is the G11 write-back for remediation (today's surprise → tomorrow's silent prediction) and
 * the "facets on the surface" deliverable (3B.1) — every facet's claim is durable and co-present.
 *
 * READ via signal-surface.readCoPresentSurface (signalsByType['thalamus:recognition'] +
 * 'remediation:<facet>'). Korean-clean: signal_type/decision_source are structural, no domain literal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JointResolution } from './joint-recognition';

export const SIGNAL_RECOGNITION = 'thalamus:recognition';
export const facetSignalType = (facet: string): string => `remediation:${facet}`;

const MAX_PERSIST = 2000;

/**
 * Persist joint resolutions (and their co-present facet assessments) to the canonical signal surface.
 * One row per resolution carrying the full assessment audit. Best-effort + bounded (SR-2). Returns
 * the count written. Never throws (a facet must degrade, never crash the run).
 */
export async function persistRecognition(
  sb: SupabaseClient,
  tenantId: string,
  resolutions: ReadonlyArray<JointResolution>,
  opts?: { fingerprintHash?: string; source?: string },
): Promise<{ written: number }> {
  const slice = resolutions.slice(0, MAX_PERSIST);
  if (slice.length === 0) return { written: 0 };
  const rows = slice.map((r) => ({
    tenant_id: tenantId,
    signal_type: SIGNAL_RECOGNITION,
    decision_source: r.apexUsed ? 'thalamus:apex' : `thalamus:${r.resolvedFacet}`,
    source: opts?.source ?? 'thalamus',
    scope: 'tenant',
    // confidence is forced to [0,1] or null by the table's own discipline; we already clamp upstream.
    confidence: Number.isFinite(r.confidence) ? r.confidence : null,
    structural_fingerprint: opts?.fingerprintHash ? { fingerprintHash: opts.fingerprintHash } : null,
    signal_value: {
      value: r.value,
      column: r.column,
      action: r.action,
      resolvedFacet: r.resolvedFacet,
      canonical: r.canonical ?? null,
      reasoning: r.reasoning,
      // the CO-PRESENT record — every facet's claim, the joint information sequential processing destroys
      assessments: r.assessments,
    },
    context: { ob: 'OB-253', phase: 3, rounds: r.rounds, apex: r.apexUsed },
  }));
  try {
    const { error } = await sb.from('classification_signals').insert(rows);
    return { written: error ? 0 : rows.length };
  } catch {
    return { written: 0 };
  }
}
