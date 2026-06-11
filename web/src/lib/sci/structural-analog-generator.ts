// OB-203 Phase 2 — Seeded Structural-Analog Generator (DS-027 §2 blind-holdout discipline).
//
// Produces workbooks of the WITNESS STRUCTURAL CLASS — cover sheet, entity roster, reference
// tables, high-cardinality fact grain, derived aggregations — with RANDOMIZED-TOKEN or NON-LATIN
// vocabulary, NEVER real tenant vocabulary. All OB-203 Phase 2-6 tests run against these analogs;
// a fixture in the repo would convert the exit witness into a fitting target (tenant-solution
// risk). Code that recognizes a structural analog it has never seen, in a vocabulary it has never
// seen, is platform code by construction.
//
// Determinism: a seeded PRNG (mulberry32) — same seed → byte-identical workbook. No Date.now /
// Math.random. The `vocabulary` axis ('random-latin' | 'non-latin') drives the cross-vocabulary
// generality test: the SAME structural class in a different token language must recognize equivalently.

export type Vocabulary = 'random-latin' | 'non-latin';

export interface AnalogColumn {
  name: string;
}
export interface AnalogSheet {
  sheetName: string;
  /** Structural role of the sheet (for test assertions; never fed to recognition). */
  kind: 'cover' | 'roster' | 'reference' | 'fact' | 'derived';
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowCount: number;
}
export interface GeneratedWorkbook {
  fileName: string;
  vocabulary: Vocabulary;
  sheets: AnalogSheet[];
}

export interface AnalogOptions {
  seed: number;
  vocabulary?: Vocabulary;        // default 'random-latin'
  factRows?: number;              // high-cardinality grain size (default 800)
  rosterRows?: number;            // entity count (default 40)
  referenceRows?: number;         // lookup size (default 12)
}

// ── seeded PRNG ──
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: () => number, xs: T[]): T => xs[Math.floor(rng() * xs.length)];
const intIn = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

// ── vocabulary generators (NEVER real domain words) ──
const LATIN_C = 'bcdfghjklmnpqrstvwxz', LATIN_V = 'aeiou';
// Cyrillic block (U+0430–U+044F) — non-Latin token alphabet for the generality axis.
const CYR = Array.from({ length: 0x44f - 0x430 + 1 }, (_, i) => String.fromCharCode(0x430 + i));

function token(rng: () => number, vocab: Vocabulary, syllables: number): string {
  let s = '';
  if (vocab === 'non-latin') {
    const len = syllables * 2;
    for (let i = 0; i < len; i++) s += pick(rng, CYR);
  } else {
    for (let i = 0; i < syllables; i++) s += pick(rng, LATIN_C.split('')) + pick(rng, LATIN_V.split(''));
  }
  return s;
}
const Cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── sheet builders ──
function coverSheet(rng: () => number, vocab: Vocabulary): AnalogSheet {
  // Non-tabular: a few label/value rows, inconsistent grain (Portada analog).
  const labelCol = Cap(token(rng, vocab, 2)); const valCol = Cap(token(rng, vocab, 2));
  const rows = Array.from({ length: intIn(rng, 3, 5) }, () => ({
    [labelCol]: token(rng, vocab, 3), [valCol]: token(rng, vocab, 4),
  }));
  return { sheetName: Cap(token(rng, vocab, 3)), kind: 'cover', columns: [labelCol, valCol], rows, totalRowCount: rows.length };
}

function rosterSheet(rng: () => number, vocab: Vocabulary, n: number): { sheet: AnalogSheet; idCol: string; ids: string[] } {
  const idCol = Cap(token(rng, vocab, 2)) + '_id';
  const nameCol = Cap(token(rng, vocab, 2)); const attrCol = Cap(token(rng, vocab, 2));
  const ids = Array.from({ length: n }, (_, i) => `${token(rng, vocab, 1)}${1000 + i}`); // unique 1:1 identifier
  const cats = Array.from({ length: 4 }, () => token(rng, vocab, 2));
  const rows = ids.map(id => ({ [idCol]: id, [nameCol]: token(rng, vocab, 3), [attrCol]: pick(rng, cats) }));
  return { sheet: { sheetName: Cap(token(rng, vocab, 3)), kind: 'roster', columns: [idCol, nameCol, attrCol], rows, totalRowCount: rows.length }, idCol, ids };
}

function referenceSheet(rng: () => number, vocab: Vocabulary, n: number): AnalogSheet {
  const codeCol = Cap(token(rng, vocab, 2)) + '_cd'; const labelCol = Cap(token(rng, vocab, 2));
  const rows = Array.from({ length: n }, (_, i) => ({ [codeCol]: `${100 + i}`, [labelCol]: token(rng, vocab, 3) }));
  return { sheetName: Cap(token(rng, vocab, 3)), kind: 'reference', columns: [codeCol, labelCol], rows, totalRowCount: rows.length };
}

function factSheet(rng: () => number, vocab: Vocabulary, n: number, rosterIdCol: string, ids: string[]): AnalogSheet {
  // High-cardinality grain: FK to roster id, a temporal column, two numeric measures.
  const txnCol = Cap(token(rng, vocab, 2)) + '_id'; const dateCol = Cap(token(rng, vocab, 2));
  const m1 = Cap(token(rng, vocab, 2)); const m2 = Cap(token(rng, vocab, 2));
  const rows = Array.from({ length: n }, (_, i) => ({
    [txnCol]: `${token(rng, vocab, 1)}${100000 + i}`,            // unique per row (high cardinality)
    [rosterIdCol]: pick(rng, ids),                               // FK reference -> roster (many:1)
    [dateCol]: `2026-${String(intIn(rng, 1, 12)).padStart(2, '0')}-${String(intIn(rng, 1, 28)).padStart(2, '0')}`,
    [m1]: intIn(rng, 1, 200),                                   // bounded measure (repeats — clearly not an id)
    [m2]: Number((rng() * 1000).toFixed(2)),
  }));
  return { sheetName: Cap(token(rng, vocab, 3)), kind: 'fact', columns: [txnCol, rosterIdCol, dateCol, m1, m2], rows, totalRowCount: rows.length };
}

function derivedSheet(rng: () => number, vocab: Vocabulary, groupCol: string, ids: string[]): AnalogSheet {
  // Aggregation over the fact grain by the roster key — shared vocabulary + aggregated measures.
  const sumCol = Cap(token(rng, vocab, 2)) + '_sum'; const cntCol = Cap(token(rng, vocab, 2)) + '_n';
  const rows = ids.slice(0, Math.min(ids.length, 20)).map(id => ({
    [groupCol]: id, [sumCol]: intIn(rng, 100, 99999), [cntCol]: intIn(rng, 1, 200),
  }));
  return { sheetName: Cap(token(rng, vocab, 3)), kind: 'derived', columns: [groupCol, sumCol, cntCol], rows, totalRowCount: rows.length };
}

/**
 * Generate a deterministic structural analog of the witness class. Same seed + vocabulary →
 * byte-identical workbook. The five sheet kinds mirror the witness (cover/roster/reference/
 * fact/derived); the fact grain references the roster id (key-reference relation), and the
 * derived sheet aggregates by that key (shared-vocabulary relation) — the exact relations the
 * Phase 6 workbook-graph synthesis must recover, in a vocabulary the recognizer has never seen.
 */
export function generateStructuralAnalog(opts: AnalogOptions): GeneratedWorkbook {
  const vocab = opts.vocabulary ?? 'random-latin';
  const rng = mulberry32(opts.seed);
  const cover = coverSheet(rng, vocab);
  const { sheet: roster, idCol, ids } = rosterSheet(rng, vocab, opts.rosterRows ?? 40);
  const reference = referenceSheet(rng, vocab, opts.referenceRows ?? 12);
  const fact = factSheet(rng, vocab, opts.factRows ?? 800, idCol, ids);
  const derived = derivedSheet(rng, vocab, idCol, ids);
  return {
    fileName: `${token(rng, vocab, 3)}.xlsx`,
    vocabulary: vocab,
    sheets: [cover, roster, reference, fact, derived],
  };
}
