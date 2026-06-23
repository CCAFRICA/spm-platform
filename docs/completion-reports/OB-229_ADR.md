# OB-229 — Architecture Decision Record (Section B gate)

**Committed before implementation.** Branch `ob-229-summary-engine` · 2026-06-22 · Directive `docs/vp-prompts/OB-229_SUMMARY_ENGINE_DIRECTIVE_20260622.md`

## Phase-0 live verification (read-only, `scripts/ob229-verify.ts`)
- **HALT-1 PASS:** `summary_artifacts` exists in the live DB (0 rows — not yet backfilled).
- **HALT-2 FIRES (BCL):** all **510/510** BCL `transaction` rows have `entity_id = NULL`. `summary_artifacts.entity_id` is `NOT NULL` with FK→`entities`, so the engine cannot synthesize an "unresolved" bucket without the architect creating entity rows or running entity resolution. → BCL per-entity summaries are **deferred** (Residual 2); the engine skips NULL-entity rows. Sabor (the headline) is unaffected.
- **Sabor clean:** 263,250 `pos_cheque` rows, `entity_id` NULL=0, `source_date` NULL=0, 68 entities → full summaries.
- Other tenants (informational): MIR `transaction` 56,693 rows but 70,300 NULL-entity + 18,534 NULL-date (deferred); Meridian partial NULLs.

## Decisions
**D1 — SQL aggregation engine (Constraint 5 + Korean Test).** A Postgres function `compute_summary_artifacts(p_tenant_id)` does the aggregation in-database (`jsonb_each` + `jsonb_typeof='number'` → SUM per field, GROUP BY entity_id, source_date, data_type). **Zero field names in SQL** — fields are discovered from `row_data` (Korean Test PASS). SUMs **all** numeric fields (T1-E902 Carry Everything; no curated subset). Idempotent: deletes the tenant's artifacts then re-inserts (Constraint 6). Delivered as a migration; **the architect applies it (SR-44 — DDL is architect-only; no `exec_sql` RPC exists).**

**D2 — Reductions/enrichment deferred.** BCL convergence bindings carry `reduction: snapshot|last` + semantic labels. Base engine SUMs all numeric (the directive: "convergence enriches; convergence does not gate"). Snapshot/last reductions + semantic relabeling are a documented refinement (Residual 1/3), not Phase-1 gating. Sabor has empty bindings and works regardless.

**D3 — period_id / network NOT pre-materialized.** Daily granularity (entity × source_date × data_type). Period rollups and cross-entity totals are computed on-read by grouping `summary_artifacts` (directive §2.4). `period_id`/`convergence_hash` left NULL in Phase 1.

**D4 — Triggers.** (a) Import-time: fire the engine after `finalize-import` (committed_data written + entity resolution done). (b) Admin API `POST /api/admin/summary/backfill` for manual backfill/recompute. Both call the RPC.

**D5 — Bootstrap vs production aggregation (SR-44 reality).** Because the RPC is architect-applied DDL, this PR also ships a one-time **JS bootstrap backfill** (`scripts/ob229-backfill.ts`, a data write — allowed, not DDL) that replicates the SUM-all-numeric logic to **populate `summary_artifacts` for Sabor now** and prove the read path (PG-1/PG-2). The **production** import-time aggregation uses the SQL RPC (Constraint 5: "seconds, not minutes") once the architect applies it. The JS bootstrap is a one-time population, off the render path — not the render-time anti-pattern being eliminated.

**D6 — Read path.** A `summary-read` helper queries `summary_artifacts` (O(1) indexed reads) for the visualization layer; drill-through to raw filtered `committed_data` is preserved as the only remaining raw path (directive §1).

## Anti-Pattern check
- **AP (render-time bulk aggregation):** the defect. Eliminated at the refactored sites by reading `summary_artifacts`.
- **Korean Test / AP-25:** SQL + TS contain zero hardcoded `row_data` field names.
- **T1-E904 (Calculation Sovereignty):** `calculation_results` untouched; `summary_artifacts` serves visualization only.

## SR-44 handoffs (architect)
1. Apply the engine migration (`web/supabase/migrations/20260622_ob229_summary_engine.sql`).
2. After apply: run backfill via `POST /api/admin/summary/backfill {tenantId}` (or the RPC) for all data tenants; verify PG-1 counts + PG-2 page perf live.
3. HALT-2 disposition for BCL/MIR: entity resolution prerequisite, or create "unresolved" entity rows (schema FK requires real entities).

## Scope this PR (honest)
Engine (RPC migration) + TS backfill/trigger/admin-API + `summary-read` helper + **Sabor bootstrap backfill (live) + the financial 97s-path refactor** (headline PG-1/PG-2/PG-4) + build/grep/Korean-Test. Full visualization-surface sweep + BCL + RPC-apply + live PG-6 are staged/handed-off (transparent, not attested).
