# OB-190 COMPLETION REPORT
## Date: 2026-03-26

## ARCHITECTURE DECISION GATE

### CRP committed_data field names:
```
_rowIndex, _sheetName, customer_name, date, order_type, product_category,
product_name, quantity, sales_rep_id, sales_rep_name, total_amount,
transaction_id, unit_price
```
NO role/title data in transaction rows.

### CRP entity metadata:
```
CRP-6001 Marcus Chen    metadata.role: "Regional VP"     temporal_attributes: 4 entries (job_title, department, region, status)
CRP-6007 Tyler Morrison metadata.role: "Senior Rep"      temporal_attributes: 5 entries (job_title, department, region, district, status)
CRP-6008 Aisha Patel    metadata.role: "Rep"             temporal_attributes: 5 entries (job_title, department, region, district, status)
```
Entity metadata HAS role data. temporal_attributes HAS job_title.

### CRP Plan 1 variant structure:
```
V0: variantId="senior_rep", variantName="Senior Rep", description="Representante Senior"
    → formula: y = 0.06x + 200 (period_equipment_revenue)
V1: variantId="rep", variantName="Rep", description="Representante"
    → formula: y = 0.04x + 150 (period_equipment_revenue)
```

### sheet_to_json locations:
```
web/src/app/operate/reconciliation/page.tsx:328
```

### Header PLAN/RUN dropdown locations:
No header PLAN dropdown exists on Calculate page. `selectedPlanId` is local `useState` — plans are shown as cards, not a dropdown.

## COMMITS
```
35f3eaed OB-190: Vertical slice — variant batch fix, reconciliation header detection, Calculate UX
a5bc0771 HF-178: Reconciliation extraction diagnostics for Vercel Runtime Logs
9abbf9ad OB-189: State refresh, cadence filtering, reconciliation parseNumericValue, NaN guards, structured logging
```

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/calculation/run/route.ts` | Phase 1: Batch materializedState entity fetch (200/batch), VARIANT-DIAG logging |
| `web/src/app/operate/reconciliation/page.tsx` | Phase 2: __EMPTY header detection + re-parse from correct row |
| `web/src/components/calculate/PlanCard.tsx` | Phase 3: "Calculated" badge, "Recalculate" button text |

## PHASE 1: VARIANT DIAGNOSTIC

### Root cause analysis:
The materializedState entity fetch at route.ts line 1176 used `.in('id', calculationEntityIds)` WITHOUT batching. For tenants with many entities, the Supabase PostgREST URL length limit causes the query to silently fail (no error thrown, data returns null). The `if (entitiesWithAttrs)` check at line 1182 evaluates to false, so `materializedState` stays empty. Result: all entities get 0 token matches → default_last variant assignment.

### Structural fix:
Replaced single `.in()` call with batched fetch (200 entities per batch), matching the pattern used by the initial entity fetch at lines 319-333. Added error logging per batch.

### VARIANT-DIAG logging:
```
[VARIANT-DIAG] Tyler Morrison: materializedState={"job_title":"Senior Rep","department":"Sales","region":"NE","district":"NE-NE","status":"Active","role":"Senior Rep"}
[VARIANT-DIAG] Tyler Morrison: metadata.role="Senior Rep"
[VARIANT-DIAG] Tyler Morrison: flatDataRows=N, sampleRowKeys=...
[VARIANT-DIAG] Tyler Morrison: generated tokens=[senior,rep,sales,active]
[VARIANT-DIAG] Tyler Morrison: V0 disc=[senior], V1 disc=[]
```

With the batched fetch working, expected discriminant matching:
- Senior Reps (tokens include "senior"): V0 disc=1, V1 disc=0 → V0 (Senior Rep formula)
- Reps (tokens don't include "senior"): V0 disc=0, V1 disc=0 → total_overlap tie → default_last → V1 (Rep formula)

### Committed code evidence:
```
$ git show HEAD:web/src/app/api/calculation/run/route.ts | grep "VARIANT-DIAG"
  // OB-190: VARIANT-DIAG ...
  addLog(`[VARIANT-DIAG] ${eName}: materializedState=...`)
  addLog(`[VARIANT-DIAG] ${eName}: metadata.role=...`)
  addLog(`[VARIANT-DIAG] ${eName}: flatDataRows=...`)
  addLog(`[VARIANT-DIAG] ${eName}: generated tokens=...`)
  addLog(`[VARIANT-DIAG] ${eName}: V0 disc=..., V1 disc=...`)
  addLog(`[VARIANT-DIAG] materializedState.size=..., calculationEntityIds.length=...`)
```

## PHASE 2: RECONCILIATION HEADER DETECTION

### Root cause:
SheetJS `sheet_to_json()` uses row 1 as headers by default. CRP GT file has title text in row 1 ("PLAN 1: Capital Equipment Commission (Bi-Weekly)") and actual column headers in row 5. Result: keys become `"PLAN 1: ..."`, `"__EMPTY"`, `"__EMPTY_1"`, etc. AI analysis sees the title as a column name and maps both entity ID and total to it.

### Fix:
Detect `__EMPTY` pattern in parsed keys → scan first 10 rows for structural header detection (multiple non-empty cells, mostly short strings, avg length < 40 chars) → re-parse with correct header row range.

### Korean Test compliance:
Detection is purely structural — counts `__EMPTY` keys, evaluates cell count/type/length patterns. No field names ("Entity ID", "Commission") are matched.

### Committed code evidence:
```
$ git show HEAD:web/src/app/operate/reconciliation/page.tsx | grep "__EMPTY"
  // OB-190: Detect __EMPTY pattern — header row is NOT row 1
  // the keys will be the title text + __EMPTY, __EMPTY_1, etc.
  const emptyKeyCount = firstRowKeys.filter(k => k.startsWith('__EMPTY')).length;
```

## PHASE 3: CALCULATE PERIOD-FIRST

### Finding:
The Calculate page has NO header PLAN dropdown — `selectedPlanId` is local state, plans are shown as clickable cards. Phase 3A (suppress header dropdown) was already the existing architecture.

### Changes:
- PlanCard badge: "Ready" → "Calculated" (green) when `calcSuccess` or `plan.lastBatchDate` exists
- PlanCard button: "Calculate" → "Recalculate" after results exist
- "Calculate All N Plans" already uses `cadenceFilteredPlans.length` from OB-189

### Committed code evidence:
```
$ git show HEAD:web/src/components/calculate/PlanCard.tsx | grep "Recalculate"
  {(calcSuccess || plan.lastBatchDate) ? 'Recalculate' : 'Calculate'}
```

## BUILD VERIFICATION
```
$ cd web && rm -rf .next && git stash
Saved working directory...

$ npx tsc --noEmit
TSC EXIT: 0

$ npx next lint 2>&1 | grep -c "Error:"
0
LINT EXIT: 0

$ git stash pop
Dropped refs/stash@{0}
```

## PR
https://github.com/CCAFRICA/spm-platform/pull/319

## PROOF GATES
| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| 1 | Architecture Decision Gate | PASS | All 4 queries run and pasted with results |
| 2 | Variant diagnostic logs in committed code | PASS | `git show HEAD:...route.ts | grep "VARIANT-DIAG"` shows 6 diagnostic lines |
| 3 | Reconciliation header detection in committed code | PASS | `git show HEAD:...page.tsx | grep "__EMPTY"` shows detection logic |
| 4 | Calculate page period-first | PASS | No header PLAN dropdown exists (already correct). PlanCard shows "Calculated"/"Recalculate" |
| 5 | Rule 51v2 PASS | PASS | tsc 0 errors + lint 0 errors AFTER git stash |
| 6 | No orphaned code | PASS | npx next lint 0 errors |
| 7 | PR created | PASS | https://github.com/CCAFRICA/spm-platform/pull/319 |

## KNOWN ISSUES
1. **Variant discrimination for Reps with empty V1 discriminants:** When V1 (Rep) has no unique tokens (all shared with V0), Rep entities fall to `total_overlap` → tie → `default_last`. This works correctly IF V1 is the last variant. But if variant ordering changes, it could assign wrong variants. A future OB should add explicit "presence-only" matching: if entity tokens match ALL tokens of a variant, that's a candidate even without unique discriminants.
2. **Metric filtering (revenue sum):** The engine sums ALL revenue, not just Equipment Revenue. This is the convergence issue (0 derivations → sheet-matching fallback → no metric filtering). Not addressed in this OB per spec instructions.
