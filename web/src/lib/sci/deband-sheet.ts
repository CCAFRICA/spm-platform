// OB-254 §3.4 — the shared de-band helper at the parse→sheets boundary (D1). ONE function, called by
// BOTH the classify worker (process-job) and the commit re-parse (execute-bulk), at the same point,
// immediately after the worksheet is read and BEFORE the fingerprint — so the fingerprint, Content
// Profile, and Header Comprehension all see the RECOVERED header (no __EMPTY). It reads the raw
// `{header:1}` grid (the only place the grid exists), runs the deterministic Structural Construction
// stage, and returns the primary records unit's {columns, rows} plus the full construction result
// (sidecar, observations, transform map, documentation unit). A CLEAN sheet is the degenerate,
// byte-identical output of the same call (singular path — no banded/clean branch; HALT-4 not triggered).
//
// D3 (commit reproducibility): for a non-oversized file the parse companion ({columns, rows}) is the
// carried artifact — process-job writes the DE-BANDED rows into it and execute-bulk APPLIES them on a
// companion HIT (it never re-derives the de-band). On a companion MISS, execute-bulk re-reads the same
// worksheet through THIS SAME helper, so the rows it commits are identical to what classify saw.
//
// D2 (scale): this helper runs whenever the FULL grid materializes (a non-oversized sheet — every
// human-authored banded report is small, incl. the Casa Diaz file). Oversized sheets keep the OB-251
// windowed/stream header-keying (the OOM defense) untouched; that is the degenerate, grid-unavailable
// input of the same conceptual stage (D2's recommended option (a)).

import type * as XLSXNS from 'xlsx';
import { constructStructure, type ConstructionResult, type StructuralObservation } from './structural-construction';
import { writeSignal } from '@/lib/intelligence/canonical-signal-writer';

export interface DebandedSheet {
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
  result: ConstructionResult;
}

/** Read a worksheet's raw `{header:1}` grid and de-band it into the primary records unit's
 *  {columns, rows}. `defvalEmpty:true` reproduces `sheet_to_json(ws,{defval:''})` cell-fill so a clean
 *  sheet's records are byte-identical to the legacy read (DD-7). */
export function debandWorksheet(
  XLSX: typeof XLSXNS,
  ws: XLSXNS.WorkSheet,
  sheetName: string,
): DebandedSheet {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true }) as unknown[][];
  const mergedRanges = (ws['!merges'] ?? []).map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
  const result = constructStructure(grid, { fullGrid: true, mergedRanges, sheetName, defvalEmpty: true });
  const rec = result.units.find((u) => u.kind === 'records');
  return { sheetName, columns: rec ? rec.header : [], rows: rec ? rec.rows : [], result };
}

/** §3.3a — emit each structural observation as a Level-1 structural signal into `classification_signals`
 *  (the SINGLE signal surface, G7). Open-vocabulary signal_type (`structural:<kind>`), `decision_source`
 *  marks the deterministic origin. Best-effort telemetry: a write failure NEVER blocks ingestion (same
 *  contract as `emitComprehensionFailureSignals`). */
export async function emitStructuralObservations(
  observations: StructuralObservation[],
  ctx: { tenantId: string; sourceFileName: string; sheetName: string; fingerprint?: Record<string, unknown> | null },
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  for (const obs of observations) {
    try {
      await writeSignal(
        {
          tenantId: ctx.tenantId,
          signalType: `structural:${obs.kind.replace(/^structure:/, '')}`,
          sourceFileName: ctx.sourceFileName,
          sheetName: ctx.sheetName,
          structuralFingerprint: ctx.fingerprint ?? null,
          classification: obs.kind,
          classificationTrace: obs.detail,
          decisionSource: 'structural_construction',
          scope: 'tenant',
          source: 'sci_agent',
          confidence: 1,
          context: { stage: 'structural_construction', sciVersion: '2.0' },
        },
        supabaseUrl,
        supabaseServiceKey,
      );
    } catch {
      // best-effort: structural telemetry must never fail the import (T1-E902 carry-everything applies
      // to the record set + sidecar, which are already in {columns,rows}; the signal is observability).
    }
  }
}
