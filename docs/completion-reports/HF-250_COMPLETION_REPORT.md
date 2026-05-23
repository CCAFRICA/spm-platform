# HF-250 — Multi-Call Skeleton/Chunk Separation: Complete HF-249's Phase 3

**Branch:** `dev` (off `main @ ba4dce8e` via merge `13df479b`)
**Date:** 2026-05-23
**Scope:** Closes the gap between IRA v2 Option A specification and HF-249's implementation. Per IRA: "Call 1 — LLM emits a skeleton DAG. **Subsequent calls** emit the referenced sub-trees." HF-249 emitted skeleton + chunks in ONE response; HF-250 emits them in SEPARATE calls.

---

## Phase 1 — Skeleton-Only Emission Mode

### BEFORE — `plan_component_with_chunking` asks for skeleton + chunks together

`anthropic-adapter.ts:514` (verbatim, pre-HF-250):

```
When the calculationIntent's serialized JSON would exceed approximately 20KB ... emit
the tree with `{"$ref": "chunk_N"}` placeholders at GRAMMAR-LEGAL CUT POINTS, and a
sibling `chunks` object containing the sub-trees keyed by chunk_id. The platform's
deterministic assembler stitches the chunks into a single PrimeNode tree before
validation and persistence.
```

Production evidence (2026-05-23 01:27-01:30): `[plan-component] FAILED component=colocacion-credito errClass=cognition_truncation attempt=1/1 latencyMs=64430 message=JSON parse failed at position 23609`. The truncation position shifted from HF-249's 28799 to HF-250-pre's 23609 — confirming the new task type fired but the combined skeleton + chunks emission STILL exceeded `max_tokens`. No `[plan-component] HF-249 multi-call fallback` log line — because the whole response was an unparseable truncated stream, the orchestrator never saw a valid skeleton from which to extract missing chunk_ids.

### AFTER — skeleton-ONLY emission, separate per-chunk calls

`anthropic-adapter.ts` (post-HF-250 — verbatim excerpt):

```
plan_component_with_chunking: `You are emitting the SKELETON of one plan component's Prime-DAG calculationIntent.

MODE: SKELETON_ONLY

This call returns ONLY the structural skeleton tree. Each leaf-bearing sub-tree is
replaced by a `{"$ref": "chunk_<id>"}` placeholder at a GRAMMAR-LEGAL CUT POINT. A
SEPARATE LLM call is fired in parallel for EACH $ref to emit that chunk's content.
DO NOT include a `chunks` field in this response — chunks come from the per-chunk calls.

This separation exists because the combined skeleton + chunks emission exceeded the LLM
output token budget for large components (HF-249 verification 2026-05-23: BCL C0 30-cell
matrix truncated at JSON position 23609 when chunks were emitted inline). Splitting the
calls means each call's output stays well under budget.

...

LEGAL CUT POINTS — positions where a sub-tree MUST be replaced by a `{"$ref": "chunk_<id>"}` placeholder:
  conditional.then         (numeric subtree)
  conditional.else         (numeric subtree)
  filter.downstream        (numeric subtree)
  scope.downstream         (numeric subtree)
  prior_period.downstream  (numeric subtree)

DECOMPOSITION GUIDANCE — emit a $ref at EVERY legal cut point whose downstream content
carries multiple leaves or nested conditionals. For an N×M 2D band-lookup matrix: the
outer conditional structure (row selection) is emitted inline in the skeleton, with each
then/else branch carrying a $ref to a per-row chunk that handles the column selection.
This produces ~N chunks (one per row), each containing ~M leaves — every chunk fits
comfortably in the per-call budget.

[Example skeleton — illustrative]

Response shape:
{
  "id": "...",
  "calculationIntent": { /* skeleton with $ref placeholders */ },
  "expectedChunkIds": ["chunk_row_120plus", "chunk_row_100_120", "chunk_row_below_100"],
  ...
}

DO NOT include a `chunks` field — chunks come from separate calls.
```

The `plan_chunk` system prompt was also tightened (verbatim, post-HF-250):

```
plan_chunk: `You are emitting ONE sub-tree of a plan component's Prime-DAG calculationIntent.

The parent component's skeleton call declared this chunk_id at the supplied skeletonPath.
THIS call returns the complete sub-tree that fills that position.

CRITICAL: This sub-tree is COMPLETE — it carries every leaf value the source describes
for this position. NOT a fragment.

IMPORTANT: DO NOT emit `{"$ref": "..."}` placeholders inside this sub-tree. This chunk
must be COMPLETE — fully expanded, no nested references.

Response shape:
{
  "chunkId": "<echo from the request>",
  "subtree": { /* complete sub-tree, no $refs */ },
  "confidence": 0-100,
  "reasoning": "How you extracted this chunk"
}

DO NOT include a `chunks` field.
```

Korean Test compliant — only grammar-structural cut points (mirroring `GRAMMAR_CUT_POINTS` from HF-249 Phase 1), no compensation pattern vocabulary, no language-specific literals.

---

## Phase 2 — Per-Chunk Emission Calls Wired Through

The HF-249 `plan_chunk` task type and `fetchChunksInParallel` helper EXISTED but were never reached in production because the orchestrator's parseError branch fired before the chunk-detection logic. HF-250 closes this gap by making `plan_component_with_chunking` always return a parseable skeleton (skeleton-only — small response, never truncates).

### Mode A — direct emission (small components)

`plan-orchestration.ts` (verbatim, post-HF-250):

```typescript
const resp = useChunking
  ? await aiService.interpretPlanComponentWithChunking(
      args.documentContent, args.format, spec, args.signalContext, args.pdfBase64, args.pdfMediaType,
    )
  : await aiService.interpretPlanComponent(
      args.documentContent, args.format, spec, args.signalContext, args.pdfBase64, args.pdfMediaType,
    );
```

When `useChunking === false`, the orchestrator calls `interpretPlanComponent` (HF-248 task — backward compatible). The LLM emits a complete tree in a single call; `collectReferences` returns zero `$refs`; the assembler is a no-op; the validator runs against the original tree.

### Mode B — skeleton + parallel chunks (large components)

When `useChunking === true`, the orchestrator calls `interpretPlanComponentWithChunking` (HF-250 prompt = SKELETON_ONLY). The LLM emits a small skeleton with `$ref` placeholders and no chunks field. The orchestrator's existing post-response logic (HF-249 Phase 3, never previously reached in production) now fires every Mode B run:

```typescript
const refsBefore = collectReferences(skeletonWithChunks);
const missingChunkIds = Array.from(refsBefore.referenced).filter(id => !(id in chunks));
if (missingChunkIds.length > 0) {
  console.log(`[plan-skeleton-only] component=${spec.id} skeleton parsed — ${refsBefore.referenced.size} $refs found`);
  console.log(`[plan-chunk] FIRING parallel chunks: [${missingChunkIds.join(', ')}]`);
  const fetched = await fetchChunksInParallel(args, spec, missingChunkIds, refsBefore.referencingPaths);
  for (const [id, subtree] of Object.entries(fetched)) {
    (chunks as Record<string, unknown>)[id] = subtree as unknown;
  }
  console.log(`[plan-assembler] component=${spec.id} chunksResolved=${Object.keys(chunks).length}/${refsBefore.referenced.size}`);
}
const assembleResult = assembleTree(skeletonWithChunks);
```

`fetchChunksInParallel` (HF-249 Phase 3 — unchanged) fires `interpretPlanChunk` calls via `Promise.allSettled`. Each chunk's retry policy is HF-248's existing error class taxonomy.

### Assembler error mapping (HF-249 Phase 2 — unchanged)

```typescript
} catch (asmErr) {
  if (asmErr instanceof AssemblerUnresolvedReferenceError) {
    lastErrClass = 'cognition_truncation';
  } else if (asmErr instanceof AssemblerCyclicReferenceError) {
    lastErrClass = 'cognition_violation';
  } else if (asmErr instanceof AssemblerOrphanChunkError) {
    lastErrClass = 'cognition_violation';
  } else {
    lastErrClass = 'unknown';
  }
  ...
}
```

---

## Phase 3 — Orchestrator Mode Selection

### `shouldUseChunking` heuristic (verbatim)

```typescript
/**
 * HF-250 Phase 3: mode-selection heuristic for the per-component call.
 *
 * Mode A (direct emission): small components emit a complete tree via the
 * HF-248 plan_component task. Backward-compatible with all components that
 * succeeded pre-HF-249.
 *
 * Mode B (skeleton + per-chunk): large components emit a skeleton via the
 * HF-250 plan_component_with_chunking task (now SKELETON_ONLY mode), then
 * the orchestrator fires plan_chunk LLM calls in parallel for each $ref
 * and the assembler stitches them.
 *
 * Korean Test compliant: the heuristic uses STRUCTURAL signals only
 * (rateTableCellCount from the skeleton call, complexityHint extension
 * point). No domain vocabulary. Threshold is conservative — borderline
 * components route to Mode B (multiple small calls always succeed; one
 * large call may truncate).
 */
function shouldUseChunking(spec: PerComponentCallArgs['componentSpec']): boolean {
  if (typeof spec.rateTableCellCount === 'number' && spec.rateTableCellCount > 15) return true;
  return false;
}
```

Threshold rationale: 15-cell tables fit comfortably in 8192 token budget. Above 15, the safer choice is Mode B (multiple small calls). Below or equal to 15, Mode A is more efficient (1 call vs N+1). The threshold is conservative — borderline components route to Mode B.

### Mode dispatch log line

`[plan-component] mode=A-direct component=... rateTableCellCount=(absent)` — small components, single call.
`[plan-component] mode=B-skeleton-with-chunks component=... rateTableCellCount=30` — large components, parallel chunk calls.

The mode is logged BEFORE the LLM call so production logs distinguish whether HF-250 dispatched correctly.

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

No new TypeScript errors. HF-238 / HF-244 / HF-247 / HF-248 / HF-249 API surfaces preserved. Mode A path uses unchanged `interpretPlanComponent`; Mode B path uses HF-249 `interpretPlanComponentWithChunking` (prompt restructured) + `interpretPlanChunk` (prompt tightened) + `fetchChunksInParallel` (unchanged).

### Architect-manual verification

After production deployment of HF-250 (per SR-43 BUILD AND DEPLOY):

1. Clean-slate BCL via SQL (HF-247 procedure).
2. Import BCL plan file through the browser.
3. Capture from Vercel production logs:
   - `[plan-skeleton]` (HF-248 — Phase A skeleton call with component index)
   - For C1/C2/C3 (small components, `rateTableCellCount <= 15`):
     - `[plan-component] mode=A-direct component=<id> ...`
     - `[plan-component] SUCCESS component=<id> ... (direct mode)`
   - For C0 (30-cell matrix, `rateTableCellCount = 30`):
     - `[plan-component] mode=B-skeleton-with-chunks component=colocacion-credito rateTableCellCount=30`
     - `[plan-skeleton-only] component=colocacion-credito skeleton parsed — N $refs found`
     - `[plan-chunk] FIRING parallel chunks: [chunk_1, chunk_2, ...]`
     - `[plan-chunk] SUCCESS chunk_id=<id> latencyMs=<ms>` × N
     - `[plan-assembler] component=colocacion-credito chunksResolved=N/N`
     - `[plan-component] SUCCESS component=colocacion-credito ... chunksResolved=N (multi-call mode)`
   - Final `[SCI plan-interp] Batched plan saved: ... 8 components` (4 per variant × 2 variants)

If C0 still fails after HF-250:
- **Chunks themselves truncate** → cut points insufficient at the row level; the prompt's decomposition guidance needs to push to finer (per-cell?) chunks. Follow-on HF.
- **Chunks succeed but assembler rejects** → LLM emitted nested `$ref` placeholders inside chunks (the prompt forbids this; if violated, prompt tightening).
- **Skeleton call truncates** → the skeleton itself is too large; component-level decomposition is needed (different architectural layer). Should not occur for typical plans because skeletons carry no leaves.

### Calculation verification

After all 8 components persist (including complete C0):
1. Import personnel template and data files
2. Calculate October
3. Report `componentTotals` and `Grand total` verbatim

Architect reconciles against GT $44,590 October.

### Architect-fill placeholders

| Line | Value |
|---|---|
| `[plan-component] mode=B-skeleton-with-chunks component=colocacion-credito` | _verbatim line_ |
| `[plan-chunk] SUCCESS` count for C0 | _N chunks_ |
| Final `[SCI plan-interp] Batched plan saved` | _verbatim — must show 8 components_ |
| BCL October grand total | _$..._ |

---

## HALT conditions

| ID | Condition | Status |
|---|---|---|
| HALT-1 | Mode-selection misclassifies components | Cleared. Mode is logged explicitly via `[plan-component] mode=...` line; not LLM-inferred. |
| HALT-2 | Rate-limit on parallel chunks (HTTP 429) | Unmitigated for initial implementation; `Promise.allSettled` fires all in parallel. If 429s observed in production, follow-on HF adds concurrency gate. |
| HALT-3 | Nested refs in chunk emission | `plan_chunk` prompt explicitly forbids; assembler raises `AssemblerUnresolvedReferenceError` if violated → `cognition_truncation` per existing taxonomy. |
| HALT-4 | C0 chunks themselves truncate after split | TBD on architect-manual. If yes, follow-on HF tightens decomposition guidance (force per-cell chunks). |
| HALT-5 | Validator rejects assembled tree | Existing `exhaustive_emission` check counts leaves across the assembled tree (HF-244 Phase 2 unchanged). If `rateTableCellCount` is declared and the assembled tree has fewer leaves, the validator throws — surfaces as `cognition_truncation`. |
| HALT-6 | Mode A regression for small components | Cleared. Mode A path uses unchanged `interpretPlanComponent` (HF-248 task); no semantic change to the small-component pathway. |

---

## Files changed

Phase 1:
- `web/src/lib/ai/providers/anthropic-adapter.ts` — `plan_component_with_chunking` system prompt restructured to SKELETON_ONLY emission; `plan_chunk` system prompt tightened (no nested refs).

Phases 2-3:
- `web/src/lib/sci/plan-orchestration.ts` — `shouldUseChunking` heuristic; `callPlanComponentWithRetry` mode dispatch (A=direct via interpretPlanComponent / B=skeleton+chunks via interpretPlanComponentWithChunking + fetchChunksInParallel); diagnostic log lines for mode + skeleton + chunk + assembler + final mode-aware SUCCESS.

Phase 4:
- `docs/completion-reports/HF-250_COMPLETION_REPORT.md` (this file).

---

## Out of scope

- Calculation engine (OB-200, HF-244, HF-247, HF-248, HF-249) — unchanged.
- C2/C3 validator warnings (scale_annotation, terminal_completeness) — separate HF to elevate to critical.
- CRP and Meridian verification — same orchestration applies after BCL succeeds.
- Async progress polling (HF-248 Phase 4 deferred) — multi-call parallel emission should keep typical latencies under fetch timeout.
- Template library (HF-249 Option E Phase 2) — future HF.
- Recursive chunking (chunk has its own refs) — follow-on if a single chunk still exceeds budget post-HF-250. Assembler already supports recursion via `resolveNode`; prompt would need to teach the LLM that chunks may chunk.
- Concurrency gate for parallel chunks (HALT-2) — follow-on if production shows 429 errors.

## Residuals

- Mode B always issues 1 + N LLM calls (skeleton + N chunks). For a 30-cell matrix → 1 skeleton + ~6 chunks = 7 calls. Acceptable given the alternative (single call that truncates).
- Threshold `rateTableCellCount > 15` is conservative. Some 11-15 cell components may succeed in Mode A but route to Mode B; cost is the extra calls.
- Component-level decomposition (splitting one logical component into multiple subcomponents) is not in scope. A 1000-cell matrix in a SINGLE component still produces 1000+ chunks; if the skeleton emission itself can't fit the structural decomposition declaration, that's a different layer.

---

## BUILD AND DEPLOY (per SR-43)

Subsequent sections of this report (filled by CC at end of Phase 4):
- PR creation
- PR squash-merge
- Vercel production deployment verification
- Dev sync with main
