# OB-237 — MSP Application Map

## FINAL STATE (T-PROOF) — ZERO RAW ENTRIES

| Agent | Surface / mode | Classification | Materialization |
|---|---|---|---|
| Financial | network_pulse, timeline, summary, performance, products, leakage | **WIRED** | `summary_artifacts` (+ conditional metrics for leakage) |
| Financial | staff, location_detail, patterns, server_detail | **WIRED** | `summary_artifacts_fine` (entity, mesero, date, hour) |
| Financial | cheques | **BOUNDED** | filtered `committed_data` + LIMIT (drill-through) |
| Intelligence | getPeriodTotal, getComponentTotals, getPopulationTrend | **WIRED** | `period_outcomes` sentinel rollup (one row/period) |
| Intelligence | getPayoutDistribution | **WIRED** (per-entity histogram) | `entity_period_outcomes` (genuine distribution, not an aggregate) |
| Compensation | period/dashboard aggregates | **WIRED** | `period_outcomes` sentinel rollup |
| Compensation | per-entity statement / my-compensation | **BOUNDED** | one `entity_period_outcomes`/`calculation_results` row (O(1) indexed) |

`fetchRawDataServer` deleted. Zero RAW. All value-matched to deterministic truth ($100,068,158.15 Sabor / $312,033 BCL). Full evidence + empirical table: `docs/completion-reports/OB-237_COMPLETION_REPORT.md` §T-PROOF.

---

# OB-237 — MSP Application Map (P0 Discovery)

**Branch:** `ob-237-materialized-serving-path` · **Date:** 2026-06-24 · **Tenants:** Sabor `f7093bcc-…` (Financial), BCL `b1c2d3e4-aaaa-…` (Comp/Intel)

> **P0 surfaced three premise-corrections that reframe the OB (flagged for architect; not silent narrowing):**
> 1. **`financial_summary_daily` does NOT exist.** The actual OB-229 financial materialization is **`summary_artifacts`** (Sabor 2520 rows, populated; the directive names both interchangeably, §3.T1.3). Treating `summary_artifacts` as the Financial target — **no migration needed, HALT-SCHEMA not escalated** (the materialization exists).
> 2. **SQL-level aggregation is unavailable to CC without a migration.** PostgREST aggregate functions are **blocked** (`"Use of aggregate functions is not allowed"`); `exec_sql` RPC **does not exist**; no aggregation RPC/view exists. Therefore "replace JS reduce with a Postgres `GROUP BY`/`SUM`" (directive §3.T2.3 Option A) **requires creating an RPC or view = a migration (SR-44 architect-only).** The migration-free MSP move is **switching reads from base tables → existing materializations**; eliminating the residual O(n) JS reduce over a materialization is **architect-gated**.
> 3. **Intelligence & Compensation aggregate reads are ALREADY materialization-backed.** `getEntityResults` (`drill-through/entity-results.ts:102-122`) reads **`entity_period_outcomes` as the PREFERRED path**, falling back to `calculation_results` only when no materialized outcome exists. So the directive's premise that Intelligence/Compensation "re-derive … from `calculation_results.components` JSONB" (§1.2) is **largely stale** — they consume the D7 materialization; the only residual is the JS `.reduce` *over the materialization* (the O(n) Principle-2 concern, fixable only via the migration in #2). The genuine "re-derives from BASE ROWS" defect (§1.4) is **Financial only**.

## 1. Materialization inventory (live DB)
| Table | Exists | Sabor rows | BCL rows | Key columns | Role |
|---|---|---|---|---|---|
| `summary_artifacts` | ✅ | **2520** | 510 | `entity_id, summary_date, data_type, metrics{JSONB: Total/Subtotal/Propina/…}, row_count, period_id` | **Financial materialization** (OB-229, daily-per-entity) |
| `entity_period_outcomes` | ✅ | **0** | **510** | `entity_id, period_id, total_payout, component_breakdown[JSONB], rule_set_breakdown, lowest_lifecycle_state` | **Comp/Intel materialization** (D7, per-entity-period) |
| `financial_summary_daily` | ❌ NOT FOUND | — | — | — | (directive label → resolves to `summary_artifacts`) |
| `period_entity_state` | ✅ | 0 | 510 | — | lifecycle state |
| `calculation_results` | ✅ | 60 | 510 | `entity_id, period_id, total_payout, components[JSONB]` | base (per-entity result-of-record) |
| `committed_data` | ✅ | **263250** | 595 | `row_data[JSONB]` | **base rows** (the disease source for Financial) |

**HALT-EMPTY: not fired** — `entity_period_outcomes` populated for BCL (510). **Value-match ground truth confirmed** (fetch+JS SUM of `entity_period_outcomes.total_payout`): Oct $44,590 · Nov $46,291 · Dec $61,986 · Jan $47,545 · Feb $53,215 · **Mar $58,406** · **grand $312,033** — exact match to the directive (resolves the prior $49,911 vs $58,406 ambiguity: $58,406 is correct).

## 2. Baseline (headless POST, Sabor)
| Agent | Surface | Route/mode | Classification | Cold (ms) | Payload | Notes |
|---|---|---|---|---|---|---|
| Financial | Network Pulse | `network_pulse` | WIRED (summary_artifacts) | **3,277** | 7.6 KB | reference for the summary path |
| Financial | Revenue Timeline | `timeline` | **RAW** (committed_data) | **63,684** | 4.0 KB | the defect — 63.7s for 4 KB |

(DIAG-075 measured the same timeline path at 136,624ms; both confirm the catastrophe. Other RAW modes share `fetchRawDataServer` → the same ~60–96s cold fetch of 263K rows.)

## 3. Serving-path classification (the map)

### Financial (Agent=Financial) — `app/api/financial/data/route.ts` (1500 lines)
| Mode | Base read | Aggregation | Class | Materialization target | Coverage | Tier |
|---|---|---|---|---|---|---|
| `network_pulse` | summary_artifacts | JS over summary | **WIRED** | summary_artifacts | ✅ | — |
| `timeline` | committed_data (`fetchRawDataServer`) | JS | **RAW** | summary_artifacts (entity·day) | ✅ daily revenue | **T1** |
| `summary` | committed_data | JS | **RAW** | summary_artifacts | ✅ entity·period | **T1** |
| `location_detail` | committed_data | JS | **RAW** | summary_artifacts | ✅ per-location | **T1** |
| `performance` | committed_data | JS | **RAW** | summary_artifacts | ✅ per-location | **T1** |
| `leakage` | committed_data | JS | **RAW** | summary_artifacts (cancelado/descuento/cortesia metrics) | ⚠ if per-location ✅; if per-cheque → gap | **T1** (coverage-gated §3.T1.5) |
| `patterns` | committed_data | JS | **RAW** | — heatmap by hour (cheque `fecha` datetime) | ❌ **coverage gap** (summary is daily, not hourly) | **T1→RESIDUAL** |
| `staff` | committed_data | JS | **RAW** | — per-server (mesero) | ❌ **coverage gap** (summary is per-entity/location, not per-server) | **T1→RESIDUAL** |
| `server_detail` | committed_data | JS | **RAW** | — per-server detail | ❌ **coverage gap** | **T1→RESIDUAL** |
| `products` | committed_data | JS | **RAW** | — per-cheque product mix | ❌ **coverage gap** (no per-product summary) | **T1→RESIDUAL** |
| `cheques` | committed_data (CAP'd) | row-level | **BOUNDED** | — (drill-through) | verify pagination | T1-verify |

**Financial finding:** `summary_artifacts` is grained at **(entity, day)** with a numeric `metrics` JSONB. It can serve entity/location/day/period aggregates (`timeline`, `summary`, `location_detail`, `performance`, location-level `leakage`). It **cannot** serve sub-entity granularity (per-server `staff`/`server_detail`, per-hour `patterns`, per-cheque `products`) — those need a **finer materialization** that does not exist (RESIDUAL → architect: extend the OB-229 summary to carry server/hour/product grain, a materialization build = migration, SR-44).

### Intelligence (Agent=Intelligence) — `lib/insights/**`
| Function/surface | Reads | Aggregation | Class | Notes |
|---|---|---|---|---|
| `getPeriodTotal` (intelligence-data.ts:33) | `getEntityResults` → **entity_period_outcomes** | JS `.reduce` over **materialization** | **MATERIALIZED + O(n) JS residual** | not base rows; SUM needs SQL agg (migration) |
| `getComponentTotals` (distribution.ts:59) | `getEntityResults` → entity_period_outcomes.`component_breakdown` | JS reduce over materialized breakdown | **MATERIALIZED + O(n) JS residual** | components are pre-materialized, not re-derived |
| `getPayoutDistribution` (distribution.ts:22) | `getEntityResults` | JS | MATERIALIZED + O(n) JS | |
| `getEntityTrajectory`/`getPopulationTrend` (trajectory.ts) | `getEntityResults` per period | JS `.reduce` | MATERIALIZED + O(n) JS | |
| `getBatchValidity` (intelligence-data.ts:58) | `calculation_batches` (1 row) | — | **BOUNDED** | indexed single row |
| `getDimensions` (intelligence-data.ts:112) | `discoverDimensions` (committed_data sample) + comprehension_artifacts | distinct-value discovery (capped sample) | BOUNDED-ish | not an aggregate total |
| insights/* pages, stream/FinancialStream | consume intelligence-data / financial route | — | downstream | inherit the above |

**Intelligence finding:** zero aggregate reads re-derive from base rows — all flow through `getEntityResults` → `entity_period_outcomes`. §1.4 invariant (read a materialization) **already satisfied**. Residual = O(n) JS reduce over the materialization → SQL-agg migration (SR-44, architect).

### Compensation (Agent=Compensation) — `app/perform/**`, `app/operate/**`, `app/my-compensation/**`
| Surface | Reads | Aggregation | Class | Notes |
|---|---|---|---|---|
| `perform/page.tsx` | `getPeriodTotal` + `getEntityResults` → entity_period_outcomes | JS reduce | MATERIALIZED + O(n) JS | |
| `operate/results`, `operate/pay`, `operate/lifecycle` | `getEntityResults`/results → entity_period_outcomes | JS `.reduce` (total_payout) | MATERIALIZED + O(n) JS | |
| `perform/statements/page.tsx` (:219,284) | `calculation_results` directly | per-entity statement | **BOUNDED** (one rep's rows) — verify scoping | |
| `operate/page` (:429), `operate/calculate` (:144-161) | `committed_data` | import/calc-setup (not aggregate viz) | **OUT-OF-SCOPE** (operations console, not a render-aggregate) | |
| `my-compensation/**` | per-entity `calculation_results` | one row | **BOUNDED** | O(1) indexed |

**Compensation finding:** same as Intelligence — aggregate reads are materialization-backed (`entity_period_outcomes`); per-entity/import paths are BOUNDED/out-of-scope. Residual = O(n) JS → SQL-agg migration.

### Cross-agent
`reconciliation/{analyze,compare,run}`, `periods/{detect,create-from-data}` read `committed_data` — these are **reconciliation / period-management** routes, not aggregate visualization serving → **OUT-OF-SCOPE** (§6.2 — not a render-aggregate surface). `intelligence/wire`, `ai/assessment` — intelligence wiring, not aggregate render.

## 4. HALT-ZERO-RAW: not fired
Financial has genuine RAW base-row paths (10 modes via `fetchRawDataServer`). The invariant is violated for Financial.

## 5. Scope conclusion (drives T1/T2/T3)
- **T1 Financial (genuine, CC-feasible, migration-free):** wire `timeline`/`summary`/`location_detail`/`performance`/(location-)`leakage` to `summary_artifacts`. Byte-match per mode. The sub-entity-grain modes (`staff`, `server_detail`, `patterns`, `products`) are **coverage-gap RESIDUALS** — `summary_artifacts` doesn't carry their grain; converting them needs a finer materialization (architect/migration). Keep them RAW-but-flagged, do NOT silently break them.
- **T2 Intelligence / T3 Compensation:** §1.4 invariant **already satisfied** (reads `entity_period_outcomes`). The O(n)-JS→O(1)-SQL optimization needs an **aggregation RPC/view = migration (SR-44 architect-only)** → **named residual** (`sum_entity_period_outcomes(tenant,period)` + a `component_breakdown` rollup RPC). CC verifies materialization-backing and the value-match; the SQL-agg build is architect-dispositioned.
