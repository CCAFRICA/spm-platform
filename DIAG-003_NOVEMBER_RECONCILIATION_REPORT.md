# DIAG-003: November Reconciliation — $49,180 vs GT $46,291

## Root Cause

**Convergence binding batch mismatch.** The `input_bindings.convergence_bindings` in the active rule_set reference `source_batch_id: "d3c63265..."` (October's import batch). When computing November, `committedData` only contains November rows with `import_batch_id: "fc33db5a..."`.

The `dataByBatch` indexing in `route.ts:422-427` builds a Map keyed by `import_batch_id`. Line 426 checks `entityColsByBatch.get(batchId)` — but `entityColsByBatch` only contains batch IDs from the convergence bindings (October's). November's batch ID isn't there, so ALL November rows are skipped.

Result: `resolveMetricsFromConvergenceBindings` returns null for every component. The fallback `buildMetricsForComponent` path uses the old sheet-matching logic which doesn't resolve all metrics:
- **C3 = $0**: Can't map `Cantidad_Productos_Cruzados` → `cross_products_sold`
- **C1 wrong cells**: Uses wrong metric for column dimension
- **C2 partial**: Some tiers resolve incorrectly
- **C4 too high**: Gate evaluates differently

## Evidence

### Component-Level Deltas
| Component | Platform | GT | Delta |
|-----------|----------|-----|-------|
| C1 Credit Placement | $26,560 | $16,700 | +$9,860 |
| C2 Deposit Capture | $13,470 | $12,530 | +$940 |
| C3 Cross Products | **$0** | $9,561 | **-$9,561** |
| C4 Regulatory | $9,150 | $7,500 | +$1,650 |
| **Total** | **$49,180** | **$46,291** | **+$2,889** |

### Anchor Entity Detail (Valentina BCL-5012)
- Platform: C1=$210 C2=$80 **C3=$0** C4=$100 Total=$390
- GT: C1=$80 C2=$80 **C3=$36** C4=$100 Total=$296
- C3 details: `appliedTo: "cross_products_sold"`, `baseAmount: 0` — field not resolved
- committed_data has: `Cantidad_Productos_Cruzados: 2`

### Convergence Binding Evidence
- All bindings reference `source_batch_id: "d3c63265..."` (October import)
- November committed_data has `import_batch_id: "fc33db5a..."`
- `entityColsByBatch.get("fc33db5a...")` → undefined → all rows skipped

## Fix

### File: `web/src/app/api/calculation/run/route.ts`

**Change 1 (dataByBatch indexing):** Index ALL committed_data rows using any known entity column from convergence bindings, not just rows whose `import_batch_id` matches the `source_batch_id`. The entity column name (`ID_Empleado`) is the same across batches.

**Change 2 (resolveColumnFromBatch):** If the binding's `source_batch_id` doesn't have data (different period), search ALL cached batches for the entity's data. The column names are the same — only the batch_id differs.

## POST-MERGE: Re-calculate November
1. Login as Patricia → /operate/calculate → November 2025 → Calculate
2. Expected: $46,291 exactly
3. October must still be $44,590

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-1 | Component deltas documented | **PASS** |
| PG-2 | Anchor entity comparison | **PASS** |
| PG-3 | Root cause evidenced | **PASS** — batch mismatch in convergence path |
| PG-4 | Fix targets diagnosed cause | **PASS** — index all batches, search all batches |
| PG-5 | Re-calculation: $46,291 | **PENDING** — requires browser (middleware blocks scripts) |
| PG-6 | October regression: $44,590 | **PENDING** — verify post-merge |
| PG-7 | npm run build exits 0 | **PASS** |
