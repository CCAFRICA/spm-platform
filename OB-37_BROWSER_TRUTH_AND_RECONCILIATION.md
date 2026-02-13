# ViaLuce OB-37: Browser Truth and Reconciliation
## Overnight Batch -- Maximum Autonomy, No Stops
## Date: February 13, 2026
## PREREQUISITES: OB-34, OB-35, OB-36 must have been run. HF-021 must have been run.

NEVER ask yes/no. NEVER say "shall I". JUST ACT.

---

## AUTONOMY DIRECTIVE -- DO NOT STOP FOR CONFIRMATION

This is an unattended overnight batch. No human is present to confirm commands.

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

**If you encounter an ambiguous situation:** Make the best judgment call and document your decision in the completion report. Do not stop and wait.

**If a command fails:** Diagnose, fix, retry. Do not ask for guidance -- troubleshoot autonomously.

**Git commit messages:** ASCII only, no smart quotes, em dashes, or Unicode. Keep messages short and plain.

---

## WHY THIS BATCH EXISTS

CLT-19 browser testing revealed that HF-019 (Language Selector), HF-020 (Perform Page Wiring), and HF-021 (Reconciliation Smart Upload) all failed or partially failed in the browser. OB-36 reported 18/18 hard gates PASS, but browser testing shows Mission Control (Cycle, Queue, Pulse) is not wired to real data, the language selector does not control page content, and the Perform workspace shows empty state despite existing calculation data. The Demo User persona switcher has no return-to-admin escape route.

This batch addresses everything found in CLT-19. The priority order is:
1. **Reconciliation (CRITICAL)** -- the comparison engine must work correctly
2. **Language system** -- unified locale that actually controls all UI text
3. **Mission Control data wiring** -- Cycle/Queue/Pulse must read real state
4. **Perform page** -- must display existing calculation data
5. **UX fixes** -- Demo User escape, currency, batch labels, file formats

---

## STANDING DESIGN PRINCIPLES

Read `/CLEARCOMP_STANDING_PRINCIPLES.md` before starting. These are non-negotiable:

### 1. AI-First, Never Hardcoded
NEVER hardcode field names, sheet names, column patterns, or language-specific strings. The AI interpretation step produces semantic mappings. All downstream code reads those mappings. Every solution must work for ANY customer, ANY language, ANY format.

**Korean Test:** If a Korean company uploaded data in Hangul with completely different column names, would this code still work? If no, it is hardcoded.

### 2. Fix Logic, Not Data
Never provide answer values. Systems derive correct results from source material.

### 3. Be the Thermostat, Not the Thermometer
Act on data: recommend, alert, adjust. Every feature answers: What happened? Why? What should I do about it?

### 4. Closed-Loop Learning
Every AI call captures a training signal. Every user interaction generates a learning event.

### 5. Maximum Configurability
Build configurable systems. Not one customer's requirements.

### 6. Prove, Don't Describe
Show evidence. Every number traces to source.

### 7. Carry Everything, Express Contextually
Preserve ALL data at import. Let context activate what is needed at calculation time. AI classification is metadata, not a filter.

### 8. Calculation Sovereignty
Calculation reads committed data plus the active plan at runtime. Never depends on import-time logic.

### 9. Wayfinder Compliance
Every UI element follows the three-layer Unified Visual Language:
- Layer 1 (Wayfinding): Module identity in the environment, not on the data
- Layer 2 (State Communication): Status expressed on data elements using opacity, completeness, and attention patterns -- NOT stoplight red/yellow/green
- Layer 3 (Interaction Patterns): Core patterns shared platform-wide, module extensions adapt to context

---

## CC OPERATIONAL RULES

1. Always commit + push after changes
2. After every commit: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`
3. VL Admin language lock REMOVED -- all users including VL Admin select their preferred language. Do NOT force English for any role.
4. Git commit messages: ASCII only
5. Completion reports and proof gates saved to PROJECT ROOT (same level as package.json). NOT in src/, NOT in docs/.
6. NEVER ask yes/no. NEVER say "shall I". Just act.
7. Never provide CC with answer values -- fix logic not data
8. OB closing: after final commit, kill dev server, rm -rf .next, npm run build, npm run dev, confirm localhost:3000 responds before writing completion report

## ANTI-PATTERN RULES

9. NO PLACEHOLDERS: Never substitute hardcoded values for data from upstream sources
10. CONTRACT-FIRST: Read consumer code before implementing producer
11. TRACE BEFORE FIX: Trace full data flow before writing any fix
12. READ CODE FIRST: Start by reading source, not adding logs
13. THINK IN DATA SHAPES: Document data before/after for any change
14. NO SILENT FALLBACKS: Missing data equals visible error, not silent zero
15. NO FABRICATED EXAMPLES: All data in reports must come from actually running code
16. STATE-AWARE: Ask "what OLD data might interfere?"
17. LIFECYCLE-AWARE: Know status lifecycles (draft, active, archived)
18. CRITERIA ARE IMMUTABLE: You may NOT modify, remove, replace, or reword any proof gate criterion. If a criterion cannot be met, report it as FAIL with explanation.
19. NO EMPTY SHELLS: Pages with only empty state plus import button are not deliverable.
20. DEMO VALIDATES PIPELINE: Demo data flows through real import pipelines, not direct localStorage writes.
21. DYNAMIC COLUMNS: Column count derived from plan components at runtime, never hardcoded to a specific number.
22. AI SERVICE IS THE ONLY WAY TO CALL AI: All AI calls go through AIService. No direct Anthropic API calls from feature code.
23. EVERY AI CALL CAPTURES A TRAINING SIGNAL.
24. If a phase fails after 3 attempts, document the failure analysis and move to the next phase.

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits, Files Created, Files Modified, Hard Gates (verbatim plus evidence), Soft Gates, Compliance, Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.
29. Prompt file committed to git before work begins.

---

## PHASE 0: RECONNAISSANCE (No commit -- read only)

Before writing any code, read ALL of these files. You must understand the current state completely before changing anything.

```bash
echo "=== RECONCILIATION PAGE ==="
cat src/app/operate/reconcile/page.tsx

echo "=== ALL RECONCILIATION FILES ==="
find src -path "*reconcil*" -name "*.ts" -o -path "*reconcil*" -name "*.tsx" | sort
for f in $(find src -path "*reconcil*" -name "*.ts" -o -path "*reconcil*" -name "*.tsx" | sort); do echo "=== $f ==="; wc -l "$f"; head -30 "$f"; echo "---"; done

echo "=== LANGUAGE/LOCALE SYSTEM ==="
grep -rn "locale\|i18n\|language\|setLanguage\|useLocale\|LOCALE" \
  src/lib/ src/contexts/ src/components/ \
  --include="*.ts" --include="*.tsx" | head -40

echo "=== LOCALE CONTEXT ==="
find src -path "*locale*" -o -path "*i18n*" -o -path "*language*" | grep -v node_modules | sort
for f in $(find src -path "*locale*context*" -o -path "*language*context*" | grep -v node_modules); do echo "=== $f ==="; cat "$f"; done

echo "=== MISSION CONTROL ==="
cat src/components/navigation/mission-control/CycleIndicator.tsx
cat src/components/navigation/mission-control/QueuePanel.tsx
cat src/components/navigation/mission-control/PulsePanel.tsx

echo "=== COMPENSATION CLOCK SERVICE ==="
find src -path "*compensation-clock*" -o -path "*CompensationClock*" | sort
for f in $(find src -path "*compensation-clock*" -name "*.ts"); do echo "=== $f ==="; cat "$f"; done

echo "=== LIFECYCLE SERVICE ==="
cat src/lib/calculation/calculation-lifecycle-service.ts

echo "=== PERFORM PAGE ==="
cat src/app/perform/page.tsx
find src/app/perform -name "*.tsx" | sort
for f in $(find src/app/perform -name "*.tsx"); do echo "=== $f ==="; head -50 "$f"; done

echo "=== DEMO USER ==="
grep -rn "Demo.*User\|demo.*user\|demo-selector\|persona.*switch" src/components/ --include="*.tsx" | head -15

echo "=== CURRENCY ==="
grep -rn "formatCurrency\|useCurrency\|\\\$\\\$\{" src/ --include="*.tsx" | head -20
grep -rn "\\$.*toLocaleString\|US\\\$\|USD\|\\\$.*Math\\.abs" src/ --include="*.tsx" | head -20

echo "=== API KEY WIRING ==="
grep -rn "ANTHROPIC_API_KEY\|api.*key\|apiKey.*anthropic" src/ --include="*.ts" --include="*.tsx" | head -15
grep -rn "NEXT_PUBLIC_ANTHROPIC\|ANTHROPIC" .env.local .env 2>/dev/null | head -10

echo "=== CALCULATION RESULTS IN LOCALSTORAGE ==="
grep -rn "calculation_run\|calculationRun\|getCalculation\|getLatestRun\|calculation.*result" src/lib/ --include="*.ts" | head -20

echo "=== BATCH ID DISPLAY ==="
grep -rn "batchId\|batch_id\|BatchSelector\|period-.*blg\|run\.id" src/ --include="*.tsx" | head -15

echo "=== FILE UPLOAD PARSERS ==="
grep -rn "\.txt\|\.tsv\|text/plain\|text/tab\|accept=" src/app/operate/reconcile/ --include="*.tsx" | head -10
grep -rn "parseFile\|SheetJS\|XLSX\|Papa" src/ --include="*.ts" --include="*.tsx" | head -15
```

**CRITICAL: Document what you find in each area before proceeding. Write a summary of the current state as a commit message for Phase 0 (no code changes, just a README note if needed).**

---

## MISSION A: RECONCILIATION FIX (Phases 1-4)

### THE PROBLEM

CLT-19 browser testing revealed:
1. AI column mapping fails because Anthropic API key is not wired to the environment
2. Manual fallback mapping shows hardcoded field names (`Venta_Individual`, `Pago_Total_Incentivo`) instead of the uploaded file's actual column headers
3. Comparison engine produces zero matches (0/2134 employees, $0 calculated vs $3.6M benchmark)
4. Currency displays hardcoded `$` instead of tenant-configured MXN
5. `.txt` file format not accepted in upload
6. Inline locale strings (`locale === 'es-MX' ? 'Spanish...' : 'English...'`) instead of unified locale system
7. Wayfinder violation: stoplight colors on variance flags

### PRDAB CASCADE -- LOCKED DECISIONS

**Principles:** AI-First (Korean Test), Fix Logic Not Data, Prove Don't Describe, Wayfinder Compliance
**Reasoning:** The reconciliation page must compare ANY uploaded file against ANY calculation run. BOTH sides are dynamic. The uploaded file's columns are unknown. The calculation run's components are plan-derived. AI maps the uploaded file's columns to the calculation run's components. The user confirms or overrides.
**Decisions:**
- Manual fallback dropdowns MUST list the actual column headers from the parsed file -- NEVER hardcoded field names
- Comparison engine matches by the user-confirmed employee ID column, not a hardcoded key
- Per-employee total and per-component deltas come from the confirmed column mappings
- Currency uses `formatCurrency()` with tenant locale throughout
- All UI text reads from the locale context, not inline ternary operators

### Phase 1: Fix File Parser and Format Support

Read the current file parser. Extend to support `.txt` (tab-delimited) alongside CSV, TSV, XLSX, XLS, JSON.

The upload input's `accept` attribute must include `.txt`. When a `.txt` file is uploaded, try tab-delimited parsing first, then comma-delimited, then fixed-width.

After parsing, the component state must store:
- `parsedHeaders: string[]` -- the ACTUAL column headers from the file
- `parsedRows: any[][]` -- all data rows
- `fileInfo: { name, format, rowCount, columnCount }`

**PROOF GATE 1:** Upload a `.txt` tab-delimited file. Parser detects format and renders preview with correct headers and rows.

**Commit:** `OB-37-1: File parser extended for .txt format`

### Phase 2: Fix Manual Column Mapping

This is the critical fix. The current manual mapping dropdowns show hardcoded field names. They MUST show the actual column headers from `parsedHeaders`.

Read the mapping UI component. Find where dropdown options are defined. Replace hardcoded options with `parsedHeaders` from Phase 1.

**The dropdown for Employee ID** should list ALL column headers from the parsed file. AI suggestion (if available) pre-selects one with confidence indicator. If AI unavailable, no pre-selection -- user must choose.

**The dropdown for Amount/Total** should list ALL column headers. Same logic.

**Component mapping** (if implemented): Each plan component gets a dropdown listing ALL column headers. AI suggests which column maps to which component.

**CRITICAL CHECK:** Search for ANY hardcoded field names in the reconciliation code:
```bash
grep -rn "Venta_Individual\|Pago_Total\|num_empleado\|No_Tienda\|Cumplimiento\|Meta_Individual" src/app/operate/reconcile/ --include="*.tsx" --include="*.ts"
```
If ANY results appear, those are Korean Test violations. Remove them ALL. Replace with dynamic references to `parsedHeaders`.

**PROOF GATE 2:** Manual mapping dropdowns show ALL column headers from the uploaded file (e.g., `num_empleado`, `No_Tienda`, `Puesto`, `Mes`, `Ano`, `Fecha_Corte`, `Rango_Tienda`, `Venta_Individual`, `Meta_Individual`, `Cumplimiento`, `Incentivo`, etc. -- all 30 columns). ZERO hardcoded field names in the dropdown options.

**Commit:** `OB-37-2: Manual mapping reads actual file headers, zero hardcoded fields`

### Phase 3: Fix Comparison Engine

The comparison engine must:

1. **Read the selected Employee ID column** from user-confirmed mapping (not hardcoded `employeeId` or `num_empleado`)
2. **Read the selected Amount column** from user-confirmed mapping
3. **Read calculation results** from localStorage for the selected batch/period
4. **Match employees** by normalizing the ID values: trim whitespace, convert to string, handle leading zeros
5. **Compute per-employee deltas**: uploaded amount vs calculated total payout
6. **Categorize**: exact (<$0.01), tolerance (<5%), amber (5-15%), red (>15%)
7. **Track three populations**: matched (in both), VL-only (in calculation but not file), file-only (in file but not calculation)

**CRITICAL:** Trace how calculation results are stored and retrieved. The current zero-match problem likely means the comparison engine is reading from the wrong localStorage key, or the employee IDs in the calculation results don't match the format in the uploaded file.

```bash
# Trace calculation result storage
grep -rn "localStorage.*set.*calc\|setItem.*calc\|calculation.*store\|saveCalculation" src/lib/ --include="*.ts" | head -15

# Trace calculation result retrieval in reconciliation
grep -rn "localStorage.*get.*calc\|getItem.*calc\|calculation.*load\|getCalculation" src/app/operate/reconcile/ --include="*.tsx" --include="*.ts" | head -15
grep -rn "localStorage.*get.*calc\|getItem.*calc\|calculation.*load\|getCalculation" src/lib/ --include="*.ts" | grep -i reconcil | head -10
```

Document the data shape of stored calculation results. Document the data shape of parsed file rows. Show how the employee ID matching works (or fails).

**PROOF GATE 3:** After selecting `num_empleado` as Employee ID and `Pago_Total_Incentivo` as Amount, running comparison produces non-zero matches. The match count should be >0 (ideally close to 719, the known employee population in calculation results). If calculation results contain employee IDs, and the uploaded file contains employee IDs, and the user correctly maps the columns, matches MUST appear.

**Commit:** `OB-37-3: Comparison engine reads confirmed mappings and matches employees`

### Phase 4: Reconciliation Currency and Locale Fix

1. Replace ALL hardcoded `$` with `formatCurrency()` using tenant locale
2. Replace ALL inline `locale === 'es-MX' ? 'Spanish...' : 'English...'` with locale context translation keys
3. Replace stoplight colors (red/amber/green backgrounds) with Wayfinder Layer 2 attention patterns
4. Batch selector label: read period metadata and lifecycle state to display human-readable label (e.g., "Enero 2024 -- Preview | 719 empleados") instead of raw UUID

```bash
# Find all hardcoded currency in reconciliation
grep -rn "\\\$\\\${\|\\$.*toLocaleString\|\\$.*Math\\.abs\|US\\\$" src/app/operate/reconcile/ --include="*.tsx" | head -20

# Find all inline locale ternaries
grep -rn "locale.*===.*es-MX\|locale.*===.*en" src/app/operate/reconcile/ --include="*.tsx" | head -20

# Find stoplight colors
grep -rn "bg-red\|bg-amber\|bg-emerald\|bg-green" src/app/operate/reconcile/ --include="*.tsx" | head -20
```

**PROOF GATE 4:** All currency displays use tenant currency format (MXN for RetailCGMX). Zero inline locale ternaries in reconciliation page. Batch dropdown shows human-readable period label. Variance indicators use Wayfinder attention patterns, not stoplight.

**Commit:** `OB-37-4: Reconciliation currency, locale, Wayfinder compliance`

---

## MISSION B: UNIFIED LOCALE SYSTEM (Phase 5)

### THE PROBLEM

The language selector in the header shows "English" but the page renders Spanish. Clicking the selector does not change page content. Multiple language systems coexist: some components read from locale context, some use inline ternaries, some ignore locale entirely.

### Phase 5: Unified Locale Architecture

1. **Diagnose:** Find the locale context provider. Find every place that reads locale. Find every place that ignores it.

```bash
# The locale context
grep -rn "LocaleContext\|LocaleProvider\|useLocale\|setLocale" src/ --include="*.ts" --include="*.tsx" | head -30

# Components using inline ternaries instead of context
grep -rn "locale.*===.*es\|lang.*===.*en\|language.*===\|=== 'es-MX'" src/ --include="*.tsx" | head -30

# Components that should read locale but might not
grep -rn "Buscar\|Comparar\|Ejecutar\|Subir\|Seleccionar\|Rendimiento\|Operar" src/ --include="*.tsx" | head -20
```

2. **Fix the flow:**
   - Language selector click MUST call `setLocale()` on the unified locale context
   - ALL UI text components MUST read from this context
   - Create a translation dictionary if one does not exist: `src/lib/i18n/translations.ts` with keys for ALL UI strings in `en` and `es` (at minimum)
   - Every component rendering UI text should call a `t()` or `useTranslation()` function that reads the current locale and returns the correct string
   - Data values (employee names, plan names, file column headers, metric values) stay in their original language -- ONLY UI chrome translates

3. **Scope:** This does not require translating every string in the entire app in one phase. Focus on:
   - Navigation rail workspace names
   - Mission Control labels (Cycle, Queue, Pulse section headers)
   - Page titles and section headers for: Operate, Perform, Reconciliation, Investigate
   - Button text on reconciliation page
   - Empty state messages
   - The selector itself must reflect the actual current state

**PROOF GATE 5:** Click language selector to English. All workspace names, page titles, button text, and section headers render in English. Click selector to Spanish. All switch to Spanish. No page requires a refresh. The selector icon/label matches the active locale.

**Commit:** `OB-37-5: Unified locale system with translation dictionary`

---

## MISSION C: MISSION CONTROL DATA WIRING (Phases 6-8)

### THE PROBLEM

OB-36 created the CompensationClockService and rewired the Cycle, Queue, and Pulse components. But CLT-19 shows:
- Cycle shows "February 2026 / Import Commission Plan / Progress 0%" despite calculations existing
- Queue shows static "Import Commission Plan" item despite plan already imported
- Pulse shows dashes for Active Tenants, Total Users, Outstanding Issues

The service exists but is not reading real data from localStorage.

### Phase 6: Cycle Data Wiring

1. Read `CompensationClockService`. Trace how it reads lifecycle state.
2. Read `calculation-lifecycle-service.ts`. Trace how lifecycle state is stored.
3. Find the disconnect: does the Cycle read the correct localStorage key? Does it parse the lifecycle state correctly? Is the lifecycle state even being written when calculations run?

```bash
# How lifecycle state is stored
grep -rn "lifecycle.*state\|setLifecycle\|LIFECYCLE\|lifecycle.*storage" src/lib/calculation/ --include="*.ts" | head -15

# How CompensationClockService reads it
grep -rn "lifecycle\|getLifecycle\|cycleState" src/lib/navigation/compensation-clock-service.ts | head -15

# How CycleIndicator consumes the service
grep -rn "CompensationClock\|getCycleState\|cycleState" src/components/navigation/mission-control/CycleIndicator.tsx | head -10
```

**Fix:** Ensure the data chain is complete: calculation run writes lifecycle state to storage -> CompensationClockService reads lifecycle state -> CycleIndicator renders from service.

If RetailCGMX has calculation data in localStorage from prior sessions, the Cycle MUST show a state beyond "Import Commission Plan." It should show at least "Preview" or "Official" depending on what calculations have been run.

**PROOF GATE 6:** For RetailCGMX tenant with existing calculation data, Cycle shows a lifecycle state that reflects the actual data (e.g., "Preview" or "Official"), not "Import Commission Plan" with 0% progress.

**Commit:** `OB-37-6: Cycle reads real lifecycle state from calculation data`

### Phase 7: Queue Event-Driven Wiring

1. Queue MUST NOT show "Import Commission Plan" if a plan already exists in localStorage
2. Queue items should be derived from current state, not a static list
3. If calculations have been run, Queue should show post-calculation actions ("Review Results", "Submit for Approval")
4. If no actions are needed, Queue shows empty state: "All caught up"

```bash
# Current queue item generation
grep -rn "getQueueItems\|queueItems\|queue.*item" src/lib/navigation/ --include="*.ts" | head -15
cat src/lib/navigation/queue-service.ts | head -60
```

**PROOF GATE 7:** For RetailCGMX with imported plan and calculation data, Queue does NOT show "Import Commission Plan." Queue shows contextually appropriate items (or "All caught up" if no actions needed).

**Commit:** `OB-37-7: Queue event-driven from lifecycle state`

### Phase 8: Pulse Real Metrics

1. Pulse metrics for Platform Admin should show actual values from tenant data:
   - Active Tenants: count of tenants in config
   - Total Users: count of unique employees in calculation results (or "--" if no calculations)
   - Calculations Today: actual count from today's runs
   - Outstanding Issues: count from dispute/exception system (or 0)
2. All currency values use `formatCurrency()` with tenant locale

```bash
# Current Pulse metric generation
grep -rn "getPulseMetrics\|pulseMetrics\|pulse.*metric" src/lib/navigation/ --include="*.ts" | head -15
grep -rn "Active Tenant\|Total User\|Calculations\|Outstanding" src/components/navigation/mission-control/PulsePanel.tsx | head -10
```

**PROOF GATE 8:** Pulse shows at least one non-dash metric value for RetailCGMX (e.g., Calculations Today should show the count from prior sessions, or Active Tenants should show the actual count).

**Commit:** `OB-37-8: Pulse reads real metrics from data layer`

---

## MISSION D: PERFORM PAGE WIRING (Phase 9)

### THE PROBLEM

The Perform page shows "Compensation results are not yet available for this period" and "Team data will be available after running calculations" despite RetailCGMX having calculation data for 719 employees.

### Phase 9: Perform Page Data Connection

1. Trace how the Perform page checks for calculation data:

```bash
cat src/app/perform/page.tsx
grep -rn "calculation.*result\|compensation.*result\|not.*available\|not.*yet" src/app/perform/ --include="*.tsx" | head -15
grep -rn "getCalculation\|loadCalculation\|calculation.*data" src/app/perform/ --include="*.tsx" --include="*.ts" | head -15
```

2. Find what key the Perform page reads vs what key the calculation engine writes.
3. For Platform Admin: show aggregate view (total payout, employee count, component breakdown)
4. For Rep persona (Demo User): show personal compensation summary from their calculation trace
5. Quick Actions should link to real pages (View Compensation -> /perform/my-compensation, View Trends -> meaningful destination, Submit Inquiry -> dispute flow)

**PROOF GATE 9:** For RetailCGMX Platform Admin, the Perform page shows actual values in Compensation Summary (not "not yet available"). At minimum, total payout and employee count should appear. If the Perform page cannot read calculation data because of a key mismatch, document the exact key mismatch as diagnostic evidence.

**Commit:** `OB-37-9: Perform page reads calculation data from correct storage key`

---

## MISSION E: UX FIXES (Phases 10-12)

### Phase 10: Demo User Escape Hatch

The Demo User persona switcher (bottom-left overlay) lets you assume a persona but provides NO way to return to Platform Admin.

1. Find the Demo User component:
```bash
grep -rn "Demo.*User\|demo.*selector\|persona.*switch\|DemoUser" src/components/ --include="*.tsx" | head -15
```

2. Add a persistent "Exit Demo / Return to Admin" option that:
   - Is ALWAYS visible when a demo persona is active
   - Restores Platform Admin context on click
   - Clears any persona-specific view filters
   - Is visually distinct (not buried in a menu)

**PROOF GATE 10:** From Platform Admin, click Demo User, select "Sales Rep." The interface adapts to Sales Rep view. A visible "Return to Admin" or "Exit Demo" control is present. Clicking it returns to Platform Admin view.

**Commit:** `OB-37-10: Demo User persona has Return to Admin escape hatch`

### Phase 11: Global Currency Sweep

Search ALL `.tsx` files for hardcoded currency symbols. Replace with `formatCurrency()` or `useCurrency()`.

```bash
# Find hardcoded currency
grep -rn "\\\$[0-9]\|\\\${\|US\\\$\|\\\$.*toLocaleString\|\\\$.*toFixed\|\\$.*Math\\.abs" src/ --include="*.tsx" | grep -v node_modules | head -30

# Verify formatCurrency exists
grep -rn "export.*formatCurrency\|function formatCurrency" src/ --include="*.ts" | head -5
```

Every monetary value display MUST use the tenant-configured currency and locale. MXN for RetailCGMX. MXN for FRMX Demo. No hardcoded `$` anywhere in display components.

**PROOF GATE 11:** `grep -rn "\\\$\\\${\|US\\\$" src/ --include="*.tsx"` returns ZERO results in display components (formatting utility definitions are acceptable).

**Commit:** `OB-37-11: Global currency sweep -- all displays use formatCurrency`

### Phase 12: API Key Wiring for AIService

The console showed: `Error: Anthropic API key not configured`. The AIService needs the API key from environment variables.

1. Check how AIService reads the API key:
```bash
grep -rn "API_KEY\|apiKey\|ANTHROPIC" src/lib/ai/ --include="*.ts" | head -15
```

2. Verify `.env.local` has `NEXT_PUBLIC_ANTHROPIC_API_KEY` or equivalent
3. If the key is server-side only (not NEXT_PUBLIC_), ensure the AI calls go through a Next.js API route, not directly from the client
4. If the key IS present but AIService is reading the wrong env var name, fix the variable name
5. If the key is genuinely missing from the environment, the manual fallback (Phase 2 fix) handles the UX -- but document the wiring gap

**NOTE:** The manual fallback from Phase 2 must work perfectly regardless of API key status. AI is an enhancement, not a requirement. The manual path is the safety net.

**PROOF GATE 12:** AIService either successfully calls the API (if key is present) OR gracefully falls back to manual mapping with a visible user message (not a console-only error). The reconciliation page works correctly in BOTH paths.

**Commit:** `OB-37-12: AIService API key wiring diagnosis and fallback resilience`

---

## WAYFINDER COMPLIANCE

### Layer 1 (Wayfinding):
- Reconciliation page belongs to Operate workspace -- ambient treatment consistent with other Operate pages
- Perform workspace has its own ambient character distinct from Operate

### Layer 2 (State Communication):
- Variance indicators on reconciliation: use opacity and weight, NOT stoplight colors
  - Exact match: confident, full opacity
  - Within tolerance: neutral, normal weight
  - Amber flag: warm attention (subtle warm accent), not yellow background
  - Red flag: elevated attention (bold weight, warm accent intensified), not red background
- Lifecycle phases in Cycle: completed = full opacity, active = pulsing/bold, future = dim

### Layer 3 (Interaction Patterns):
- Table rows in reconciliation expandable (click for component detail)
- Summary cards glanceable (no interaction for top-level)
- Export one-click (no configuration dialog)
- Demo User switch and return are clear, single-click actions

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | .txt file upload | Upload a `.txt` tab-delimited file. Parser detects format and renders preview with correct headers and rows. |
| HG-2 | Dynamic column mapping | Manual mapping dropdowns show ALL column headers from the uploaded file. ZERO hardcoded field names. `grep -rn "Venta_Individual\|Pago_Total_Incentivo\|num_empleado" src/app/operate/reconcile/` returns ZERO results. |
| HG-3 | Comparison produces matches | After selecting correct Employee ID and Amount columns, comparison produces non-zero matched employees. |
| HG-4 | Reconciliation currency | All monetary values on reconciliation page use `formatCurrency()` with tenant currency. No hardcoded `$`. |
| HG-5 | Locale unified | Language selector toggles ALL UI text (workspace names, page titles, buttons, labels) between English and Spanish. No page refresh required. |
| HG-6 | Cycle reads real state | For RetailCGMX with calculation data, Cycle shows lifecycle state beyond "Import Commission Plan / 0%". |
| HG-7 | Queue event-driven | Queue does NOT show "Import Commission Plan" when plan already exists. Shows contextually appropriate items or empty state. |
| HG-8 | Pulse non-empty | At least one Pulse metric shows a real value (not dash) for RetailCGMX. |
| HG-9 | Perform shows data | For RetailCGMX Platform Admin with calculation data, Perform page shows actual compensation values, not "not yet available." |
| HG-10 | Demo User escape | After assuming a demo persona, a visible "Return to Admin" control is present and functional. |
| HG-11 | Global currency | `grep -rn "\$\${" src/ --include="*.tsx" \| grep -v formatCurrency \| grep -v node_modules` returns ZERO display-layer results. |
| HG-12 | AIService fallback | If API key unavailable, reconciliation page shows user-visible fallback message and manual mapping works correctly. No console-only errors that leave the user confused. |
| HG-13 | Batch label readable | Batch/period dropdown shows human-readable label (period name + state + employee count), not raw UUID. |
| HG-14 | Korean Test | Zero hardcoded tenant-specific field names, column names, or language patterns in any modified file. Evidence: grep output. |
| HG-15 | Inline locale ternaries eliminated | `grep -rn "locale.*===.*es-MX\|locale.*===.*en" src/app/operate/reconcile/ --include="*.tsx"` returns ZERO results. |
| HG-16 | Build passes | `npm run build` exits 0. |
| HG-17 | Server responds | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200. |
| HG-18 | Completion report persisted | `OB-37_COMPLETION_REPORT.md` exists in project root and is committed to git. |
| HG-19 | One commit per phase | At least 12 commits for 12 phases (Phase 0 excluded). |

## SOFT GATES

| # | Gate | Criterion |
|---|------|-----------|
| SG-1 | Per-component drill-down | Expanding a matched employee row shows per-component VL vs uploaded breakdown. |
| SG-2 | Export CSV works | Export button generates downloadable CSV with comparison results. |
| SG-3 | Training signal on override | User overriding an AI mapping generates a corrective training signal via AIService. |
| SG-4 | Wayfinder variance flags | Variance indicators use attention patterns, not stoplight red/yellow/green backgrounds. |
| SG-5 | Multi-period Cycle | Cycle shows period stack when multiple periods have calculation data. |
| SG-6 | Perform Quick Actions | Quick Actions on Perform page link to real, functional destinations. |
| SG-7 | Inline locale zero globally | `grep -rn "locale.*===.*es-MX" src/ --include="*.tsx" \| wc -l` is less than 5 across entire codebase. |

---

## EXECUTION ORDER

```
Phase 0:  Reconnaissance (read only, understand all systems)
Phase 1:  Fix file parser -- .txt support
Phase 2:  Fix manual column mapping -- dynamic from parsed headers
Phase 3:  Fix comparison engine -- read confirmed mappings, match employees
Phase 4:  Reconciliation currency, locale, Wayfinder, batch labels
Phase 5:  Unified locale system with translation dictionary
Phase 6:  Cycle data wiring to real lifecycle state
Phase 7:  Queue event-driven from lifecycle state
Phase 8:  Pulse real metrics from data layer
Phase 9:  Perform page data connection
Phase 10: Demo User escape hatch
Phase 11: Global currency sweep
Phase 12: AIService API key wiring and fallback resilience
```

After Phase 12: Write completion report, commit, final build, confirm server, push.

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-37_COMPLETION_REPORT.md` in PROJECT ROOT (same level as package.json)
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## CLT-19 FINDINGS TRACEABILITY

Every finding from CLT-19 browser testing maps to a specific phase:

| CLT-19 Finding | Phase |
|----------------|-------|
| Language selector shows English but page renders Spanish | Phase 5 |
| AI mapping failed -- API key not configured | Phase 12 |
| Manual mapping shows hardcoded field names | Phase 2 |
| Zero comparison matches (0/2134) | Phase 3 |
| Currency hardcoded USD | Phase 4, 11 |
| .txt file format not accepted | Phase 1 |
| Inline locale ternaries | Phase 4, 5 |
| Stoplight colors on variance | Phase 4 |
| Batch label raw UUID | Phase 4 |
| Cycle shows static "Import Commission Plan" | Phase 6 |
| Queue shows static placeholder items | Phase 7 |
| Pulse shows dashes for all metrics | Phase 8 |
| Perform page "not yet available" | Phase 9 |
| Demo User no return to admin | Phase 10 |
| Console React boundary errors | Phases 2-9 (likely resolved as data wiring fixes eliminate null/undefined cascades) |

---

*ViaLuce.ai -- The Way of Light*
*OB-37: Browser Truth and Reconciliation*
*February 13, 2026*
*"If it doesn't work in the browser, it doesn't work."*
