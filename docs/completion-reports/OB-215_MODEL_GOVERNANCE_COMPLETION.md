# OB-215 — Model Governance: Unified Resolver · Observatory Control · Metrics Elevation — Completion Report

**Date:** 2026-06-18 · **Branch:** `ob-215-model-governance` · **HEAD:** `000a33b1` · **Base:** `ba8c4a4c` (main).
**Status:** BUILT — `next build` exit-0, `tsc --noEmit` clean, dev `/login` 200. **NOT merged** — awaiting architect SR-44 (Meridian re-import + Observatory browser verification + `ai_call_metrics` migration apply).
**Implements:** the AUD-018 HALT-0 advisories (Files A/B) this OB was scoped to execute. 17 files, +1131/−56.

---

## 1 — Number + ledger
HF/OB-215 confirmed free (HALT-1 not fired): the only `OB-215` match was the architect's untracked directive-save `docs/vp-prompts/OB-215_..._DIRECTIVE_20260618.md`; no commit/branch/PR. Base HEAD `ba8c4a4c`. Branch `ob-215-model-governance`.

---

## 2 — Agent A: Model resolver + temperature fix + seam consolidation

### `web/src/lib/ai/model-policy.ts` (NEW, 212 lines) — the single source of truth
Exports: `OPUS_MODEL`/`DEFAULT_MODEL` (the ONLY model literals in the codebase), `defaultModel()` (env/default), `PLAN_INTERPRETATION_TASKS`, `ALL_AI_TASKS`, `resolveModel(task, {configModel})`, `getModelPolicy()`, `applyModelOverrides()`/`getModelOverrides()`/`clearModelOverrides()`, `modelRejectsSamplingParams()` + `DEPRECATED_SAMPLING_PARAMS`, `MODEL_PRICING`/`pricingFor()`/`computeCallCostUSD()`, `AVAILABLE_MODELS`. Keyed only on the typed `AITaskType` (Korean Test). `resolveModel` precedence: persisted override → explicit config model → (plan family → Opus, else env/default).

### The 4 seams consolidated (AUD-018 File A)
| Seam | Before | After |
|---|---|---|
| `ai-service.ts:37` ctor | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | `defaultModel()` (literal moved to model-policy) |
| `anthropic-adapter.ts:1071-73` execute() | `PLAN_INTERPRETATION_TASKS.has(...) ? PLAN_INTERPRETATION_MODEL : (this.config.model \|\| 'claude-sonnet-4-6')` + local constants | `resolveModel(request.task, {configModel})`; local `PLAN_INTERPRETATION_MODEL`/`TASKS` removed |
| `anthropic-adapter.ts:1188` executeAgentTurn() | `req.model \|\| this.config.model \|\| 'claude-sonnet-4-6'` | `req.model \|\| defaultModel()` |
| `reconcile-diagnose/route.ts:54` | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | `defaultModel()` |

**Divergences from the directive's literal examples (surfaced, not silently worked around):**
- §4.2 said `resolveModel(req.task ...)` for executeAgentTurn — but `AgentTurnRequest` has **no `task` field** (it carries `model?`/`system`/`messages`/`tools`). Used `req.model || defaultModel()`, which is the correct per-agent-override-then-default semantics.
- §4.2 said `resolveModel('reconciliation_diagnosis')` — there is **no such `AITaskType`**; the route is the agent-runtime path. Used `defaultModel()`.

### Resolved-model propagation (foundational telemetry fix)
The adapter `execute()` now **returns the resolved model**; `types.ts` `AIProviderAdapter.execute` no longer `Omit`s `model`. `AIService` reports `adapterResponse.model` (success) / `resolveModel(task)` (both error paths + the hard-error log) instead of `this.config.model` — so cost/telemetry name **Opus on plan tasks**, not the constructor default. This is the root of the AUD-018 File A mislabel.

### Temperature fix (§4.3) — the live import blocker
NEW private `AnthropicAdapter.buildRequestBody()` shared by `execute()` **and** `executeAgentTurn()`. The deprecation guard is written ONCE:
```ts
if (opts.temperature !== undefined && !modelRejectsSamplingParams(opts.model)) {
  body.temperature = opts.temperature;   // omitted entirely for Opus/Fable (which 400 on it)
}
```
`tools` is included only when provided (the one structural delta). This **closes the AUD-018 File B blocker**: HF-304 routed plan tasks to Opus 4.8 but `execute()` still sent `temperature` unconditionally → 400. Now temperature is omitted for the deprecating tier.

> **Tension carried from AUD-018 (read this):** the architect observed the 400 on `claude-sonnet-4-6`, but File B's analysis (and this fix) treats only Opus/Fable as the rejecting tier (Sonnet 4.6 tolerates `temperature`). If the prod 400 was genuinely on Sonnet-4-6, then Sonnet-4-6 is also in the rejecting tier — the single fix point is `SAMPLING_PARAM_REJECTING_PATTERNS` in `model-policy.ts` (add `/^claude-sonnet-4-6/`). The §8.3 Meridian re-import will confirm which: it now runs plan tasks on Opus with temperature omitted.

### §8.1 proof (HALT-2): ZERO model literals outside `model-policy.ts`
```
$ grep -rnE "claude-[a-z0-9.\-]+" web/src --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v model-policy.ts | grep -v "\.test\."
(no output)  → ✓ PASS
```

---

## 3 — Agent B: Observatory model-control surface

- **Persistence — reuses `platform_settings` (NO new config migration).** `model-policy-loader.ts`: `ensureModelPolicyLoaded()` reads key `ai_model_config` (per-process TTL cache, silent fallback to code defaults), `applyModelOverrides()` into the resolver. `writeModelConfig()` **upserts** (so no seed row is required). `AIService.execute()` calls `ensureModelPolicyLoaded()` before resolving → an operator change governs within ~60s **without a code deploy** (Decision 110).
- **API:** `/api/platform/model-config` GET (policy + available models + plan family + deprecated-sampling models) and PATCH (validated overrides), platform-admin gated.
- **UI:** `ModelConfigTab.tsx` → new **"Model Config"** Observatory tab. Per-task `<select>` grouped plan-family vs general; a "no sampling params" badge for deprecating models; Save → PATCH. Keyed on `AITaskType`.
- **Architect SR-44 (browser):** open Observatory → Model Config; change a task's model; reload → persists. (I cannot browser-verify.)

---

## 4 — Agent C: Metrics + cost capture + Observatory elevation

- **Table:** NEW `web/supabase/migrations/20260618000000_ob215_ai_call_metrics.sql` — `task/provider/model/tokens_in/out/latency_ms/cost_usd/status/created_at`, 3 indexes, tenant-isolation RLS. **HALT-MIG: architect applies it in the Supabase SQL Editor.** (AUD-018: `agent_invocations` is agent-runtime-only — 4 NOT-NULL agent columns — and does not fit the 20 single-call surfaces.)
- **Capture:** `ai-metrics-writer.ts` `recordAICallMetric()` (fire-and-forget, never throws/blocks, skips `tenant=unknown`), cost via `computeCallCostUSD × MODEL_PRICING`. Wired into all 3 `execute()` exit paths (success / provider_error / degraded).
- **API + UI:** `/api/platform/ai-metrics` GET (totals all-time-window + 30d, by task/model/tenant; `tableReady:false` guard pre-migration; `capped` flag — no silent truncation). `AIMetricsTab.tsx` → new **"AI Cost"** tab.
- **Cost basis (§6.3/D §7.3):** `InfrastructureTab.tsx:320` Haiku `$0.003/call` (dead-code path, AUD-018 File A) → Sonnet-blended `$0.02/call` pointing at the authoritative AI-Cost panel. Live cost is now the metrics panel.
- **Architect SR-44:** apply the migration, then the Meridian re-import row should appear in AI Cost (task/model/tokens/cost/tenant).

---

## 5 — Agent D: Telemetry label correction
- `header-comprehension.ts` ×4 `llmModel` labels: `'claude-sonnet-4-6'` → `resolveModel('header_comprehension')`.
- Error-tag `providerModel` (`anthropic-adapter.ts` execute ×2 + executeAgentTurn ×2): `this.config.model || 'claude-sonnet-4-6'` → the resolved model (done in Phase A — names Opus on plan-task errors).
- `InfrastructureTab` cost basis: see §4.

---

## 6 — Proof gates (§8)
| Gate | Result |
|---|---|
| §8 build + serve | `next build` exit-0 (Korean-test gate PASS); `tsc --noEmit` clean; dev `/` 307→`/login` 200; `/api/platform/{model-config,ai-metrics}` 401 unauth (gate works). |
| §8.1 no scattered literals | ✓ PASS (grep above, zero hits outside model-policy.ts). |
| §8.2 no unconditional temperature | ✓ PASS — `buildRequestBody` line 1246 guards on `modelRejectsSamplingParams`; no unconditional `temperature:` in either body builder. |
| §8.3 Meridian re-import | **ARCHITECT SR-44** — re-import `Meridian_Plan_Incentivos_2025.pptx`; expect no temperature 400, `c1-senior rateTableCellCount=20/banded_lookup`, Phase B 10/10, `model=claude-opus-4-8` on plan_skeleton/plan_component. |
| §8.4 Observatory surfaces | **ARCHITECT SR-44** — Model Config edit+reload persistence; AI Cost shows the re-import call. |
| §8.5 BCL non-regression | **ARCHITECT SR-44** — BCL Oct still calculates (resolver does not regress single-file tenants; non-plan tasks keep the default model + temperature). |

---

## 7 — HALT disposition
- **HALT-1** (number taken): not fired — directive-save only.
- **HALT-2** (literals remain after consolidation): not fired — §8.1 clean.
- **HALT-3** (Meridian still fails the cell-count under Opus, post-temperature-fix): **pending** the architect's §8.3 re-import. If it fires, paste the raw CompositionalIntent and HALT — do NOT patch the constructor/grammar (AUD-017 §7 reopens).

## 8 — Architect actions to close OB-215 (in order)
1. Apply `web/supabase/migrations/20260618000000_ob215_ai_call_metrics.sql` in the Supabase SQL Editor.
2. Verify prod deploy SHA contains `000a33b1`.
3. §8.3 Meridian re-import (the regression closure that started this session).
4. §8.4 Observatory (Model Config persistence + AI Cost panel) and §8.5 BCL non-regression.
5. Merge.

## 9 — Out of scope / residuals (§11/§12)
Per-tenant model overrides (resolver signature is ready; wiring a per-tenant row is incremental); live `/v1/models` inventory + model-retirement alerting (AVAILABLE_MODELS is static today); AUD-017 §7 cross-tenant validation (BCL/Meridian/CRP/MIR) once Opus resolves c1-senior; the 8 threshold-debt items (separate class); MIR convergence multi-file routing. The `resolveModel`/Observatory seam closes the per-task model-control CLT parked repeatedly this session.

---

*OB-215 · Model Governance · 2026-06-18 · vialuce.ai · NOT merged — architect SR-44 gate.*
