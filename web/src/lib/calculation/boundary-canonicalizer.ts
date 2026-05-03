/**
 * HF-196 Phase 1G-15 — Decision 127 structural enforcement.
 *
 * Canonicalizes AI-emitted boundary arrays into half-open partition form per
 * Decision 127 (LOCKED 2026-03-16): "All tier, matrix, and band resolution in
 * the calculation engine uses half-open intervals: [min, max) — inclusive
 * lower bound, exclusive upper bound. The final band in any sequence uses
 * inclusive upper bound [min, max] to capture the ceiling."
 *
 * Replaces OB-169 .999 snap heuristic. Validates contiguous partition;
 * normalizes inclusive-end emissions to half-open; rejects structurally
 * malformed boundaries with named error.
 *
 * Korean Test (T1-E910): operates on structural boundary primitive (min, max,
 * minInclusive, maxInclusive). No domain literals. No customer vocabulary.
 */

import type { Boundary } from './intent-types';

export class BoundaryCanonicalizationError extends Error {
  constructor(
    public readonly boundaryIndex: number,
    public readonly diagnosis: string,
    public readonly boundaries: readonly Boundary[],
  ) {
    super(`Boundary canonicalization failed at index ${boundaryIndex}: ${diagnosis}`);
    this.name = 'BoundaryCanonicalizationError';
  }
}

/**
 * Canonicalize a boundary array to half-open form per Decision 127.
 *
 * Pre-conditions:
 *   - boundaries.length >= 1
 *   - boundaries pre-sortable by min (function sorts internally)
 *
 * Post-conditions:
 *   - For i < length - 1: boundaries[i].maxInclusive === false
 *   - For i < length - 1: boundaries[i].max === boundaries[i+1].min
 *   - boundaries[length - 1] either { max: null } or { maxInclusive: true }
 *
 * Throws BoundaryCanonicalizationError on:
 *   - empty input
 *   - non-final boundary with max: null
 *   - non-first boundary with min: null
 *   - overlap (current.max > next.min)
 *   - gap too large to auto-close (relativeGap > 0.05)
 */
export function canonicalizeBoundaries(input: readonly Boundary[]): Boundary[] {
  if (!input || input.length === 0) {
    throw new BoundaryCanonicalizationError(-1, 'empty boundary array', input ?? []);
  }

  // Sort by min ascending; preserve null mins at the front (first boundary may have min=null)
  const sorted = [...input].sort((a, b) => {
    const aMin = a.min ?? -Infinity;
    const bMin = b.min ?? -Infinity;
    return aMin - bMin;
  });

  const canonical: Boundary[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current: Boundary = { ...sorted[i] };
    const isLast = i === sorted.length - 1;

    if (isLast) {
      // Final boundary: open-ended (max=null) OR inclusive ceiling (maxInclusive=true)
      if (current.max === null) {
        canonical.push(current);
        break;
      }
      if (current.maxInclusive !== true) {
        current.maxInclusive = true;
      }
      canonical.push(current);
      break;
    }

    // Non-final boundary: must be half-open with max === next.min
    const next = sorted[i + 1];
    const nextMin = next.min;

    if (current.max === null) {
      throw new BoundaryCanonicalizationError(
        i,
        'non-final boundary has max: null (only the final boundary may be open-ended)',
        input,
      );
    }
    if (nextMin === null) {
      throw new BoundaryCanonicalizationError(
        i + 1,
        'non-first boundary has min: null',
        input,
      );
    }

    // Force half-open semantics on non-final boundaries
    current.maxInclusive = false;

    if (current.max < nextMin) {
      // Gap detected — auto-close by snapping current.max to next.min
      // Relative-gap tolerance: gap must be small (<= 5% of value scale)
      // Larger gaps suggest structurally malformed plan; reject
      const gap = nextMin - current.max;
      const scale = Math.max(Math.abs(current.max), Math.abs(nextMin), 1);
      const relativeGap = gap / scale;
      if (relativeGap > 0.05) {
        throw new BoundaryCanonicalizationError(
          i,
          `boundary gap too large to auto-close: max=${current.max}, next.min=${nextMin}, gap=${gap}, relativeGap=${relativeGap.toFixed(4)}`,
          input,
        );
      }
      current.max = nextMin;
    } else if (current.max > nextMin) {
      throw new BoundaryCanonicalizationError(
        i,
        `boundary overlap: max=${current.max} > next.min=${nextMin}`,
        input,
      );
    }
    // current.max === nextMin: already canonical

    canonical.push(current);
  }

  return canonical;
}

/**
 * Validate canonical form (post-canonicalization invariant check).
 * Throws BoundaryCanonicalizationError if boundaries do not form a valid
 * half-open partition.
 */
export function assertCanonicalBoundaries(boundaries: readonly Boundary[]): void {
  if (!boundaries || boundaries.length === 0) {
    throw new BoundaryCanonicalizationError(-1, 'empty boundary array', boundaries ?? []);
  }
  for (let i = 0; i < boundaries.length - 1; i++) {
    const b = boundaries[i];
    const next = boundaries[i + 1];
    if (b.max === null) {
      throw new BoundaryCanonicalizationError(i, 'non-final boundary has max: null', boundaries);
    }
    if (b.maxInclusive !== false) {
      throw new BoundaryCanonicalizationError(i, 'non-final boundary not half-open (maxInclusive should be false)', boundaries);
    }
    if (b.max !== next.min) {
      throw new BoundaryCanonicalizationError(i, `discontinuous partition: max=${b.max} !== next.min=${next.min}`, boundaries);
    }
  }
  const last = boundaries[boundaries.length - 1];
  if (last.max !== null && last.maxInclusive !== true) {
    throw new BoundaryCanonicalizationError(
      boundaries.length - 1,
      'capped final boundary must be maxInclusive: true',
      boundaries,
    );
  }
}
