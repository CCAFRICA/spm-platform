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
  selectEntityIdFieldStructural,
  readTenantEntityDomain,
  makeRowByteEstimator,
  type CommitContentUnitInput,
  type CommitContentUnitResult,
} from './commit-content-unit';
import type { AgentType } from './sci-types';
import type { SheetWindow } from './sheet-window';
import { streamSheetWindows } from './sheet-stream';
import { CHUNK_ROW_SIZE } from './sheet-window';
// HF-359 (Part A): the pulse boundary is BYTES, not rows — a safe fraction of the runtime storage limit.
import { discoverUploadByteBudget, estimatePulseTotal, shouldHandOff, MAX_PULSE_ROWS } from './pulse-budget';
import { planPulses } from './pulse-accumulator';
// HF-359 (Part B): restored pulse progression — emit cumulative pulse index + rows through the EXISTING
// per-unit telemetry counters (no parallel surface). streamSheetMeta gives the streamed total for ~Y.
import { accumulateUnitCommitFields } from './session-telemetry-accumulator';
import { streamSheetMeta } from './sheet-stream';
import type { PulseManifestEntry } from './pulse-load-types';

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
  // HF-362 (Part B): the hand-off decision is no longer a caller flag — the driver decides per unit
  // (handOff = estTotalPulses > 1) from the byte budget. No param.
}

export interface WindowedCommitResult {
  totalInserted: number;
  totalRows: number;
  success: boolean;
  error?: string;
  entityIdField: string | null;
  batchIds: string[];
  // HF-360 (Part A): the ordered pulses this unit STAGED (present only when handOff). totalInserted is 0 on
  // a staged result — the rows are not in committed_data yet; the worker loads them. The session collects
  // these across all units into the one job manifest (index assigned at session scope, in commit order).
  stagedPulses?: Omit<PulseManifestEntry, 'index'>[];
}

/**
 * Resolve entity_id_field ONCE over the full row set, reading ONLY the candidate columns (bounded
 * memory) so the result is byte-identical to commitContentUnit's resolveEntityIdField over the full
 * array — without ever materializing the full array.
 */
async function resolveEntityIdFieldStreamed(
  supabase: SupabaseClient,
  params: WindowedCommitParams,
): Promise<{ field: string | null; ambiguousReason: string | null }> {
  if (params.classification === 'reference') return { field: null, ambiguousReason: null };
  const candidates = findHcEntityIdCandidates(params.unit.classificationTrace);
  if (candidates.length === 1) return { field: candidates[0], ambiguousReason: null };
  if (candidates.length === 0) {
    const binding = params.unit.confirmedBindings.find((b) => b.semanticRole === 'entity_identifier');
    return { field: binding?.sourceField ?? null, ambiguousReason: null };
  }
  // HF-373 Phase C: >=2 candidates -> narrow full scan of just the candidate columns +
  // tenant domain -> the SAME structural discrimination as the direct path (SR-34);
  // ambiguity fails the unit loudly, never first-match.
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
  const sel = selectEntityIdFieldStructural(candidates, narrowRows, entityDomain, params.classification);
  console.log(`[entity-id] HF-373 C (windowed): ${candidates.length} candidates [${candidates.join(', ')}] -> "${sel.chosen || '(none)'}" (${sel.reason})`);
  if (sel.ambiguousCompetitors) return { field: null, ambiguousReason: sel.reason };
  return { field: sel.chosen || null, ambiguousReason: null };
}

export async function commitUnitWindowed(
  supabase: SupabaseClient,
  params: WindowedCommitParams,
): Promise<WindowedCommitResult> {
  const totalRows = params.reader.totalRows;
  if (totalRows === 0) {
    return { totalInserted: 0, totalRows: 0, success: true, entityIdField: null, batchIds: [] };
  }

  const entityIdSelection = await resolveEntityIdFieldStreamed(supabase, params);
  if (entityIdSelection.ambiguousReason) {
    return { totalInserted: 0, totalRows, success: false, entityIdField: null, batchIds: [], error: `entity-id selection failed for "${params.tabName}": ${entityIdSelection.ambiguousReason} (HF-373 C2)` };
  }
  const entityIdField = entityIdSelection.field;

  // HF-359 (Part A): same byte boundary as the streamed path. Read in bounded MAX_PULSE_ROWS chunks
  // (memory), then partition EACH chunk into byte-budgeted pulses (planPulses) so no uploaded object
  // exceeds the storage limit, for any width. The row count is no longer the boundary.
  const budget = await discoverUploadByteBudget(supabase);
  const rowBytes = makeRowByteEstimator(params.unit, params.classification, entityIdField, {
    tenantId: params.tenantId, proposalId: params.proposalId, tabName: params.tabName, source: 'sci-bulk',
  });

  // HF-359 (Part B): exact total (reader.totalRows) + the honest "~Y" pulse estimate from a sample; seed
  // the EXISTING per-unit counters. Per-pulse cumulative writes (below) drive "Writing pulse X of ~Y".
  const sample = params.reader.readWindow(0, Math.min(200, totalRows));
  const avgRowBytes = sample.length > 0 ? Math.ceil(sample.reduce((s, r) => s + rowBytes(r), 0) / sample.length) : 2000;
  const estTotalPulses = estimatePulseTotal(totalRows, avgRowBytes, budget.byteBudget);
  // HF-362 (Part B) — DYNAMIC pulse activation: hand off iff this unit needs MORE than one pulse. A unit that
  // fits in one pulse commits synchronously (fast, under the ceiling); a multi-pulse unit hands off to the
  // worker (the synchronous path would risk the serverless ceiling). The byte budget that sizes pulses
  // (HF-359) also decides whether pulsing is needed — no env var, no new threshold (the directive's removed
  // PULSE_LOAD_HANDOFF). One path, runtime branch (like the isLargeByBytes streaming branch).
  const handOff = shouldHandOff(estTotalPulses);
  await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
    fields: { sheetName: params.tabName, expectedRows: totalRows, pulsesTotal: estTotalPulses, pulsesLanded: 0, rowsCommitted: 0, batchCommitted: false } }, supabase);

  const batchIds: string[] = [];
  const stagedPulses: Omit<PulseManifestEntry, 'index'>[] = [];
  let totalInserted = 0;   // rows LOADED (synchronous path); 0 throughout the hand-off path
  let stagedRows = 0;      // rows STAGED (hand-off path); the staging-completeness HALT key
  let offset = 0;
  let pulsesLanded = 0;

  for (let chunkStart = 0; chunkStart < totalRows; chunkStart += MAX_PULSE_ROWS) {
    const chunk = params.reader.readWindow(chunkStart, MAX_PULSE_ROWS);
    if (chunk.length === 0) break;
    const spans = planPulses(chunk.length, (i) => rowBytes(chunk[i]), budget.byteBudget, MAX_PULSE_ROWS);
    for (const span of spans) {
      const rows = chunk.slice(span.startRow, span.startRow + span.rowCount);
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
          handOff: handOff,
        });
      } catch (err) {
        // HF-359 (Part A, PG-A6): prior pulses stay committed (resumable); the failure is recorded at the
        // boundary by execute-bulk (HF-358 Part B). No cross-pulse rollback.
        return { totalInserted, totalRows, success: false, entityIdField, batchIds, stagedPulses, error: `pulse @${offset}: ${String(err)}` };
      }
      if (res.batchId) batchIds.push(res.batchId);
      if (!res.success) {
        // commitContentUnit already rolled back ITS pulse's own batch; PRIOR pulses stay committed
        // (resumable, PG-A6). The failure is recorded by execute-bulk (HF-358 Part B).
        return { totalInserted, totalRows, success: false, entityIdField, batchIds, stagedPulses, error: res.error };
      }
      pulsesLanded += 1;
      if (handOff && res.stagedPulse) {
        // HF-360: STAGED, not loaded — collect the manifest row; the worker loads it. No load-truth
        // telemetry write (rows have not landed); the truthful surface reads the job for load progress.
        stagedPulses.push(res.stagedPulse);
        stagedRows += res.stagedPulse.expectedRows;
      } else {
        totalInserted += res.totalInserted;
        // HF-359 (Part B): cumulative pulse index + rows through the existing counters (last-write wins).
        await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
          fields: { pulsesLanded, rowsCommitted: totalInserted, pulsesTotal: Math.max(estTotalPulses, pulsesLanded) } }, supabase);
      }
      if (params.onWindowCommitted) {
        // store-metadata population operates on the in-memory window rows + the entities table — independent
        // of the deferred committed_data load, so it runs identically at stage time.
        try { await params.onWindowCommitted(rows, offset, entityIdField); }
        catch (err) { console.warn(`[windowed-commit] onWindowCommitted @${offset} failed (non-blocking):`, err instanceof Error ? err.message : err); }
      }
      offset += rows.length;
    }
  }

  // HF-360 (Part A): hand-off completeness — every row must have been STAGED (the worker performs the
  // per-pulse load HALT-DATA-LOSS). Σ staged == totalRows, else the staging itself dropped rows.
  if (handOff) {
    if (stagedRows !== totalRows) {
      const reason = `HALT-DATA-LOSS (staging): staged ${stagedRows} of ${totalRows} rows across ${stagedPulses.length} pulses for "${params.tabName}".`;
      console.error(`[windowed-commit] ${reason}`);
      return { totalInserted: 0, totalRows, success: false, entityIdField, batchIds, stagedPulses, error: reason };
    }
    console.log(`[windowed-commit] HAND-OFF ${params.classification}: ${stagedRows} rows STAGED across ${stagedPulses.length} byte-budgeted pulses; worker will load.`);
    return { totalInserted: 0, totalRows, success: true, entityIdField, batchIds, stagedPulses };
  }

  // HF-359 (Part B): resolve ~Y → exact pulse count and mark the unit complete.
  await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
    fields: { pulsesTotal: pulsesLanded, pulsesLanded, expectedRows: totalRows, rowsCommitted: totalInserted, batchCommitted: true } }, supabase);

  // Aggregate HALT-DATA-LOSS across pulses (each pulse already self-checked committed==parsed).
  if (totalInserted !== totalRows) {
    const reason = `HALT-DATA-LOSS: committed ${totalInserted} of ${totalRows} rows across ${batchIds.length} pulses for "${params.tabName}".`;
    console.error(`[windowed-commit] ${reason}`);
    // HF-359 (PG-A6): prior pulses remain committed (resumable); report the shortfall.
    return { totalInserted, totalRows, success: false, entityIdField, batchIds, error: reason };
  }

  console.log(`[windowed-commit] ${params.classification}: ${totalInserted} rows across ${batchIds.length} byte-budgeted pulses (budget=${(budget.byteBudget / 1048576).toFixed(1)}MB), entity_id_field="${entityIdField ?? 'none'}"`);
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
  // HF-362 (Part B): the driver decides hand-off per unit (estTotalPulses > 1); no caller flag.
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
  // HF-372 Phase F (EPG-0.8 divergence 2-B): the streamed path previously took the FIRST candidate
  // with no tie-break — a ≥2-candidate sheet (branch id + employee id) resolved by emission order,
  // exactly the HF-351 F5 failure mode removed elsewhere. Same law as the windowed/direct paths:
  // 1 candidate → it; 0 → the entity_identifier binding; ≥2 → value-overlap tie-break against the
  // tenant's entity domain over a bounded streamed sample of the candidate columns.
  let entityIdField: string | null = null;
  if (params.classification !== 'reference') {
    const candidates = findHcEntityIdCandidates(params.unit.classificationTrace);
    if (candidates.length === 1) {
      entityIdField = candidates[0];
    } else if (candidates.length === 0) {
      entityIdField = params.unit.confirmedBindings.find(b => b.semanticRole === 'entity_identifier')?.sourceField ?? null;
    } else {
      const sampleMeta = await streamSheetMeta(params.buffer, { sampleRows: CHUNK_ROW_SIZE, targetSheet: params.targetSheet }).catch(() => null);
      const narrowRows = (sampleMeta?.sample ?? []).map((r) => {
        const slim: Record<string, unknown> = {};
        for (const c of candidates) slim[c] = (r as Record<string, unknown>)[c];
        return slim;
      });
      const entityDomain = await readTenantEntityDomain(supabase, params.tenantId);
      // HF-373 Phase C: same structural discrimination as the direct path (SR-34).
      const sel = selectEntityIdFieldStructural(candidates, narrowRows, entityDomain, params.classification);
      console.log(`[entity-id] HF-373 C (streamed): ${candidates.length} candidates [${candidates.join(', ')}] -> "${sel.chosen || '(none)'}" (${sel.reason})`);
      if (sel.ambiguousCompetitors) {
        return { totalInserted: 0, totalRows: 0, success: false, entityIdField: null, batchIds: [], error: `entity-id selection failed for "${params.tabName}": ${sel.reason} (HF-373 C2)` };
      }
      entityIdField = sel.chosen || null;
    }
  }

  // HF-359 (Part A): discover the byte budget from the real storage limit, and a row-byte estimator that
  // measures each row's serialized CSV size with the SAME serializer + metadata commitContentUnit commits.
  // Each pulse flushes BEFORE its CSV would exceed the budget — so no uploaded object exceeds the limit,
  // for any width. The 20K row count survives only as MAX_PULSE_ROWS (a memory safety cap).
  const budget = await discoverUploadByteBudget(supabase);
  const rowBytes = makeRowByteEstimator(params.unit, params.classification, entityIdField, {
    tenantId: params.tenantId, proposalId: params.proposalId, tabName: params.tabName, source: 'sci-bulk',
  });
  console.log(`[streamed-commit] byte budget=${(budget.byteBudget / 1048576).toFixed(1)}MB (limit ${(budget.effectiveLimit / 1048576).toFixed(0)}MB, source=${budget.limitSource}); pulse boundary = bytes, not rows`);

  // HF-359 (Part B): the EXACT total + the honest "~Y" pulse estimate, from a cheap <dimension> read (best
  // effort — the live signal is the cumulative pulse index + rows, which never needs the total).
  const meta = await streamSheetMeta(params.buffer, { sampleRows: 200, targetSheet: params.targetSheet }).catch(() => null);
  const totalRowsKnown = meta?.totalRows ?? 0;
  const avgRowBytes = meta && meta.sample.length > 0
    ? Math.ceil(meta.sample.reduce((s, r) => s + rowBytes(r), 0) / meta.sample.length)
    : 2000;
  const estTotalPulses = totalRowsKnown > 0 ? estimatePulseTotal(totalRowsKnown, avgRowBytes, budget.byteBudget) : 1;
  // HF-362 (Part B) — DYNAMIC pulse activation: hand off iff this unit needs MORE than one pulse (see
  // commitUnitWindowed). The byte budget decides; no env var, no new threshold. One path, runtime branch.
  const handOff = shouldHandOff(estTotalPulses);
  // Seed the existing per-unit counters: exact total rows + the ~Y estimate; nothing landed yet.
  await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
    fields: { sheetName: params.tabName, expectedRows: totalRowsKnown, pulsesTotal: estTotalPulses, pulsesLanded: 0, rowsCommitted: 0, batchCommitted: false } }, supabase);

  const batchIds: string[] = [];
  const stagedPulses: Omit<PulseManifestEntry, 'index'>[] = [];
  let totalInserted = 0;   // rows LOADED (synchronous path); 0 throughout the hand-off path
  let stagedRows = 0;      // rows STAGED (hand-off path)
  let offset = 0;
  let pulsesLanded = 0;
  let failure: string | undefined;

  const res = await streamSheetWindows(params.buffer, {
    targetSheet: params.targetSheet,
    byteBudget: budget.byteBudget,
    rowBytes,
    maxRows: MAX_PULSE_ROWS,
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
          handOff: handOff,
        });
      } catch (err) { failure = `window @${offset}: ${String(err)}`; return; }
      if (r.batchId) batchIds.push(r.batchId);
      if (!r.success) { failure = r.error ?? 'window commit failed'; return; }
      pulsesLanded += 1;
      if (handOff && r.stagedPulse) {
        // HF-360: STAGED, not loaded — collect the manifest row; the worker loads off the serverless clock.
        stagedPulses.push(r.stagedPulse);
        stagedRows += r.stagedPulse.expectedRows;
      } else {
        totalInserted += r.totalInserted;
        // HF-359 (Part B): write the CUMULATIVE pulse index + rows AFTER commitContentUnit (last-write wins
        // over its per-pulse write — set-merge semantics), so "Writing pulse X of ~Y" + rows committed are
        // accurate for a multi-pulse unit. ~Y resolves upward if the estimate undershot the real pulse count.
        await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
          fields: { pulsesLanded, rowsCommitted: totalInserted, pulsesTotal: Math.max(estTotalPulses, pulsesLanded) } }, supabase);
      }
      if (params.onWindowCommitted) {
        try { await params.onWindowCommitted(rows, offset, entityIdField); }
        catch (err) { console.warn(`[streamed-commit] onWindowCommitted @${offset} failed (non-blocking):`, err instanceof Error ? err.message : err); }
      }
      offset += rows.length;
    },
  });

  if (failure) {
    // HF-359 (Part A, PG-A6): a mid-sequence pulse failure LEAVES ALL PRIOR PULSES COMMITTED (resumable) —
    // the failed pulse already rolled back its OWN batch (commitContentUnit.failCommit); prior pulse-batches
    // are durable. The failure is recorded at the boundary by execute-bulk (HF-358 Part B
    // recordCommitFailureOnJob on the unit's !success). This replaces the prior cross-pulse rollback (D16
    // unit-atomicity) so the work resumes from the failed pulse, not restarts.
    return { totalInserted, totalRows: res.totalRows, success: false, entityIdField, batchIds, stagedPulses, error: failure };
  }
  // HF-360 (Part A): hand-off completeness — every streamed row must have been STAGED (the worker does the
  // per-pulse load HALT-DATA-LOSS). Σ staged == streamed totalRows, else staging dropped rows.
  if (handOff) {
    if (stagedRows !== res.totalRows) {
      const reason = `HALT-DATA-LOSS (staging): staged ${stagedRows} of ${res.totalRows} streamed rows across ${stagedPulses.length} pulses for "${params.tabName}".`;
      console.error(`[streamed-commit] ${reason}`);
      return { totalInserted: 0, totalRows: res.totalRows, success: false, entityIdField, batchIds, stagedPulses, error: reason };
    }
    console.log(`[streamed-commit] HAND-OFF ${params.classification}: ${stagedRows} rows STAGED across ${stagedPulses.length} byte-budgeted pulses; worker will load.`);
    return { totalInserted: 0, totalRows: res.totalRows, success: true, entityIdField, batchIds, stagedPulses };
  }
  if (totalInserted !== res.totalRows) {
    const reason = `HALT-DATA-LOSS: committed ${totalInserted} of ${res.totalRows} streamed rows across ${batchIds.length} pulses for "${params.tabName}".`;
    console.error(`[streamed-commit] ${reason}`);
    // Prior pulses remain committed (resumable); report the shortfall (each pulse already self-verified count).
    return { totalInserted, totalRows: res.totalRows, success: false, entityIdField, batchIds, error: reason };
  }
  // HF-359 (Part B): resolve the estimate to the EXACT pulse count + total rows and mark the unit complete.
  await accumulateUnitCommitFields({ tenantId: params.tenantId, importSessionId: params.proposalId, unitId: params.unit.contentUnitId,
    fields: { pulsesTotal: pulsesLanded, pulsesLanded, expectedRows: res.totalRows, rowsCommitted: totalInserted, batchCommitted: true } }, supabase);
  console.log(`[streamed-commit] ${params.classification}: ${totalInserted} rows across ${batchIds.length} byte-budgeted pulses (budget=${(budget.byteBudget / 1048576).toFixed(1)}MB), entity_id_field="${entityIdField ?? 'none'}"`);
  return { totalInserted, totalRows: res.totalRows, success: true, entityIdField, batchIds };
}

// HF-359 (Part A, PG-A6): the cross-pulse `rollbackBatches` is removed. A pulse failure no longer rolls
// back prior pulses (D16 unit-atomicity → pulse-atomicity): prior pulse-batches stay committed so the work
// resumes from the failed pulse, and the failed pulse already rolled back its OWN batch in
// commitContentUnit.failCommit. The failure is recorded at the boundary by execute-bulk (HF-358 Part B).
