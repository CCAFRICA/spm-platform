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

import { planSheetComprehension, buildBoundedComprehensionInput } from './comprehension-planner';
import { computeAtomFingerprint } from './atom-fingerprint';
import type { KnownAtom } from './atom-flywheel';
import type { ComprehensionFailureClass } from './sci-types';

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

/** Injected residue comprehender — already includes the one repair retry. */
export type ResidueComprehender = (
  req: ResidueRequest,
) => Promise<
  | { ok: true; roles: Record<string, { columnRole: string; confidence: number }> }
  | { ok: false; failureClass: ComprehensionFailureClass }
>;

export interface UnitComprehensionResult {
  sheetName: string;
  status: 'recognized' | 'comprehended' | 'failed_interpretation';
  /** Columns claimed from prior atom signal (no LLM). */
  knownColumns: Array<{ columnName: string; role: string; confidence: number }>;
  /** Novel columns that were comprehended (present on 'comprehended'). */
  comprehendedColumns?: Array<{ columnName: string; role: string; confidence: number }>;
  failure?: { failureClass: ComprehensionFailureClass };
  recognizedFraction: number;
  /** Atoms to accumulate — EMPTY for failed units (hold a). Caller writes these (gated). */
  atomsToWrite: Array<{ columnName: string; hash: string; role: string }>;
}

export async function decomposeComprehension(
  sheets: SheetInput[],
  known: Map<string, KnownAtom>,
  comprehendResidue: ResidueComprehender,
  minConfidence = 0.5,
): Promise<UnitComprehensionResult[]> {
  const results: UnitComprehensionResult[] = [];

  for (const sheet of sheets) {
    const plan = planSheetComprehension(sheet.sheetName, sheet.columns, sheet.rows, known, minConfidence);

    // claimed-from-prior atoms (always safe to re-accumulate — they comprehended before)
    const atomsToWrite: Array<{ columnName: string; hash: string; role: string }> = [];
    for (const a of plan.atoms) {
      if (a.known && a.role) atomsToWrite.push({ columnName: a.columnName, hash: a.hash, role: a.role });
    }

    if (plan.novelColumns.length === 0) {
      results.push({
        sheetName: sheet.sheetName,
        status: 'recognized',
        knownColumns: plan.knownColumns,
        recognizedFraction: plan.recognizedFraction,
        atomsToWrite,
      });
      continue;
    }

    const input = buildBoundedComprehensionInput(plan, sheet.rows)!; // novel residue, O(novel)
    const res = await comprehendResidue(input);

    if (!res.ok) {
      // HOLD (b): THIS unit fails; siblings already pushed / will be pushed independently.
      // HOLD (a): no atoms written for a failed unit.
      results.push({
        sheetName: sheet.sheetName,
        status: 'failed_interpretation',
        knownColumns: plan.knownColumns,
        failure: { failureClass: res.failureClass },
        recognizedFraction: plan.recognizedFraction,
        atomsToWrite: [],
      });
      continue;
    }

    // comprehended: add the newly-resolved novel atoms to the write set
    const comprehendedColumns: Array<{ columnName: string; role: string; confidence: number }> = [];
    for (const col of plan.novelColumns) {
      const r = res.roles[col];
      const role = r?.columnRole ?? 'unknown';
      const confidence = typeof r?.confidence === 'number' ? r.confidence : 0.5;
      comprehendedColumns.push({ columnName: col, role, confidence });
      if (role && role !== 'unknown') {
        const fp = computeAtomFingerprint(col, sheet.rows.map(rw => rw[col]));
        atomsToWrite.push({ columnName: col, hash: fp.hash, role });
      }
    }

    results.push({
      sheetName: sheet.sheetName,
      status: 'comprehended',
      knownColumns: plan.knownColumns,
      comprehendedColumns,
      recognizedFraction: plan.recognizedFraction,
      atomsToWrite,
    });
  }

  return results;
}
