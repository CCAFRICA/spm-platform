# HF-135: MULTI-TAB XLSX DATA IMPORT FIX

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — 10-gate checklist

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS HF EXISTS

Multi-tab XLSX files uploaded for data import only have Tab 1 processed. Subsequent tabs are silently ignored. This caused Deposit Growth $0 at Caribe Financial (CLT122-F65): the plan file's Tab 2 contained per-entity growth targets that never reached committed_data.

**The plan import path already reads all tabs** (HF-130 added XLSX text extraction for multi-sheet plan interpretation). The data import path does NOT.

OB-124 fixed the `data_type` naming for multi-tab files (appending `__sheet_name`), but the underlying issue — only Tab 1's data rows reaching committed_data — must be verified and fixed if still present.

**Mission Control item: MC#6 (P0)**

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data.

---

## CRITICAL CONTEXT

### How Import Works (Two Paths)

**Path 1: SCI Import (current for BCL)**
1. User uploads file at `/operate/import`
2. Frontend parses XLSX using SheetJS → extracts sheets
3. Sends to `/api/import/sci/analyze` → AI classifies each sheet as plan/transaction/entity/target
4. User confirms → sends to `/api/import/sci/execute` → routes each content unit to correct pipeline
5. Transaction/entity/target content → committed_data

**Path 2: Legacy DPI Import (older tenants)**
1. User uploads file at `/operate/import/enhanced` or similar
2. Frontend parses XLSX → sends to `/api/import/analyze-workbook` or `/api/import/commit`
3. Data committed to committed_data

### The Known Problem

In the SCI path, the frontend parses the XLSX and sends sheet data to the analyze endpoint. The question is: does the frontend send ALL sheets, or only the first?

In the legacy path, OB-124 confirmed that `resolveDataType()` in `/api/import/commit/route.ts` now appends `__sheet_name` for multi-tab files. But this only affects data_type naming — if only Tab 1's rows are sent to the commit endpoint, the naming fix is moot.

### BCL-Specific Note

BCL's data import used the SCI path (HF-129 through HF-133). BCL's data file has two classifications:
- 85 transaction rows (source_date 2025-10-01)
- 85 roster/personal rows

Both are in committed_data (170 total rows). But BCL's file may have been single-tab per file. The multi-tab issue would surface when a tenant uploads a single XLSX with transaction data on Tab 1 and roster data on Tab 2.

---

## PHASE 0: DIAGNOSTIC — TRACE THE DATA IMPORT PATH (Zero Code Changes)

### 0A: Trace Frontend XLSX Parsing

```bash
# Find where XLSX files are parsed in the frontend
grep -rn "XLSX\|xlsx\|read.*workbook\|sheet_to_json\|SheetNames" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | grep -v ".next" | sort

# Find the SCI analyze call — what does it send?
grep -rn "sci/analyze\|analyzeWorkbook" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | head -20

# Find the SCI execute call — what does it send?
grep -rn "sci/execute" \
  web/src/ --include="*.ts" --include="*.tsx" | \
  grep -v node_modules | head -20
```

### 0B: Trace How Sheets Are Collected

Find the code that builds the request body for the analyze endpoint:

```bash
# The analyze endpoint expects: files[].sheets[] — does the frontend populate ALL sheets?
grep -rn "sheets\|SheetNames\|workbook\.Sheets" \
  web/src/app/operate/import/ --include="*.ts" --include="*.tsx" | head -20

# Check for [0] indexing that would limit to first sheet
grep -rn "\[0\]\|sheets\[0\]\|SheetNames\[0\]" \
  web/src/app/operate/import/ --include="*.ts" --include="*.tsx" | head -10

# Check the legacy import path too
grep -rn "\[0\]\|sheets\[0\]\|SheetNames\[0\]" \
  web/src/app/api/import/ --include="*.ts" | head -10
```

### 0C: Trace the Execute Pipeline for Transaction/Entity Content

```bash
# In the SCI execute route, how are transaction rows committed?
grep -rn "committed_data\|\.insert\|bulk.*insert" \
  web/src/app/api/import/sci/execute/ --include="*.ts" | head -20

# Does it iterate over all sheets or just the first classified unit?
grep -rn "forEach\|\.map\|for.*of\|contentUnit" \
  web/src/app/api/import/sci/execute/ --include="*.ts" | head -20
```

### 0D: Document Findings

In the completion report, answer:
1. **Frontend parsing:** Does the XLSX parser iterate all SheetNames or just [0]?
2. **Analyze request:** Does the request body include all sheets from all files?
3. **Execute pipeline:** Does it commit data from ALL classified content units, or just the first?
4. **Where is the bottleneck?** Frontend (only sends Tab 1), backend analyze (only processes Tab 1), or backend execute (only commits Tab 1)?

**Commit:** `git add -A && git commit -m "HF-135 Phase 0: Diagnostic — multi-tab XLSX data import trace" && git push origin dev`

---

## PHASE 1: FIX — ENSURE ALL TABS ARE PROCESSED

Based on Phase 0 findings, apply the fix at the identified bottleneck.

### Scenario A: Frontend Only Sends Tab 1

If the frontend XLSX parser only reads `SheetNames[0]`:

```typescript
// WRONG: Only first sheet
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

// RIGHT: All sheets
const sheets = workbook.SheetNames.map(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    sheetName,
    columns,
    rows: rows.slice(0, 50), // Sample for analysis
    totalRowCount: rows.length,
  };
});
```

### Scenario B: Analyze Endpoint Only Processes First Sheet

If `/api/import/sci/analyze` receives all sheets but only classifies the first:

```typescript
// WRONG: Only first sheet per file
const sheet = file.sheets[0];

// RIGHT: All sheets
for (const sheet of file.sheets) {
  // classify each sheet independently
}
```

### Scenario C: Execute Endpoint Only Commits First Content Unit

If `/api/import/sci/execute` receives all classified units but only commits the first transaction/entity type:

```typescript
// WRONG: Process first of each type
const transactionUnit = contentUnits.find(u => u.classification === 'transaction');

// RIGHT: Process ALL of each type
const transactionUnits = contentUnits.filter(u => u.classification === 'transaction');
for (const unit of transactionUnits) {
  // commit each independently
}
```

### Scenario D: Already Working (BCL proves it)

If Phase 0 shows that the SCI path already handles all tabs correctly (BCL's 170 rows = 85 transaction + 85 roster from potentially 2 tabs), then the bug may be specific to the LEGACY import path only. In that case:

1. Verify the legacy path at `/api/import/commit/route.ts`
2. Apply the same fix there
3. OR: remove the legacy path entirely (SCI is the canonical import per Decision 77)

### Korean Test

The fix must NOT reference tab names, sheet labels, or any language-specific content. Tab iteration is by index (structural). Classification is by AI (content-aware). Zero hardcoded sheet names.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Root cause identified | Which layer (frontend/analyze/execute) limits to Tab 1 |
| PG-2 | Fix applied to correct layer | Code change pasted in completion report |
| PG-3 | Fix iterates ALL SheetNames | Loop, not [0] indexing |
| PG-4 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-135 Phase 1: Fix multi-tab XLSX — all sheets processed" && git push origin dev`

---

## PHASE 2: VERIFICATION

### 2A: Create a Test File

Create a simple 2-tab XLSX test file programmatically (or use an existing multi-tab file):

```bash
# Create a test XLSX with 2 tabs using Node
node -e "
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();

// Tab 1: Transaction data
const ws1 = XLSX.utils.aoa_to_sheet([
  ['EntityID', 'Amount', 'Date'],
  ['TEST-001', 100, '2025-10-01'],
  ['TEST-002', 200, '2025-10-01'],
]);
XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');

// Tab 2: Roster data
const ws2 = XLSX.utils.aoa_to_sheet([
  ['EntityID', 'Name', 'Level'],
  ['TEST-001', 'Test Entity One', 'Senior'],
  ['TEST-002', 'Test Entity Two', 'Standard'],
]);
XLSX.utils.book_append_sheet(wb, ws2, 'Roster');

XLSX.writeFile(wb, '/tmp/multi-tab-test.xlsx');
console.log('Created /tmp/multi-tab-test.xlsx with 2 tabs');
"
```

### 2B: Upload and Verify

Upload the test file through the browser import flow. After import completes, verify:

```sql
-- Check committed_data for both tabs' data
SELECT data_type, COUNT(*) as rows, MIN(source_date) as min_date
FROM committed_data
WHERE tenant_id = '[test_tenant_id]'
AND import_batch_id = (
  SELECT id FROM import_batches
  WHERE tenant_id = '[test_tenant_id]'
  ORDER BY created_at DESC LIMIT 1
)
GROUP BY data_type;

-- EXPECTED: 2 rows (one per tab) with distinct data_types
-- Tab 1: 2 transaction rows
-- Tab 2: 2 roster rows
```

### 2C: BCL Regression Check

Verify BCL still has 170 committed_data rows and $44,590 calculation.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-5 | Multi-tab file: both tabs' data in committed_data | SQL query shows rows from both tabs |
| PG-6 | Each tab has distinct data_type | GROUP BY data_type shows 2 groups |
| PG-7 | BCL regression: 170 rows, $44,590 | No change to existing data |
| PG-8 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "HF-135 Phase 2: Multi-tab verification — both tabs imported" && git push origin dev`

---

## PHASE 3: COMPLETION REPORT + PR

### 3A: Completion Report

Create `HF-135_COMPLETION_REPORT.md` at project root:

```markdown
# HF-135: Multi-Tab XLSX Data Import Fix — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Diagnostic
- Frontend parsing: [all sheets / only first sheet]
- Analyze request: [sends all sheets / sends first only]
- Execute pipeline: [commits all units / commits first only]
- Bottleneck location: [frontend / analyze / execute / none]
- Root cause: [description]

## Phase 1: Fix
- File changed: [path]
- Change: [description]
- Before: [code/behavior]
- After: [code/behavior]

## Phase 2: Verification
- Multi-tab test file: [both tabs imported / only Tab 1]
- Tab 1 data_type: [value]
- Tab 2 data_type: [value]
- committed_data rows: [count from Tab 1] + [count from Tab 2]
- BCL regression: [170 rows, $44,590 confirmed]

## Proof Gates Summary
[PG-1 through PG-8: PASS/FAIL for each]
```

### 3B: Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-135: Multi-Tab XLSX Data Import — All Sheets Processed" \
  --body "## What This Fixes

### Silent Data Loss (MC#6 — P0)
- Multi-tab XLSX files had only Tab 1 imported
- Root cause: [from diagnostic]
- Fix: [description]
- All sheets now iterated and processed independently

### Verification
- 2-tab test file: both tabs' data in committed_data
- BCL regression: 170 rows, \$44,590 unchanged

## Proof Gates: see HF-135_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "HF-135 Phase 3: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

### Step 1: BCL Regression
1. Login as Patricia at vialuce.ai
2. Navigate to /stream — verify $44,590
3. Verify 170 committed_data rows (read-only SQL)

### Step 2: Multi-Tab Import Test
1. Upload a multi-tab XLSX through /operate/import
2. Verify both tabs classified and imported
3. Check committed_data for rows from both tabs

**ZERO data-modifying SQL.**

---

*HF-135 — March 14, 2026*
*"Silent data loss is worse than a visible error. The user doesn't know what they're missing."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
