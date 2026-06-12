// OB-203 D16.1 — committed_data visibility gate (logical atomicity, read-side).
//
// The write-side rollback (D16) cannot be trusted under a host outage: the compensating DELETE needs the
// very host that just 502'd, so a failed bulk can leave a batch stuck in `processing`/`failed` with partial
// rows physically present (run-4 left Ventas at 20k/160k, never rolled back). The structural answer is
// LOGICAL atomicity: a row only COUNTS for a consumer if its batch is durably complete — regardless of
// whether the physical rollback ever ran.
//
// THE PREDICATE: a committed_data row is LIVE iff
//     import_batch_id IS NULL            (legacy / non-batched writes — ~88% of historical rows)
//   OR its import_batch.status = 'completed'.
// Rows in a `processing` or `failed` batch are invisible to every consumer (calc, aggregation, entity
// resolution, period detection, dashboards).
//
// NULL-tolerance is load-bearing: the overwhelming majority of existing rows (every proof tenant's data)
// carry a NULL import_batch_id, so a strict `status='completed'` filter would hide them and collapse the
// anchors. This gate keeps NULL + completed, hides ONLY non-completed.
//
// PHASE-7 SAFETY BY CONSTRUCTION: the gate hides rows by listing the tenant's NON-completed batch ids.
// When there are none (every healthy state, every proof tenant), `applyCommittedDataVisibility` is a no-op
// and the query is byte-identical to before. It activates only after a failed/partial commit.
//
// The sweeper (physical reclamation of orphaned rows) and full transactional writes are INF-001.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The import_batch_ids whose rows must be HIDDEN for a tenant — its `processing`/`failed` batches.
 * Normally empty. Cheap (indexed by tenant_id); call once per read pass and reuse.
 */
export async function hiddenBatchIdsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('import_batches')
    .select('id')
    .eq('tenant_id', tenantId)
    .neq('status', 'completed');
  if (error) {
    // Fail OPEN to current behavior (never hide live rows because the lookup hiccuped). The window is a
    // partial that briefly counts — strictly better than blanking a tenant's data on a transient error.
    console.warn(`[committed-data-visibility] hidden-batch lookup failed (gate open): ${error.message}`);
    return [];
  }
  return (data ?? []).map((b: { id: string }) => b.id);
}

/**
 * Apply the visibility gate to a committed_data query builder. NULL-safe (keeps NULL-batch + completed
 * rows, hides the non-completed set). NO-OP when nothing is hidden, so healthy/proof-tenant reads are
 * unchanged. Multiple `.or()` groups AND together in PostgREST, so this composes with existing filters.
 */
export function applyCommittedDataVisibility<Q extends { or(filter: string): Q }>(
  query: Q,
  hiddenBatchIds: string[],
): Q {
  if (hiddenBatchIds.length === 0) return query;
  return query.or(`import_batch_id.is.null,import_batch_id.not.in.(${hiddenBatchIds.join(',')})`);
}

// A `processing` batch older than this cannot still be in-flight — Vercel's execute lifecycle caps at 300s,
// so anything past the cap died mid-commit (the outage case). Buffered well beyond it.
const BATCH_LIVENESS_MS = 6 * 60 * 1000;

export interface ReconcileResult {
  reconciledProcessing: number; // stale 'processing' batches flipped to 'failed'
  rowsReclaimed: number;        // orphan committed_data rows deleted
  failedSwept: number;          // already-'failed' batches whose rows the outage-killed rollback left behind
}

/**
 * D16.1 reconciliation + orphan reclamation (the outage self-heal — closes the defect in OB-203, not later).
 *
 * Makes the platform truthful and clean after an outage mid-commit, with no future effort required:
 *   - any batch stuck in `processing` past its liveness window is marked `failed` (no eternal lying state);
 *   - any non-completed batch that still has rows (a `failed` batch whose host-killed rollback never ran, or
 *     a just-reconciled `processing` one) has those orphan rows DELETED synchronously while the host is
 *     healthy — nothing partial survives.
 *
 * Idempotent and tenant-scoped. Invoked at the next import (before new data lands) and on demand. The
 * GENERALIZED background machinery (queues, schedulers, cross-tenant concurrency) is the only piece that
 * remains INF-001 — the correctness self-heal is here.
 */
export async function reconcileStaleBatches(
  supabase: SupabaseClient,
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<ReconcileResult> {
  const result: ReconcileResult = { reconciledProcessing: 0, rowsReclaimed: 0, failedSwept: 0 };
  const cutoffIso = new Date(nowMs - BATCH_LIVENESS_MS).toISOString();

  const { data: batches, error } = await supabase
    .from('import_batches')
    .select('id, status, created_at')
    .eq('tenant_id', tenantId)
    .neq('status', 'completed');
  if (error) {
    console.warn(`[committed-data-visibility] reconcile lookup failed (skipped): ${error.message}`);
    return result;
  }

  for (const b of (batches ?? []) as Array<{ id: string; status: string; created_at: string }>) {
    const isStaleProcessing = b.status === 'processing' && b.created_at < cutoffIso;
    const isFailed = b.status === 'failed';
    // A 'processing' batch still inside its liveness window may be a CONCURRENT in-flight import — leave it.
    if (!isStaleProcessing && !isFailed) continue;

    const { count } = await supabase
      .from('committed_data')
      .select('*', { count: 'exact', head: true })
      .eq('import_batch_id', b.id);
    const orphanRows = count ?? 0;

    let reclaimError: string | null = null;
    if (orphanRows > 0) {
      const { error: delErr } = await supabase.from('committed_data').delete().eq('import_batch_id', b.id);
      reclaimError = delErr?.message ?? null;
      if (!reclaimError) result.rowsReclaimed += orphanRows;
    }

    if (isStaleProcessing) {
      await supabase
        .from('import_batches')
        .update({
          status: 'failed',
          error_summary: {
            reconciled: true,
            reason: 'stale processing batch past liveness window — outage mid-commit',
            rowsReclaimed: reclaimError ? 0 : orphanRows,
            reclaimError,
          } as unknown as Record<string, unknown>,
        })
        .eq('id', b.id);
      result.reconciledProcessing += 1;
    } else if (isFailed && orphanRows > 0) {
      result.failedSwept += 1;
    }
  }

  if (result.reconciledProcessing || result.rowsReclaimed || result.failedSwept) {
    console.log(
      `[committed-data-visibility] reconcile tenant=${tenantId}: processing→failed=${result.reconciledProcessing} ` +
        `failedSwept=${result.failedSwept} rowsReclaimed=${result.rowsReclaimed}`,
    );
  }
  return result;
}
