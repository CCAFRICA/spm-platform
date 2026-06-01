# HF-250: Multi-Call Skeleton/Chunk Separation — Complete HF-249's Phase 3

**§0 CC Standing Rules**

Include `CC_STANDING_ARCHITECTURE_RULES.md` at top of context.
Drafting reference: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.
Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.
Binding rules: AP-17 (single pipeline), AP-25 (Korean Test), SR-34 (no bypass), SR-41 (revert discipline), SR-43 (ship completes work item), Rules 25-28 (completion report discipline), Rule 29 (CC paste LAST).
Decisions: 127 (half-open), 151 (intent executor sole authority), 153 (plan intelligence as L2 signals), 154 (Korean Test four classes).
IRA reference: IRA v2 invocation `5fa3ef79` Option A specification states: "Call 1: LLM emits a skeleton DAG... Subsequent calls emit the referenced sub-trees." This HF closes the gap between the IRA specification and HF-249's current implementation.

---

## §1 Problem Statement

HF-249 introduced grammar-aware subtree decomposition. Production verification (2026-05-23 01:27-01:30) confirms HF-249 IS firing — the truncation position shifted from 28799 (pre-HF-249) to 23609 and 23328 (post-HF-249), indicating the LLM is emitting the new format with skeleton + chunks. But the failure mode is unchanged: `cognition_truncation` on C0, no `[plan-component] HF-249 multi-call fallback` log line.

```
[plan-component] FAILED component=colocacion-credito name="Colocación de Crédito" 
  errClass=cognition_truncation attempt=1/1 latencyMs=64430 
  message=JSON parse failed: Expected ',' or ']' after array element in JSON at position 23609
```

Root cause analysis from HF-249 completion report and current orchestration code:

HF-249's `plan_component_with_chunking` task type asks the LLM to emit the skeleton AND all chunks in a SINGLE response. For BCL's C0 (30-cell 2D matrix), the combined emission still exceeds `max_tokens`. The LLM produces a parseable skeleton with `$ref` placeholders followed by a `chunks` object whose contents truncate mid-emission. The overall JSON is invalid (truncated mid-stream), so `parseJsonResponse` fails and the orchestrator marks the entire response as `cognition_truncation` rather than detecting "skeleton parsed cleanly, chunks missing → fall back to per-chunk calls."

The multi-call fallback path was implemented in HF-249 Phase 3 but is NEVER REACHED in production because:

1. The single-response mode asks for skeleton + chunks together
2. When the response truncates, the JSON parse fails entirely
3. The orchestrator sees parse failure and reports `cognition_truncation`
4. The fallback path was designed to trigger on "skeleton succeeded but chunks missing" — a state that never occurs because skeleton and chunks are in the same response

This violates IRA v2 Option A specification: "Call 1: LLM emits a skeleton DAG... Subsequent calls emit the referenced sub-trees." Subsequent calls means separate LLM calls, not nested response structure.

The session has been operating in a five-iteration cycle on plan import (OB-200, HF-244, HF-247, HF-248, HF-249), each shipping a structurally correct fix. Per T1-E920 (Repeated Fix Failure Is a Pattern, Not a Bug): the iteration is not because each fix is wrong, but because the cumulative architecture requires one more closure to operate per IRA's actual specification. HF-250 IS that closure.

---

## §2 Substrate-Bound Discipline Applications

**Decision 151 (Intent Executor Sole Authority):** The orchestration layer above the engine boundary is the locus of this fix. The engine input shape is unchanged. The assembler from HF-249 Phase 2 is unchanged.

**T1-E910 v2 (Korean Test / Canonical Declaration):** The grammar's nine primes remain the canonical vocabulary. `GRAMMAR_CUT_POINTS` from HF-249 Phase 1 remains the structural decomposition declaration. No domain vocabulary, no compensation patterns.

**T1-E947 (Reasoning-Scope Binding Specificity):** The skeleton call's reasoning scope is the structural composition (what cut points to introduce). Each chunk call's reasoning scope is a single sub-tree (what primes to compose at that boundary). Each scope matches its dependency graph. Per-chunk emission is independent — chunks parallelize via `Promise.allSettled`.

**T1-E902 v2 (Carry Everything Express Contextually):** The assembler validates chunk count vs skeleton refs (HF-249 Phase 2). Round-trip closure is enforced — every prime emitted across multiple calls is reassemblable without loss.

**T1-E920 (Repeated Fix Failure Is a Pattern):** This HF closes the structural class at the call-separation boundary. After HF-250, the iteration cycle on plan import emission ends because the architecture matches IRA's specification.

**T1-E923 (Scale by Design):** Multi-call mode scales unboundedly. Per-chunk call has bounded budget; total chunks scale linearly with tree size. A 1000-cell matrix produces ~50 chunks via parallel calls.

**SR-43 (Ship Completes Work Item):** BUILD AND DEPLOY includes merge, deployment verification, dev sync. Production deployment is the end of the work item.

**Reconciliation-channel separation:** GT values architect-channel only. CC reports numbers verbatim.

---

## §3 Phase 1 — Skeleton-Only Emission Mode

### 3.1 Read HF-249's current orchestration

Read these files in full:

1. `web/src/lib/sci/plan-orchestration.ts` — find `interpretPlanComponentWithChunking` and `callPlanComponentWithRetry`. The current implementation asks the LLM for skeleton + chunks together.
2. `web/src/lib/ai/providers/anthropic-adapter.ts` — find the `plan_component_with_chunking` task type. The prompt asks for both skeleton and chunks in one response.
3. `web/src/lib/calculation/prime-assembler.ts` — `assembleTree`, `validateReferences`, `collectReferences`. Unchanged by this HF.

Paste verbatim signatures and entry points in the completion report.

### 3.2 Restructure the prompt to request skeleton ONLY

The `plan_component_with_chunking` prompt is restructured. Two operating modes per component:

**Mode A — Direct emission (small components).** If the component's expected complexity (estimated from the skeleton call in HF-248 OR from a quick structural heuristic on `rateTableCellCount`) is below threshold, ask the LLM to emit a complete tree with NO `$ref` placeholders. The response is processed exactly as in HF-249's single-response success path.

**Mode B — Skeleton-with-refs (large components).** If complexity is above threshold, the prompt asks the LLM to emit ONLY the skeleton tree with `$ref` placeholders at grammar-legal cut points. The response contains the skeleton structure WITHOUT a `chunks` field. Each `$ref` is filled by a subsequent per-chunk LLM call.

The threshold heuristic: `rateTableCellCount > 15` OR `componentComplexityHint === 'complex'` OR the LLM's skeleton call (from HF-248) flagged the component as complex. Conservative default: when in doubt, use Mode B (multiple small calls always succeed; one large call may truncate).

### 3.3 Update the prompt structure

The system prompt for `plan_component_with_chunking` becomes mode-aware:

```
You are emitting the calculationIntent for a single plan component.

MODE: SKELETON_ONLY

Emit ONLY the skeleton tree structure. Use {"$ref": "chunk_<N>"} placeholders at 
grammar-legal cut points: a conditional's then/else, a filter's downstream, a 
scope's downstream, a prior_period's downstream. The skeleton declares the 
structural shape; each chunk's content will be emitted in a separate call.

For a 2D rate table with N rows × M columns:
- Emit the outer conditional structure with refs at each row boundary
- DO NOT emit the row contents in this response

Example structure (5×4 matrix, top-level):
{
  "prime": "conditional",
  "condition": {...},
  "then": {"$ref": "chunk_1"},   // Row 1 sub-tree
  "else": {
    "prime": "conditional", 
    "condition": {...},
    "then": {"$ref": "chunk_2"},  // Row 2 sub-tree
    "else": {"$ref": "chunk_3"}   // Rows 3-N sub-tree
  }
}

DO NOT include a "chunks" field. The skeleton is the only output for this call.
```

The exact prompt is developed by CC reading the existing `plan_component_with_chunking` prompt and restructuring per the above. Examples in the prompt MUST be structurally specific (matrix shapes), NOT domain-specific (no "rate table" wording — use "N-dimensional band lookup" or similar Korean-Test-compliant phrasing).

### 3.4 Halt condition

- HALT-1: If the mode-selection heuristic (`rateTableCellCount > 15`) misclassifies components — e.g., a small 1D band with 10 tiers gets Mode A and succeeds, but the LLM produces a sloppy emission because the prompt is unclear which mode it's in — report. The mode signal must be explicit in the prompt, not inferred by the LLM.

### 3.5 Commit

```
git add -A && git commit -m "HF-250 Phase 1: skeleton-only emission mode — separate from chunk emission per IRA Option A spec" && git push origin dev
```

---

## §4 Phase 2 — Per-Chunk Emission Calls

### 4.1 Add the plan_chunk task type properly

HF-249 introduced a `plan_chunk` task type but it was not wired into the call-separation flow. This phase wires it correctly.

Add to `anthropic-adapter.ts`:

```typescript
case 'plan_chunk':
  return buildChunkPrompt(request);
```

Where `buildChunkPrompt` constructs a narrow prompt:

```
You are emitting a single sub-tree of a plan component's calculationIntent.

CONTEXT:
- Component: <componentName>
- Component semantic: <briefSemantic from skeleton call>
- Skeleton position: <path to this chunk's parent ref, e.g. "$.then.else.then">
- Chunk ID: <chunk_N>

Emit the PrimeNode sub-tree that fills this position. The sub-tree must be a 
complete grammar-compliant composition using the nine primes. No $ref placeholders 
in this response — emit the full sub-tree.

[grammar section from prime-grammar.ts]
```

The chunk prompt is bounded: one sub-tree, no nested references, no overall plan structure. Token cost per chunk is typically ~1-5KB.

### 4.2 Orchestrate parallel chunk emission

In `plan-orchestration.ts`, when Mode B (skeleton-only) returns:

1. Parse the skeleton response. Extract all `$ref` IDs via `collectReferences` (HF-249 Phase 2).
2. For each `$ref`, construct a `plan_chunk` request with the chunk_id and the skeleton position.
3. Fire all chunk requests in parallel via `Promise.allSettled`.
4. Collect results. For each chunk:
   - Success: chunk PrimeNode added to chunks map
   - Failure (cognition_truncation, cognition_violation): chunk fails individually with retry per HF-248 error class taxonomy
5. After all chunks resolve, call `assembleTree({tree: skeleton, chunks})` from HF-249 Phase 2.
6. Validate the assembled tree against `prime-validator.ts`.

### 4.3 Per-chunk retry policy

Each chunk uses the existing HF-248 retry policy:
- `cognition_truncation` → 1 attempt (deterministic failure)
- `cognition_violation` → 1 attempt
- `adapter_rate_limit` / `adapter_overloaded` → 3 attempts with exponential back-off
- `adapter_timeout` → 2 attempts

If a chunk fails after retries, the component fails with structured error identifying the failing chunk. Per HF-248 reimport-resume: failed components are retryable on reimport; successful chunks within a failed component are NOT individually cached (the chunk's context depends on the skeleton; resume re-issues the skeleton call).

### 4.4 Logging

Add log lines at each phase:

```
[plan-skeleton-only] component=<id> requested skeleton with N expected chunks
[plan-skeleton-only] component=<id> skeleton parsed — M $refs found
[plan-chunk] FIRING parallel chunks: [chunk_1, chunk_2, ...]
[plan-chunk] SUCCESS chunk_id=chunk_<N> latencyMs=<ms>
[plan-chunk] FAILED chunk_id=chunk_<N> errClass=<class> message=<...>
[plan-assembler] component=<id> chunksResolved=N/M
[plan-component] SUCCESS component=<id> chunksResolved=N (multi-call mode)
```

These log lines must be DIAGNOSTIC-GRADE. The architect must be able to read them and identify exactly which chunk failed, why, and what the orchestration did about it.

### 4.5 Halt condition

- HALT-2: If parallel chunk emission produces rate-limit errors (HTTP 429) because too many concurrent calls saturate the API, report. The back-off policy may need to gate concurrency (e.g., max 5 concurrent chunks). Initial implementation: fire all chunks in parallel; if 429 errors observed in production, follow-on HF gates concurrency.
- HALT-3: If a chunk itself contains nested refs (LLM emits a chunk with `$ref` placeholders inside it), report. The chunk prompt explicitly forbids nested refs, but if the LLM ignores this, the assembler will throw `AssemblerUnresolvedReferenceError`. The fix is prompt-tightening, not architectural.

### 4.6 Commit

```
git add -A && git commit -m "HF-250 Phase 2: per-chunk emission calls — plan_chunk task type wired, parallel emission via Promise.allSettled, retry policy per chunk" && git push origin dev
```

---

## §5 Phase 3 — Orchestrator Mode Selection

### 5.1 Mode selection logic

In `plan-orchestration.ts`, the per-component call site becomes:

```typescript
async function callPlanComponentWithRetry(component, context) {
  const useChunking = shouldUseChunking(component);
  
  if (!useChunking) {
    // Mode A: direct single-call emission (existing path)
    return await interpretPlanComponentDirect(component, context);
  }
  
  // Mode B: skeleton-only then parallel chunks
  const skeletonResult = await interpretPlanSkeletonOnly(component, context);
  if (skeletonResult.errClass) {
    return skeletonResult;  // Skeleton itself failed; surface error
  }
  
  const refs = collectReferences(skeletonResult.tree);
  if (refs.length === 0) {
    // LLM didn't introduce any refs; treat as direct emission
    return {tree: skeletonResult.tree, mode: 'direct', leaves: countLeaves(skeletonResult.tree)};
  }
  
  // Fire parallel chunk calls
  const chunkResults = await Promise.allSettled(
    refs.map(refId => interpretPlanChunk(refId, skeletonResult, component, context))
  );
  
  const chunks = {};
  const failures = [];
  for (let i = 0; i < refs.length; i++) {
    const result = chunkResults[i];
    if (result.status === 'fulfilled' && !result.value.errClass) {
      chunks[refs[i]] = result.value.tree;
    } else {
      failures.push({refId: refs[i], error: result.status === 'fulfilled' ? result.value : result.reason});
    }
  }
  
  if (failures.length > 0) {
    return {errClass: 'cognition_truncation', failedChunks: failures};
  }
  
  // Assemble and validate
  const assembled = assembleTree({tree: skeletonResult.tree, chunks});
  return {tree: assembled, mode: 'multi_call', chunksResolved: refs.length, leaves: countLeaves(assembled)};
}

function shouldUseChunking(component) {
  // Korean Test compliant: structural heuristic only
  if (component.rateTableCellCount && component.rateTableCellCount > 15) return true;
  if (component.complexityHint === 'complex') return true;
  return false;
}
```

### 5.2 Reimport-resume preserves mode selection

If a component succeeded on a prior import via Mode B (multi-call), the persisted DAG tree is the assembled tree (no `$ref` placeholders in the persisted form). Reimport-resume from HF-248 reads the persisted tree and skips the LLM calls entirely. Mode selection only matters for fresh emissions.

### 5.3 Commit

```
git add -A && git commit -m "HF-250 Phase 3: orchestrator mode selection — shouldUseChunking heuristic, parallel chunk emission, assemble and validate" && git push origin dev
```

---

## §6 Phase 4 — Verification

### 6.1 Build

Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` responds. Zero TypeScript errors.

### 6.2 BCL verification

The architect will:
1. Run BCL clean-slate SQL.
2. Import BCL plan file through the browser.
3. Capture from production logs (Vercel):
   - `[plan-skeleton]` line from HF-248 (component index)
   - `[plan-component] SUCCESS` for C1/C2/C3 (small components, Mode A direct emission)
   - For C0 specifically (30-cell matrix):
     - `[plan-skeleton-only] component=colocacion-credito requested skeleton with N expected chunks`
     - `[plan-skeleton-only] component=colocacion-credito skeleton parsed — M $refs found`
     - `[plan-chunk] FIRING parallel chunks: [chunk_1, chunk_2, ...]`
     - `[plan-chunk] SUCCESS chunk_id=chunk_<N> latencyMs=<ms>` for each chunk
     - `[plan-assembler] component=colocacion-credito chunksResolved=N/M`
     - `[plan-component] SUCCESS component=colocacion-credito chunksResolved=N (multi-call mode)`
   - Final `[SCI plan-interp] Batched plan saved: ... 8 components` (4 per variant × 2 variants)
4. Verify rule_set has all 8 components persisted including C0 with complete DAG tree

If C0 still fails:
- If chunks themselves truncate (chunk emission too large) → cut points insufficient; the LLM didn't decompose finely enough. Follow-on HF tightens the prompt's decomposition instruction.
- If chunks succeed but validator rejects → grammar compliance issue in chunk emission. Different from current failure mode.
- If skeleton call truncates with no refs found → the LLM is still emitting full trees in skeleton call. Prompt needs reinforcement that Mode B = skeleton ONLY.

### 6.3 Calculation verification

After all 8 components persist (including complete C0):
1. Import personnel template and data files
2. Calculate October
3. Report `componentTotals` and `Grand total` verbatim
4. Architect reconciles against GT $44,590 October

### 6.4 Commit

```
git add -A && git commit -m "HF-250 Phase 4: verification evidence" && git push origin dev
```

---

## §7 HALT Conditions

| ID | Condition | Action |
|---|---|---|
| HALT-1 | Mode-selection heuristic misclassifies components | Make mode explicit in prompt, not inferred. The `shouldUseChunking` heuristic must be conservative — prefer false-positive (use chunking for borderline components) over false-negative (use direct for components that won't fit). |
| HALT-2 | Parallel chunks hit rate limits (HTTP 429) | Gate concurrency (e.g., max 5 concurrent). Initial implementation: fire all in parallel; if 429s observed, follow-on HF adds concurrency gate. |
| HALT-3 | LLM emits nested refs in chunk (chunk contains $ref placeholders) | Assembler throws `AssemblerUnresolvedReferenceError`. Prompt tightening, not architectural. |
| HALT-4 | C0 chunks themselves truncate after split | Cut points insufficient. The LLM didn't decompose at fine enough granularity. The skeleton prompt needs to teach finer decomposition (e.g., per-row chunks for 2D matrices). |
| HALT-5 | C0 chunks succeed but assembled tree fails validator | Grammar compliance issue in chunk emission. Different failure mode than current; addressed by chunk prompt refinement. |
| HALT-6 | Mode A path regresses for small components after restructure | The direct emission path must be unchanged for components with `rateTableCellCount <= 15`. Backward compatibility is required. |

---

## §8 Reporting Discipline

Completion report: `docs/completion-reports/HF-250_COMPLETION_REPORT.md`

Per Rules 25-28. Structure per `COMPLETION_REPORT_ENFORCEMENT.md`. Evidence means paste, not describe. Commit-per-phase.

Required evidence per phase:
- Phase 1: paste BEFORE and AFTER of `plan_component_with_chunking` prompt. Show Mode A vs Mode B branches. Show the mode-selection heuristic.
- Phase 2: paste `buildChunkPrompt` verbatim. Paste the `plan_chunk` task case verbatim. Paste the parallel emission orchestration.
- Phase 3: paste `callPlanComponentWithRetry` BEFORE and AFTER. Show mode selection, skeleton call, parallel chunk call, assembly, validation.
- Phase 4: build evidence + architect-manual verification placeholders for BCL C0 multi-call mode firing.

---

## §9 Out of Scope

- Calculation engine (OB-200, HF-244, HF-247, HF-248, HF-249 unchanged).
- C2/C3 validator warnings (missing scale_annotation, terminal_completeness). These are LLM emission gaps that pass as warnings. Separate HF to elevate them to critical and add prompt reinforcement.
- CRP and Meridian verification. After BCL C0 succeeds, the same orchestration applies.
- Async progress polling (HF-248 Phase 4 deferred). Multi-call parallel emission should bring total latency under 60s for typical components.
- Template library (HF-249 Option E Phase 2). Future HF after multi-call mode operates in production.
- Substrate supersession candidates (T1-E923, T1-E947 extensions). VG-side forward work.

## §9A Residuals

- Multi-call mode increases API cost. C0's 30-cell matrix with ~5 chunks = ~5 LLM calls (skeleton + 5 chunks) instead of 1 (when 1 worked) or 0 (when it didn't). Acceptable; track cost in production.
- Mode-selection heuristic (`rateTableCellCount > 15`) is conservative. Some 1D bands at 10-15 tiers may go through Mode B unnecessarily (extra calls, no failure). False-positives are cheap; false-negatives (Mode A for too-large component) still fail.
- Chunk emission depth: the current architecture supports one level of decomposition (skeleton → chunks). If a chunk itself is too large (HALT-4), recursive chunking (chunks can have their own refs) is a follow-on HF. The assembler already supports recursion via the existing `resolveNode`.
- LLM consistency across parallel chunk calls: each chunk's emission may have minor variations (e.g., one chunk uses `unit: "percent"` while another uses `unit: "ratio"`). The post-assembly validator catches scale inconsistencies. Different chunks must be consistent in their compare-position constants relative to the data scale.

---

## BUILD AND DEPLOY (per SR-43)

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — zero errors
4. `npm run dev` — `localhost:3000` responds
5. Git from repo root (`spm-platform`) NOT `web/`
6. `gh pr create --base main --head dev` with title: "HF-250: Multi-call skeleton/chunk separation — complete HF-249 per IRA Option A specification"
7. PR body: "Closes HF-249 gap where skeleton + chunks were emitted in single response causing combined truncation. Per IRA v2 Option A: separate skeleton call returning only structural shape with $ref placeholders; per-chunk LLM calls in parallel via Promise.allSettled; deterministic assembler stitches per HF-249 Phase 2. Mode selection by rateTableCellCount heuristic (>15 cells = multi-call). Korean Test compliant — structural heuristic only. BCL C0 verification: $44,590 October reconciliation against GT."
8. **`gh pr merge <PR#> --squash --delete-branch=false`**
9. **Wait for Vercel deployment to Ready status on main**
10. **If Vercel webhook does not fire within 5 minutes (the HF-249 anomaly), notify architect to trigger manual redeploy from Vercel dashboard**
11. **Sync dev with main: `git checkout main && git pull origin main && git checkout dev && git merge main && git push origin dev`**
12. **Completion report includes: Vercel production deployment SHA matching main HEAD, deployment status Ready, BCL production verification log capture**
