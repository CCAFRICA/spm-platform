# OB-212 Phase 0 — Verify-Fan-Out STATE MAP (read-only)

**Date:** 2026-06-16 · **Branch:** `ob212-operational-ai-agents` (off `main` `770a4a3c`) · **Method:** parallel read-only fan-out (7 subagents) across the 6 directive targets + Korean pre-scan + sequence gate. No source modified. Live DB probes were service-role, `.select()`-only.

---

## §A — EXECUTIVE VERDICT

| Gate | Result |
|---|---|
| **Korean Test pre-scan** (Decision 154) | ✅ **PASS** — all 13 tool names, 9 `agent_invocations` columns, 3 signal types, 3 agent names are structural; zero domain-literal risk. |
| **Sequence-number gate** | ✅ **OB-212 = 211 + 1 confirmed.** ⚠️ **Collision flag:** the closing-handoff docs reserve "OB-212" for a *different* (recovery/orphan-rehome) build, unaware this AI-Agents OB-212 already exists on `ob211-recovery-artifacts`. Architect must renumber the recovery build → OB-213. |
| **HALT-0 (shape match)** | 🛑 **TRIGGERED on all three agents** — see §B. Building handlers now would build against shapes that don't exist (FP-49). |
| **Production blocker** | 🛑 **Vercel `NEXT_PUBLIC_AI_MODEL` is still the dead `claude-sonnet-4-20250514`** — every LLM call (incl. all new agents) 404s in prod until fixed. See §C. |

**Bottom line:** Phase 0 did its job. The directive was authored against assumptions that do not match live `main` for **each** of the three agents, and there is a standing production AI outage. **I am stopping at HALT-0** and reporting for architect disposition rather than building tools/routes against non-existent shapes. The harness (N1), the `agent_invocations` table (N2), and the read-only AI Substrate panel (N8a) are *shape-independent* and remain buildable (§I) — but the three agents' tools/routes cannot proceed until §B is dispositioned.

---

## §B — HALT-0 CONDITIONS (architect disposition required, per agent)

### B1 — Reconciliation Diagnosis Agent (the keystone): primary read store is EMPTY/wrong shape

- **`calculation_traces` is empty (0 rows, all tenants) and has NO production writer.** `writeCalculationTraces()` exists (`web/src/lib/supabase/calculation-service.ts:443`) but has **0 callers**; the live engine (`web/src/app/api/calculation/run/route.ts:2700-2722`) writes trace data into **`calculation_results.metadata`** instead (HF-218 "no DDL" decision). Live: `calculation_traces` count = 0; `calculation_results` = 943 rows, 100% carrying the rich metadata.
- The directive's recon tools (`get_entity_calculation_trace` returning "band indices, lookup path, component output" from `calculation_traces.steps`; `check_boundary_resolution`) are specced against a table+shape that **does not exist in live data.**
- **Where the data actually is:**
  - `metadata.intentTraces[i]` → only `{entityId, componentIndex, finalOutcome, confidence}`. `inputs={}`, `lookupResolution=null`, `variantRoute=null`, `componentType="unknown"` in **100%** of 3,905 live traces. **No band indices / lookup paths / boundary matches here.**
  - `metadata.roundingTrace.components[i]` → `{label, rawValue, roundedValue, roundingAdjustment, precision{source,decimalPlaces,roundingMethod}}` (the human-readable component name + pre/post-rounding values).
  - `metadata.binding_snapshot.convergence_bindings_used.component_N.<slot>` → `{column, confidence, match_pass, field_identity{structuralType, contextualIdentity}, filters, learning_provenance}` — **this is the real lookup-path/column-resolution forensic.**
- **Also:** the entire `reconciliation_sessions` table has **1 live row**, and that row has **0 matched entities, all-red, empty `components[]`, no false-greens** (§F). So even a re-specced recon agent has **no live data exhibiting a component-level/false-green delta to diagnose** for EPG-1.
- **Disposition options:** (a) **Re-spec the recon tools to read `calculation_results.metadata`** (`intentTraces`+`roundingTrace`+`binding_snapshot`) — recommended; the forensic the agent needs exists there, just not in `calculation_traces`. (b) Wire a real `calculation_traces` writer first (larger, touches the calc path — boundary-sensitive). **And** seed/identify a reconciliation session with matched entities + component deltas (or run a fresh reconcile on a tenant with both engine + benchmark) so EPG-1 has a real delta to diagnose.

### B2 — Plan Interpretation Agent: the target is DEAD CODE and the capability already exists

- The directive's Target F path `web/src/lib/ai/ai-plan-interpreter.ts` **does not exist** (it's at `web/src/lib/compensation/ai-plan-interpreter.ts`), and its `interpretPlan` entry was **deleted** (OB-199 Phase 1).
- The single-shot `task:'plan_interpretation'` dispatch (`AIService.interpretPlan`, `ai-service.ts:284/299`) is the **only** site — and it is **dead code: zero runtime callers.**
- The **live** plan-interpretation path is already a **two-phase, per-component orchestration with cross-component validation** (HF-248): `execute-bulk/route.ts:335` → `executeBatchedPlanInterpretation` (`plan-interpretation.ts:76`) → `orchestratePerComponentInterpretation` (`plan-orchestration.ts:149`) → `interpretPlanSkeleton` (`task:'plan_skeleton'`) + a per-component loop calling `interpretPlanComponent` (`task:'plan_component'`). It is **already single-path** (the per-unit duplicate was removed in HF-257/AP-17).
- **This means N10's premise — "monolithic single-call hits token limits; build a per-component extraction loop with cross-component validation" — is ALREADY SOLVED in production.** The §3.2.A "retire the single-shot call site" target would change nothing (it's dead).
- **Disposition options:** (a) **Drop the Plan Interpretation Agent from OB-212** (the capability exists; the directive's premise is stale) — recommended unless there's a *new* requirement beyond what the two-phase orchestrator does. (b) Re-scope it to a genuinely new capability (e.g., an agentic *cross-component reasoning/repair* layer on top of the existing orchestrator), explicitly distinct from HF-248. Either way, do **not** "replace `interpretPlan`" — it's a no-op.

### B3 — Dispute Investigation Agent: the substrate table DOES NOT EXIST

- **The `disputes` table was dropped 2026-04-28 (`migrations/20260428_aud_004_drop_disputes_table.sql`) and never recreated.** Live probe → `PGRST205` ("Could not find the table 'public.disputes'"). (Matches the existing memory note "disputes table DROPPED".)
- App code still references `from('disputes')` at 4 sites (insert/approve/reject in `web/src/app/performance/adjustments/page.tsx`; read in `web/src/lib/data/page-loaders.ts:514`) — the read **silently swallows** the missing-table error and returns empty. So the dispute "queue" (`/performance/adjustments`, itself an OB-211 orphan) is non-functional against live data.
- `disputes` never had a `metadata` column (the directive's §3.0 Target D concern is moot — the table is gone entirely). No `SCHEMA_REFERENCE_LIVE.md` exists.
- The `dispute.submitted` event the Resolution Agent listens for (`registry.ts:124`) has **zero emitters** — the trigger is dormant regardless.
- **Disposition options:** (a) **Recreate `disputes`** (author migration → HALT-MIG architect-apply → wire the submission path to actually insert + emit `dispute.submitted`) **before** the dispute agent — this is a prerequisite, not part of the agent. (b) **Defer the Dispute Investigation Agent** out of OB-212 until disputes is a live substrate. The agent cannot read/trigger against a dropped table.

---

## §C — PRODUCTION BLOCKER (surface immediately; not OB-212-specific but it gates OB-212's runtime)

**Vercel `NEXT_PUBLIC_AI_MODEL` is still set to the sunset `claude-sonnet-4-20250514`.** Evidence: all **125** live `classification_signals` `cost:event` rows carry `signal_value.model = "claude-sonnet-4-20250514"` (the source default is `claude-sonnet-4-6` post-HF-294, and that string appears in no repo config/`.env*` — it can only come from the deployment env). This is the **HF-294 HALT-ENV, still open in production**: every live LLM call 404s until the architect updates the Vercel env var to `claude-sonnet-4-6` and redeploys. **OB-212's agents call the LLM through the same adapter/env — none can run in prod until this is fixed.** (And production AI imports remain broken meanwhile.)

---

## §D — TARGET A: AI service layer (harness host) — CLEAN (shape-independent build can proceed)

- **One anthropic seam:** `fetch(ANTHROPIC_API_URL,...)` at `anthropic-adapter.ts:1075` (3-attempt retry; throws tagged `ProviderHardError` on non-2xx — the HF-294 guard). Request body (`:1052-1063`): `{model, max_tokens, temperature, system, messages}` — **no `tools` parameter** sent today. Model line: `model: this.config.model || 'claude-sonnet-4-6'` (`:1053`).
- **Adapter is single-turn:** reads only `data.content[0].text` → `parseJsonResponse`. **No `tool_use`/`stop_reason` handling, no message-history threading, no `tool_result` round-trip.** ⇒ N1 (agent-runner) must implement the multi-turn tool loop **and** the adapter needs a tools-capable call path (extend `AIRequest`/`AIResponse` or add a sibling method). Request-side is trivial (add `tools` key); response-side loop is the real work — well-scoped, single seam.
- **`AITaskType` = 20 members** (canonical list for the AI Substrate panel): file_classification, sheet_classification, field_mapping, field_mapping_second_pass, plan_interpretation, plan_skeleton, plan_component, plan_component_with_chunking, plan_chunk, workbook_analysis, import_field_mapping, entity_extraction, anomaly_detection, recommendation, natural_language_query, dashboard_assessment, narration, header_comprehension, document_analysis, convergence_mapping.
- **cost_event data contract (for N8a):** persisted at `classification_signals.signal_type = 'cost:event'` (note the colon — `toPrefixSignalType` maps `cost_event`→`'cost:event'`), `confidence=1`, `source='system'`. JSONB keys in `signal_value`: `provider`, `model`, `purpose` (the AITaskType), `estimatedCostUSD`, `inputTokens`, `outputTokens`, `sci_internal_type='cost_event'`. Live: 125 rows, distinct purposes {plan_component:77, plan_skeleton:20, document_analysis:14, dashboard_assessment:13, sheet_classification:1}, all provider=anthropic, all model=claude-sonnet-4-20250514, total ≈ $3.11.
- Singleton: `getAIService`/`resetAIService` (`ai-service.ts:602-613`); config resolved once.

## §E — TARGET B: calculation trace store — **HALT-0 (see §B1)**
`calculation_traces` empty/no writer; real data in `calculation_results.metadata`. Full shape in §B1.

## §F — TARGET C: reconciliation store — shape understood; data-thin
- Writer: `web/src/app/api/reconciliation/save/route.ts` (service-role INSERT, fire-and-forget, **no update path**). Caller `operate/reconciliation/page.tsx:544-571` caps `employees` to **100** and hoists `falseGreenCount` into `summary`.
- `results = { findings: Finding[], employees: EmployeeComparison[] }`. Per-entity: `totalDelta/totalDeltaPercent/totalFlag` (`exact|tolerance|amber|red`), `fileTotal` (benchmark) vs `vlTotal` (engine), `components[]` (matched-only, may be empty), `vlResult.components` (engine breakdown), `fileRow` (raw benchmark). `summary` = 12 numeric counts incl. `falseGreenCount`. False-greens = `summary.falseGreenCount` + `findings[type='false_green']` (priority 1, carry `entityId`).
- **Diagnose host:** `web/src/app/operate/reconciliation/page.tsx`, results block at **line 1053** (`step==='results'`). No "Diagnose" action exists yet (grep = 0).
- **Data caveat (feeds B1):** only 1 live `reconciliation_sessions` row; it has 0 matched / all-red / empty components / no false-greens. EPG-1 needs a session with component-level deltas.

## §G — TARGET D: disputes store — **HALT-0 (see §B3)**
`disputes` table dropped 2026-04-28, not recreated; live probe `PGRST205`. Submission/queue at `performance/adjustments/page.tsx`; read at `page-loaders.ts:514` (silently empty). No `metadata` column ever existed.

## §H — TARGET E: Observatory panel — buildable (N7/N8 plumbing identified)
- Panel: `web/src/components/platform/AIIntelligenceTab.tsx` (heading "AI Intelligence"); payload from `GET /api/platform/observatory?tab=ai` → `observatory/route.ts` `fetchAIIntelligence()` (`:387`); aggregations in `web/src/lib/intelligence/ai-metrics-service.ts` + `web/src/lib/sci/signal-capture-service.ts`.
- **cost_event aggregation:** `computeSCICostCurve` (`signal-capture-service.ts:246`) exists but buckets **by ISO week only**, **drops provider/model/purpose**, is **single-tenant**, and is **never rendered** (no UI consumer; grep = 0). ⇒ N8a (AI Substrate panel) must add a per-`purpose`×`provider`×`model` aggregation (reusing `getSCISignals(tenantId,{signalType:'cost_event'})` + the `signal_value` shape) and a new read-only UI section. **No new capture needed** — cost_event already flows. This is shape-independent and buildable now.

## §I — WHAT IS NOT BLOCKED (shape-independent; can proceed once §B/§C dispositioned)
- **N1 agent-runner harness** — depends only on Target A (clean). Buildable. (Note the adapter tools-extension scope from §D.)
- **N2 `agent_invocations` migration** — schema is self-contained (structural columns, RLS); author → HALT-MIG. Buildable.
- **N8a AI Substrate panel (read-only, six single-call rows)** — reads existing `cost:event` data (§H). Buildable. *Caveat:* it will currently display `model=claude-sonnet-4-20250514` (the dead prod model) — which is itself a useful surfacing of §C.
- **Blocked until §B dispositioned:** N3/N4 (recon tools+route — wrong read store), N10 (plan agent — dead target/already-built), N11 (dispute agent — no table), and all EPGs that need a live agent run in prod (gated by §C).

## §J — Korean pre-scan + sequence (full detail)
- **Korean:** PASS. Blocklist (`commission|comision|optical|venta|tienda|payout|attainment|cuota|...`) → zero hits across all 25 planned identifiers. "benchmark" (a persisted `reconciliation_sessions` reference) and "dispute" (a platform feature/table name) reviewed as borderline → both structural, not domain vocabulary.
- **Sequence:** highest OB anywhere = 212 (this directive, on the recovery branch); excluding it = 211 → **212 correct.** Highest authored HF = 294; next free HF = 295. **Collision:** closing-handoff docs (`NEW_CONVERSATION_DIRECTIVE_20260616.md`, `GOVERNANCE_SESSION_HANDOFF_20260615.md`) reserve "OB-212" for a separate recovery build → must move to OB-213.

---

## §K — RECOMMENDED PATH FORWARD (architect decides)

1. **Unblock production first (§C):** update Vercel `NEXT_PUBLIC_AI_MODEL` → `claude-sonnet-4-6`, redeploy. Independent of OB-212; restores AI imports.
2. **Disposition the three agents (§B):**
   - **Recon (B1):** approve re-speccing tools to `calculation_results.metadata`; identify/seed a reconciliation session with component-level deltas for EPG-1.
   - **Plan (B2):** confirm whether to **drop** the Plan Interpretation Agent (capability already shipped in HF-248) or re-scope it to something genuinely new.
   - **Dispute (B3):** decide recreate-`disputes`-first vs **defer** the Dispute Investigation Agent out of OB-212.
3. **Renumber** the planned recovery build to OB-213 (collision).
4. **If green-lit, the buildable substrate (§I)** — N1 harness, N2 migration (→HALT-MIG), N8a read-only panel — can proceed in the GATE-MIG window while the agent dispositions are settled. The recon keystone (N3/N4) proceeds once B1 is dispositioned.

**This is a HALT-0 stop.** No handlers/routes were built against assumed shapes (FP-49). Awaiting architect disposition on §B (+ the §C production fix and the §J collision) before Phase 1 code.
