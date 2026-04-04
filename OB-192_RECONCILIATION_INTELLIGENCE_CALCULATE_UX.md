# OB-192: Reconciliation Intelligence + Calculate UX + Population Insight

## CONTEXT — VERTICAL SLICE

The engine is $529.68 from GT ($73,672.40 vs $73,142.72). Convergence and variant discrimination are working. The $529.68 gap is entirely explained by 7 entities assigned to Plan 1 that don't belong (DMs/RVPs — Plan 4 only entities). For the 24 correct entities, the engine matches GT exactly (Tyler Morrison $10,971.62 = GT, Aisha Patel $3,890.88 = GT, Kevin O'Brien $3,851.66 = GT).

But the user can't see any of this. Reconciliation shows Benchmark: $0 for every entity. 0% match rate. All red flags. The reconciliation header fix from OB-190 didn't execute — DIAG logs prove rows still have `__EMPTY` keys. The reconciliation is doing good work under the hood (entity matching, period filtering, population mismatch detection) but presenting broken results because the column mapping points to the title text instead of the Commission column.

This OB fixes the reconciliation parsing (so the user sees real numbers), enriches the population mismatch findings (so the user understands WHY 8 entities don't match), and cleans up the Calculate page (so the user isn't confused by duplicate selectors and wrong period order).

**Every phase improves what the user sees. No engine-only work without UX. No UX without correct data.**

## CC_STANDING_ARCHITECTURE_RULES
All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Key rules:

- **Vertical Slice Rule:** Engine and experience ALWAYS evolve together.
- **Rule 51v2:** `rm -rf .next` → `git stash` → `npx tsc --noEmit` → `npx next lint` → `git stash pop`.
- **Rule 55:** Orphan Prevention — remove old functions/imports/state after refactoring.
- **Korean Test (AP-25):** ALL field identification uses STRUCTURAL heuristics.
- **EFG:** Five Elements (Value/Context/Comparison/Action/Impact) must be present on every UI surface.
- **Thermostat Principle:** Act on data, don't just display it.

## ARCHITECTURE DECISION GATE

Before writing any code, CC MUST:

1. **Trace the `__EMPTY` detection code path:**
   ```bash
   grep -n "__EMPTY\|sheet_to_json\|reparsed\|headerRow" web/src/app/operate/reconciliation/page.tsx | head -30
   ```
   Paste output. Identify: (a) where `__EMPTY` detection runs, (b) what variable the re-parsed rows are assigned to, (c) whether that variable is used downstream when sending data to `/api/reconciliation/analyze` and `/api/reconciliation/compare`.

2. **Trace what variable carries file rows to the AI analysis call:**
   ```bash
   grep -n "analyze\|fileRows\|parsedRows\|setFile\|uploadedFile\|sheetData" web/src/app/operate/reconciliation/page.tsx | head -30
   ```
   Paste output. Identify the exact variable name that holds the parsed XLSX rows and follows them to the API call.

3. **Check period sort order:**
   ```bash
   grep -n "periods\|sort\|order\|default\|select.*period" web/src/contexts/operate-context.tsx | head -20
   ```
   Paste output. Identify how periods are sorted and which one is selected by default.

4. **Check header bar rendering on Calculate:**
   ```bash
   grep -n "selectedPlanId\|PLAN\|RUN\|header" web/src/app/operate/calculate/page.tsx | head -20
   ```
   AND:
   ```bash
   grep -rn "PLAN.*dropdown\|plan.*selector\|selectedPlan" web/src/components/layout/ web/src/components/operate/ 2>/dev/null | head -15
   ```
   Paste output. Identify whether the header PLAN/RUN dropdowns come from the page or from a shared layout component.

5. **Check population mismatch finding generation:**
   ```bash
   grep -n "population\|vl_only\|file_only\|mismatch" web/src/lib/reconciliation/comparison-engine.ts | head -20
   ```
   Paste output. Identify where findings are generated and what data is available (entity name, role, etc.).

**CC must paste ALL FIVE diagnostic results before writing any code.**

---

## PHASE 1: RECONCILIATION HEADER DETECTION FIX (CRITICAL)

### Root Cause

OB-190 added `__EMPTY` detection code to `reconciliation/page.tsx`. DIAG logs from production prove it does NOT execute — rows still have `__EMPTY` keys, `totalAmountField` is still the title text, benchmark values are still $0.

The most likely cause: the re-parsed rows are assigned to a local variable inside the `if` block but the outer variable (which gets sent to the API) is never updated. This is a JavaScript scoping issue.

### Fix

After the Architecture Decision Gate reveals the exact variable flow, CC must ensure:

1. The `__EMPTY` detection code runs on the parsed rows BEFORE any API call
2. The re-parsed rows (with correct headers from the detected header row) REPLACE the original rows in the variable that gets sent to:
   - The AI analysis endpoint (`/api/reconciliation/analyze`) — this determines `entityIdField`, `totalAmountField`, column mappings
   - The compare endpoint (`/api/reconciliation/compare`) — this sends `fileRows` to the comparison engine
3. Add `console.log` for production debugging:
   ```typescript
   console.log(`[Reconciliation] Header detection: ${emptyKeyCount} __EMPTY keys found. Re-parsing from row ${headerRowIndex + 1}`);
   console.log(`[Reconciliation] New keys: ${Object.keys(reparsedRows[0] || {}).join(', ')}`);
   ```

### Verification

After this fix, the DIAG logs should show:
```
[Reconciliation][DIAG] filteredRows[0] keys: ["Entity ID","Name","Role","District","Period","Equipment Revenue","Slope (m)","Intercept (b)","Commission (y=mx+b)"]
[Reconciliation][DIAG] totalAmountField: "Commission (y=mx+b)"
[Reconciliation][DIAG] First row raw value: 10971.62 type: number
```

And the reconciliation results should show non-zero benchmark values matching the GT file.

---

## PHASE 2: RECONCILIATION PREVIEW INTELLIGENCE

### Current Problems

1. Shows "100 rows · 1 columns" — should show actual column count after header detection
2. Confirm Mappings shows broken `__EMPTY` keys and title text — fixed by Phase 1
3. No sample values shown to help user verify mappings
4. No explanation of what the mappings mean or why they matter
5. Period mapping shows "__EMPTY_3" — no human-readable context

### Enhancements (after Phase 1 fixes the column names)

**2A: Sample values in Confirm Mappings**

For each confirmed mapping (Employee ID, Total Payout, Period), show the first row's value as a preview:

```
Employee ID:  Entity ID         (e.g., "CRP-6007")
Total Payout: Commission (y=mx+b)  (e.g., "$10,971.62")
Period:       Period             (e.g., "Jan 1-15 2026")
```

This lets the user verify at a glance: "Yes, CRP-6007 is an entity ID. Yes, $10,971.62 is a payout. Yes, Jan 1-15 2026 is a period." The sample value is the first data row's value for that column.

Implementation: after the AI analysis returns the mappings, read the first data row and extract the value for each mapped column. Display it next to the column name in the Confirm Mappings section.

**2B: Column count accuracy**

After header re-detection, update the file summary to show actual column count:
```
CRP_Resultados_Esperados.xlsx · 96 rows · 9 columns
```

Not "1 columns" — count the non-`__EMPTY` keys (or after re-parse, count all keys).

**2C: Comparison preview summary**

Below the Confirm Mappings, show a preview of what the reconciliation will compare:
```
Ready to compare: 23 entities matched · Period: January 1-15, 2026
VL total: $73,672.40 · Benchmark total: $73,142.72 (estimated from mapped column)
```

This gives the user a preview of the outcome before running — the Thermostat Principle. They can see immediately whether the totals are in the right ballpark.

---

## PHASE 3: RECONCILIATION RESULTS INTELLIGENCE

### Current Problems

1. All benchmarks $0 — fixed by Phase 1
2. Population mismatches show entity IDs only, no names or roles
3. "9 population mismatch(es)" is a count, not an explanation
4. No guidance on what to do about mismatches
5. VL-ONLY panel shows bare IDs: "CRP-6001, CRP-6002..." — meaningless

### Enhancements

**3A: Population mismatch enrichment**

For VL-only entities, include entity name and role from VL data. The comparison engine already has access to `vlResult.entityName`. Extend to include role from `entityMap` metadata:

Current finding:
```
WARNING: 9 population mismatch(es)
8 entities in VL only, 1 in benchmark only. These cannot be compared.
```

Enhanced finding:
```
WARNING: 9 population mismatch(es)

VL-Only (8 entities — in calculation but not in benchmark file):
  • CRP-6001 Marcus Chen (Regional VP)
  • CRP-6002 Diana Reeves (Regional VP)
  • CRP-6003 James Whitfield (District Manager)
  • CRP-6004 Sarah Okonkwo (District Manager)
  • CRP-6005 Robert Vasquez (District Manager)
  • CRP-6006 Elena Marchetti (District Manager)
  • CRP-6031 [Name] ([Role])
  • CRP-6030 [Name] ([Role])

  These entities are assigned to this plan but do not appear in the benchmark file.
  Their roles (Regional VP, District Manager) do not match the plan's variants (Senior Rep, Rep).
  Combined VL payout for these entities: $1,050.00
  Impact: Removing these entities would reduce the VL total from $73,672.40 to $72,622.40

File-Only (1 entity — in benchmark but not in VL calculation):
  • CRP-6030 — appears in benchmark file but has no VL calculation result.
  Action: Verify this entity is imported and assigned to this plan.
```

**Implementation:** The comparison engine's `buildFindings` function generates population findings. It has access to `employees` array which includes `entityName` for matched and VL-only entities. Extend the finding to include per-entity detail. For role, pass entity metadata through the comparison — the compare route fetches VL results which include `entityName` from the `entityMap`. Add `entityRole` from `entityMap.metadata.role`.

**3B: VL-ONLY and FILE-ONLY panels**

The bottom panels currently show bare entity IDs. Enhance to show Name and Role:

```
VL-ONLY (8)
CRP-6001  Marcus Chen       Regional VP
CRP-6002  Diana Reeves      Regional VP
CRP-6003  James Whitfield   District Manager
...
```

**3C: Match summary with population impact**

In the Executive Summary, add a line showing the impact of population mismatches:

```
VL ENGINE    BENCHMARK    DELTA
$73,672.40   $73,142.72   $529.68

Comparable entities (23): VL $72,622.40 vs Benchmark $73,142.72 (Δ -$520.32)
Population mismatches (8 VL-only): contribute $1,050.00 to VL total
```

This separates the "engine accuracy" question from the "entity assignment" question.

---

## PHASE 4: CALCULATE PAGE UX

### Current Problems

1. Period defaults to Jan 16-31 instead of Jan 1-15 (wrong sort order)
2. Header bar shows PLAN dropdown ("District Override Plan") that contradicts body
3. Two period selectors (header + body)
4. Plan card shows stale previous result ($84,993.02) alongside new result

### Fixes

**4A: Period sort order**

In `operate-context.tsx` or wherever periods are loaded and sorted, ensure chronological ascending order (earliest first). The default selection should be the FIRST period chronologically, not the last.

**4B: Header bar on Calculate page**

The header bar showing PLAN and RUN dropdowns comes from a shared layout component. On the Calculate page specifically, suppress or hide the PLAN and RUN selectors. The period in the header should sync with the body's period selector — or better, remove the header period selector on Calculate and let the body selector be the sole control.

Implementation: check if the header bar uses a route-aware conditional. If the current route is `/operate/calculate`, render only the period context (read-only label, not a dropdown) and hide PLAN/RUN.

**4C: Plan card state freshness**

After recalculation, the plan card should show ONLY the most recent result. If the card displays "Last: 3/26/2026 $84,993.02" that's a stale result from a prior run. The card should update immediately to show the new total from the just-completed calculation. Check whether the card reads from `calculation_results` (which was overwritten) or from a cached/session value.

---

## DO NOT

- Do NOT hardcode CRP field names, entity IDs, or role values in any code
- Do NOT modify convergence-service.ts — convergence is working correctly now
- Do NOT modify the calculation engine (run-calculation.ts) — the engine is producing correct results
- Do NOT skip the Architecture Decision Gate
- Do NOT create separate PRs — one PR for the entire vertical slice
- Do NOT ignore the EFG Five Elements check — every UI surface must have Value/Context/Comparison/Action/Impact

## PROOF GATES

| # | Gate | PASS Criteria |
|---|------|---------------|
| 1 | Architecture Decision Gate | All 5 diagnostics pasted with results |
| 2 | `__EMPTY` header fix works | `git show HEAD:...reconciliation/page.tsx` shows re-parsed rows assigned to the SAME variable sent to API calls. Add console.log proving execution. |
| 3 | Confirm Mappings shows sample values | `git show HEAD:...reconciliation/page.tsx \| grep "sample\|preview\|firstRow"` shows sample value display |
| 4 | Population findings include names/roles | `git show HEAD:...comparison-engine.ts \| grep "entityRole\|role\|population.*name"` shows enriched findings |
| 5 | Period sort chronological ascending | `git show HEAD:...operate-context.tsx \| grep "sort\|order"` shows ascending sort |
| 6 | Header PLAN/RUN suppressed on Calculate | Evidence that PLAN/RUN are hidden on `/operate/calculate` route |
| 7 | Rule 51v2 PASS | tsc 0 errors + lint 0 errors AFTER git stash |
| 8 | No orphaned code | npx next lint 0 errors |
| 9 | PR created | `gh pr create --base main --head dev` |

## BUILD VERIFICATION

```bash
cd /home/project/spm-platform
git add -A
git commit -m "OB-192: Reconciliation intelligence — header fix, sample values, population enrichment, Calculate UX"
git push origin dev

# Rule 51v2
cd web
rm -rf .next
git stash
npx tsc --noEmit 2>&1 | tail -5
echo "TSC EXIT: $?"
npx next lint 2>&1 | tail -5
echo "LINT EXIT: $?"
git stash pop
```

## COMPLETION REPORT TEMPLATE

```
# OB-192 COMPLETION REPORT

## ARCHITECTURE DECISION GATE
### __EMPTY detection code path:
[paste grep output — identify variable flow]

### File rows variable to API:
[paste grep output — identify which variable carries rows]

### Period sort order:
[paste grep output]

### Header bar rendering:
[paste grep output — identify shared layout component]

### Population mismatch finding:
[paste grep output]

## COMMITS
[paste git log --oneline -2]

## PHASE 1: HEADER DETECTION FIX
### Root cause found:
[describe why OB-190 code didn't execute]
### Fix:
[describe variable flow fix]
### console.log evidence:
[paste git show HEAD: grep output showing logging]

## PHASE 2: PREVIEW INTELLIGENCE
### Sample values in Confirm Mappings:
[paste evidence]
### Column count accuracy:
[paste evidence]
### Comparison preview summary:
[paste evidence]

## PHASE 3: RESULTS INTELLIGENCE
### Population mismatch enrichment:
[paste evidence — names, roles, impact calculation]
### VL-ONLY/FILE-ONLY panels enhanced:
[paste evidence]

## PHASE 4: CALCULATE UX
### Period sort:
[paste evidence]
### Header suppression:
[paste evidence]
### Plan card freshness:
[paste evidence]

## BUILD VERIFICATION
[paste Rule 51v2 output]

## PR
[paste PR URL]

## PROOF GATES
[PASS/FAIL for each gate with evidence]
```

## FINAL STEP
```bash
gh pr create --base main --head dev --title "OB-192: Reconciliation intelligence + Calculate UX — header fix, sample values, population enrichment, period sort" --body "Phase 1: Fix __EMPTY header detection variable scoping. Phase 2: Sample values in Confirm Mappings, column count, comparison preview. Phase 3: Population mismatch findings with names/roles/impact. Phase 4: Period chronological sort, header PLAN/RUN suppression on Calculate, plan card freshness."
```
