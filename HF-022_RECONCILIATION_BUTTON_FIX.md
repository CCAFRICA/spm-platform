# HF-022: Run Reconciliation Button Does Not Fire
## Hotfix — Interactive Mode (Stop and Validate)
## Date: February 13, 2026
## SEVERITY: HIGH — Core reconciliation workflow blocked

---

## THE PROBLEM

On the Reconciliation Benchmark page (`/operate/reconcile`), after:
1. Uploading a benchmark file (RetailCo data results.xlsx — 2157 rows, 30 columns)
2. Selecting a calculation batch from the dropdown (period-1770819809919-iblg90n — Preview | Feb 13, 2026 | 719 employees)
3. Manually mapping Employee ID Field → `num_empleado`
4. Manually mapping Amount Field → `Incentivo_Venta_Individual`

The "Run Reconciliation" button appears active (dark background, clickable appearance) but **nothing happens when clicked**. No console output, no loading state, no error, no results. The button is visually active but functionally dead.

Console shows persistent warning: `[AIService] sheet_classification failed: Anthropic API key not configured` — but this is the AI auto-mapping failure, NOT the comparison engine. The manual field mapping path should bypass AI entirely.

## CONTEXT

OB-38 Phases 4-6 created three new files:
- `src/lib/reconciliation/comparison-depth-engine.ts` (Phase 4 — Comparison Depth Assessment)
- `src/lib/reconciliation/adaptive-comparison-engine.ts` (Phase 5 — Multi-layer comparison)
- `src/components/forensics/AdaptiveResultsPanel.tsx` (Phase 6 — Results display)

The reconciliation page (`/operate/reconcile`) needs to wire the button click to the new adaptive comparison engine using the manual field mappings.

## PHASE 1: TRACE THE BUTTON CLICK CHAIN

Do NOT write any code yet. Read the reconciliation page and trace the onClick handler.

```bash
echo "=== RECONCILIATION PAGE ==="
find src -path "*reconcil*" -name "page.tsx" | head -5

echo ""
echo "=== FIND THE RUN BUTTON ==="
grep -n "Run Reconciliation\|runReconciliation\|handleRun\|onRun\|onClick.*reconcil\|startReconciliation\|executeReconciliation" src/app/operate/reconcile/page.tsx 2>/dev/null || \
grep -rn "Run Reconciliation\|runReconciliation\|handleRun" src/app/operate/reconcil* --include="*.tsx" | head -15

echo ""
echo "=== FIND THE BUTTON COMPONENT ==="
grep -n "button\|Button" src/app/operate/reconcile/page.tsx 2>/dev/null | head -20

echo ""
echo "=== WHAT DOES THE ONCLICK DO? ==="
# Get the function body that the button calls
grep -n "const handleRun\|const runReconciliation\|const onRun\|const executeReconciliation\|const startComparison\|async function run" src/app/operate/reconcile/page.tsx 2>/dev/null | head -10

echo ""
echo "=== HOW IS THE COMPARISON ENGINE IMPORTED? ==="
grep -n "import.*comparison\|import.*reconcil\|import.*adaptive\|import.*depth" src/app/operate/reconcile/page.tsx 2>/dev/null | head -10

echo ""
echo "=== HOW ARE FIELD MAPPINGS READ? ==="
grep -n "employeeId\|amountField\|fieldMapping\|selectedEmployee\|selectedAmount\|num_empleado" src/app/operate/reconcile/page.tsx 2>/dev/null | head -15

echo ""
echo "=== CHECK FOR DISABLED/CONDITIONAL LOGIC ON BUTTON ==="
grep -n "disabled\|isDisabled\|canRun\|isReady\|isValid" src/app/operate/reconcile/page.tsx 2>/dev/null | head -15

echo ""
echo "=== CHECK THE ADAPTIVE COMPARISON ENGINE ENTRY POINT ==="
grep -n "export\|function\|class" src/lib/reconciliation/adaptive-comparison-engine.ts 2>/dev/null | head -15

echo ""
echo "=== CHECK THE COMPARISON DEPTH ENGINE ENTRY POINT ==="
grep -n "export\|function\|class" src/lib/reconciliation/comparison-depth-engine.ts 2>/dev/null | head -15

echo ""
echo "=== DOES THE PAGE IMPORT THE NEW OB-38 ENGINES? ==="
grep -n "adaptive\|AdaptiveComparison\|ComparisonDepth\|AdaptiveResults" src/app/operate/reconcile/page.tsx 2>/dev/null | head -10

echo ""
echo "=== CHECK FOR OLD COMPARISON ENGINE REFERENCES ==="
grep -n "compareResults\|runComparison\|executeComparison\|ReconciliationEngine" src/app/operate/reconcile/page.tsx 2>/dev/null | head -10
```

### PHASE 1 REQUIRED OUTPUT

Document the complete click chain:
```
BUTTON "Run Reconciliation"
  → onClick calls: [function name at line X]
    → function does: [describe what it tries to do]
      → calls comparison engine: [YES — which engine / NO — why not]
      → reads field mappings from: [state variable / form field / nowhere]
      → reads file data from: [state variable / localStorage / nowhere]
      → reads calculation data from: [state variable / localStorage / nowhere]

ROOT CAUSE:
  [One of:]
  A) onClick handler is not wired (button has no onClick)
  B) onClick handler calls old engine that doesn't exist
  C) onClick handler calls new engine but passes wrong arguments
  D) onClick handler is gated by a condition that's never true
  E) onClick handler fires but the engine returns no results and UI doesn't update
  F) Other: [describe]

EVIDENCE: [paste the relevant code showing the disconnect]
```

**Commit:** `HF-022-1: Run Reconciliation button diagnostic trace`

---

## PHASE 2: WIRE THE BUTTON

Based on Phase 1 findings, fix the wiring.

The correct flow should be:

1. **Button onClick** reads:
   - Parsed file data (rows from the uploaded XLSX)
   - Selected calculation batch (from the dropdown)
   - Employee ID field mapping (from the top Field Mapping dropdown)
   - Amount field mapping (from the top Field Mapping dropdown)
   - Any additional component mappings (from the Confirm Column Mapping section, if user mapped any)

2. **Button onClick** calls the Comparison Depth Assessment engine:
   - Passes file headers, sample rows, plan component names
   - Gets back a ComparisonDepthAssessment with comparison layers

3. **Button onClick** calls the Adaptive Comparison Engine:
   - Passes the assessment, file data, and calculation results
   - Gets back multi-layer comparison results with match counts, deltas, false greens

4. **Results** are passed to the AdaptiveResultsPanel for display

5. **Loading state** shown while comparison runs (may take a few seconds for 2157 rows)

**CRITICAL:** The manual field mappings (Employee ID = `num_empleado`, Amount = `Incentivo_Venta_Individual`) must be used to construct the ComparisonDepthAssessment when AI is unavailable. Do NOT require AI classification to run the comparison. The manual path IS the path.

**PROOF GATE 2:** 
1. Upload RetailCo data results.xlsx
2. Select calculation batch
3. Map Employee ID → `num_empleado`, Amount → `Incentivo_Venta_Individual`
4. Click "Run Reconciliation"
5. Loading state appears
6. Results appear with: matched employee count (>0), total delta, summary statistics
7. Console shows no uncaught errors

**Commit:** `HF-022-2: Wire Run Reconciliation to adaptive comparison engine`

---

## PHASE 3: RESULTS DISPLAY VERIFICATION

After Phase 2, verify the AdaptiveResultsPanel renders:

1. **Summary panel** with comparison depth, match count, aggregate delta
2. **Employee table** with at least some matched employees
3. **Currency formatting** using tenant locale (MXN for RetailCGMX)
4. **No hardcoded field names** — Korean Test: column names come from data, not code

If the AdaptiveResultsPanel does not render or renders empty, trace why:
```bash
grep -n "AdaptiveResultsPanel\|adaptiveResults\|comparisonResults\|setResults" src/app/operate/reconcile/page.tsx 2>/dev/null | head -15
```

**PROOF GATE 3:** AdaptiveResultsPanel visible with non-zero match count and summary statistics.

**Commit:** `HF-022-3: Verify reconciliation results display`

---

## HARD GATES

| # | Gate | Criterion |
|---|------|-----------|
| HG-1 | Root cause documented | Button click chain traced with exact disconnect identified |
| HG-2 | Button fires | Click "Run Reconciliation" triggers comparison engine (console log or loading state visible) |
| HG-3 | Matches produced | Non-zero matched employee count after comparison |
| HG-4 | Results displayed | AdaptiveResultsPanel shows summary with match count and delta |
| HG-5 | Manual path works | Comparison runs successfully WITHOUT AI classification (manual field mappings only) |
| HG-6 | Build passes | `npm run build` exits 0 |
| HG-7 | Completion report | `HF-022_COMPLETION_REPORT.md` at project root |

---

## CC RULES

- Commit after each phase
- After every commit: kill dev server, rm -rf .next, npm run build, npm run dev
- Completion report at PROJECT ROOT
- ASCII-only commit messages
- This is interactive mode — STOP after Phase 1 and show findings before proceeding
- Do NOT modify the Field Mapping UI layout in this hotfix — that is a separate UX issue
- Do NOT attempt to fix the AI API key configuration — that is a separate infrastructure issue
- SCOPE: Only fix the button → engine → results wiring. Nothing else.
