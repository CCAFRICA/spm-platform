// OB-203 Phase 2 (5b) — Decomposed comprehension dispatch (DS-027 R1 / DI-2 / DI-4).
//
// Replaces the single all-sheets LLM call with a PER-UNIT dispatch over NOVEL RESIDUE only:
//   - known atoms claim their accumulated roles with NO LLM (read-before-derive),
//   - a sheet whose atoms are all known is `recognized` (zero LLM),
//   - otherwise exactly the novel residue is comprehended (bounded, O(novel)),
//   - a residue call that fails after its one repair retry marks THAT unit `failed_interpretation`
//     — sibling units are independent and proceed (DI-4 per-unit; hold b).
//
// HOLD (a): a `failed_interpretation` unit returns NO atoms to write — failed runs must not seed
// the new atom store the way they poisoned the old one. The caller gates writeAtoms on this.
//
// The residue comprehender is INJECTED so the orchestration (recognition + per-unit failure
// isolation) is testable without a live LLM; the live wrapper (route) supplies comprehendHeaders
// + one repair retry.

import pLimit from 'p-limit';
import { planSheetComprehension, buildBoundedComprehensionInput } from './comprehension-planner';
import { computeAtomFingerprint } from './atom-fingerprint';
import type { KnownAtom } from './atom-flywheel';
import type { ComprehensionFailureClass } from './sci-types';

// HF-285-C: per-sheet residue comprehension is INDEPENDENT (Decision 158 — concurrency
// of recognition, not its semantics; each sheet gets the same prompt/model/parse, the
// graph stage runs after all complete). Bounded concurrency cuts cold analyze wall time
// without changing construction. Configurable; default 4, clamped [1,8].
export function sciLlmConcurrency(): number {
  const raw = Number(process.env.SCI_LLM_CONCURRENCY ?? '');
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4;
  return Math.max(1, Math.min(8, n));
}

export interface SheetInput {
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ResidueRequest {
  sheetName: string;
  columns: string[];
  sampleRows: Record<string, unknown>[];
  rowCount: number;
}

/** Full per-column interpretation as the LLM returns it (for headerComprehension reconstruction).
 *  OB-231: free-form characterization channels (was semanticMeaning/columnRole/identifiesWhat). */
export interface ComprehendedInterpretation {
  characterization: string;
  dataExpectation: string;
  data_nature: string;
  identifies: string;
  relationships: string[];
  confidence: number;
}

/** Injected residue comprehender — already includes the one repair retry. */
export type ResidueComprehender = (
  req: ResidueRequest,
) => Promise<
  | { ok: true; interpretations: Record<string, ComprehendedInterpretation> }
  | { ok: false; failureClass: ComprehensionFailureClass }
>;

export interface UnitComprehensionResult {
  sheetName: string;
  status: 'recognized' | 'comprehended' | 'failed_interpretation';
  /** Columns claimed from prior atom signal (no LLM) — structural role labels (DI-10). */
  knownColumns: Array<{ columnName: string; role: string; confidence: number }>;
  /** Novel columns comprehended by the LLM (present on 'comprehended') — full interpretation. */
  comprehendedColumns?: Array<{ columnName: string; interpretation: ComprehendedInterpretation }>;
  failure?: { failureClass: ComprehensionFailureClass };
  recognizedFraction: number;
  /** Atoms to accumulate — EMPTY for failed units (hold a). Caller writes these (gated). */
  atomsToWrite: Array<{ columnName: string; hash: string; role: string; roleConfidence: number }>;
}

export async function decomposeComprehension(
  sheets: SheetInput[],
  known: Map<string, KnownAtom>,
  comprehendResidue: ResidueComprehender,
  minConfidence = 0.5,
  // OB-203 D13: streamed per-unit completion — fired as EACH sheet finishes (recognized /
  // comprehended / failed), not at end-of-file, so the import surface advances truthfully and the
  // stall detector sees live progress through the long comprehension stretch.
  onUnitDone?: (r: UnitComprehensionResult) => void,
): Promise<UnitComprehensionResult[]> {
  const results: UnitComprehensionResult[] = [];
  // emit is called from concurrent tasks; JS is single-threaded so push + onUnitDone
  // run atomically between awaits. Result order is downstream-keyed by sheetName, so
  // completion-order interleaving is immaterial (D13 streaming is about progress).
  const emit = (r: UnitComprehensionResult) => { results.push(r); try { onUnitDone?.(r); } catch { /* streaming must never break comprehension */ } };

  // HF-285-C: each sheet's residue comprehension is an independent task. recognized
  // (no-novel) sheets resolve with zero LLM; only novel-residue sheets await the LLM.
  // Bounded concurrency over the slow (LLM) tasks; planning stays in-task. A task that
  // throws unexpectedly emits failed_interpretation (single-sheet failure never aborts
  // the batch — the existing per-unit isolation, now under allSettled).
  const processSheet = async (sheet: SheetInput): Promise<void> => {
    try {
      const plan = planSheetComprehension(sheet.sheetName, sheet.columns, sheet.rows, known, minConfidence);

      // claimed-from-prior atoms (always safe to re-accumulate — they comprehended before)
      const atomsToWrite: Array<{ columnName: string; hash: string; role: string; roleConfidence: number }> = [];
      for (const a of plan.atoms) {
        // a.confidence carries the STABLE role confidence for known atoms (planner D5 change).
        if (a.known && a.role) atomsToWrite.push({ columnName: a.columnName, hash: a.hash, role: a.role, roleConfidence: a.confidence ?? 0.9 });
      }

      if (plan.novelColumns.length === 0) {
        emit({
          sheetName: sheet.sheetName,
          status: 'recognized',
          knownColumns: plan.knownColumns,
          recognizedFraction: plan.recognizedFraction,
          atomsToWrite,
        });
        return;
      }

      const input = buildBoundedComprehensionInput(plan, sheet.rows)!; // novel residue, O(novel)
      const res = await comprehendResidue(input);

      if (!res.ok) {
        // HOLD (b): THIS unit fails; siblings are independent. HOLD (a): no atoms for a failed unit.
        emit({
          sheetName: sheet.sheetName,
          status: 'failed_interpretation',
          knownColumns: plan.knownColumns,
          failure: { failureClass: res.failureClass },
          recognizedFraction: plan.recognizedFraction,
          atomsToWrite: [],
        });
        return;
      }

      // comprehended: add the newly-resolved novel atoms to the write set
      const comprehendedColumns: Array<{ columnName: string; interpretation: ComprehendedInterpretation }> = [];
      for (const col of plan.novelColumns) {
        const interp: ComprehendedInterpretation = res.interpretations[col] ?? {
          characterization: 'unknown', dataExpectation: 'unknown', data_nature: 'unknown', identifies: 'nothing', relationships: [], confidence: 0.5,
        };
        comprehendedColumns.push({ columnName: col, interpretation: interp });
        // OB-231: the accumulated atom "role" label carries the free-form data_nature.
        if (interp.data_nature && interp.data_nature !== 'unknown') {
          const fp = computeAtomFingerprint(col, sheet.rows.map(rw => rw[col]));
          atomsToWrite.push({ columnName: col, hash: fp.hash, role: interp.data_nature, roleConfidence: interp.confidence });
        }
      }

      emit({
        sheetName: sheet.sheetName,
        status: 'comprehended',
        knownColumns: plan.knownColumns,
        comprehendedColumns,
        recognizedFraction: plan.recognizedFraction,
        atomsToWrite,
      });
    } catch (e) {
      // Unexpected throw (planner, fingerprint) — isolate to this sheet, do not abort the batch.
      emit({
        sheetName: sheet.sheetName,
        status: 'failed_interpretation',
        knownColumns: [],
        failure: { failureClass: 'unclassified_failure' },
        recognizedFraction: 0,
        atomsToWrite: [],
      });
      console.error(`[OB-203][comprehension] sheet ${sheet.sheetName} threw (isolated): ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const concurrency = sciLlmConcurrency();
  if (process.env.OB203_VERBOSE === '1' || process.env.OB203_VERBOSE === 'true') {
    console.log(`[OB203_VERBOSE] comprehension concurrency=${concurrency} over ${sheets.length} sheet(s) (HF-285-C)`);
  }
  const limit = pLimit(concurrency);
  await Promise.allSettled(sheets.map(sheet => limit(() => processSheet(sheet))));

  return results;
}
