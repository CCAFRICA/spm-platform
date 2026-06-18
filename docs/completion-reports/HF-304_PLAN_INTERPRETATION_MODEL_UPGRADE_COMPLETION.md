# HF-304 — Plan-Interpretation Model Upgrade to Opus — Completion Report

**Date:** 2026-06-17 · **Branch:** `hf-304-plan-interp-opus` · **Base HEAD:** `b21c8bb4` (main).
**Status:** BUILT · build exit-0 · dev up · **awaiting architect SR-44 production verification (Meridian re-import) before merge — DO NOT merge per §9.**
**Change:** route the plan-interpretation task family to Opus (`claude-opus-4-8`). Single named change. AUD-017 remediation.

---

## 1 — Number + HEAD
HF-304 confirmed free (docs + commits; the `*_DIRECTIVE_*.md` in vp-prompts is the architect's save). Base HEAD `b21c8bb4`. Branch `hf-304-plan-interp-opus`.

## 2 — The real before-state (§4) — with correction
**Model in force for plan interpretation:** `this.config.model`, resolved at `ai-service.ts:37`:
```ts
model: process.env.NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6',
```
and applied to the API request at the single execute seam `anthropic-adapter.ts` (the `requestBody`):
```ts
model: this.config.model || 'claude-sonnet-4-6',     // pre-HF-304 — shared by ALL tasks on this path
```
**Mechanism:** a single shared global. Every AI task on the main execute path uses `this.config.model` (= `NEXT_PUBLIC_AI_MODEL` or the `claude-sonnet-4-6` fallback). There is **no per-task branch**. The plan pipeline reaches this exact seam via `ai-service` → `interpretPlanSkeleton`/`interpretPlanComponent`/`interpretPlan` → `adapter.execute(request)`.

**Correction of a prior characterization (per §4 / §1):** the directive flagged the `NEXT_PUBLIC_AI_MODEL` env-fallback as "unverified and believed incorrect." **It is on screen and correct** — `ai-service.ts:37` is exactly that env-fallback (default `claude-sonnet-4-6`). I report what's in the code: the env-var fallback IS the mechanism.

**HALT-1 not triggered:** there IS a single selection point reachable by the plan tasks (the `requestBody` model line). It's shared (no per-task branch), so §6's "introduce the minimal per-task branch" path applies.

**Seam discovery (the real shape):** "plan interpretation" is **four** typed tasks in code (`types.ts:67-70`): `plan_interpretation` (legacy monolithic), `plan_skeleton` (Phase A), `plan_component` (Phase B — *where the c1-senior emission fails*), `plan_component_with_chunking`. Routing only the literal `plan_interpretation` would NOT fix c1-senior (Phase B = `plan_component`). Per the directive's §4/§11 adapt-to-the-real-seam clause, the whole reasoning family is routed to ONE model (Opus) — not a per-task model map.

## 3 — Confirmed Opus identifier (§5)
Live `/v1/models` (key `ANTHROPIC_API_KEY` from `.env.local`, the var the adapter reads at `:977`):
```
"id":"claude-opus-4-8"   ← latest Opus (selected)
"id":"claude-opus-4-7"
"id":"claude-opus-4-6"
"id":"claude-opus-4-5-20251101"
"id":"claude-opus-4-1-20250805"
```
**Selected: `claude-opus-4-8`** (highest Opus; confirmed from the API, not memory). HALT-2 not triggered.

## 4 — The diff (§6) — single named change, one file (+19/−1)
`web/src/lib/ai/providers/anthropic-adapter.ts`:
```diff
+const PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8';
+const PLAN_INTERPRETATION_TASKS: ReadonlySet<AITaskType> = new Set<AITaskType>([
+  'plan_interpretation', 'plan_skeleton', 'plan_component', 'plan_component_with_chunking',
+]);
 …
   const requestBody = JSON.stringify({
-    model: this.config.model || 'claude-sonnet-4-6',
+    // HF-304 (AUD-017): plan-interpretation tasks → Opus; every other task keeps its configured model.
+    model: PLAN_INTERPRETATION_TASKS.has(request.task)
+      ? PLAN_INTERPRETATION_MODEL
+      : (this.config.model || 'claude-sonnet-4-6'),
     max_tokens: request.options?.maxTokens || 8192,
```
- **Korean Test:** keyed on the typed `request.task` discriminant; the Opus id is a single named constant; zero language/tenant literals.
- **DD-7:** every non-plan task still resolves to `this.config.model` exactly as before. The shared default is untouched; one per-task branch added. No adapter/service/orchestrator/constructor/grammar refactor.
- **Noted residual (not changed, DD-7):** the two error-tagging `providerModel = this.config.model || …` lines (`:~1110/1121`) still report the config model on a hard error; for a plan task they'd report sonnet though Opus was sent. Cosmetic error-context only (fires only on provider hard-error); left untouched per "no other edit." Flag for a one-line follow-up if desired.

## 5 — Build + serve (§7, the part I can run)
```
rm -rf web/.next && npm run build  →  ✓ Compiled successfully, types validated, BUILD_EXIT=0
npm run dev  →  ✓ Ready;  curl localhost:3000 → 307 (root → /login auth redirect);  curl /login → 200
```
tsc clean for the changed file.

## 5b — Meridian re-import (§7 pass criteria) — ARCHITECT SR-44 (I cannot browser-import)
_[architect, production]_ Re-import `Meridian_Plan_Incentivos_2025.pptx`; expect, in the plan-orchestrator log:
- `c1-senior` constructs `rateTableCellCount=20`, `shape=banded_lookup`.
- Phase B `10/10 components succeeded, 0 failed`.
- No `cognition_truncation` / `output count 19 does not match dimension product 20` on any component.

**HALT-3 (carry):** if c1-senior still fails the cell-count check under Opus, paste the raw pre-normalization CompositionalIntent JSON and HALT — do NOT patch the constructor/grammar; the model was not the sole cause (AUD-017 §7 reopens).

## 6 — HALT disposition
- HALT-1 (no single seam): **not fired** — single seam at the requestBody model line.
- HALT-2 (Opus id unconfirmed): **not fired** — `claude-opus-4-8` confirmed via `/v1/models`.
- HALT-3 (Meridian still fails under Opus): **pending** the architect's SR-44 re-import.

## Out of scope (§10) / Residuals (§11)
Untouched: AI-service/adapter/orchestrator refactor, retry logic, intent-constructor, emission grammar, the dimension-product check, MIR convergence misbinding, the 8 threshold-debt items. The single named constant `PLAN_INTERPRETATION_MODEL` is the seam the future Observatory per-task model CLT will lift. AUD-017 §7 carry-forward: once Opus resolves c1-senior, validate plan-interpretation across BCL/Meridian/CRP/MIR (not a gate on this HF).

---

*HF-304 · Plan-Interpretation Model Upgrade to Opus · 2026-06-17 · vialuce.ai*
