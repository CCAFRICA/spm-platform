// OB-203 Phase 2 — Atom (column) fingerprint construction (DS-027 R1 / DI-3 / DI-9 / DI-10).
//
// The recognition + learning unit is the column-ATOM: a STRUCTURAL fingerprint over value
// distribution, type, cardinality, repeat ratio, and pattern flags — bucketed for fuzzy
// matching. Korean Test (EPG-2.1): the fingerprint identity contains ZERO language- or
// domain-specific literals and ZERO raw values. The column NAME is display metadata only —
// never part of identity (DI-3). DI-10: `features` is buckets/booleans/structural-type names
// only, safe to persist at foundational/vertical scope by construction.
//
// Composition (DS-027 R1): sheet identity = the multiset of its atom hashes. Recognition is
// partial by construction — a sheet of 28 known atoms + 2 novel atoms yields comprehension
// work of exactly the 2 novel atoms (DI-2); known atoms carry their roles regardless of novel
// neighbors. `algorithm_version` (DI-9) is embedded in `features` so the hash changes when the
// construction changes — prior-version rows coexist and remain reachable via the version tag.

import { createHash } from 'crypto';

export const ATOM_ALGORITHM_VERSION = 1;

export type AtomDataType = 'integer' | 'decimal' | 'date' | 'boolean' | 'text' | 'empty' | 'mixed';

export interface AtomFeatures {
  algorithmVersion: number;
  dataType: AtomDataType;
  cardinalityBucket: string; // distinct/total ratio bucket
  repeatBucket: string;      // total/distinct bucket
  nullBucket: string;        // null ratio bucket
  flags: {
    temporal: boolean;
    identifierLike: boolean;
    measureLike: boolean;
    nameLike: boolean;
  };
}

export interface AtomFingerprint {
  /** Display metadata — NEVER part of identity (DI-3). */
  columnName: string;
  features: AtomFeatures;
  /** sha256 of `features` ONLY (excludes columnName). */
  hash: string;
}

// ── structural type inference (no domain words; shape only) ──
const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
function valueType(v: unknown): Exclude<AtomDataType, 'mixed' | 'empty'> | 'empty' {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'boolean') return 'boolean';
  const s = String(v).trim();
  if (DATE_RE.test(s)) return 'date';
  if (/^-?\d+$/.test(s)) return 'integer';
  if (/^-?\d*\.\d+$/.test(s)) return 'decimal';
  return 'text';
}

function ratioBucket(r: number): string {
  if (r >= 0.95) return 'near-unique';
  if (r >= 0.5) return 'high';
  if (r >= 0.1) return 'medium';
  return 'low';
}
function repeatBucket(r: number): string {
  if (r <= 1.05) return '1';
  if (r <= 2) return '1-2';
  if (r <= 5) return '2-5';
  if (r <= 20) return '5-20';
  return '20+';
}
function nullBucket(r: number): string {
  if (r === 0) return 'none';
  if (r < 0.1) return 'few';
  if (r < 0.5) return 'some';
  return 'many';
}

export function computeAtomFeatures(values: unknown[]): AtomFeatures {
  const total = values.length || 1;
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  const distinct = new Set(nonNull.map(v => String(v))).size || 0;
  const nullRatio = (total - nonNull.length) / total;
  const cardinality = nonNull.length > 0 ? distinct / nonNull.length : 0;
  const repeat = distinct > 0 ? nonNull.length / distinct : 0;

  // dominant type across non-null values (else 'empty'/'mixed')
  const counts: Record<string, number> = {};
  for (const v of nonNull) { const t = valueType(v); counts[t] = (counts[t] || 0) + 1; }
  const typeEntries = Object.entries(counts);
  let dataType: AtomDataType;
  if (nonNull.length === 0) dataType = 'empty';
  else {
    typeEntries.sort((a, b) => b[1] - a[1]);
    const [domType, domCount] = typeEntries[0];
    dataType = domCount / nonNull.length >= 0.9 ? (domType as AtomDataType) : 'mixed';
  }

  const numeric = dataType === 'integer' || dataType === 'decimal';
  // Near-unique: a true identifier is ~1:1. A high-cardinality measure (a wide-range numeric
  // that still repeats) stays below this — its semantic id-vs-measure ambiguity is comprehension's
  // job, not the atom flag's. The flag is a structural signal, deliberately conservative.
  const identifierLike = cardinality >= 0.99 && nullRatio < 0.1;
  const flags = {
    temporal: dataType === 'date',
    identifierLike,
    measureLike: numeric && !identifierLike,
    // structural: text, repeats little, and values carry internal whitespace (multi-token shape)
    nameLike: dataType === 'text' && cardinality >= 0.5 &&
      nonNull.filter(v => /\s/.test(String(v))).length / Math.max(nonNull.length, 1) >= 0.5,
  };

  return {
    algorithmVersion: ATOM_ALGORITHM_VERSION,
    dataType,
    cardinalityBucket: ratioBucket(cardinality),
    repeatBucket: repeatBucket(repeat),
    nullBucket: nullBucket(nullRatio),
    flags,
  };
}

// Stable, canonical serialization (fixed key order) so the hash is deterministic.
function canonical(f: AtomFeatures): string {
  return JSON.stringify([
    f.algorithmVersion, f.dataType, f.cardinalityBucket, f.repeatBucket, f.nullBucket,
    f.flags.temporal, f.flags.identifierLike, f.flags.measureLike, f.flags.nameLike,
  ]);
}

export function hashAtomFeatures(f: AtomFeatures): string {
  return createHash('sha256').update(canonical(f)).digest('hex');
}

export function computeAtomFingerprint(columnName: string, values: unknown[]): AtomFingerprint {
  const features = computeAtomFeatures(values);
  return { columnName, features, hash: hashAtomFeatures(features) };
}

/**
 * Composition identity — the multiset of atom hashes (sorted: column reordering does not change
 * the sheet's identity). Paired with sheet-level structure upstream for the full Tier-1 key.
 */
export function computeCompositionFingerprint(atomHashes: string[]): string {
  const sorted = Array.from(atomHashes).sort();
  return createHash('sha256').update(sorted.join('|')).digest('hex');
}

/**
 * Read-before-derive residue (DI-2 / T1-E906): given a sheet's atom hashes and the set of atom
 * hashes already KNOWN at sufficient confidence (from prior signal), the novel residue is the
 * atoms not yet known — the ONLY atoms a comprehension call must cover. Known atoms are claimed
 * without an LLM dispatch, regardless of novel neighbors (partial recognition).
 */
export function computeNovelResidue(atomHashes: string[], knownHashes: Set<string>): string[] {
  return atomHashes.filter(h => !knownHashes.has(h));
}
