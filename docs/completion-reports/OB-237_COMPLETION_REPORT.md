# OB-237 — Materialized Serving Path (MSP) — COMPLETION REPORT

## §ROLLUP — WRITE-TIME ROLLUP MATERIALIZATION (staff + patterns residual)

**Zero residuals. Every aggregate visualization serves from a pre-computed materialization at its display grain. Zero JS reduces over multi-thousand-row fetches remain.**

The T-PROOF residual: staff/patterns were MSP-compliant but read all 88,459 `summary_artifacts_fine` rows and JS-reduced them (~19s). Same disease, finer grain. Fixed by adding a **third materialization tier** — pre-aggregated at each surface's display grain — derived from the fine table at materialization time.

### Design (how stored / how triggered / row counts)
`web/scripts/ob237-populate-rollups-sabor.ts` reads `summary_artifacts_fine` (data_type=`pos_cheque`, deterministic `.order('id')`) and writes three new `data_type`s into the same table (no new table → no architect migration; idempotent delete+insert of only the rollup data_types, `pos_cheque` untouched). It replicates the surfaces' exact rules (excl-cancelled = unconditional − cancelled conditional metrics; per-row skip; `weekIndex`; `dowFromDate`):

| Tier | data_type | Grain | Rows (Sabor) | metrics |
|---|---|---|---|---|
| Staff | `staff_rollup` | (entity_id=location, sub_entity_id=mesero) | **40** | revenue, checks, tips, week0–week3 (excl-cancelled) |
| Patterns | `patterns_rollup` | (entity_id, sub_entity_id=day_of_week) | **140** | hours{h:{r,c}}, revenue, checks, tips, guests, num_days, service_* |
| Patterns meta | `patterns_meta` | (tenant) | **1** | dow_days{0–6}, total_days — GLOBAL distinct-day union (not summable per-entity) |

The grain keeps `entity_id` (location) so `scopeEntityIds` (staff) and `locationFilter` (patterns) still filter at read time. `getRollupRows()` reads the small filtered set; the surfaces' ranking / heatmap / dayTotals logic is byte-identical, only the data source changed.

### PG-STAFF-ROLLUP / PG-PATTERNS-ROLLUP — truth-match
- staff_rollup: 40 rows, Σrevenue = **$99,555,426.88** = excl-cancelled truth ✓
- patterns_rollup: 140 rows, Σheatmap-revenue = **$99,555,426.88** ✓; patterns_meta dow_days={0..6:18}, total_days=126.

### PG-STAFF-TIMING / PG-PATTERNS-TIMING (final two empirical rows)
| Mode | Before (88K JS reduce) | After (rollup) | Speedup | Σ value-match |
|---|---|---|---|---|
| staff | 19,850 ms | **628 ms** | **32×** | $99,555,426.88 ✓ |
| patterns | 19,266 ms | **475 ms** | **41×** | $99,555,426.88 ✓ (peakHour 23 / peakDay Thu / avgSvc 72.43 / avgDailyRev $790,122.44) |

Both now under 3 s (target met). The 88K-row fetch + JS reduce is deleted for both (AP-17, single rollup path).

### PG-REGRESS — no regression
network_pulse `netRevenue` = **$100,068,158.15** / checksServed 263,250 (unchanged); timeline(month) Σ = **$100,068,158.15** (unchanged). The other 8 modes untouched (only the two `*FromFine` readers changed). PG-BUILD: `npm run build` exit 0.

**Commit:** `6a536600` — OB-237 RESIDUAL: write-time rollups for staff + patterns.

---

## §T-PROOF — FINAL INTEGRATION PROOF (all visualizations, all agents)

**Zero residuals. Every aggregate visualization serves from a materialization. `fetchRawDataServer` deleted. Zero raw aggregate paths remain platform-wide.**

The T-FIN ║ T-AGG fan-out completed (T-AGG clean; T-FIN's code landed but its run left a stale fine-table — re-running the canonical deterministic populator fixed it; all value-matches then passed). All 4 fine-table modes value-matched against deterministic truth; the (entity,day) summary + its 6 modes did not regress.

### PG-FINAL-2 — Empirical performance table (the headline)
| Mode | Before RAW (ms) | After (ms) | Speedup | Truth-match | Materialization |
|---|---|---|---|---|---|
| network_pulse | 3,277 | 2,341 | — | ✓ $100,068,158.15 | summary_artifacts |
| timeline | 58,633 | 1,366 | **43×** | ✓ | summary_artifacts |
| summary | ~58,000 | 1,379 | **42×** | ✓ | summary_artifacts |
| performance | ~58,000 | 1,371 | **42×** | ✓ | summary_artifacts |
| products | ~58,000 | 1,319 | **44×** | ✓ food $66.75M / bev $22.25M | summary_artifacts |
| leakage | 57,669 | 1,569 | **37×** | ✓ Desc $1,186,755.09 / Cort $337,531.65 / Canc $512,731.27 | summary_artifacts + conditional metrics |
| staff | 55,423 | 19,850 | 2.8× | ✓ $99,555,426.88 (excl-cancel) | summary_artifacts_fine |
| location_detail | ~58,000 | 1,411 | **41×** | ✓ $6,086,529.36 | summary_artifacts_fine |
| patterns | ~58,000 | 19,266 | 3.0× | ✓ $99,555,426.88 (excl-cancel) | summary_artifacts_fine |
| server_detail | ~58,000 | 494 | **117×** | ✓ $1,948,071.93 | summary_artifacts_fine |
| **Intelligence** getPeriodTotal | 1,981 (O(n) reduce) | 605 (sentinel) | **3.3×** | ✓ BCL $312,033 / per-period | period_outcomes sentinel rollup |
| **Compensation** (same rollup) | per-entity reduce | one-row read | O(n)→O(1) | ✓ $312,033 | period_outcomes sentinel rollup |

**Note on staff/patterns (2.8×/3.0×):** these read the full `summary_artifacts_fine` (88,459 rows) into JS — MSP-compliant (a materialization, not base rows) and 3× faster, but the residual is the 88K-row JSONB fetch. Sub-2s would require SQL aggregation over the fine table (a PostgREST-aggregate/RPC = architect migration, out of CC scope) — a named follow-on. `location_detail`/`server_detail` filter the fine table to one entity/server (small reads) → 41×/117×.

### PG-FINAL-1 — Zero raw aggregate paths (platform-wide)
- **Financial:** ZERO — no `fetchRawDataServer`, no raw `aggregate*` (only `*FromSummaries`/`*FromFine` + the bounded `aggregateChequesBounded` drill-through).
- **Intelligence/Compensation:** the 2 surviving `.reduce` (intelligence-data.ts:98, trajectory.ts:55) are **graceful fallbacks** — the primary paths read the one-row sentinel rollup; the reduce fires only for a period without a materialized rollup (never for BCL). Per T-AGG OBJ2 (graceful degradation for un-materialized tenants).
- **committed_data reads in serving routes:** none are aggregate-visualization paths — `aggregateChequesBounded` (bounded drill, filtered+LIMIT), the calc engine (`calculation/run` — out of scope), observatory/users (admin counts, `head:true`), intelligence/wire (binding, not viz).

### PG-FINAL-3 — Surfaces (headless value-match; browser render = architect-gated SR-44)
Every Financial mode returns correct data headlessly (all 10 value-matched above). Intelligence/Compensation `getPeriodTotal` returns BCL $312,033 / per-period exact from the sentinel. Browser render (`/financial`, `/financial/{timeline,performance,leakage,staff}`, `/stream`, `/insights`, `/perform`) is architect-gated per SR-44.

### PG-FINAL-4 — Build clean
`tsc --noEmit` exit 0; `rm -rf .next && npm run build` exit 0 (after the `route.ts:965` let→const fix). No code changed since (the fine-table re-population was a DB-only data operation).

### PG-FINAL-5 — MSP Application Map
`docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` updated: every Financial mode WIRED (cheques BOUNDED); Intelligence/Compensation aggregate reads WIRED to the sentinel rollup. **Zero RAW entries.**

### Verification summary
- Fine table: 88,459 rows, SUM(metrics.total) = **$100,068,158.15** = deterministic truth (re-run after T-FIN's stale state). cancelled_revenue $512,731.27.
- Period rollup: 6 BCL sentinel rows, per-period exact, grand **$312,033**.
- `fetchRawDataServer`: **deleted** (0 references). All raw `aggregate*`: deleted.
- (entity,day) summary_artifacts: intact ($100,068,158.15) — 6 prior modes no regression.

---


## §P0-FINAL (OB-237 COMPLETE directive) — conditional metric + leakage wired; ARCHITECT GATE reached

**PG-SCHEMA — `summary_artifacts` schema (for modeling `summary_artifacts_fine`):**
```
id uuid · tenant_id uuid · entity_id uuid · summary_date date(string) · period_id (null)
data_type text · metrics jsonb · row_count int · convergence_hash (null) · computed_at · created_at
sample metrics (lowercase raw keys): { mesa, folio, total, pagado, propina, tarjeta, efectivo,
  subtotal, ..., total_descuentos, total_cortesias, cancelado, + OB-237 derived:
  cancelled_revenue, cancelled_count, discount_count, comp_count }
```

**PG-CANCEL — conditional metric matches deterministic truth.** Summary Engine extended (the standalone re-materializer; the OB-233 engine HALTs on the `mesa` "group" method) to compute `cancelled_revenue`=SUM(total WHERE cancelado=1), `cancelled_count`, `discount_count` (cheques WHERE total_descuentos>0), `comp_count`. Fields resolved via `recognize()` (Korean Test: total/cancelado/total_descuentos/total_cortesias — no hardcode). Re-materialized Sabor:
`cancelled_revenue $512,731.27 / cancelled_count 1,320` == deterministic committed_data truth ✓; revenue $100,068,158.15 + row_count 263,250 unchanged.

**PG-REGRESS-P0** — network_pulse + timeline still **$100,068,158.15** after re-materialization ✓.

**PG-LEAKAGE — leakage wired, value-matched, raw deleted (AP-17).** Categories vs deterministic truth (EXACT):
| category | amount | count |
|---|---|---|
| Descuentos | $1,186,755.09 | 104,688 |
| Cortesías | $337,531.65 | 79,266 |
| Cancelaciones | $512,731.27 | 1,320 |
Timing: **57,669 ms RAW → 1,569 ms (~37×)**.

**PG-BASELINE — unrecoverable RAW cold baselines captured (before any T-FIN deletion):** `staff` **55,423 ms** (cold), `leakage` 57,669 ms (cold), `timeline` 58,633 ms (cold) — all `fetchRawDataServer`-dominated; `patterns`/`location_detail`/`server_detail` warm-confirm trivial JS agg (15–159 ms), cold ≈ shared ~55–58 s fetch.

### ARCHITECT GATE
**CREATE `summary_artifacts_fine`** (schema modeled on `summary_artifacts` above, **plus `mesero_id text`, `hour smallint`**, grain (entity, mesero, date, hour); the OB-237 conditional metrics carry into its `metrics`) **AND the aggregation RPCs** (`sum_entity_period_outcomes(p_tenant, p_period)`, a `component_breakdown` rollup RPC for T-AGG). **Both needed, one SQL Editor session.** Spec: `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`.

**HALT — CC STOPS here (P0 complete).** On resume: **T-FIN** populates `summary_artifacts_fine` for Sabor + wires `staff`/`location_detail`/`patterns`/`server_detail` + deletes `fetchRawDataServer` and all raw `aggregate*`; **T-AGG** converts Intelligence/Compensation JS `.reduce` → the RPCs ($312,033 BCL); **T-PROOF** runs the platform-wide zero-raw grep + the full empirical table.

**6 of 10 Financial modes now materialized** (network_pulse, timeline, summary, performance, products, leakage), all value-matched to deterministic truth; raw paths deleted. tsc 0, build 0.

---


**Branch:** `ob-237-materialized-serving-path` · **Base:** `main` · **Date:** 2026-06-24 · **Mode:** ULTRACODE
**Status:** **P0 complete.** **T1 attempted → HALT-BYTEMATCH (all 5 modes blocked).** The byte-match gate caught that `summary_artifacts` is **stale/out-of-sync with current `committed_data`** — wiring any mode to it would silently change the displayed numbers. Conversion reverted (no contamination, SR-41); root cause + architect disposition in §T1 below. CC does NOT merge (SR-44).

---

## §T1 — FINANCIAL WIRING ATTEMPT → HALT-BYTEMATCH (architect disposition required)

T1 wired the headline `timeline` mode to `summary_artifacts` (a clean `aggregateTimelineFromSummaries` mirroring the `network_pulse` template) and ran the byte-match gate on Sabor. **It failed — structurally, not on precision** — and the diagnosis revealed a data-integrity issue that blocks all 5 modes.

### Byte-match result (timeline, Sabor)
| metric | OLD (raw path, served) | NEW (summary_artifacts) | current committed_data (truth) |
|---|---|---|---|
| GRAND revenue | **$102,749,997.45** | **$100,068,158.15** | `SUM(row_data.total)` = **$103,687,500.29** |
| GRAND checks | 263,250 | 263,250 | 263,250 |
| GRAND tips | $13,073,353.95 | $0.00 / `"Propina"`=$12,746,075 | — |
| latency | 58,633 ms | 1,804 ms | — |

**Three different revenue numbers** — they should be one.

### Root cause (definitive, structural — SR-34)
1. **`summary_artifacts` is STALE.** Its `metrics` JSONB is keyed by the **original capitalized POS field names** (`"Total"`, `"Propina"`, …) and sums to **$100.07M** — the **pre-HF-321 / pre-HF-324** state (HF-336's backfill). The **current** `committed_data.row_data` is keyed by **lowercase normalized names** (`total`, `propina`, … — HF-321) with HF-324's multimonth-datagen values summing to **$103.69M**. The materialization was never re-run after those reseeds, so it no longer reflects the base data (`row_count`=263,250 matches, but the metric *values* and *keys* do not). No summary metric matches the raw path's `rd.total` ($102.75M) or `rd.propina` ($13.07M).
2. **The raw serving path is non-deterministic.** `fetchRawDataServer` paginates `committed_data` with `.range()` **but no `.order()`** (DIAG-075). PostgREST range-without-order can skip/duplicate rows across pages → the served revenue ($102.75M) differs from the true `SUM(row_data.total)` ($103.69M). (Separate raw-path bug.)
3. **`recognize()` tip binding mismatch.** The tips surface resolves to display_label `"Propinas"` (plural), but the (stale) summary metric key is `"Propina"` (singular) → 0. Symptom of the same key-representation drift.

### Why this blocks all 5 modes
`timeline`/`summary`/`location_detail`/`performance`/`leakage` all read the same stale `summary_artifacts.metrics`. Until the materialization is rebuilt from current `committed_data`, **none can byte-match** the raw path — wiring them would silently shift every Financial revenue figure by ~3.6%. (`network_pulse` byte-matched at OB-229 time because the data and summary were then in sync; they have since diverged.)

### Architect disposition (SR-44 — CC cannot do these)
1. **Re-materialize `summary_artifacts` from current `committed_data`** (re-run the OB-229 import-time aggregation / `compute_summary_artifacts` path) so `metrics` carries the lowercase normalized keys + HF-324 values. This is the unblock for all of T1.
2. **Fix the raw-path non-determinism** — add `.order('id')` (or a stable key) to `fetchRawDataServer`'s paginated `committed_data` read so the "before" baseline is itself deterministic (follow-on HF).
3. After (1), T1's byte-match wiring (the reverted `aggregateTimelineFromSummaries`, ready to re-apply) proceeds per the directive.

### Compliance
HALT-BYTEMATCH fired exactly as designed — the gate **prevented shipping a silent revenue change**. The conversion was reverted (`git checkout`, no contamination — SR-41). No raw path was deleted. Per §2.1, both outputs are reported verbatim; the architect reconciles which is canonical.

---

## §T1-RESOLVED — UNBLOCK (architect dispositioned: re-materialize + byte-match against TRUTH)

The architect corrected the byte-match reference: compare against a **deterministic `committed_data` aggregate (truth)**, NOT the raw path (which is non-deterministic). Re-materializing surfaced the **real** root cause:

### The summary was NOT stale — the raw path was the bug
Re-materializing `summary_artifacts` deterministically (`order by id`, SUM all JSON-number fields, raw lowercase keys) produced **SUM(total) = $100,068,158.15**, which **exactly equals deterministic `committed_data` SUM(total) = $100,068,158.15** (row_count 263,250 = 263,250). This is the **same value the original summary already had**. So:
- The original summary ($100.07M) was **correct all along** — it matched deterministic truth.
- My earlier "$103.69M committed_data" and the raw path's "$102.75M" were both artifacts of **non-deterministic pagination (no `ORDER BY` on `.range()`)** — counting some rows twice/skipping others. The raw serving path is the buggy one (architect disposition #2).
- The HALT-BYTEMATCH was the gate working: it caught that the raw path disagreed with truth. The fix is to serve from the (correct) materialization and delete the (buggy) raw path.

### What changed
1. **Re-materialized `summary_artifacts` for Sabor** (`scripts/ob237-rematerialize-sabor.ts`) — deterministic, raw lowercase keys (`total`/`propina` = `recognize().field_name`). Truth-match: revenue + row_count EXACT.
2. **Route measure-resolution `display_label → field_name`** (route.ts:355) — the re-key to lowercase required this; it also fixes the pre-existing `propina → "Propinas"` display-label divergence. **network_pulse now value-matches truth** ($100,068,158.15, tipRate 12.74) where the stale display-label path would now read 0.
3. **Wired `timeline`** to `summary_artifacts` (`aggregateTimelineFromSummaries` + `buildTimelineResponse`, summary-primary single path); raw `aggregateTimeline` + its switch case **deleted** (AP-17).

### Truth value-match (PASS) + performance
| mode | revenue | checks | tips | raw latency | summary latency | speedup |
|---|---|---|---|---|---|---|
| **truth (committed_data, deterministic)** | $100,068,158.15 | 263,250 | $12,746,075.01 | — | — | — |
| **network_pulse** (re-fixed) | $100,068,158.15 ✓ | 263,250 ✓ | tipRate 12.74 ✓ | — | 2,341 ms | — |
| **timeline** (wired, raw deleted) | $100,068,158.15 ✓ | 263,250 ✓ | $12,746,075.01 ✓ | 58,633 ms | 1,366 ms | **~43×** |

tsc 0, build 0. Commits: re-materialize (`summary == truth`), timeline wire (`value-matched, raw removed`).

### Remaining modes (4) — same proven pattern
`summary`, `location_detail`, `performance`, `leakage` follow the identical pattern. See §T1-COMPLETE.

---

## §T1-COMPLETE — all wirable modes done; 2 coverage gaps found on close reading

Of the 4 remaining modes, **2 wired and value-matched**, **2 are genuine coverage gaps** (P0's "wirable" classification was optimistic — close reading revealed sub-entity/conditional-aggregate dependencies the entity-day summary cannot serve).

### Wired + value-matched to deterministic truth ($100,068,158.15 / 263,250 / $12,746,075.01)
| Mode | Value-match | Raw baseline | Summary | Speedup |
|---|---|---|---|---|
| `network_pulse` | PASS (revenue $100,068,158.15, tipRate 12.74) | — (was wired) | 2,341 ms | — |
| `timeline` | PASS (rev/checks/tips EXACT) | 58,633 ms | 1,366 ms | **~43×** |
| `summary` | PASS (Gross $100,068,158.15 / 263,250 / Tips $12,746,075.01; 6 months) | ~58,000 ms* | 1,379 ms | **~42×** |
| `performance` | PASS (SUM(20 locations.revenue) $100,068,158.15) | ~58,000 ms* | 1,371 ms | **~42×** |
| `products` | PASS (networkFood $66,751,957 / networkBev $22,246,074 / checks 263,250) | ~58,000 ms* | 1,319 ms | **~44×** |

*Raw baseline for summary/performance/products is the shared `fetchRawDataServer` cold cost (~58–63 s, measured: timeline 58,633 / leakage 57,669); the early-return now intercepts before it.

**`products` was re-classified during the spec work** (it aggregates per-location food/beverage *category* totals — `total_alimentos`/`total_bebidas`, already in `summary_artifacts.metrics` — NOT per-product line items), so it needed **no migration** and was wired here. food/bev resolved via `recognize()` → `field_name` (`total_alimentos`/`total_bebidas`).

Each wired mode: `aggregate<Mode>FromSummaries` reading `summary_artifacts` (raw field keys = `recognize().field_name`), summary-primary single-path early-return, **raw function + switch case DELETED (AP-17)**.

### HALT-COVERAGE (kept raw — cannot be served from the entity-day summary; SR-34: no hybrid/reduced-scope)
- **`location_detail`** — returns a **per-`mesero_id` staff breakdown** (sub-entity data). `summary_artifacts` is grained at (entity, day), not (entity, server). Same gap class as `staff`/`server_detail`.
- **`leakage`** — needs **cancelled revenue** = `SUM(total WHERE cancelado=1)`, a **conditional aggregate** the domain-agnostic summary does not materialize (it carries `SUM(total)` and `SUM(cancelado)`=count, not the cross-product). Discount/comp totals ARE servable, but the leakage figure depends on cancelled-revenue, so the mode cannot be cleanly wired without a finer/conditional materialization.

Both kept their raw paths intact (no regression). They join `staff`/`server_detail`/`patterns`/`products` as **coverage-gap residuals** needing a finer materialization (architect — a materialization build = migration, SR-44).

### Zero-raw-path verification (`grep` over route.ts)
```
aggregateTimeline(    -> 0 (deleted; only aggregateTimelineFromSummaries)
aggregateSummary(     -> 0 (deleted)
aggregatePerformance( -> 0 (deleted)
aggregateLeakage(     -> PRESENT (HALT-COVERAGE, kept raw)
aggregateLocationDetail( -> PRESENT (HALT-COVERAGE, kept raw)
```
Wired modes: single materialized path. Coverage-gap modes: raw path retained (documented).

### Build / verification
`tsc --noEmit` 0, `rm -rf .next && npm run build` EXIT 0. All 4 wired modes value-matched headlessly against deterministic `committed_data` truth (the buggy non-deterministic raw path is retired for them). Browser render verification is architect-gated (SR-44).

### Net result
- **MSP invariant now holds for 5 of 10 Financial aggregate modes** (network_pulse, timeline, summary, performance, products) — they read the materialization, not base rows; the non-deterministic raw path is deleted for them (network_pulse retains its OB-229 raw fallback).
- **5 modes await a finer materialization** (architect, per `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`): `leakage` (cancelled-revenue conditional metric), `staff` + `location_detail` (server grain), `patterns` (hourly grain), `server_detail` (server+hourly grain). Recommended sibling table `summary_artifacts_fine` + a Summary-Engine conditional-metric extension.
- The re-materialization corrected the data-determinism issue; the headline `timeline` is **43× faster** and **correct** (where the raw path was both slow and wrong).

---

---

## 1. Commits
| SHA | Message | Files |
|---|---|---|
| _(P0)_ | `P0: MSP Application Map + baseline — discovery complete (3 premise-corrections)` | `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` |
| _(this)_ | `OB-237: completion report` | `docs/completion-reports/OB-237_COMPLETION_REPORT.md` |

## 2. MSP Application Map
Full map: `docs/diagnostics/OB-237_MSP_APPLICATION_MAP.md` (committed). Summary of classification:
- **Financial:** `network_pulse` WIRED; `timeline/summary/location_detail/performance/(loc-)leakage` **RAW → wirable to `summary_artifacts` (migration-free)**; `staff/server_detail/patterns/products` **RAW → coverage-gap** (need finer materialization); `cheques` BOUNDED.
- **Intelligence & Compensation:** **already materialization-backed** (`getEntityResults` → `entity_period_outcomes` preferred). §1.4 invariant (read a materialization) **already satisfied**. Residual = O(n) JS `.reduce` over the materialization.
- **Cross-agent** (reconciliation/periods/import): not aggregate-render surfaces → OUT-OF-SCOPE.

## 3. Empirical baseline (P0.6) + the architecture finding
| Agent | Surface | Mode | Class | Cold (ms) | Payload |
|---|---|---|---|---|---|
| Financial | Network Pulse | `network_pulse` | WIRED | 3,277 | 7.6 KB |
| Financial | Revenue Timeline | `timeline` | RAW | **63,684** | 4.0 KB |

The "after" multiplier for wired Financial modes is realized by the OB-229 summary path (network_pulse demonstrates ~3.3s vs the 63.7s raw fetch). The full before/after table (PG-5) is producible once the wirable modes are converted (§6).

## 4. THREE PREMISE-CORRECTIONS (the headline of P0 — architect disposition required)

### 4.1 `financial_summary_daily` does not exist → the materialization is `summary_artifacts`
The directive (§1.1, §3.P0, HALT-SCHEMA) names `financial_summary_daily` as OB-229's financial materialization. **It does not exist** in the live DB. The actual OB-229 materialization is **`summary_artifacts`** (Sabor 2520 rows, populated; daily-per-entity `metrics` JSONB). The directive itself names `summary_artifacts` as the valid alternative (§3.T1.2/§3.T1.3). **Resolution:** treat `summary_artifacts` as the Financial target — **no table creation, no migration, HALT-SCHEMA not escalated** (the materialization premise holds). **Architect: ratify the naming reconciliation.**

### 4.2 SQL-level aggregation requires a migration (SR-44) — the OB's core value is architect-gated for T2/T3
The OB's animating goal (§1.2/§1.3/Principle-2) is to replace **O(n) JS aggregation** with **O(1) SQL aggregation**. P0 proved this is **impossible for CC without a migration**:
- PostgREST aggregate functions are **disabled** — `entity_period_outcomes.select('total_payout.sum()')` → `"Use of aggregate functions is not allowed"`.
- `exec_sql` RPC **does not exist**; no aggregation RPC/view exists (probed `compute_summary_artifacts`, `sum_entity_period_outcomes`, … all NOT FOUND).
- Therefore the directive's §3.T2.3 "Option A — SQL `jsonb_array_elements` + `GROUP BY` + `SUM`" needs **CREATE FUNCTION / VIEW = a migration (SR-44 architect-only)**.

**Architect disposition required:** to deliver true O(1) serving for Intelligence/Compensation (and to reduce the residual JS over the Financial summary), create the aggregation primitives — minimally:
- `sum_entity_period_outcomes(p_tenant uuid, p_period uuid) returns numeric` (period total, indexed).
- a `component_breakdown` rollup RPC (period → component → SUM(payout)).
- optionally enable PostgREST `db-aggregates-enabled` for the read role.

Until then, the migration-free MSP move is **switching reads from base tables → existing materializations** (which Intelligence/Compensation already do).

### 4.3 Intelligence & Compensation already consume the materialization — the §1.4 invariant is already satisfied there
`getEntityResults` (`drill-through/entity-results.ts:102-122`) reads **`entity_period_outcomes` as the PREFERRED path**, falling back to `calculation_results` only when no materialized outcome exists. So the directive's premise that these surfaces "re-derive … from `calculation_results.components` JSONB by fetching all entity rows" (§1.2) is **largely stale**: `getPeriodTotal`/`getComponentTotals`/`getPayoutDistribution`/trajectory/perform/operate all flow through `getEntityResults` → the D7 materialization. They do **not** re-derive from base rows. The only residual is the JS `.reduce` *over the materialization* — the O(n) concern fixable only via §4.2's migration.

**Consequence:** there is **no genuine base-row RAW work for T2/T3.** Their MSP invariant holds today; their scale-optimization is §4.2 (architect). The genuine base-row re-derivation defect (§1.4) is **Financial-only**.

## 5. Value-match ground truth (verified, P0)
`SUM(entity_period_outcomes.total_payout)` per period for BCL (fetch+JS): Oct **$44,590** · Nov **$46,291** · Dec **$61,986** · Jan **$47,545** · Feb **$53,215** · Mar **$58,406** · **grand $312,033** — **exact match** to the directive (§3.T3.2). Resolves the prior $49,911-vs-$58,406 ambiguity (March = **$58,406** is correct from the materialization). This is the materialization-backed answer the Intelligence/Compensation surfaces already serve.

## 6. Remaining work, precisely scoped (no re-discovery needed)

### T1 — Financial, migration-free (CC-executable now)
Wire `timeline`, `summary`, `location_detail`, `performance`, location-level `leakage` to `summary_artifacts`, mirroring the existing `aggregateNetworkPulseFromSummaries` template (route.ts:327): `getSummaryArtifacts(sb, tenant, {dataType:'pos_cheque'})` → `recognize()` measure-key resolution → group by `summary_date` / entity→brand → existing finalizers. Add a summary-primary early-return per mode (like network_pulse 1415-1424), raw as graceful fallback (OB-229 pattern). Byte-match each against the raw aggregate on Sabor before retiring the raw path. Headline: `timeline` 63.7s → ~3s.

### T1 — Financial, coverage-gap RESIDUAL (architect: finer materialization)
`summary_artifacts` is grained at **(entity, day)**. `staff`/`server_detail` (per-server/mesero), `patterns` (per-hour heatmap), `products` (per-cheque product mix) need **sub-entity grain the summary does not carry** (HALT-T1-COVERAGE class). Converting them requires **extending the OB-229 import-time materialization** to emit server/hour/product grain — a materialization build = migration (SR-44, §6.2). Until then they stay RAW (flagged), not silently broken.

### T2/T3 — already-compliant + the §4.2 migration
Verify-and-document (done): reads are materialization-backed; totals match ($312,033). The O(n)-JS→O(1)-SQL conversion is the §4.2 aggregation-RPC migration (architect).

## 7. Proof gates
- **PG-8 (map completeness):** PASS — every navigation aggregate surface classified in the map.
- **HALT-EMPTY / HALT-ZERO-RAW:** not fired (entity_period_outcomes populated for BCL; Financial has genuine RAW).
- **HALT-SCHEMA:** examined → resolved as naming reconciliation (§4.1), not escalated.
- **Value-match ground truth (PG-3/PG-4 data):** PASS at the materialization layer ($312,033 / per-period exact, §5).
- PG-1/2/5/6/7 (post-conversion timing + byte-match) are pending the §6 T1 conversion / §4.2 migration.

## 8. Residuals (named, not absorbed/dropped)
1. **Aggregation-RPC migration** (`sum_entity_period_outcomes` + component rollup) — enables true O(1) for Intelligence/Compensation and reduces residual JS for Financial. Architect (SR-44).
2. **Finer Financial materialization** (server/hour/product grain) — enables `staff`/`server_detail`/`patterns`/`products` MSP conversion. Architect (materialization build = migration).
3. **`financial_summary_daily` naming ratification** (§4.1).
4. **T1 wirable-mode conversion** (§6) — migration-free, executable as the next increment.

## 9. Compliance
- **Architecture Decision Gate:** the serving-path materialization targets are documented in the map; the migration-gated portions are surfaced, not bypassed (SR-34: no workaround — the absence of SQL aggregation is reported, not faked with a JS shim claiming O(1)).
- **Anti-Pattern Registry:** AP-4/AP-11/AP-17/AP-21 honored in the plan; no empty shells introduced; no second code path added (P0 is read-only discovery).
- **Scale analysis:** the §4.2 finding IS the scale analysis — JS-over-materialization is O(materialized-rows); true Empresarial/Corporativo scaling needs the SQL-aggregation primitives (architect migration). P0 documents this rather than shipping an O(n) path that masquerades as compliant.
- **SR-44:** no migrations run, no PR merged, no browser self-attestation.
