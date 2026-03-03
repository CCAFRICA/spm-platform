# OB-138: SCI PROPOSAL INTELLIGENCE UI
## Surface the thinking, not just the label.
## DS-006 v2 Implementation — Universal Import Experience

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. This prompt in its entirety before writing a single line of code

---

## CONTEXT — WHAT THIS CHANGES AND WHY

CLT-137 tested the SCI import pipeline on production. The agents classified 7/8 tabs correctly on a complex Mexican retail XLSX. PARTIAL claims worked. Customer vocabulary was preserved. Honest uncertainty flagged appropriately.

**But the UI hides this intelligence.** The proposal cards show a classification label and a confidence number. That's it. The admin has to trust a label — they can't verify WHY the agent chose it, WHAT structural evidence supports it, or WHAT would change the classification.

The SCI analyze API already returns rich data per `ContentUnitProposal`:
- `reasoning` — text explaining the classification decision
- `allScores` — scores from all 4 agents (not just the winner)
- `fieldBindings` — semantic role assignments per field
- `warnings` — uncertainty flags and close-score alerts

**None of this surfaces in the current UI.** This OB rewrites the import proposal page to show the intelligence.

### DESIGN SPECIFICATION: DS-006 v2

The interactive prototype `DS-006_universal-import-experience-v2.jsx` defines the design target. Key principles:

1. **Verdict as conversation.** Not "Performance Targets · 82%" but "Goal tables — targets per person per period." The card tells you WHAT it found in plain language.

2. **Three layers of intelligence per card (expandable):**
   - **What I observe** — Structural facts: row count, unique ID cardinality, currency patterns, date cadence, value distribution shape. True regardless of domain or language.
   - **Why I chose this** — Agent reasoning: "High row count + lean columns + monetary values + daily dates = classic transaction pattern."
   - **What would change my mind** — Falsifiability: "If Monto values repeat frequently (same amount for same seller), these might be monthly aggregates, not individual transactions."

3. **Summary bar.** Top-level: "5 confident · 2 need review · 65,109 total rows" — Bloodwork principle.

4. **Bulk confirmation.** "Confirm all" shortcut. Checkbox per card. All-confirmed enables "Import N rows →" button.

5. **Close-score warnings.** When agent scores are within 10%, surface both options with explanation, not just the winner.

6. **Classification override.** Buttons showing all 4 options with current selection highlighted. Not a dropdown. Customer vocabulary in descriptions.

7. **Split indicators.** When spatial negotiation splits a tab, show violet badge with "split · entity fields" and link to partner card.

8. **Processing order.** Visible at footer: "Team Roster → Performance Targets → Operational Data"

9. **Post-confirm processing.** Full-screen step-by-step progress per content unit. No "Drop a file" prompt visible during execution.

10. **Ready state.** After processing: summary of what was imported, detected periods, entity count, component readiness, and direct "Calculate [Period] →" button.

---

## STANDING ARCHITECTURE RULES

1. **Read CC_STANDING_ARCHITECTURE_RULES.md first.**
2. **Kill dev server, rm -rf .next, npm run build, npm run dev, verify localhost:3000** after every phase.
3. **Commit + push after EVERY phase.**
4. **Fix logic, not data.**
5. **Zero domain vocabulary in any new code.** Korean Test on all new files.
6. **Phase 0 diagnostic first.**
7. **Evidence = paste code/output, NOT "this was implemented."**
8. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (middleware.ts, auth-service.ts, session-context.tsx, auth-shell.tsx).

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT UI + API DATA

### 0A: Find the current import page and SCI proposal components

```bash
echo "=== IMPORT PAGE ==="
find web/src/app/operate/import -name "*.tsx" -o -name "*.ts" | sort
echo ""
echo "=== SCI-RELATED COMPONENTS ==="
find web/src/components -name "*sci*" -o -name "*SCI*" -o -name "*proposal*" -o -name "*import*" -o -name "*classification*" | sort
echo ""
echo "=== IMPORT PAGE CONTENT ==="
cat web/src/app/operate/import/page.tsx | head -80
echo ""
echo "=== FULL IMPORT PAGE LINE COUNT ==="
wc -l web/src/app/operate/import/page.tsx
```

### 0B: What does the SCI analyze API actually return?

```bash
echo "=== SCI TYPES — ContentUnitProposal ==="
grep -A 30 "interface ContentUnitProposal" web/src/lib/sci/sci-types.ts
echo ""
echo "=== SCI TYPES — SCIProposal ==="
grep -A 20 "interface SCIProposal" web/src/lib/sci/sci-types.ts
echo ""
echo "=== SCI TYPES — ContentProfile ==="
grep -A 30 "interface ContentProfile" web/src/lib/sci/sci-types.ts
echo ""
echo "=== SCI TYPES — AgentScore ==="
grep -A 15 "interface AgentScore" web/src/lib/sci/sci-types.ts
echo ""
echo "=== SCI TYPES — SemanticBinding ==="
grep -A 15 "interface SemanticBinding" web/src/lib/sci/sci-types.ts
echo ""
echo "=== ANALYZE API — What reasoning string does it generate? ==="
grep -n "reasoning\|observation\|contentProfile\|verdict" web/src/app/api/import/sci/analyze/route.ts | head -20
echo ""
echo "=== AGENT SCORING — What data is available? ==="
grep -n "reasoning\|observation\|signal\|evidence\|sparsity\|cardinality\|distribution" web/src/lib/sci/agents.ts | head -20
```

### 0C: What does the current proposal UI render?

```bash
echo "=== CURRENT PROPOSAL RENDERING ==="
grep -n "classification\|confidence\|reasoning\|allScores\|binding\|confirm\|Change\|override" \
  web/src/app/operate/import/page.tsx | head -30
echo ""
echo "=== WHAT DATA GETS PASSED TO UI? ==="
grep -n "proposal\|contentUnit\|SCIProposal\|ContentUnit" \
  web/src/app/operate/import/page.tsx | head -20
```

### 0D: What structural observations does the Content Profile provide?

```bash
echo "=== CONTENT PROFILE GENERATOR ==="
cat web/src/lib/sci/content-profile.ts | head -100
echo ""
echo "=== CONTENT PROFILE FIELDS ==="
grep -n "export\|interface\|type.*=" web/src/lib/sci/content-profile.ts | head -30
```

### 0E: Execution flow — what happens after confirm?

```bash
echo "=== EXECUTE FLOW IN UI ==="
grep -n "execute\|confirm\|processing\|progress\|status\|onComplete" \
  web/src/app/operate/import/page.tsx | head -30
echo ""
echo "=== POST-EXECUTION NAVIGATION ==="
grep -n "router\|navigate\|push\|redirect\|Calculate\|calculate" \
  web/src/app/operate/import/page.tsx | head -15
```

### 0F: What's the gap between API data and UI rendering?

After reading Phase 0A–0E output, document:
1. What fields does the API return that the UI doesn't show?
2. What intelligence does the Content Profile compute that the UI never receives?
3. What agent reasoning exists that gets lost between API and UI?

**Commit:** `OB-138 Phase 0: Diagnostic — current UI vs available API intelligence`

---

## PHASE 1: EXTEND ANALYZE API RESPONSE

**Goal:** Ensure the SCI analyze API returns everything the UI needs.

The DS-006 v2 design requires three layers of intelligence per content unit. Check whether the current API response includes:

### 1A: Structural observations

The Content Profile computes structural facts (row count, column count, unique value cardinality, data type distribution, sparsity, numeric range/distribution). These need to be surfaced as human-readable observation strings.

If the Content Profile returns raw metrics, add a `generateObservations()` function that converts them to display-ready strings:

```typescript
// Input: ContentProfile with raw metrics
// Output: Array of { icon: string, text: string }
//
// Example outputs:
// { icon: "🔑", text: "employee_id — 719 unique values, sequential integers → likely person identifiers" }
// { icon: "💰", text: "Monto — currency values (MXN), range $0–$89,000, median $890 → monetary amounts" }
// { icon: "📊", text: "34,952 rows — high volume, characteristic of event/transaction data" }
// { icon: "📅", text: "FechaCorte — date field with monthly cadence → event timestamps" }
//
// Rules:
// - NEVER use domain vocabulary. Describe by structure, not by assumed meaning.
// - Use → to show inference: "719 unique values → likely person identifiers"
// - Include distribution shape for numeric fields: "right-skewed", "uniform", "bimodal"
// - Include cardinality context: "4 unique values (text) → likely category/role"
// - Korean Test: these strings must work if all field names were in Korean
```

### 1B: Agent reasoning with falsifiability

The current `reasoning` string explains WHY. Add a `whatChangesMyMind` string that explains WHAT WOULD FLIP the classification:

```typescript
// Add to ContentUnitProposal:
export interface ContentUnitProposal {
  // ... existing fields ...
  observations: Array<{ icon: string; text: string }>;  // NEW — structural observations
  verdictSummary: string;  // NEW — plain-language one-liner ("Goal tables — targets per person per period")
  whatChangesMyMind: string;  // NEW — falsifiability statement
}
```

Generate `whatChangesMyMind` based on the classification and close scores:
- If close scores: "Close call: {classification} ({pct}%) vs {altClassification} ({altPct}%). If [structural condition], reclassify."
- If high confidence: "Nothing in this data's structure suggests an alternative."
- If split: "If all fields vary together over time, this might be pure transaction data rather than mixed entity+operational."

### 1C: Verdict summary

Generate a plain-language one-liner for each content unit:
- NOT "Performance Targets · 82%"
- YES "Goal tables — targets per person per period"
- YES "Transaction records — warranty events per seller"
- YES "This looks like two things in one sheet"
- YES "I'm not sure — this could be targets or actuals"

The verdict should describe WHAT WAS FOUND, not the classification label.

```typescript
function generateVerdictSummary(
  classification: AgentType,
  confidence: number,
  profile: ContentProfile,
  allScores: AgentScore[],
): string {
  // High confidence, clear winner
  if (confidence >= 0.75) {
    // Describe what was found based on structural observations
    // "Rule definitions — tier tables with percentage rates"
    // "Transaction records — high-volume daily events with monetary amounts"
    // "Personnel directory — one row per person with attributes"
  }
  
  // Split/PARTIAL claim
  // "This looks like two things in one sheet"
  
  // Low confidence / close scores
  // "I'm not sure — this could be targets or actuals"
  
  // Korean Test: generate from structure, not from field names
}
```

**CRITICAL: The observations, verdict, and whatChangesMyMind must be generated from the Content Profile's structural metrics, NOT from field names or domain vocabulary. The Korean Test applies. If every field name were in Hangul, the observations should still make sense structurally.**

However — and this is important — the observations should INCLUDE the customer's actual field names as identifiers while describing their STRUCTURAL role. Example: "num_empleado — 719 unique values, sequential integers → likely person identifiers" uses the customer's field name but describes the structural evidence. In Korean: "직원번호 — 450 unique values, sequential integers → likely person identifiers" would work exactly the same way.

**Commit:** `OB-138 Phase 1: Extend analyze API — observations, verdict, falsifiability`

---

## PHASE 2: PROPOSAL CARD COMPONENT

**Goal:** Build the content unit card component matching DS-006 v2.

### 2A: Create the component

Create `web/src/components/sci/ContentUnitCard.tsx`:

**Collapsed state (default — Bloodwork):**
```
┌──────────────────────────────────────────────────────────────────┐
│ ☐  Base_Garantia_Extendida                                      │
│    Transaction records — warranty events per seller              │
│                                           34,952 rows  ▪▪▪ 78%  │
└──────────────────────────────────────────────────────────────────┘
```

Elements:
- Checkbox (confirm/unconfirm)
- Tab name (customer vocabulary, bold)
- Verdict badge (colored pill: "Events & transactions", "Goals & targets", "People / locations", "Rule definitions", "Mixed content", "Needs your input")
- Verdict summary (plain language one-liner, muted text below tab name)
- Row count (right-aligned, tabular)
- Confidence bar + percentage (right-aligned)
- Expand chevron

**Expanded state (on click):**
```
┌──────────────────────────────────────────────────────────────────┐
│ ☑  Base_Garantia_Extendida           Events & transactions      │
│    Transaction records — warranty events per seller              │
│                                           34,952 rows  ▪▪▪ 78%  │
│ ─────────────────────────────────────────────────────────────── │
│  WHAT I OBSERVE                                                  │
│  📊 34,952 rows — high volume, characteristic of event data      │
│  🔑 Vendedor — 719 unique values → matches entity count          │
│  💰 Monto — MXN currency, range $0–$12,000, median $890         │
│  📅 FechaCorte — monthly date, consistent cadence                │
│  📏 Only 5 columns — lean structure typical of event logs        │
│                                                                  │
│  WHY I CHOSE THIS                                                │
│  High row count + lean columns + monetary values + date field    │
│  = classic transaction pattern. Each row is likely one event     │
│  for one seller on one date.                                     │
│                                                                  │
│  WHAT WOULD CHANGE MY MIND                                       │
│  If Monto values repeat frequently (same amount for same         │
│  seller), these might be monthly aggregates, not individual      │
│  transactions.                                                   │
│                                                                  │
│  Classification: [Plan] [Roster] [Targets] [▣ Transactions]     │
└──────────────────────────────────────────────────────────────────┘
```

Additional elements for expanded state:
- Close-score warning (amber panel if agent gap < 10%)
- Split indicator (violet panel if PARTIAL claim with partner)
- Field list with semantic roles (customer field name → platform role)
- Classification override buttons (4 options, current highlighted)

### 2B: Styling

Follow existing platform dark theme:
- Card background: `bg-zinc-900/40` with `border-zinc-800/60`
- Confirmed state: `border-emerald-500/15 bg-emerald-500/[0.03]`
- Needs review: `border-amber-500/15 bg-amber-500/[0.02]`
- Section headers: `text-[10px] text-zinc-600 uppercase tracking-wider`
- Observation text: `text-xs text-zinc-400`
- Reasoning text: `text-xs text-zinc-500`
- Falsifiability text: `text-xs text-indigo-400/60`

### 2C: Korean Test verification

After building the component, verify it works with non-Latin content:
- Component never reads field names to determine layout
- Classification labels come from the agent, not from field names
- Observations reference field names as identifiers, not as classification inputs

**Commit:** `OB-138 Phase 2: ContentUnitCard component — 3-layer intelligence display`

---

## PHASE 3: SUMMARY BAR COMPONENT

**Goal:** Top-level summary above the content unit cards.

Create `web/src/components/sci/ProposalSummaryBar.tsx`:

```
┌──────────────────────────────────────────────────────────────────┐
│  ● 5 confident   ● 2 need review         65,109 rows  Confirm → │
└──────────────────────────────────────────────────────────────────┘
```

Elements:
- Green dot + count of high-confidence items
- Amber dot + count of items needing review (if any)
- Total row count
- "Confirm all →" link (right-aligned)
- Detected entity count and period(s) if available: "719 entities · Enero 2024, Febrero 2024, Marzo 2024"

**Commit:** `OB-138 Phase 3: ProposalSummaryBar component`

---

## PHASE 4: PROCESSING PROGRESS VIEW

**Goal:** Replace the confusing post-confirm state (file upload prompt + processing bar at bottom) with a dedicated processing view.

Create `web/src/components/sci/ExecutionProgress.tsx`:

This component renders when execution is in progress. It REPLACES the upload area entirely — no upload prompt visible during processing.

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
│  ◉  Base_Cobranza            Operational       ...               │
│  ○  Base_Club_Proteccion     Perf. Targets                       │
│  ○  Base_Garantia_Extendida  Operational                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

States per item: pending (○), active (◉ animated pulse), done (✓ emerald), failed (✕ red with error text).

If any items fail, show retry option below the list:
```
│  ⚠ 7 of 8 processed successfully.                               │
│  Base_Club_Proteccion — Payload too large                        │
│  [Retry failed]  [Continue without →]                            │
```

**Commit:** `OB-138 Phase 4: ExecutionProgress component — full-screen processing view`

---

## PHASE 5: READY STATE VIEW

**Goal:** After processing completes, show what's ready and provide direct navigation to Calculate.

Create `web/src/components/sci/ImportReadyState.tsx`:

```
┌──────────────────────────────────────────────────────────────────┐
│  Ready to Calculate                                              │
│  Import complete. Here's what's ready.                           │
│                                                                  │
│          65,109              719               6                 │
│       Records imported    Entities matched   Components          │
│                                                                  │
│  ────────────────────────────────────────────────────────────── │
│  Plan      RetailCorp Optometrist Compensation                   │
│  Period    Enero 2024                                            │
│  Freshness Just imported                                         │
│  ────────────────────────────────────────────────────────────── │
│  Component readiness                                             │
│  ● Ventas Óptica        Data ready                               │
│  ● Venta Tienda         Data ready                               │
│  ● Clientes Nuevos      Data ready                               │
│  ● Cobranza             Data ready                               │
│  ● Club Protección      ⚠ Missing (import failed)               │
│  ● Garantía Extendida   Data ready                               │
│  ────────────────────────────────────────────────────────────── │
│          [ Calculate Enero 2024 → ]                              │
└──────────────────────────────────────────────────────────────────┘
```

This component reads from the execution results:
- Total rows committed (sum of successful content units)
- Entity count (from entities table for this tenant)
- Component count (from rule_set)
- Plan name (from rule_set or AI interpretation)
- Detected period(s) (from period detection — OB-136 Phase 4)
- Per-component data readiness (from convergence bindings — OB-136 Phase 2)

The "Calculate [Period] →" button navigates to `/operate/calculate` with the period pre-selected.

**Commit:** `OB-138 Phase 5: ImportReadyState component — post-import bridge to Calculate`

---

## PHASE 6: WIRE INTO IMPORT PAGE

**Goal:** Replace the current import page rendering with the new components.

### 6A: Read and understand the current page flow

The import page currently has states (upload → analyze → propose → confirm → execute → done). Map each state to the new component:

| Current State | New Component |
|---|---|
| Upload (file dropzone) | Keep as-is (or minimal cleanup) |
| Analyzing (spinner) | Keep as-is (or show progress) |
| Proposal (classification cards) | **ProposalSummaryBar + ContentUnitCard[] → REPLACE** |
| Confirming + Executing | **ExecutionProgress → REPLACE** |
| Done | **ImportReadyState → REPLACE** |

### 6B: Replace proposal rendering

Remove the current proposal card rendering. Replace with:

```tsx
{proposal && !executing && !executionComplete && (
  <div>
    <ProposalSummaryBar
      contentUnits={proposal.contentUnits}
      confirmations={confirmations}
      onConfirmAll={handleConfirmAll}
    />
    <div className="space-y-2 mt-4">
      {proposal.contentUnits.map(unit => (
        <ContentUnitCard
          key={unit.contentUnitId}
          unit={unit}
          isExpanded={expandedCard === unit.contentUnitId}
          onToggle={() => toggleExpanded(unit.contentUnitId)}
          isConfirmed={confirmations[unit.contentUnitId]}
          onConfirm={() => toggleConfirm(unit.contentUnitId)}
          onClassificationChange={(newType) => overrideClassification(unit.contentUnitId, newType)}
        />
      ))}
    </div>
    <div className="mt-6 flex items-center justify-between">
      <span className="text-xs text-zinc-600">
        Processing order: {proposal.processingOrder.map(id => {
          const unit = proposal.contentUnits.find(u => u.contentUnitId === id);
          return unit?.classification;
        }).filter(Boolean).join(' → ')}
      </span>
      <button
        onClick={handleExecute}
        disabled={!allConfirmed}
        className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all ${
          allConfirmed
            ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
        }`}
      >
        Import {totalRows.toLocaleString()} rows →
      </button>
    </div>
  </div>
)}

{executing && (
  <ExecutionProgress
    contentUnits={proposal.contentUnits}
    executionResults={executionResults}
    onRetryFailed={handleRetryFailed}
    onContinue={handleContinueWithout}
  />
)}

{executionComplete && (
  <ImportReadyState
    executionResults={executionResults}
    tenantId={tenantId}
    planName={planName}
    detectedPeriods={detectedPeriods}
  />
)}
```

### 6C: Ensure file upload prompt disappears during execution

The current bug (F-CLT137-08, F-CLT137-20) shows "Drop a file" during execution. The fix: when `executing` or `executionComplete` is true, the upload dropzone must not render.

```tsx
{!proposal && !executing && !executionComplete && (
  <UploadDropzone onFileSelect={handleFileSelect} />
)}
```

**Commit:** `OB-138 Phase 6: Wire components into import page — replace current proposal rendering`

---

## PHASE 7: FILE SUMMARY HEADER

**Goal:** After analysis, show a file-level summary above the content unit cards.

```
┌──────────────────────────────────────────────────────────────────┐
│  📄 BacktTest_Optometrista_mar2025_Proveedores.xlsx              │
│     8 content units · 65,109 total rows                          │
│                                                                  │
│  I found roster data, performance targets, and operational       │
│  data across 8 content units. 2 need your review.               │
└──────────────────────────────────────────────────────────────────┘
```

This summary is generated from the SCI proposal data:
- File name(s)
- Content unit count
- Total row count
- Plain-language summary of what was found (from classification mix)
- Review count if any

**Commit:** `OB-138 Phase 7: File summary header`

---

## PHASE 8: REGRESSION + BUILD

### 8A: Build clean

```bash
cd web && rm -rf .next && npm run build
# Must exit 0
```

### 8B: Localhost verification

```bash
npm run dev
# Verify:
# 1. Login at localhost:3000
# 2. Navigate to Operate → Import
# 3. Upload dropzone renders correctly
# 4. (If SCI API is functional) Upload a test file and verify proposal cards render
# 5. Expanded cards show observations, reasoning, falsifiability
# 6. Confirm all → Execute → Progress shows step-by-step
# 7. Ready state shows summary + Calculate button
```

### 8C: Korean Test

```bash
grep -rn "compensation\|commission\|loan\|officer\|mortgage\|insurance\|deposit\|referral\|salary\|payroll\|bonus\|optometr\|óptica\|tienda\|empleado\|cobranza\|garantía\|protección\|venta" \
  web/src/components/sci/ --include="*.tsx" --include="*.ts" \
  | grep -v node_modules | grep -v "\.test\.\|COMPLETION" || echo "KOREAN TEST: PASS — 0 domain matches"
```

### 8D: No auth modifications

```bash
echo "=== AUTH FILES UNCHANGED ==="
git diff --name-only HEAD | grep -E "middleware|auth-service|session-context|auth-shell" && echo "⚠️ AUTH MODIFIED" || echo "✅ AUTH UNTOUCHED"
```

**Commit:** `OB-138 Phase 8: Build clean + localhost verification + Korean Test`

---

## PHASE 9: COMPLETION REPORT + PR

Create `OB-138_COMPLETION_REPORT.md` with:

1. **What was built:** Per-component summary (ContentUnitCard, ProposalSummaryBar, ExecutionProgress, ImportReadyState)
2. **API extensions:** What was added to the analyze response (observations, verdictSummary, whatChangesMyMind)
3. **What the user sees:** Before/after description of the import experience
4. **All proof gates with evidence**

```bash
gh pr create --base main --head dev \
  --title "OB-138: SCI Proposal Intelligence UI — DS-006 v2" \
  --body "## Import Experience Evolution

### What Changed
The SCI import page now surfaces the structural intelligence the agents compute:
- Content unit cards show 3-layer intelligence: observations, reasoning, falsifiability
- Summary bar: confident/review/total counts at a glance
- Processing: full-screen step-by-step progress (no more 'Drop a file' during execution)
- Ready state: import summary → Calculate bridge with period detection

### Design Reference
DS-006 v2 (Universal Import Experience) — domain-agnostic, content-driven

### CLT-137 Findings Addressed
F-06, F-08, F-11, F-12, F-15, F-18, F-20, F-22, F-23

### Korean Test
0 domain vocabulary in new components"
```

**Commit:** `OB-138 Phase 9: Completion report + PR`

---

## PROOF GATES

| # | Gate | Criterion |
|---|------|-----------|
| PG-01 | npm run build exits 0 | Clean build |
| PG-02 | ContentUnitCard renders collapsed state | Tab name + verdict + rows + confidence visible |
| PG-03 | ContentUnitCard renders expanded state | Observations, reasoning, falsifiability visible |
| PG-04 | ProposalSummaryBar shows counts | Confident/review/total rows |
| PG-05 | Confirm all works | All checkboxes set, Import button enabled |
| PG-06 | ExecutionProgress replaces upload area | No "Drop a file" during processing |
| PG-07 | ExecutionProgress shows per-item status | Done/active/pending/failed states |
| PG-08 | ImportReadyState shows summary | Records, entities, components, period, plan |
| PG-09 | ImportReadyState links to Calculate | Button navigates to /operate/calculate |
| PG-10 | Classification override buttons render | 4 options, current highlighted |
| PG-11 | Close-score warning renders | Amber panel when gap < 10% |
| PG-12 | Korean Test | 0 domain vocabulary in components/sci/ |
| PG-13 | Auth files unchanged | No modifications to auth chain |
| PG-14 | localhost:3000 responds | HTTP 200/307 |

---

## CC FAILURE PATTERN WARNING

| Pattern | Risk | Prevention |
|---------|------|------------|
| Skeleton components | CC builds structure, skips intelligence rendering | DS-006 v2 prototype defines EXACT content per state. Proof gates check rendered content, not component existence. |
| White space / light mode | CC defaults to light backgrounds | Explicit dark theme classes in spec. All backgrounds zinc-900 or darker. |
| Missing data handling | API returns null for new fields, UI crashes | Every new field has fallback: observations → [], verdictSummary → classification label, whatChangesMyMind → "". |
| Domain vocabulary leakage | CC uses "compensation" in button labels | Korean Test at Phase 8. Classification labels use structural descriptions, not domain terms. |

---

## DEPENDENCY: OB-136

OB-138 can be built **independently** of OB-136. The UI components work with whatever data the API returns. However:
- **ImportReadyState** will show richer data after OB-136 (detected periods, convergence bindings, entity dedup count)
- If OB-136 hasn't landed yet, ImportReadyState shows what's available and gracefully omits what's not
- The "Calculate [Period] →" button works regardless — it navigates to Calculate with the tenant context

Build OB-138 first on a separate branch if needed. Merge after OB-136.

---

## ESTIMATED DURATION

- Phase 0: Diagnostic — 20 min
- Phase 1: API extension — 45 min
- Phase 2: ContentUnitCard — 60 min (CORE)
- Phase 3: ProposalSummaryBar — 15 min
- Phase 4: ExecutionProgress — 30 min
- Phase 5: ImportReadyState — 30 min
- Phase 6: Wire into page — 45 min
- Phase 7: File summary header — 15 min
- Phase 8: Regression — 15 min
- Phase 9: Completion report — 10 min

**Total: ~4.5 hours**

---

*"The agents do real analytical work. The UI should show the thinking, not just the label."*
