# HF-279 Completion Report — DAG-Divide Band Coherence

**Date:** 2026-06-09
**Branch:** `hf-279-dag-divide-band-coherence` (from `main` @ 5c39d1db, which carries HF-277)
**Supersedes:** HF-278 (HALT-2 fired correctly, never merged) · **Completes:** HF-277 · **Retires:** HF-274's convergence-side attach for divides
**Status:** Implemented + deterministic verification PASS + build PASS + dev PASS. **Post-merge cold re-import reconciliation (SR-44) is the outstanding production gate — see §7.**

---

## 1. Phase 0 — Reads (pasted)

### 0.1 Recognition prompt (anthropic-adapter.ts) — governs breaks + scale emission
The `plan_component` prompt emits a compact `CompositionalIntent`. Banded `dimensions` carry `reference_source` + `breaks`; a single top-level `scale: ScaleSpec | null` declares which side scales (HF-244). Pre-HF-279, NOTHING instructed which space a ratio dimension's breaks live in, and `scale` could be paired with a ratio band freely. Relevant lines: banded_lookup shape (~:507), ReferenceSource ratio (~:548), Scale spec (~:555), reference-type / structural-shape guidance (~:561-571).

### 0.2 Attach expression (intent-constructor.ts) — HF-277 form confirmed (HALT-1 cleared)
```
const attach = (scale.side === 'evaluator' && !otherSideIsRatio)
    || (scale.side === 'convergence' && otherSideIsRatio);
```
This is exactly the HF-277 form expected on `main`. **HALT-1 did not fire.** Call sites pass `dim.reference_source?.type === 'ratio'` (band, :323) and `desc.condition.reference?.type === 'ratio'` (conditional, :378) positionally.

### 0.3 Recognition-output validation seam (HALT-2 cleared)
The directive's narrow grep returned nothing, so a broadened search was run (false-negative here would wrongly trip HALT-2). The deterministic seam is **`web/src/lib/sci/plan-orchestration.ts`**, `callPlanComponentWithRetry`: the response's `compositional_intent` is cast to `CompositionalIntent`, `constructTree(ci)` builds the DAG, the **HF-271 structural-coherence proofread** runs (`collectDeclaredRatios` / `collectTwoFieldDivides` → `StructuralCoherenceError`), then `validateComponentIntent` validates and `metadataExtension.compositional_intent` persists (:623 validate, :640 persist). `StructuralCoherenceError` already maps to `cognition_violation` in the catch block. **HALT-2 did not fire** — the invariant has a deterministic home at this seam.

---

## 2. ADR
Committed at `docs/completion-reports/HF-279_ADR.md` (commit dee823dc). One coherence invariant ("a DAG-divide band's breaks are in the quotient's own space; therefore no scale"), keyed on `reference_source.type`. Options B (÷scale normalization — destroys BCL), C (magnitude heuristics — Decision 154 violation), D (construction-only — proven impossible by HF-276/278) rejected. Includes the construction-predicate reconciliation (§3 below).

---

## 3. Implementation (3 changes, one commit chain)

### 3.1 Recognition prompt (anthropic-adapter.ts, commit 8068b48e)
Added a binding rule to the Scale-specification block and the banded_lookup guidance: a dimension whose `reference_source.type` is `ratio` states its `breaks` in the quotient's own 0..N space (`"85%" → 0.85`, `"130%"/"1.3x" → 1.3`) and emits **no scale** for that band. Wording is domain- and field-agnostic. The pre-computed `metric` percent column keeps normal scale (DD-7).

### 3.2 Recognition-output invariant (compositional-intent.ts + plan-orchestration.ts, commits 7ac60f97 → relocated 0af3367a)
`assertRatioBandScaleCoherence(ci, componentId)` — called at the Phase 0.3 seam immediately after the HF-271 proofread, before persistence. Raises `StructuralCoherenceError → cognition_violation` (the established loud-failure surface; retried per policy, NEVER persisted) when a ratio-source band is paired with a scale that would **bind** to it — ambient (no `reference_field` → constructor attaches at dimension 0) or named via `scale.reference_field`. The binding test mirrors `buildConstantWithScale` exactly, so it fires on precisely the configs that would otherwise miscalculate, and stays silent when a scale binds a non-ratio axis of a mixed matrix.

```ts
export function assertRatioBandScaleCoherence(ci: CompositionalIntent, componentId: string): void {
  if (!ci.scale) return;
  const ratioBands = { all: [] as string[], firstDim: [] as string[] };
  collectRatioBandFields(ci.structure as unknown, ratioBands);
  if (ratioBands.all.length === 0 && ratioBands.firstDim.length === 0) return;
  const scaleField = ci.scale.reference_field;
  const offending = scaleField
    ? ratioBands.all.find(f => f === scaleField)   // named scale binds to this ratio band
    : ratioBands.firstDim[0];                       // ambient scale binds to a band's dimension 0
  if (offending === undefined) return;
  throw new StructuralCoherenceError(componentId, `a ratio-source band (reference_field="${offending}") was emitted WITH a scale ... Emit scale: null for ratio-source bands`);
}
```
Relocated to `compositional-intent.ts` (zero runtime deps, beside `StructuralCoherenceError`) so it is unit-testable without loading the orchestrator's AI-service deps. The orchestrator imports and calls it; the persisted behavior is identical.

### 3.3 Construction omit — both sides (intent-constructor.ts, commit 3ff3821c)
`buildConstantWithScale` now:
```ts
const attach = scale.side === 'evaluator' && !otherSideIsDagDivide;
```
| scale.side | operand | OLD (HF-277) | NEW (HF-279) |
|---|---|---|---|
| evaluator | non-ratio (pre-computed metric) | attach | **attach (DD-7, KEPT)** |
| evaluator | DAG-divide ratio | omit | omit (HF-277, KEPT) |
| convergence | non-ratio | omit | **omit (binding scale_factor, KEPT)** |
| convergence | DAG-divide ratio | attach (HF-274) | **omit (NEW — retires HF-274)** |

**Reconciliation (documented in ADR):** the directive's §3B illustrative one-liner `const attach = !operandIsDagDivide` drops the `scale.side` guard and, taken literally, would ATTACH meta for a convergence-side non-ratio operand — double-scaling it against the binding's `scale_factor` (consumed at `run-calculation.ts:188`; `convergence-service.ts`). The directive's own prose ("meta.scale attaches **only for single pre-computed reference operands** (DD-7 path unchanged)") and §6 ("single pre-computed reference operand scale semantics — unchanged") bind the correct outcome. The implemented predicate omits for **every** DAG-divide operand on either side (the stated invariant) while preserving the convergence-non-ratio binding path. The `reference_field` guard is preserved as part of the unchanged DD-7 path.

---

## 4. Deterministic Verification (pre-PR) — PASS

`node --test --import tsx src/lib/plan-intelligence/__tests__/intent-constructor.test.ts` → **17/17 pass** (7 original + 10 new).

| # | Test | Asserts | Result |
|---|---|---|---|
| 8 | Coherent ratio band (quotient-space breaks, scale null) | divide over `on_time_deliveries / total_deliveries` built; **no meta on any constant**; breaks 0.85..0.98 survive raw | PASS |
| 9 | Backstop: ratio band + **evaluator** scale 100 | meta still omitted (generalizes HF-277) | PASS |
| 10 | Backstop: ratio band + **convergence** scale 100 | meta still omitted (retires HF-274 attach) | PASS |
| 11 | Convergence-side **non-ratio** band | meta omitted (scale_factor on binding) — preserved | PASS |
| 12 | DD-7: evaluator **metric** band + scale | break constants **KEEP** meta `{scale:100}` — **OLD === NEW** | PASS |
| 13 | Invariant: ratio band + **ambient** scale | raises `StructuralCoherenceError` ("quotient's own space") | PASS |
| 14 | Invariant: ratio band + **named** scale matching field | raises `StructuralCoherenceError` | PASS |
| 15 | Invariant: ratio band + scale **null** | does NOT throw | PASS |
| 16 | Invariant: DD-7 metric band + scale | does NOT throw (only ratio bands guarded) | PASS |
| 17 | Invariant: named scale binding a **non-ratio** axis of a mixed matrix | does NOT throw (precision — no false positive) | PASS |

§3C synthetic-coherent (Test 8), synthetic-incoherent (Tests 13/14), and DD-7 OLD===NEW (Tests 11/12/16) are all covered.

**Korean-test gate:** `[korean-test-gate] PASS`.
**Build (HALT-0):** `rm -rf .next && npm run build` → `✓ Compiled successfully` (prebuild korean-test PASS; the printed `Dynamic server usage` lines are standard Next.js static-prerender notices for cookie/request routes, not failures).
**Dev:** `npm run dev` → `localhost:3000 → HTTP 307` (auth middleware redirect; server Ready).

---

## 5. Korean Test / AUD-009 compliance
- Invariant keys on `reference_source.type === 'ratio'` + scale presence/binding + `scale.side`/`prime`/`op` only. **No** field/component/tenant literals, **no** magnitude thresholds, **no** break-space inference anywhere.
- One invariant, loud structured failure on the incoherent class wholesale — **not** an enumeration of failure shapes (AUD-009). DD-7 (single pre-computed `reference`) untouched; HF-275 untouched; non-band components untouched.

## 6. Files changed
```
web/src/lib/ai/providers/anthropic-adapter.ts            +16  (2.1 prompt)
web/src/lib/plan-intelligence/compositional-intent.ts    +74  (2.2 invariant)
web/src/lib/sci/plan-orchestration.ts                    +7   (2.2 call at seam)
web/src/lib/plan-intelligence/intent-constructor.ts      ~79  (2.3 construction omit)
web/src/lib/plan-intelligence/__tests__/...test.ts       +205 (Phase 3 tests)
```

---

## 7. Post-merge production gate — Cold re-import reconciliation (SR-44, OUTSTANDING)

Per §2.4/SR-43 the stale Meridian percent-break c1 is NOT migrated in code — it regenerates on cold re-import, which is part of this work item. These steps require the architect channel (live tenants + LLM import + Supabase; the prior HF-277 report recorded the BCL/Meridian rule_sets as wiped). They are the documented handoff and the merge's production proof gate — **not yet executed in this environment** (no live-tenant claim made; AP-20 honored):

1. **Cold re-import Meridian** → recognition emits c1 breaks in quotient space (`[0.85,0.90,0.95,0.98]`-form), no scale → Q1 reconciliation must hold: **185,063 / 175,585 / 196,337**, all five components exact.
2. **Cold re-import BCL** → c1 ejecutivo coherent (ratio breaks, no scale) → GT c1 **10,170 / 12,530 / 18,140**; grands **44,590 / 46,291 / 61,986**.
3. **SQL assert (HALT-3):** read both persisted c1 intents → no `scale` node accompanies any ratio-source dimension. If a stale/non-conforming intent persisted with a scale, the loud-failure invariant (2.2) must have fired instead; if neither, stop and trace.
4. **Second Meridian import** → fingerprint match, non-amnesiac (Progressive Performance).

## 8. Branch note
`dev` is 4 HFs behind `main` (sits at HF-272, missing HF-273-277). The directive's nominal `--head dev` would lose HF-277 and trip HALT-1. Per the repo's actual pattern (one feature branch per HF → PR to `main`, e.g. #465), this work is on `hf-279-dag-divide-band-coherence` off current `main`. PR opened `--base main`.

---
*HF-279 · DAG-Divide Band Coherence · vialuce.ai*
