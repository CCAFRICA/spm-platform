// OB-249 — Remediation Stage: pure structural text helpers.
//
// KOREAN TEST (Decision 154 / I2): every function here keys on STRUCTURE, never on a
// field name or a natural-language/domain literal. The clustering key is a generic
// Unicode transform (NFKC + casefold + whitespace-collapse + punctuation-strip) that
// works on ANY script — Korean, Spanish, Arabic — because it names no language.
//
// DECISION 158 / I1+I3 (load-bearing): NOTHING here authors a value. `chooseCanonical`
// SELECTS a representative from the ACTUALLY-OBSERVED variant set; it can never return a
// string that did not appear in the data. That is the deterministic-construction guarantee
// proof gate P2 checks and the no-fabrication guarantee I3 checks.

import { createHash } from 'node:crypto';

const SEP = '␟'; // unit separator — Korean-clean join (carries no language content)

/** Coerce an arbitrary cell value to its raw string surface form, or null if it is
 *  structurally empty (null/undefined/blank). Numbers/booleans coerce verbatim so a
 *  numeric-looking text column is still comparable; the caller decides text-nature. */
export function rawString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s.trim().length === 0 ? null : s;
}

// Structural punctuation/symbol class. The repo's default tsc target forbids \p{…}/u (see
// binding-inheritance.ts:43), so the punctuation set is spelled with explicit Unicode escapes:
// ASCII punctuation blocks + the common Latin/general-punctuation code points that appear in
// real data (¡ ¿ « » · – — ' ' " " …). These are CODE POINTS, not language/domain literals —
// Korean Test holds (the transform names no language).
const PUNCT_SYMBOL = /[!-/:-@[-`{-~¡¿«»·–—‘’“”…]+/g;

/**
 * The structural CLUSTERING key for a surface form. Two surface forms that denote the same value
 * under pure structural noise (case, whitespace, punctuation, compatibility forms) collapse to
 * the same key. Punctuation AND whitespace are REMOVED (not spaced) so "A.C.M.E."/"ACME",
 * "Coca-Cola 600ml"/"cocacola600ml", and "서울특별시 "/"서울 특별시" all collapse — the most
 * robust clustering. This key is used ONLY to group candidates; the committed canonical is always
 * a verbatim OBSERVED value (chooseCanonical), so aggressive folding never fabricates (I3).
 */
export function structuralKey(v: string): string {
  return v
    .normalize('NFKC')        // compatibility fold (full-width → half-width, ligatures, etc.)
    .toLowerCase()            // Unicode-aware casefold
    .replace(PUNCT_SYMBOL, '') // remove punctuation/symbols (structural noise)
    .replace(/\s+/g, '');      // remove all whitespace
}

/** Distinct raw surface forms present in a column, with their occurrence frequency.
 *  Empties are skipped. The frequency map is the input to deterministic canonical choice. */
export function valueFrequencies(values: ReadonlyArray<unknown>): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of values) {
    const s = rawString(v);
    if (s === null) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  return freq;
}

/**
 * Group the column's distinct raw surface forms by their structural key.
 * Returns structuralKey -> [distinct raw variants in that cluster].
 * A cluster with >1 variant is structural variance (whitespace/case/punctuation).
 */
export function structuralClusters(values: ReadonlyArray<unknown>): Map<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const v of values) {
    const s = rawString(v);
    if (s === null) continue;
    const k = structuralKey(s);
    if (k.length === 0) continue;
    let set = byKey.get(k);
    if (!set) { set = new Set<string>(); byKey.set(k, set); }
    set.add(s);
  }
  const out = new Map<string, string[]>();
  for (const [k, set] of Array.from(byKey)) out.set(k, Array.from(set));
  return out;
}

/**
 * DETERMINISTIC canonical selection (P2/I1/I3). Picks, from a group of OBSERVED variant
 * surface forms, the representative to canonicalize to:
 *   1. highest observed frequency  (the form the data uses most is the truth)
 *   2. tie → shortest surface form (the least-decorated form)
 *   3. tie → lexicographically smallest (total order → reproducible)
 * The returned value is ALWAYS one of `variants` (asserted by the caller against the
 * observed set). It can never be authored text.
 */
export function chooseCanonical(variants: ReadonlyArray<string>, freq: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let bestFreq = -1;
  for (const v of variants) {
    const f = freq.get(v) ?? 0;
    if (f === 0) continue; // not observed in THIS import — never eligible as canonical
    if (
      f > bestFreq ||
      (f === bestFreq && best !== null && (v.length < best.length || (v.length === best.length && v < best)))
    ) {
      best = v;
      bestFreq = f;
    }
  }
  return best;
}

/** Levenshtein edit distance (bounded; for near-duplicate candidate detection only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Does this column carry near-duplicate clusters — the structural signature of variant
 * representations of one real-world value? True iff EITHER:
 *   • two distinct surface forms collapse to the same structural key (case/ws/punct), OR
 *   • two distinct structural keys are within a small relative edit distance (typos / minor
 *     spelling drift) — bounded to low-distinct columns so this stays O(k²) on a small k.
 * Pure structure; no field-name or domain literal anywhere (Korean Test).
 */
export function hasCollapseClusters(values: ReadonlyArray<unknown>, opts?: { maxDistinctForFuzzy?: number }): boolean {
  const clusters = structuralClusters(values);
  for (const variants of Array.from(clusters.values())) {
    if (variants.length > 1) return true; // structural-noise variance
  }
  const keys = Array.from(clusters.keys());
  const maxK = opts?.maxDistinctForFuzzy ?? 200;
  if (keys.length < 2 || keys.length > maxK) return false;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const shorter = Math.min(a.length, b.length);
      if (shorter < 4) continue; // too short for edit-distance to be meaningful
      const d = editDistance(a, b);
      if (d > 0 && d <= Math.max(1, Math.floor(shorter * 0.2))) return true;
    }
  }
  return false;
}

/** A tenant-scoped, value-derived recall key for a column's distinct value SET. Same value
 *  set re-encountered → same hash → prior remediation signal hits → zero LLM (I6/P6). The
 *  values are the data's own (not a developer key); hashing data is not a Korean-Test breach. */
export function columnValueFingerprint(distinctValues: ReadonlyArray<string>): string {
  const sorted = Array.from(new Set(distinctValues)).sort();
  return createHash('sha256').update(sorted.join(SEP)).digest('hex');
}
