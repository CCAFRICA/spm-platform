# OB-46B: PERSONA SURFACES
## NEVER ask, just build. Full autonomy. Do not stop for confirmation.

---

## CONTEXT

This is Part B of the 3-part UI rebuild (OB-46A/B/C). OB-46A (PR #20, merged) created the design system foundation: 11 visualization components, persona context, persona-scoped data queries, 9-state lifecycle service, and PersonaLayout wrapper.

**OB-46B (this batch):** Builds the actual page surfaces — the content users see. Three persona-driven dashboard views (Admin/Manager/Rep), the Operate cockpit with lifecycle stepper, a Period Ribbon for multi-period awareness, and 10 new visualization components that extend the 46A design system.

**Key Design Decision (DS-002):** The Perform workspace is eliminated. Dashboard IS the persona view. Reps see their performance on the dashboard. There is no separate `/perform` route. The `/my-compensation` route provides deep drill-down into calculation details.

**What this batch does NOT do:** Navigation chrome, breadcrumbs, sidebar, persona switcher, auth gates — those are OB-46C.

---

## STANDING RULES

1. Always commit+push after every change
2. After every push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000
3. VL Admin: all users select preferred language. No forced English override.
4. Never provide CC with answer values — fix logic not data
5. Security/scale/performance by design not retrofitted. AI-first never hardcoded. Domain-agnostic always.
6. ViaLuce (formerly ClearComp). Domain: ViaLuce.ai. Supabase + Vercel + Cloudflare.
7. One commit per phase. Do NOT squash phases.
8. Completion report created BEFORE final build as a FILE at PROJECT ROOT.
9. If referencing anything from 46A, read the actual file first. Do not assume — verify.

### CC ANTI-PATTERNS TO AVOID
- **Placeholder Syndrome:** No `// TODO`, no stub functions, no "coming soon" in any component that is in scope.
- **Schema Disconnect:** Use EXACT column names from the schema reference below. Read 46A's actual `persona-queries.ts` before extending it.
- **Silent Fallbacks:** Every query that returns empty data renders an explicit empty state with guidance text, never a blank div.
- **Report Burial:** Completion report at PROJECT ROOT only.
- **Over-scope:** Do NOT touch navigation, sidebar, breadcrumbs, or auth. That is 46C.

---

## 46A FOUNDATION — WHAT YOU HAVE TO WORK WITH

Read these files FIRST before writing any code:

```
web/src/lib/design/tokens.ts                          — PERSONA_TOKENS, STATE_COMMUNICATION_TOKENS, WORKSPACE_TOKENS
web/src/components/design-system/index.ts              — Barrel export of 11 components
web/src/components/design-system/AnimatedNumber.tsx     — RAF counter
web/src/components/design-system/ProgressRing.tsx       — SVG circular progress
web/src/components/design-system/BenchmarkBar.tsx       — Bar with benchmark line
web/src/components/design-system/DistributionChart.tsx  — 5-bucket histogram
web/src/components/design-system/ComponentStack.tsx     — Stacked horizontal bar
web/src/components/design-system/RelativeLeaderboard.tsx — Rank with anonymized neighbors
web/src/components/design-system/GoalGradientBar.tsx    — Tier landmarks + gap text
web/src/components/design-system/Sparkline.tsx          — SVG trend line
web/src/components/design-system/StatusPill.tsx         — Consistent pill badges
web/src/components/design-system/QueueItem.tsx          — Priority-coded exception items
web/src/components/design-system/AccelerationCard.tsx   — Thermostat prescriptive card
web/src/contexts/persona-context.tsx                   — usePersona() hook, PersonaProvider
web/src/lib/data/persona-queries.ts                    — getAdminDashboardData, getManagerDashboardData, getRepDashboardData
web/src/lib/lifecycle/lifecycle-service.ts              — LIFECYCLE_STATES, transitionLifecycle, getNextAction
web/src/components/layout/PersonaLayout.tsx             — Gradient wrapper
web/src/components/layout/TopBar.tsx                    — Persona-aware top bar
```

**CRITICAL:** Run `cat` on each of these files before starting. The 46A prompt described INTENDED implementations. CC may have adapted column names, types, or function signatures. Use what was ACTUALLY built.

**Known adaptations from 46A:**
- CC may have used `visible_entity_ids` instead of `full_visibility_entity_ids` in queries — verify which was used
- CC used `period_id` for calculation_batch queries (correct — matches FK relationship)
- Lifecycle states may use lowercase internally — verify from `lifecycle-service.ts`
- The completion report confirmed `calculation_batch_id` as the FK column in calculation_results

---

## SUPABASE SCHEMA REFERENCE

EXACT table and column names. If in doubt, verify against `web/supabase/migrations/`.

```
tenants             (id, name, slug, settings JSONB, locale, currency_code, ...)
profiles            (id, tenant_id, display_name, role, entity_id UUID, capabilities TEXT[], ...)
entities            (id, tenant_id, external_id, entity_type, display_name, attributes JSONB, status, ...)
entity_relationships (id, tenant_id, source_entity_id, target_entity_id, relationship_type, ...)
rule_sets           (id, tenant_id, name, domain, components JSONB, status, ...)
rule_set_assignments (id, tenant_id, entity_id, rule_set_id, variant_key, ...)
periods             (id, tenant_id, period_key TEXT, period_type, label, start_date, end_date, status, ...)
calculation_batches (id, tenant_id, rule_set_id, period_id UUID, lifecycle_state TEXT, entity_count, total_payout, ...)
calculation_results (id, tenant_id, calculation_batch_id UUID, entity_id, period_label, components JSONB, total_payout, ...)
entity_period_outcomes (tenant_id, period_key, entity_id, entity_type, rule_set_outcomes JSONB, total_payout, ...)
profile_scope       (profile_id, tenant_id, full_visibility_entity_ids UUID[], ...)
```

Key queries the dashboard uses:
- **Admin:** `entity_period_outcomes` WHERE tenant_id = X AND period_key = Y (sees all)
- **Manager:** `entity_period_outcomes` WHERE tenant_id = X AND period_key = Y AND entity_id IN (scope.entityIds)
- **Rep:** `entity_period_outcomes` WHERE tenant_id = X AND period_key = Y AND entity_id = myEntityId
- **Lifecycle:** `calculation_batches` WHERE tenant_id = X AND period_id = Y ORDER BY calculated_at DESC LIMIT 1
- **Periods list:** `periods` WHERE tenant_id = X ORDER BY start_date DESC
- **Component detail:** `calculation_results` WHERE calculation_batch_id = X AND entity_id = Y

---

## PHASE 0: RECONNAISSANCE

Before writing code, audit what 46A actually built:

```bash
# Read the actual 46A files
cat web/src/lib/design/tokens.ts
cat web/src/contexts/persona-context.tsx
cat web/src/lib/data/persona-queries.ts
cat web/src/lib/lifecycle/lifecycle-service.ts
cat web/src/components/layout/PersonaLayout.tsx
cat web/src/components/layout/TopBar.tsx
cat web/src/components/design-system/index.ts

# Check existing page structure
find web/src/app -name "page.tsx" | sort

# Check existing dashboard
cat web/src/app/page.tsx 2>/dev/null || echo "No root page"
cat web/src/app/dashboard/page.tsx 2>/dev/null || echo "No dashboard page"

# Check existing operate page
find web/src/app -path "*operate*" -name "*.tsx" | head -10

# Check Supabase migration files for exact column names
ls web/supabase/migrations/ 2>/dev/null
```

Paste ALL output into completion report Phase 0 section. This establishes what you're building on.

**Commit:** `OB-46B Phase 0: Reconnaissance — audit 46A foundation and existing pages`

---

## PHASE 1: PERIOD RIBBON COMPONENT

The Period Ribbon is a layout-level element that sits between TopBar and page content on every surface. It shows all periods for the tenant with visual lifecycle state encoding.

Create `web/src/components/design-system/PeriodRibbon.tsx`:

### 1A: Interface

```typescript
interface PeriodInfo {
  periodId: string;           // UUID from periods table
  periodKey: string;          // '2024-01'
  label: string;              // 'Enero 2024' (from periods.label)
  status: string;             // 'open' | 'closed' | 'paid' from periods table
  lifecycleState: string | null; // from latest calculation_batch, null if no batch exists
  startDate: string;
  endDate: string;
  needsAttention: boolean;    // derived: has exceptions or pending actions
}

interface PeriodRibbonProps {
  periods: PeriodInfo[];
  activeKey: string;
  onSelect: (periodKey: string) => void;
}
```

### 1B: Visual Encoding

Each period renders as a compact pill/chip:
- **Completed (paid/published):** Muted opacity, checkmark icon, text-slate-500
- **Active (has calculation_batch):** Full opacity, accent border from persona tokens, lifecycle state shown as tiny subtitle
- **Needs attention:** Amber ring pulse animation
- **Future (no data):** Very subtle, text-slate-600, circle outline
- **Selected:** Elevated, slight scale, stronger border

### 1C: Period Context

Create `web/src/contexts/period-context.tsx`:

```typescript
interface PeriodContextValue {
  activePeriodKey: string;
  activePeriodId: string;
  availablePeriods: PeriodInfo[];
  setActivePeriod: (periodKey: string) => void;
  isLoading: boolean;
}
```

On mount, query:
1. `periods` table for all tenant periods (ordered by start_date DESC)
2. For each period, LEFT JOIN to get latest `calculation_batches.lifecycle_state`
3. Auto-select the most recent period with status = 'open', or latest if all closed

### 1D: Data Loading

```typescript
async function loadPeriods(tenantId: string): Promise<PeriodInfo[]> {
  // Get all periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, period_key, label, status, start_date, end_date')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false });

  // For each period, get latest calculation_batch lifecycle_state
  const enriched = await Promise.all(periods.map(async (p) => {
    const { data: batch } = await supabase
      .from('calculation_batches')
      .select('lifecycle_state')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      periodId: p.id,
      periodKey: p.period_key,
      label: p.label || p.period_key,
      status: p.status,
      lifecycleState: batch?.lifecycle_state || null,
      startDate: p.start_date,
      endDate: p.end_date,
      needsAttention: false, // will be enriched later
    };
  }));

  return enriched;
}
```

**IMPORTANT:** The N+1 query pattern above is acceptable for periods (typically <24 per tenant per year). Do NOT over-optimize this.

**Commit:** `OB-46B Phase 1: Period Ribbon component and Period Context provider`

---

## PHASE 2: LIFECYCLE STEPPER AND OPERATE COCKPIT COMPONENTS

### 2A: Lifecycle Stepper

Create `web/src/components/design-system/LifecycleStepper.tsx`:

Horizontal stepper showing all 9 lifecycle states with the current state highlighted. Read the actual states from `lifecycle-service.ts` — do not re-declare them.

Props: `currentState: string`, `onAdvance: (nextState: string) => void`, `canGoBack: boolean`

Each step shows:
- State name (in Spanish — use the labels from lifecycle-service.ts `getNextAction`)
- Dot indicator: completed (filled emerald), current (pulsing accent), future (outline slate)
- Connecting line between steps

### 2B: Data Readiness Panel

Create `web/src/components/design-system/DataReadinessPanel.tsx`:

Shows the readiness state of all prerequisites for calculation:

Props:
```typescript
interface DataReadiness {
  plan: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  data: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string };
  mapping: { status: 'ready' | 'missing' | 'warning'; label: string; detail?: string; confidence?: number };
  validation: { status: 'ready' | 'stale' | 'never'; label: string; detail?: string };
}
```

Each item renders as a row with status icon (✓ emerald, ⚠ amber, ✗ rose) + label + detail.

### 2C: Operate Cockpit Page

Replace or create `web/src/app/operate/page.tsx`:

This is the admin's lifecycle cockpit. Layout:

1. **Period Ribbon** at top (from Phase 1)
2. **Lifecycle Stepper** showing current state for selected period
3. **Two-column grid below:**
   - Left: DataReadinessPanel (plan, data, mapping, validation status)
   - Right: Calculation summary (total payout, entity count, component count, last run timestamp)
4. **Results preview area** — if calculation results exist for this period, render:
   - DistributionChart of attainment (from 46A)
   - Top 5 / Bottom 5 entities by payout using BenchmarkBar (from 46A)
5. **Next Action bar** at bottom — shows the next lifecycle action from `getNextAction()` with a primary button

Data loading:
```typescript
// Read from persona-queries.ts getAdminDashboardData — extend if needed
// Read lifecycle state from lifecycle-service.ts
// Read data readiness from: rule_sets (plan), import_batches (data), calculation_batches (last run)
```

The Operate cockpit auto-loads results. There is NO "Run Preview" button to view existing results. The "Recalculate" button triggers a new calculation_batch. The "Advance" button transitions lifecycle state.

**Commit:** `OB-46B Phase 2: Lifecycle Stepper, Data Readiness Panel, and Operate Cockpit page`

---

## PHASE 3: NEW VISUALIZATION COMPONENTS (BATCH 1)

Create these in `web/src/components/design-system/`:

### 3A: PacingCone

`PacingCone.tsx` — Trajectory projection showing optimistic/expected/pessimistic outcomes.

Props: `history: number[]` (past period values), `daysRemaining: number`, `daysTotal: number`, `tiers?: { threshold: number; label: string }[]`

Renders: SVG with a solid line for history, then three dotted lines (optimistic, expected, pessimistic) diverging into the future. Horizontal dashed lines for tier thresholds if provided. Current position as a bright dot at the junction.

The projection logic:
- Expected: linear extrapolation of recent trend
- Optimistic: best recent period pace
- Pessimistic: worst recent period pace

### 3B: WhatIfSlider

`WhatIfSlider.tsx` — Interactive earnings estimator.

Props: `currentValue: number`, `currentPayout: number`, `tiers: { min: number; max: number; rate: number; label: string }[]`, `currency: string`, `onChange: (additionalValue: number, projectedPayout: number) => void`

Renders: A slider (range input) from 0 to 200% of current value. Above the slider: the projected total value. Below the slider: projected payout with delta from current. Tier indicators on the slider track showing where thresholds are. The current position marked on the track.

### 3C: CalculationWaterfall

`CalculationWaterfall.tsx` — Shows calculation steps from gross to net.

Props: `steps: { label: string; value: number; type: 'add' | 'subtract' | 'total' }[]`, `currency: string`

Renders: Waterfall chart where each bar starts where the previous ended. Additions go up (emerald), subtractions go down (rose), totals are full-height (accent color). Connecting lines between bars. Values displayed on each bar.

### 3D: BudgetGauge

`BudgetGauge.tsx` — Budget vs actual thermometer.

Props: `actual: number`, `budget: number`, `currency: string`, `label?: string`

Renders: Horizontal bar showing actual as filled portion, budget as reference line. If actual < budget: emerald fill. If actual > budget: amber/rose fill past the budget line. Percentage label. Delta text ("MX$45,000 bajo presupuesto" or "MX$12,000 sobre presupuesto").

Add all four to the barrel export in `index.ts`.

**Commit:** `OB-46B Phase 3: PacingCone, WhatIfSlider, CalculationWaterfall, BudgetGauge components`

---

## PHASE 4: NEW VISUALIZATION COMPONENTS (BATCH 2)

### 4A: PeriodComparison

`PeriodComparison.tsx` — Side-by-side period comparison.

Props: `period1: { label: string; entities: { name: string; value: number }[] }`, `period2: { label: string; entities: { name: string; value: number }[] }`, `currency: string`, `sortBy?: 'change' | 'name' | 'value'`

Renders: Paired horizontal bars for matched entities. Left bar = period 1, right bar = period 2. Connecting arrow between them showing direction (▲ emerald for increase, ▼ rose for decrease). Delta percentage shown. Sorted by largest absolute change by default.

### 4B: AnomalyMatrix

`AnomalyMatrix.tsx` — Heatmap of deviations.

Props: `entities: string[]`, `metrics: string[]`, `values: number[][]` (normalized deviation -1 to 1), `onCellClick?: (entity: string, metric: string) => void`

Renders: Grid where rows = entities, columns = metrics. Cell color: emerald for positive deviation, rose for negative, slate for neutral (near 0). Intensity maps to absolute deviation value. Clickable cells.

### 4C: PayrollSummary

`PayrollSummary.tsx` — Sortable payout table.

Props: `rows: { entityName: string; entityType: string; totalPayout: number; components: Record<string, number>; lifecycleState: string; approved: boolean }[]`, `currency: string`, `groupBy?: string`

Renders: Table with sortable columns. Footer row with totals. StatusPill for lifecycle state (reuse from 46A). Group headers if groupBy is set. Each row clickable for drill-down.

Add all three to barrel export.

**Commit:** `OB-46B Phase 4: PeriodComparison, AnomalyMatrix, PayrollSummary components`

---

## PHASE 5: ADMIN DASHBOARD

Create `web/src/app/dashboard/admin/page.tsx` (or modify the root page to render persona-specific views).

**Route strategy decision:** You have two options:
- A) Single `/` route that reads persona from context and renders different content
- B) Separate `/dashboard/admin`, `/dashboard/manager`, `/dashboard/rep` routes

Choose Option A — single route, persona-driven content. This is cleaner and matches the "Dashboard IS the persona view" principle. The PersonaProvider already has the persona derivation.

### 5A: Admin Dashboard Layout

The admin dashboard ("Gobernar") answers: "Is the system healthy? Are we on budget? Where are the exceptions?"

```
┌──────────────────────────────────────────────────────────┐
│ [Period Ribbon]                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ HERO: Total Payout [AnimatedNumber] · N entities · Period│
│ Lifecycle state [StatusPill] · [Budget position]         │
│                                                          │
├─────────────────────────────┬────────────────────────────┤
│ Distribution of Attainment  │ Component Composition      │
│ [DistributionChart]         │ [ComponentStack]           │
├─────────────────────────────┴────────────────────────────┤
│ Budget vs Actual [BudgetGauge]                           │
├──────────────────────────────────────────────────────────┤
│ Exceptions [AnomalyMatrix or QueueItem list]             │
├──────────────────────────────────────────────────────────┤
│ Payroll Summary [PayrollSummary table]                   │
│ Period Comparison [PeriodComparison] (if >1 period)      │
└──────────────────────────────────────────────────────────┘
```

### 5B: Data Loading

Extend or use `getAdminDashboardData()` from persona-queries.ts. It must return:
- totalPayout, entityCount, currency from entity_period_outcomes
- attainmentDistribution — array of attainment percentages for DistributionChart
- componentComposition — aggregated component totals for ComponentStack
- lifecycleState — from latest calculation_batch
- payrollRows — per-entity summary for PayrollSummary
- budget — from tenant settings or rule_set metadata (use null if not configured)

If data is empty (no calculation results for this period), render an explicit empty state: "No hay resultados de cálculo para este período. Navega a Operar para ejecutar cálculos."

**Commit:** `OB-46B Phase 5: Admin Dashboard — Gobernar view`

---

## PHASE 6: MANAGER DASHBOARD

The manager dashboard ("Acelerar") answers: "How is my team performing? Who needs coaching? Where are the acceleration opportunities?"

### 6A: Layout

```
┌──────────────────────────────────────────────────────────┐
│ [Period Ribbon]                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ HERO: Team Total [AnimatedNumber] · N members · Zone     │
│ Summary: N on target · N coaching · N accelerating       │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Team Members (sorted by pacing)                          │
│ For each member:                                         │
│   Name · Attainment [BenchmarkBar] · Pacing [Sparkline]  │
│   [AccelerationCard if near threshold]                   │
├──────────────────────────────────────────────────────────┤
│ Period Comparison [PeriodComparison] (if >1 period)      │
└──────────────────────────────────────────────────────────┘
```

### 6B: Data Loading

Use `getManagerDashboardData()` from persona-queries.ts. It receives entityIds from scope.
- teamTotal, teamMembers (with per-member attainment, payout, history)
- accelerationOpportunities from `deriveAccelerationSignals()`
- History data for Sparklines (past 3-6 periods per member)

If scope.entityIds is empty, render: "No hay miembros de equipo en tu alcance. Contacta al administrador."

**Commit:** `OB-46B Phase 6: Manager Dashboard — Acelerar view`

---

## PHASE 7: REP DASHBOARD

The rep dashboard ("Crecer") answers: "How much did I earn? Am I on track? Where do I rank? What can I do to earn more?"

### 7A: Layout

```
┌──────────────────────────────────────────────────────────┐
│ [Period Ribbon]                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ HERO: My Total Payout [AnimatedNumber]                   │
│ "Cada peso explicado" · Period · Attainment %            │
│                                                          │
├──────────────────────┬───────────────────────────────────┤
│ Goal Progress        │ What-If Estimator                 │
│ [GoalGradientBar]    │ [WhatIfSlider]                    │
│ Tier position shown  │ "¿Y si cierro MX$50K más?"       │
├──────────────────────┴───────────────────────────────────┤
│ Component Breakdown [ComponentStack]                     │
│ Click any component → shows CalculationWaterfall         │
├──────────────────────────────────────────────────────────┤
│ My Ranking [RelativeLeaderboard]                         │
│ Shows neighbors only, bottom performers anonymized       │
├──────────────────────────────────────────────────────────┤
│ My History [PacingCone] or small multiples               │
│ Past periods + projection into current                   │
└──────────────────────────────────────────────────────────┘
```

### 7B: Component Drill-Down

When rep clicks a component in the ComponentStack, expand to show CalculationWaterfall for that component. This is progressive disclosure — don't navigate to a new page.

### 7C: What-If Integration

The WhatIfSlider reads the rep's plan tier structure from `rule_sets.components` JSONB. When the slider moves, it recalculates projected payout using the tier logic:
- Read the component's type (tier_lookup, matrix_lookup, percentage)
- Apply the tier/rate table to (current value + slider delta)
- Show projected payout vs current payout

This does NOT call the server calculation engine. It's a client-side estimation using the plan's tier tables.

### 7D: Leaderboard Data

The RelativeLeaderboard needs peer data. Query entity_period_outcomes for ALL entities of the same entity_type in the same tenant + period. Then:
- Sort by total_payout or attainment
- Find current rep's position
- Show 2 above + 2 below (anonymize bottom quartile names)

### 7E: Data Loading

Use `getRepDashboardData()` from persona-queries.ts. Must return:
- myOutcome (total_payout, components breakdown, attainment)
- myHistory (past periods for PacingCone)
- peerRankings (for RelativeLeaderboard)
- planTiers (for WhatIfSlider from rule_sets.components)

If rep has no entity_id or no outcomes, render: "No hay datos de compensación disponibles para este período."

**Commit:** `OB-46B Phase 7: Rep Dashboard — Crecer view`

---

## PHASE 8: DASHBOARD PAGE ROUTER

### 8A: Root Page

Modify `web/src/app/page.tsx` (or `web/src/app/dashboard/page.tsx` — use whichever is the actual root) to:

1. Wrap in PersonaProvider + PeriodProvider
2. Render PersonaLayout (from 46A)
3. Render TopBar (from 46A)
4. Render PeriodRibbon (from Phase 1)
5. Based on `usePersona().persona`, render the appropriate dashboard:
   - 'admin' → AdminDashboard
   - 'manager' → ManagerDashboard
   - 'rep' → RepDashboard

### 8B: Period Wiring

All three dashboards receive `activePeriodKey` from PeriodContext. When user clicks a different period in the ribbon, all data re-fetches for the new period. Use React state + useEffect for this.

### 8C: Redirect Perform Routes

If `/perform` or `/perform/*` routes exist, add redirects to `/`. If using Next.js app router, this can be a simple redirect in `web/src/app/perform/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
export default function PerformPage() { redirect('/'); }
```

Do this for `/perform`, `/perform/compensation` → redirect to `/my-compensation`, `/perform/team`, `/perform/trends`, `/perform/transactions`.

**Commit:** `OB-46B Phase 8: Dashboard page router with persona switching and period wiring`

---

## PHASE 9: MY COMPENSATION DEEP DRILL-DOWN

Create `web/src/app/my-compensation/page.tsx`:

This is the detailed calculation trace page that reps access from the dashboard. It shows every component's full waterfall.

### 9A: Layout

```
┌──────────────────────────────────────────────────────────┐
│ [Period Ribbon]                                          │
├──────────────────────────────────────────────────────────┤
│ Back to Dashboard                                        │
│                                                          │
│ My Compensation: [Period Label]                          │
│ Total: [AnimatedNumber] · Attainment: XX%                │
│                                                          │
│ For EACH component in my calculation:                    │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Component Name · Payout [AnimatedNumber]             │ │
│ │ [CalculationWaterfall]                               │ │
│ │ Source data: metric value, goal, attainment %        │ │
│ │ Tier applied: name, rate, range                      │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ Grand Total [ComponentStack showing all components]      │
└──────────────────────────────────────────────────────────┘
```

### 9B: Data Loading

```typescript
// Get calculation results for this entity + period
const { data: results } = await supabase
  .from('calculation_results')
  .select('*')
  .eq('calculation_batch_id', latestBatchId)
  .eq('entity_id', myEntityId)
  .single();

// Parse components JSONB to build waterfall per component
// Each component in results.components has: { payout, metrics, tier_applied, ... }
```

If no results, render: "No se encontraron resultados de cálculo. Los cálculos deben ejecutarse primero en Operar."

**Commit:** `OB-46B Phase 9: My Compensation deep drill-down page`

---

## PHASE 10: EXTEND QUERY LAYER AND INTEGRATION

### 10A: Extend persona-queries.ts

Add any new query functions needed by the pages above that weren't in the original 46A queries. Candidates:
- `getPeerRankings(tenantId, periodKey, entityType)` for leaderboard
- `getComponentDetail(batchId, entityId)` for waterfall
- `getPlanTiers(ruleSetId)` for what-if slider

### 10B: Update barrel exports

Add all new components to `web/src/components/design-system/index.ts`.

### 10C: Update test page

Update `web/src/app/test-ds/page.tsx` to include the new components (PacingCone, WhatIfSlider, etc.) with sample data.

**Commit:** `OB-46B Phase 10: Extended queries, barrel exports, updated test page`

---

## PHASE 11: VERIFICATION

### 11A: Type Check
```bash
npx tsc --noEmit 2>&1 | head -30
```

### 11B: Build
```bash
rm -rf .next && npm run build
```

### 11C: Visual Verification

Navigate to localhost:3000 and verify:
1. Period Ribbon renders with available periods
2. Admin dashboard shows hero + distribution + component stack + empty states
3. Switching to manager persona (via demo override) shows team view
4. Switching to rep persona shows personal dashboard with goal gradient
5. `/operate` shows lifecycle stepper + data readiness panel
6. `/my-compensation` shows calculation waterfall
7. No console errors

**Commit:** `OB-46B Phase 11: Verification, lint fixes, completion report`

---

## PROOF GATES

| # | Gate | Criteria | Evidence |
|---|------|----------|----------|
| PG-1 | Period Ribbon exists | `web/src/components/design-system/PeriodRibbon.tsx` renders periods with state encoding | cat file |
| PG-2 | Period Context exists | `web/src/contexts/period-context.tsx` exports usePeriod hook | grep exports |
| PG-3 | 7 new viz components | PacingCone, WhatIfSlider, CalculationWaterfall, BudgetGauge, PeriodComparison, AnomalyMatrix, PayrollSummary in design-system/ | ls directory |
| PG-4 | LifecycleStepper exists | Shows 9 states horizontally with current state highlighted | cat file |
| PG-5 | DataReadinessPanel exists | Shows plan/data/mapping/validation status with icons | cat file |
| PG-6 | Admin dashboard renders | Root page with admin persona shows DistributionChart + ComponentStack + PayrollSummary | Build output shows route |
| PG-7 | Manager dashboard renders | Root page with manager persona shows team BenchmarkBars + Sparklines + AccelerationCards | Build output shows route |
| PG-8 | Rep dashboard renders | Root page with rep persona shows GoalGradientBar + WhatIfSlider + RelativeLeaderboard | Build output shows route |
| PG-9 | Operate cockpit renders | `/operate` shows LifecycleStepper + DataReadinessPanel + results preview | Build output shows route |
| PG-10 | My Compensation renders | `/my-compensation` shows CalculationWaterfall per component | Build output shows route |
| PG-11 | Period switching works | Changing period in ribbon updates all content below | Manual verification |
| PG-12 | Build passes | `npm run build` exits 0 | Paste build output |
| PG-13 | No type errors | `npx tsc --noEmit` exits 0 | Paste output |
| PG-14 | No hardcoded demo data | `grep -rn "Polanco\|Carlos Garcia\|Optica Luminar" web/src/app/` returns 0 | Paste grep |
| PG-15 | Perform routes redirect | `/perform` redirects to `/` | Verify redirect exists |
| PG-16 | Components pure | No Supabase imports in design-system components | grep verification |
| PG-17 | All new components exported | index.ts exports all 18+ components | cat barrel file |

---

## COMPLETION REPORT ENFORCEMENT

File: `OB-46B_COMPLETION_REPORT.md` at PROJECT ROOT.
Created BEFORE final build. Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence.

---

## CLT PHASE

After all phases pass, verify in browser at localhost:3000:

1. Default persona (admin) shows the Gobernar dashboard with system-level visualizations
2. Demo override to manager shows Acelerar dashboard with team members
3. Demo override to rep shows Crecer dashboard with personal progress
4. Click Period Ribbon to switch periods — content updates
5. Navigate to `/operate` — see lifecycle stepper and data readiness
6. Navigate to `/my-compensation` — see calculation waterfall
7. Navigate to `/perform` — redirected to `/`

Add CLT results to completion report.

---

## FINAL STEP

```bash
gh pr create --base main --head dev --title "OB-46B: Persona Surfaces — Dashboard, Operate, My Compensation" --body "Part B of 3-part UI rebuild. Creates 3 persona-driven dashboard views (Admin: Gobernar, Manager: Acelerar, Rep: Crecer), Operate lifecycle cockpit, My Compensation drill-down, Period Ribbon for multi-period awareness, and 10 new visualization components (PacingCone, WhatIfSlider, CalculationWaterfall, BudgetGauge, PeriodComparison, AnomalyMatrix, PayrollSummary, PeriodRibbon, LifecycleStepper, DataReadinessPanel). Eliminates Perform workspace — dashboard IS the persona view."
```

---

*ViaLuce.ai — The Way of Light*
*OB-46B: Where the foundation becomes visible. Three personas, three truths, one platform.*
*"The same data, seen through the lens of what each person needs to do next."*
