# OB-92: UNIFIED OPERATE LIFECYCLE — PLAN × PERIOD × DATA → CALCULATE → RECONCILE

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply, especially:
   - **Rule 24 (NEW): One canonical location per surface.** No duplicate pages across workspaces. Reconciliation lives in Operate.
   - **Rule 23: The Bloodwork Principle.** Default: clean summary. Anomalies surface with context. Full panel on demand.
2. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query

**If you have not read both files, STOP and read them now.**

---

## WHY THIS OB EXISTS

CLT-91 browser verification revealed that the calculation engine achieves 100% accuracy (MX$1,253,832 exact match against ground truth) but this achievement is **invisible in the browser**:

1. **No batch/period selector on Results Dashboard** — the browser shows whatever the most recent calculation batch is, with no way to navigate to the proven batch (F-14)
2. **Wrong numbers displayed** — Pipeline Test Co shows MX$1,262,865 from an unknown Feb 2026 batch instead of the proven Jan 2024 ground truth match (F-02, F-13)
3. **Plan × Period × Data not user-controllable** — P0 finding F-46 has been open across MULTIPLE CLT cycles. The user cannot select which plan, which period, and which data batch to calculate against
4. **Reconciliation unreachable** — both entry points (Operate > Reconcile, Govern > Reconciliation) fail back to parent page (F-01, F-06)
5. **Anomaly display is a flat wall** — violates Bloodwork Principle (F-15, F-16)

### The Unified Lifecycle

These are NOT separate features. They are one operational flow:

```
SELECT PLAN → SELECT PERIOD → SELECT/UPLOAD DATA → CALCULATE → VIEW RESULTS → RECONCILE → APPROVE
```

This OB builds the unified Operate surface that makes this flow real.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
7. **Domain-agnostic always.** The Operate surface works for any domain, not just ICM.
8. **Reconciliation canonical route: `/operate/reconciliation`** (Standing Rule 24).

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT STATE

```bash
echo "============================================"
echo "OB-92 PHASE 0: OPERATE SURFACE DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: CURRENT OPERATE PAGES ==="
find web/src/app/operate -name "page.tsx" | sort

echo ""
echo "=== 0B: CURRENT RESULTS/CALCULATION PAGES ==="
find web/src/app -path "*result*" -name "page.tsx" -o -path "*calculat*" -name "page.tsx" | sort

echo ""
echo "=== 0C: CURRENT RECONCILIATION PAGES ==="
find web/src/app -path "*reconcil*" -name "page.tsx" | sort

echo ""
echo "=== 0D: PERIOD SELECTOR COMPONENT ==="
find web/src -name "*period*" -o -name "*Period*" | grep -E "\.tsx$" | sort

echo ""
echo "=== 0E: BATCH/CALCULATION RUN DATA ==="
# How many calculation batches exist for Pipeline Test Co?
cat << 'SQL'
-- Run in Supabase SQL Editor or via script:
SELECT id, tenant_id, status, period_id, total_payout, entity_count, created_at
FROM calculation_batches
WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c'
ORDER BY created_at DESC;
SQL

echo ""
echo "=== 0F: PERIODS FOR PIPELINE TEST CO ==="
cat << 'SQL'
SELECT id, name, start_date, end_date, status, created_at
FROM periods
WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c'
ORDER BY start_date;
SQL

echo ""
echo "=== 0G: RULE SETS (PLANS) FOR PIPELINE TEST CO ==="
cat << 'SQL'
SELECT id, name, status, component_count, created_at
FROM rule_sets
WHERE tenant_id = 'dfc1041e-7c39-4657-81e5-40b1cea5680c'
ORDER BY created_at;
SQL

echo ""
echo "=== 0H: CURRENT RESULTS DASHBOARD COMPONENT ==="
find web/src -name "*ResultsDashboard*" -o -name "*results-dashboard*" -o -name "*ResultsProof*" | grep -E "\.tsx$" | sort
# Read the component to understand current data source
for f in $(find web/src -name "*ResultsDashboard*" -o -name "*results-dashboard*" -o -name "*ResultsProof*" | grep -E "\.tsx$"); do
  echo "--- FILE: $f ---"
  head -100 "$f"
done

echo ""
echo "=== 0I: CURRENT ANOMALY DISPLAY COMPONENT ==="
find web/src -name "*anomal*" -o -name "*Anomal*" | grep -E "\.tsx$" | sort

echo ""
echo "=== 0J: RECONCILIATION ENGINE/SERVICE ==="
find web/src -name "*reconcil*" | grep -E "\.ts$\|\.tsx$" | sort

echo ""
echo "=== 0K: PIPELINE PROOF CO INVESTIGATION ==="
cat << 'SQL'
-- What tenants exist with "Pipeline" or "Proof" in the name?
SELECT id, name, slug, created_at
FROM tenants
WHERE name ILIKE '%pipeline%' OR name ILIKE '%proof%';
SQL
```

**PASTE ALL OUTPUT.** This diagnostic determines the exact implementation plan.

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 0: Operate surface diagnostic" && git push origin dev`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: The Operate workspace needs a unified lifecycle surface that
connects Plan × Period × Data selection → Calculation → Results → Reconciliation.
Currently these are scattered across unconnected pages with no batch navigation.

Option A: Unified single-page Operate surface with tabbed sections
  - One page at /operate with tabs: Setup | Results | Reconciliation
  - Plan/Period/Data selector is the page header (always visible)
  - Tabs navigate sections, not routes
  - Scale test: YES — single data context, no re-fetching between tabs
  - AI-first: YES — no hardcoded plan names
  - Atomicity: YES — one page, one state

Option B: Multi-page with shared context provider
  - Separate pages: /operate/calculate, /operate/results, /operate/reconciliation
  - Shared OperateContext provides selected plan, period, batch
  - Sidebar links to each page
  - Scale test: YES
  - AI-first: YES
  - Atomicity: PARTIAL — context persists but page transitions can drop state

Option C: Wizard-style linear flow
  - Step 1 → Step 2 → Step 3 forced progression
  - Scale test: NO — doesn't support jumping to reconciliation for an existing batch
  - Rejected immediately

CHOSEN: Option B — Multi-page with shared OperateContext
REASON: Matches existing Next.js routing. Sidebar navigation is familiar.
Shared context ensures plan/period/batch selection persists across pages.
Each page can be deep-linked. Reconciliation gets its canonical /operate/reconciliation route.

REJECTED: Option A — tabbed single-page would work but fights Next.js conventions.
REJECTED: Option C — too rigid for operational workflows.
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 1: Architecture decision — multi-page with OperateContext" && git push origin dev`

---

## PHASE 2: OPERATE CONTEXT PROVIDER

### 2A: Create OperateContext

Create `web/src/contexts/operate-context.tsx`:

This context holds the user's current selections and persists them across navigation within the Operate workspace.

**State:**
```typescript
interface OperateState {
  // Plan selection
  selectedPlanId: string | null;
  selectedPlan: RuleSet | null;

  // Period selection
  selectedPeriodId: string | null;
  selectedPeriod: Period | null;

  // Calculation batch selection
  selectedBatchId: string | null;
  selectedBatch: CalculationBatch | null;

  // Available options (loaded from Supabase)
  plans: RuleSet[];
  periods: Period[];
  batches: CalculationBatch[];

  // Actions
  selectPlan: (planId: string) => void;
  selectPeriod: (periodId: string) => void;
  selectBatch: (batchId: string) => void;
  refreshBatches: () => Promise<void>;
}
```

**Requirements:**
1. Load plans, periods, and batches from Supabase for the current tenant
2. When a plan is selected, filter periods to those relevant to that plan
3. When a period is selected, load calculation batches for that plan+period combination
4. Default selection: most recent plan, most recent period, most recent batch
5. Persist selections in sessionStorage so they survive page navigation
6. ALL Supabase queries use tenant_id from auth context
7. Batch `.in()` calls must be ≤200 items (Supabase URL length limit)

### 2B: Wrap Operate layout

Create or modify `web/src/app/operate/layout.tsx` to wrap all Operate pages in OperateContext:

```tsx
import { OperateProvider } from '@/contexts/operate-context';

export default function OperateLayout({ children }: { children: React.ReactNode }) {
  return <OperateProvider>{children}</OperateProvider>;
}
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | OperateContext loads plans from Supabase | `plans.length > 0` for Pipeline Test Co |
| PG-2 | OperateContext loads periods | `periods.length > 0` |
| PG-3 | OperateContext loads batches for selected plan+period | `batches.length > 0` |
| PG-4 | Selection persists in sessionStorage | Navigate away and back, selections retained |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 2: OperateContext provider" && git push origin dev`

---

## PHASE 3: PLAN × PERIOD × BATCH SELECTOR BAR

### 3A: Create the OperateSelector component

Create `web/src/components/operate/OperateSelector.tsx`:

A horizontal bar that appears at the top of every Operate page (below the period ribbon, above page content). Three connected selectors:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Plan: [RetailCorp Optometrist ▼]  Period: [January 2024 ▼]  Batch: [Preview — MX$1,253,832 ▼]  │
└─────────────────────────────────────────────────────────────────────┘
```

**Requirements:**
1. **Plan dropdown:** Shows all rule_sets for the tenant. Display: plan name. Selected plan filters available periods.
2. **Period dropdown:** Shows periods relevant to the selected plan. Display: human-readable period name (e.g., "January 2024"), NOT raw IDs. Include period status (Draft, Preview, Official, etc.).
3. **Batch dropdown:** Shows calculation batches for the selected plan+period. Display format: `{lifecycle_state} — {currency}{total_payout}` (e.g., "Preview — MX$1,253,832"). Most recent batch selected by default.
4. If only one option exists for any selector, show it as static text (no dropdown needed).
5. Selectors cascade: changing plan resets period and batch. Changing period resets batch.
6. The bar consumes OperateContext — no local state.
7. Empty states: "No plans found" / "No periods for this plan" / "No calculations yet — run a calculation"

### 3B: Add OperateSelector to Operate pages

Add `<OperateSelector />` to the top of:
- `/operate/page.tsx` (Operations Center)
- `/operate/results/page.tsx` (Results Dashboard)
- `/operate/reconciliation/page.tsx` (Reconciliation — canonical location)
- `/operate/calculate/page.tsx` (if exists)

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-5 | Plan dropdown shows plans for Pipeline Test Co | At least 1 plan visible |
| PG-6 | Period dropdown shows periods | Human-readable names, not UUIDs |
| PG-7 | Batch dropdown shows calculation batches | Format: "{state} — MX${total}" |
| PG-8 | Cascade works | Changing plan resets period and batch selections |
| PG-9 | Selector visible on Operations Center | Bar renders above lifecycle subway |
| PG-10 | Selector visible on Results Dashboard | Bar renders above results content |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 3: Plan x Period x Batch selector bar" && git push origin dev`

---

## PHASE 4: RESULTS DASHBOARD — BATCH-AWARE

### 4A: Wire Results Dashboard to selected batch

The Results Dashboard currently loads the most recent batch with no user control. Modify it to:

1. Read `selectedBatch` from OperateContext
2. Load `calculation_results` for the selected batch only (WHERE `batch_id = selectedBatchId`)
3. Display the batch metadata: period name, lifecycle state, entity count, total payout, calculation timestamp
4. If no batch is selected, show empty state: "Select a calculation batch above to view results"

### 4B: Results Summary Cards

The top of Results Dashboard shows summary cards. These MUST read from the selected batch:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total Payout │ │  Entities    │ │    Mean      │ │   Median     │ │ Components   │
│ MX$1,253,832 │ │     719      │ │ MX$1,743.86  │ │ MX$1,550.00  │ │      6       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### 4C: Component Breakdown

Below summary cards, show component totals:

```
Component                          Total          Entities    Avg Payout
─────────────────────────────────────────────────────────────────────────
Optical Sales                  MX$748,600          719       MX$1,041.17
Store Sales                    MX$116,250          719         MX$161.68
New Customers                   MX$39,100          719          MX$54.38
Collections                    MX$283,000          719         MX$393.60
Insurance                           MX$10          719           MX$0.01
Warranty                        MX$66,872          719          MX$93.01
─────────────────────────────────────────────────────────────────────────
TOTAL                        MX$1,253,832          719       MX$1,743.86
```

Each component row is clickable → expands to show entity-level detail (top 20 by payout, with "Show all" option).

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-11 | Results load for selected batch | Changing batch dropdown updates all numbers |
| PG-12 | Total matches selected batch | MX$1,253,832 for the GT batch in Pipeline Proof Co (or equivalent in Pipeline Test Co) |
| PG-13 | Component breakdown shows 6 components | Names, totals, entity counts all populated |
| PG-14 | Component click expands entity detail | Top entities by payout visible |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 4: Batch-aware Results Dashboard" && git push origin dev`

---

## PHASE 5: BLOODWORK ANOMALY DISPLAY

### 5A: Replace flat anomaly list

The current Results Dashboard shows anomalies as an undifferentiated wall of amber "identical values" badges. Replace with Bloodwork Principle (Standing Rule 23):

**Layer 1 — Summary cards (DEFAULT VIEW):**
```
┌─────────────────────────────────────────────────────────────┐
│  Anomalies: 47 detected                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ 0 Critical │  │ 12 Warning │  │ 35 Info    │            │
│  │            │  │            │  │            │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│  [Expand Details ▼]                                         │
└─────────────────────────────────────────────────────────────┘
```

If 0 critical and 0 warnings: show a single green "All checks passed" card. **Passing checks build confidence silently.**

**Layer 2 — Grouped warnings (EXPAND):**
Click "Expand Details" to see anomalies grouped by type:

```
⚠️ Identical Payouts (12 warnings)
   83 entities at $1,500 · 62 entities at $1,200 · ...
   Context: Common in tiered rate tables. Review if unexpected.

ℹ️ Identical Payouts — Expected (35 info)
   50 entities at $2,200 · 45 at $1,700 · ...
   These values align with known tier boundaries.
```

**Layer 3 — Full panel (ON DEMAND):**
"Show All Anomalies" reveals the full flat list — but only when explicitly requested.

### 5B: Anomaly severity classification

Currently all anomalies show as amber "identical values" with no differentiation. Add severity logic:

- **Critical:** Zero payouts for entities that have non-zero metrics (something is wrong)
- **Warning:** Large clusters of identical payouts at values that don't align with known tier boundaries
- **Info:** Identical payouts that align with tier boundaries in the plan (expected behavior)

This classification should be computed from the plan's rate table structure if available — identical payouts at exact tier boundary values are EXPECTED, not anomalous.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-15 | Anomaly summary cards show counts by severity | Critical / Warning / Info counts visible |
| PG-16 | Default view is summary only | NOT a flat list on page load |
| PG-17 | Expand reveals grouped anomalies | Anomalies grouped by type with context |
| PG-18 | Full list available on demand | "Show All" reveals complete list |
| PG-19 | Zero-anomaly state is clean | "All checks passed" — no scary empty tables |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 5: Bloodwork anomaly display" && git push origin dev`

---

## PHASE 6: RECONCILIATION PAGE — CANONICAL LOCATION

### 6A: Ensure `/operate/reconciliation` is the canonical route

If HF-058 has already been merged, this route should exist. If not, create it by moving the functional reconciliation page to `/operate/reconciliation/page.tsx`.

### 6B: Wire reconciliation to OperateContext

The reconciliation page reads `selectedBatch` from OperateContext. It compares the selected batch's results against an uploaded benchmark file (ground truth).

**Requirements:**
1. Page header shows: Plan name, Period name, Batch state and total
2. "Upload Benchmark File" button for ground truth comparison
3. After upload + comparison, display the Reconciliation Report (OB-91):
   - Executive summary: overall match %, entity match count
   - Component status: per-component VL vs benchmark comparison
   - Entity detail: drill into any component for per-entity comparison
   - Findings: prioritized findings with severity and recommended action
4. XLSX export (3 sheets — OB-91 already built this engine)
5. The reconciliation comparison engine from OB-87 is the data source — do NOT rebuild it

### 6C: Reconciliation Report layout

Follow the `ViaLuce_Reconciliation_Report_Specification.md` (in project knowledge). The Phase 1 scope:

```
┌──────────────────────────────────────────────────────────────────┐
│  RECONCILIATION REPORT — January 2024                            │
│  Pipeline Test Co · 719 Entities · 6 Components                  │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │   OVERALL MATCH    │  │   ENTITY MATCH     │                 │
│  │      100.0%        │  │    719 / 719       │                 │
│  │   MX$1,253,832     │  │    100% exact      │                 │
│  └────────────────────┘  └────────────────────┘                 │
│                                                                  │
│  Component Status:                                               │
│  ✅ Optical Sales    $748,600 = $748,600     0.0%               │
│  ✅ Store Sales      $116,250 = $116,250     0.0%               │
│  ✅ New Customers     $39,100 =  $39,100     0.0%               │
│  ✅ Collections      $283,000 = $283,000     0.0%               │
│  ✅ Insurance             $10 =      $10     0.0%               │
│  ✅ Warranty          $66,872 =  $66,872     0.0%               │
│                                                                  │
│  [Download XLSX]                                                 │
└──────────────────────────────────────────────────────────────────┘
```

Click any component to expand entity-level detail.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-20 | `/operate/reconciliation` loads | HTTP 200, not redirect or fallback |
| PG-21 | Reconciliation reads from OperateContext | Selected batch displayed in header |
| PG-22 | Benchmark upload triggers comparison | OB-87 comparison engine runs |
| PG-23 | Executive summary displays | Match %, entity count, component status |
| PG-24 | Component drill-down works | Click component → entity-level detail |
| PG-25 | XLSX export downloads | 3-sheet workbook |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 6: Reconciliation at canonical /operate/reconciliation" && git push origin dev`

---

## PHASE 7: OPERATIONS CENTER UPDATE

### 7A: Wire Operations Center to OperateContext

The Operations Center (`/operate/page.tsx`) currently shows the lifecycle subway, data preparation, and calculation summary. Wire it to OperateContext:

1. The OperateSelector bar appears at the top
2. The lifecycle subway reflects the selected batch's lifecycle state
3. Calculation summary reads from the selected batch
4. "Start Reconciliation →" button navigates to `/operate/reconciliation` with the current selections preserved

### 7B: Remove redundant data fetching

The Operations Center currently fetches its own calculation data independently. Replace with OperateContext data to eliminate duplicate fetching.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-26 | Operations Center shows OperateSelector | Plan/Period/Batch dropdowns visible |
| PG-27 | Lifecycle subway matches selected batch | State reflects batch status |
| PG-28 | "Start Reconciliation" navigates correctly | Lands on /operate/reconciliation with selections preserved |
| PG-29 | No duplicate data fetching | Network tab shows shared context queries, not page-specific re-fetches |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Phase 7: Operations Center wired to OperateContext" && git push origin dev`

---

## PHASE 8: BUILD + VERIFICATION + COMPLETION

### 8A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0

npm run dev &
sleep 5
```

### 8B: Route verification

```bash
echo "=== ROUTE VERIFICATION ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate/results
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate/reconciliation
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/operate/calculate
# ALL should return 200
```

### 8C: Completion Report

Create `OB-92_COMPLETION_REPORT.md` at project root with:

1. Phase 0 diagnostic findings (tenant/batch investigation)
2. OperateContext: state structure, persistence, cascade behavior
3. OperateSelector: all three dropdowns functioning
4. Results Dashboard: batch-aware, component breakdown
5. Bloodwork anomaly display: summary → grouped → full
6. Reconciliation: canonical route, report display, XLSX export
7. Operations Center: wired to context
8. All proof gates with PASS/FAIL and evidence
9. Network request count before/after (N+1 improvement from shared context)

### 8D: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-92: Unified Operate Lifecycle — Plan × Period × Data → Calculate → Reconcile" \
  --body "## What This OB Delivers

### OperateContext Provider
- Shared state for Plan, Period, and Batch selection across all Operate pages
- Cascading selection: Plan → Period → Batch
- SessionStorage persistence across navigation
- Eliminates duplicate data fetching

### Plan × Period × Batch Selector Bar
- Three connected dropdowns at the top of every Operate page
- Human-readable labels (not UUIDs)
- Cascade logic: changing plan resets period and batch
- Empty states with clear guidance

### Batch-Aware Results Dashboard
- Results load for the SELECTED batch (not just most recent)
- Summary cards: Total, Entities, Mean, Median, Components
- Component breakdown table with entity drill-down
- Addresses CLT-91 F-02, F-13, F-14

### Bloodwork Anomaly Display
- Summary cards by severity (Critical / Warning / Info)
- Grouped anomalies on expand
- Full list on demand only
- Zero-anomaly state: clean confidence message
- Addresses CLT-91 F-15, F-16 + Standing Rule 23

### Reconciliation at Canonical Route
- /operate/reconciliation is the ONE reconciliation page (Standing Rule 24)
- Reads from OperateContext
- Executive summary, component drill-down, entity detail
- XLSX export (3 sheets)
- Addresses CLT-91 F-01, F-06

### Operations Center Integration
- OperateSelector at top of Operations Center
- Lifecycle subway reflects selected batch
- Start Reconciliation navigates to canonical route

## CLT-91 Findings Addressed: F-01, F-02, F-06, F-13, F-14, F-15, F-16, F-46
## Proof Gates: 29
## Standing Rules Enforced: 23 (Bloodwork), 24 (Canonical Locations)"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-27 | `npm run build` exits 0 | Clean build |
| PG-28 | All Operate routes return 200 | /operate, /results, /reconciliation, /calculate |
| PG-29 | PR created | URL pasted |

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-92 Complete: Unified Operate Lifecycle" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- OperateContext with Plan × Period × Batch selection
- Selector bar on all Operate pages
- Batch-aware Results Dashboard
- Bloodwork anomaly display (summary → expand → full)
- Reconciliation at canonical `/operate/reconciliation`
- Operations Center integration

### OUT OF SCOPE — DO NOT BUILD
- Persona/role-based navigation filtering (separate OB-93)
- N+1 query optimization (separate OB-94)
- New calculation engine runs
- Data upload / import pipeline changes
- Dispute workflow
- Approval workflow
- Plan anomaly detection UI changes (OB-91 already built this)
- Multi-plan per tenant support (future — but the selector supports it architecturally)

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Hardcoded batch IDs or tenant IDs | All IDs from OperateContext → Supabase queries |
| AP-2 | Duplicate data fetching | OperateContext is the SINGLE source for Operate pages |
| AP-3 | Raw UUIDs in UI | Human-readable labels everywhere |
| AP-4 | Flat anomaly list | Bloodwork: summary → grouped → full |
| AP-5 | Duplicate reconciliation routes | ONE canonical route at /operate/reconciliation |
| AP-6 | Supabase `.in()` > 200 items | Batch all .in() calls ≤200 |
| AP-7 | Page-specific Supabase clients | Use shared context, not component-level createClient() |

---

*ViaLuce.ai — The Way of Light*
*OB-92: The operating surface that proves the engine.*
*"Select your plan. Select your period. See your truth. Six components. Zero delta. Exact."*
