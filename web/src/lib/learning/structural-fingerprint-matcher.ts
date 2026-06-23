// OB-235 P2 — structural-fingerprint matcher. The Korean Test at the learning layer.
//
// Extracts a fingerprint from the STRUCTURE of carried data — column count, the distribution of value
// types, value-magnitude buckets, and cardinality buckets — and NOTHING ELSE. There are ZERO field-name
// literals (in any language): the matcher never reads, stores, or keys on a column's NAME, only on its
// shape. A Korean tenant with Hangul column names fingerprints identically to a structurally-equivalent
// English tenant. The bucket edges below are structural-feature parameters (histogram bins — Residual 1),
// NOT a registry: every value maps to some bucket (open), nothing is gated/rejected by an allowed set.

import { createHash } from 'crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StructuralFeatures {
  columnCount: number;
  typeDistribution: Record<string, number>;    // js-type -> # of columns dominantly that type (no names)
  rangeBuckets: Record<string, number>;        // magnitude bucket -> # of numeric columns
  cardinalityBuckets: Record<string, number>;  // cardinality bucket -> # of columns
}

const SEP = '␟';

// Structural magnitude bucket from a numeric value's absolute size (histogram bin, not a gate).
function magnitudeBucket(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return 'zero';
  if (a < 1) return 'fractional';
  if (a < 1e2) return 'tens';
  if (a < 1e4) return 'thousands';
  if (a < 1e6) return 'millions';
  return 'large';
}

// Structural cardinality bucket from distinct-value count over the sample (histogram bin, not a gate).
function cardinalityBucket(distinct: number): string {
  if (distinct <= 1) return 'constant';
  if (distinct < 5) return 'low';
  if (distinct < 20) return 'medium';
  if (distinct < 100) return 'high';
  return 'very_high';
}

const inc = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

/**
 * Extract structural features from sampled rows. Reads column shape only — never the column names. The
 * dominant type per column drives typeDistribution; numeric columns also contribute a magnitude bucket;
 * every column contributes a cardinality bucket.
 */
export function extractStructuralFeatures(rows: Array<Record<string, unknown>>, sampleLimit = 200): StructuralFeatures {
  const sample = rows.slice(0, sampleLimit);
  const perCol = new Map<string, { types: Record<string, number>; distinct: Set<string>; nums: number[] }>();
  for (const r of sample) {
    const rd = r || {};
    for (const k in rd) {
      const v = (rd as any)[k];
      let c = perCol.get(k);
      if (!c) { c = { types: {}, distinct: new Set(), nums: [] }; perCol.set(k, c); }
      const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      inc(c.types, t);
      c.distinct.add(typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (typeof v === 'number' && Number.isFinite(v)) c.nums.push(v);
    }
  }
  const typeDistribution: Record<string, number> = {};
  const rangeBuckets: Record<string, number> = {};
  const cardinalityBuckets: Record<string, number> = {};
  for (const c of Array.from(perCol.values())) {
    // dominant type = the most frequent JS type observed for this column
    const dominant = Object.entries(c.types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'null';
    inc(typeDistribution, dominant);
    inc(cardinalityBuckets, cardinalityBucket(c.distinct.size));
    if (c.nums.length) {
      const median = c.nums.slice().sort((a, b) => a - b)[Math.floor(c.nums.length / 2)];
      inc(rangeBuckets, magnitudeBucket(median));
    }
  }
  return { columnCount: perCol.size, typeDistribution, rangeBuckets, cardinalityBuckets };
}

/** Deterministic hash of the structural features (sorted canonical form). No field names enter the hash. */
export function fingerprintHash(features: StructuralFeatures): string {
  const canon = (m: Record<string, number>) => Object.keys(m).sort().map((k) => `${k}=${m[k]}`).join(',');
  const payload = [
    `cc=${features.columnCount}`,
    `td=${canon(features.typeDistribution)}`,
    `rb=${canon(features.rangeBuckets)}`,
    `cb=${canon(features.cardinalityBuckets)}`,
  ].join(SEP);
  return createHash('sha256').update(payload).digest('hex');
}

/** Structural similarity in [0,1] between two feature sets (bucket-overlap + column-count closeness). */
export function similarity(a: StructuralFeatures, b: StructuralFeatures): number {
  const ccSim = a.columnCount === 0 && b.columnCount === 0 ? 1
    : 1 - Math.abs(a.columnCount - b.columnCount) / Math.max(a.columnCount, b.columnCount, 1);
  const overlap = (x: Record<string, number>, y: Record<string, number>): number => {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    let inter = 0, total = 0;
    for (const k of Array.from(keys)) { const xv = x[k] ?? 0, yv = y[k] ?? 0; inter += Math.min(xv, yv); total += Math.max(xv, yv); }
    return total === 0 ? 1 : inter / total;
  };
  // Weighted: column-count closeness + type/range/cardinality bucket overlap.
  return 0.25 * ccSim + 0.30 * overlap(a.typeDistribution, b.typeDistribution)
    + 0.20 * overlap(a.rangeBuckets, b.rangeBuckets) + 0.25 * overlap(a.cardinalityBuckets, b.cardinalityBuckets);
}

/** Convenience: features + hash from rows in one call. */
export function fingerprintRows(rows: Array<Record<string, unknown>>, sampleLimit = 200): { features: StructuralFeatures; hash: string } {
  const features = extractStructuralFeatures(rows, sampleLimit);
  return { features, hash: fingerprintHash(features) };
}
