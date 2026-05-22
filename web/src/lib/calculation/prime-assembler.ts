/**
 * HF-249 Phase 2 — Grammar-Aware Subtree Assembler
 *
 * Stitches a skeleton tree carrying {$ref: "chunk_N"} placeholders into a
 * complete PrimeNode tree, using the chunks object as the lookup table.
 * The output is identical in shape to what a single-call LLM emission would
 * produce — the engine input contract (Decision 151) is unchanged.
 *
 * Per IRA v2 OPTION_A: cut points are positions in a prime's structure
 * where the LLM may emit a $ref placeholder during emission. The assembler
 * uses GRAMMAR_CUT_POINTS from prime-grammar.ts to determine which children
 * of each prime carry resolvable references. No hardcoded prime knowledge.
 *
 * Trees without $ref placeholders pass through as a no-op (the assembler's
 * pathway is unified — small components and large components flow through
 * the same surface). Backward-compatible with HF-248's existing per-component
 * emissions that never used chunking.
 *
 * Failure modes (raised as typed errors so callers can map to the HF-248
 * error class taxonomy):
 *   - AssemblerUnresolvedReferenceError: a $ref points at a chunkId not in
 *     the chunks object. The LLM declared a chunk but did not emit it (or
 *     the chunk's emission truncated). Maps to `cognition_truncation`.
 *   - AssemblerCyclicReferenceError: chunk_A → chunk_B → ... → chunk_A.
 *     The reference graph forms a cycle; assembly cannot terminate. Maps
 *     to `cognition_violation`.
 *   - AssemblerOrphanChunkError: a chunkId appears in chunks but is not
 *     referenced from anywhere in the skeleton or other chunks. The LLM
 *     emitted a sub-tree but never wired it in. Maps to `cognition_violation`.
 */

import type { PrimeNode } from './intent-types';
import { GRAMMAR_CUT_POINTS, type PrimeType } from './prime-grammar';

// ──────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────

export interface RefPlaceholder {
  $ref: string;
}

/**
 * Loose tree shape that may carry RefPlaceholder children at grammar-legal
 * cut points. Each chunk's value is the same shape — chunks may themselves
 * contain $ref placeholders.
 */
export type SkeletonNode = PrimeNode | RefPlaceholder | RawSkeletonNode;

/** Pre-assembly tree shape: structurally PrimeNode-like with $ref children. */
type RawSkeletonNode = {
  prime: string;
  [key: string]: unknown;
};

export interface SkeletonWithChunks {
  tree: SkeletonNode;
  chunks: Record<string, SkeletonNode>;
}

export interface AssembleResult {
  /** Final assembled tree, free of $ref placeholders. */
  tree: PrimeNode;
  /** Total number of chunks resolved (0 when input had no $refs). */
  chunksResolved: number;
}

// ──────────────────────────────────────────────
// Errors — each maps to an HF-248 error class
// ──────────────────────────────────────────────

export class AssemblerUnresolvedReferenceError extends Error {
  constructor(public readonly chunkId: string, public readonly path: string) {
    super(`Unresolved chunk reference: $ref="${chunkId}" at ${path}. The chunk was declared but not emitted (or the chunks object is missing the key).`);
    this.name = 'AssemblerUnresolvedReferenceError';
  }
}

export class AssemblerCyclicReferenceError extends Error {
  constructor(public readonly cycle: readonly string[]) {
    super(`Cyclic chunk reference detected: ${cycle.join(' → ')}. Chunks must form a tree, not a cycle.`);
    this.name = 'AssemblerCyclicReferenceError';
  }
}

export class AssemblerOrphanChunkError extends Error {
  constructor(public readonly orphanIds: readonly string[]) {
    super(`Orphan chunk(s) in chunks object: ${orphanIds.join(', ')}. These chunkIds are never referenced from the skeleton or other chunks.`);
    this.name = 'AssemblerOrphanChunkError';
  }
}

// ──────────────────────────────────────────────
// Type guard
// ──────────────────────────────────────────────

export function isRefPlaceholder(value: unknown): value is RefPlaceholder {
  return (
    typeof value === 'object'
    && value !== null
    && '$ref' in value
    && typeof (value as { $ref: unknown }).$ref === 'string'
  );
}

// ──────────────────────────────────────────────
// Reference validation — before assembly, surface mismatches early
// ──────────────────────────────────────────────

/**
 * Collect every $ref appearing in the skeleton tree and (transitively) in
 * the chunks. Returns a set of referenced chunkIds and the map of where
 * each reference appeared (for diagnostic reporting).
 */
export function collectReferences(
  skeletonWithChunks: SkeletonWithChunks,
): { referenced: Set<string>; referencingPaths: Map<string, string> } {
  const referenced = new Set<string>();
  const referencingPaths = new Map<string, string>();

  const walk = (node: unknown, path: string): void => {
    if (isRefPlaceholder(node)) {
      referenced.add(node.$ref);
      if (!referencingPaths.has(node.$ref)) referencingPaths.set(node.$ref, path);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime as PrimeType : null;
    if (!prime) return;

    const cutPoints = GRAMMAR_CUT_POINTS[prime] ?? [];
    for (const field of cutPoints) {
      if (field in obj) walk(obj[field], `${path}.${field}`);
    }
    // Walk `inputs` arrays for primes that compose them (arithmetic / compare /
    // logical). Inputs are not cut points themselves but may CONTAIN nested
    // sub-trees that contain $refs at their own legal cut points.
    if (Array.isArray(obj.inputs)) {
      obj.inputs.forEach((child, i) => walk(child, `${path}.inputs[${i}]`));
    }
    // Walk `condition` on conditionals — not a cut point but may carry nested
    // structure with cut points deeper.
    if (prime === 'conditional' && obj.condition !== undefined) {
      walk(obj.condition, `${path}.condition`);
    }
  };

  walk(skeletonWithChunks.tree, '$');
  for (const [chunkId, chunkValue] of Object.entries(skeletonWithChunks.chunks)) {
    walk(chunkValue, `chunks.${chunkId}`);
  }

  return { referenced, referencingPaths };
}

/**
 * Validate that the skeleton's $refs match the chunks object exactly.
 * Throws when:
 *   - A $ref points at a chunkId not in chunks (unresolved)
 *   - A chunkId in chunks is never referenced (orphan)
 *
 * Cycle detection happens during resolve() walk, not here — cycles are a
 * structural property of the resolution traversal, not a reference-set
 * comparison.
 */
export function validateReferences(skeletonWithChunks: SkeletonWithChunks): void {
  const { referenced, referencingPaths } = collectReferences(skeletonWithChunks);
  const chunkIds = new Set(Object.keys(skeletonWithChunks.chunks));

  const unresolved: string[] = [];
  for (const ref of Array.from(referenced)) {
    if (!chunkIds.has(ref)) unresolved.push(ref);
  }
  if (unresolved.length > 0) {
    const firstRef = unresolved[0];
    throw new AssemblerUnresolvedReferenceError(firstRef, referencingPaths.get(firstRef) ?? '$');
  }

  const orphans: string[] = [];
  for (const chunkId of Array.from(chunkIds)) {
    if (!referenced.has(chunkId)) orphans.push(chunkId);
  }
  if (orphans.length > 0) {
    throw new AssemblerOrphanChunkError(orphans);
  }
}

// ──────────────────────────────────────────────
// Assembler
// ──────────────────────────────────────────────

/**
 * Stitch a skeleton + chunks into a complete PrimeNode tree. The input may
 * be either:
 *   - A complete tree with no $ref placeholders (small components — no-op
 *     pass-through; chunksResolved=0)
 *   - A skeleton with $ref placeholders + chunks object (large components —
 *     deterministic substitution at every cut point)
 *
 * The returned tree is a fresh object graph — the input is NOT mutated.
 */
export function assembleTree(skeletonWithChunks: SkeletonWithChunks): AssembleResult {
  // Validate references match the chunks object before walking. Surfaces
  // unresolved + orphan errors immediately with clean diagnostics.
  validateReferences(skeletonWithChunks);

  let chunksResolved = 0;
  // `resolving` tracks the chain of chunkIds currently on the resolution
  // stack. A chunkId appearing in this set during resolveRef means the
  // reference graph contains a cycle.
  const resolving = new Set<string>();
  const resolutionStack: string[] = [];

  const resolve = (node: SkeletonNode, path: string): PrimeNode => {
    if (isRefPlaceholder(node)) {
      const chunkId = node.$ref;
      if (resolving.has(chunkId)) {
        const cycle = [...resolutionStack, chunkId];
        throw new AssemblerCyclicReferenceError(cycle);
      }
      const chunk = skeletonWithChunks.chunks[chunkId];
      if (chunk === undefined) {
        // Already caught by validateReferences, but defensive.
        throw new AssemblerUnresolvedReferenceError(chunkId, path);
      }
      resolving.add(chunkId);
      resolutionStack.push(chunkId);
      try {
        chunksResolved += 1;
        return resolve(chunk, `chunks.${chunkId}`);
      } finally {
        resolving.delete(chunkId);
        resolutionStack.pop();
      }
    }

    if (node === null || typeof node !== 'object') {
      // Pass-through for primitive values (shouldn't happen at a top-level
      // walk position, but defensive).
      return node as PrimeNode;
    }

    const obj = node as Record<string, unknown>;
    const prime = typeof obj.prime === 'string' ? obj.prime as PrimeType : null;
    if (!prime) {
      // Pass-through; the validator (prime-validator) will reject this shape
      // downstream.
      return node as PrimeNode;
    }

    // Build a fresh object so the input graph isn't mutated.
    const out: Record<string, unknown> = { ...obj };

    // Recurse into grammar-declared cut points.
    const cutPoints = GRAMMAR_CUT_POINTS[prime] ?? [];
    for (const field of cutPoints) {
      if (field in obj) {
        out[field] = resolve(obj[field] as SkeletonNode, `${path}.${field}`);
      }
    }

    // Recurse into `condition` of conditional — not a cut point itself but
    // may contain nested structure with deeper cut points.
    if (prime === 'conditional' && obj.condition !== undefined) {
      out.condition = resolve(obj.condition as SkeletonNode, `${path}.condition`);
    }

    // Recurse into `inputs` arrays — same reason as condition. inputs[i]
    // is not a cut point, but inputs[i].then (when inputs[i] is a
    // conditional) is.
    if (Array.isArray(obj.inputs)) {
      out.inputs = obj.inputs.map((child, i) =>
        resolve(child as SkeletonNode, `${path}.inputs[${i}]`),
      );
    }

    return out as PrimeNode;
  };

  const tree = resolve(skeletonWithChunks.tree, '$');
  return { tree, chunksResolved };
}
