# HF-179: Fix Reconciliation Header Parsing — SINGLE TASK

## FAILURE HISTORY — WHY THIS HF EXISTS

The reconciliation header detection has FAILED THREE TIMES across two OBs:

- **OB-190 (PR #319):** Added `__EMPTY` detection + re-parse. Production DIAG logs show `__EMPTY` keys unchanged. Code did not execute or did not propagate.
- **OB-192 Phase 1 (PR #321):** "Improved" header detection algorithm. Production DIAG logs IDENTICAL to pre-fix. Variable scoping bug persists.
- **OB-192 Phase 1 (second attempt in same PR):** Same result. Keys still `__EMPTY`.

**Every attempt used the same failing pattern:** parse first with `sheet_to_json()` default, detect `__EMPTY` after, re-parse with correct range, hope the re-parsed variable propagates. It never does.

**THIS HF USES A COMPLETELY DIFFERENT APPROACH: fix the parse BEFORE it happens. No re-parse. No variable propagation. One parse, correct from the start.**

## CC_STANDING_ARCHITECTURE_RULES
All rules from CC_STANDING_ARCHITECTURE_RULES.md v3.0 apply. Key rules:

- **Rule 51v2:** `rm -rf .next` → `git stash` → `npx tsc --noEmit` → `npx next lint` → `git stash pop`
- **Rule 51 Amendment:** All verification uses `git show HEAD:filepath | grep`
- **Standing Rule 34:** No bypass. Diagnose and fix structurally.
- **Korean Test (AP-25):** ALL field identification uses STRUCTURAL heuristics only.
- **FP-113 Prevention:** Never verify against working directory.

## SCOPE — ONE FILE, ONE FIX, ONE PROOF

**Only file modified:** `web/src/app/operate/reconciliation/page.tsx`

**No other files. No phases. No bundled work. One fix.**

## THE ROOT CAUSE — IN DETAIL

The CRP ground truth file (`CRP_Resultados_Esperados.xlsx`) has this structure:

```
Row 1:  "PLAN 1: Capital Equipment Commission (Bi-Weekly)"  | [empty] | [empty] | ...
Row 2:  "Bi-Weekly Jan 1 - Jan 15, 2026"                    | [empty] | [empty] | ...
Row 3:  "Commission Formula: y = mx + b"                    | [empty] | [empty] | ...
Row 4:  [empty row]                                          |         |         |
Row 5:  "Entity ID" | "Name" | "Role" | "District" | "Period" | "Equipment Revenue" | "Slope (m)" | "Intercept (b)" | "Commission (y=mx+b)"
Row 6:  "CRP-6007"  | "Tyler Morrison" | "Senior Rep" | "NE-NE" | "Jan 1-15 2026" | 179527 | 0.06 | 200 | 10971.62
Row 7:  "CRP-6008"  | "Aisha Patel" | "Rep" | "NE-NE" | "Jan 1-15 2026" | 93522 | 0.04 | 150 | 3890.88
...
```

`XLSX.utils.sheet_to_json(sheet)` with default options uses Row 1 as the header. Since Row 1 has content only in column A ("PLAN 1: Capital Equipment Commission..."), SheetJS produces keys:
- Column A → `"PLAN 1: Capital Equipment Commission (Bi-Weekly)"`
- Column B → `"__EMPTY"`
- Column C → `"__EMPTY_1"`
- ...through `"__EMPTY_7"`

The AI analysis then identifies `"PLAN 1: Capital Equipment Commission (Bi-Weekly)"` as the "total column" (it's the only non-`__EMPTY` key). But that key maps to the Entity ID column (column A), not the Commission column. So `fileRow[totalAmountField]` returns `"CRP-6007"` (a string) → parsed to `$0`.

**CURRENT PRODUCTION EVIDENCE (from Vercel Runtime Logs):**
```
[Reconciliation][DIAG] filteredRows[0] keys (9): ["PLAN 1: Capital Equipment Commission (Bi-Weekly)","__EMPTY","__EMPTY_1","__EMPTY_2","__EMPTY_3","__EMPTY_4","__EMPTY_5","__EMPTY_6","__EMPTY_7"]
[Reconciliation][DIAG] totalAmountField: "PLAN 1: Capital Equipment Commission (Bi-Weekly)"
[Reconciliation][DIAG] First row raw value: "CRP-6007" type: string
```

## THE FIX — DETECT HEADER ROW BEFORE PARSING

### Step 0: DIAGNOSTIC — Find the exact parsing location

```bash
cd /home/project/spm-platform
echo "=== STEP 0: Find XLSX parse in reconciliation page ==="
grep -n "sheet_to_json\|XLSX\|xlsx\|workbook\|worksheet\|arrayBuffer\|read(" \
  web/src/app/operate/reconciliation/page.tsx | head -30
```

Paste the FULL output. Identify the EXACT line number where `sheet_to_json` is called.

Then:

```bash
echo "=== STEP 0B: Show 40 lines around the sheet_to_json call ==="
# Replace LINE_NUM with the actual line number from Step 0
grep -n "sheet_to_json" web/src/app/operate/reconciliation/page.tsx
```

Read the 40 lines around that call. You need to understand:
- What variable receives the parsed rows
- Where that variable is used downstream (sent to API, stored in state, etc.)
- Whether there's already OB-190 `__EMPTY` detection code nearby

**Paste the code block. Do not proceed without pasting it.**

### Step 1: Implement the fix

Replace the EXISTING `sheet_to_json` call with a function that detects the header row BEFORE parsing.

**THE NEW APPROACH — detect header row using the raw worksheet cells BEFORE calling sheet_to_json:**

```typescript
/**
 * Detect the correct header row in a worksheet.
 * Returns the 0-based row index of the header row.
 * Uses STRUCTURAL heuristics only (Korean Test compliant):
 *   - A header row has multiple non-empty cells
 *   - Most cells in a header row are strings
 *   - Header strings are short (< 40 chars avg)
 *   - Data rows have mixed types (strings + numbers)
 * Returns 0 if no better header row is found.
 */
function detectHeaderRow(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const maxScanRow = Math.min(range.e.r, 14); // scan first 15 rows

  let bestRow = 0;
  let bestScore = 0;

  for (let r = 0; r <= maxScanRow; r++) {
    let nonEmpty = 0;
    let stringCount = 0;
    let totalLen = 0;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[cellRef];
      if (cell && cell.v != null && cell.v !== '') {
        nonEmpty++;
        if (typeof cell.v === 'string') {
          stringCount++;
          totalLen += String(cell.v).length;
        }
      }
    }

    if (nonEmpty < 3) continue; // headers need at least 3 columns

    const stringRatio = stringCount / nonEmpty;
    const avgLen = stringCount > 0 ? totalLen / stringCount : 999;

    // Header row: mostly strings, short average length, many columns
    // Title rows: 1-2 cells, long strings
    // Data rows: mixed types (numbers + strings)
    if (stringRatio >= 0.6 && avgLen < 40 && nonEmpty > bestScore) {
      bestRow = r;
      bestScore = nonEmpty;
    }
  }

  return bestRow;
}
```

**Then replace the `sheet_to_json` call:**

Find the line that currently reads something like:
```typescript
const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
// or
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true });
```

Replace it with:
```typescript
// Detect header row before parsing (HF-179)
const headerRowIndex = detectHeaderRow(worksheet);
if (headerRowIndex > 0) {
  console.log(`[Reconciliation] Header detection: actual headers on row ${headerRowIndex + 1} (skipping ${headerRowIndex} title/description rows)`);
}

// Parse with correct header row — one parse, no re-parse needed
const parseRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
parseRange.s.r = headerRowIndex;
const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
  raw: true,
  range: parseRange,
  defval: null,
});

if (jsonData.length > 0) {
  console.log(`[Reconciliation] Parsed with header row ${headerRowIndex + 1}: ${Object.keys(jsonData[0]).join(', ')}`);
}
```

**CRITICAL: This replaces the EXISTING `sheet_to_json` call. There is no separate re-parse step. There is no re-parsed variable to propagate. The `jsonData`/`rows` variable that already flows downstream now contains correctly-parsed data from the first and only parse.**

### Step 2: Remove ALL previous `__EMPTY` detection code

Search for and REMOVE any OB-190 or OB-192 `__EMPTY` detection and re-parse code. This includes:
- Any `if (emptyKeyCount > 0)` blocks
- Any `reparsedRows` variables
- Any `headerRowIndex` variables from prior attempts (the new one replaces them)
- Any `sheet_to_json` calls that re-parse with a different range AFTER the initial parse

```bash
grep -n "__EMPTY\|reparsed\|reparse\|headerRow\|headerDetect\|emptyKeyCount\|emptyKey" \
  web/src/app/operate/reconciliation/page.tsx
```

Remove EVERY line that references old detection/re-parse logic. The new `detectHeaderRow` function replaces all of it.

### Step 3: Verify variable flow

After implementing, trace the variable:

```bash
echo "=== Variable trace ==="
# The variable that holds parsed rows (jsonData or rows or whatever it's called)
# must flow to BOTH:
# 1. The AI analysis call (/api/reconciliation/analyze)
# 2. The compare call (/api/reconciliation/compare)
#
# Verify by checking what variable name is used at each call site:
grep -n "analyze\|compare\|fileRows\|jsonData\|rows\|parsedData" \
  web/src/app/operate/reconciliation/page.tsx | head -30
```

Confirm that the variable holding the `sheet_to_json` result (now correctly parsed with the right header row) is the SAME variable that gets sent to both API endpoints. If there's any state setter (e.g., `setFileData(jsonData)`) between the parse and the API calls, verify the state variable is what flows downstream.

**Paste the variable trace output.**

## LOCALHOST PROOF — MANDATORY BEFORE PR

This is the gate that was missing from the last three attempts. CC MUST:

1. Start the dev server (`npm run dev`)
2. Navigate to the Reconciliation page in the browser (localhost:3000)
3. Upload the CRP ground truth file (`CRP_Resultados_Esperados.xlsx`)
4. Open browser DevTools console
5. **Paste the console output** showing the `[Reconciliation]` log lines

**Expected console output:**
```
[Reconciliation] Header detection: actual headers on row 5 (skipping 4 title/description rows)
[Reconciliation] Parsed with header row 5: Entity ID, Name, Role, District, Period, Equipment Revenue, Slope (m), Intercept (b), Commission (y=mx+b)
```

**If the console shows `__EMPTY` keys or if the header detection returns row 0, the fix is WRONG. Do NOT create the PR. Diagnose why `detectHeaderRow` returned the wrong row.**

Additionally, after the AI analysis completes, check the Confirm Mappings section in the browser:
- Employee ID should show "Entity ID" (not "PLAN 1: Capital Equipment...")
- Total Payout should show "Commission (y=mx+b)" (not "PLAN 1: Capital Equipment...")
- Period should show "Period" (not "__EMPTY_3")

**Screenshot or paste the mapping labels. If they still show __EMPTY or the title text, the fix did not propagate to the AI analysis. Do NOT create the PR.**

## DO NOT

- Do NOT use detect-then-reparse pattern. That approach has failed 3 times.
- Do NOT modify any file other than `web/src/app/operate/reconciliation/page.tsx`
- Do NOT touch the comparison engine, the compare route, the convergence service, or the calculate page
- Do NOT add phases, features, or enhancements. This is ONE fix.
- Do NOT skip the localhost proof
- Do NOT claim PASS without pasting console output showing real column names
- Do NOT create the PR if localhost shows `__EMPTY` keys

## PROOF GATES

| # | Gate | PASS Criteria |
|---|------|---------------|
| 1 | Step 0 diagnostic pasted | Exact line number of `sheet_to_json` in reconciliation page. 40 lines of surrounding code pasted. |
| 2 | `detectHeaderRow` function in committed code | `git show HEAD:web/src/app/operate/reconciliation/page.tsx \| grep "detectHeaderRow"` shows function definition. Paste output. |
| 3 | Old `__EMPTY` detection code removed | `git show HEAD:web/src/app/operate/reconciliation/page.tsx \| grep -c "reparsed\|reparse\|emptyKeyCount"` returns 0. Paste output. |
| 4 | Variable trace clean | Show that the parsed rows variable flows unbroken to both API calls. Paste evidence. |
| 5 | Localhost proof — console output | Paste browser console showing `[Reconciliation] Parsed with header row 5: Entity ID, Name, Role...`. NO `__EMPTY` keys. |
| 6 | Localhost proof — Confirm Mappings | Paste or describe: Employee ID shows "Entity ID", Total Payout shows "Commission (y=mx+b)", Period shows "Period". |
| 7 | Rule 51v2 PASS | tsc 0 errors + lint 0 errors AFTER git stash. Paste output. |
| 8 | PR created | `gh pr create --base main --head dev --title "HF-179: Fix reconciliation header parsing — detect before parse"` |

## COMPLETION REPORT TEMPLATE

```
# HF-179 COMPLETION REPORT

## STEP 0: DIAGNOSTIC
### sheet_to_json location (line number):
[paste grep output]

### Surrounding code (40 lines):
[paste code block]

### Old __EMPTY detection code found:
[paste grep output — what was removed]

## IMPLEMENTATION
### detectHeaderRow function:
[paste git show HEAD: grep output]

### sheet_to_json replacement:
[paste git show HEAD: showing the new parse call with detectHeaderRow]

### Variable trace:
[paste evidence showing the parsed variable flows to both API calls]

## LOCALHOST PROOF
### Console output after uploading CRP GT file:
[paste FULL console output — must show "Entity ID, Name, Role, District, Period, Equipment Revenue, Slope (m), Intercept (b), Commission (y=mx+b)"]

### Confirm Mappings labels:
[paste or describe what Employee ID, Total Payout, and Period show]

## BUILD VERIFICATION
[paste Rule 51v2 output — tsc + lint after git stash]

## PR
[paste PR URL]

## PROOF GATES
| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Step 0 diagnostic | PASS/FAIL | [line ref] |
| 2 | detectHeaderRow in code | PASS/FAIL | [grep output] |
| 3 | Old code removed | PASS/FAIL | [grep -c output = 0] |
| 4 | Variable trace clean | PASS/FAIL | [evidence] |
| 5 | Console output | PASS/FAIL | [pasted logs] |
| 6 | Confirm Mappings | PASS/FAIL | [labels] |
| 7 | Rule 51v2 | PASS/FAIL | [tsc/lint output] |
| 8 | PR created | PASS/FAIL | [URL] |
```

## FINAL STEP
```bash
cd /home/project/spm-platform
git add -A
git commit -m "HF-179: Fix reconciliation header parsing — detect header row BEFORE sheet_to_json, not after"
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

cd ..
gh pr create --base main --head dev \
  --title "HF-179: Fix reconciliation header parsing — detect before parse" \
  --body "Root cause: sheet_to_json() used Row 1 (title text) as header. Three prior fix attempts used detect-then-reparse but failed to propagate re-parsed rows. New approach: detectHeaderRow() scans raw worksheet cells BEFORE calling sheet_to_json, passes correct range on FIRST parse. No re-parse needed. Localhost verified with CRP GT file."
```
