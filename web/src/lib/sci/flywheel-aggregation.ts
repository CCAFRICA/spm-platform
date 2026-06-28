// ============================================================================
// Flywheel Aggregation — OB-251 Layer E (DS-016, async ingestion)
//
// THE DEFECT (queued-but-never-consumed)
// --------------------------------------
// The flywheel WRITE side fires on every import: writeFingerprint() lands rows
// in structural_fingerprints, writeClassificationSignal() lands rows in
// classification_signals, and aggregateToFoundational()/aggregateToDomain()
// accumulate cross-tenant pattern statistics in foundational_patterns /
// domain_patterns. Those writes never stop.
//
// The CONSUME / PROMOTE side, however, is disconnected. The two functions that
// advance an accumulated pattern from "seen many times" to "promoted" —
// identifyPromotionCandidates() and checkPromotedPatterns() in
// promoted-patterns.ts — have ZERO callers anywhere in the codebase. (Only
// loadPromotedPatterns(), which re-derives eligibility on the fly during
// scoring, is wired in.) So the queued signals pile up but the promotion step
// never runs: accumulated evidence never advances recognition state.
//
// OB-251 Layer E closes that gap with a dedicated async aggregation job,
// triggered AFTER processing completion (not on the latency-critical import
// path). This module is that job's body: it RUNS the existing, real promotion
// consume step (identifyPromotionCandidates) and records that the accumulated
// signals were consumed — making the dead code live.
//
// HALT-CALC BOUNDARY (Decision 158) — read before changing anything here
// ----------------------------------------------------------------------
// This job advances RECOGNITION STATE ONLY. It must NEVER change how any file
// is classified:
//   * It does not call or modify resolveClassification.
//   * It does not reconnect the deleted Bayesian scorer.
//   * It only invokes identifyPromotionCandidates (a pure read over
//     foundational_patterns) and records the promotions it produces.
//   * Classification's promoted-pattern read path is loadPromotedPatterns(),
//     which reads foundational_patterns — NOT the promoted_patterns ledger this
//     job writes. Nothing on the classification path reads promoted_patterns,
//     so persisting here cannot alter any classification outcome.
//   * Promotion candidates are cross-tenant by construction (the underlying
//     thresholds require MIN_TENANT_COUNT tenants), so no single sealed tenant's
//     pattern can be promoted in isolation. Sealed tenants (BCL / Meridian /
//     MIR) are therefore byte-identical before and after this job runs.
//
// Korean Test: no domain / tenant / role literals; no registry. The job reads
// structural counts and runs the existing structural promotion step — nothing
// keyed on field names or business vocabulary.
//
// Resilience: every sub-step is independently try/caught. A failed sub-step
// records a line in notes[] and the job continues; runFlywheelAggregation never
// throws. The promotion persist is an idempotent upsert keyed by
// pattern_signature, so re-running the job is safe.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { identifyPromotionCandidates } from './promoted-patterns';

// Confidence floor a promoted pattern carries. Mirrors
// PROMOTION_THRESHOLDS.CONFIDENCE_FLOOR / loadPromotedPatterns() in
// promoted-patterns.ts (that constant is not exported). A promoted pattern is
// a deterministic confidence floor learned from cross-tenant data.
const PROMOTED_CONFIDENCE_FLOOR = 0.8;

export interface FlywheelAggregationResult {
  tenantId: string;
  signalsConsidered: number;
  candidatesIdentified: number;
  promoted: number;
  foundationalSeen: number;
  domainSeen: number;
  notes: string[];
}

/**
 * Run the async flywheel aggregation for a tenant after processing completes.
 *
 * (a) Reads the accumulated counts (classification_signals for the tenant;
 *     global foundational_patterns / domain_patterns) for the result summary.
 * (b) RUNS the existing, currently-unwired promotion consume step
 *     (identifyPromotionCandidates) and persists the threshold-meeting
 *     candidates to the promoted_patterns ledger — the step that today has
 *     zero callers.
 * (c) Is idempotent and non-throwing per sub-step; failures land in notes[].
 *
 * RECOGNITION-STATE ONLY. Never changes classification behavior (see header).
 */
export async function runFlywheelAggregation(
  supabase: SupabaseClient,
  tenantId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<FlywheelAggregationResult> {
  const notes: string[] = [];
  let signalsConsidered = 0;
  let candidatesIdentified = 0;
  let promoted = 0;
  let foundationalSeen = 0;
  let domainSeen = 0;

  // ---- (a) Accumulated counts for the summary ----------------------------

  // classification_signals is tenant-scoped (has tenant_id) — count this
  // tenant's queued signals.
  try {
    const { count, error } = await supabase
      .from('classification_signals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);
    if (error) throw error;
    signalsConsidered = count ?? 0;
  } catch (e) {
    notes.push(`classification_signals count failed: ${errMsg(e)}`);
  }

  // foundational_patterns is cross-tenant by design (no tenant_id; privacy).
  // The count is the global accumulated-pattern population the promotion step
  // reads over.
  try {
    const { count, error } = await supabase
      .from('foundational_patterns')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    foundationalSeen = count ?? 0;
  } catch (e) {
    notes.push(`foundational_patterns count failed: ${errMsg(e)}`);
  }

  try {
    const { count, error } = await supabase
      .from('domain_patterns')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    domainSeen = count ?? 0;
  } catch (e) {
    notes.push(`domain_patterns count failed: ${errMsg(e)}`);
  }

  // ---- (b) RUN the existing promotion consume step -----------------------
  // identifyPromotionCandidates() reads foundational_patterns and returns
  // structural promotion candidates (each flagged meetsThreshold). This is the
  // step with zero callers — running it here is the whole point of Layer E.
  let candidates: Awaited<ReturnType<typeof identifyPromotionCandidates>> = [];
  try {
    candidates = await identifyPromotionCandidates(supabaseUrl, serviceKey);
    candidatesIdentified = candidates.length;
  } catch (e) {
    notes.push(`identifyPromotionCandidates failed: ${errMsg(e)}`);
  }

  // Persist only the candidates that meet the promotion threshold. There is no
  // separate exported persist function, so we record promotions directly to the
  // promoted_patterns ledger following the shape promoted-patterns.ts reads
  // (PromotedPattern: pattern_signature, promoted_classification,
  // confidence_floor, evidence, active). HALT-CALC-safe: nothing on the
  // classification path reads this ledger.
  const toPromote = candidates.filter((c) => c.meetsThreshold);
  if (toPromote.length > 0) {
    const promotedAt = new Date().toISOString();
    const rows = toPromote.map((c) => ({
      pattern_signature: c.patternSignature,
      promoted_classification: c.topClassification,
      confidence_floor: PROMOTED_CONFIDENCE_FLOOR,
      evidence: {
        signalCount: c.signalCount,
        accuracy: c.accuracy,
        tenantCount: c.tenantCount,
        promotedAt,
        classificationDistribution: c.classificationDistribution,
      },
      active: true,
      updated_at: promotedAt,
    }));

    try {
      // Idempotent: upsert keyed by pattern_signature so re-runs refresh the
      // same row rather than duplicating it.
      const { error } = await supabase
        .from('promoted_patterns')
        .upsert(rows, { onConflict: 'pattern_signature' });
      if (error) throw error;
      promoted = rows.length;
    } catch (e) {
      notes.push(`promoted_patterns upsert failed (${rows.length} candidate(s) not persisted): ${errMsg(e)}`);
    }
  }

  if (notes.length === 0) {
    notes.push('ok');
  }

  return {
    tenantId,
    signalsConsidered,
    candidatesIdentified,
    promoted,
    foundationalSeen,
    domainSeen,
    notes,
  };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
