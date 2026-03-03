# OB-139: POST-CONFIRM IMPORT EXPERIENCE
## ExecutionProgress + ImportReadyState + Calculate Bridge
## Target: alpha.4.0
## Depends on: OB-138 (PR #156), OB-136 (PR #155)
## Estimated Duration: 2–2.5 hours

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference

---

## WHY THIS OB EXISTS

OB-138 (PR #156) delivered the proposal intelligence UI — 3-layer progressive disclosure showing agent observations, reasoning, and falsifiability. But OB-138 only fixed one of the four import flow states:

```
Upload (dropzone)  →  Proposal (classify + confirm)  →  Processing (execution)  →  Complete (ready state)
    ✅ Works              ✅ OB-138 fixed                 ❌ Broken                  ❌ Missing
```

**Processing is broken (F-CLT137-08, F-CLT137-20):** After the admin confirms classifications and execution begins, the file upload dropzone remains visible above a processing indicator at the bottom of the page. The admin sees "Drop a file to get started" while their data is being committed. This undermines every ounce of confidence the proposal intelligence just built.

**Complete is missing (F-CLT137-06, CLT122-F72):** After execution finishes, there is no summary of what was imported, no count of records committed, no entity count, no period detection display, and no bridge to Calculate. The admin is left in a dead-end — they have to manually navigate to Calculate and hope the data they just imported is there.

These two missing states complete the import journey that OB-138 started. Together, OB-136 (plumbing) + OB-138 (proposal intelligence) + OB-139 (post-confirm experience) make the full import-to-calculate flow work.

### Design Specification

The interactive prototype DS-006 v2 (`DS-006_universal-import-experience-v2.jsx`) defines the design target. This OB implements the Processing and Ready steps from that prototype.

### Alpha Context

This is the final OB for alpha.4.0. After OB-139, the alpha.4.0 release scope is:

| PR | Content | Status |
|----|---------|--------|
| #148–#154 | OB-127–135: SCI foundation + flywheel | Merged |
| #155 | OB-136: Pipeline plumbing fix | Merged |
| #156 | OB-138: SCI Proposal Intelligence UI | Merged |
| TBD | **OB-139: Post-confirm experience** | **This OB** |

After OB-139 merges, tag `alpha.4.0` and run CLT-139 browser verification against the full import → calculate flow.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
7. **Domain-agnostic always.** Korean Test on all new files.
8. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx).
9. **Supabase .in() ≤ 200 items.**
10. **Zero component-level Supabase calls (Standing Rule 26).**

### COMPLETION REPORT RULES (25–28)
25. Report file created BEFORE final build, not after.
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues.
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT POST-CONFIRM FLOW

### 0A: What happens after the admin clicks Confirm?

```bash
echo "=== IMPORT PAGE — FULL FILE ==="
wc -l web/src/app/operate/import/page.tsx
echo ""

echo "=== EXECUTION STATE MANAGEMENT ==="
grep -n "executing\|execution\|isExecuting\|setExecuting\|executionComplete\|setExecutionComplete\|executionResult\|onExecute\|handleExecute\|confirm.*execute" \
  web/src/app/operate/import/page.tsx | head -30

echo ""
echo "=== WHAT RENDERS DURING EXECUTION? ==="
grep -n "executing\|execution\|processing\|progress\|spinner\|loading" \
  web/src/app/operate/import/page.tsx | head -20

echo ""
echo "=== WHAT RENDERS AFTER EXECUTION? ==="
grep -n "complete\|done\|success\|finished\|result\|ready\|post.*import\|after.*import\|navigate\|router.*push" \
  web/src/app/operate/import/page.tsx | head -20

echo ""
echo "=== DOES THE UPLOAD DROPZONE HIDE DURING EXECUTION? ==="
grep -n "dropzone\|UploadZone\|upload.*area\|file.*drop\|onDrop\|drop.*zone" \
  web/src/app/operate/import/page.tsx | head -15

echo ""
echo "=== SCIExecution COMPONENT ==="
find web/src/components/sci -name "*xecution*" -o -name "*Execute*" | sort
cat web/src/components/sci/SCIExecution.tsx 2>/dev/null | head -80
echo ""
wc -l web/src/components/sci/SCIExecution.tsx 2>/dev/null
```

### 0B: What data is available after execution?

```bash
echo "=== EXECUTE API RESPONSE ==="
grep -A 30 "interface SCIExecutionResult" web/src/lib/sci/sci-types.ts
echo ""
grep -A 15 "interface ContentUnitResult" web/src/lib/sci/sci-types.ts

echo ""
echo "=== WHAT DOES EXECUTE RETURN? ==="
grep -n "return.*Response\|NextResponse\|json(" web/src/app/api/import/sci/execute/route.ts | head -10

echo ""
echo "=== ENTITY COUNT QUERY ==="
grep -rn "entities.*count\|count.*entities\|from('entities')" web/src/ --include="*.ts" --include="*.tsx" | head -10

echo ""
echo "=== PERIOD DETECTION RESULTS ==="
grep -n "detectAndCreatePeriods\|period.*detect\|detected.*period" web/src/app/api/import/sci/execute/route.ts | head -10

echo ""
echo "=== PLAN READINESS API ==="
grep -n "plan-readiness\|planReadiness" web/src/ -r --include="*.ts" --include="*.tsx" | head -10
```

### 0C: Current import page state machine

```bash
echo "=== STATE VARIABLES ==="
grep -n "useState\|useReducer" web/src/app/operate/import/page.tsx | head -20

echo ""
echo "=== CONDITIONAL RENDERING ==="
grep -n "{.*&&\|? (\|ternary\|step ===\|phase ===\|stage ===" web/src/app/operate/import/page.tsx | head -25
```

### 0D: What does SCIExecution currently show during processing?

```bash
echo "=== SCIExecution FULL CONTENT ==="
cat web/src/components/sci/SCIExecution.tsx 2>/dev/null
```

After reading Phase 0 output, document:
1. Does the upload dropzone currently hide during execution? (Likely NO — F-CLT137-08)
2. What state variables control the import page flow?
3. What data is available from the execute API response?
4. Is there ANY post-execution UI currently?

**Commit:** `OB-139 Phase 0: Diagnostic — post-confirm import flow state machine`

---

## PHASE 1: EXECUTION PROGRESS COMPONENT

**Goal:** Replace whatever currently shows during execution with a full-screen step-by-step progress view.

### What to build: `web/src/components/sci/ExecutionProgress.tsx`

This component renders INSTEAD OF the upload dropzone + proposal. When execution starts, it takes over the entire import page content area.

**Props:**
```typescript
interface ExecutionProgressProps {
  contentUnits: ContentUnitProposal[];  // from the confirmed proposal
  results: ContentUnitResult[];         // from execute API, grows as items complete
  isExecuting: boolean;
  onRetryFailed?: () => void;
  onContinue?: () => void;
}
```

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Importing                                                       │
│  Processing 8 content units...                                   │
│                                                                  │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  5 of 8 · 52,663 rows committed │
│                                                                  │
│  ✓  Datos Colaborador        Team Roster       2,187 rows        │
│  ✓  Base_Venta_Individual    Perf. Targets     2,618 rows        │
│  ✓  Base_Clientes_Nuevos     Perf. Targets     5,348 rows        │
│  ✓  Base_Venta_Tienda        Operational       12,446 rows       │
│  ◉  Base_Cobranza            Operational       processing...     │
│  ○  Base_Club_Proteccion     Perf. Targets                       │
│  ○  Base_Garantia_Extendida  Operational                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Per-item states:**
- `pending` (○): Not yet started. Text muted (`text-zinc-600`).
- `active` (◉): Currently processing. Text bright (`text-zinc-200`). Icon animated pulse.
- `done` (✓): Completed. Green icon (`text-emerald-400`). Row count shown.
- `failed` (✕): Error. Red icon (`text-red-400`). Error message shown (e.g., "Payload too large").

**Progress bar:**
- Width = percentage of completed items
- Below bar: "{done} of {total} · {committedRows} rows committed"
- Color: `bg-indigo-500`

**Failure handling:**
When any items fail AND all items have been attempted:
```
┌──────────────────────────────────────────────────────────────────┐
│  ⚠ 7 of 8 processed successfully.                               │
│  Base_Club_Proteccion — Payload too large                        │
│                                                                  │
│  [Retry failed]    [Continue →]                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Mapping from existing data:**
- `contentUnits` provides the tab names, classifications, and row counts
- `results` array grows as items complete — match by `contentUnitId`
- An item is "active" if its index equals `results.length` (next to process)
- An item is "done" if its `contentUnitId` exists in results with `success: true`
- An item is "failed" if its `contentUnitId` exists in results with `success: false`

**Styling:**
- Background inherits from page (dark theme, `bg-zinc-950`)
- Progress bar: `bg-zinc-800` track, `bg-indigo-500` fill, `h-1.5 rounded-full`
- Per-item rows: `px-4 py-2.5 rounded-lg`, hover `bg-zinc-900/50`
- Done rows: subtle `bg-emerald-500/[0.03]`
- Failed rows: subtle `bg-red-500/[0.03]`

**Korean Test:** Tab names come from data (customer vocabulary). Classification labels come from agent (structural labels). Zero domain vocabulary in the component itself.

**Commit:** `OB-139 Phase 1: ExecutionProgress component — step-by-step processing view`

---

## PHASE 2: IMPORT READY STATE COMPONENT

**Goal:** After execution completes, show what was imported and provide a direct bridge to Calculate.

### What to build: `web/src/components/sci/ImportReadyState.tsx`

**Props:**
```typescript
interface ImportReadyStateProps {
  results: ContentUnitResult[];          // execution results
  totalRowsCommitted: number;            // sum of successful results
  tenantId: string;
  planName?: string;                     // from rule_set or AI interpretation
  detectedPeriods?: string[];            // from period detection (OB-136)
  entityCount?: number;                  // from post-execution entity count query
  componentCount?: number;               // from rule_set components
  failedItems?: ContentUnitResult[];     // items that failed
  onNavigateToCalculate: () => void;     // callback to router.push
  onImportMore: () => void;              // callback to reset import state
}
```

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Import Complete                                                 │
│                                                                  │
│         65,109             719              6                    │
│      Records committed   Entities       Components               │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  Plan         RetailCorp Optometrist Compensation                │
│  Period       Enero 2024                                         │
│  Freshness    Just imported                                      │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  What was imported                                               │
│  ✓ Datos Colaborador          Team Roster        2,187 rows     │
│  ✓ Base_Venta_Individual      Perf. Targets      2,618 rows     │
│  ✓ Base_Clientes_Nuevos       Perf. Targets      5,348 rows     │
│  ✓ Base_Venta_Tienda          Operational        12,446 rows    │
│  ✓ Base_Cobranza              Operational        5,371 rows     │
│  ✕ Base_Club_Proteccion       Perf. Targets      Failed         │
│  ✓ Base_Garantia_Extendida    Operational        34,952 rows    │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│  [ Import more data ]        [ Calculate Enero 2024 → ]          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Stat boxes:** Three large numbers centered at top: Records committed, Entities, Components. Use `text-2xl text-zinc-100 font-light` for numbers, `text-xs text-zinc-500` for labels.

**Context section:** Plan name, detected period, data freshness. Show "Just imported" for freshness. If plan name is unknown, show "Plan detected" or omit. If period is unknown, show "Period not yet detected". These fields degrade gracefully — show what's available, skip what isn't.

**Import summary:** Per-item list matching the execution progress list but in final state. Done items show green check + row count. Failed items show red X + error reason.

**Actions:**
- "Import more data" — secondary button, left-aligned. Resets the import page to upload state.
- "Calculate [Period] →" — primary button, right-aligned. Navigates to `/operate/calculate`.
- If period is known, button says "Calculate Enero 2024 →". If unknown, says "Go to Calculate →".

**Data sourcing:**
- `totalRowsCommitted`: Sum from execution results (pass from parent)
- `entityCount`: Query after execution — `supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)`. This query happens in the parent page, not in the component (Standing Rule 26).
- `componentCount`: From plan-readiness API response if available, otherwise from rule_set query. Also fetched in parent.
- `planName`: From the proposal (if a plan was imported) or from rule_sets query.
- `detectedPeriods`: From execute API response if OB-136 period detection is wired.

**Graceful degradation:** Every field has a fallback. If entityCount is null, don't show the stat box. If planName is null, omit that row. If detectedPeriods is empty, the button says "Go to Calculate →". The component never crashes on missing data.

**Styling:**
- Card: `bg-zinc-900/80 border border-zinc-800 rounded-xl p-6`
- Stat numbers: `text-2xl text-zinc-100 font-light` centered
- Stat labels: `text-xs text-zinc-500 mt-1` centered
- Dividers: `h-px bg-zinc-800`
- Context labels: `text-xs text-zinc-500` left, values `text-sm text-zinc-200` right
- Primary button: `bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl py-3`
- Secondary button: `bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-3`

**Commit:** `OB-139 Phase 2: ImportReadyState component — post-import bridge to Calculate`

---

## PHASE 3: WIRE INTO IMPORT PAGE

**Goal:** Connect the new components into the import page state machine.

### 3A: Read the current state machine

From Phase 0 diagnostic, identify the state variables that control which UI renders. The import page likely has states like:
- `files` (parsed files array)
- `proposal` (SCI proposal from analyze API)
- `executing` (boolean — execution in progress)
- `executionResults` (array of per-item results)

### 3B: Add completion state

Add state for execution completion:
```typescript
const [executionComplete, setExecutionComplete] = useState(false);
const [postImportData, setPostImportData] = useState<{
  totalRowsCommitted: number;
  entityCount?: number;
  planName?: string;
  detectedPeriods?: string[];
  componentCount?: number;
} | null>(null);
```

### 3C: Hide upload dropzone during execution and completion

**This is the critical fix for F-CLT137-08 and F-CLT137-20.**

The upload dropzone / file input area must NOT render when:
- `executing === true` (processing in progress)
- `executionComplete === true` (showing ready state)

```tsx
// BEFORE (broken):
// Upload dropzone always renders, proposal overlays it, execution bar at bottom

// AFTER (fixed):
{!proposal && !executing && !executionComplete && (
  <UploadArea ... />  // Only show when nothing else is happening
)}

{proposal && !executing && !executionComplete && (
  <SCIProposal ... />  // OB-138's intelligence UI
)}

{executing && !executionComplete && (
  <ExecutionProgress
    contentUnits={proposal.contentUnits}
    results={executionResults}
    isExecuting={executing}
    onRetryFailed={handleRetryFailed}
    onContinue={handleContinueToReady}
  />
)}

{executionComplete && (
  <ImportReadyState
    results={executionResults}
    totalRowsCommitted={executionResults.filter(r => r.success).reduce((s, r) => s + r.rowsProcessed, 0)}
    tenantId={tenantId}
    planName={postImportData?.planName}
    detectedPeriods={postImportData?.detectedPeriods}
    entityCount={postImportData?.entityCount}
    componentCount={postImportData?.componentCount}
    failedItems={executionResults.filter(r => !r.success)}
    onNavigateToCalculate={() => router.push('/operate/calculate')}
    onImportMore={handleReset}
  />
)}
```

### 3D: Fetch post-import data after execution completes

When execution finishes (all items processed), fetch the supporting data for ImportReadyState:

```typescript
// After execution completes:
async function fetchPostImportData() {
  // 1. Entity count
  const { count: entityCount } = await supabase
    .from('entities')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // 2. Plan name + component count from rule_sets
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('name, components')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1);

  const planName = ruleSets?.[0]?.name;
  const componentCount = ruleSets?.[0]?.components ?
    Object.keys(ruleSets[0].components).length : undefined;

  // 3. Detected periods (if available from execute response)
  // This comes from OB-136's detectAndCreatePeriods()
  // Check if the execute API response includes period info

  setPostImportData({ totalRowsCommitted, entityCount, planName, componentCount, detectedPeriods });
  setExecutionComplete(true);
}
```

### 3E: Handle "Import more data" reset

```typescript
function handleReset() {
  setFiles(null);           // or however files state is managed
  setProposal(null);
  setExecuting(false);
  setExecutionResults([]);
  setExecutionComplete(false);
  setPostImportData(null);
}
```

### 3F: Handle "Retry failed"

```typescript
function handleRetryFailed() {
  // Re-execute only the failed content units
  const failedUnits = proposal.contentUnits.filter(
    u => executionResults.find(r => r.contentUnitId === u.contentUnitId && !r.success)
  );
  // Clear failed results, re-trigger execution for failed items only
  setExecutionResults(prev => prev.filter(r => r.success));
  // Re-run execute for failedUnits...
}
```

**Commit:** `OB-139 Phase 3: Wire ExecutionProgress + ImportReadyState into import page`

---

## PHASE 4: EXECUTE API RESPONSE ENRICHMENT

**Goal:** Ensure the execute API returns enough data for ImportReadyState.

### 4A: Check what execute returns

From Phase 0 diagnostic, verify if the execute API response includes:
- Per-item `rowsProcessed` count
- Detected periods (from OB-136's `detectAndCreatePeriods`)
- Plan name (from rule_set or AI interpretation)

### 4B: Add missing fields to response

If the execute response is missing any of these, add them. The execute route already has the data — it just may not be returning it.

```typescript
// In execute/route.ts, after all content units are processed:
return NextResponse.json({
  proposalId: request.proposalId,
  results: contentUnitResults,
  overallSuccess: contentUnitResults.every(r => r.success),
  // ADD these if not present:
  summary: {
    totalRowsCommitted: contentUnitResults.filter(r => r.success).reduce((s, r) => s + r.rowsProcessed, 0),
    detectedPeriods: detectedPeriods || [],  // from detectAndCreatePeriods()
    planName: planName || null,              // from rule_set created/updated during execution
  }
});
```

**Commit:** `OB-139 Phase 4: Enrich execute API response for ImportReadyState`

---

## PHASE 5: BUILD + REGRESSION + KOREAN TEST

### 5A: Build clean

```bash
cd web && rm -rf .next && npm run build
echo "Build exit code: $?"
# Must exit 0
```

### 5B: Localhost verification

```bash
npm run dev
# Verify at localhost:3000:
# 1. Login
# 2. Navigate to Operate → Import
# 3. Upload dropzone renders (upload state)
# 4. Upload a file → proposal renders with OB-138 intelligence cards (proposal state)
# 5. Confirm all → ExecutionProgress takes over (NO upload dropzone visible)
# 6. Per-item status updates as processing completes
# 7. After processing → ImportReadyState shows summary
# 8. "Calculate" button navigates to /operate/calculate
# 9. "Import more data" button resets to upload state
```

### 5C: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus\|optometr\|óptica\|tienda\|empleado\|cobranza\|garantía\|protección\|venta" \
  web/src/components/sci/ExecutionProgress.tsx \
  web/src/components/sci/ImportReadyState.tsx \
  --include="*.tsx" --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -v "\.test\." || echo "KOREAN TEST: PASS — 0 domain matches"
```

### 5D: Auth chain verification

```bash
echo "=== AUTH FILES UNCHANGED ==="
git diff --name-only HEAD | grep -E "middleware|auth-service|session-context|auth-shell" && echo "⚠️ AUTH MODIFIED" || echo "✅ AUTH UNTOUCHED"
```

**Commit:** `OB-139 Phase 5: Build clean + localhost verification + Korean Test`

---

## PHASE 6: COMPLETION REPORT + PR

Create `OB-139_COMPLETION_REPORT.md`:

1. **What was built:** ExecutionProgress, ImportReadyState, import page state machine fix
2. **CLT findings addressed:** F-CLT137-08, F-CLT137-20 (upload visible during processing), F-CLT137-06 (no extraction summary post-import), CLT122-F72 (import completes to blank page)
3. **Alpha context:** Final OB for alpha.4.0. Full import-to-calculate flow now works.
4. **All proof gates with evidence**

```bash
gh pr create --base main --head dev \
  --title "OB-139: Post-Confirm Import Experience — ExecutionProgress + ImportReadyState" \
  --body "## Target: alpha.4.0 (final OB)

### What Changed
The import page now has four distinct states:
1. Upload — dropzone (unchanged)
2. Proposal — SCI intelligence cards (OB-138)
3. Processing — step-by-step execution progress (NEW)
4. Complete — import summary + Calculate bridge (NEW)

### CLT Findings Addressed
- F-CLT137-08/F-CLT137-20: Upload dropzone no longer visible during processing
- F-CLT137-06: Post-import summary now shows records, entities, components, period
- CLT122-F72: Import no longer completes to blank page

### alpha.4.0 Scope Complete
OB-127–135 (SCI) + OB-136 (plumbing) + OB-138 (intelligence UI) + OB-139 (post-confirm)
Ready for CLT-139 browser verification and alpha.4.0 tag.

### Korean Test
0 domain vocabulary in new components"
```

**Commit:** `OB-139 Phase 6: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | `npm run build` exits 0 | Clean build |
| PG-02 | Upload dropzone hidden during execution | `executing === true` → no dropzone rendered |
| PG-03 | Upload dropzone hidden after completion | `executionComplete === true` → no dropzone rendered |
| PG-04 | ExecutionProgress shows per-item status | Tab names, classifications, row counts visible |
| PG-05 | ExecutionProgress shows overall progress bar | "{done} of {total} · {rows} rows committed" |
| PG-06 | Active item has animated indicator | Currently-processing item visually distinct |
| PG-07 | Failed items show error reason | Red icon + error text for failed items |
| PG-08 | ImportReadyState shows stat boxes | Records, entities, components (graceful if missing) |
| PG-09 | ImportReadyState shows plan + period + freshness | Context section populated from available data |
| PG-10 | ImportReadyState shows per-item summary | Each content unit with final status |
| PG-11 | "Calculate" button navigates to /operate/calculate | `router.push` verified |
| PG-12 | "Import more data" resets to upload state | All state variables cleared, dropzone visible again |
| PG-13 | Korean Test | 0 domain vocabulary in new components |
| PG-14 | Auth files unchanged | No modifications to auth chain |
| PG-15 | localhost:3000 responds | HTTP 200/307 |

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Prevention |
|---------|------|------------|
| Phase skipping | CC delivers components but doesn't wire them into the page | Phase 3 is explicitly about wiring. PG-02/PG-03 verify the dropzone hides. |
| Missing state transitions | ExecutionComplete never becomes true | Phase 3D defines exactly when to set it. PG-08–PG-10 verify the ready state renders. |
| Hardcoded test data | CC puts sample numbers in the component | All data comes from props. No hardcoded counts, names, or periods. |
| Breaking existing flow | OB-138's proposal UI stops working | PG-04 doesn't test proposal (that's OB-138's territory). But the state machine must preserve `proposal && !executing && !executionComplete` as the condition for showing SCIProposal. |

---

## ESTIMATED DURATION

- Phase 0: Diagnostic — 15 min
- Phase 1: ExecutionProgress component — 30 min
- Phase 2: ImportReadyState component — 30 min
- Phase 3: Wire into import page — 30 min (CRITICAL)
- Phase 4: Execute API enrichment — 15 min
- Phase 5: Build + regression — 15 min
- Phase 6: Completion report + PR — 10 min

**Total: ~2.5 hours**

---

## WHAT SUCCESS LOOKS LIKE

After OB-139, the full import experience works:

1. Admin drops a file → **Upload state** (dropzone)
2. Platform classifies content → **Proposal state** (OB-138 intelligence cards: observations, reasoning, falsifiability)
3. Admin confirms → **Processing state** (step-by-step progress, NO upload dropzone visible)
4. Processing completes → **Ready state** (65,109 records · 719 entities · 6 components · "Calculate Enero 2024 →")
5. Admin clicks Calculate → navigates to `/operate/calculate` with data ready

No dead-ends. No confusing dual-state screens. No "Drop a file" during processing. The intelligence the agents compute is visible at every step, and the outcome is actionable.

**This closes the alpha.4.0 scope. After CLT-139 verification: `git tag -a alpha.4.0`.**

---

*"The agents comprehend the data. The UI shows the reasoning. The admin confirms. The platform is ready to calculate. That's the entire import experience."*
