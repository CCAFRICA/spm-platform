# HF-280 Completion Report — Plan-Import Atomicity

**Date:** 2026-06-09
**Branch:** `hf-280-import-atomicity` (from `main` @ 0e386878, the HF-279 merge)
**Builds on:** HF-279 (PR #466, merged)
**Status:** Implemented + deterministic verification PASS + build/dev PASS. **Post-merge cold re-import (SR-44) is the outstanding production gate — see §7.**

---

## 1. Phase 0 — Reads (pasted)

### 0.1 / 0.2 The component loop and the failed-outcome path
`orchestratePerComponentInterpretation` (`plan-orchestration.ts`) is a **pure interpretation function** — it does NOT persist (file comment, line 144). It runs each variant×component through `callPlanComponentWithRetry`, assembles `interpretation.components` with **only the successful components** (`if (r.component) components.push(...)`, line 310), and returns `{ interpretation, componentOutcomes, partialSuccess, retryableFailures }`. `partialSuccess = successCount > 0 && failureCount > 0` (line 315). On retry exhaustion the per-component loop records a `failed` outcome (lines 694–708) — it does not throw.

### 0.3 The persistence seam (where the abort must precede)
`plan-interpretation.ts` `executeBatchedPlanInterpretation` calls the orchestrator (line 251), then the failure guard (pre-HF-280, line 270):
```
if (orchestration.skeletonError || componentsCount === 0) { ... refuse to persist ... }
```
with the explicit comment: *"partialSuccess (some succeeded, some failed) is NOT a hard failure — it persists what worked and surfaces the rest via componentOutcomes."* The guard only fires when **zero** components succeed. Partial success flows past it to `rule_sets` supersede (line 315) + upsert (line 350). **This is the defect — HALT-1 does NOT fire (the orchestrator does not abort on partial; this caller deliberately persists it).**

### 0.4 The retry envelope
`callPlanComponentWithRetry` → `aiService.interpretPlanComponent(content, format, spec, signalContext, pdf*, fieldAnchor)` (`plan-orchestration.ts:480`). The signature had **no retry-feedback parameter** — the prompt is rebuilt from `spec` alone each attempt. (`interpretation-errors.ts` HF-265 comment already noted: temperature-0 + no retry-hint → "the retry may reproduce the same output.") So the violation message did **not** reach the model on retry.

### 0.5 DB evidence — the smoking gun (both tenants, post-HF-279 re-imports)
Variant inventory (`scripts/hf280-phase0-evidence.ts`):
```
Meridian rule_set 8c7feb52: variant "coordinador-senior" n=4, variant "coordinador" n=4
  [Entrega a Tiempo, Cuentas Nuevas, Registro de Seguridad, Utilización de Flota]   (plan has 5 — one missing from BOTH)
BCL rule_set 4e5d0f1e: variant "ejecutivo-senior" n=4 (incl. Captación de Depósitos)
                       variant "ejecutivo"        n=3 (Captación de Depósitos ABSENT)
```
componentOutcomes for BCL (`scripts/hf280-outcomes.ts`, import_batch 99cd756d, 2026-06-09T17:52:38Z):
```
[ok  ] c2-ejecutivo-senior "Captación de Depósitos" attempts=1
[FAIL] c2-ejecutivo        "Captación de Depósitos" attempts=3 errClass=cognition_violation
       msg="...composed a structurally-incoherent intent: a ratio-source band
       (reference_field='deposit_achievement') was emitted WITH a scale
       (side='convergence', value=100..."
partialSuccess=true  ->  rule_set 4e5d0f1e PERSISTED with ejecutivo missing c2.
```
This **confirms the mechanism and clears both HALTs:**
- **HALT-1 cleared** — the import persisted the partial plan (`partialSuccess=true`); the orchestrator/caller did not abort.
- **HALT-2 cleared** — the missing component WAS attempted: 3 attempts (the full `cognition_violation` budget), not an enumeration defect. The HF-279 invariant fired exactly as designed.
- **Retry-feedback need confirmed** — all 3 attempts produced the identical violation; the model never received the violation text, so the retry was not a retry.

---

## 2. ADR
Committed at `docs/completion-reports/HF-280_ADR.md` (45435e06). Invariant: a rule set persists only if every component of every variant completed recognition; any failure after retries aborts the import. Outcome-only predicate (no registry of drop reasons). Options B (persist + flag), C (per-cause handling), D (more retries without feedback) rejected.

---

## 3. Implementation (diffs by file)

| File | Change |
|---|---|
| `plan-interpretation.ts` | **2.1** Extract pure `evaluateImportAtomicity({skeletonError, componentsCount, componentOutcomes})`; guard now aborts on ANY `status !== 'success'` (was: only `componentsCount === 0`), before any `rule_sets` supersede/upsert. Reuses the existing `failRun` + `{success:false, error}` return. |
| `interpretation-errors.ts` | **2.1** `ComponentOutcome` gains optional `appliesTo?: string[]` (variant id — display data for the failure message). |
| `plan-orchestration.ts` | **2.1** `runOne` carries `appliesTo` onto the failed outcome. **2.2** the recognition call forwards `lastErrMessage` when `attempt > 1 && lastErrClass === 'cognition_violation'`. |
| `ai-service.ts` | **2.2** `interpretPlanComponent` gains `retryFeedback?: string` → `input.retryFeedback`. |
| `anthropic-adapter.ts` | **2.2** `plan_component` prompt appends a cause-agnostic rejection block embedding the structured error **verbatim** when `input.retryFeedback` is present. |

**Atomicity predicate (Korean Test):** `outcome.status !== 'success'` only — no component/tenant/field literals, no failure-cause enumeration; every cause aborts identically (AUD-009 — no registry of drop reasons). Component name + variant + error are display data carried verbatim from the outcome.

**Vertical Slice:** the abort reuses the import pipeline's existing failure channel — `executeBatchedPlanInterpretation` returns `{success:false, error}`, and `execute-bulk/route.ts` surfaces `results[].error` and flips `overallSuccess = results.every(r => r.success)` to false. Importer-visible; no new chrome.

**Retry feedback (Korean Test):** pass-through only; the cause-agnostic frame ("YOUR PREVIOUS ATTEMPT … WAS REJECTED … the structured error was:") carries the error text verbatim; no per-cause template. The 3-attempt `cognition_violation` budget (HF-265) already exists; attempts 2–3 now carry feedback.

---

## 4. Deterministic Verification (pre-PR) — PASS

`node --test --import tsx src/lib/sci/__tests__/import-atomicity.test.ts` → **7/7 pass**.

| Test | Asserts | Result |
|---|---|---|
| One failed component (BCL c2-ejecutivo shape) | aborts; reason matches `HF-280 atomicity`, `Captación de Depósitos`, `[variant ejecutivo]`, `deposit_achievement`, `1 of 5` | PASS |
| All components succeed | `evaluateImportAtomicity` → `null` (persist proceeds, unchanged) | PASS |
| Zero usable components | aborts with "produced no components" (DD-7 message preserved) | PASS |
| Skeleton failure | aborts with "Plan skeleton call failed: HTTP 503" (DD-7 preserved) | PASS |
| Skipped-from-prior success (resume) | does NOT abort | PASS |
| Retry envelope (retryFeedback present) | prompt contains rejection block + the violation **verbatim** | PASS |
| First attempt (no retryFeedback) | no rejection block (DD-7 — prompt unchanged) | PASS |

§3C mapping: test 1 = abort + structured failure (zero rows: the abort returns before the supersede/upsert at `plan-interpretation.ts`); test 2 = all-success persist-proceeds; test 3 = retry envelope carries the prior violation.

**Regression:** HF-279 construction (17) + adapter normalization (11) + HF-280 (7) = **35/35 pass**.
**Korean-test gate:** PASS. **Build (HALT-0):** `rm -rf .next && npm run build` → `✓ Compiled successfully`. **Dev:** `localhost:3000 → HTTP 307`.

---

## 5. Scope / out of scope
HF-279 invariant, prompt rule, construction omit — untouched. No import-UX redesign (existing failure channel reused). No in-code migration of pre-existing partial plans (§6A — cold re-import supersedes, same disposition as HF-279 §2.4). DD-7: every successfully-recognized component path unchanged.

## 6. Files changed
```
web/src/lib/sci/plan-interpretation.ts        +80/-19  (2.1 atomicity + evaluateImportAtomicity)
web/src/lib/sci/interpretation-errors.ts      +8       (2.1 appliesTo)
web/src/lib/sci/plan-orchestration.ts         +13      (2.1 carry appliesTo + 2.2 feedback threading)
web/src/lib/ai/ai-service.ts                  +9       (2.2 retryFeedback param)
web/src/lib/ai/providers/anthropic-adapter.ts +12      (2.2 prompt rejection block)
web/src/lib/sci/__tests__/import-atomicity.test.ts +103 (Phase 3 tests)
scripts/hf280-phase0-evidence.ts, hf280-outcomes.ts   (Phase 0.5 evidence, read-only)
```

---

## 7. Post-merge production gate — Cold re-import (SR-44, OUTSTANDING)
Requires the architect channel (live tenants + LLM import + Supabase) — not executed in this environment (no live-tenant claim; AP-20 honored). Steps:
1. Cold re-import **Meridian** → expect either (a) **5 components in both variants** → Jan/Feb/Mar **185,063 / 175,585 / 196,337** exact, or (b) a **loud import failure naming the failing component** — never a silent 4-component plan.
2. Cold re-import **BCL** → ejecutivo carries **Captación de Depósitos** → Oct/Nov/Dec c1 **10,170 / 12,530 / 18,140**; grands **44,590 / 46,291 / 61,986**.
3. Variant inventory SQL (n_components + names per variant, both rule_sets) — `scripts/hf280-phase0-evidence.ts`.
4. HALT-3 ratio/scale SQL on both new rule_sets.
5. Second Meridian import → fingerprint match, non-amnesiac.

If path (b) occurs (recognition still cannot emit a coherent intent within the budget **even with feedback**), that is the system working as designed: the import fails loudly with the emission visible, and the residual is a recognition-quality item to disposition from the surfaced error — **not** a reason to weaken atomicity (directive §3C, §6A).

## 8. Branch note
Per the HF-279 pattern (`dev` is stale): work on `hf-280-import-atomicity` off current `main`; PR `--base main`.

---
*HF-280 · Plan-Import Atomicity · vialuce.ai*
