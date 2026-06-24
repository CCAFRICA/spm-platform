// OB-235 P6 — signal-level feedback: the Multiplier-of-five (Tier-2; DS-030 §5.1, the loop OB-233 deferred,
// extended to the expression layer in R2). A SINGLE Level-2 comprehension correction (the human says "this
// characterization is wrong") fans out into FIVE measurable updates:
//   1. the tenant's comprehension_artifacts row (the human's correction becomes authoritative),
//   2. the foundational pattern (a correction is a confidence-lowering structural delta), and
//   3. the domain pattern (same, scoped by domain) — both via the P5 flywheel (HALT-CROSSFLOW: structural only),
//   4. the next CONVERGENCE outcome (P7 already reads comprehension_correction before its AI call — no action
//      here; the consumer's comprehension update is what P7 reads), and
//   5. the surface_bindings that resolved against the corrected field — INVALIDATED so the next recognition
//      re-resolves against the corrected comprehension (no confidently-stale binding survives a correction).
//
// NO REGISTRY / Korean Test: the foundational/domain signature is a name-blind hash of the field's
// comprehension SHAPE (presence flags only — never the field name or the correction text); nothing is gated
// on an allowed-value set. The correction text itself is open-vocabulary (the human's own words).

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateFoundational, aggregateDomain } from '@/lib/calculation/flywheel-pipeline';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A correction is a strong negative signal about the prior comprehension — the structural delta lowers the
// pattern's confidence toward this value (DD-5: a correction is evidence the prior interpretation was wrong).
const CORRECTION_CONFIDENCE = 0.2;

export interface CorrectionConsumeResult {
  comprehensionUpdated: boolean;
  foundationalSignature: string;
  foundationalEmitted: boolean;
  domainEmitted: boolean;
  bindingsInvalidated: number;
}

/** Name-blind structural signature for a comprehension field — a hash of which comprehension facets are
 *  PRESENT (data_nature / relationships / aggregation_behavior / identifies) + a coarse characterization-
 *  length bucket. Never the field name or any text content (Korean Test). Exported so a proof can seed the
 *  matching foundational/domain row. */
export function comprehensionPatternSignature(art: {
  characterization?: string | null; data_nature?: string | null; relationships?: string | null;
  aggregation_behavior?: string | null; identifies?: string | null;
}): string {
  const lenBucket = Math.min(9, Math.floor((art.characterization?.length ?? 0) / 40)); // 0..9, coarse
  const shape = [
    art.data_nature ? 1 : 0, art.relationships ? 1 : 0,
    art.aggregation_behavior ? 1 : 0, art.identifies ? 1 : 0, lenBucket,
  ].join('-');
  return 'comprehension:' + createHash('sha256').update(shape).digest('hex').slice(0, 16);
}

/**
 * Consume one Level-2 comprehension correction. Idempotent-ish (re-running re-applies the same update).
 * domainId/verticalHint are the tenant's structural domain tags (supplied by the caller / P9); when absent,
 * the domain delta is skipped (foundational still fires).
 */
export async function consumeComprehensionCorrection(
  sb: SupabaseClient,
  params: { tenantId: string; fieldName: string; correction: string; domainId?: string; verticalHint?: string },
): Promise<CorrectionConsumeResult> {
  const { tenantId, fieldName, correction, domainId, verticalHint } = params;
  const result: CorrectionConsumeResult = {
    comprehensionUpdated: false, foundationalSignature: '', foundationalEmitted: false,
    domainEmitted: false, bindingsInvalidated: 0,
  };
  if (!tenantId || !fieldName?.trim() || !correction?.trim()) return result;

  // ── Multiplier 1: the tenant's comprehension artifact (human correction is authoritative) ──────────────
  const { data: artRow } = await sb.from('comprehension_artifacts')
    .select('characterization, data_nature, relationships, aggregation_behavior, identifies')
    .eq('tenant_id', tenantId).eq('field_name', fieldName).maybeSingle();
  const updatedShape = { ...(artRow ?? {}), characterization: correction };
  result.foundationalSignature = comprehensionPatternSignature(updatedShape as any);
  if (artRow) {
    const { error } = await sb.from('comprehension_artifacts')
      .update({ characterization: correction, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId).eq('field_name', fieldName);
    result.comprehensionUpdated = !error;
  }

  // ── Multipliers 2 + 3: foundational + domain structural delta (P5 flywheel; HALT-CROSSFLOW: structural) ──
  const delta = [{ patternSignature: result.foundationalSignature, confidence: CORRECTION_CONFIDENCE, executionCount: 1, anomalyRate: 0, learnedBehaviors: { corrected: true } }];
  try { await aggregateFoundational({ tenantId, domainId: domainId ?? '', densityUpdates: delta }); result.foundationalEmitted = true; }
  catch (e) { console.warn('[OB-235 P6] foundational delta failed:', e instanceof Error ? e.message : e); }
  if (domainId) {
    try { await aggregateDomain({ tenantId, domainId, verticalHint, densityUpdates: delta }); result.domainEmitted = true; }
    catch (e) { console.warn('[OB-235 P6] domain delta failed:', e instanceof Error ? e.message : e); }
  }

  // ── Multiplier 5: invalidate surface_bindings that resolved against the corrected field (re-resolve next) ─
  // Read the tenant's bindings and match resolved_fields[].field_name in JS (robust across jsonb-containment
  // operator quirks; binding counts per tenant are small). Deleting invalidates → next recognize re-resolves.
  const { data: bindings } = await (sb as any).from('surface_bindings')
    .select('id, resolved_fields').eq('tenant_id', tenantId);
  const ids = (bindings ?? []).filter((b: any) =>
    Array.isArray(b.resolved_fields) && b.resolved_fields.some((f: any) => f && f.field_name === fieldName),
  ).map((b: any) => b.id);
  if (ids.length > 0) {
    const { error } = await (sb as any).from('surface_bindings').delete().in('id', ids);
    if (!error) result.bindingsInvalidated = ids.length;
  }
  // Multiplier 4 (convergence) needs no action here: P7's convergence-recall reads comprehension_correction
  // + the now-corrected comprehension_artifacts before its next independent AI call.

  return result;
}
