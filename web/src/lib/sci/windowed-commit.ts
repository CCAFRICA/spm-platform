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
  findHcEntityIdColumn,
  selectEntityIdFieldByOverlap,
  readTenantEntityDomain,
  type CommitContentUnitInput,
  type CommitContentUnitResult,
} from './commit-content-unit';
import type { AgentType } from './sci-types';
import type { SheetWindow } from './sheet-window';
import { streamSheetWindows } from './sheet-stream';
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

// ── OB-251 HOTFIX: STREAMED commit (the parse-input bound) ───────────────────────────────────────
export interface StreamedCommitParams {
  unit: CommitContentUnitInput;
  buffer: ArrayBuffer | Buffer;
  targetSheet: string;
  classification: Exclude<AgentType, 'plan'>;
  tenantId: string;
  proposalId: string;
  tabName: string;
  fileName: string;
  fileHashSha256: string;
  windowRows?: number;
  onWindowCommitted?: (rows: Record<string, unknown>[], rowOffset: number, entityIdField: string | null) => Promise<void>;
}

/**
 * Commit a LARGE unit by STREAMING the worksheet (jszip) and committing each bounded window through
 * the UNCHANGED commitContentUnit — the workbook is NEVER materialized (the real OOM fix). Forward-only:
 * entity_id_field is resolved ONCE from the classify-time HC trace (no row scan, so it cannot drift
 * across windows), and passed as the override. committed_data ROWS are the same a single-batch commit
 * would write (per-row source_date, file-global _rowIndex via rowIndexOffset, same data_type) — only
 * import_batch_id grouping differs, which the engine ignores. Aggregate HALT-DATA-LOSS: Σ committed ==
 * streamed totalRows.
 */
export async function commitUnitStreamed(
  supabase: SupabaseClient,
  params: StreamedCommitParams,
): Promise<WindowedCommitResult> {
  const windowRows = params.windowRows ?? CHUNK_ROW_SIZE;
  // Trace-derived entity-id (no rows): single entity-scope identifier is deterministic; reference → null.
  const entityIdField = params.classification === 'reference'
    ? null
    : (findHcEntityIdColumn(params.unit.classificationTrace)
        ?? params.unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier')?.sourceField
        ?? null);

  const batchIds: string[] = [];
  let totalInserted = 0;
  let offset = 0;
  let failure: string | undefined;

  const res = await streamSheetWindows(params.buffer, {
    targetSheet: params.targetSheet,
    windowRows,
    onWindow: async (rows) => {
      if (failure) return; // a prior window failed — skip the rest; rollback happens after the stream
      let r: CommitContentUnitResult;
      try {
        r = await commitContentUnit(supabase, {
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
      } catch (err) { failure = `window @${offset}: ${String(err)}`; return; }
      if (r.batchId) batchIds.push(r.batchId);
      if (!r.success) { failure = r.error ?? 'window commit failed'; return; }
      totalInserted += r.totalInserted;
      if (params.onWindowCommitted) {
        try { await params.onWindowCommitted(rows, offset, entityIdField); }
        catch (err) { console.warn(`[streamed-commit] onWindowCommitted @${offset} failed (non-blocking):`, err instanceof Error ? err.message : err); }
      }
      offset += rows.length;
    },
  });

  if (failure) {
    await rollbackBatches(supabase, batchIds);
    return { totalInserted: 0, totalRows: res.totalRows, success: false, entityIdField, batchIds, error: failure };
  }
  if (totalInserted !== res.totalRows) {
    const reason = `HALT-DATA-LOSS: committed ${totalInserted} of ${res.totalRows} streamed rows across ${batchIds.length} windows for "${params.tabName}".`;
    console.error(`[streamed-commit] ${reason}`);
    await rollbackBatches(supabase, batchIds);
    return { totalInserted: 0, totalRows: res.totalRows, success: false, entityIdField, batchIds, error: reason };
  }
  console.log(`[streamed-commit] ${params.classification}: ${totalInserted} rows across ${batchIds.length} windows (window=${windowRows}), entity_id_field="${entityIdField ?? 'none'}"`);
  return { totalInserted, totalRows: res.totalRows, success: true, entityIdField, batchIds };
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
