# OB-85: PIPELINE CONTROL SURFACE + RECONCILIATION PROOF
## Fresh Import → Period Selection → Calculation → Reconciliation — All in Browser

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `ViaLuce_TMR_Addendum4_Feb2026.md` — Adaptive Depth Reconciliation methodology
4. `OB-83_COMPLETION_REPORT.md` — domain dispatch, assessment panels
5. `OB-84_COMPLETION_REPORT.md` — UX polish, readability, navigation

**Read all five before writing any code.**

---

## WHY THIS OB IS THE MOST IMPORTANT ONE

84 OBs have built: an agentic architecture with 869 tests, a calculation engine proven to 100.7% accuracy, AI plan interpretation, AI field mapping, three-scope flywheels, synaptic state, domain dispatch, and assessment panels.

**None of that matters if a user cannot:**
1. Choose what to calculate (Plan × Data × Period)
2. Prove the calculation is correct (Reconciliation)

Both are broken. This OB fixes both. Every mission is browser-verifiable. The proof is not a test script — it's a user clicking buttons and seeing results.

**After OB-85, Andrew can sit in front of a prospect and demonstrate:**
"Upload your plan. Upload your data. Select a period. Calculate. Upload your benchmark. See that our numbers match yours."

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Import ALL columns to committed_data (mapped+unmapped). Standing rule.
7. **Fix logic not data.**
8. Inline styles for visual-critical properties.
9. **No new pages.** Fix existing pages. The routes exist — they just don't work.

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did Before | What To Do Instead |
|---|---|---|
| Silent fallback | Period not found → return empty | Period not found → show "No periods detected. Import data first." with link |
| Schema disconnect | Query `payroll_periods` | Query `periods` (check SCHEMA_REFERENCE.md) |
| Placeholder confidence | Return 50% hardcoded | Return actual AI confidence or omit |
| Parallel pipelines | Create new reconciliation page | Fix existing `/investigate/reconciliation` page |
| Report inflation | "Reconciliation works" without browser proof | Paste curl output, SQL results, or screenshot evidence |

---

## PHASE 0: DIAGNOSTIC — WHAT EXISTS TODAY

### 0A: Calculate page

```bash
echo "=== CALCULATE PAGE ==="
find web/src/app -path "*calculat*" -name "page.tsx" | head -5

echo ""
echo "=== CALCULATE PAGE CONTENTS ==="
for f in $(find web/src/app -path "*calculat*" -name "page.tsx" | head -3); do
  echo "--- $f ---"
  wc -l "$f"
  grep -n "period\|Period\|batch\|selector\|select\|dropdown\|plan.*data\|ruleSet" "$f" | head -15
done

echo ""
echo "=== PERIOD SELECTOR COMPONENT ==="
grep -rn "PeriodSelector\|period-selector\|periodSelect\|PeriodPicker" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== CALCULATION API ROUTE ==="
cat web/src/app/api/calculation/run/route.ts | head -50
```

### 0B: Reconciliation page

```bash
echo "=== RECONCILIATION PAGES ==="
find web/src/app -path "*reconcil*" -name "page.tsx" | head -5

echo ""
echo "=== RECONCILIATION COMPONENTS ==="
find web/src/components -iname "*reconcil*" | head -10

echo ""
echo "=== RECONCILIATION API ==="
find web/src/app/api -path "*reconcil*" -name "route.ts" | head -5
for f in $(find web/src/app/api -path "*reconcil*" -name "route.ts" | head -3); do
  echo "--- $f ---"
  wc -l "$f"
done
```

### 0C: Period data

```bash
echo "=== PERIODS TABLE SCHEMA ==="
grep -A 20 "periods" web/src/lib/database.types.ts 2>/dev/null | head -25

echo ""
echo "=== PERIOD QUERIES ==="
grep -rn "from.*periods\|\.from('periods')" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10
```

### 0D: Current Supabase data

```bash
echo "=== CHECK WHAT DATA EXISTS ==="
echo "Run these in Supabase SQL Editor:"
echo ""
echo "-- Periods for Óptica Luminar"
echo "SELECT id, canonical_key, start_date, end_date, tenant_id FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' ORDER BY start_date;"
echo ""
echo "-- Calculation batches"
echo "SELECT id, lifecycle_state, entity_count, period_id, created_at FROM calculation_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' ORDER BY created_at DESC LIMIT 10;"
echo ""
echo "-- Committed data count per period"  
echo "SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
echo ""
echo "-- Rule sets (plans)"
echo "SELECT id, name, status, created_at FROM rule_sets WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';"
```

**Commit:** `OB-85 Phase 0: Diagnostic — calculate, reconciliation, periods, data`

---

## MISSION 1: PIPELINE CONTROL SURFACE — Plan × Data × Period

The Calculate page must let the user explicitly choose what to calculate.

### 1A: Period Selector

The Calculate page (wherever it lives — `/operate/calculate` or on the Operate cockpit) must show:

```
┌─────────────────────────────────────────────────────┐
│  SELECT PERIOD                                       │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Jan 2024 │ │ Feb 2024 │ │ Mar 2024 │            │
│  │ 719 emp  │ │ 719 emp  │ │ 680 emp  │            │
│  │ 6 sheets │ │ 4 sheets │ │ 4 sheets │            │
│  │ ● Ready  │ │ ● Ready  │ │ ○ Partial│            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Active Plan: Plan de Comisiones Optica Luminar 2026│
│  Data Source: Import batch 2026-02-23               │
│                                                      │
│  [Run Calculation →]                                 │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
1. Query `periods` table for the current tenant
2. For each period, show: label (month/year), entity count (from committed_data), sheet count, readiness indicator
3. Show the active plan (from `rule_sets` where status = 'active')
4. "Run Calculation" button is disabled until a period is selected
5. Clicking "Run Calculation" sends: `{ tenantId, periodId, ruleSetId }` to `/api/calculation/run`

### 1B: Calculation execution feedback

After clicking "Run Calculation":
1. Button shows loading state ("Calculating...")
2. On success: show results summary (entity count, total payout, component breakdown)
3. Lifecycle stepper advances
4. "View Results" button appears → navigates to results detail
5. **"Reconcile →" button appears** → navigates to reconciliation page with batch context

### 1C: Results display

After calculation completes, the page must show:
- **Total Payout** (formatted with tenant currency)
- **Entity Count** (employees processed)
- **Per-component breakdown** (dynamic from plan, not hardcoded)
- **Lifecycle state** (Draft/Preview/Official/etc.)

### 1D: Verify

```bash
echo "=== POST-FIX: Period selector ==="
grep -n "periods\|Period" web/src/app/*calculat*/page.tsx 2>/dev/null | head -10
grep -n "periods\|Period" web/src/app/operate/page.tsx 2>/dev/null | head -10

echo ""
echo "=== POST-FIX: Run Calculation wiring ==="
grep -n "calculation/run\|runCalculation\|handleCalculate" web/src/app/*calculat*/page.tsx 2>/dev/null | head -10
```

**Proof gates:**
- PG-1: Period selector shows available periods from Supabase `periods` table
- PG-2: Each period card shows entity count and readiness
- PG-3: Active plan displayed
- PG-4: "Run Calculation" button disabled until period selected
- PG-5: Clicking "Run Calculation" POSTs to `/api/calculation/run` with periodId + ruleSetId
- PG-6: After calculation: results summary visible (total payout, entity count, components)
- PG-7: "Reconcile →" button appears after successful calculation

**Commit:** `OB-85 Mission 1: Pipeline control surface — period selector + calculation trigger, 7 gates`

---

## MISSION 2: RECONCILIATION — AUTO-MAP + COMPARE + RESULTS

The Reconciliation page must work end-to-end in the browser. No manual field mapping for obvious fields.

### 2A: Batch selector

The reconciliation page must show which calculation batch to compare against:

```
┌─────────────────────────────────────────────────────┐
│  SELECT CALCULATION TO RECONCILE                     │
│                                                      │
│  Dropdown: [Jan 2024 — Posted (MX$20,662) ▼]       │
│                                                      │
│  12 entities · 4 components · Calculated 2/15/2026   │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
1. Query `calculation_batches` for current tenant
2. Show human-readable labels: "Period — State (Total)" not UUIDs
3. After selection: show batch summary (entity count, components, date)

### 2B: Benchmark upload with AUTO-MAP

After selecting a batch, user uploads their benchmark file:

```
┌─────────────────────────────────────────────────────┐
│  UPLOAD BENCHMARK FILE                               │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Drop CSV or XLSX here, or click to browse  │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  After upload, AI auto-maps:                        │
│                                                      │
│  ✓ Employee ID: "num_empleado" (100% confidence)    │
│  ✓ Total Payout: "Total" (95% confidence)           │
│  ○ Component: "Optical Sales" → Performance Matrix   │
│    (72% confidence — review recommended)             │
│                                                      │
│  [Run Reconciliation →]                              │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
1. Accept CSV or XLSX upload
2. Parse file headers
3. **AUTO-MAP the two essential fields:**
   - Employee identifier: look for columns named `employee_id`, `num_empleado`, `Employee ID`, `ID`, `emp_id`, or any column where values match entity external_ids in the calculation results
   - Total payout: look for columns named `total`, `total_payout`, `Total Compensation`, `payout`, `payment`, or the rightmost numeric column
4. Use AI field mapping (same engine as data import) if header matching fails
5. Show mapping results with confidence scores
6. Allow user to override mappings
7. **"Run Reconciliation" enabled when at minimum Employee ID + Total Payout are mapped**

### 2C: Auto-map implementation

The auto-map logic:

```typescript
function autoMapBenchmarkFields(
  fileHeaders: string[],
  fileRows: any[],
  calculationEntities: { externalId: string, totalPayout: number }[]
): { employeeIdColumn: string | null, totalPayoutColumn: string | null, confidence: number } {
  
  // Step 1: Find employee ID column
  // Try header name matching first
  const idCandidates = fileHeaders.filter(h => 
    /employee|empleado|emp.?id|worker|num_emp|id_emp/i.test(h)
  );
  
  // If no header match, try value matching:
  // For each column, check if values overlap with calculation entity externalIds
  const entityIds = new Set(calculationEntities.map(e => e.externalId));
  for (const header of fileHeaders) {
    const colValues = fileRows.map(r => String(r[header]).trim());
    const matchCount = colValues.filter(v => entityIds.has(v)).length;
    if (matchCount > fileRows.length * 0.5) {
      // >50% of values match entity IDs — this is the employee column
    }
  }
  
  // Step 2: Find total payout column
  // Try header name matching
  const payoutCandidates = fileHeaders.filter(h =>
    /total|payout|payment|compensation|pago|compensaci/i.test(h)
  );
  
  // If no header match, find rightmost numeric column with values
  // in the same range as calculation total_payouts
  
  return { employeeIdColumn, totalPayoutColumn, confidence };
}
```

**CRITICAL: This is not a new AI call.** Auto-mapping for reconciliation uses pattern matching + value overlap detection. Save AI calls for Adaptive Depth (component-level mapping). The two essential fields (ID + total) should map in <1 second with zero API calls.

### 2D: Run reconciliation

When user clicks "Run Reconciliation":

1. Match benchmark employees to calculation entities by ID (normalize: trim, lowercase, strip leading zeros)
2. For each match: compare total payout
3. Classify each match:
   - **Exact:** delta < $0.01
   - **Tolerance:** delta < 1%
   - **Amber:** delta 1–5%
   - **Red:** delta > 5%
4. Track three populations: Matched, VL-only (in calc but not benchmark), File-only (in benchmark but not calc)

### 2E: Results display

```
┌─────────────────────────────────────────────────────┐
│  RECONCILIATION RESULTS                              │
│                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 719    │ │ 98.2%  │ │ MX$47  │ │ 0      │      │
│  │Matched │ │Match   │ │Avg Δ   │ │False   │      │
│  │        │ │Rate    │ │        │ │Greens  │      │
│  └────────┘ └────────┘ └────────┘ └────────┘      │
│                                                      │
│  VL Total: MX$1,262,865  Benchmark: MX$1,263,012   │
│  Delta: MX$147 (0.01%)                              │
│                                                      │
│  ┌─────┬────────┬─────────┬──────────┬──────┬─────┐│
│  │ ID  │ Name   │VL Total │Benchmark │ Δ    │Flag ││
│  ├─────┼────────┼─────────┼──────────┼──────┼─────┤│
│  │96568│Carlos  │$3,348   │$3,348    │$0    │ ✓   ││
│  │97998│Maria   │$3,347   │$3,350    │-$3   │ ~   ││
│  │...  │...     │...      │...       │...   │...  ││
│  └─────┴────────┴─────────┴──────────┴──────┴─────┘│
│                                                      │
│  Sort by: [Delta ▼] [Flag ▼] [Name ▲]              │
│  Export: [Download CSV] [Download XLSX]               │
└─────────────────────────────────────────────────────┘
```

**Requirements:**
1. Summary cards: matched count, match rate, average delta, false green count
2. Aggregate totals: VL total, benchmark total, delta, delta %
3. Employee table: sortable by delta, flag, name
4. Flag column: ✓ (exact), ~ (tolerance), ⚠ (amber), ✗ (red)
5. Export button (CSV at minimum)
6. All monetary values in tenant currency (MX$)

### 2F: Verify

```bash
echo "=== POST-FIX: Auto-map function ==="
grep -rn "autoMap\|auto-map\|benchmarkMap" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10

echo ""
echo "=== POST-FIX: Reconciliation results component ==="
grep -rn "ReconciliationResults\|matchRate\|matchCount\|delta\|variance" web/src/ --include="*.tsx" | grep -v node_modules | head -10
```

**Proof gates:**
- PG-8: Batch selector shows calculation batches with human-readable labels
- PG-9: Benchmark file upload parses CSV/XLSX headers
- PG-10: Auto-map identifies employee ID column without user intervention
- PG-11: Auto-map identifies total payout column without user intervention
- PG-12: "Run Reconciliation" enabled after auto-map completes
- PG-13: Results show matched count > 0
- PG-14: Results show per-entity VL total vs benchmark total with delta
- PG-15: Summary cards show match rate and aggregate delta
- PG-16: Employee table sortable by delta
- PG-17: Export button produces downloadable file

**Commit:** `OB-85 Mission 2: Reconciliation — auto-map + compare + results, 10 gates`

---

## MISSION 3: FRESH IMPORT TEST

⚠️ **STOP AND WAIT FOR ANDREW.**

This mission is interactive. Andrew will perform the import in the browser. CC prepares the verification.

### 3A: Pre-import database state

Before Andrew imports, capture current state:

```sql
SELECT 'periods' as tbl, COUNT(*) as cnt FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL  
SELECT 'calculation_batches', COUNT(*) FROM calculation_batches WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL
SELECT 'calculation_results', COUNT(*) FROM calculation_results WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL
SELECT 'entities', COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
```

### 3B: Andrew imports

Andrew will:
1. Navigate to Import in the browser
2. Upload the data XLSX file
3. Complete the import flow (sheet analysis → field mapping → validate → approve)
4. Confirm the import commits

### 3C: Post-import verification

After Andrew confirms import:

```sql
-- New data committed?
SELECT 'periods' as tbl, COUNT(*) as cnt FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL
SELECT 'committed_data', COUNT(*) FROM committed_data WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
UNION ALL
SELECT 'entities', COUNT(*) FROM entities WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';

-- Period details
SELECT canonical_key, start_date, end_date FROM periods WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f' ORDER BY start_date;
```

### 3D: Proof gates

- PG-18: Import completes without error in browser
- PG-19: committed_data count increases after import
- PG-20: Periods created for imported data
- PG-21: Period selector (Mission 1) shows new periods

**Commit:** `OB-85 Mission 3: Fresh import verification`

---

## MISSION 4: END-TO-END PIPELINE PROOF

### 4A: Calculate

Andrew will:
1. Navigate to Calculate page
2. Select a period from the period selector (Mission 1)
3. Click "Run Calculation"
4. Verify results appear

CC verifies:
```sql
-- New calculation batch?
SELECT id, lifecycle_state, entity_count, period_id, 
       (SELECT SUM(total_payout) FROM calculation_results WHERE batch_id = cb.id) as total
FROM calculation_batches cb
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
ORDER BY created_at DESC LIMIT 3;
```

### 4B: Reconcile

Andrew will:
1. Navigate to Reconciliation page (from "Reconcile →" button or sidebar)
2. Select the calculation batch from dropdown
3. Upload the benchmark file (CLT-14B ground truth)
4. Verify auto-map identifies Employee ID + Total Payout
5. Click "Run Reconciliation"
6. Verify results: match count, match rate, per-entity comparison

### 4C: Proof gates

- PG-22: Calculation completes from browser with non-zero total payout
- PG-23: Results show entity count matching the period's entity population
- PG-24: Reconciliation auto-maps benchmark file fields
- PG-25: Reconciliation produces matched employees > 0
- PG-26: Per-entity comparison shows VL total vs benchmark total
- PG-27: Match rate > 90% (based on OB-75 proven 100.7% accuracy)

**Commit:** `OB-85 Mission 4: End-to-end pipeline proof`

---

## MISSION 5: BUILD + COMPLETION REPORT + PR

### 5A: Build

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
```

### 5B: Completion report

Save as `OB-85_COMPLETION_REPORT.md` at **PROJECT ROOT**.

Structure:
1. **Pipeline Control Surface** — period selector, plan display, calculation trigger
2. **Reconciliation** — auto-map, comparison engine, results display
3. **Fresh Import** — pre/post data counts, periods created
4. **E2E Proof** — calculation total, reconciliation match rate, per-entity sample
5. **Proof gates** — 27 gates, each PASS/FAIL with evidence
6. **The Number** — total payout calculated, benchmark total, delta, match rate

### 5C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-85: Pipeline Control Surface + Reconciliation Proof — Import to Match Rate" \
  --body "## The Most Important OB

For the first time, a user can:
1. Select a period to calculate
2. See which plan and data will be used
3. Run a calculation
4. Upload a benchmark file
5. See auto-mapped fields (no manual mapping)
6. Run reconciliation
7. See per-entity match rates and variances

### Mission 1: Pipeline Control Surface
- Period selector from Supabase periods table
- Active plan display
- Calculation trigger with feedback
- Results summary with component breakdown

### Mission 2: Reconciliation
- Batch selector with human-readable labels
- Benchmark upload with auto-map (employee ID + total payout)
- Pattern matching + value overlap detection (no AI call needed)
- Per-entity comparison with flag classification
- Summary cards, sortable table, export

### Mission 3: Fresh Import
- Andrew imported data through the browser
- Periods created, committed_data populated

### Mission 4: E2E Proof
- Calculation: [X] entities, MX$[Y] total
- Reconciliation: [Z]% match rate against ground truth
- Delta: MX$[D] ([P]%)

## Proof Gates: 27 — see OB-85_COMPLETION_REPORT.md"
```

**Proof gates:**
- PG-28: `npm run build` exits 0
- PG-29: localhost:3000 responds

**Commit:** `OB-85 Final: Completion report + PR`

---

## MAXIMUM SCOPE

5 missions, 29 proof gates. Missions 3 and 4 are interactive (Andrew in browser). After OB-85, the platform's core value proposition is demonstrable: upload, calculate, prove.

---

*OB-85 — February 23, 2026*
*"84 OBs built the engine. This one proves it drives."*
