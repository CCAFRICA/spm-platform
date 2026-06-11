// OB-203 Phase 2 — Read-before-derive comprehension planner (DS-027 R1 / DI-2 / T1-E906).
//
// For a sheet, decompose its columns into KNOWN atoms (claimed from prior signal without an LLM
// dispatch) and NOVEL atoms (the only residue a comprehension call must cover). This is the
// read-before-derive gate operating at column-atom granularity: a never-seen sheet of 28 known
// atoms + 2 novel atoms yields comprehension work of exactly 2 (DI-2), not 30. Known atoms carry
// their accumulated roles regardless of novel neighbors — partial recognition by construction,
// dissolving the HF-247 all-or-nothing dead-end.

import { computeAtomFingerprint } from './atom-fingerprint';
import { knownAtomHashes, type KnownAtom } from './atom-flywheel';

export interface PlannedAtom {
  columnName: string;
  hash: string;
  known: boolean;
  role?: string;       // present iff known
  confidence?: number; // present iff known
}

export interface SheetComprehensionPlan {
  sheetName: string;
  atoms: PlannedAtom[];
  /** Columns claimed from prior signal — no LLM. */
  knownColumns: Array<{ columnName: string; role: string; confidence: number }>;
  /** Columns with no sufficient prior — the comprehension residue. */
  novelColumns: string[];
  /** Fraction of columns recognized (provenance for the experience surface). */
  recognizedFraction: number;
}

export function planSheetComprehension(
  sheetName: string,
  columns: string[],
  rows: Record<string, unknown>[],
  known: Map<string, KnownAtom>,
  minConfidence = 0.5,
): SheetComprehensionPlan {
  const knownSet = knownAtomHashes(known, minConfidence);
  const atoms: PlannedAtom[] = [];
  const knownColumns: Array<{ columnName: string; role: string; confidence: number }> = [];
  const novelColumns: string[] = [];

  for (const columnName of columns) {
    const fp = computeAtomFingerprint(columnName, rows.map(r => r[columnName]));
    if (knownSet.has(fp.hash)) {
      const k = known.get(fp.hash)!;
      atoms.push({ columnName, hash: fp.hash, known: true, role: k.role, confidence: k.confidence });
      knownColumns.push({ columnName, role: k.role, confidence: k.confidence });
      // OB-203 RUN-4 fix C: claims are never silent again (DI-4 spirit).
      console.log(`[OB-203][atom-claim] sheet=${sheetName} col=${columnName} hash=${fp.hash.slice(0, 12)} -> CLAIMED role=${k.role}@${k.confidence.toFixed(2)} (stable-known)`);
    } else {
      atoms.push({ columnName, hash: fp.hash, known: false });
      novelColumns.push(columnName);
      const seen = known.get(fp.hash);
      const why = seen ? `ambiguous/low-conf (stored role=${seen.role}@${seen.confidence.toFixed(2)})` : 'no prior atom';
      console.log(`[OB-203][atom-claim] sheet=${sheetName} col=${columnName} hash=${fp.hash.slice(0, 12)} -> NOVEL (${why}) — will comprehend`);
    }
  }
  console.log(`[OB-203][atom-residue] sheet=${sheetName} known=${knownColumns.length}/${columns.length} novel=${novelColumns.length} [${novelColumns.join(', ')}]`);

  return {
    sheetName,
    atoms,
    knownColumns,
    novelColumns,
    recognizedFraction: columns.length ? knownColumns.length / columns.length : 0,
  };
}

/**
 * EPG-2.2 payload-bound: build the comprehension request input for a sheet covering ONLY its novel
 * columns (with sample rows projected to those columns). The payload is O(novel atoms) — never
 * O(rows) (sample-bounded) and never O(known structure). A sheet whose atoms are all known yields
 * an empty input (no LLM dispatch at all).
 */
export function buildBoundedComprehensionInput(
  plan: SheetComprehensionPlan,
  rows: Record<string, unknown>[],
  sampleSize = 5,
): { sheetName: string; columns: string[]; sampleRows: Record<string, unknown>[]; rowCount: number } | null {
  if (plan.novelColumns.length === 0) return null; // fully recognized — nothing to comprehend
  const cols = plan.novelColumns;
  const sampleRows = rows.slice(0, sampleSize).map(r => {
    const projected: Record<string, unknown> = {};
    for (const c of cols) projected[c] = r[c];
    return projected;
  });
  return { sheetName: plan.sheetName, columns: cols, sampleRows, rowCount: rows.length };
}
