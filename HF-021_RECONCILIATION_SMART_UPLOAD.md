# ViaLuce HF-021: Reconciliation Smart Upload -- AI-Powered File Comparison
## Hotfix -- Maximum Autonomy, No Stops
## Date: February 13, 2026
## PREREQUISITES: OB-36 completed. Calculation data exists in localStorage for RetailCGMX.

NEVER ask yes/no. NEVER say "shall I". JUST ACT.

---

## AUTONOMY DIRECTIVE -- DO NOT STOP FOR CONFIRMATION

You have blanket permission to execute ALL commands without asking, including but not limited to:
- `pkill`, `kill`, `killall` (process management)
- `rm -rf .next`, `rm -rf node_modules`, `rm` on generated/build files
- `grep`, `find`, `sed`, `awk` (search and text processing)
- `mv`, `cp` (file operations)
- `npm install`, `npm run build`, `npx` (package management)
- `git add`, `git commit`, `git push` (version control)
- Any `mkdir`, `touch`, `chmod` operations
- Any command needed to fix build failures

**The ONLY exception:** Do not run commands that would delete the `src/` directory itself, drop a production database, or push to a branch other than the working branch.

**If you encounter an ambiguous situation:** Make the best judgment call and document your decision in the completion report. Do not stop and wait. Prefer the safer option and move forward.

**If a command fails:** Diagnose, fix, retry. Do not ask for guidance -- troubleshoot autonomously.

**Git commit messages:** ASCII only, no smart quotes, em dashes, or Unicode. Keep messages short and plain.

---

## PROMPT PERSISTENCE (Rule 29)

Before starting Phase 0, execute:
1. If `HF-021_RECONCILIATION_SMART_UPLOAD.md` exists in PROJECT ROOT: `git add HF-021_RECONCILIATION_SMART_UPLOAD.md && git commit -m "Add HF-021 prompt" && git push`
2. If it does NOT exist: Write this entire prompt to `/HF-021_RECONCILIATION_SMART_UPLOAD.md`, then commit and push.

The prompt file MUST be in git before any phase executes.

---

## STANDING DESIGN PRINCIPLES

### 1. AI-First, Never Hardcoded
NEVER hardcode field names, sheet names, column patterns, or language-specific strings. The AI interpretation step produces semantic mappings. All downstream code reads those mappings. Every solution must work for ANY customer, ANY language, ANY format.

**Korean Test:** If a Korean company uploaded their legacy compensation export with Hangul column headers and a completely different structure, would the reconciliation still work? If no, it is hardcoded.

### 2. Fix Logic, Not Data
Never provide answer values. Systems derive correct results from source material.

### 3. Be the Thermostat, Not the Thermometer
Act on data: recommend, alert, adjust. The reconciliation must not just show variance numbers -- it must flag anomalies, explain patterns, and recommend next actions.

### 4. Prove, Don't Describe
Show evidence. Every variance traces back to source data cells on both sides (VL calculation and uploaded file).

### 5. Carry Everything, Express Contextually
Parse and preserve ALL columns from the uploaded file. Let the AI mapping determine which columns are relevant. Do not discard unrecognized columns -- they may be useful for drill-down context.

---

## CC OPERATIONAL RULES

1. Always commit + push after changes
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`
3. Git commit messages: ASCII only
4. Completion reports and proof gates saved to PROJECT ROOT (same level as package.json). NOT in src/, NOT in docs/.
5. NEVER ask yes/no. NEVER say "shall I". Just act.
6. AI SERVICE IS THE ONLY WAY TO CALL AI: All AI calls go through AIService. No direct Anthropic API calls from feature code.
7. EVERY AI CALL CAPTURES A TRAINING SIGNAL.
8. If a phase fails after 3 attempts, document the failure analysis and move to the next phase.

## ANTI-PATTERN RULES

9. NO PLACEHOLDERS: Never substitute hardcoded values for data from upstream sources
10. CONTRACT-FIRST: Read consumer code before implementing producer
11. TRACE BEFORE FIX: Trace full data flow before writing any fix
12. READ CODE FIRST: Start by reading source, not adding logs
13. NO SILENT FALLBACKS: Missing data equals visible error, not silent zero. If AI fails, show the failure -- do not silently fall back to heuristics and pretend it was AI.
14. NO EMPTY SHELLS: Pages with only empty state plus upload button are not deliverable.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits, Files Created, Files Modified, Hard Gates (verbatim plus evidence), Soft Gates, Compliance, Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## THE VIOLATION

The reconciliation upload currently expects a specific file format. The system dictates what file structure the user must provide. This violates AI-First, Never Hardcoded. The platform must accept ANY file the user uploads -- any format, any language, any column naming convention -- and use AI to determine what the data means, map it to calculation results, and run the comparison. This is the same principle as plan import: upload anything, the platform figures it out.

---

## PHASE 0: RECONNAISSANCE (No commit -- read only)

Before writing any code, read these files to understand current state:

```bash
# Reconciliation page
cat src/app/operate/reconcile/page.tsx

# Find all reconciliation-related files
find src -path "*reconcil*" -name "*.ts" -o -path "*reconcil*" -name "*.tsx" | sort

# Read reconciliation service(s)
for f in $(find src -path "*reconcil*service*" -name "*.ts"); do echo "=== $f ==="; cat "$f"; done

# Read forensics reconciliation if it exists
for f in $(find src -path "*forensic*reconcil*" -name "*.ts" -o -path "*forensic*reconcil*" -name "*.tsx"); do echo "=== $f ==="; cat "$f"; done

# How does the file upload currently work
grep -rn "parseFile\|readFile\|handleUpload\|onDrop\|FileReader\|SheetJS\|XLSX\|Papa" src/app/operate/reconcile/ --include="*.tsx" | head -20

# What format does it currently expect
grep -rn "column\|header\|field\|mapping\|employeeId\|Employee\|expected" src/app/operate/reconcile/ --include="*.tsx" --include="*.ts" | head -25

# Does AI mapping exist for reconciliation
grep -rn "AIService\|aiService\|mapColumns\|columnMapping" src/ --include="*.ts" | grep -i reconcil | head -10

# How are calculation results stored
grep -rn "getCalculationResults\|getLatestRun\|calculation_run" src/lib/calculation/ --include="*.ts" | head -15

# Batch ID structure
grep -rn "batchId\|batch_id\|run\.id\|runId" src/app/operate/reconcile/ --include="*.tsx" | head -10

# Active plan components (needed for AI mapping context)
grep -rn "getActivePlan\|planComponents\|component.*name" src/lib/calculation/ --include="*.ts" | head -10
```

Document what you find. Understand the full reconciliation architecture before changing anything.

---

## PHASE 1: Smart File Parser

Create or enhance the file upload handler to accept ANY tabular file format.

**Supported formats:** CSV, TSV, XLSX, XLS, JSON. Auto-detect from file extension and content.

**Implementation:**
- Use SheetJS (already available) for Excel formats
- Use Papaparse (already available) for CSV/TSV
- For JSON: detect if array of objects
- For multi-sheet Excel: show sheet selector, let user pick which sheet contains the comparison data
- Extract: column headers (first row or detected header row) and all data rows
- Preserve ALL columns -- do not discard anything at parse time

**After parsing, display:**
- File name, format detected, row count, column count
- Preview table: first 5 rows with all columns visible
- "Mapping columns..." loading state before AI call

**PROOF GATE 1:** Upload an XLSX file with arbitrary column names. The parser extracts headers and rows. Preview table shows first 5 rows. No format-specific validation rejects the file.

---

## PHASE 2: AI Column Mapping

After file is parsed, call AIService to classify columns.

**AI Prompt Construction:**

```
System: You are a compensation data analyst. Given column headers and sample data 
from a file uploaded for reconciliation comparison, identify which columns contain:
1. Employee identifier (numeric ID, employee number, badge number, etc.)
2. Total payout/compensation amount (if present)
3. Individual component payout amounts and which plan component they correspond to

Context:
- Tenant plan components: {list component names from active plan}
- Tenant locale: {tenant locale}
- Column headers: {headers from parsed file}
- Sample data (first 3 rows): {sample rows}

Return ONLY valid JSON:
{
  "employeeIdColumn": { "header": "...", "confidence": 0.95 },
  "totalColumn": { "header": "...", "confidence": 0.90 } | null,
  "componentMappings": [
    { "sourceHeader": "...", "planComponent": "...", "confidence": 0.85 }
  ]
}
```

**Requirements:**
- Call MUST go through AIService (Rule 6)
- Call MUST capture training signal (Rule 7)
- If AIService is unavailable or returns error: show visible error "AI mapping unavailable -- please map columns manually" with manual dropdown selectors per column. Do NOT silently fall back to heuristics with fake confidence scores.
- If AI returns low confidence (<0.5) on employee ID column: flag for manual selection

**PROOF GATE 2:** Upload a file. Console shows AI call through AIService. Column mapping suggestions appear with confidence scores. If AI unavailable, manual mapping UI appears (not silent fallback).

---

## PHASE 3: User Confirmation Dialog

Show the AI's suggested mapping in a confirmation dialog before running comparison.

**Dialog layout:**

```
Column Mapping -- Confirm or Adjust

Employee ID:  [dropdown: column headers]  <-- AI suggested: "No. Empleado" (95%)
Total Payout: [dropdown: column headers]  <-- AI suggested: "Total" (90%)

Component Mappings:
  Store Sales     <-->  [dropdown]  <-- AI suggested: "Comision Venta" (85%)
  New Customers   <-->  [dropdown]  <-- AI suggested: "Bono Clientes" (82%)
  Collections     <-->  [dropdown]  <-- AI suggested: "Cobranza" (78%)
  ...

[Cancel]  [Confirm and Run Comparison]
```

**Requirements:**
- Each mapping shows the AI's suggestion with confidence percentage
- User can override any mapping via dropdown
- Dropdowns list all column headers from the uploaded file
- Option to mark a component as "Not in file" (skip that component comparison)
- High confidence (>0.8): pre-selected, green indicator
- Medium confidence (0.5-0.8): pre-selected, amber indicator
- Low confidence (<0.5): NOT pre-selected, red indicator, user must choose
- User overrides generate a corrective training signal back to AIService

**PROOF GATE 3:** Mapping dialog appears with dropdowns. AI suggestions pre-filled with confidence indicators. User can change a mapping and click confirm.

---

## PHASE 4: Comparison Engine

Once mappings are confirmed, run the comparison.

**Matching logic:**
- Match uploaded rows to calculation results by Employee ID (using the mapped column)
- Normalize IDs: trim whitespace, handle leading zeros, string-to-number coercion
- Track three populations: matched (in both), VL-only (in calculation but not file), file-only (in file but not calculation)

**Per-employee comparison:**
- Total payout: VL total vs uploaded total (if total column mapped)
- Per-component: VL component payout vs uploaded component payout (for each mapped component)
- Delta: absolute difference
- Delta %: percentage difference (relative to uploaded/expected value)
- Flag: exact match (<0.01 difference), within tolerance (configurable, default 5%), amber (5-15%), red (>15%)

**Summary statistics:**
- Total employees compared
- Match rate (exact + within tolerance)
- Total VL payout vs total uploaded payout
- Aggregate delta and delta %
- Count by flag category (exact, tolerance, amber, red)
- Employees only in VL / only in file

**PROOF GATE 4:** After confirming mappings, comparison results appear. Summary shows match rate and total variance. Employee-level table shows delta and flag per employee. Three populations (matched, VL-only, file-only) are reported.

---

## PHASE 5: Results Display and Export

**Results page layout:**

**Summary Cards (top):**
- Employees Compared: N matched / N VL-only / N file-only
- Match Rate: X% (exact + within tolerance)
- Total Payout -- VL: $X / Uploaded: $Y / Delta: $Z (delta %)
- Flagged: N amber, N red

**Employee Table:**
- Sortable columns: Employee ID, Name (if available), VL Total, Uploaded Total, Delta, Delta %, Flag
- Flag column uses Wayfinder Layer 2 state communication (attention treatment, NOT stoplight red/yellow/green)
- Default sort: largest absolute delta descending (worst mismatches first)
- Expandable rows: click to show per-component breakdown
- Component breakdown: Component Name, VL Amount, Uploaded Amount, Delta, Delta %

**Export:**
- "Export Comparison" button generates downloadable CSV or XLSX
- Export includes: all employee rows, all component breakdowns, summary statistics
- File name: "{tenant}_{period}_reconciliation_{date}.xlsx"

**Currency:**
- ALL monetary values use tenant-configured currency via useCurrency() hook
- No hardcoded $ or USD

**PROOF GATE 5:** Results display with summary cards, sortable employee table, expandable per-component rows, and working export button. Currency displays in tenant-configured format (MXN for RetailCGMX).

---

## PHASE 6: Batch Selector Human-Readable Labels

The batch/calculation run selector dropdown on the reconciliation page currently shows raw IDs:
`period-1770819809919-blg90n - preview ($1,232,280.55)`

**Fix:**

Create a display label formatter that reads batch metadata:

```typescript
function formatBatchLabel(run: CalculationRun): string {
  const period = formatPeriodLabel(run.period); // "Jan 2024" or "Enero 2024"
  const state = run.lifecycleState; // "Preview", "Official", "Approved"
  const total = formatCurrency(run.totalPayout);
  return `${period} -- ${state} (${total})`;
}
```

**Result:** "Jan 2024 -- Preview (MX$1,232,280.55)"

Apply this formatter to:
- Reconciliation page batch selector
- Any other location where batch/run IDs are displayed to users

**PROOF GATE 6:** Batch selector dropdown shows "Jan 2024 -- Preview (MX$1,232,280.55)" not raw period ID strings.

---

## WAYFINDER COMPLIANCE

### Layer 2 (State Communication):
- Exact match: healthy treatment (subtle, confident)
- Within tolerance: neutral (no special treatment)
- Amber flag (5-15%): attention treatment (warm highlight, not yellow)
- Red flag (>15%): elevated attention (distinct from amber, not red background)
- NO stoplight red/yellow/green color scheme

### Layer 3 (Interaction Patterns):
- Table rows are expandable (click to drill into components)
- Summary cards are glanceable (no interaction required for top-level read)
- Export is one-click (no configuration dialog)

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `HF-021_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Smart file parser | Upload XLSX/CSV with arbitrary columns. Parser extracts headers and rows. Preview shows first 5 rows. |
| HG-2 | AI column mapping | AI call fires through AIService with training signal capture. Mapping suggestions appear with confidence. |
| HG-3 | Fallback visible | If AIService unavailable, manual mapping UI appears. No silent heuristic fallback with fake confidence. |
| HG-4 | User confirmation | Mapping dialog with dropdowns, confidence indicators, and confirm button. User can override. |
| HG-5 | Comparison runs | After mapping confirmation, employee-level variance table appears with delta and flag per employee. |
| HG-6 | Three populations | Matched, VL-only, and file-only employee counts reported. |
| HG-7 | Per-component drill | Expanding an employee row shows per-component VL vs uploaded breakdown. |
| HG-8 | Export works | Export button generates downloadable file with all comparison data. |
| HG-9 | Currency correct | All monetary values use tenant currency (MXN for RetailCGMX). No hardcoded USD. |
| HG-10 | Batch label readable | Dropdown shows "Jan 2024 -- Preview (MX$1,232,280.55)" not raw IDs. |
| HG-11 | Korean Test | No hardcoded column names, field patterns, or language-specific matching in comparison engine. All mapping via AI or user selection. |
| HG-12 | Build passes | `npm run build` exits 0. |
| HG-13 | Server responds | localhost:3000 returns 200 after final build. |
| HG-14 | Completion report | `HF-021_COMPLETION_REPORT.md` exists in project root and is committed to git. |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | Training signal on override | User overriding an AI mapping suggestion generates a corrective training signal. |
| SG-2 | Multi-sheet selector | XLSX files with multiple sheets show a sheet picker before parsing. |
| SG-3 | Thermostat summary | Results include an AI-generated summary: "N employees match within tolerance. The largest discrepancy is Employee X at Y% on component Z. Recommend reviewing data source for [reason]." |
| SG-4 | Wayfinder flags | Variance flags use attention patterns, not stoplight colors. |

---

## EXECUTION ORDER

```
Phase 0: Reconnaissance (read only, no commit)
Phase 1: Smart file parser (any format, preview table)
Phase 2: AI column mapping (AIService call, confidence scores)
Phase 3: User confirmation dialog (dropdowns, override capability)
Phase 4: Comparison engine (match, variance, three populations)
Phase 5: Results display and export
Phase 6: Batch selector human-readable labels
```

After Phase 6: Write completion report, commit, final build, confirm server, push.

---

*ViaLuce.ai -- The Way of Light*
*HF-021: Reconciliation Smart Upload -- AI-Powered File Comparison*
*February 13, 2026*
