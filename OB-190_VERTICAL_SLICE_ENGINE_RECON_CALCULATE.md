# OB-190: CRP Vertical Slice — Engine Convergence + Reconciliation Parsing + Calculate Period-First

## CONTEXT — WHY THIS IS ONE OB

The Vertical Slice Rule (most repeated failure pattern, 152+ OBs) mandates: engine and experience ALWAYS evolve together. Every OB touching pipeline: import → SCI → engine → calculate → rendered result. One PR.

CRP Plan 1 biweekly Jan 1-15 calculates $84,993.02. GT says $73,142.72. Reconciliation shows Benchmark: $0 for all entities. Calculate page shows District Override plan card when biweekly period is selected. These are NOT three independent bugs — they are one broken vertical slice. Fixing any one alone wastes testing cycles on wrong numbers, broken parsing, or confusing UX.

**This OB fixes ALL THREE in one PR so the next browser test produces correct numbers, correct reconciliation, and correct UX.**

## CC_STANDING_ARCHITECTURE_RULES
All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Key rules for this OB:

- **Vertical Slice Rule:** Engine and experience ALWAYS evolve together. NEVER separate OBs.
- **Rule 51v2:** `rm -rf .next` → `git stash` → `npx tsc --noEmit` → `npx next lint` → `git stash pop`. Both 0 errors on COMMITTED code.
- **Rule 51 Amendment:** All verification uses `git show HEAD:filepath | grep`. Never grep working directory.
- **Rule 55:** Orphan Prevention — remove old functions/imports/state after refactoring. `npx next lint --file <modified-file>` after every refactor.
- **Standing Rule 34:** No bypass recommendations. Diagnose and fix structurally.
- **Standing Rule 35:** EPG mandatory for mathematical phases.
- **Korean Test (AP-25):** ALL field identification uses STRUCTURAL heuristics. NEVER field-name matching.

## GROUND TRUTH — THESE ARE THE CORRECT NUMBERS

CRP Plan 1 (Capital Equipment Commission), biweekly Jan 1-15 2026:
- **GT Total: $73,142.72**
- 24 entities with revenue (8 Senior Reps at y=0.06x+200, 16 Reps at y=0.04x+150)
- 7 additional entities (DMs and RVPs) have zero Equipment Revenue for this plan — they should NOT appear in Plan 1 results
- Tyler Morrison (Senior Rep, CRP-6007): revenue=179,527 → 0.06×179,527+200 = $10,971.62
- Aisha Patel (Rep, CRP-6008): revenue=93,522 → 0.04×93,522+150 = $3,890.88

Engine currently produces $84,993.02 with TWO compounding errors:
1. **ALL entities get variant_1 (Rep formula 0.04x+150)** instead of Senior Reps getting variant_0 (0.06x+200)
2. **Revenue sum includes non-Equipment Revenue data** — Tyler's implied revenue is ~202,542 vs GT 179,527

Both errors trace to convergence producing 0 derivations → sheet-matching fallback → no variant discrimination, no metric filtering.

---

## PHASE 1: VARIANT DISCRIMINATION FIX (Engine)

### Root Cause Analysis

The variant resolution code (HF-119/OB-177) builds entity tokens from TWO sources:
1. `materializedState` — OB-177 resolved_attributes from `entities.temporal_attributes` + `entities.metadata.role`
2. `flatDataByEntity` — committed_data `row_data` values (fallback if materializedState is empty)

The log shows `disc=[V0:0,V1:0]` for ALL entities, meaning zero token matches. This means:
- CRP entities do NOT have `temporal_attributes` with role data
- CRP entities do NOT have `metadata.role` populated
- committed_data `row_data` does NOT contain role information

The CRP data files (02_CRP_Capital_Equipment_Sales.xlsx and 03_CRP_Consumables_Sales.xlsx) contain transaction data (revenue, dates, product info) — NOT roster data. The roster (with roles like "Senior Rep", "Rep", "District Manager") is in the GT file, not in the imported data.

**The fix has two parts:**

### Part 1A: Populate entity metadata.role from import data

When CRP entities were imported, they were assigned to plans but their roles were not captured. The entity import process needs to check if the source data contains role/title/position information and store it in `entities.metadata.role` or `entities.temporal_attributes`.

**HOWEVER** — for the current CRP tenant, the data files don't contain role data. The roles exist only in the GT file (which is the benchmark, not a platform import).

### Part 1B: Use plan-level variant hints from committed_data

The committed_data `row_data` for CRP transactions contains fields from the sales data. Run this diagnostic FIRST to see what's actually in the data:

```sql
SELECT DISTINCT jsonb_object_keys(row_data::jsonb) as field_name
FROM committed_data
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
AND import_batch_id IN (
  SELECT id FROM import_batches
  WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
)
LIMIT 50;
```

Also check what entity metadata looks like:

```sql
SELECT id, external_id, display_name, metadata, temporal_attributes
FROM entities
WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
AND external_id IN ('CRP-6007', 'CRP-6008', 'CRP-6009')
LIMIT 3;
```

**Based on diagnostic results, implement ONE of these approaches:**

**Approach A (if row_data contains role/title/level fields):** The variant tokenizer already reads row_data. If the fields exist but aren't being tokenized (e.g., field name doesn't match), add logging to show what tokens are being generated per entity. The tokenizer uses `variantTokenize()` which lowercases, removes accents, splits on whitespace/underscore. If a field contains "Senior Rep", it should produce tokens `["senior", "rep"]`. V0 discriminant `["senior"]` should match.

**Approach B (if row_data does NOT contain role data):** The entity's role must come from `entities.metadata.role` or `entities.temporal_attributes`. If these are empty for CRP entities, the variant system has nothing to match against. Fix: during entity import or plan assignment, if the plan has variants with discriminants, log a warning: "Variant discrimination requires entity role data. Entities without role information will use default variant." For CRP specifically, entities need their roles populated. Check if the entity import captured role from any source.

**Approach C (if neither source has role data — MOST LIKELY for CRP):** The CRP data files are sales transactions, not roster files. Roles aren't in the transaction data. The variant system needs an alternative signal. Options:
1. Check if entities have role data in their `metadata` JSONB from the original entity import (the roster was likely imported separately)
2. Check `entities.metadata` for ANY field that contains "senior", "rep", "manager", "rvp" etc.
3. If entity metadata truly has no role info, the fix is to ensure the entity import process captures role data — but this is an import flow issue, not an engine issue

### Implementation

Add diagnostic logging BEFORE the variant loop to trace exactly what the engine sees:

In `run-calculation.ts`, inside the variant matching block, BEFORE the entity loop, add:

```typescript
// DIAGNOSTIC: Log materializedState and entity token sources for first 3 entities
if (variants.length > 1) {
  let diagCount = 0;
  for (const entityId of calculationEntityIds) {
    if (diagCount >= 3) break;
    diagCount++;
    const resolvedAttrs = materializedState.get(entityId);
    const entityInfo = entityMap.get(entityId);
    const entityRowsFlat = flatDataByEntity.get(entityId) || [];
    const entityName = entityInfo?.display_name ?? entityId;
    
    addLog(`[VARIANT-DIAG] ${entityName}: materializedState=${JSON.stringify(resolvedAttrs || {})}`);
    addLog(`[VARIANT-DIAG] ${entityName}: metadata.role=${JSON.stringify((entityInfo as any)?.metadata?.role || 'NONE')}`);
    addLog(`[VARIANT-DIAG] ${entityName}: flatDataRows=${entityRowsFlat.length}, sampleRowData=${JSON.stringify(entityRowsFlat[0]?.row_data || {}).substring(0, 200)}`);
    
    // Show what tokens would be generated
    const testTokens = new Set<string>();
    if (resolvedAttrs) {
      for (const val of Object.values(resolvedAttrs)) {
        if (typeof val === 'string' && val.length > 1) {
          for (const token of variantTokenize(val)) {
            testTokens.add(token);
          }
        }
      }
    }
    addLog(`[VARIANT-DIAG] ${entityName}: generated tokens=[${Array.from(testTokens).join(',')}]`);
    addLog(`[VARIANT-DIAG] ${entityName}: V0 discriminants=[${Array.from(variantDiscriminants[0] || []).join(',')}], V1 discriminants=[${Array.from(variantDiscriminants[1] || []).join(',')}]`);
  }
}
```

This diagnostic will appear in Vercel Runtime Logs and will show exactly WHY variant matching fails. The fix will then be targeted based on what the diagnostic reveals.

**IMPORTANT: Do NOT hardcode variant assignment. Do NOT add special CRP logic. The fix must be structural — making the existing variant tokenization system work by ensuring it has the right data to match against.**

---

## PHASE 2: RECONCILIATION HEADER DETECTION FIX

### Root Cause (CONFIRMED by Vercel Runtime Logs)

```
[Reconciliation][DIAG] filteredRows[0] keys (9): ["PLAN 1: Capital Equipment Commission (Bi-Weekly)","__EMPTY","__EMPTY_1",...]
[Reconciliation][DIAG] totalAmountField: "PLAN 1: Capital Equipment Commission (Bi-Weekly)"
[Reconciliation][DIAG] First row raw value: "CRP-6007" type: string
```

SheetJS `sheet_to_json()` uses row 1 as the header by default. The CRP GT file has:
- Row 1: Title text ("PLAN 1: Capital Equipment Commission (Bi-Weekly)")
- Rows 2-4: Description/formula text
- Row 5: Actual column headers (Entity ID, Name, Role, District, Period, Equipment Revenue, Slope, Intercept, Commission)
- Rows 6+: Data

Result: SheetJS produces keys like `"PLAN 1: Capital Equipment Commission (Bi-Weekly)"` (from row 1, col A) and `"__EMPTY"`, `"__EMPTY_1"` etc. (from row 1, cols B-I which are empty). The AI analysis then identifies `"PLAN 1: Capital Equipment Commission (Bi-Weekly)"` as the "total column" because it's the only non-`__EMPTY` key. But this key actually maps to the Entity ID column (col A), not the Commission column.

### Fix

In the file parsing logic (client-side XLSX parsing on the reconciliation page), detect the `__EMPTY` pattern and re-parse with the correct header row:

```typescript
// After initial sheet_to_json:
const rows = XLSX.utils.sheet_to_json(sheet, { raw: true });

// Detect __EMPTY pattern — indicates header row is NOT row 1
const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
const emptyKeyCount = firstRowKeys.filter(k => k.startsWith('__EMPTY')).length;

if (emptyKeyCount > 0 && firstRowKeys.length > 1) {
  // More than half the keys are __EMPTY — header is misaligned
  // Scan first 10 rows to find the actual header row
  const rawRows = XLSX.utils.sheet_to_json(sheet, { raw: true, header: 1 }) as unknown[][];
  
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length === 0) continue;
    
    // A header row has: multiple non-empty cells AND mostly string values
    const nonEmpty = row.filter(v => v != null && v !== '');
    const strings = nonEmpty.filter(v => typeof v === 'string');
    
    if (nonEmpty.length >= 3 && strings.length >= Math.floor(nonEmpty.length * 0.6)) {
      // Check if this looks like a data header (short strings, not sentences)
      const avgLen = strings.reduce((s, v) => s + String(v).length, 0) / strings.length;
      if (avgLen < 30) {
        headerRowIndex = i;
        break; // Found the most likely header row
      }
    }
  }
  
  if (headerRowIndex > 0) {
    // Re-parse with correct header row using range option
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    range.s.r = headerRowIndex; // Start from detected header row
    const reparsedRows = XLSX.utils.sheet_to_json(sheet, { 
      raw: true, 
      range: range,
      defval: null 
    });
    
    console.log(`[Reconciliation] Header detection: row 1 had ${emptyKeyCount} __EMPTY keys. Re-parsed from row ${headerRowIndex + 1}. New keys: ${Object.keys(reparsedRows[0] || {}).join(', ')}`);
    
    // Use reparsedRows instead of original rows
    // The keys should now be: "Entity ID", "Name", "Role", "District", "Period", "Equipment Revenue", "Slope (m)", "Intercept (b)", "Commission (y=mx+b)"
  }
}
```

**Where to implement:** This logic goes in the reconciliation page's file upload handler — wherever `XLSX.utils.sheet_to_json()` is called for the benchmark file. Search for `sheet_to_json` in:
- `web/src/app/operate/reconciliation/page.tsx`

The re-parsed rows replace the original rows before being sent to the AI analysis and comparison engine.

**Korean Test:** This detection is structural — it looks for `__EMPTY` patterns and scans for header rows by structural characteristics (multiple non-empty cells, mostly strings, short average length). It does NOT match specific column names like "Entity ID" or "Commission". A Korean file with headers "사번", "이름", "직급" would be detected the same way.

### Verification

After this fix, the reconciliation diagnostic logs should show:
```
[Reconciliation][DIAG] filteredRows[0] keys: ["Entity ID","Name","Role","District","Period","Equipment Revenue","Slope (m)","Intercept (b)","Commission (y=mx+b)"]
[Reconciliation][DIAG] totalAmountField: "Commission (y=mx+b)"
[Reconciliation][DIAG] First row raw value: 10971.62 type: number
```

And the reconciliation results should show non-zero benchmark values.

---

## PHASE 3: CALCULATE PAGE — PERIOD-FIRST UX

### Problem

The Calculate page has two competing selection models:
1. **Header bar:** PLAN dropdown → PERIOD dropdown → RUN dropdown (global navigation pattern)
2. **Page body:** Cadence-filtered plan cards with Calculate button (batch action pattern)

These contradict each other. User selects "District Override" (monthly plan) + "January 16-31" (biweekly period) in the header → body shows Capital Equipment card (the only biweekly plan). The header shows one thing, the body shows another.

### Architectural Principle

**Period is the primary axis on the Calculate page.** Plans are derived content — they appear based on cadence match to the selected period. This aligns with Decision 157 (periods are independent business objects) and Decision 158 (plan cadence is optional enrichment).

### Implementation

**3A: Suppress PLAN and RUN dropdowns on the Calculate page.**

The header PLAN-PERIOD-RUN dropdowns are part of `operate-context.tsx`. They're used across Overview, Operations, and Calculate pages. On the Calculate page ONLY:
- Hide the PLAN dropdown (plans are shown as cards in the body, filtered by cadence)
- Hide the RUN dropdown (runs are inline on plan cards — the most recent run IS the state)
- Keep the PERIOD dropdown (this is the sole top-level selector)

**Implementation approach:** The Calculate page already has its own period selector in the body (`Period: January 16-31, 2026` dropdown visible in screenshots). The header PLAN and RUN dropdowns should be conditionally hidden when the route is `/operate/calculate`.

In `web/src/app/operate/calculate/page.tsx` or the layout component that renders the header:
- Check if route matches calculate
- If yes, render only PERIOD in the header bar
- Plan cards in the body are already filtered by `cadenceFilteredPlans` from OB-189

**3B: Plan cards show inline status.**

Each plan card currently shows: plan name, "Ready" badge, entity count, row count, Calculate button.

After calculation, the card should update to show:
- Plan name
- "Calculated" badge (green) with timestamp
- Total payout amount
- Entity count
- "Recalculate" button (instead of Calculate)

This eliminates the need for a RUN dropdown — the card IS the run display.

**3C: "Calculate All N Plans" uses cadence-filtered count.**

OB-189 already implemented `cadenceFilteredPlans`. The "Calculate All" button should show the count from the filtered list: "Calculate All 1 Plan" for biweekly, "Calculate All 3 Plans" for monthly.

**Orphan check:** The PLAN and RUN dropdowns are used on Overview and Operations pages. Do NOT remove them from `operate-context.tsx` — only suppress their rendering on the Calculate page. The context variables `selectedPlanId` and `selectedRunId` remain available for other pages.

---

## ARCHITECTURE DECISION GATE

Before implementing, CC MUST verify:

1. **What fields exist in CRP committed_data row_data?**
   ```bash
   # Run against Supabase — paste the result
   SELECT DISTINCT jsonb_object_keys(row_data::jsonb) as field
   FROM committed_data
   WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
   ORDER BY field;
   ```

2. **What entity metadata exists for CRP entities?**
   ```bash
   SELECT external_id, display_name, 
          metadata->>'role' as role,
          jsonb_array_length(COALESCE(temporal_attributes, '[]'::jsonb)) as temporal_count
   FROM entities
   WHERE tenant_id = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7'
   AND external_id IN ('CRP-6007', 'CRP-6008', 'CRP-6001')
   ORDER BY external_id;
   ```

3. **Where is sheet_to_json called for reconciliation?**
   ```bash
   grep -rn "sheet_to_json" web/src/app/operate/reconciliation/
   ```

4. **Where is the header PLAN/RUN dropdown rendered?**
   ```bash
   grep -rn "selectedPlanId\|PLAN.*dropdown\|plan.*selector" web/src/app/operate/ | head -20
   ```

**CC must paste the results of ALL FOUR queries before writing any code.**

---

## DO NOT

- Do NOT hardcode variant assignment for CRP entities
- Do NOT hardcode column names for reconciliation parsing
- Do NOT remove the PLAN/RUN dropdowns from operate-context.tsx — only suppress on Calculate page
- Do NOT fix convergence in this OB — convergence is a separate P1. This OB works within the sheet-matching fallback path by ensuring variant discrimination has data to work with.
- Do NOT skip the Architecture Decision Gate diagnostics
- Do NOT create separate PRs for each phase — ONE PR for the vertical slice
- Do NOT modify any file without running `npx next lint --file <modified-file>` after changes

## PROOF GATES

| # | Gate | PASS Criteria |
|---|------|---------------|
| 1 | Architecture Decision Gate | All 4 diagnostic queries pasted with results |
| 2 | Variant diagnostic logs in committed code | `git show HEAD:web/src/app/api/calculate/run-calculation.ts \| grep "VARIANT-DIAG"` shows diagnostic lines |
| 3 | Reconciliation header detection in committed code | `git show HEAD:...reconciliation/page.tsx \| grep "__EMPTY"` shows detection logic |
| 4 | Calculate page PLAN dropdown suppressed | `git show HEAD:...calculate/page.tsx` shows conditional hide of PLAN dropdown |
| 5 | Rule 51v2 PASS | tsc 0 errors + lint 0 errors AFTER git stash |
| 6 | No orphaned code | npx next lint 0 errors |
| 7 | PR created | `gh pr create --base main --head dev` with descriptive title |

## BUILD VERIFICATION

```bash
cd /home/project/spm-platform
git add -A
git commit -m "OB-190: Vertical slice — variant diagnostics, reconciliation header detection, Calculate period-first UX"
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
# OB-190 COMPLETION REPORT

## ARCHITECTURE DECISION GATE
### CRP committed_data field names:
[paste query result]

### CRP entity metadata:
[paste query result]

### sheet_to_json locations:
[paste grep result]

### Header PLAN/RUN dropdown locations:
[paste grep result]

## COMMITS
[paste git log --oneline -2]

## PHASE 1: VARIANT DIAGNOSTIC
[paste git show HEAD: grep VARIANT-DIAG output]
[Describe what the diagnostics reveal about WHY variant matching fails for CRP]

## PHASE 2: RECONCILIATION HEADER DETECTION
[paste git show HEAD: grep __EMPTY output]

## PHASE 3: CALCULATE PERIOD-FIRST
[paste git show HEAD: evidence of PLAN dropdown suppression]

## BUILD VERIFICATION
[paste Rule 51v2 output]

## PR
[paste PR URL]

## PROOF GATES
[PASS/FAIL for each gate with evidence]
```

## FINAL STEP
```bash
gh pr create --base main --head dev --title "OB-190: Vertical slice — variant diagnostics, reconciliation header detection, Calculate period-first" --body "Phase 1: Variant discrimination diagnostic logging to trace why CRP entities get default variant. Phase 2: Reconciliation __EMPTY header detection and re-parse from correct row. Phase 3: Calculate page period-first UX — suppress PLAN/RUN dropdowns, period is sole axis."
```
