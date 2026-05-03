/**
 * HF-196 Phase 1E — Import batch supersession per Rule 30 + DS-017 (Path B-prime).
 *
 * Match identifier: (tenant_id, fingerprint_hash) per DS-017.
 * Pattern: parallels calculation_batches supersession (OB-42 Phase 4 LOCKED 2026-02-16).
 * Lookup path: structural_fingerprints JOIN import_batches WHERE superseded_by IS NULL.
 *   Fingerprint identity stays on the fingerprint table per D154/D155 single canonical surface.
 *   import_batches gets only Rule 30 supersession columns.
 * Compliance: SOC 2 CC6.1/CC7.2; GDPR Article 30; LGPD Article 37 — audit trail preserved.
 *
 * Behavior:
 *   - On import: check whether (tenant_id, fingerprint_hash) has prior operative batch
 *   - If yes: mark prior batch superseded_by = new batch; new batch supersedes = prior;
 *     superseded_at = now; supersession_reason = caller-supplied
 *   - If no: standard new-import path (no prior batch action)
 *   - Nothing deleted. Nothing destructive. All evidence preserved per Three-Layer Architecture.
 *
 * Korean Test (T1-E910): tenant_id, fingerprint_hash, newBatchId are pure structural
 * primitives. No domain literals. No tenant-specific or field-name-specific logic.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeFingerprintHashSync } from './structural-fingerprint';

export interface SupersessionResult {
  prior_batch_id: string | null;
  prior_batch_status: 'superseded' | 'no_prior';
  new_batch_id: string;
  reason: string;
}

/**
 * Find prior operative batch for this (tenant, fingerprint), if any.
 * Returns prior batch id or null.
 *
 * Path B-prime: query structural_fingerprints JOIN import_batches.
 *   - structural_fingerprints carries the (tenant_id, fingerprint_hash) lookup index
 *   - structural_fingerprints.import_batch_id links to the creator batch
 *   - import_batches.superseded_by IS NULL filters to operative batches only
 *   - Excludes the new batch itself (the row that triggered this lookup)
 */
async function findPriorOperativeBatch(
  supabase: SupabaseClient,
  tenantId: string,
  fingerprintHash: string,
  newBatchId: string,
): Promise<string | null> {
  // Two-step query: (1) find batch_ids associated with the fingerprint, (2) filter to operative.
  // Single-query JOIN via PostgREST is supported but the explicit two-step is clearer for audit.

  // Step 1: find import_batch_ids that produced this fingerprint for this tenant
  const { data: fingerprintRows, error: fpErr } = await supabase
    .from('structural_fingerprints')
    .select('import_batch_id')
    .eq('tenant_id', tenantId)
    .eq('fingerprint_hash', fingerprintHash)
    .not('import_batch_id', 'is', null);

  if (fpErr) {
    console.warn(`[Phase 1E supersession] fingerprint lookup failed: ${fpErr.message}`);
    return null;
  }

  const candidateBatchIds = (fingerprintRows ?? [])
    .map(r => r.import_batch_id as string)
    .filter(id => id !== newBatchId);

  if (candidateBatchIds.length === 0) return null;

  // Step 2: filter to operative (superseded_by IS NULL) batches
  const { data: operativeBatches, error: ibErr } = await supabase
    .from('import_batches')
    .select('id, created_at')
    .eq('tenant_id', tenantId)
    .in('id', candidateBatchIds)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (ibErr) {
    console.warn(`[Phase 1E supersession] operative batch lookup failed: ${ibErr.message}`);
    return null;
  }

  if (!operativeBatches || operativeBatches.length === 0) return null;
  return operativeBatches[0].id as string;
}

/**
 * Supersede prior operative batch if (tenant_id, fingerprint_hash) match exists.
 *
 * Returns supersession result for caller logging. Throws on update error
 * (caller should treat as non-blocking — original import succeeded; supersession
 * failure means both batches remain operative until manual reconciliation).
 */
export async function supersedePriorBatchIfExists(
  supabase: SupabaseClient,
  tenantId: string,
  fingerprintHash: string,
  newBatchId: string,
  reason: string = 'fingerprint_match_reimport',
): Promise<SupersessionResult> {
  const priorBatchId = await findPriorOperativeBatch(
    supabase,
    tenantId,
    fingerprintHash,
    newBatchId,
  );

  if (!priorBatchId) {
    return {
      prior_batch_id: null,
      prior_batch_status: 'no_prior',
      new_batch_id: newBatchId,
      reason: 'no_prior_operative_batch',
    };
  }

  // Mark prior batch as superseded — both link + audit columns set atomically per
  // CHECK constraint (superseded_by NOT NULL → superseded_at NOT NULL).
  const { error: updateError } = await supabase
    .from('import_batches')
    .update({
      superseded_by: newBatchId,
      superseded_at: new Date().toISOString(),
      supersession_reason: reason,
    })
    .eq('id', priorBatchId);

  if (updateError) {
    throw new Error(`[Phase 1E supersession] update of prior batch failed: ${updateError.message}`);
  }

  // Link new batch back to predecessor (back-link is informational; not constrained
  // by CHECK because supersedes does not require superseded_at on the same row).
  const { error: linkError } = await supabase
    .from('import_batches')
    .update({ supersedes: priorBatchId })
    .eq('id', newBatchId);

  if (linkError) {
    throw new Error(`[Phase 1E supersession] back-link to predecessor failed: ${linkError.message}`);
  }

  return {
    prior_batch_id: priorBatchId,
    prior_batch_status: 'superseded',
    new_batch_id: newBatchId,
    reason,
  };
}

/**
 * HF-196 Phase 1E — Engine-side helper.
 * Fetch list of superseded import_batch ids for a tenant. Engine queries use this
 * to filter committed_data via NOT IN — surfacing only operative-batch rows.
 *
 * Returns empty array on error (defensive — engine continues with non-filtered query
 * which preserves prior pre-Phase-1E behavior). For typical tenants this list is small
 * (1 entry per re-imported file) so memory + URL-length are not concerns.
 */
export async function fetchSupersededBatchIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id')
    .eq('tenant_id', tenantId)
    .not('superseded_by', 'is', null);
  if (error) {
    console.warn(`[Phase 1E] fetchSupersededBatchIds failed (non-blocking, engine continues unfiltered): ${error.message}`);
    return [];
  }
  return (data ?? []).map(b => b.id as string);
}

/**
 * Convenience wrapper for import pipelines: compute fingerprint from sheet rows,
 * link the structural_fingerprints row to the just-inserted batch, and supersede
 * any prior operative batch with the same fingerprint.
 *
 * Called from each processX function in execute-bulk + execute after import_batches
 * insert + before committed_data insert. Non-blocking — supersession failure is
 * logged but does not throw to caller (original import succeeds).
 *
 * Returns the SupersessionResult for caller-side log emission, or null if rows
 * were empty (no fingerprint to compute → no supersession check possible).
 */
export async function linkFingerprintAndSupersedePriorBatch(
  supabase: SupabaseClient,
  tenantId: string,
  newBatchId: string,
  rows: Record<string, unknown>[],
  reason: string = 'fingerprint_match_reimport',
): Promise<SupersessionResult | null> {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  const fingerprintHash = computeFingerprintHashSync(columns, rows.slice(0, 50));

  // Link this batch to its structural_fingerprints row (idempotent — only
  // sets import_batch_id where currently NULL; safe to call multiple times).
  const { error: linkErr } = await supabase
    .from('structural_fingerprints')
    .update({ import_batch_id: newBatchId })
    .eq('tenant_id', tenantId)
    .eq('fingerprint_hash', fingerprintHash)
    .is('import_batch_id', null);

  if (linkErr) {
    console.warn(`[Phase 1E] structural_fingerprints link failed (non-blocking): ${linkErr.message}`);
    // Continue to supersession lookup anyway — older signal-surface state may already be linked.
  }

  try {
    const result = await supersedePriorBatchIfExists(supabase, tenantId, fingerprintHash, newBatchId, reason);
    if (result.prior_batch_status === 'superseded') {
      console.log(
        `[Phase 1E] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
        `(tenant=${tenantId} fingerprint=${fingerprintHash.substring(0, 12)} reason=${result.reason})`,
      );
    }
    return result;
  } catch (err) {
    console.warn(`[Phase 1E] supersession failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
