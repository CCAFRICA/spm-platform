# E1.4.14 — `web/src/lib/sci/import-batch-supersession.ts` (verbatim full source)

```typescript
/**
 * HF-213 — Content unit hash supersession identity primitive.
 * Supersedes HF-196 Phase 1F's (tenant_id, file_hash_sha256) supersession scope.
 *
 * Supersession scope: (tenant_id, content_unit_hash_sha256).
 *   - Content units within the same file have distinct hashes — they do not
 *     supersede each other (Manifestation 1 closure).
 *   - Same content in different file containers has the same content unit hash —
 *     supersession chains correctly across containers (Manifestation 2 closure).
 *
 * file_hash_sha256 retained on import_batches for file-level audit per HF-196
 * Phase 1F audit intent. No longer load-bearing for supersession decision.
 *
 * Phase 1E architecture preserved unchanged:
 *   - Supersession columns (superseded_by, supersedes, superseded_at, supersession_reason)
 *   - CHECK constraint on supersession integrity
 *   - Engine operative-only filter via fetchSupersededBatchIds + NOT IN
 *   - Audit trail discipline (nothing destroyed; SOC 2 CC7.2; GDPR Article 30)
 *
 * Korean Test (T1-E910): content_unit_hash_sha256 is structural primitive
 * (cryptographic hash of normalized content); tenantId, contentUnitHashSha256,
 * newBatchId are pure structural primitives. Zero domain literals.
 *
 * Path B-prime FK retained (architect invariant 3): structural_fingerprints.import_batch_id
 *   stays populated as lineage primitive for foundational flywheel work; not load-bearing
 *   for supersession decisions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeFingerprintHashSync } from './structural-fingerprint';
// HF-196 Phase 1F: computeFileHashSha256 lives in @/lib/sci/file-content-hash
// (separate module — kept out of this file so node:crypto is not pulled into client
// bundles via state-reader.ts → fetchSupersededBatchIds chain).

export interface SupersessionResult {
  prior_batch_id: string | null;
  prior_batch_status: 'superseded' | 'no_prior';
  new_batch_id: string;
  reason: string;
}

/**
 * Find prior operative batch for this (tenant, content_unit_hash_sha256), if any.
 * Single-query lookup on import_batches.
 *
 * Match identifier: (tenant_id, content_unit_hash_sha256). Same normalized content
 * anywhere in the tenant's import history → match (regardless of file container).
 * Different content → no match.
 *
 * Filters:
 *   - Operative only (superseded_by IS NULL)
 *   - Excludes the new batch itself
 *   - Most recent prior wins (LIMIT 1, ORDER BY created_at DESC)
 */
async function findPriorOperativeBatch(
  supabase: SupabaseClient,
  tenantId: string,
  contentUnitHashSha256: string,
  newBatchId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id, created_at')
    .eq('tenant_id', tenantId)
    .eq('content_unit_hash_sha256', contentUnitHashSha256)
    .is('superseded_by', null)
    .neq('id', newBatchId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn(`[HF-213 supersession] lookup failed: ${error.message}`);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0].id as string;
}

/**
 * Supersede prior operative batch if (tenant_id, content_unit_hash_sha256) match exists.
 *
 * Returns supersession result for caller logging. Throws on update error
 * (caller should treat as non-blocking — original import succeeded; supersession
 * failure means both batches remain operative until manual reconciliation).
 */
export async function supersedePriorBatchIfExists(
  supabase: SupabaseClient,
  tenantId: string,
  contentUnitHashSha256: string,
  newBatchId: string,
  reason: string = 'content_unit_hash_match_reimport',
): Promise<SupersessionResult> {
  const priorBatchId = await findPriorOperativeBatch(
    supabase,
    tenantId,
    contentUnitHashSha256,
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
    throw new Error(`[HF-213 supersession] update of prior batch failed: ${updateError.message}`);
  }

  // Link new batch back to predecessor (back-link is informational; not constrained
  // by CHECK because supersedes does not require superseded_at on the same row).
  const { error: linkError } = await supabase
    .from('import_batches')
    .update({ supersedes: priorBatchId })
    .eq('id', newBatchId);

  if (linkError) {
    throw new Error(`[HF-213 supersession] back-link to predecessor failed: ${linkError.message}`);
  }

  return {
    prior_batch_id: priorBatchId,
    prior_batch_status: 'superseded',
    new_batch_id: newBatchId,
    reason,
  };
}

/**
 * Engine-side helper (preserved unchanged from Phase 1E).
 * Fetch list of superseded import_batch ids for a tenant. Engine queries use this
 * to filter committed_data via NOT IN — surfacing only operative-batch rows.
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
    console.warn(`[Phase 1E/1F] fetchSupersededBatchIds failed (non-blocking, engine continues unfiltered): ${error.message}`);
    return [];
  }
  return (data ?? []).map(b => b.id as string);
}

/**
 * HF-213 convenience wrapper — supersedes HF-196 Phase 1F's
 * supersedePriorBatchOnContentMatch (file_hash scope).
 *
 * Called from each processX function in execute-bulk + execute after import_batches
 * insert (which itself includes content_unit_hash_sha256 in the inserted row).
 *
 * Two responsibilities:
 *   1. Lineage link: structural_fingerprints.import_batch_id ← newBatchId
 *      (Phase 1E Path B-prime FK preserved per architect invariant 3 — informational
 *       only; not load-bearing for supersession trigger.)
 *   2. HF-213 supersession check by content_unit_hash_sha256.
 *
 * Non-blocking: lineage link or supersession failure is logged but does not throw.
 *
 * Returns SupersessionResult for caller-side log emission, or null on failure or
 * empty rows (no fingerprint to link → still attempts supersession by content hash alone).
 */
export async function supersedePriorBatchOnContentMatch(
  supabase: SupabaseClient,
  tenantId: string,
  newBatchId: string,
  contentUnitHashSha256: string,
  rows: Record<string, unknown>[],
  reason: string = 'content_unit_hash_match_reimport',
): Promise<SupersessionResult | null> {
  // 1. Lineage link (Phase 1E Path B-prime FK preserved — informational).
  if (rows.length > 0) {
    try {
      const columns = Object.keys(rows[0]);
      const fingerprintHash = computeFingerprintHashSync(columns, rows.slice(0, 50));
      const { error: linkErr } = await supabase
        .from('structural_fingerprints')
        .update({ import_batch_id: newBatchId })
        .eq('tenant_id', tenantId)
        .eq('fingerprint_hash', fingerprintHash)
        .is('import_batch_id', null);
      if (linkErr) {
        console.warn(`[HF-213] structural_fingerprints lineage link failed (non-blocking): ${linkErr.message}`);
      }
    } catch (err) {
      console.warn(`[HF-213] fingerprint lineage computation failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. HF-213 supersession check by content_unit_hash_sha256.
  try {
    const result = await supersedePriorBatchIfExists(
      supabase,
      tenantId,
      contentUnitHashSha256,
      newBatchId,
      reason,
    );
    if (result.prior_batch_status === 'superseded') {
      console.log(
        `[HF-213] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
        `(tenant=${tenantId} content_unit_hash=${contentUnitHashSha256.substring(0, 12)} reason=${result.reason})`,
      );
    }
    return result;
  } catch (err) {
    console.warn(`[HF-213] supersession failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
```
