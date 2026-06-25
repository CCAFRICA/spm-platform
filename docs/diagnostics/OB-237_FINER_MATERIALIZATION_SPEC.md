# OB-237 — Finer Materialization Spec (design deliverable for the 6 remaining RAW Financial modes)

**Branch:** `ob-237-materialized-serving-path` · **Date:** 2026-06-24 · **Read-only design; zero code changes.**
**Predecessor:** T1 wired 4 modes (network_pulse/timeline/summary/performance) to `summary_artifacts` at **(entity, day)** grain, value-matched to deterministic truth. 6 modes remain RAW. This spec tells the architect exactly what a finer materialization must carry so CC can wire them the same way (summary-primary, raw-deleted, value-matched).

> **HEADLINE FINDING — `products` is mis-classified; it is servable NOW, no migration.** `aggregateProducts` aggregates per-location **food (`total_alimentos`) vs beverage (`total_bebidas`) category totals**, NOT per-product line items. Both fields are already in `summary_artifacts.metrics`. **`products` can be wired immediately** (same as `performance`) — it is removed from the migration-dependent set. The directive's "per-product line items" premise does not match the code.

So the genuine gaps are **5 modes** across **3 extension types**, not 6 across 2.

## 1. Requirements table (Step 1-2 — read from `route.ts`)

| Mode | Fields read from `row_data` | Group-by grain | Aggregation | (entity,day) summary carries it? | What's missing |
|---|---|---|---|---|---|
| **`products`** (1017) | `total_alimentos`, `total_bebidas`, `fecha`(day) | (entity, day) | SUM food/bev per location | **YES** | **nothing — wire now** |
| **`leakage`** (387) | `total_descuentos`, `total_cortesias`, `total` **where `cancelado=1`**, `cancelado`, `fecha`(day, half, week) | (entity, day) | SUM + **conditional SUM** (cancelled revenue) | discount/comp **YES**; cancelled-revenue **NO** | **`cancelled_revenue` = SUM(`total`) WHERE `cancelado`=1** (conditional metric) |
| **`staff`** (569) | `total`, `propina`, `mesero_id`, `cancelado`(skip), `fecha`(week) | **(mesero)** network-wide | SUM/COUNT per server + ranking | **NO** | **(entity, mesero, day)** grain |
| **`location_detail`** (1124) | entity: `total`/`propina`/`total_alimentos`/`total_bebidas`/`total_descuentos`/`total_cortesias`/`numero_de_personas`; **staff section: `mesero_id`** | entity + **(entity, mesero)** | SUM per entity + per server | entity-level **YES**; staff section **NO** | **(entity, mesero, day)** grain (staff section only) |
| **`patterns`** (819) | `total`, `propina`, `numero_de_personas`, `cancelado`(skip), `fecha`(**`getHours()`** + `getDay()`) | **(entity, day-of-week, hour)** heatmap | SUM/COUNT per dow×hour | **NO** (summary is daily, loses hour) | **(entity, date, hour)** grain |
| **`server_detail`** (1237) | `total`, `propina`, `total_alimentos`, `total_bebidas`, `total_descuentos`+`total_cortesias`, `numero_de_personas`, `mesero_id`(filter), `fecha`(day), `cierre`(**`getHours()`**) | **(mesero, day)** + **(mesero, hour)** | SUM per server + daily + hourly | **NO** (per-server + hourly) | **(entity, mesero, date, hour)** grain |

**Three extension types:**
- **(a) Conditional metric** — `cancelled_revenue` on the existing (entity, day) rows → unblocks **leakage**.
- **(b) Server (sub-entity) grain** — (entity, mesero, day) → unblocks **staff**, **location_detail** (staff section).
- **(c) Hourly grain** — (entity, date, hour) → unblocks **patterns**; **server_detail** needs both (b)+(c) → (entity, mesero, date, hour).

## 2. Option analysis (Step 3)

**Conditional metric (leakage) — extend the Summary Engine, no new table.** The current engine (`aggregateCommittedRows`, `summary-engine.ts`) does `jsonb_each` + `jsonb_typeof='number'` → unconditional SUM. Add a conditional pass: for a declared predicate (`cancelado = 1`), SUM a target field (`total`) into a named metric (`cancelled_revenue`). Stored on the existing (entity, day) `metrics` JSONB. **Smallest change, zero new rows, zero risk to the 4 working modes.** Recommended for leakage regardless of the grain decision below.

**Sub-entity + hourly grain — Option A vs B:**
- **Option A — `grain_type` column on `summary_artifacts`.** Add finer rows differentiated by `grain_type ∈ {entity_day, entity_mesero_day, entity_date_hour, …}`. Pro: one table, one read path. **Con: the 4 working modes' read (`getSummaryArtifacts`) would now have to filter `grain_type='entity_day'` everywhere — a change to proven code + a regression risk to the value-matched modes.**
- **Option B — sibling table(s) at the finer grain.** New `summary_artifacts_fine` read ONLY by the gap modes; existing `summary_artifacts` untouched. Pro: **zero risk to the 4 working modes**; the proven read path is unchanged. Con: a second table to materialize.

**RECOMMENDATION: Option B.** The 4 wired modes are value-matched and must not regress (SR-34). A sibling table isolates the finer grain. **One sibling table at the finest needed grain — (entity, mesero, date, hour) — rolls up to every gap mode** (server-day for staff; mesero+hour for server_detail; entity+dow+hour for patterns; entity+mesero for location_detail-staff; entity-day for any entity rollup). Plus the conditional `cancelled_revenue` metric (on either table) for leakage.

## 3. Proposed schema

**(i) Conditional metric on existing `summary_artifacts` (leakage):**
```
-- Summary Engine extension: a conditional metric in the existing (entity, day) metrics JSONB
metrics: { …existing keys…, "cancelled_revenue": SUM(row_data.total) WHERE row_data.cancelado = 1,
                            "cancelled_count":   COUNT(*)            WHERE row_data.cancelado = 1 }
```
No schema change to the table; the engine writes additional metric keys. (`cancelled_count` already derivable as `metrics.cancelado` = SUM of the 0/1 flag, but make it explicit.)

**(ii) Sibling `summary_artifacts_fine` (entity, mesero, date, hour):**
```
summary_artifacts_fine (
  id uuid pk, tenant_id uuid, entity_id uuid,
  mesero_id text,          -- the server (row_data.mesero_id)
  summary_date date,       -- row_data.fecha::date
  hour smallint,           -- extract(hour from row_data.fecha)  (0-23)
  data_type text,          -- 'pos_cheque'
  metrics jsonb,           -- SUM of all numeric row_data fields for this (entity,mesero,date,hour)
  row_count int,           -- cheque count for the bucket
  computed_at timestamptz, created_at timestamptz
)
-- indexes: (tenant_id, entity_id), (tenant_id, mesero_id), (tenant_id, summary_date)
```
Example rows (Sabor):
```
{entity_id:998232f0…, mesero_id:"12", summary_date:"2024-01-07", hour:13,
 metrics:{total:4820.50, propina:611.40, numero_de_personas:38, total_alimentos:3010.0,
          total_bebidas:1810.5, total_descuentos:120.0, total_cortesias:0, cancelado:0}, row_count:14}
```
Gap modes roll this up: `staff` → group by mesero (sum over entity/date/hour); `patterns` → group by entity + dow(date) + hour; `server_detail` → filter mesero, group by date and by hour; `location_detail` staff → filter entity, group by mesero; `leakage` (if not using the conditional metric) → filter cancelado via a `cancelled_revenue` key here too.

## 4. Materialization trigger
Same hook as OB-229 (`runSummaryEngine` at `finalize-import`), extended to also emit (i) the conditional metrics on the (entity,day) rows and (ii) the `summary_artifacts_fine` rows. Idempotent replace per tenant (the engine already deletes+rebuilds). An on-demand admin re-materialize (the `scripts/ob237-rematerialize-sabor.ts` pattern) backfills existing tenants. **Re-materialization is a CC data operation (architect dispositioned in the unblock); the table CREATE is the migration (SR-44 architect-only).**

## 5. Row-count estimate (Sabor: 20 locations, ~40 meseros, ~180 days, 263,250 cheques)
| Grain | Est. rows | vs base (263,250) |
|---|---|---|
| (entity, day) — existing | 2,520 | 1% |
| + `cancelled_revenue` metric | 2,520 (no new rows) | — |
| (entity, mesero, date) | ~7,200 | 3% |
| (entity, date, hour) | ~43,000 | 16% |
| **(entity, mesero, date, hour) — recommended fine table** | **~90,000** (bounded by 263,250; sparse — only buckets with cheques) | ~34% |
The fine table is the largest but still ~1/3 of base, and reads are **indexed + filtered** (one entity / one mesero / one date-range), so per-request rows fetched are small — the O(n)-JS-over-base-rows disease does not return.

## 6. Modes unblocked (confirmation)
| Mode | Unblocked by | Wire pattern (post-migration) |
|---|---|---|
| `products` | **already** (existing (entity,day) summary) | `aggregateProductsFromSummaries` — wire NOW, no migration |
| `leakage` | (i) `cancelled_revenue` conditional metric | `aggregateLeakageFromSummaries` reading (entity,day) + cancelled_revenue |
| `staff` | (ii) fine table → group by mesero | `aggregateStaffFromSummaries` |
| `location_detail` | (ii) fine table (staff section) + existing (entity,day) (entity section) | `aggregateLocationDetailFromSummaries` |
| `patterns` | (ii) fine table → entity+dow+hour | `aggregatePatternsFromSummaries` |
| `server_detail` | (ii) fine table → mesero + hour | `aggregateServerDetailFromSummaries` |
Each then follows the proven T1 procedure: build `aggregate<Mode>FromSummaries`, summary-primary early-return, **value-match grand totals against deterministic `committed_data` truth**, delete raw path (AP-17).

## 7. Empirical RAW baseline (the modes this spec unblocks)
All 6 RAW modes share `fetchRawDataServer` (paginated 263K-row `committed_data` fetch; `SERVER_CACHE` gives warm hits within 5 min, but every cache-miss/first-encounter pays the cold cost — the Progressive Performance violation).
| Mode | RAW cold (ms) | Notes |
|---|---|---|
| `leakage` | **57,669** | measured (cold, full-tenant) |
| `products` | 25 (warm) / ~58,000 cold | warm = `SERVER_CACHE` hit; cold = shared fetch |
| `staff` / `patterns` / `location_detail` / `server_detail` | ~58,000–63,000 cold | shared `fetchRawDataServer` cost (timeline measured 58,633) |
Post-materialization target: **<2 s** (the 4 wired modes land at ~1.3–2.3 s).

## 8. Recommended sequencing
1. **Wire `products` now** (no migration) — closes 1 of 6 immediately.
2. **Architect: extend the Summary Engine** with `cancelled_revenue` (conditional metric) — CC then wires `leakage`.
3. **Architect: CREATE `summary_artifacts_fine`** (migration) + extend the engine to populate it — CC then wires `staff`, `location_detail`, `patterns`, `server_detail`.
After (1)-(3), all 10 Financial modes serve from a materialization; `fetchRawDataServer` and every raw `aggregate*` are deleted; the non-deterministic raw path is fully retired.
