# OB-193: RECONCILIATION PERIOD-SPECIFIC FILTERING + EXPERIENCE
## Type: OB (Operational Build)
## Date: March 28, 2026
## Vertical Slice: Engine (period filter) + Experience (header bar removal, period context, results clarity)

**AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. This prompt — read completely before writing any code

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev --title "OB-193: Reconciliation period-specific filtering + experience" --body "..."`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### Rule 51v2 (Build Verification)
After `git stash`: `npx tsc --noEmit` AND `npx next lint`. Use `git show HEAD:filepath | grep` to verify committed state.

### Rule 44 (Mandatory Localhost Proof for UI Fixes)
This OB changes UI behavior. Before PR creation, you MUST:
1. Upload `CRP_Resultados_Esperados.xlsx` in the Reconciliation page on localhost
2. Paste the FULL console output showing period filter behavior
3. Describe what Confirm Mappings shows (column names, sample values)
4. Describe what the Results page shows (match rate, entity count, benchmark total)
5. Confirm the PLAN/PERIOD/RUN header bar is NOT visible on the Reconciliation page

If you cannot paste this evidence, the PR is BLOCKED.

### Rule 45 (No Detect-Then-Reparse)
Do NOT use patterns where you parse data, detect a problem, then re-parse. Fix the input BEFORE the first parse. HF-179 already established this pattern for header detection. Apply the same principle: filter rows BEFORE comparison, not after.

### Rule 46 (Single-Task Focus)
This OB has exactly 3 phases. No scope creep. No "nice-to-have" additions.

---

## CONTEXT — WHAT HAPPENED AND WHY THIS OB EXISTS

### The Convergence Breakthrough
CRP Plan 1 engine now matches GT exactly for 24/24 valid entities:
- Tyler Morrison: VL $10,971.62 = GT $10,971.62 ✓
- Aisha Patel: VL $3,890.88 = GT $3,890.88 ✓
- Engine total: $73,672.40 (GT: $73,142.72, gap = 7 DMs/RVPs incorrectly assigned)

### The Reconciliation Header Fix (HF-179)
HF-179 (PR #322) fixed SheetJS header parsing. The `__EMPTY` keys are gone. Production DIAG logs confirm correct column names:
```
filteredRows[0] keys (9): ["Entity ID","Name","Role","District","Period",
"Equipment Revenue","Slope (m)","Intercept (b)","Commission (y=mx+b)"]
```

### The Current Problem — Period Filter Too Broad
The GT file (`CRP_Resultados_Esperados.xlsx`) has 97 rows: 32 entities × 3 periods (Jan 1-15 2026, Jan 16-31 2026, Feb 1-15 2026) + 1 header row. The reconciliation's period filter currently matches on "2026" (the year), pulling 96 rows instead of filtering to the specific period "Jan 1-15 2026" (~32 rows).

**Result:** Each entity appears ~3 times in the benchmark data. The comparison picks the WRONG row for each entity. Tyler Morrison shows benchmark $4,382.60 instead of GT $10,971.62. The reconciliation reports 17.4% match rate when the actual accuracy is ~100% for comparable entities.

**DIAG evidence:**
```
[Reconciliation] Period filter: 2026 → 96 rows (of 97)
[Reconciliation] CRP-6007: raw="4382.6" → parsed=4382.6, VL=10971.62, delta=-6589.02
```

The value $4,382.60 is NOT Tyler Morrison's Jan 1-15 commission. The system is aggregating or picking from the wrong period.

### Experience Gaps (from CLT-192)
1. Header PLAN/PERIOD/RUN bar still visible on Reconciliation page (removed from Calculate in OB-192, not from Reconciliation)
2. Period filter context in results says "96 of 97 rows compared (2026)" — should communicate which period, how many rows, why others excluded
3. Period Matching section shows "2026 → January 1-15, 2026 (96 rows)" — misleading; it matched the year, not the period

---

## ARCHITECTURE DECISION GATE

### Problem
Period filter uses year-level matching. Multi-period benchmark files produce wrong per-entity comparisons.

### Options Considered

**Option A: Filter benchmark rows on the client before sending to compare API**
- Parse period column values from benchmark rows
- Match against the selected VL period's date range
- Send only matching rows to `/api/reconciliation/compare`
- Pro: Simple, no API changes
- Con: Client-side date parsing logic is fragile

**Option B: Send period field + selected period to compare API, filter server-side**
- Client sends all rows + the period column name + selected period label
- Server filters rows where period column matches selected period
- Pro: Server-side filtering is more reliable, Korean Test compliant (server can use structural matching)
- Con: Requires API contract change

**Option C: Improve the existing period filter on the reconciliation page**
- The page already has period filtering code (it produced "2026 → 96 rows")
- The filter logic needs to match specific period strings, not just extract years
- Fix the filter to match "Jan 1-15 2026" against the VL period "January 1-15, 2026"
- Pro: Smallest change, fixes actual bug
- Con: String matching between different date formats requires normalization

### Decision: Option C with structural normalization

The page already has Period Matching infrastructure. It already identified "2026" as a token. The bug is that it matched on just the year instead of the full period string. Fix the period matching to normalize both sides (benchmark period values and VL period labels) to comparable tokens.

**Normalization approach:** Extract month, day-range, and year from both sides. Match when all three align. This is structural (Korean Test compliant) — it doesn't match on English month names, it normalizes to numeric representations.

Example:
- Benchmark: "Jan 1-15 2026" → { month: 1, startDay: 1, endDay: 15, year: 2026 }
- VL period: "January 1-15, 2026" → { month: 1, startDay: 1, endDay: 15, year: 2026 }
- Match: ✓

---

## PHASE 1: PERIOD-SPECIFIC BENCHMARK FILTERING

**File:** `web/src/app/operate/reconciliation/page.tsx` (and any helper it calls for period matching)

### Step 1: Diagnostic — Trace the Current Period Filter

Before writing ANY code, trace the current period filtering:

```bash
echo "=== PERIOD FILTER TRACE ==="
# Find where period filtering happens in reconciliation
grep -n "period\|Period\|filter\|Filter" web/src/app/operate/reconciliation/page.tsx | head -40

echo ""
echo "=== PERIOD MATCHING LOGIC ==="
# Find the period matching/comparison code
grep -n -A 5 "periodMatch\|period_match\|matchPeriod\|filterRows\|filteredRows" web/src/app/operate/reconciliation/page.tsx | head -60

echo ""
echo "=== WHAT GETS SENT TO COMPARE API ==="
# Find the compare API call
grep -n -A 10 "reconciliation/compare\|/api/reconciliation" web/src/app/operate/reconciliation/page.tsx | head -40
```

Paste this output into your completion report. Understand the data flow BEFORE changing code.

### Step 2: Fix Period Matching

The period matching must:

1. **Extract distinct period values** from the benchmark file's Period column. For CRP GT, these are: "Jan 1-15 2026", "Jan 16-31 2026", "Feb 1-15 2026"

2. **Normalize period strings** to a comparable structure. Write a `normalizePeriodString(periodStr: string)` function that extracts:
   - year (number)
   - month (number, 1-12)
   - startDay (number, optional)
   - endDay (number, optional)
   - This function must handle: "Jan 1-15 2026", "January 1-15, 2026", "2026-01-01", "Jan 2026", numeric months (1, 2, 3), and similar variations
   - **Korean Test:** This function uses structural parsing (regex for numbers, position-based month detection), NOT hardcoded English month names for matching logic. If month name mapping is needed for parsing the input string, use a lookup table that can be extended — but the COMPARISON is numeric (month 1 = month 1), not string-based ("Jan" = "January")

3. **Match benchmark period to VL period:** For each distinct benchmark period value, normalize it and compare against the normalized selected VL period. Filter benchmark rows to ONLY those where the period column matches.

4. **Update the period filter context:** The "Period filtered" banner must show:
   - How many rows matched the selected period (e.g., "32 of 97 rows")
   - Which period was matched (e.g., "Jan 1-15 2026")
   - How many rows were excluded and why (e.g., "64 rows from other periods excluded")

### Step 3: Verify the Filtered Data Reaches the Compare API

After filtering, verify:
- The DIAG log shows the correct filtered count (should be ~32 for CRP, not 96)
- The `filteredRows[0]` values show Tyler Morrison's Jan 1-15 data: Commission (y=mx+b) = 10971.62, Equipment Revenue = 179527
- The compare API receives ONLY the period-specific rows

**Add DIAG logging:**
```typescript
console.log(`[Reconciliation][DIAG] Period filter: "${selectedPeriodLabel}" → ${filteredRows.length} rows (of ${allRows.length})`);
console.log(`[Reconciliation][DIAG] Distinct benchmark periods found:`, distinctPeriods);
console.log(`[Reconciliation][DIAG] Matched period: "${matchedPeriodValue}" → ${filteredRows.length} rows`);
if (filteredRows.length > 0) {
  console.log(`[Reconciliation][DIAG] First filtered row:`, JSON.stringify(filteredRows[0]));
}
```

**Commit after Phase 1.** Message: `"OB-193 Phase 1: Period-specific benchmark filtering — normalize + match + filter"`

---

## PHASE 2: EXPERIENCE — HEADER BAR REMOVAL + RESULTS CONTEXT

**This phase is NOT optional. Engine fix without experience fix = Vertical Slice violation.**

### Step 1: Remove PLAN/PERIOD/RUN Header Bar from Reconciliation Page

In OB-192, the PLAN/RUN dropdowns were suppressed on the Calculate page. The Reconciliation page still shows them. Apply the same pattern:

```bash
echo "=== HOW CALCULATE PAGE SUPPRESSES HEADER ==="
grep -n -A 5 "showPlan\|showRun\|hidePlan\|hideRun\|suppressPlan\|PLAN.*suppress\|Calculate.*header" web/src/app/operate/calculate/page.tsx | head -30

echo ""
echo "=== RECONCILIATION PAGE HEADER HANDLING ==="
grep -n -A 5 "showPlan\|showRun\|hidePlan\|hideRun\|suppressPlan\|PLAN.*header" web/src/app/operate/reconciliation/page.tsx | head -30

echo ""
echo "=== SHARED LAYOUT HEADER COMPONENT ==="
# Find the shared layout that renders PLAN/PERIOD/RUN
grep -rn "PLAN.*dropdown\|PlanSelector\|RunSelector\|headerControls" web/src/app/operate/layout.tsx web/src/components/layout/ 2>/dev/null | head -20
```

Remove or suppress the PLAN/PERIOD/RUN bar on the Reconciliation page. The Reconciliation page has its OWN plan and period selectors within the Reconciliation Studio form. The shared header creates cognitive dissonance (header shows "District Override Plan" while the form shows "Capital Equipment Commission Plan").

### Step 2: Improve Period Filter Banner in Results

Current: "Period filtered: 96 of 97 rows compared (2026)"

Required: The banner must communicate clearly:
- Which specific period was compared: "Jan 1-15 2026"
- How many rows matched: "32 rows"
- How many total rows in file: "of 97"
- Why others excluded: "64 rows from other periods excluded"

Example format: `"Period filtered: 32 of 97 rows compared (Jan 1-15 2026) — 64 rows from 2 other periods excluded"`

### Step 3: Period Matching Section — Show Per-Period Row Counts

The Analyze step's Period Matching section currently shows:
```
✓ 2026 → January 1-15, 2026 (96 rows)
⚠ Unknown — No VL calculation(1 rows excluded)
```

It should show distinct periods discovered in the file with row counts:
```
✓ Jan 1-15 2026 → January 1-15, 2026 (32 rows) — will compare
○ Jan 16-31 2026 → January 16-31, 2026 (32 rows) — no VL calculation
○ Feb 1-15 2026 (32 rows) — no VL calculation
```

This is intelligence: the user sees exactly what the system discovered, which periods have VL data, and which don't. Five Elements: Value (row counts), Context (per-period breakdown), Comparison (matched vs unmatched), Action (proceed to compare with matched period), Impact (user knows 64 rows are excluded and why).

**Commit after Phase 2.** Message: `"OB-193 Phase 2: Experience — header bar removal, period filter context, period discovery display"`

---

## PHASE 3: LOCALHOST VERIFICATION (MANDATORY — Rule 44)

This phase is the proof gate. Do NOT create the PR without completing this phase.

### Step 1: Prepare Test Data

The CRP GT file is already deployed and available. If you need a test file for localhost, create a simple CSV/XLSX with:
- Multiple periods per entity (at least 2)
- A "Period" column with distinct period values
- An entity ID column
- A total payout column

### Step 2: Upload and Verify in Localhost Browser

1. Navigate to `localhost:3000/operate/reconciliation` (logged in as VL Admin to CRP tenant)
2. Select "Capital Equipment Commission Plan" and "January 1-15, 2026" period
3. Upload `CRP_Resultados_Esperados.xlsx`
4. **Screenshot/paste the console output showing:**
   - `[Reconciliation][DIAG] Distinct benchmark periods found: [...]`
   - `[Reconciliation][DIAG] Period filter: "January 1-15, 2026" → XX rows (of 97)`
   - `[Reconciliation][DIAG] First filtered row: {"Entity ID":"CRP-6007",...,"Commission (y=mx+b)":10971.62}`
5. **Verify Confirm Mappings** shows Entity ID, Commission (y=mx+b), Period
6. Click "Run Reconciliation"
7. **Verify Results page shows:**
   - Period filter banner: mentions "Jan 1-15 2026", row count ~32, not 96
   - Tyler Morrison benchmark: $10,971.62 (NOT $4,382.60)
   - Match rate substantially higher than 17.4%
   - VL Engine total: $73,672.40
   - Benchmark total: should be close to $73,142.72 (GT for 24 entities in Jan 1-15)
8. **Verify header PLAN/PERIOD/RUN bar is NOT visible** on the Reconciliation page

### Step 3: Paste Evidence

Paste ALL of the above into the completion report:
- Console DIAG output (full, not summarized)
- What Confirm Mappings shows
- What Results page shows (match rate, totals, Tyler Morrison's row)
- Whether header bar is visible or not

**Commit after Phase 3.** Message: `"OB-193 Phase 3: Localhost verification evidence"`

---

## ANTI-PATTERN REGISTRY CHECK

| # | Anti-Pattern | Check |
|---|-------------|-------|
| AP-01 | Hardcoded field names | normalizePeriodString uses structural parsing, not hardcoded month strings for comparison |
| AP-25 | Korean Test violation | Period comparison is numeric (month 1 = month 1), not string-based |
| FP-113 | Working directory not committed | Rule 51v2 enforced — verify committed code |
| FP-116 | Variable propagation (detect-then-reparse) | No re-parse. Filter rows from the ALREADY-PARSED data. Single variable path. |
| FP-117 | Algorithmic polish masking structural bug | The fix addresses root cause (filter logic), not the algorithm around it |
| FP-118 | Merged without browser evidence | Rule 44 enforced — mandatory localhost proof in Phase 3 |

---

## PROOF GATES — HARD (must ALL pass)

| # | Gate | Evidence Required |
|---|------|-------------------|
| H1 | Period filter produces ~32 rows for CRP Jan 1-15 (not 96) | DIAG log paste showing filtered count |
| H2 | Tyler Morrison benchmark = $10,971.62 in results | Console or UI evidence |
| H3 | Header PLAN/PERIOD/RUN bar NOT visible on Reconciliation page | Describe what you see at top of page |
| H4 | Period filter banner shows specific period name and row counts | Paste the banner text |
| H5 | Rule 51v2: `npx tsc --noEmit` = 0, `npx next lint` = 0 after `git stash` | Paste output |
| H6 | `normalizePeriodString` does NOT use hardcoded English month names for comparison logic | Paste the function or grep showing comparison is numeric |
| H7 | DIAG logs show distinct periods discovered in file | Paste log line |

## PROOF GATES — SOFT (should pass, document if not)

| # | Gate | Evidence Required |
|---|------|-------------------|
| S1 | Period Matching section shows per-period row counts | Describe what Analyze step shows |
| S2 | Match rate higher than 17.4% after fix | Paste match rate from results |
| S3 | Population mismatch section shows VL-only entities with names | Describe population panel |
| S4 | Benchmark total close to $73,142.72 for matched entities | Paste benchmark total |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-193_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## FINAL STEP

```bash
gh pr create --base main --head dev \
  --title "OB-193: Reconciliation period-specific filtering + experience" \
  --body "Vertical slice: engine period filter + experience improvements.

Phase 1: Period-specific benchmark filtering — normalizes period strings to numeric tokens, filters benchmark rows to only the selected VL period. Fixes 96→32 row count for CRP multi-period GT file.

Phase 2: Experience — removes PLAN/PERIOD/RUN header bar from Reconciliation page, improves period filter banner with specific period name and row counts, shows per-period discovery in Period Matching section.

Phase 3: Localhost verification with CRP GT file — Tyler Morrison benchmark matches GT, match rate reflects actual engine accuracy.

Proof tenant: CRP (e44bbcb1-2710-4880-8c7d-a1bd902720b7)
Ground truth: CRP_Resultados_Esperados.xlsx
Previous: HF-179 (PR #322) fixed header parsing. This OB fixes period filtering."
```

---

## WHAT SUCCESS LOOKS LIKE

After this OB deploys, the admin uploads `CRP_Resultados_Esperados.xlsx` against the Capital Equipment Commission Plan for January 1-15, 2026. The system:

1. Parses the file correctly (HF-179 ✓)
2. Discovers 3 distinct periods in the file: Jan 1-15, Jan 16-31, Feb 1-15
3. Filters to ONLY Jan 1-15 rows (~32 rows, not 96)
4. Compares each entity's Jan 1-15 commission against VL's calculated value
5. Shows Tyler Morrison: VL $10,971.62, Benchmark $10,971.62, Delta $0.00 ✓
6. Shows match rate reflecting actual accuracy (~100% for comparable entities)
7. Shows 7-8 VL-only entities (DMs/RVPs — known entity assignment gap)
8. Shows 1 file-only entity (CRP-6038)
9. No PLAN/PERIOD/RUN header bar creating confusion
10. Clear period filter context: "32 of 97 rows compared (Jan 1-15 2026)"

**The engine already works. This OB makes the reconciliation prove it.**

---

*"The gap is no longer in the math — it's in showing the math."*
