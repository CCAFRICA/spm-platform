# OB-237 RESIDUAL: FINER MATERIALIZATION SPEC — DESIGN DELIVERABLE

**Branch:** `ob-237-materialized-serving-path` (continue)
**Predecessor:** OB-237 T1 complete. 4 of 6 Financial aggregate modes wired to `summary_artifacts` (43×/42×/42× speedup, value-matched to deterministic truth). 6 modes remain RAW due to coverage gaps — the materialization doesn't carry the data grain they need.
**Standing rules:** All active. This is a READ-ONLY design deliverable. Zero code changes to `route.ts` or any source file.
**Output:** `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md`

---

## OBJECTIVE

Produce a specification that tells the architect exactly what `summary_artifacts` (or a sibling materialization table) needs to carry so the remaining 6 RAW Financial modes can be wired the same way timeline/summary/performance were — summary-primary, raw-deleted, value-matched to truth. The architect uses this spec to create the SQL migration; then CC wires the modes.

The 6 modes split into two coverage classes discovered during T1:

**Class 1 — Sub-entity grain (4 modes):**
- `location_detail` — needs per-mesero/server metrics within a location
- `staff` — needs per-server/mesero aggregate metrics across the network
- `server_detail` — needs per-server drill-down
- `patterns` — needs per-hour (hourly grain, not daily) heatmap data

**Class 2 — Conditional aggregation (2 modes):**
- `leakage` — needs `SUM(total) WHERE cancelado=1` (cancelled revenue), plus discount/comp breakdowns
- `products` — needs per-product or per-category metrics (product-level grain from line items)

---

## PROCEDURE

### Step 1 — Read each RAW mode's handler

For each of the 6 modes, read the raw-path aggregation function in `route.ts`. Document exactly:

1. **What fields it reads from `committed_data.row_data`** — list every JSON key accessed (e.g., `rd.total`, `rd.propina`, `rd.mesero`, `rd.cancelado`, `rd.hora`, `rd.producto`).
2. **What grain it groups by** — (entity + date), (entity + server), (entity + hour), (entity + product), or other.
3. **What aggregation it performs** — SUM, COUNT, AVG, conditional SUM, ranking, percentile.
4. **What response shape it produces** — the structure of the JSON returned to the page.

```bash
echo "=== RAW MODE HANDLERS ==="
# For each mode, find its aggregation function
for mode in location_detail staff server_detail patterns leakage products; do
  echo ""
  echo "--- $mode ---"
  grep -n "aggregate.*$mode\|case.*$mode\|$mode.*:" web/src/app/api/financial/data/route.ts | head -5
done

echo ""
echo "=== FULL RAW FUNCTIONS (read each) ==="
# location_detail
echo "--- aggregateLocationDetail ---"
grep -n "function aggregateLocationDetail\|async function aggregateLocationDetail" web/src/app/api/financial/data/route.ts

# staff
echo "--- aggregateStaff ---"
grep -n "function aggregateStaff\|async function aggregateStaff" web/src/app/api/financial/data/route.ts

# server_detail
echo "--- aggregateServerDetail ---"
grep -n "function aggregateServerDetail\|async function aggregateServerDetail" web/src/app/api/financial/data/route.ts

# patterns
echo "--- aggregatePatterns ---"
grep -n "function aggregatePatterns\|async function aggregatePatterns" web/src/app/api/financial/data/route.ts

# leakage
echo "--- aggregateLeakage ---"
grep -n "function aggregateLeakage\|async function aggregateLeakage" web/src/app/api/financial/data/route.ts

# products
echo "--- aggregateProducts ---"
grep -n "function aggregateProducts\|async function aggregateProducts" web/src/app/api/financial/data/route.ts
```

For each function found, read it end-to-end. Extract the field-access, grouping, and aggregation patterns.

### Step 2 — Map each mode's data requirements

For each mode, produce a requirements row:

| Mode | Fields consumed from row_data | Group-by grain | Aggregation type | Current summary_artifacts carries this? | What's missing |
|---|---|---|---|---|---|

The "What's missing" column is the core output. It tells the architect what to add.

### Step 3 — Design the materialization extension

Based on the requirements map, propose the minimal extension to the materialization. Two options to evaluate:

**Option A — Extend `summary_artifacts` with finer grain.** Add new rows at (entity, server, day) or (entity, hour) grain alongside the existing (entity, day) rows. Differentiate by a `grain_type` or `artifact_type` column. Pro: single table, single read path. Con: row count multiplies (20 locations × 10 servers × 180 days = 36K rows vs current 2,520).

**Option B — Sibling materialization table.** A new `summary_artifacts_detail` (or similar) table at the finer grain, read only by the modes that need it. The existing `summary_artifacts` stays untouched. Pro: no risk to the working 4 modes. Con: two tables to maintain.

**For conditional aggregation (leakage):** The current Summary Engine's `jsonb_each` + `jsonb_typeof='number'` pattern SUMs all numeric fields unconditionally. Leakage needs `SUM(total) WHERE cancelado=1`. This requires either:
- A filter predicate in the materialization (SUM the `total` field only for rows where `cancelado` = 1), stored as a separate metric key (e.g., `cancelled_revenue`).
- Or a pre-filter step that partitions `committed_data` rows before aggregation.

Document which approach is cleaner and why.

**For products:** Determine whether product data exists in `committed_data.row_data` as nested line items or as separate rows. If line items: the Summary Engine would need to unnest before aggregating. If separate rows with a different `data_type`: the materialization just needs to run against that data type.

### Step 4 — Produce the spec

Write `docs/diagnostics/OB-237_FINER_MATERIALIZATION_SPEC.md` with:

1. **Requirements table** (Step 2) — every mode, every field, every grain.
2. **Option analysis** (Step 3) — A vs B with recommendation.
3. **Proposed schema** — the columns/structure the migration would create or extend. Include example rows showing what the materialized data looks like for Sabor.
4. **Materialization trigger** — when does this finer materialization fire? Same import-time hook as OB-229? Additional trigger on demand?
5. **Row count estimate** — for Sabor (20 locations, ~48 servers/meseros, 180 days, 263K cheques), how many rows would each grain level produce?
6. **Modes unblocked** — for each of the 6 modes, confirm: "with this materialization, the mode can be wired the same way timeline was — `aggregate<Mode>FromSummaries`, value-match, delete raw."
7. **Empirical performance table** — current RAW timing for each of the 6 modes on Sabor (capture from dev server log, same procedure as P0 baseline).

Commit + push:

```bash
cd ~/spm-platform && git add -A && \
git commit -m "OB-237: finer materialization spec — 6 remaining RAW modes requirements + design" && \
git push origin ob-237-materialized-serving-path
```

Update PR #598. Do NOT merge (SR-44).

---

## SCOPE — HARD LIMITS

**IN SCOPE:** Reading raw-path handlers. Producing the spec document. Capturing baseline timings for the 6 RAW modes.

**OUT OF SCOPE:**
- Any code change to `route.ts` or any source file
- Any migration, table creation, or schema change
- Wiring any mode (that happens after the architect creates the migration)
- Intelligence/Compensation surfaces (already MSP-compliant)
- Modifying the Summary Engine's write path (that's the migration's job)

**NO HALT CONDITIONS** — this is a read-only design deliverable. If a mode's handler doesn't exist or can't be found, document that finding in the spec.
