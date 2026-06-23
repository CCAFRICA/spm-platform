# OB-232 — Architecture Decision Record (Section B)

**Before implementation.** Branch `ob-232-insight-engine` · 2026-06-22 · Directive `docs/vp-prompts/OB-232_INSIGHT_ENGINE_DIRECTIVE_20260622.md`

## Phase-0 live verification (read-only, `scripts/ob232-verify.ts`) — all HALTs CLEAR
- **§A prereq:** `intelligence_artifacts` EXISTS (0 rows). **OB-229 RPC `compute_summary_artifacts` is APPLIED** (returned `{artifacts_written:0, rows_skipped:595}` for BCL) → fast SQL backfill available.
- **HALT-1 CLEAR:** join key proven — `committed_data.row_data->>'ID_Empleado'` (`BCL-5001`) = `entities.external_id` → MATCH (entity `d4d3a74e`). 85 BCL entities (`individual`).
- **HALT-2 CLEAR:** `classification_signals` (id, tenant_id, entity_id, signal_type, signal_value JSONB, confidence, source, context JSONB, created_at) accommodates UI-origin signals — the canonical surface (no private telemetry table).
- **HALT-3 CLEAR:** `model-policy.ts` exposes `OPUS_MODEL='claude-opus-4-8'`, `DEFAULT_MODEL='claude-sonnet-4-6'`, `resolveModel(task)`. Anthropic call = `fetch https://api.anthropic.com/v1/messages` (`x-api-key`). `ANTHROPIC_API_KEY` present → Insight Engine runnable live.

## Decisions
**D1 — Entity resolution is STRUCTURAL (Korean Test).** Discover the identifier field by VALUE-OVERLAP: the `row_data` key whose values most-match `entities.external_id` IS the entity identifier (no `'ID_Empleado'` literal). Resolve NULL-entity rows by mapping that field's value → entity id. Data write only (T1-E902: no row deleted/filtered). Then re-run the OB-229 Summary Engine (RPC) for the resolved tenant.

**D2 — Visualization completion (Obj 2).** The remaining financial aggregate modes adopt the OB-229 summary-first + raw-fallback pattern via `summary-read.ts`. Modes needing row-level fields (staff by mesero, products, leakage detail) keep filtered `committed_data` for drill-through only, not bulk aggregation. Modes whose dimension is (entity, day, metric) read summaries.

**D3 — Insight Engine (Obj 3) + Decision 158 boundary (IRA Option A).** `lib/insight/insight-engine.ts` reads `summary_artifacts` (numbers already deterministic), builds a structured prompt (model from `model-policy`), calls Anthropic, and parses structured insight JSON. **The LLM RECOGNIZES + narrates; it never computes a number.** Every numeric in `data_references` must come from the summary data the model was given. Stored in `intelligence_artifacts`. Korean-Test-clean: metric keys flow from summary data, not code.

**D4 — Enforcement points (Obj 4, IRA-validated):**
- **EP-2 Validator** (`lib/insight/insight-validator.ts`, deterministic, between LLM emission and storage): (a) *data-contract* — every `data_references` numeric value traces to a `summary_artifacts` metric for the referenced entity/range (tolerance for rounding); (b) *allowable-form* — `artifact_type` ∈ canonical registry {anomaly, trend, coaching, benchmark}; `severity` ∈ {critical, warning, info, positive}. Fails loud. Extensible to future generative surface composition.
- **EP-3 Insight-shape** (`lib/insight/insight-shape.ts`): a tenant-content-free fingerprint `{pattern, metric_class, entity_type, severity, delta_direction}` stored in `insight_shape`. Zero tenant data by construction (derived from structure, never names/ids/values). Foundation for the Domain Flywheel (transfer out of scope).
- **EP-1 Signal capture** (`lib/signals/ui-signal.ts` + one wired surface): UI interactions → `classification_signals` with `signal_type ∈ {selection, dwell, drill, dismissal}` (structural), `source='ui'`, `entity_id`, `context={metricKey, surface, sessionId}`. Canonical surface (DI-6/G7 no private channel). Korean-Test-clean.

**D5 — Triggers.** Insight Engine fires after the Summary Engine in `finalize-import` (data → entity resolution → Summary Engine → Insight Engine) + an admin API for manual run. Awaited (HF-300 reliability).

**D6 — Idempotency.** Entity resolution (re-match), backfill (RPC delete+reinsert), insight generation (delete tenant's artifacts then regenerate) all safe to re-run.

## SR-44 / scope
CC runs data writes (entity_id updates, backfill via the applied RPC, intelligence_artifacts inserts) + the live LLM insight run (Anthropic key present) — these are data/app operations, not DDL. CC does NOT apply DDL or merge. Per Residual 5, if insight RENDERING exceeds one PR, ship engine + validator + signal capture + a minimal render proof and stage full rendering. MIR resolution attempted; deferred if its structure differs (Residual 2). All four objectives ship in one PR; honest staging is labeled, not attested.
