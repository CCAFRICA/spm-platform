# OB-170: INTELLIGENCE STREAM PHASE A — FIVE ELEMENTS + ACTION PROXIMITY

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference for every Supabase query
3. `PRE_PROMPT_COMPLIANCE_DIRECTIVE.md` — the 10-gate checklist applies to every phase

**If you have not read all three files, STOP and read them now.**

---

## WHY THIS OB EXISTS

The `/stream` page renders real data but operates as a static dashboard. It shows the same four sections in the same order regardless of tenant state. Intelligence elements lack action buttons. The Five Elements test (value + context + comparison + action + impact) fails on every section. This violates DS-013 (Platform Experience Architecture) and DS-015 (Intelligence Stream Evolution).

**Decision 128 (LOCKED):** `/stream` is the canonical landing route for all authenticated users.
**Decision 129 (LOCKED):** Container layout is stable across visits. Content adapts based on tenant state.

This OB evolves the existing `/stream` page to:
1. Read tenant state and render sections ranked by relevance
2. Pass the Five Elements test on every intelligence element
3. Embed action buttons in every element (Action Proximity)
4. Show context-aware content (uncalculated periods, missing data, reconciliation status)

This is NOT a rewrite. The existing data wiring, component structure, and route stay. We evolve what's there.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not hardcode values.
7. **Domain-agnostic always.** Component names from rule_sets, entity names from entities, period labels from periods. ZERO hardcoded domain terms.
8. **FP-67 GATE:** If any section shows data without an action button, it is a dashboard element, not intelligence. Every element must tell the user what to DO.

---

## CRITICAL CONTEXT

### What Currently Exists on /stream

The Meridian tenant's /stream page shows:
- **System Health:** Total payout (MX$185,063), entity count (67), component count (5), period label
- **Lifecycle:** Stepper showing DRAFT → PREVIEW → RECONCILE → OFFICIAL → APPROVED → POSTED → CLOSED → PAID → PUBLISHED. Current state highlighted. "Advance to PREVIEW" and "Start Reconciliation" buttons.
- **Optimization Opportunities:** Cards showing components with zero-payout entities (e.g., "Revenue Performance – Senior: 4 entities with zero payout, Cost impact: MX$0.00") with "Simulate →" buttons
- **Population Distribution:** Histogram showing payout distribution with mean/median/std dev

### What Needs to Change

| Section | Current | Target |
|---------|---------|--------|
| System Health | Value + context only | + comparison (reconciliation status) + action (contextual: advance/calculate/import) + impact (what the action produces) |
| Lifecycle | Visual stepper + 2 buttons | + context (which periods are in which state) + action (next lifecycle step per period) |
| Optimization | Component cards + simulate | + impact (projected cost if threshold changed) + comparison (vs prior period if available) |
| Population | Histogram only | + comparison (vs prior period) + action (view entity detail) + impact (what distribution shape means) |
| **NEW: Action Required** | Does not exist | Shows uncalculated periods with data. "Calculate [period] now →" |
| **NEW: Pipeline Readiness** | Does not exist | Shows periods with no data. "Import data for [period] →" |

### BCL Tenant State (Post OB-169)

- Tenant ID: `b1c2d3e4-aaaa-bbbb-cccc-111111111111`
- 85 entities, 4 components, 6 periods (Oct 2025 – Mar 2026)
- **1 calculated period:** October 2025 ($44,590, 100% reconciliation)
- **5 uncalculated periods:** Nov 2025 – Mar 2026 (committed_data exists for all 6 months from the import)
- Active rule_set with 2 variants, 8 components (4 per variant)

### Key Schema References

- `calculation_batches`: `tenant_id`, `period_id`, `lifecycle_state`, `entity_count`, `summary`, `completed_at`
- `calculation_results`: `tenant_id`, `batch_id`, `entity_id`, `total_payout`, `components` (jsonb)
- `periods`: `tenant_id`, `label`, `canonical_key`, `start_date`, `end_date`, `status`
- `committed_data`: `tenant_id`, `period_id`, `data_type`
- `rule_sets`: `tenant_id`, `status`, `components` (jsonb)
- `reconciliation_sessions`: `tenant_id`, `period_id`, `status`, `summary` (jsonb)
- `entities`: `tenant_id`, `external_id`, `display_name`, `metadata`

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE CURRENT /stream PAGE (Zero Code Changes)

### 0A: Map the Current Implementation

```bash
# Find the /stream page
find web/src/app -path "*stream*" -name "page.tsx" | sort

# Find all components used on /stream
grep -rn "import" web/src/app/stream/page.tsx 2>/dev/null || \
grep -rn "import" web/src/app/\(authenticated\)/stream/page.tsx 2>/dev/null || \
find web/src/app -path "*stream*" -name "*.tsx" | head -20

# Find the data fetching layer
grep -rn "calculation_batches\|calculation_results\|supabase" web/src/app/*stream*/*.tsx 2>/dev/null | head -30

# Find existing intelligence/briefing components
find web/src/components -name "*intelligence*" -o -name "*briefing*" -o -name "*stream*" -o -name "*health*" -o -name "*lifecycle*" -o -name "*optimization*" | sort
```

### 0B: Document What Exists

Paste the following into the completion report:
1. **Page file path** — exact location of /stream page.tsx
2. **Data fetching** — how does the page get calculation data? (Context? Direct query? Server component?)
3. **Section components** — list each section component with its file path
4. **Action buttons** — list every existing action button with its onClick behavior
5. **Missing elements** — for each section, which of the Five Elements (value/context/comparison/action/impact) are missing?

### 0C: Check Tenant State Query Feasibility

Run these queries in Supabase SQL Editor to confirm the data is available for the State Reader:

```sql
-- BCL: periods with calculation batches
SELECT p.label, p.start_date, cb.lifecycle_state, cb.entity_count,
  (SELECT SUM(cr.total_payout) FROM calculation_results cr WHERE cr.batch_id = cb.id) as total
FROM periods p
LEFT JOIN calculation_batches cb ON cb.period_id = p.id AND cb.tenant_id = p.tenant_id
WHERE p.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY p.start_date;

-- BCL: periods with committed_data but no calculation
SELECT p.label, p.start_date,
  (SELECT COUNT(*) FROM committed_data cd WHERE cd.period_id = p.id AND cd.tenant_id = p.tenant_id) as data_rows,
  (SELECT COUNT(*) FROM calculation_batches cb WHERE cb.period_id = p.id AND cb.tenant_id = p.tenant_id) as batch_count
FROM periods p
WHERE p.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY p.start_date;

-- BCL: reconciliation status
SELECT rs.period_id, p.label, rs.status, rs.summary
FROM reconciliation_sessions rs
JOIN periods p ON rs.period_id = p.id
WHERE rs.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY rs.created_at DESC;
```

Paste ALL query results before proceeding.

**Commit:** `git add -A && git commit -m "OB-170 Phase 0: Diagnostic — current /stream page mapped" && git push origin dev`

---

## PHASE 1: STATE READER — TENANT CONTEXT COMPUTATION

### 1A: Create the State Reader

Create a new file: `web/src/lib/intelligence/state-reader.ts`

This is a pure function that takes a tenant ID and returns a TenantContext object. It runs ALL queries in a single Promise.all() batch.

```typescript
export interface TenantContext {
  // Period intelligence
  calculatedPeriods: Array<{
    periodId: string;
    label: string;
    startDate: string;
    lifecycleState: string;
    totalPayout: number;
    entityCount: number;
    hasReconciliation: boolean;
    reconciliationMatch?: number; // percentage
  }>;
  
  uncalculatedPeriodsWithData: Array<{
    periodId: string;
    label: string;
    startDate: string;
    dataRowCount: number;
  }>;
  
  emptyPeriods: Array<{
    periodId: string;
    label: string;
    startDate: string;
  }>;
  
  // Population intelligence
  entityCount: number;
  variantDistribution: Record<string, number>; // variant_name → count
  
  // Plan intelligence
  activeRuleSet: {
    id: string;
    name: string;
    componentCount: number;
    componentNames: string[];
  } | null;
  
  // Optimization intelligence
  zeroPayoutByComponent: Array<{
    componentName: string;
    entityCount: number;
    variantName?: string;
  }>;
  
  // Derived state
  crlTier: 'cold' | 'warm' | 'hot';
  mostRelevantPeriod: string; // the period that should be shown first
  hasTrajectoryData: boolean; // 3+ calculated periods
}
```

The `crlTier` is computed as:
- `cold`: 0-2 calculated periods
- `warm`: 3-6 calculated periods
- `hot`: 7+ calculated periods

The `mostRelevantPeriod` is:
- The most recent period with a completed calculation batch, OR
- The earliest period with data but no calculation (if no calculations exist yet)

### 1B: Wire the State Reader into /stream

The /stream page calls `getStateReader(tenantId)` on load. The result drives what sections render and in what order.

**DO NOT break the existing rendering.** If the state reader fails or returns empty data, the page falls back to the current static layout. Graceful degradation, not crash.

### Anti-Pattern Check
- **FP-49 (Schema Fabrication):** Every column name verified against SCHEMA_REFERENCE_LIVE.md
- **FP-73 (Backend fix, frontend not updated):** State reader is consumed by the /stream page in the same phase

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | state-reader.ts exists and exports getStateReader | File path + function signature |
| PG-2 | All queries use verified column names | grep confirms no fabricated columns |
| PG-3 | BCL returns correct state | 1 calculated period, 5 uncalculated with data, 0 empty |
| PG-4 | Meridian returns correct state | 1 calculated period, 0 uncalculated, 0 empty |
| PG-5 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-170 Phase 1: State Reader — TenantContext computation" && git push origin dev`

---

## PHASE 2: FIVE ELEMENTS EVOLUTION — UPGRADE EXISTING SECTIONS

Evolve each existing section to pass the Five Elements test. DO NOT rewrite from scratch. ADD the missing elements to what exists.

### 2A: System Health Section

**Current:** Value (total payout) + Context (entity count, component count, period)
**Add:**
- **Comparison:** Reconciliation status. If reconciliation run: "[X]% match against ground truth." If not: "No reconciliation run yet for this period."
- **Action:** Context-aware button:
  - If lifecycle_state = 'DRAFT': "Advance to Preview →"
  - If lifecycle_state = 'PREVIEW' and no reconciliation: "Run Reconciliation →" (links to /operate/reconciliation)
  - If reconciliation complete and lifecycle_state = 'PREVIEW': "Advance to Official →"
  - If uncalculated periods exist: secondary action "Calculate [next period] →" (links to /operate/calculate)
- **Impact:** Text below action: "Advancing to Preview makes results visible for review." / "Running reconciliation verifies accuracy against external source." / "Calculating November adds trajectory data across 2 periods."

### 2B: Lifecycle Section

**Current:** Visual stepper with current state
**Add:**
- **Comparison:** "October: PREVIEW. November-March: not yet calculated."
- **Action:** The stepper itself should have a clickable action on the current step
- **Impact:** "Completing the lifecycle to OFFICIAL freezes results for audit."

### 2C: Optimization Opportunities Section

**Current:** Component cards with zero-payout entities, "Simulate →" button
**Add:**
- **Impact:** "Cost impact: $0 currently. If minimum threshold lowered by 5%, projected additional payout: $[X] for [N] entities." (If not computable, show: "Simulate to see projected impact.")
- **Comparison:** If prior period exists, show: "Same component had [N] zero-payout entities last period" or "New this period" if no prior data

### 2D: Population Distribution Section

**Current:** Histogram with mean/median/std dev
**Add:**
- **Comparison:** If prior period exists, show delta: "Mean payout: $[X] (vs $[Y] last period, [+/-]Z%)"
- **Action:** "View Entity Detail →" button linking to entity list
- **Impact:** "Distribution shape: [normal/right-skewed/left-skewed]. [N] entities below median."

### Design Rules
- Action buttons use the persona accent color (indigo for admin, emerald for rep, amber for manager)
- Impact text is a lighter weight, smaller size beneath the action button — not competing for attention
- Comparison text uses reference frame convention from DS-003: benchmark lines, not just numbers

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-6 | System Health has all 5 elements | Value + context + comparison + action + impact visible |
| PG-7 | System Health action is context-aware | Different button text based on lifecycle_state |
| PG-8 | Optimization has impact text | Cost impact or "Simulate to see" shown |
| PG-9 | Population has comparison | Prior period delta or "First calculated period" note |
| PG-10 | Population has action button | "View Entity Detail →" visible and clickable |
| PG-11 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-170 Phase 2: Five Elements evolution — all sections upgraded" && git push origin dev`

---

## PHASE 3: NEW SECTIONS — ACTION REQUIRED + PIPELINE READINESS

### 3A: Action Required Section

This section appears ONLY when the State Reader identifies periods that have committed_data but no calculation_batch. For BCL, this is November 2025 through March 2026.

**Rendering:**

```
━━━ ACTION REQUIRED ━━━

5 periods ready to calculate

  November 2025    85 data rows    → Calculate Now
  December 2025    85 data rows    → Calculate Now
  January 2026     85 data rows    → Calculate Now
  February 2026    85 data rows    → Calculate Now
  March 2026       85 data rows    → Calculate Now
```

Each "Calculate Now" button links to `/operate/calculate` with the period pre-selected (via URL query parameter or context).

**Five Elements:**
- Value: "5 periods ready to calculate"
- Context: Period labels with data row counts
- Comparison: "October 2025 already calculated ($44,590)"
- Action: "Calculate Now →" per period
- Impact: "Calculating adds this period to your results. With 2+ periods, trajectory intelligence activates."

### 3B: Pipeline Readiness Section

This section appears ONLY when the State Reader identifies periods with no committed_data at all.

**Rendering:**

```
━━━ PIPELINE READINESS ━━━

[N] periods need data

  [Period Label]    No data imported    → Import Data
```

Each "Import Data" button links to `/operate/import`.

If ALL periods have data (BCL's current state), this section does NOT render. Silence = health (Bloodwork Principle).

### 3C: Section Ordering

The State Reader determines which sections render and their order:

1. **System Health** — always first (if any calculation exists)
2. **Action Required** — only if uncalculated periods with data exist (HIGH priority — user can act immediately)
3. **Pipeline Readiness** — only if empty periods exist (user needs to import)
4. **Reconciliation Status** — only if calculations exist without reconciliation
5. **Optimization Opportunities** — only if zero-payout or boundary-proximate entities
6. **Lifecycle** — always (shows overall lifecycle state)
7. **Population Distribution** — always (last, lowest priority for admin)

If a section has no data to show, it does NOT render. No empty cards, no "No data available" placeholders.

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-12 | Action Required renders for BCL | Shows 5 periods with "Calculate Now" buttons |
| PG-13 | Action Required does NOT render for Meridian | Meridian has no uncalculated periods with data |
| PG-14 | Pipeline Readiness does NOT render for BCL | BCL has data for all periods |
| PG-15 | Section ordering matches State Reader priority | System Health first, then Action Required, etc. |
| PG-16 | "Calculate Now" links to /operate/calculate | Navigation works |
| PG-17 | `npm run build` exits 0 | Clean build |

**Commit:** `git add -A && git commit -m "OB-170 Phase 3: Action Required + Pipeline Readiness sections" && git push origin dev`

---

## PHASE 4: BROWSER VERIFICATION (CLT-170)

### BCL Verification (Primary)

As BCL admin, navigate to vialuce.ai/stream (or localhost:3000/stream):

1. **System Health renders with all Five Elements:**
   - Value: $44,590
   - Context: 85 entities, 4 components, October 2025
   - Comparison: 100% reconciliation (or reconciliation status)
   - Action: Context-aware button (Advance to Preview / Calculate November / etc.)
   - Impact: Text describing what the action produces

2. **Action Required renders:**
   - Shows 5 uncalculated periods (Nov 2025 – Mar 2026)
   - Each has "Calculate Now →" button
   - Clicking a button navigates to /operate/calculate

3. **Pipeline Readiness does NOT render:**
   - BCL has data for all 6 periods — section should be absent

4. **Optimization Opportunities renders with impact:**
   - Zero-payout component cards have impact text

5. **Population Distribution has comparison and action:**
   - Action button "View Entity Detail →" visible

### Meridian Verification (Regression)

Switch to Meridian tenant:

1. **System Health shows MX$185,063** — no regression
2. **Action Required does NOT render** — Meridian has no uncalculated periods with data
3. **All existing sections still render** — no missing content

### Screenshot Evidence Required

Take screenshots of:
1. BCL /stream with System Health and Action Required visible
2. BCL /stream scrolled to show Optimization and Population sections
3. Meridian /stream showing no regression

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-18 | BCL System Health has 5 elements | All visible in screenshot |
| PG-19 | BCL Action Required shows 5 periods | Screenshot evidence |
| PG-20 | BCL Pipeline Readiness absent | Not visible (Bloodwork: silence = health) |
| PG-21 | Every section has at least one action button | Count buttons in screenshot |
| PG-22 | Meridian MX$185,063 | No regression |
| PG-23 | Meridian Action Required absent | Correct — no uncalculated periods |
| PG-24 | No console errors | Browser console clean |

**Commit:** `git add -A && git commit -m "OB-170 Phase 4: CLT-170 browser verification" && git push origin dev`

---

## PHASE 5: COMPLETION REPORT + PR

### 5A: Completion Report

Create `OB-170_COMPLETION_REPORT.md` at project root:

```markdown
# OB-170: Intelligence Stream Phase A — Completion Report

## Status: [COMPLETE / PARTIAL / FAILED]

## Phase 0: Diagnostic
- /stream page location: [path]
- Data fetching method: [context/query/server component]
- Sections found: [list]
- Missing Five Elements per section: [list]

## Phase 1: State Reader
- File: web/src/lib/intelligence/state-reader.ts
- BCL TenantContext: [paste key values]
- Meridian TenantContext: [paste key values]
- CRL tier: BCL = [cold/warm], Meridian = [cold/warm]

## Phase 2: Five Elements Evolution
- System Health: [5/5 elements present? Y/N]
- Lifecycle: [updated? Y/N]
- Optimization: [impact added? Y/N]
- Population: [comparison + action added? Y/N]

## Phase 3: New Sections
- Action Required: [renders for BCL? Y/N] [hidden for Meridian? Y/N]
- Pipeline Readiness: [hidden for BCL? Y/N]
- Section ordering: [matches spec? Y/N]

## Phase 4: CLT-170
- BCL Five Elements: [all sections pass? Y/N]
- BCL Action Required: [N periods shown]
- Meridian regression: [MX$185,063 confirmed? Y/N]
- Console errors: [none / list]

## Proof Gates Summary
[PG-1 through PG-24: PASS/FAIL for each]
```

### 5B: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-170: Intelligence Stream Phase A — Five Elements + Action Proximity" \
  --body "## What This Delivers

### DS-015 Phase A Implementation
- State Reader: TenantContext computation from live tenant data
- Five Elements on every /stream section (value, context, comparison, action, impact)
- Action Required section: shows uncalculated periods with data
- Pipeline Readiness section: shows periods needing data import
- Context-aware action buttons on every intelligence element
- Section ordering driven by State Reader priority

### Decisions Implemented
- Decision 128: /stream as canonical landing
- Decision 129: Container stability (layout fixed, content adapts)

### Proof
- BCL: System Health with 5 elements, Action Required showing 5 periods
- Meridian: MX\$185,063 confirmed, no regression
- Zero hardcoded domain terms (Korean Test)

## Proof Gates: see OB-170_COMPLETION_REPORT.md"
```

**Commit:** `git add -A && git commit -m "OB-170 Phase 5: Completion report + PR" && git push origin dev`

---

## PRODUCTION VERIFICATION — FOR ANDREW (Post-Merge)

After merging PR to main and Vercel deploys:

### Step 1: BCL Intelligence Stream
1. Login as Patricia (BCL admin) at vialuce.ai
2. Confirm /stream loads as landing page
3. Verify System Health shows $44,590 with all Five Elements
4. Verify Action Required shows 5 uncalculated periods
5. Click "Calculate Now" on November 2025 — verify navigation to /operate/calculate

### Step 2: Meridian Intelligence Stream
1. Switch to Meridian tenant
2. Verify /stream shows MX$185,063
3. Verify Action Required does NOT appear
4. Verify all existing sections still render

### Step 3: Read-Only Verification
```sql
-- Confirm state reader data is correct (READ ONLY)
SELECT p.label, p.start_date,
  (SELECT COUNT(*) FROM calculation_batches cb WHERE cb.period_id = p.id AND cb.tenant_id = p.tenant_id) as batches,
  (SELECT COUNT(*) FROM committed_data cd WHERE cd.period_id = p.id AND cd.tenant_id = p.tenant_id) as data_rows
FROM periods p
WHERE p.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY p.start_date;
```

**ZERO data-modifying SQL.** If any step fails, the OB is incomplete.

---

## WHAT SUCCESS LOOKS LIKE

Patricia logs into vialuce.ai. She lands on /stream. She sees immediately: "$44,590 earned in October, 100% reconciliation, 5 periods ready to calculate." She clicks "Calculate Now" on November and arrives at the calculation page with the period pre-selected. She doesn't browse a sidebar. She doesn't hunt for the right page. The intelligence stream told her what matters and gave her the button to act.

This is DS-013 Phase A made real. The container is stable. The content is smart. Every element has an action. The platform has stopped being a dashboard and started being an intelligence system.

---

*OB-170 — March 14, 2026*
*"The user does not navigate to intelligence. Intelligence finds the user."*
*vialuce.ai — Intelligence. Acceleration. Performance.*
