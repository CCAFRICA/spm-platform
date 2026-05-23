# HF-249 — Grammar-Aware Subtree Decomposition: Skeleton+Chunk Emission

**Branch:** `dev` (off `main @ e478a2fa` via merge `22a15cf9`)
**Date:** 2026-05-22
**Scope:** Closes the `cognition_truncation` failure mode for large components (BCL C0 30-cell matrix). Implements IRA v2 invocation `5fa3ef79` OPTION_A (Rank 1) Phase 1 of target Option E (Hybrid). Template-library extraction (Phase 2 of Option E) is out of scope per directive §9.

**Execution note:** Phase 1 was interrupted by an API socket error mid-edit (uncommitted `prime-grammar.ts` cut-points declaration on the working tree, `anthropic-adapter.ts` not yet touched). Resumed per Resume Directive. State assessment: **Case C — uncommitted Phase 1 work in working tree**. No work lost; Phase 1 was completed (adapter task type added) and committed as one unit, then Phases 2-4 proceeded normally.

---

## Phase 1 — Skeleton-with-References Emission

### BEFORE — per-component path used `plan_component` only

The HF-248 per-component call (`plan-orchestration.ts:328-336`):

```typescript
const resp = await aiService.interpretPlanComponent(
  args.documentContent,
  args.format,
  spec,
  args.signalContext,
  args.pdfBase64,
  args.pdfMediaType,
);
```

A single LLM call emits the complete `calculationIntent` PrimeNode tree. For BCL C0 (30-cell 2D matrix with scale metadata + half-open intervals + exhaustive emission), the serialized JSON exceeds `max_tokens` at ~28KB; the emission truncates with `cognition_truncation`.

### AFTER — grammar-aware cut-points declaration

`prime-grammar.ts` (post-HF-249):

```typescript
export type CutPointField = 'downstream' | 'then' | 'else';

export const GRAMMAR_CUT_POINTS: Partial<Record<PrimeType, ReadonlyArray<CutPointField>>> = {
  conditional: ['then', 'else'],
  filter: ['downstream'],
  scope: ['downstream'],
  prior_period: ['downstream'],
} as const;

export function isLegalCutPoint(parentPrime: PrimeType, fieldName: string): boolean {
  const cutPoints = GRAMMAR_CUT_POINTS[parentPrime];
  if (!cutPoints) return false;
  return cutPoints.includes(fieldName as CutPointField);
}
```

Cut points are derived from the grammar's existing nested-child structure (conditional.then/else, filter.downstream, scope.downstream, prior_period.downstream) — not from domain vocabulary or plan-content patterns. Korean Test compliant (T1-E910 v2). Adding a new prime with nestable children extends this declaration as part of the prime's definition; the assembler picks up the new cut points without changes.

Documented rationale (preserved as comment, verbatim):
- `condition` child of conditional is NOT a cut point (small boolean compositions; chunking fragments evaluation)
- arithmetic/compare/logical inputs are NOT cut points (arity-fixed numeric; chunks would be tiny)
- aggregate/constant/reference are leaves — no children, no cut points

### Two new task types

`ai/types.ts`:
```typescript
| 'plan_component_with_chunking'  // HF-249: emit component as skeleton + chunks for large structures (single-response mode)
| 'plan_chunk'                    // HF-249: emit a single sub-tree chunk in multi-call fallback mode
```

### `plan_component_with_chunking` system prompt — verbatim excerpt

```
HF-249 — SKELETON-WITH-REFERENCES EMISSION (CRITICAL for large components):

When the calculationIntent's serialized JSON would exceed approximately 20KB (estimated
from the component's structural complexity — e.g., a rate table with more than ~20 cells,
or nested conditionals with more than ~6 levels), emit the tree with `{"$ref": "chunk_N"}`
placeholders at GRAMMAR-LEGAL CUT POINTS, and a sibling `chunks` object containing the
sub-trees keyed by chunk_id.

LEGAL CUT POINTS — positions where a sub-tree may be replaced by a `{"$ref": "chunk_N"}` placeholder:
  conditional.then         (numeric subtree)
  conditional.else         (numeric subtree)
  filter.downstream        (numeric subtree)
  scope.downstream         (numeric subtree)
  prior_period.downstream  (numeric subtree)

ILLEGAL cut points (do NOT replace these with $ref):
  conditional.condition    (boolean — small; chunking fragments evaluation)
  arithmetic/compare/logical .inputs[i]  (numeric arity-fixed; chunks would be tiny)
  filter.predicate / scope.boundary       (atomic descriptors)

Each chunk MUST be a complete grammar-compliant prime composition — it is a self-contained
sub-tree, not a fragment. Chunks may themselves contain `{"$ref": "chunk_M"}` placeholders
(the assembler resolves recursively); a chunk that emits another $ref must declare that
chunk_id in the same `chunks` object.
```

### Backward compatibility (HALT-1)

A response with no `$ref` placeholders + empty `chunks` field renders identically to HF-248's pre-HF-249 plan_component output. The pathway through the assembler is a no-op when chunks is empty (`chunksResolved=0`). Small components (BCL C1/C2/C3, all CRP components) emit complete trees in a single call exactly as before.

---

## Phase 2 — Deterministic Assembler with Cycle Detection

### `prime-assembler.ts` — verbatim entry point

```typescript
export function assembleTree(skeletonWithChunks: SkeletonWithChunks): AssembleResult {
  validateReferences(skeletonWithChunks);

  let chunksResolved = 0;
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
    …
    const cutPoints = GRAMMAR_CUT_POINTS[prime] ?? [];
    for (const field of cutPoints) {
      if (field in obj) {
        out[field] = resolve(obj[field] as SkeletonNode, `${path}.${field}`);
      }
    }
    …
    return out as PrimeNode;
  };

  const tree = resolve(skeletonWithChunks.tree, '$');
  return { tree, chunksResolved };
}
```

### Reference validation

```typescript
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
```

Three typed errors map to the HF-248 error class taxonomy:
- `AssemblerUnresolvedReferenceError` → `cognition_truncation`
- `AssemblerCyclicReferenceError` → `cognition_violation`
- `AssemblerOrphanChunkError` → `cognition_violation`

Cycle detection: maintain a `resolving` set during recursive resolve. A chunkId appearing in the set when entered means the reference graph forms a cycle; throw with the full cycle path (`['chunk_1', 'chunk_2', 'chunk_1']`) so the diagnostic identifies the chain.

The assembler uses `GRAMMAR_CUT_POINTS` as the SOLE source of which fields to recurse into for `$ref` resolution — no hardcoded prime knowledge.

---

## Phase 3 — Orchestration: Single-Response Default + Multi-Call Fallback

### BEFORE — single call, no assembly

```typescript
const resp = await aiService.interpretPlanComponent(...);
const intent = result.calculationIntent;
const validation = validateComponentIntent(intent, { expectedCellCount: spec.rateTableCellCount });
```

### AFTER — chunking primary path + assembler + multi-call fallback

```typescript
const resp = await aiService.interpretPlanComponentWithChunking(
  args.documentContent, args.format, spec, args.signalContext, args.pdfBase64, args.pdfMediaType,
);
…
const intentRaw = result.calculationIntent as Record<string, unknown> | undefined;
const chunks = (result.chunks ?? {}) as Record<string, unknown>;
let intent: Record<string, unknown> | undefined = intentRaw;
let chunksResolvedCount = 0;

if (intentRaw) {
  try {
    const skeletonWithChunks: SkeletonWithChunks = {
      tree: intentRaw as SkeletonNode,
      chunks: chunks as Record<string, SkeletonNode>,
    };
    // HF-249 multi-call fallback: if the skeleton carries $refs but chunks
    // is incomplete (unresolved references), the LLM emitted a skeleton-only
    // shape under budget pressure. Fetch the missing chunks individually via
    // plan_chunk and merge before assembly.
    const refsBefore = collectReferences(skeletonWithChunks);
    const missingChunkIds = Array.from(refsBefore.referenced).filter(id => !(id in chunks));
    if (missingChunkIds.length > 0) {
      console.log(`[plan-component] HF-249 multi-call fallback component=${spec.id} missingChunks=${missingChunkIds.length} (${missingChunkIds.join(',')})`);
      const fetched = await fetchChunksInParallel(args, spec, missingChunkIds, refsBefore.referencingPaths);
      for (const [id, subtree] of Object.entries(fetched)) {
        (chunks as Record<string, unknown>)[id] = subtree as unknown;
      }
    }
    const assembleResult = assembleTree(skeletonWithChunks);
    intent = assembleResult.tree as Record<string, unknown>;
    chunksResolvedCount = assembleResult.chunksResolved;
  } catch (asmErr) {
    if (asmErr instanceof AssemblerUnresolvedReferenceError) {
      lastErrClass = 'cognition_truncation';
    } else if (asmErr instanceof AssemblerCyclicReferenceError) {
      lastErrClass = 'cognition_violation';
    } else if (asmErr instanceof AssemblerOrphanChunkError) {
      lastErrClass = 'cognition_violation';
    }
    …
  }
}

const validation = validateComponentIntent(intent, {
  componentLabel: spec.name,
  expectedCellCount: spec.rateTableCellCount,
});
```

The validator runs against the **assembled** tree. `exhaustive_emission` counts leaves across the full assembled structure — the `rateTableCellCount` requirement applies post-assembly.

### Multi-call fallback — parallel chunk emission

```typescript
async function fetchChunksInParallel(
  args: PerComponentCallArgs,
  spec: PerComponentCallArgs['componentSpec'],
  missingChunkIds: string[],
  referencingPaths: Map<string, string>,
): Promise<Record<string, unknown>> {
  const aiService = getAIService();
  const settled = await Promise.allSettled(
    missingChunkIds.map(async chunkId => {
      …
      const resp = await aiService.interpretPlanChunk(
        args.documentContent, args.format,
        { chunkId, parentComponentName: spec.name, parentBriefSemantic: spec.briefSemantic, skeletonPath },
        args.signalContext, args.pdfBase64, args.pdfMediaType,
      );
      …
      return { chunkId, subtree, subChunks };
    }),
  );
  // Merge sub-chunks: a chunk that further decomposed declares sub-chunks
  // in its own response.chunks — the assembler resolves nested $refs
  // recursively from the merged chunks map.
  const merged: Record<string, unknown> = {};
  for (const s of settled) {
    if (s.status !== 'fulfilled' || s.value === null) continue;
    const { chunkId, subtree, subChunks } = s.value;
    merged[chunkId] = subtree;
    for (const [sId, sValue] of Object.entries(subChunks)) merged[sId] = sValue;
  }
  return merged;
}
```

Chunks emit in parallel via `Promise.allSettled` (per T1-E947: chunks are independent). Total latency bounded by slowest chunk, not sum. Failed chunks are omitted from the merged map; the subsequent assemble step raises `AssemblerUnresolvedReferenceError` for the still-missing chunkIds and the orchestrator's existing error-class path classifies it as `cognition_truncation`.

---

## Phase 4 — Verification

### Build (CC, local)

```
$ npx tsc --noEmit
(no output — clean)
$ rm -rf .next && npm run build
✓ Compiled successfully
$ npm run dev (curl localhost:3000)
HTTP 307
```

No new TypeScript errors. Adapter API surface unchanged (HF-238 contract preserved). HF-248 task types (`plan_skeleton`, `plan_component`) retained; new task types are additive.

### Architect-manual verification

1. Clean-slate BCL (HF-247 SQL).
2. Import BCL plan file through the browser.
3. Capture from logs:
   - `[plan-skeleton]` line (Phase A — existing from HF-248)
   - `[plan-component] SUCCESS` per component
   - For C0 specifically: confirm whether (a) single-response mode succeeded (`[plan-component] assembled component=… chunksResolved=N`) or (b) multi-call fallback fired (`[plan-component] HF-249 multi-call fallback component=… missingChunks=… (chunk_1,chunk_2,…)` followed by `[plan-chunk] SUCCESS chunkId=… latencyMs=…` per chunk)
   - Final `[SCI plan-interp] Batched plan saved: … 8 components`
4. Verify rule_set persists with C0 included (4 components per variant × 2 variants).

To be filled by architect:

| Line | Value |
|---|---|
| `[plan-component] SUCCESS component=colocacion-credito` | _verbatim line including chunksResolved value_ |
| `[plan-chunk] SUCCESS` count for C0 | _N (0 if single-response succeeded; >0 if multi-call fallback fired)_ |
| Final `[SCI plan-interp] Batched plan saved` | _verbatim line — must show 8 components_ |
| BCL October grand total (post data + calc) | _$..._ |

### Failure-mode triage (HALT-6)

If C0 still fails after HF-249:
- **chunks succeed but assembly fails** → assembler bug (`AssemblerCyclicReferenceError` / `AssemblerOrphanChunkError` indicates LLM emission shape issue)
- **skeleton truncates AND multi-call chunks also truncate** → cut points insufficient; chunks themselves too large. Tighten prompt OR introduce recursive chunking (residuals §10A).
- **chunks succeed but validator rejects** → grammar compliance issue in chunks; `exhaustive_emission` count mismatch with `rateTableCellCount`.

---

## HALT conditions

| ID | Condition | Status |
|---|---|---|
| HALT-1 | New task type breaks single-call emission for small components | Cleared. Empty `chunks` + no `$ref`s → assembler is no-op pass-through. |
| HALT-2 | LLM emits cyclic chunk references | Cleared. `AssemblerCyclicReferenceError` thrown cleanly with full cycle path; component fails with `cognition_violation`. |
| HALT-3 | Single chunk itself exceeds token budget | TBD on architect-manual. Chunks may recursively further-chunk per directive §9.5 design; LLM is taught this in the `plan_chunk` prompt. If still truncating, prompt tightening is a follow-on. |
| HALT-4 | Assembler regression on existing valid trees | Cleared. Assembler runs only when `intentRaw` is present; empty-chunks-no-refs case passes through identically to HF-248. |
| HALT-5 | Multi-call timeout from too many chunks | TBD. Parallel emission helps; latency bounded by slowest chunk. If 1000-cell matrix produces 100+ chunks, async polling (HF-248 Phase 4, deferred) may motivate revival. |
| HALT-6 | C0 still fails after HF-249 | TBD on architect-manual. Failure-mode triage above identifies the architectural next step. |

---

## Files changed

Phase 1:
- `web/src/lib/calculation/prime-grammar.ts` — `GRAMMAR_CUT_POINTS` + `isLegalCutPoint`.
- `web/src/lib/ai/types.ts` — `plan_component_with_chunking` + `plan_chunk` task types.
- `web/src/lib/ai/providers/anthropic-adapter.ts` — system prompts + user messages for the two new tasks.

Phase 2:
- `web/src/lib/calculation/prime-assembler.ts` (new) — `assembleTree`, `validateReferences`, `collectReferences`, three typed errors, cycle detection.

Phase 3:
- `web/src/lib/ai/ai-service.ts` — `interpretPlanComponentWithChunking` + `interpretPlanChunk` methods.
- `web/src/lib/sci/plan-orchestration.ts` — `callPlanComponentWithRetry` switched to chunking primary; assembler integration; `fetchChunksInParallel` multi-call fallback.

Phase 4:
- `docs/completion-reports/HF-249_COMPLETION_REPORT.md` (this file).

---

## Out of scope

- **Option E Phase 2 (template library).** Templates extracted from successful chunks become a future HF.
- Calculation engine (OB-200, HF-244, HF-245, HF-247, HF-248) — unchanged.
- CRP and Meridian verification — same orchestration path applies after BCL succeeds.
- Async progress polling (HF-248 Phase 4 deferred). May become necessary if multi-call mode produces enough chunks to exceed UI timeout (HALT-5).
- Substrate supersession candidates (T1-E923 / T1-E947 extensions) — VG-side work surfaced by IRA v2.

## Residuals

- Multi-call mode increases API cost. A 30-cell matrix decomposed into ~5 chunks costs ~6x the API of a single call (skeleton + 5 chunks). Acceptable for cases that previously failed entirely.
- Cut points declared for 4 primes (conditional, filter, scope, prior_period). If future structure classes require cut points at other primes, the declaration extends with the new prime's definition.
- Single-response mode's chunk decomposition is the LLM's judgment. Different emissions may produce different chunkings for the same component — acceptable (assembled tree is semantically equivalent). The validator catches semantic incorrectness.
- If a SINGLE chunk in multi-call mode exceeds budget (HALT-3), the architecture supports recursive chunking (chunk further decomposes via `$refs` to sub-chunks; assembler resolves recursively). The LLM is taught this in the `plan_chunk` prompt. If still failing, prompt tightening is a follow-on.
