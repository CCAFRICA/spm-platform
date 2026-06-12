// OB-203 Phase 6 — Workbook Graph Synthesis (R-graph / DI-3, DI-4).
//
// A relational pass over COMPACT per-sheet summaries (identifier/reference_key value-sets, atom
// hashes, repeat ratio, measure presence — kilobytes regardless of row count). It derives inter-sheet
// relations by STRUCTURAL tests only — value overlap, repeat ratio, atom sharing — with ZERO name or
// domain literals (DI-3). Relational understanding flows downward to re-score roles AT THE CONSUMPTION
// LAYER (informs posteriors + entity-association selection). The graph is DERIVED and FLAG-ONLY: it
// never gates comprehension, never blocks a unit, writes no new tables (architect HALT-5 disposition).
//
// The synthesis is itself a unit in the state machine (DI-4): `synthesizeWorkbookGraph` is pure + total
// — a sheet that can't be related degrades to role 'unknown', never a workbook-wide failure.

import type { AgentType } from './sci-types';

// Overlap at/above this fraction of a column's distinct values means the column REFERENCES the target
// sheet's identifier. Structural threshold, not domain-tuned.
export const REFERENCE_OVERLAP_THRESHOLD = 0.5;
// A roster's identifier repeats ~once per entity; a fact grain repeats it many times.
export const ROSTER_MAX_REPEAT = 1.5;

export type GraphRole = 'roster' | 'fact' | 'reference' | 'derived' | 'unknown';

/** Compact, row-count-independent summary of one sheet (DI-2: kilobytes regardless of rows). */
export interface SheetSummary {
  unitId: string;
  sheetName: string;
  classification: AgentType;
  identifierColumns: Array<{ column: string; values: Set<string> }>;
  referenceKeyColumns: Array<{ column: string; values: Set<string> }>;
  atomHashes: string[];
  rowCount: number;
  idRepeatRatio: number;
  hasMeasure: boolean;
}

export interface GraphEdge {
  fromSheet: string;   // referencing sheet (the many-side / fact)
  fromColumn: string;
  toSheet: string;     // referenced sheet (the one-side / roster)
  toColumn: string;
  overlap: number;
}

/** Per reference_key column: does it reference a roster identifier? (the D3 contextual-role answer) */
export interface ReferenceKeyResolution {
  column: string;
  referencesRoster: boolean;
  bestOverlap: number;
  rosterSheet: string | null;
}

export interface WorkbookGraph {
  roles: Record<string, GraphRole>;                                  // unitId -> graph role
  edges: GraphEdge[];                                                // fact -> roster key references
  referenceKeyResolution: Record<string, ReferenceKeyResolution[]>;  // unitId -> per reference_key col
  reasoning: Record<string, string>;                                 // unitId -> relational reason
}

function overlapFraction(source: Set<string>, target: Set<string>): number {
  if (source.size === 0) return 0;
  let hit = 0;
  for (const v of Array.from(source)) if (target.has(v)) hit++;
  return hit / source.size;
}

export function synthesizeWorkbookGraph(summaries: SheetSummary[]): WorkbookGraph {
  const roles: Record<string, GraphRole> = {};
  const reasoning: Record<string, string> = {};
  const referenceKeyResolution: Record<string, ReferenceKeyResolution[]> = {};
  const edges: GraphEdge[] = [];
  const referencedAsRoster = new Set<string>();   // unitIds whose identifier is referenced by a many-side sheet
  const hasOutgoingEdge = new Set<string>();      // unitIds that reference some roster

  // 1. D3 reference_key resolution: for each reference_key column, does it overlap ANY sheet's
  //    identifier? A reference_key that references no roster is NOT an entity foreign key.
  for (const src of summaries) {
    referenceKeyResolution[src.unitId] = src.referenceKeyColumns.map(col => {
      let bestOverlap = 0; let rosterSheet: string | null = null;
      for (const tgt of summaries) {
        if (tgt.unitId === src.unitId) continue;
        for (const idc of tgt.identifierColumns) {
          const ov = overlapFraction(col.values, idc.values);
          if (ov > bestOverlap) { bestOverlap = ov; rosterSheet = tgt.sheetName; }
        }
      }
      const referencesRoster = bestOverlap >= REFERENCE_OVERLAP_THRESHOLD;
      return { column: col.column, referencesRoster, bestOverlap, rosterSheet: referencesRoster ? rosterSheet : null };
    });
  }

  // 2. Edges + roster detection: A references B when A has a column (identifier OR reference_key)
  //    whose values overlap B's identifier at threshold AND A repeats more than B (A is the many-side,
  //    B is the one-side / roster). Repeat-ratio ordering gives the edge its direction.
  for (const a of summaries) {
    const aCols = [...a.identifierColumns, ...a.referenceKeyColumns];
    for (const b of summaries) {
      if (b.unitId === a.unitId) continue;
      if (!(a.idRepeatRatio > b.idRepeatRatio)) continue;
      let best = { overlap: 0, from: '', to: '' };
      for (const colA of aCols) for (const idcB of b.identifierColumns) {
        const ov = overlapFraction(colA.values, idcB.values);
        if (ov > best.overlap) best = { overlap: ov, from: colA.column, to: idcB.column };
      }
      if (best.overlap >= REFERENCE_OVERLAP_THRESHOLD) {
        edges.push({ fromSheet: a.sheetName, fromColumn: best.from, toSheet: b.sheetName, toColumn: best.to, overlap: best.overlap });
        referencedAsRoster.add(b.unitId);
        hasOutgoingEdge.add(a.unitId);
      }
    }
  }

  const factUnitIds = new Set<string>();
  for (const s of summaries) {
    if (s.hasMeasure && s.idRepeatRatio > ROSTER_MAX_REPEAT && hasOutgoingEdge.has(s.unitId)) factUnitIds.add(s.unitId);
  }

  // 3. Roles (structural, relational).
  for (const s of summaries) {
    if (referencedAsRoster.has(s.unitId) && s.idRepeatRatio <= ROSTER_MAX_REPEAT) {
      roles[s.unitId] = 'roster';
      reasoning[s.unitId] = `Identifier referenced by ${edges.filter(e => e.toSheet === s.sheetName).length} sheet(s); one row per entity (repeat ${s.idRepeatRatio.toFixed(2)}).`;
    } else if (factUnitIds.has(s.unitId)) {
      const e = edges.find(x => x.fromSheet === s.sheetName);
      roles[s.unitId] = 'fact';
      reasoning[s.unitId] = `Repeated grain (repeat ${s.idRepeatRatio.toFixed(2)}) with measures${e ? `, references roster ${e.toSheet} via ${e.fromColumn} (${Math.round(e.overlap * 100)}% overlap).` : '.'}`;
    } else if (s.hasMeasure && summaries.some(f => factUnitIds.has(f.unitId) && f.unitId !== s.unitId && f.rowCount > s.rowCount * 2 && s.atomHashes.some(h => f.atomHashes.includes(h)))) {
      roles[s.unitId] = 'derived';
      reasoning[s.unitId] = `Shares vocabulary with a fact grain but aggregates it (${s.rowCount} rows) — informational rollup.`;
    } else if (!referencedAsRoster.has(s.unitId) && s.identifierColumns.length === 0) {
      roles[s.unitId] = 'reference';
      reasoning[s.unitId] = `Categorical lookup — no entity identifier, not referenced as a roster.`;
    } else {
      roles[s.unitId] = 'unknown';
      reasoning[s.unitId] = `No inter-sheet relation derived.`;
    }
  }

  return { roles, edges, referenceKeyResolution, reasoning };
}
