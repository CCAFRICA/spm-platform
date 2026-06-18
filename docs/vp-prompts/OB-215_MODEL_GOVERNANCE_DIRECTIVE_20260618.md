# OB-215 — Model Governance: Unified Resolver · Observatory Control · Metrics Elevation

**Date:** 2026-06-18
**Type:** OB — new platform capability + consolidation + regression fix
**Sequence:** OB-215 (architect-assigned). Phase 0 confirms the number is free before any output.
**Execution mode:** ULTRACODE / effort-mode native. Four agents: **A is foundational** (resolver +
temperature fix); **B, C, D fan out in parallel after A completes** (Observatory control, metrics
capture, telemetry correction). Effort level maximizes coverage and parallelism within the read-write
fence of each agent's scope.

**Evidence base:** AUD-018 Files A, B, C, D (committed at `docs/audits/AUD-018_*.md`, branch
`aud-018-pipeline-forensic`). Every file:line cited below is from that audit's pasted evidence on
`CURRENT_SHA = ba8c4a4c`. This OB implements the HALT-0 advisories AUD-018 recorded but was fenced from
executing.

This directive is the prompt (DD-11). Phase prose is the executable. Nothing follows §12. Read
`CC_STANDING_ARCHITECTURE_RULES.md` first.

---

## §0 — CC Standing Rules + Ultracode Orchestration

`CC_STANDING_ARCHITECTURE_RULES.md` applies in full. Drafted against
`INF_Structured_Compliant_Drafting_Reference_20260513.md` (DD-1 through DD-12). Binding throughout:
Rules 25-28 (completion report before final build), SR-34 (no bypass — fix at the structural-class
layer), SR-44 (pasted evidence at every gate), Korean Test (Decision 154 — structural identifiers only,
zero language-specific literals), Decision 110 (the flywheel produces values, not developers — model
selection is the same prohibited class as the 8 developer-set thresholds).

Commit + push after every change. Git from repo root (`spm-platform`), NOT `web/`. Kill dev server →
`rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 before the completion report.

**Ultracode orchestration plan:**

```
Phase 0 (single-threaded) — ledger, collision check, branch
    │
    ▼
Agent A (FOUNDATIONAL — must complete before B/C/D)
    Model resolver + temperature fix + seam consolidation
    │
    ├──► Agent B (parallel) — Observatory model-control surface
    ├──► Agent C (parallel) — Metrics/cost capture + Observatory elevation
    └──► Agent D (parallel) — Telemetry label correction
    │
    ▼
Phase FINAL (single-threaded) — build, prove, completion report
```

Agent A is the dependency: B reads the resolver to build the control surface, C hooks the resolver for
per-call metrics, D reads the resolver's resolved model to fix labels. A must be committed and importable
before B/C/D begin.

---

## §1 — Problem Statement

AUD-018 inventoried the complete model-governance surface. The findings, verbatim from the audit:

**Model selection is scattered across 4 independent seams that can drift:**
1. `ai-service.ts:37` — service constructor, `NEXT_PUBLIC_AI_MODEL || 'claude-sonnet-4-6'`, env UNSET →
   hardcoded fallback governs ALL non-plan tasks.
2. `anthropic-adapter.ts:29 + :1071-1073` — HF-304 plan branch, `PLAN_INTERPRETATION_MODEL = 'claude-opus-4-8'`,
   keyed on `PLAN_INTERPRETATION_TASKS`.
3. `anthropic-adapter.ts:1188` — `executeAgentTurn()` seam, own model resolution with NO plan branch.
4. `reconcile-diagnose/route.ts:54` — parallel env read outside the service constructor.

**A deprecated `temperature` parameter aborts every plan import under Opus:**
`anthropic-adapter.ts:1075` sends `temperature` unconditionally; Opus 4.8 rejects it with 400. The
sibling `executeAgentTurn()` at `:1187` already omits it (comment `:1184-1186` names the cause). HF-304
routed plan tasks to Opus without removing `temperature`. This is the live regression blocker.

**Telemetry mislabels the model at 7+ sites:**
`header-comprehension.ts:184/253/391/430` (hardcoded `'claude-sonnet-4-6'` telemetry labels),
`anthropic-adapter.ts:1116/1127` (error-tag `providerModel`), `InfrastructureTab.tsx:320` (Haiku cost
basis while running Sonnet/Opus).

**No operator control, no metrics, no cost visibility:**
Model selection is a code constant. No Observatory surface to change the model per task, see call counts,
or track cost by tenant. A model retirement (which just happened) requires a code deploy, another audit,
and another regression. This is the same prohibited class as the 8 developer-set thresholds: a
quality-governing constant buried in code that should be an operator-controlled, observable setting.

**This OB retires the class.** One resolver, one control surface, one metrics pipeline, and the
temperature fix — so model changes are an Observatory setting, not a code hunt.

---

## §2 — Substrate-Bound Discipline Applications

- **Decision 110 (flywheel produces values, not developers):** the 4 scattered model literals are the same
  class as the 8 float thresholds — developer-set authority values governing quality. The resolver
  replaces them with a single configurable policy, the way HF-303 replaced the 0.5 rollup cutoff with
  argmax.
- **Korean Test (Decision 154):** the resolver keys on the typed `AITaskType` discriminant — structural,
  never on tenant data or language. The Observatory control writes to a config table keyed by task, not by
  tenant column name.
- **Vertical Slice (Decision 94):** the resolver (engine) and the Observatory surface (experience) ship
  together. Not separate OBs for the function vs the UI.
- **Prove Don't Describe (IGF-T1-E905) / SR-44:** proof gate is the Meridian re-import showing Phase B
  10/10 under Opus with no temperature 400 — the regression that started this session, closed by this OB.

---

## §3 — Phase 0: Ledger + branch (single-threaded, before fan-out)

```bash
cd "$(git rev-parse --show-toplevel)"
# Collision check
ls docs/vp-prompts/ docs/diagnostics/ docs/completion-reports/ docs/audits/ 2>/dev/null | grep -iE "OB-215" || echo "OB-215 free."
git checkout main && git pull --ff-only
git checkout -b ob-215-model-governance
```

**HALT-1:** if `OB-215` already exists in any ledger directory, surface and stop.

---

## §4 — Agent A (FOUNDATIONAL): Model Resolver + Temperature Fix + Seam Consolidation

This agent produces the function that all other agents depend on. It must be committed and importable
before B/C/D begin. Scope: one new file + edits to the 4 seam files + the adapter body builder.

### §4.1 — Create `web/src/lib/ai/model-policy.ts`

A single source of truth for model selection. The resolver is a pure function keyed on `AITaskType`:

```
resolveModel(task: AITaskType, config?: { envModel?: string }): string
```

**Requirements:**
- Returns the model string for any task. Plan-interpretation tasks (`plan_interpretation`,
  `plan_skeleton`, `plan_component`, `plan_component_with_chunking`) → Opus (the constant from HF-304).
  All other tasks → the configured default (env or fallback).
- The task→model mapping is a single, exported, named constant (e.g. `MODEL_POLICY`) — a plain object or
  Map, NOT scattered ternaries. This is the table the Observatory reads and writes.
- The Opus identifier and the default Sonnet identifier are named constants in this file, not string
  literals repeated at each seam.
- Export a `getModelPolicy(): Record<AITaskType, string>` that returns the full current mapping — this is
  what the Observatory control surface reads.
- Export a `DEPRECATED_PARAMS_BY_MODEL` set or function: models in the Opus/Fable tier that reject
  `temperature` and other sampling params. The body-builder uses this to conditionally omit deprecated
  params.

**Korean Test:** the resolver keys on `AITaskType` only. No tenant, no language, no column name.

### §4.2 — Consolidate the 4 seams to call `resolveModel`

For each seam found by AUD-018 File A, replace the inline model resolution with a call to `resolveModel`:

| Seam | Current code (from AUD-018) | Change |
|------|---------------------------|--------|
| `ai-service.ts:37` | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | Remove the hardcoded model from the constructor. The constructor no longer sets `this.config.model` as the governing default — `resolveModel(task)` is called per-request at the adapter, not once at construction. If `NEXT_PUBLIC_AI_MODEL` is set as an env var, `model-policy.ts` reads it as the non-plan default. |
| `anthropic-adapter.ts:1071-1073` | `PLAN_INTERPRETATION_TASKS.has(request.task) ? PLAN_INTERPRETATION_MODEL : (this.config.model \|\| 'claude-sonnet-4-6')` | Replace with `resolveModel(request.task)`. Remove the local `PLAN_INTERPRETATION_MODEL` / `PLAN_INTERPRETATION_TASKS` constants — they move into `model-policy.ts`. |
| `anthropic-adapter.ts:1188` | `req.model \|\| this.config.model \|\| 'claude-sonnet-4-6'` | Replace with `req.model \|\| resolveModel(req.task \|\| 'default')`. The per-agent `def.model` override is preserved (it's the `req.model` path), but the fallback now goes through the resolver instead of its own inline chain. |
| `reconcile-diagnose/route.ts:54` | `process.env.NEXT_PUBLIC_AI_MODEL \|\| 'claude-sonnet-4-6'` | Replace with `resolveModel('reconciliation_diagnosis')` (or the appropriate task type). Remove the parallel env read — it must not independently resolve the model outside the resolver. |

After consolidation, grep the codebase to confirm ZERO remaining inline `'claude-sonnet-4-6'` or
`'claude-opus-4-8'` literals outside of `model-policy.ts`:

```bash
grep -rnE "claude-[a-z0-9.\-]+" web/src --include=*.ts --include=*.tsx | grep -v node_modules | grep -v model-policy.ts | grep -v "\.test\."
```

**HALT-2:** if any model literal remains outside `model-policy.ts` (excluding test files and comments in
the AUD-018 output), surface and resolve — every literal must route through the resolver.

### §4.3 — Fix temperature at the class body builder

In `anthropic-adapter.ts`, the `execute()` body builder at `:1068`:
- Call `resolveModel(request.task)` to get the model string (from §4.2).
- Use `DEPRECATED_PARAMS_BY_MODEL` (from §4.1) to determine if the resolved model rejects `temperature`.
- If yes: **omit** `temperature` from the request body entirely (do NOT send `temperature: 0` — the key
  itself must be absent, matching how `executeAgentTurn` handles it at `:1187`).
- If no: send `request.options?.temperature ?? 0.1` as before.
- Apply the same pattern to any other deprecated param (`top_p`, `top_k`, `stop_sequences`) if present.

Consolidate the body-builder: `execute()` and `executeAgentTurn()` should share a single private
`buildRequestBody(model, params)` method so the deprecation guard is written once. The only behavioral
delta between the two is that `executeAgentTurn` sends `tools` and multi-turn `messages` — the
body-builder handles that via optional fields, not a separate construction site.

Commit Agent A: `OB-215 Phase A: model resolver + temperature fix + seam consolidation`

---

## §5 — Agent B (parallel after A): Observatory Model-Control Surface

**Depends on:** Agent A committed (the resolver and `getModelPolicy()` must exist).

### §5.1 — Persisted model configuration

Create a configuration surface (a row in a platform-config table, or a `model_config` table, or
`tenant_settings` — use the existing config pattern if one exists, do not create a new pattern):
- **Platform-level defaults:** the task→model map from `MODEL_POLICY`, persisted so an operator change
  survives restarts without a code deploy.
- **Per-tenant overrides (optional, lower priority):** if the schema supports it, a tenant can override
  the platform default for a specific task. If not, platform-level only is acceptable for this OB — note
  per-tenant as a residual.
- On startup / first call, `resolveModel` reads the persisted config; if absent, falls back to the
  code-level defaults in `model-policy.ts`.

### §5.2 — Observatory UI panel

Add a "Model Configuration" panel to the Observatory (or the appropriate admin surface). It must show:
- The current model for each task type (the full `getModelPolicy()` table), editable.
- A dropdown or text input per task that writes back to the persisted config.
- The list of available models (from the Anthropic `/v1/models` endpoint or a cached inventory).
- Which tasks are "plan-interpretation family" and which are "general" — visually grouped.
- A "deprecated params" indicator showing which models reject `temperature` (from
  `DEPRECATED_PARAMS_BY_MODEL`).

**Korean Test:** the UI keys on `AITaskType` labels (structural), not on tenant-specific strings.

Commit Agent B: `OB-215 Phase B: Observatory model-control surface`

---

## §6 — Agent C (parallel after A): Metrics + Cost Capture + Observatory Elevation

**Depends on:** Agent A committed (the resolver's `resolveModel` call is the instrumentation point).

### §6.1 — Per-call metrics capture

At the resolver / adapter call site (the shared body-builder from §4.3), capture per call:
- `task` (the AITaskType)
- `model` (the resolved model string — from the resolver, not from the response)
- `tenant_id` (from the request context — thread it through if not already available)
- `tokens_in` / `tokens_out` (from the Anthropic response `usage` field)
- `latency_ms` (already captured in `AIService.execute` at `ai-service.ts:74`)
- `cost` (computed from model + tokens using per-model pricing — see §6.2)
- `timestamp`
- `status` (success / 400 / provider error)

Write to an `ai_call_metrics` table (or `agent_invocations` if that table already exists and fits — check
the schema; do not duplicate). Bulk-insert or fire-and-forget (do NOT block the request on metrics write).

### §6.2 — Cost computation

Use per-model pricing constants (input $/1M tokens, output $/1M tokens) for the models the platform
actually runs. Store these in `model-policy.ts` alongside the model identifiers:

```
MODEL_PRICING: Record<string, { inputPer1M: number, outputPer1M: number }>
```

The cost per call = `(tokens_in * inputPer1M / 1_000_000) + (tokens_out * outputPer1M / 1_000_000)`.

### §6.3 — Observatory metrics panel

Add to the Observatory (same page or adjacent to the model-config panel from Agent B):
- **Totals:** total calls, total tokens, total cost — all time and last 30 days.
- **By task:** calls/tokens/cost broken down by `AITaskType`.
- **By model:** calls/tokens/cost broken down by resolved model.
- **By tenant:** calls/tokens/cost broken down by `tenant_id` (for the operator to see which tenants
  drive cost).
- **Time series (if feasible):** daily cost trend. If the table supports it, a simple line chart. If not,
  a table of daily aggregates. Do not over-engineer — a query against the metrics table is sufficient.

Replace the `InfrastructureTab.tsx:320` Haiku cost basis (`usage * 0.003`) with the real computed cost
from the metrics table. The cost projection must reflect the actual models in use, not a stale comment.

Commit Agent C: `OB-215 Phase C: AI metrics capture + Observatory cost elevation`

---

## §7 — Agent D (parallel after A): Telemetry Label Correction

**Depends on:** Agent A committed (the resolver provides the authoritative model string).

### §7.1 — header-comprehension.ts telemetry labels

AUD-018 File A found 4 hardcoded `'claude-sonnet-4-6'` labels at `:184`, `:253`, `:391`, `:430` used as
`llmModel` in classification signals. Replace each with the actual resolved model from the resolver (pass
the model string through the call chain, or call `resolveModel(task)` at the labeling site). The label
must reflect reality, not a stale literal.

### §7.2 — Error-tag providerModel

`anthropic-adapter.ts:1116/1127` (`execute()` errors) and `:1216/1224` (`executeAgentTurn()` errors) set
`err.providerModel = this.config.model || 'claude-sonnet-4-6'`. After §4.2 the resolved model is known
at the call site — use it instead of the config fallback. For plan tasks under Opus, the error tag should
say `claude-opus-4-8`, not `claude-sonnet-4-6`.

### §7.3 — InfrastructureTab cost basis

`InfrastructureTab.tsx:320` — if Agent C's Observatory metrics panel replaces this (§6.3), this line is
retired. If not, update the comment and the `0.003` multiplier to reflect the actual in-force models and
their pricing. Do not leave a Haiku cost label on a Sonnet/Opus platform.

Commit Agent D: `OB-215 Phase D: telemetry label correction`

---

## §8 — Phase FINAL: Build + Prove (single-threaded, after all agents join)

```bash
cd "$(git rev-parse --show-toplevel)"
kill "$(lsof -t -i:3000)" 2>/dev/null || true
rm -rf web/.next
npm run build
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

Build must exit 0, localhost must return 200.

### §8.1 — Proof gate 1: no scattered model literals

```bash
grep -rnE "claude-[a-z0-9.\-]+" web/src --include=*.ts --include=*.tsx | grep -v node_modules | grep -v model-policy.ts | grep -v "\.test\." | grep -v "docs/"
```

**PASS:** zero hits outside `model-policy.ts` (excluding tests and docs). Every model string routes
through the resolver.

### §8.2 — Proof gate 2: no unconditional temperature on Opus

```bash
grep -n "temperature" web/src/lib/ai/providers/anthropic-adapter.ts
```

**PASS:** `temperature` is conditionally omitted for models in `DEPRECATED_PARAMS_BY_MODEL`. No
unconditional `temperature:` line in either body builder.

### §8.3 — Proof gate 3: Meridian re-import (SR-44 — the regression closure)

Re-import `Meridian_Plan_Incentivos_2025.pptx` for the Meridian tenant through the normal import path.
Paste the plan-orchestrator log. Pass criteria:
- No `400` / no `temperature is deprecated` error.
- `c1-senior` constructs with `rateTableCellCount=20` and `shape=banded_lookup`.
- Phase B reports `10/10 components succeeded, 0 failed`.
- The log shows `model=claude-opus-4-8` (or the Opus identifier from the resolver) on the `plan_skeleton`
  and `plan_component` calls.

**HALT-3:** if c1-senior still fails the dimension-product check under Opus (after temperature is
removed), paste the raw CompositionalIntent JSON and HALT. Do NOT patch the intent-constructor or the
emission grammar. The model was not the sole cause; AUD-017 §7 reopens.

### §8.4 — Proof gate 4: Observatory surfaces

Navigate to the Observatory model-config panel. Confirm:
- The current task→model mapping is displayed and editable.
- Changing a task's model persists across page reload.
- The metrics panel shows at least the Meridian re-import call (task, model, tokens, cost, tenant).

### §8.5 — Proof gate 5: BCL non-regression

Re-import or recalculate BCL October to confirm the resolver does not regress single-file tenants.
Expected: $44,590 exact (or the persisted rule_set still calculates correctly). If BCL was not
re-imported, confirm the existing calculation still runs (calc → grand total unchanged). Paste evidence.

---

## §9 — HALT Conditions (consolidated)

- **HALT-1 (§3):** OB-215 already exists in any ledger directory → surface, stop.
- **HALT-2 (§4.2):** model literals remain outside `model-policy.ts` after consolidation → surface,
  resolve before proceeding.
- **HALT-3 (§8.3):** Meridian c1-senior still fails the cell-count check under Opus after temperature
  fix → paste raw CompositionalIntent, halt, do not patch constructor.

---

## §10 — Reporting Discipline (Rules 25-28)

Create `docs/completion-reports/OB-215_MODEL_GOVERNANCE_COMPLETION.md` BEFORE the final build, containing:
1. OB-215 number, HEAD SHA, branch.
2. Agent A: the `model-policy.ts` file (pasted), the before/after of each consolidated seam (git diff),
   the temperature guard implementation, the HALT-2 grep showing zero scattered literals.
3. Agent B: the Observatory model-config panel — screenshot or description of the UI, the persisted
   config schema, a demonstration of change-and-reload persistence.
4. Agent C: the metrics table schema, a sample row from the Meridian re-import, the Observatory metrics
   panel showing task/model/tenant/cost breakdown, the corrected `InfrastructureTab` cost basis.
5. Agent D: the before/after of each telemetry label site (git diff), the corrected error-tag
   `providerModel`.
6. Proof gates 1-5 evidence (§8.1-§8.5).
7. HALT disposition log.

Commit, push, `gh pr create --base main --head ob-215-model-governance` with descriptive title and body.
**Do NOT merge** — architect performs SR-44 production verification.

---

## §11 — Out of Scope

- The 8 developer-set convergence/calc thresholds (DIAG-072 / OI-10). Same prohibited class, separate
  subsystem, separate work item.
- MIR convergence multi-file routing. Separate defect, separate track.
- Per-tenant model overrides beyond the platform-level defaults (if schema doesn't support it cleanly —
  note as residual, don't force).
- The Meridian calculation reconciliation (the re-import proves plan interpretation; calculation proof is
  a separate step after the plan persists).

## §12 — Residuals

- **Per-tenant model overrides:** if §5.1 only implements platform-level defaults, per-tenant override
  capability is a follow-on. The resolver's signature already accepts a tenant context — wiring it to a
  per-tenant config row is incremental.
- **Model retirement alerting:** the Observatory now shows the in-force models. A future enhancement:
  poll the `/v1/models` endpoint periodically, compare against the policy table, and surface a warning
  when a configured model is deprecated or removed — so the next retirement is an Observatory alert, not
  a production 400.
- **AUD-017 §7 carry-forward:** if Opus resolves Meridian, validate plan interpretation across all proof
  tenants (BCL/Meridian/CRP/MIR). Not a gate on this OB.
- **The `resolveModel` function is the seam** for the future Observatory per-task model control CLT that
  was parked repeatedly this session. This OB implements it — the CLT is closed by this work.
- Ultracode note: A is the critical-path agent (~60% of the work — resolver, consolidation, body-builder,
  temperature fix). B/C/D are independently scoped and roughly equal in effort. Total wall-time bounded by
  the longer of {A} and {slowest of B/C/D after A completes}.
