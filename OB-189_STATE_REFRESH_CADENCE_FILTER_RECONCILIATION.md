# OB-189: Calculate State Refresh, Cadence Filtering, and Reconciliation Value Extraction

## CC STANDING ARCHITECTURE RULES
Reference: `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — all rules apply. Rules 1-39 active.

---

## PREAMBLE — THE EXPERIENCE GAP

OB-188 delivered intelligent period detection with cadence editing. It works in production. But three gaps break the vertical slice between period creation and reconciliation:

1. **State refresh:** After creating periods, the Calculate page doesn't update. The banner still says "No periods created yet." The period dropdown is empty. The user must manually refresh the browser. This breaks the flow.

2. **Cadence filtering:** After periods exist, all 4 plans show for every period regardless of cadence. A monthly plan appears when a biweekly period is selected. The user can accidentally calculate a monthly plan against a biweekly period.

3. **Reconciliation benchmark values:** The Reconciliation Studio correctly identifies the GT file structure, matches entities, and detects period columns — but every benchmark value is $0.00. The comparison is structurally complete but numerically empty. The user sees 0% match rate and can't determine why.

These three gaps are logically connected: they form the tail end of the vertical slice from period creation through calculation to reconciliation. Fixing them together completes the user journey.

---

## PRIOR CLT FINDINGS ADDRESSED BY THIS OB

| Finding ID | Description | How This OB Addresses |
|---|---|---|
| CLT-188 F06 | Period selector doesn't populate after creation | Phase 1: state refresh |
| CLT-188 F07 | "No periods created yet" banner persists after creation | Phase 1: state refresh |
| CLT-188 F08 | No cadence filtering — all plans shown for all periods | Phase 2: cadence filtering |
| CLT-188 F09 | Reconciliation benchmark values all $0.00 | Phase 3: value extraction fix |
| CLT-188 F10 | No reconciliation runtime logging | Phase 4: logging |
| CLT-188 F11 | NaN% in delta when benchmark is $0 | Phase 3: division guard |
| CLT-R7 F-46 | Plan × Period not user-controllable | Phase 2 completes this |
| CLT-R7 F-49 | Reconciliation core flow gaps | Phase 3 addresses value extraction |
| CLT39 B8 | Comparison Depth without flowing values | Phase 3 addresses root cause |

---

## SCHEMA REFERENCE (VERIFIED)

### periods
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenant_id | uuid | FK |
| period_type | text | 'monthly', 'biweekly', etc. |
| start_date | date | |
| end_date | date | |
| label | text | |
| canonical_key | text | Unique per tenant |

### rule_sets
| Column | Type | Notes |
|--------|------|-------|
| cadence_config | jsonb | `{"period_type": "monthly"}` |

### calculation_results
| Column | Type | Notes |
|--------|------|-------|
| total_payout | numeric | Top-level numeric, NOT inside JSONB |
| entity_id | uuid | FK to entities |
| components | jsonb | Per-component breakdown |

---

## PHASE 1: STATE REFRESH AFTER PERIOD CREATION

**File:** `web/src/app/operate/calculate/page.tsx`

**Problem:** After the detection panel creates periods via the API, the panel shows "Exists" correctly but the rest of the page doesn't update. The period selector, the banner, and the plan cards all read from stale state.

**Fix:** After successful period creation in the detection panel:

1. **Refresh the period list.** The Calculate page likely has a `useEffect` or context that fetches periods on mount. After creation, call this fetch again. If periods come from a context (e.g., `PeriodContext`), call the context's refresh method. If fetched locally, re-run the fetch.

2. **Clear the "no periods" banner.** The banner is conditionally rendered based on period count. After refreshing periods, if `periods.length > 0`, the banner should disappear. Ensure the state variable that controls the banner is updated.

3. **Auto-select the first period.** After refresh, if no period is currently selected, auto-select the first available period so the user can immediately calculate.

**Diagnostic step before fixing:** Read the code to understand how periods are loaded:

```bash
grep -n "periods\|fetchPeriods\|usePeriod\|PeriodContext" web/src/app/operate/calculate/page.tsx | head -30
grep -n "No periods" web/src/app/operate/calculate/page.tsx
```

Trace how the period list is populated and what state controls the "No periods created yet" banner. The fix must update that specific state, not create a parallel mechanism.

---

## PHASE 2: CADENCE FILTERING ON CALCULATE PAGE

**File:** `web/src/app/operate/calculate/page.tsx`

**Problem:** When a period is selected (e.g., biweekly Jan 1-15), all 4 plan cards are shown regardless of whether their cadence matches the period type. The user can click Calculate on "Consumables Commission Plan" (monthly) with a biweekly period selected, which is a cadence mismatch.

**Fix:** Two approaches, implement BOTH:

### 2a. Filter plan cards by period cadence

When a period is selected:
1. Read the selected period's `period_type` (from the periods data)
2. For each plan card, read the plan's `cadence_config.period_type`
3. Show only plans whose cadence matches the selected period's type
4. If a plan has no cadence set (null/undefined), show it for all period types (backward compatibility)

### 2b. Filter period dropdown by selected plan

When a plan is selected from the PLAN dropdown at the top:
1. Read the selected plan's `cadence_config.period_type`
2. Filter the period dropdown to show only periods matching that cadence
3. If the plan has no cadence set, show all periods

**Implementation note:** These are two-way filters. Selecting a period filters plans. Selecting a plan filters periods. Both should work. If implementing both is complex, prioritize 2b (filter periods by plan) since the PLAN dropdown at the top is the primary selection mechanism.

**Data dependency:** Plan cadence comes from `rule_sets.cadence_config`. This was set by OB-188's inline cadence editing. Verify the plan data loaded on the Calculate page includes `cadence_config`. If not, the plan fetch query needs to include this column.

```bash
grep -n "cadence_config\|cadence" web/src/app/operate/calculate/page.tsx | head -20
grep -n "rule_sets\|plans\|fetchPlans" web/src/app/operate/calculate/page.tsx | head -20
```

---

## PHASE 3: RECONCILIATION VALUE EXTRACTION

**File:** `web/src/app/api/reconciliation/compare/route.ts`

**Problem:** The Reconciliation Studio correctly parses the GT file structure, identifies the plan column ("PLAN 1: Capital Equipment Commission (Bi-Weekly)"), matches 23 entities by ID, and detects period columns. But every benchmark value is $0.00. The column mapping is correct but the values aren't being extracted.

**Diagnostic step (MANDATORY before writing any fix):**

```bash
# Find the compare route
find web/src/app/api/reconciliation -name "*.ts" | head -10

# Read the compare route to understand how benchmark values are extracted
cat web/src/app/api/reconciliation/compare/route.ts | head -100
```

**Likely root causes (investigate in order):**

1. **Column index mismatch:** The AI identified the column header but the code is reading values from the wrong column index. The GT file may have merged cells, header rows, or a structure where the data column index doesn't match the header column index.

2. **Type coercion:** The values in the GT file may be stored as strings (e.g., "$4,917.84") and the code expects numbers. Or they may be in a different sheet/section than expected.

3. **Row filtering:** The period filter ("2026" → January 1-15) matched 96 rows but the value extraction may be reading from a different row set. The 4 "Unknown" rows that were excluded may have been the ones with actual values.

4. **Mapping path:** The "Confirm Mappings" section showed Employee ID and Total Payout both mapping to "PLAN 1: Capital Equipment Commission (Bi-Weekly)" — the same column. If both the entity ID and the payout value are expected from the same column, one of them will fail.

**Fix approach:** After diagnosing the root cause:

1. Add console logging at the point where benchmark values are read from the parsed file data
2. Log the raw cell value, the parsed numeric value, and the entity ID for at least the first 5 rows
3. Fix the extraction logic based on what the logs reveal
4. Guard against NaN%: when benchmark is 0 or null, display "N/A" instead of "NaN%"

**DO NOT guess the fix. Read the code. Log the values. Find the exact point where $0.00 appears.**

---

## PHASE 4: RECONCILIATION RUNTIME LOGGING

**Files:** `web/src/app/api/reconciliation/analyze/route.ts`, `web/src/app/api/reconciliation/compare/route.ts`

**Problem:** The Vercel runtime logs show only HTTP 200 responses for the reconciliation API calls. There is no trace of what happened inside — what values were read, what entities were matched, where the $0.00 came from. The calculation engine has detailed `[CalcAPI]` prefixed logging; the reconciliation engine has none.

**Fix:** Add structured logging with `[Reconciliation]` prefix:

### In analyze route:
```
[Reconciliation] Analyzing file: {filename}, {rows} rows, {columns} columns
[Reconciliation] Detected plan column: {columnName} at index {index}
[Reconciliation] Detected entity ID column: {columnName} at index {index}
[Reconciliation] Detected period column: {columnName} at index {index}
[Reconciliation] Period values found: {values}
[Reconciliation] Comparison depth: L1={bool} L2={bool} L3={bool} L4={bool} L5={bool}
```

### In compare route:
```
[Reconciliation] Comparing batch {batchId} ({entityCount} entities, ${total}) against {filename}
[Reconciliation] Period filter: {periodLabel} → {matchedRows} rows (of {totalRows})
[Reconciliation] Entity matching: {matched} matched, {vlOnly} VL-only, {fileOnly} file-only
[Reconciliation] Sample values (first 5):
[Reconciliation]   {entityId}: VL=${vlValue}, Benchmark=${benchmarkValue}, Delta=${delta}
[Reconciliation] Totals: VL=${vlTotal}, Benchmark=${benchmarkTotal}, Delta=${deltaTotal}
[Reconciliation] Match rate: {matchRate}%
```

This logging level matches the calculation engine's `[CalcAPI]` logging and enables forensic diagnosis from Vercel runtime logs.

---

## ANTI-PATTERNS TO AVOID

| Anti-Pattern | Rule | What To Do Instead |
|---|---|---|
| Add a manual "Refresh" button instead of auto-refreshing state | IAP — Acceleration | State refreshes automatically after period creation |
| Guess the reconciliation fix without reading the code | Diagnostic-first | Read the compare route, log values, find the exact point of failure |
| Leave old banner/state logic after adding refresh | FP-114 Orphan Prevention | Remove or update all state paths |
| Filter plans client-side without the cadence data | Code Path Trace | Verify the plan fetch includes cadence_config before filtering |

---

## PROOF GATES — HARD

| # | Criterion | How to Verify |
|---|-----------|---------------|
| 1 | After creating periods, the period dropdown populates WITHOUT page refresh | Create periods via detection panel → verify dropdown shows periods immediately |
| 2 | After creating periods, "No periods created yet" banner disappears WITHOUT page refresh | Same flow — banner should vanish |
| 3 | Selecting a biweekly period shows only biweekly-cadence plans | Select Jan 1-15 → only Capital Equipment visible |
| 4 | Selecting a monthly period shows only monthly-cadence plans | Select January 2026 → Consumables, Cross-Sell, District Override visible |
| 5 | Selecting a plan with no cadence shows all periods | Test with a plan that has null cadence_config |
| 6 | Reconciliation benchmark values are NOT $0.00 — actual GT values extracted | Upload CRP_Resultados_Esperados.xlsx, run reconciliation, verify non-zero benchmark values |
| 7 | NaN% not displayed — shows "N/A" or meaningful value when benchmark is 0 | Verify delta display for entities with $0 benchmark |
| 8 | Reconciliation runtime logs visible in Vercel | Check Vercel logs after reconciliation run — `[Reconciliation]` prefix entries must appear |
| 9 | No orphaned/unused code | `npx next lint` 0 errors on all modified files |

## PROOF GATES — SOFT

| # | Criterion |
|---|-----------|
| 1 | Auto-select first period after creation |
| 2 | Plan cards show entity count from calculation results (not always "0 entities") |
| 3 | "Calculate All N Plans" button respects cadence filter (only calculates matching plans) |

---

## BUILD VERIFICATION GATE — Rule 51v2

```bash
cd web
rm -rf .next
git stash
npx tsc --noEmit
echo "tsc exit code: $?"
npx next lint 2>&1 | grep -c "Error:"
echo "lint error count: (must be 0)"
git stash pop
```

Both must pass on committed code. Paste COMPLETE terminal output.

Verify committed code:
```bash
git show HEAD:web/src/app/operate/calculate/page.tsx | grep -c "refreshPeriods\|fetchPeriods"
git show HEAD:web/src/app/api/reconciliation/compare/route.ts | grep -c "Reconciliation"
```

---

## COMPLETION REPORT STRUCTURE

```markdown
# OB-189 COMPLETION REPORT
## Date: [DATE]

## COMMITS
| Hash | Phase | Description |

## FILES MODIFIED
| File | Change |

## RECONCILIATION DIAGNOSTIC
### What the code does with benchmark values:
[Describe the actual code path for value extraction — WHERE does $0.00 come from?]

### Root cause:
[Exact description of why values were $0.00]

### Fix:
[What was changed and why]

## PROOF GATES — HARD
| # | Criterion (VERBATIM) | PASS/FAIL | Evidence |

## BUILD VERIFICATION EVIDENCE
```
[PASTE: git stash, rm -rf .next, npx tsc --noEmit, npx next lint, git stash pop]
[PASTE: git show HEAD: for modified files]
```

## ORPHAN SCAN
[List all modified files + npx next lint result per file]

## FIVE ELEMENTS VERIFICATION
[For the Calculate page post-creation and Reconciliation results]

## KNOWN ISSUES
```

---

## WHAT SUCCESS LOOKS LIKE

1. Admin clicks "Create 3 New Periods" in detection panel
2. Panel closes → period dropdown immediately shows 3 periods → banner disappears → no page refresh
3. Admin selects "January 1-15, 2026" → only Capital Equipment plan card visible
4. Admin switches to "January 2026" → Consumables, Cross-Sell, District Override visible
5. Admin calculates Plan 1 for Jan 1-15 → results appear
6. Admin navigates to Reconciliation → uploads GT file → benchmark values are real numbers ($4,917.84, $12,634.52, etc.)
7. Match rate is meaningful (not 0% from $0.00 benchmarks)
8. Vercel logs show `[Reconciliation]` entries tracing every step

The vertical slice is complete: Create Periods → Calculate → Reconcile — all through the browser, with intelligence at every step.
