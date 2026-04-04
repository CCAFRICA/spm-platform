# HF-172: Metric Derivation Filter Application + Source Pattern De-Gating

## MANDATORY — READ FIRST
Include CC_STANDING_ARCHITECTURE_RULES.md at the top of your working context.

## Classification
- **Type:** HF (Hot Fix)
- **Priority:** P0
- **Addresses:** CLT-187 F05, F06; Root cause of CRP Plans 1-3 incorrect calculation results
- **Scope:** `applyMetricDerivations()` function in the calc engine
- **Does NOT touch:** Convergence AI, convergence-service.ts, plan interpretation, import pipeline, auth, UI

---

## PROBLEM STATEMENT

The CRP tenant has 4 plans. Plans 1-3 produce incorrect calculation results. The engine applies the correct **formula** to the **wrong input values**. Two root causes have been forensically confirmed:

### Root Cause 1: Filters Not Applied for `sum` Operations

The `applyMetricDerivations()` function correctly applies `filters` for `count` operations but **does NOT apply filters for `sum` or `delta` operations**. The `MetricDerivationRule` interface defines a `filters` array. The `count` branch evaluates `rule.filters.every(...)` before incrementing. The `sum` branch ignores `rule.filters` entirely — it sums `source_field` across ALL matching rows regardless of filter conditions.

**Consequence:** Plan 1 (Capital Equipment) has a binding that specifies `source_field: "total_amount"` with `filters: [{field: "product_category", value: "Capital Equipment", operator: "eq"}]`. Because the filter is not applied during `sum`, the engine sums `total_amount` from ALL rows (Capital Equipment + Consumables + Cross-Sell transactions). Plan 2 (Consumables) has the same problem — it sums the same unfiltered total.

**Evidence:** Tyler Morrison's engine output for Plan 1 = $12,352.52. Reverse-engineering: `(12,352.52 - 200) / 0.06 = 202,542`. His file 02 rows (all categories) sum to exactly $202,542 in `total_amount`. His Capital Equipment rows alone sum to $179,527. The engine used the unfiltered sum.

### Root Cause 2: `source_pattern` Used as Row Filter

The `applyMetricDerivations()` function groups entity rows by `data_type` (which is the import batch pattern). It then uses `source_pattern` from the derivation rule as a regex to match sheet/data_type names. Only rows whose `data_type` matches the regex are included.

The `source_pattern` in the binding is set at convergence time from the **first import batch** that triggered convergence. When a second data file is imported (different import batch = different `data_type`), its rows are fetched by the `source_date` query but excluded during metric aggregation because their `data_type` doesn't match the original `source_pattern`.

**Consequence:** CRP has two data files imported:
- File 02: `data_type = "0_34537277_02_crp_sales_20260101_2026__02_crp_sales_20260101_20260115"` (Jan 1-15)
- File 03: `data_type = "0_f8db4f36_03_crp_sales_20260116_2026__03_crp_sales_20260116_20260131"` (Jan 16-31)

All bindings have `source_pattern` referencing file 02's pattern. The engine fetches all 389 rows (both files) via `source_date`, but `applyMetricDerivations()` only aggregates the ~182 rows from file 02. File 03's 207 rows are silently excluded.

---

## REQUIRED CHANGES

### Change 1: Apply Filters to `sum` and `delta` Operations

**File:** The file containing `applyMetricDerivations()` — locate by searching for `export function applyMetricDerivations`.

**What to change:** In the `sum` branch, before summing `source_field`, apply the same filter logic that already exists in the `count` branch. Same for the `delta` branch (both current period and prior period loops).

**The filter logic already exists in the `count` branch.** Copy the same pattern:

```typescript
// CURRENT (count branch) — this is CORRECT:
const allMatch = rule.filters.every(filter => {
  const fieldValue = rd[filter.field];
  switch (filter.operator) {
    case 'eq':       return fieldValue === filter.value;
    case 'neq':      return fieldValue !== filter.value;
    case 'gt':       return typeof fieldValue === 'number' && fieldValue > (filter.value as number);
    case 'gte':      return typeof fieldValue === 'number' && fieldValue >= (filter.value as number);
    case 'lt':       return typeof fieldValue === 'number' && fieldValue < (filter.value as number);
    case 'lte':      return typeof fieldValue === 'number' && fieldValue <= (filter.value as number);
    case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(filter.value));
    default:         return false;
  }
});
if (allMatch) count++;
```

**Apply the same pattern to `sum`:**

The `sum` branch currently reads:
```typescript
if (rule.operation === 'sum' && rule.source_field) {
  let total = 0;
  for (const row of matchingRows) {
    const rd = ...;
    const val = rd[rule.source_field];
    if (typeof val === 'number') total += val;
  }
  derived[rule.metric] = total;
}
```

It must become:
```typescript
if (rule.operation === 'sum' && rule.source_field) {
  let total = 0;
  for (const row of matchingRows) {
    const rd = ...;
    // Apply filters (same logic as count branch)
    if (rule.filters && rule.filters.length > 0) {
      const allMatch = rule.filters.every(filter => {
        const fieldValue = rd[filter.field];
        switch (filter.operator) {
          case 'eq':       return fieldValue === filter.value;
          case 'neq':      return fieldValue !== filter.value;
          case 'gt':       return typeof fieldValue === 'number' && fieldValue > (filter.value as number);
          case 'gte':      return typeof fieldValue === 'number' && fieldValue >= (filter.value as number);
          case 'lt':       return typeof fieldValue === 'number' && fieldValue < (filter.value as number);
          case 'lte':      return typeof fieldValue === 'number' && fieldValue <= (filter.value as number);
          case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(filter.value));
          default:         return false;
        }
      });
      if (!allMatch) continue;
    }
    const val = rd[rule.source_field];
    if (typeof val === 'number') total += val;
  }
  derived[rule.metric] = total;
}
```

**Do the same for the `delta` branch** — both the current-period loop and the prior-period loop must apply filters.

**REFACTORING RECOMMENDATION:** Extract the filter-check logic into a private helper function (e.g., `rowMatchesFilters(rd, filters)`) to avoid duplicating the switch statement across `count`, `sum`, and `delta` branches. The helper returns `boolean`. All three branches call it. This is cleaner than three copies.

### Change 2: Remove `source_pattern` as Row Filter

**Same file, same function: `applyMetricDerivations()`.**

The current code uses `source_pattern` as a regex to match sheet/data_type names:

```typescript
const sourceRegex = new RegExp(rule.source_pattern, 'i');
for (const [sheetName, rows] of Array.from(entitySheetData.entries())) {
  if (sourceRegex.test(sheetName)) {
    matchingRows = matchingRows.concat(rows);
  }
}
```

This must be changed so that ALL sheets/data_types for the entity are included, not just those matching the original import batch pattern.

**Change to:**
```typescript
// Source pattern is provenance metadata, NOT a row filter.
// All entity rows within the period's date range are candidates.
// Content filtering is done by the filters array, not source_pattern.
let matchingRows: Array<{ row_data: Json }> = [];
for (const [, rows] of Array.from(entitySheetData.entries())) {
  matchingRows = matchingRows.concat(rows);
}
```

**IMPORTANT:** Do NOT delete the `source_pattern` field from `MetricDerivationRule`. It remains as provenance metadata — it records which import batch produced the binding. It just should not be used to filter rows during aggregation. Other code that WRITES `source_pattern` (in convergence-service.ts) is not in scope for this HF.

---

## SCOPE BOUNDARY — DO NOT CHANGE

- **Do NOT modify** convergence-service.ts or any convergence code
- **Do NOT modify** the `convergence_bindings` path (the HF-108 primary path)
- **Do NOT modify** plan interpretation, import pipeline, or SCI agents
- **Do NOT modify** the `MetricDerivationRule` interface (keep `source_pattern` and `filters` fields)
- **Do NOT modify** how `dataByEntity` is constructed (the grouping by data_type is fine)
- **Do NOT modify** any auth, session, or storage code
- **Do NOT add** any new npm dependencies
- **Do NOT modify** any other files besides the one containing `applyMetricDerivations()`

---

## VERIFICATION

### Pre-verification: Locate the code

1. Find the file containing `applyMetricDerivations()`:
   ```bash
   grep -rn "export function applyMetricDerivations" web/src/
   ```
2. Read the entire function before making changes.
3. Confirm the `sum` branch does NOT currently check `rule.filters`.
4. Confirm the `count` branch DOES currently check `rule.filters`.
5. Confirm the `source_pattern` regex is used to filter `entitySheetData` entries.

### Post-build verification

After making changes:

1. **Build must pass:**
   ```bash
   cd web && rm -rf .next && npm run build
   ```

2. **Grep verification — filter helper exists:**
   ```bash
   grep -n "rowMatchesFilters\|allMatch.*filters\|rule\.filters" web/src/app/api/calculate/route.ts
   ```
   Must show filter checks in BOTH `sum` and `count` branches (and `delta` if applicable).

3. **Grep verification — source_pattern no longer filters rows:**
   ```bash
   grep -n "sourceRegex\|source_pattern" web/src/app/api/calculate/route.ts
   ```
   The regex construction and test should be removed from the row-matching loop. `source_pattern` may still be referenced in logging or type definitions — that's fine.

4. **No new hardcoded field names:**
   ```bash
   grep -n "'product_category'\|'Capital Equipment'\|'Consumables'\|'Cross-Sell'" web/src/app/api/calculate/route.ts
   ```
   Must return 0 results. All field names and values come from the derivation rules. Korean Test.

### Production verification (post-merge)

Andrew will verify in the browser:
1. Navigate to CRP tenant → Calculate page
2. Calculate Plan 1 (Capital Equipment) for January 2026
3. Vercel logs should show Tyler Morrison's value ≈ $13,218.14 (not $12,352.52)
4. Plan 1 total should increase toward GT $182,282.18
5. Plan 2 (Consumables) total should decrease toward GT $28,159.48
6. Plan 3 (Cross-Sell) should remain at $800 (count already applies filters, but cross-sell count may change with file 03 rows included)

### Ground truth targets (full January, Plans 1-3)

| Plan | GT (January) | Current Engine | Expected Direction |
|------|-------------|----------------|--------------------|
| Plan 1 (Capital Equipment) | $182,282.18 | $82,863.40 | ↑ UP (filter excludes CN/XS, but includes file 03 CE rows) |
| Plan 2 (Consumables) | $28,159.48 | $46,365.99 | ↓ DOWN (filter excludes CE/XS revenue) |
| Plan 3 (Cross-Sell) | $2,400.00 | $800.00 | ↑ UP (file 03 XS rows now included) |

**NOTE ON PLAN 1:** Plan 1 is a bi-weekly plan but the engine has only ONE monthly period configured. With the filter fix, the engine will compute `0.06 * CE_total_jan + 200` (single intercept) instead of the GT's `(0.06 * CE_jan1-15 + 200) + (0.06 * CE_jan16-31 + 200)` (two intercepts). This means Plan 1 will be ~$4,000 less than GT even with correct data. This is a PERIOD CONFIGURATION issue (monthly vs bi-weekly), NOT a bug in this HF. It will be addressed separately.

**NOTE ON PLAN 2:** Plan 2 has an unresolved metric gap — `monthly_quota` is a plan parameter not derivable from data (CLT-187 F18). If the engine uses a hardcoded or default quota value, the tier rates will be wrong even with correct revenue. This HF fixes the revenue input; the quota issue is separate.

---

## COMPLETION REPORT REQUIREMENTS

The completion report MUST include:

1. **Code diff** showing filter logic added to `sum` and `delta` branches
2. **Code diff** showing `source_pattern` regex removed from row matching
3. **Grep output** confirming filter checks in all three operation branches
4. **Grep output** confirming no hardcoded field names (Korean Test)
5. **Build output** confirming clean build with no errors
6. **Localhost test** confirming the API endpoint still responds (calculate any plan)

---

## GIT

After all changes are verified:

```bash
cd /Users/andrew/Projects/spm-platform
git add -A
git commit -m "HF-172: Apply metric_derivation filters to sum/delta operations, remove source_pattern row gating

- Extract rowMatchesFilters helper for DRY filter evaluation
- Apply filters to sum branch (was only applied to count)
- Apply filters to delta branch (both current and prior period)
- Remove source_pattern regex as row filter (provenance only)
- All entity rows within period date range now participate in aggregation
- Fixes: CLT-187 F05, F06 — Plans 1-3 calculating on wrong input values"

gh pr create --base main --head dev --title "HF-172: Metric derivation filter + source pattern fix" --body "Applies metric_derivation filters to sum/delta operations (were only applied to count). Removes source_pattern as row gating (treats as provenance metadata). Fixes Plans 1-3 incorrect calculation results caused by unfiltered cross-category aggregation and single-batch row limitation."
```
