// OB-251 (DS-016 Layer C / P-C1+P-C2) — bounded-window unit commit.
//
// THE OOM FIX. commitContentUnit legitimately needs the WHOLE logical row set in memory
// (content-hash, remediation correctedRows, entity-id resolution) — so a large unit cannot be
// committed in one call without materializing all rows (the 86,608×87 ~2GB peak). This helper
// commits a large unit as a sequence of BOUNDED WINDOWS: it streams windows off the worksheet via
// sheet-window.ts and calls the UNCHANGED commitContentUnit once per window, so peak heap is one
// window regardless of file size (SR-2). Each window is its own import_batch — calc-neutral, because
// the engine reads committed_data by tenant_id/data_type, never by batch grouping.
//
// BYTE-IDENTITY (the HALT-CALC guarantee): the committed_data ROWS are identical to a single-batch
// commit of the same unit — same row_data, same per-row source_date, same FILE-GLOBAL _rowIndex
// (rowIndexOffset), same data_type. The ONE calc-relevant variable, entity_id_field, is resolved
// ONCE here over the SAME candidates and the SAME tenant entity domain commitContentUnit would use,
// then passed as entityIdFieldOverride so every window commits the identical key (no per-window
// drift). For a single entity-scope candidate (the common case) resolution reads only the HC trace —
// identical to commitContentUnit with zero row scan. For ≥2 candidates it scans ONLY the candidate
// columns across all windows (1–2 narrow columns, a few MB) so the value-domain overlap tie-break is
// computed over the full row set exactly as commitContentUnit does — byte-identical, not sampled.
//
// This branch is GATED (execute-bulk) by a cell threshold ABOVE every HALT-CALC anchor's sheet, so
// BCL/Meridian/MIR commit single-batch on the proven path; only OOM-scale files window here.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  commitContentUnit,
  findHcEntityIdCandidates,
  selectEntityIdFieldByOverlap,
  readTenantEntityDomain,
  type CommitContentUnitInput,
  type CommitContentUnitResult,
} from './commit-content-unit';
import type { AgentType } from './sci-types';
import type { SheetWindow } from './sheet-window';
import { CHUNK_ROW_SIZE } from './sheet-window';

export interface WindowedCommitParams {
  unit: CommitContentUnitInput;
  reader: SheetWindow;
  classification: Exclude<AgentType, 'plan'>;
  tenantId: string;
  proposalId: string;
  tabName: string;
  fileName: string;
  fileHashSha256: string;
  /** rows per window (default CHUNK_ROW_SIZE). Peak heap ≈ windowRows × columns. */
  windowRows?: number;
  /**
   * Per-window post-commit hook (e.g. populateStoreMetadata for data units). Runs after each
   * window's committed_data write with that window's rows + the file-global offset + the resolved
   * entity_id_field. Best-effort: a throw is swallowed (matches the non-windowed non-blocking calls).
   */
  onWindowCommitted?: (rows: Record<string, unknown>[], rowOffset: number, entityIdField: string | null) => Promise<void>;
}

export interface WindowedCommitResult {
  totalInserted: number;
  totalRows: number;
  success: boolean;
  error?: string;
  entityIdField: string | null;
  batchIds: string[];
}

/**
 * Resolve entity_id_field ONCE over the full row set, reading ONLY the candidate columns (bounded
 * memory) so the result is byte-identical to commitContentUnit's resolveEntityIdField over the full
 * array — without ever materializing the full array.
 */
async function resolveEntityIdFieldStreamed(
  supabase: SupabaseClient,
  params: WindowedCommitParams,
): Promise<string | null> {
  if (params.classification === 'reference') return null;
  const candidates = findHcEntityIdCandidates(params.unit.classificationTrace);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    const binding = params.unit.confirmedBindings.find((b) => b.semanticRole === 'entity_identifier');
    return binding?.sourceField ?? null;
  }
  // ≥2 candidates → narrow full scan of just the candidate columns + tenant domain → overlap tie-break.
  const windowRows = params.windowRows ?? CHUNK_ROW_SIZE;
  const narrowRows: Array<Record<string, unknown>> = [];
  for (let start = 0; start < params.reader.totalRows; start += windowRows) {
    const win = params.reader.readWindow(start, windowRows);
    if (win.length === 0) break;
    for (const r of win) {
      const slim: Record<string, unknown> = {};
      for (const c of candidates) slim[c] = r[c];
      narrowRows.push(slim);
    }
  }
  const entityDomain = await readTenantEntityDomain(supabase, params.tenantId);
  const sel = selectEntityIdFieldByOverlap(candidates, narrowRows, entityDomain);
  return sel.chosen || null;
}

export async function commitUnitWindowed(
  supabase: SupabaseClient,
  params: WindowedCommitParams,
): Promise<WindowedCommitResult> {
  const windowRows = params.windowRows ?? CHUNK_ROW_SIZE;
  const totalRows = params.reader.totalRows;
  if (totalRows === 0) {
    return { totalInserted: 0, totalRows: 0, success: true, entityIdField: null, batchIds: [] };
  }

  const entityIdField = await resolveEntityIdFieldStreamed(supabase, params);

  const batchIds: string[] = [];
  let totalInserted = 0;
  let offset = 0;

  for (let start = 0; start < totalRows; start += windowRows) {
    const rows = params.reader.readWindow(start, windowRows);
    if (rows.length === 0) break;
    let res: CommitContentUnitResult;
    try {
      res = await commitContentUnit(supabase, {
        unit: params.unit,
        rows,
        classification: params.classification,
        tenantId: params.tenantId,
        proposalId: params.proposalId,
        tabName: params.tabName,
        fileName: params.fileName,
        source: 'sci-bulk',
        fileHashSha256: params.fileHashSha256,
        rowIndexOffset: offset,
        entityIdFieldOverride: entityIdField,
      });
    } catch (err) {
      await rollbackBatches(supabase, batchIds);
      return { totalInserted: 0, totalRows, success: false, entityIdField, batchIds, error: `window @${offset}: ${String(err)}` };
    }
    if (res.batchId) batchIds.push(res.batchId);
    if (!res.success) {
      // commitContentUnit already rolled back ITS window's batch; roll back prior windows for
      // unit-atomicity (a large unit that cannot fully commit retains nothing — matches D16).
      await rollbackBatches(supabase, batchIds);
      return { totalInserted: 0, totalRows, success: false, entityIdField, batchIds, error: res.error };
    }
    totalInserted += res.totalInserted;
    if (params.onWindowCommitted) {
      try { await params.onWindowCommitted(rows, offset, entityIdField); }
      catch (err) { console.warn(`[windowed-commit] onWindowCommitted @${offset} failed (non-blocking):`, err instanceof Error ? err.message : err); }
    }
    offset += rows.length;
  }

  // Aggregate HALT-DATA-LOSS across windows (each window already self-checked committed==parsed).
  if (totalInserted !== totalRows) {
    const reason = `HALT-DATA-LOSS: committed ${totalInserted} of ${totalRows} rows across ${batchIds.length} windows for "${params.tabName}".`;
    console.error(`[windowed-commit] ${reason}`);
    await rollbackBatches(supabase, batchIds);
    return { totalInserted: 0, totalRows, success: false, entityIdField, batchIds, error: reason };
  }

  console.log(`[windowed-commit] ${params.classification}: ${totalInserted} rows across ${batchIds.length} windows (window=${windowRows}), entity_id_field="${entityIdField ?? 'none'}"`);
  return { totalInserted, totalRows, success: true, entityIdField, batchIds };
}

async function rollbackBatches(supabase: SupabaseClient, batchIds: string[]): Promise<void> {
  for (const id of batchIds) {
    try {
      await supabase.from('committed_data').delete().eq('import_batch_id', id);
      await supabase.from('import_batches').update({ status: 'failed' }).eq('id', id);
    } catch (err) {
      console.error(`[windowed-commit] rollback of batch ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
}
