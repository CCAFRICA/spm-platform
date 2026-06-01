# HF-249: Grammar-Aware Subtree Decomposition — Skeleton+Chunk Emission

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-41 (revert discipline), Rules 25-28 (completion report), Rule 29 (CC paste LAST).
Decisions: 127 (half-open), 151 (intent executor sole authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).
IRA disposition: this HF implements IRA v2 invocation `5fa3ef79` Option A (`OPTION_A_GRAMMAR_AWARE_SUBTREE_DECOMPOSITION`, Rank 1) as Phase 1 of target Option E (Hybrid). Template library extraction (Phase 2) is OUT OF SCOPE for this HF.

---

## §1 Problem Statement

HF-248 introduced per-component plan interpretation. Production verification confirmed per-component decomposition works for components within token budget. C1/C2/C3 of BCL emit successfully in 6-21s each. But C0 (Credit Placement, 6×5 = 30-cell 2D fixed-output band lookup) fails with `cognition_truncation` at position 28799 — a single component exceeds the LLM's output budget when emitted with full grammar compliance.

```
[plan-component] FAILED component=colocacion-credito errClass=cognition_truncation 
  attempt=1/1 latencyMs=63675 message=JSON parse failed at position 28799
```

The product target anticipates 100-cell matrices, 15-tier 1D bands, composition wrappers (caps/floors/blends) around large matrices, and scope aggregations with temporal ranges. The current per-component emission mechanism has a structural ceiling at ~28KB output. Raising `max_tokens` is rejected per SR-34 (workaround treating symptom, not class).

IRA v2 ranked 5 options. OPTION_A_GRAMMAR_AWARE_SUBTREE_DECOMPOSITION (Rank 1) and OPTION_E_HYBRID_SKELETON_PLUS_TEMPLATE_LIBRARY (Rank 1, target architecture with Option A as Phase 1) both adopted. OPTION_B (streaming continuation) deferred — recursive scaling problem. OPTION_C (component-level decomposition, current state via HF-248) acknowledged as insufficient. OPTION_D (precomputed template library) flagged with AUD-009 risk if templates become plan-pattern-specific.

This HF implements Option A. The LLM composes a skeleton tree with placeholder references at grammar-legal cut points; subsequent calls emit the referenced sub-trees; a deterministic assembler stitches chunks into the final PrimeNode DAG. Cut points are grammar-structural (conditional branches, filter children, scope children) — derived from `prime-grammar.ts`, not from domain vocabulary or content patterns.

The pathway is unified: small components hit the trivial case (skeleton with zero `$ref` placeholders, single call, immediate completion). Large components hit the recursive case (skeleton with refs, chunk calls for each ref, assembler stitches). The composition is the same — the recursion depth varies with tree size.

---

## §2 Substrate-Bound Discipline Applications

**T1-E910 v2 (Korean Test):** Decomposition cut points are grammar's structural primitives. `prime-grammar.ts` declares which prime positions are legal cut points (a `conditional` has cut points at `then` and `else`; a `filter` has a cut point at `downstream`; a `scope` has a cut point at `downstream`). Cut points are not domain vocabulary, not plan-content patterns, not language-specific. The grammar IS the canonical declaration.

**T1-E947 (Reasoning-Scope Binding):** Each chunk's emission scope contains only the sub-tree's content. Band lookup cells within a chunk are independent of each other (no mutual dependency). The skeleton's reasoning scope contains the structural composition (dependency graph between chunks). Each scope matches its dependency graph.

**T1-E902 v2 (Carry Everything Express Contextually):** Round-trip closure enforced at assembler. Every prime emitted across multiple calls is recognizable and reassemblable. Exhaustive emission enforced at three levels: skeleton declares expected chunk count → assembler validates chunk count matches → validator confirms leaf count matches `rateTableCellCount`.

**T1-E904 (Calculation Sovereignty):** Assembled DAG is identical in shape to single-call emission. Engine receives the same PrimeNode tree. No engine modification.

**T1-E920 (Repeated Fix Failure Is a Pattern):** The instance-fix cycle (raise `max_tokens` → next size fails → raise again) is closed structurally. This is the structural response.

**T1-E923 (Scale by Design):** Upper bound is unbounded in principle. 100-cell matrix decomposes into ~4-5 chunks of ~20 cells. 1000-cell matrix decomposes into ~50 chunks. Cost scales O(n/k) where k is cells-per-chunk, bounded by grammar structure.

**Decision 151:** Intent executor sole calculation authority. The orchestration layer (skeleton + chunks + assembler) lives ABOVE the engine boundary. The engine consumes the final assembled PrimeNode tree exactly as before.

**Reconciliation-channel separation:** GT values architect-channel only. CC reports numbers verbatim.

---

## §3 Phase 1 — Skeleton-with-References Emission

### 3.1 Read the current per-component flow

Read these files in full:

1. `web/src/lib/sci/plan-orchestration.ts` — find `executePlanInterpretation`. This is where per-component calls fire.
2. `web/src/lib/ai/providers/anthropic-adapter.ts` — find the `plan_component` task case. This builds the prompt for a single component's calculationIntent.
3. `web/src/lib/calculation/prime-grammar.ts` — find `PRIME_GRAMMAR`, the canonical declaration of nine primes.

Paste verbatim signatures and entry points in the completion report.

### 3.2 Extend the grammar with cut-point declaration

Add to `prime-grammar.ts` a declaration of which prime positions are LEGAL DECOMPOSITION CUT POINTS:

```typescript
// Cut points are positions in a prime's structure where a sub-tree may be replaced
// by a {$ref: "chunk_N"} placeholder during emission. The cut points derive from the
// grammar's nine primes; they are not domain-specific.
export const GRAMMAR_CUT_POINTS = {
  conditional: ['then', 'else'],
  filter: ['downstream'],
  scope: ['downstream'],
  // Other primes are atomic — no legal cut points
} as const;

export function isLegalCutPoint(parentPrime: PrimeType, fieldName: string): boolean {
  return GRAMMAR_CUT_POINTS[parentPrime]?.includes(fieldName as any) ?? false;
}
```

This declaration is derived FROM the grammar's existing structure (the same conditional/filter/scope shapes that already exist). It's a projection of the grammar, not a separate vocabulary. Adding a new prime to the grammar that has nestable children would extend this declaration automatically as part of the prime's definition.

### 3.3 Introduce the skeleton task type

Add a new task type `plan_component_with_chunking` to `anthropic-adapter.ts`. Its prompt instructs the LLM:

> When the calculationIntent's serialized JSON would exceed approximately 20KB (estimated from the component's structural complexity — e.g., a rate table with more than ~20 cells, or nested conditionals with more than ~6 levels), emit the tree with `{"$ref": "chunk_N"}` placeholders at grammar-legal cut points (a conditional's `then` or `else`, a filter's `downstream`, a scope's `downstream`). Each placeholder references a chunk_id (chunk_1, chunk_2, ...). After emitting the skeleton, emit a `chunks` array containing an object per chunk_id with the chunk's PrimeNode sub-tree as the value. The sub-tree must be a complete grammar-compliant prime composition.

Output shape:

```json
{
  "calculationIntent": {
    "prime": "conditional",
    "condition": {...},
    "then": {"$ref": "chunk_1"},
    "else": {"$ref": "chunk_2"}
  },
  "chunks": {
    "chunk_1": {"prime": "constant", "value": 700, "meta": {...}},
    "chunk_2": {
      "prime": "conditional",
      "condition": {...},
      "then": {"$ref": "chunk_3"},
      "else": {"$ref": "chunk_4"}
    },
    ...
  }
}
```

If the component's tree fits in budget without chunking, the LLM emits a complete tree with no `$ref` placeholders and an empty (or absent) `chunks` field. The pathway is the same.

### 3.4 Halt condition

- HALT-1: If introducing the new task type breaks existing single-call `plan_component` emissions for small components (C2/C3 of BCL, all CRP components), report. The new task type must be backward-compatible — a tree with no `$ref` placeholders is valid and renders directly without chunking logic.

### 3.5 Commit

```
git add -A && git commit -m "HF-249 Phase 1: skeleton-with-references emission — GRAMMAR_CUT_POINTS declaration + plan_component_with_chunking task type" && git push origin dev
```

---

## §4 Phase 2 — Chunk Emission

### 4.1 Detect skeleton with refs

In `plan-orchestration.ts`, after the LLM call returns: if the response contains `chunks` field with non-empty content, the emission used chunking. Otherwise treat as direct single-call emission (existing path unchanged).

### 4.2 Validate refs vs chunks

The skeleton's `$ref` placeholders must match the keys in the `chunks` object exactly. Walk the skeleton tree collecting all `$ref` values. Compare to `Object.keys(chunks)`. If they don't match exactly:

- Refs in skeleton without chunks: chunks are missing — emit `cognition_truncation` error (LLM declared chunks but didn't emit them)
- Chunks without refs in skeleton: chunks are orphaned — emit `cognition_violation` error
- Counts match but IDs don't: chunk IDs mismatched — emit `schema_invalid` error

These map to the existing error class taxonomy from HF-248. Use the existing retry policy.

### 4.3 Build the assembler

Add to `prime-grammar.ts` (or a sibling `prime-assembler.ts`):

```typescript
export interface SkeletonWithChunks {
  tree: PrimeNode | RefPlaceholder;
  chunks: Record<string, PrimeNode | RefPlaceholder>;
}

interface RefPlaceholder {
  $ref: string;
}

export function isRefPlaceholder(node: unknown): node is RefPlaceholder {
  return typeof node === 'object' && node !== null && '$ref' in node;
}

export function assembleTree(skeletonWithChunks: SkeletonWithChunks): PrimeNode {
  const { tree, chunks } = skeletonWithChunks;
  return resolveNode(tree, chunks);
}

function resolveNode(
  node: PrimeNode | RefPlaceholder,
  chunks: Record<string, PrimeNode | RefPlaceholder>
): PrimeNode {
  if (isRefPlaceholder(node)) {
    const chunk = chunks[node.$ref];
    if (!chunk) {
      throw new AssemblerError(`Unresolved chunk reference: ${node.$ref}`);
    }
    return resolveNode(chunk, chunks);
  }
  
  // For each grammar-declared cut point in this prime, recurse on the child
  const cutPoints = GRAMMAR_CUT_POINTS[node.prime] ?? [];
  for (const field of cutPoints) {
    if (field in node) {
      (node as any)[field] = resolveNode((node as any)[field], chunks);
    }
  }
  
  return node;
}
```

The assembler is deterministic. It uses `GRAMMAR_CUT_POINTS` from §3.2 to know which fields to recurse on — no hardcoded prime knowledge, no domain logic. It throws on unresolved references (catching truncated emissions where the LLM declared a chunk but didn't emit it).

### 4.4 Cycle detection

The assembler must detect cycles (a chunk that references itself directly or transitively). Maintain a `resolving` set during recursion; throw `CyclicReferenceError` if a chunk_id appears in `resolving` when entered.

### 4.5 Validator integration

After assembly, the existing `prime-validator.ts` runs on the assembled tree. The validator sees a complete tree (no `$ref` placeholders) — it operates on the same input shape as today. The `rateTableCellCount` exhaustive-emission check fires against the assembled leaf count.

If the assembled tree fails validation (e.g., grammar violation in a chunk), the failure is reported with the failing chunk identified — assembler tracks which chunk contributed each leaf during assembly.

### 4.6 Halt condition

- HALT-2: If the LLM emits cyclic references (chunk_1 → chunk_2 → chunk_1), report. Cycle detection throws cleanly; the failure surfaces as `cognition_violation` and the component fails its retry. Cycles are LLM emission bugs, not architectural failures.
- HALT-3: If a chunk itself exceeds the token budget (a single chunk too large), report. This indicates the LLM did not decompose at sufficiently fine cut points. The prompt instruction should be tightened — but for now, the validator catches the truncated chunk and the component fails. This is a follow-on prompt-engineering refinement, not blocking HF-249.

### 4.7 Commit

```
git add -A && git commit -m "HF-249 Phase 2: chunk emission validation + deterministic assembler with cycle detection" && git push origin dev
```

---

## §5 Phase 3 — Orchestration of Multi-Call Emission

### 5.1 The two-pass orchestration

In `plan-orchestration.ts`, the per-component path becomes:

1. **Call 1 (skeleton):** Emit `plan_component_with_chunking` request. LLM returns either:
   - Complete tree (no chunks needed) → proceed directly to validation
   - Skeleton with refs + chunks object → proceed to assembly

2. **No additional LLM calls needed.** The LLM emits the skeleton AND all chunks in a single response. The chunks are part of the same response, in the `chunks` field.

Wait. This is important. IRA's Option A described separate chunk calls. But re-reading the IRA evaluation: "Call 1: LLM emits a skeleton DAG... Subsequent calls emit the referenced sub-trees." That's TWO levels:
- Skeleton in one call
- Each chunk in a separate call

This is for cases where even the skeleton + chunks together exceed a single response budget. For BCL's 30-cell matrix, the skeleton + chunks can fit in one response. For a 1000-cell matrix, each chunk gets its own call.

The orchestration needs both modes:

**Single-response mode (default):** LLM emits skeleton + chunks in one response. Used when total emission fits in budget.

**Multi-call mode (fallback):** If a single response truncates (cognition_truncation on the skeleton call), the orchestration switches to multi-call mode:
- Call 1: skeleton only (with `$ref` placeholders, no chunks)
- Calls 2..N: one per `$ref`, each emitting the referenced sub-tree

The choice between modes is automatic based on response success. The orchestration tries single-response first; on truncation, falls back to multi-call.

### 5.2 Multi-call mode implementation

When the skeleton call truncates AND the LLM produced a parseable skeleton with declared chunks (refs present but chunks empty or truncated), the orchestration:

1. Extracts the skeleton (the `calculationIntent` portion that parsed successfully)
2. Identifies the missing chunk_ids
3. Issues one `plan_chunk` call per missing chunk_id, passing context: the plan text, the parent component's `briefSemantic`, and the skeleton position the chunk fills

The `plan_chunk` task type is added to `anthropic-adapter.ts`. Its prompt is narrow: "Emit the PrimeNode sub-tree for chunk_id <X> in the context of component <Y>. The chunk fills the position <skeleton_path>." The chunk is a complete grammar-compliant sub-tree, just smaller than a full component.

### 5.3 Parallel chunk emission

Chunks in multi-call mode are independent (per T1-E947). The orchestration emits them in parallel using `Promise.all`. The retry policy from HF-248 applies per chunk. Latency is bounded by the slowest chunk, not the sum.

### 5.4 Per-chunk error reporting

If any chunk fails (after retries), the component fails with a structured error identifying the failing chunk. The error class is `cognition_truncation` if the chunk itself truncated, `cognition_violation` if it failed grammar validation. The diagnostic includes the chunk_id and the skeleton position.

The reimport-resume semantics from HF-248 apply: a partially-successful component (skeleton + some chunks) is NOT persisted; only fully-assembled components are persisted. Resume re-attempts the failed component from scratch (skeleton call onward).

### 5.5 Commit

```
git add -A && git commit -m "HF-249 Phase 3: orchestration single-response default + multi-call fallback with parallel chunks" && git push origin dev
```

---

## §6 Phase 4 — Verification

### 6.1 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors.

### 6.2 BCL verification

The architect will:
1. Run BCL clean-slate SQL.
2. Import BCL plan file through the browser.
3. Capture from logs:
   - `[plan-skeleton]` line — Phase A skeleton call (existing from HF-248)
   - `[plan-component]` lines — per-component calls
   - For C0 specifically: confirm whether (a) single-response mode succeeds with skeleton+chunks in one response, or (b) multi-call fallback fires with separate chunk calls
   - `[plan-assembler]` log lines if added — chunk count, assembly success, leaf count
   - Final `[SCI plan-interp] Batched plan saved: ... N components` — must show 8 components (4 per variant × 2 variants), all components present
4. Verify rule_set is persisted with C0 included

If C0 still fails after HF-249, the failure mode informs the next step:
- If C0 chunks but assembly fails → assembler bug
- If C0 skeleton truncates AND multi-call fallback chunks also truncate → cut points insufficient; chunks themselves too large
- If C0 chunks succeed but validator rejects → grammar compliance issue in chunks

### 6.3 Calculation verification

After C0 persists, import data files and calculate October. Report `componentTotals` and `Grand total` verbatim. Architect reconciles against GT $44,590 (October).

### 6.4 Commit

```
git add -A && git commit -m "HF-249 Phase 4: verification evidence" && git push origin dev
```

---

## §7 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | New task type breaks single-call emission for small components | Report. The new path must be backward-compatible — empty chunks field must render as direct emission. |
| HALT-2 | LLM emits cyclic chunk references | Cycle detection throws cleanly; component fails with `cognition_violation`. No architectural action; LLM emission bug. |
| HALT-3 | Single chunk itself exceeds token budget | LLM did not decompose finely enough. Tighten prompt; not blocking. Follow-on prompt-engineering refinement. |
| HALT-4 | Assembler fails for trees today (regression on existing valid trees) | Report. Assembler must be a no-op for trees without `$ref` placeholders. |
| HALT-5 | Multi-call mode times out due to too many chunks | A 1000-cell matrix with too-fine chunking produces 100+ chunks. Parallel emission helps, but total latency may still exceed UI timeout. Report; may motivate Phase 4 of HF-248 (async polling). |
| HALT-6 | C0 still fails after HF-249 | Report failure mode. If chunks themselves truncate, cut points insufficient. If chunks succeed but validator rejects, grammar issue. |

---

## §8 Reporting Discipline

Completion report: `docs/completion-reports/HF-249_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Required evidence per phase:
- Phase 1: paste `GRAMMAR_CUT_POINTS` declaration verbatim. Paste `plan_component_with_chunking` prompt section verbatim. Show backward compatibility — a small component still emits a complete tree.
- Phase 2: paste `assembleTree` and `resolveNode` verbatim. Paste cycle detection logic. Paste reference validation logic.
- Phase 3: paste orchestration BEFORE and AFTER for the per-component path. Show single-response default + multi-call fallback branch.
- Phase 4: build evidence + architect-manual verification placeholders for BCL C0 emission.

---

## §9 Out of Scope

- **Option E Phase 2 (template library).** Templates extracted from successful chunks become a future HF. Per IRA: "Add template library as Phase 2 once emission patterns stabilize. Phase 2 template extraction should be automated from successful Phase 1 chunk emissions." Not part of HF-249.
- Calculation engine (OB-200, HF-244, HF-245, HF-247, HF-248 stay as-is).
- CRP and Meridian verification. After BCL succeeds with C0 complete, same orchestration applies to other tenants.
- Async progress polling (HF-248 Phase 4 deferred per HALT-3 there). May become necessary if multi-call mode produces enough chunks to exceed UI timeout (HALT-5 here).
- Substrate supersession candidates (T1-E923 extension for emission scaling, T1-E947 extension for emission decomposition) — VG-side work surfaced by IRA. Logged for forward VG work.

## §10A Residuals

- Multi-call mode increases API cost proportional to chunk count. A 30-cell matrix with ~5 chunks costs ~6x the API of a single call (skeleton + 5 chunks). Acceptable for cases that previously failed entirely; track in production cost metrics.
- Cut points are declared for `conditional`, `filter`, `scope` only. If future structure classes require cut points at other primes, the declaration extends with the new prime's definition. The grammar is the source of truth.
- The single-response mode's chunk decomposition is the LLM's judgment. Different LLM emissions may produce different chunkings for the same component. This is acceptable — the assembled tree is semantically equivalent regardless of chunking choice. The validator catches semantic incorrectness.
- Cycle detection prevents infinite recursion, but a clever LLM emission could produce a `$ref` pointing into a chunk that itself contains the parent's structure — this is a tree-shape violation caught by the validator, not by cycle detection (the references form a tree, not a cycle).
- If a SINGLE chunk in multi-call mode exceeds budget (HALT-3), HF-249 doesn't solve it. The next HF would introduce recursive chunking — a chunk can itself contain `$ref` placeholders to deeper chunks. The architecture supports this (the assembler already recurses through refs); the prompt would need to teach the LLM that chunks may chunk.

---

## BUILD AND DEPLOY

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "HF-249: Grammar-aware subtree decomposition — skeleton+chunk emission with deterministic assembler"
7. PR body: "Closes cognition_truncation regression for large components (BCL C0 30-cell matrix). Implements IRA v2 invocation 5fa3ef79 Option A (Rank 1, adopted Phase 1 of target Option E Hybrid). Cut points are grammar-structural primitives (conditional branches, filter/scope children) — declared in prime-grammar.ts, not domain. LLM emits skeleton + chunks; assembler stitches deterministically. Single-response mode default; multi-call fallback for cases exceeding single-response budget. Pathway is unified — small components emit complete trees with empty chunks; large components emit skeletons with refs. The same composition mechanism scales unboundedly via recursion on grammar's nine primes. Validator unchanged; engine input shape unchanged."
