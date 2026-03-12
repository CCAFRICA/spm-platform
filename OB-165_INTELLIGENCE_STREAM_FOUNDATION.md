# OB-165: INTELLIGENCE STREAM FOUNDATION
## DS-013 Phase A — Cold-Start Adaptive Intelligence System

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST — IN THIS ORDER, COMPLETELY

1. `CC_STANDING_ARCHITECTURE_RULES.md` v3.0 — Governing Principles (Decisions 123-124), G1-G6 evaluation framework, anti-patterns AP-1 through AP-25, operational rules
2. `SCHEMA_REFERENCE_LIVE.md` — live database schema (authoritative)
3. `DS-013_Platform_Experience_Architecture_20260310.docx` — **THE CONTROLLING SPECIFICATION.** This is the single most important document for this OB. Read Sections 1-5 and 7 completely. Every design decision in this OB must trace to DS-013.
4. `DS-003_VISUALIZATION_VOCABULARY.md` — component library, cognitive fit rules, color encoding, page composition rules
5. This prompt in its entirety before writing a single line of code

**If you have not read DS-013 completely, STOP and read it now. This OB implements DS-013 Phase A.**

---

## CONTEXT — THE PARADIGM SHIFT

### What We Are NOT Building

We are NOT building a dashboard page. We are NOT building a "Briefing" page. We are NOT building separate pages for different personas. We are NOT adding charts to an existing layout. We are NOT iterating on OB-163's Briefing components.

### What We ARE Building

We are building the Intelligence Stream — the platform's primary mode of interaction. A single adaptive surface that:

1. Determines what matters most for THIS user in THIS context at THIS moment
2. Presents intelligence elements ranked by projected impact
3. Embeds the action to address each insight directly within the element
4. Adapts its content based on the user's persona
5. Captures interaction signals for future adaptation (dormant in Cold tier)

This is DS-013 Phase A: Cold-Start Intelligence Stream. Factual intelligence with structural actions. Archetype persona content. No behavioral adaptation yet. Signal capture active but adaptation dormant.

### The Five Elements Test

EVERY intelligence element rendered on screen MUST contain all five elements. An element missing any one of them is incomplete and MUST NOT ship.

| # | Element | Question It Answers |
|---|---------|---------------------|
| 1 | Value | What is the number? |
| 2 | Context | Compared to what? |
| 3 | Comparison | Is that good or bad? |
| 4 | Action | What should I do? |
| 5 | Impact | What happens if I do it? |

An element that shows a value without context is a number, not intelligence. An element that shows intelligence without an action is a thermometer, not a thermostat. An element that recommends an action without projected impact is a guess, not a recommendation.

### The IAP Gate

Every element must deliver Intelligence (reveals insight), Acceleration (compels action), OR Performance (communicable in 5 seconds). Elements failing ALL three are removed. This is a standing architectural rule (memory slot 11).

---

## FIRST PRINCIPLES

1. **DS-013 IS THE LAW** — Every design choice traces to DS-013. If this prompt contradicts DS-013, DS-013 wins.
2. **FIVE ELEMENTS** — Every intelligence element: value + context + comparison + action + impact. No exceptions.
3. **ACTION PROXIMITY** — Actions execute within the intelligence stream or open minimum necessary context. No "go to another page to act."
4. **VERTICAL SLICE** — Data from calculation_results through Insight Agent synthesis through rendered intelligence with proximate actions. One PR.
5. **KOREAN TEST** — Zero hardcoded entity names, component names, branch names, or language strings. Everything from database queries.
6. **DECISION 122** — Banker's Rounding with rounding trace available per component.
7. **DECISION 124** — Research-derived design. Font → Tinker. Color → Mehta & Zhu. Navigation → Hick's Law. Visualization → Cleveland & McGill.
8. **COGNITIVE FIT (DS-003)** — Visual form matches decision task. Diversity minimum: 3+ component types for 4+ data elements.
9. **DENSITY GRADIENT** — Admin = highest density. Manager = medium. Individual = lowest. Never identical density across personas.
10. **COLD TIER HONESTY** — When the system lacks data for a recommendation, it says so. "Insufficient data for velocity projection." Never present estimates as facts.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. Architecture Decision Gate before implementation (Section B of CC_STANDING_ARCHITECTURE_RULES)
5. Anti-Pattern Registry check: AP-1 through AP-25
6. ALL git commands from repository root (spm-platform), NOT from web/
7. Build EXACTLY what this prompt specifies — no additions, no omissions
8. SQL Verification Gate (FP-49): query live table schema before writing any SQL
9. PRODUCTION VERIFICATION MANDATORY at the end
10. EVIDENTIARY GATES: paste code, terminal output, or grep results for every proof gate. Self-attestation is NOT accepted.

---

## PHASE 0: DIAGNOSTIC — DISCOVER WHAT EXISTS

**MANDATORY. DO NOT SKIP. DO NOT ASSUME.**

### 0A: Existing Surfaces Inventory

```bash
echo "=== OPERATE BRIEFING (OB-163) ==="
find web/src -path "*briefing*" -name "*.tsx" -o -path "*briefing*" -name "*.ts" | sort

echo "=== PERFORM DASHBOARD ==="
find web/src -path "*perform*" -name "*.tsx" | sort

echo "=== PERSONA CONTEXT ==="
grep -rn "usePersona\|effectivePersona\|setPersonaOverride\|derivePersona" web/src/ --include="*.tsx" --include="*.ts" -l | sort

echo "=== ASSESSMENT API ==="
find web/src/app/api -path "*assess*" -name "route.ts" | sort
# If found, show the first 50 lines:
find web/src/app/api -path "*assess*" -name "route.ts" -exec head -50 {} \;

echo "=== SIGNAL CAPTURE (OB-163 Phase 9) ==="
find web/src -name "*signal*" -path "*briefing*" | sort

echo "=== CALCULATION RESULTS QUERY PATTERNS ==="
grep -rn "calculation_results\|total_payout\|components" web/src/lib/ --include="*.ts" -l | sort

echo "=== ENTITY RELATIONSHIPS QUERY ==="
grep -rn "entity_relationships" web/src/lib/ --include="*.ts" -l | sort

echo "=== CURRENT LANDING ROUTE ==="
cat web/src/app/operate/page.tsx | head -30

echo "=== CURRENT SIDEBAR CONFIG ==="
grep -n "href\|label\|icon\|Briefing\|briefing\|Overview\|overview" web/src/components/navigation/Sidebar.tsx | head -40
```

**Paste ALL output. This determines what code can be reused vs what must be rebuilt.**

### 0B: BCL Data Verification

Verify BCL data is accessible from the application:

```bash
echo "=== VERIFY BCL TENANT EXISTS ==="
# Check if the application can query BCL calculation results
grep -rn "b1c2d3e4" web/src/ --include="*.ts" --include="*.tsx" | head -5 || echo "No hardcoded BCL tenant ID found (GOOD)"
```

### 0C: Existing Visualization Components

```bash
echo "=== RECHARTS USAGE ==="
grep -rn "from 'recharts'" web/src/ --include="*.tsx" -l | sort

echo "=== LUCIDE ICONS ==="
grep -rn "from 'lucide-react'" web/src/ --include="*.tsx" -l | head -10

echo "=== EXISTING CHART COMPONENTS ==="
find web/src/components -name "*Chart*" -o -name "*Histogram*" -o -name "*Heatmap*" -o -name "*Sparkline*" -o -name "*Gauge*" | sort
```

**Commit:** `OB-165 Phase 0: Diagnostic — intelligence stream foundation inventory`

---

## PHASE 1: ARCHITECTURE DECISION

**MANDATORY before writing ANY implementation code.**

```
ARCHITECTURE DECISION RECORD — OB-165
======================================
Problem: Build DS-013 Phase A — a single adaptive surface that replaces
/operate/briefing, /perform dashboard, and /operate landing with an
Intelligence Stream governed by persona, data state, and IAP.

G1 (Governing Standard):
  → DS-013 Platform Experience Architecture (entire document)
  → GAAP presentation (Decision 122)
  → Cognitive Fit (DS-003, TMR-8)

G2 (Research Derivation):
  → Nielsen (2025): Intent-Based Outcome Specification — third UI paradigm
  → Salesloft Rhythm: signal-to-action engine, 39% productivity lift
  → Liu et al. (2024): Adaptive UI improves task completion
  → Cleveland & McGill (1984): visualization type → perceptual accuracy
  → Vessey (1991): Cognitive Fit — form matches decision task
  → Mehta & Zhu (2009): color → cognitive mode (indigo=analytical, amber=optimism, emerald=growth)

G3 (Abstraction Principle):
  → Intelligence elements are domain-agnostic (Five Elements test)
  → Component names from rule_sets, entity names from entities, currency from tenant
  → Same structural intelligence for ICM, Financial, Franchise, Channel

G4 (Korean Test):
  → Zero hardcoded labels. All from database.
  → Component names, entity names, tier labels, currency — all queried.

G5 (Both-Branch):
  → Empty state: "No calculation results. Import data and run calculation."
  → Full state: Intelligence stream with all elements.
  → Single-period state: Value + Context + Comparison. No trajectory.
  → Multi-period state (BCL): Value + Context + Comparison + trajectory-based Action + Impact.

G6 (Scale):
  → Team-scoped queries via entity_relationships (max ~30 entities per manager)
  → No full-population joins for individual persona
  → Admin distribution computed server-side, not client-side

Option A: Single route /stream — replaces /operate/briefing and /perform
  - One IntelligenceStream component reads persona → renders persona-specific elements
  - Reuses existing usePersona() hook
  - Removes OB-163 Briefing components (they don't meet DS-013 standard)
  - Redirects /operate and /perform to /stream
  - Scale: YES. Korean Test: YES. Atomicity: YES.

Option B: Overlay existing /operate and /perform with intelligence elements
  - Preserves existing pages, adds intelligence layer
  - Risk: two competing surfaces. Maintenance burden. Contradicts DS-013 Section 9 (consolidation).
  - Scale: YES. Korean Test: YES. Atomicity: NO (partial upgrade).

CHOSEN: Option A — Single route replaces both surfaces
REASON: DS-013 Section 9 explicitly supersedes /operate/briefing and /perform
as separate surfaces. One adaptive surface. Clean break.

REJECTED: Option B — contradicts DS-013, creates maintenance burden.
```

**Commit this decision record before writing any implementation code.**

**Commit:** `OB-165 Phase 1: Architecture Decision — single intelligence stream route`

---

## PHASE 2: DATA LAYER — INTELLIGENCE STREAM LOADER

### 2A: Create Intelligence Stream Data Loader

Create `web/src/lib/data/intelligence-stream-loader.ts`

This module queries all data needed for the intelligence stream and shapes it for each persona. It does NOT render anything — it produces structured data that the UI consumes.

**Data sources:**
- `calculation_results` — entity totals, component breakdowns, per-period
- `rule_sets` — component definitions, tier boundaries, variant config
- `entities` — entity names, types, external IDs
- `entity_relationships` — manager → direct reports (for manager persona)
- `periods` — period names, date ranges, lifecycle state
- `calculation_batches` — batch status
- Tenant settings — currency, locale

**Output shape per persona:**

```typescript
interface IntelligenceStreamData {
  persona: 'admin' | 'manager' | 'individual';
  tenant: { name: string; currency: string; locale: string };
  currentPeriod: { name: string; startDate: string; endDate: string; status: string } | null;
  
  // Admin elements
  systemHealth?: {
    totalPayout: number;           // Value
    entityCount: number;
    exceptionCount: number;
    componentCount: number;
    priorPeriodTotal: number | null; // Context (comparison vs prior)
    budgetEstimate: number | null;   // Context (comparison vs budget)
  };
  distribution?: {
    buckets: Array<{ label: string; count: number; min: number; max: number }>;
    mean: number; median: number; stdDev: number;
  };
  lifecycle?: {
    stages: Array<{ label: string; status: 'done' | 'active' | 'pending' }>;
    nextAction: { label: string; route: string } | null;  // Action Proximity
  };
  optimizationOpportunities?: Array<{
    description: string;          // "3 entities within 5% of next tier"
    revenueImpact: number;        // Impact (revenue side)
    costImpact: number;           // Impact (cost side — Decision 115)
    roi: number;
    entityCount: number;
    actionLabel: string;          // "Simulate" / "Apply"
    actionRoute: string;          // Action Proximity
  }>;
  
  // Manager elements
  teamHealth?: {
    teamTotal: number;
    teamSize: number;
    onTrack: number; needsAttention: number; exceeding: number;
    priorPeriodTeamTotal: number | null;
  };
  coachingPriority?: {
    entityName: string;
    entityId: string;
    componentName: string;
    currentAttainment: number;
    gapToNextTier: number;
    projectedImpact: number;       // Impact
    trend: number;                  // Context
    actionLabel: string;            // "View Detail"
    actionEntityId: string;         // Action Proximity
  } | null;
  teamHeatmap?: Array<{
    entityName: string;
    entityId: string;
    components: Array<{ name: string; attainment: number }>;
    trend: number;
    isHighlight: boolean;
  }>;
  bloodworkItems?: Array<{
    entityName: string;
    entityId: string;
    issue: string;                  // "C4 gate blocked" or "3-period decline"
    severity: 'critical' | 'warning';
    actionLabel: string;
    actionRoute: string;
  }>;
  
  // Individual elements
  personalEarnings?: {
    totalPayout: number;           // Value
    attainmentPct: number;         // Context
    priorPeriodTotal: number | null; // Context
    currentTier: string;
    nextTier: string | null;
    gapToNextTier: number | null;  // Comparison (Goal-Gradient)
    gapUnit: string;               // "$" or "%"
  };
  allocationRecommendation?: {
    componentName: string;         // "Revenue Performance"
    rationale: string;             // "Widest gap to next tier boundary"
    projectedImpact: number;       // Impact
    confidence: 'structural' | 'warm' | 'hot';
    actionLabel: string;
  } | null;
  componentBreakdown?: Array<{
    name: string;
    amount: number;
    pctOfTotal: number;
  }>;
  relativePosition?: {
    rank: number;
    teamSize: number;
    aboveEntities: Array<{ name: string; amount: number }>;   // max 3
    belowEntities: Array<{ name: string | null; amount: number }>; // anonymized below median
    viewerAmount: number;
  } | null;
  
  // Confidence tier
  confidenceTier: 'cold' | 'warm' | 'hot';
  periodCount: number;            // How many periods of data exist
  
  // Signals (for V2 — captured but not used in V1)
  signalCaptureEnabled: boolean;
}
```

### 2B: Compute Intelligence Elements

For each persona, compute the elements from raw data. Key computations:

**Admin — Optimization Opportunities:**
For each component's tier boundaries, count entities within 5% of the next boundary. Compute cost impact (deterministic: entities × rate delta) and revenue estimate (from foundational flywheel priors or "insufficient data" if Cold tier).

**Manager — Coaching Priority:**
For each direct report, for each component: compute proximity to next tier boundary × trend direction. The entity × component with the highest (proximity × positive_trend) product is the coaching priority. This is DS-008-A2 Allocation Intelligence applied to the manager's team.

**Manager — Bloodwork Items:**
Scan team entities for: (a) conditional_gate failures (C4 = 0 when the entity could have earned non-zero), (b) declining entities (current period total < prior period total for 2+ consecutive periods).

**Individual — Allocation Recommendation (Cold tier):**
For each of the entity's components, compute gap to next tier boundary. The component with the widest absolute gap (most room to improve) OR the narrowest relative gap (closest to next tier) is the recommendation. In Cold tier, state the structural fact: "Revenue Performance has the widest gap to next tier." Do NOT estimate behavioral impact.

**Individual — Relative Position:**
Rank all entities with the same rule_set_assignment variant for the same period. Show 3 above, 3 below the current entity. Anonymize entities below the median (Li 2024).

### 2C: Determine Confidence Tier

```typescript
function determineConfidenceTier(periodCount: number): 'cold' | 'warm' | 'hot' {
  if (periodCount <= 2) return 'cold';
  if (periodCount <= 6) return 'warm';
  return 'hot';
}
```

BCL has 6 periods → 'warm'. Meridian has 1 period → 'cold'. This is read from the data, not hardcoded per tenant.

**Commit:** `OB-165 Phase 2: Intelligence stream data loader — all persona elements computed`

---

## PHASE 3: UI LAYER — INTELLIGENCE STREAM COMPONENT

### 3A: Create Intelligence Stream Route

Create `web/src/app/(protected)/stream/page.tsx`

This page:
1. Reads `usePersona()` to determine effective persona
2. Calls the intelligence stream loader
3. Renders persona-specific intelligence elements
4. Applies ambient gradient per persona

### 3B: Ambient Environment (DS-013 Section 5, DS-003 Rule 5)

Apply persona gradient to the page background:

```
Admin:      from-slate-950 via-indigo-950/40 to-slate-950
Manager:    from-slate-950 via-amber-950/25 to-slate-950
Individual: from-slate-950 via-emerald-950/25 to-slate-950
```

The gradient changes on persona switch. The environment shifts before the user reads a label.

### 3C: Intelligence Element Components

Build reusable components that enforce the Five Elements pattern. Each component receives structured data and renders value + context + comparison + action + impact.

**IntelligenceCard** — the base container:
```
┌─────────────────────────────────────────────────┐
│ [accent border-left 3px]                        │
│                                                 │
│ LABEL (uppercase, xs, tracking-wide)            │
│                                                 │
│ Value       │ Context (comparison, reference)    │
│ (large)     │ (trend arrow, benchmark, delta)    │
│             │                                    │
│ Action description with projected impact         │
│                                                  │
│ [Action Button →]                                │
└─────────────────────────────────────────────────┘
```

Every IntelligenceCard has:
- A value (the number)
- Context (what it's compared to)
- A comparison indicator (good/bad/neutral — color-encoded)
- An action description
- An action button (proximate — no navigation away)

**Components to build:**
1. `SystemHealthCard` — Admin hero (total + entities + exceptions + components + trend)
2. `LifecycleCard` — Admin lifecycle stepper with proximate action button
3. `DistributionCard` — Admin histogram with mean/median/σ
4. `OptimizationCard` — Admin dual-variable action card (Simulate + Apply)
5. `TeamHealthCard` — Manager hero (team total + on-track/attention/exceeding)
6. `CoachingPriorityCard` — Manager highest-ROI entity × component with action
7. `TeamHeatmapCard` — Manager entity × component heatmap (Cleveland: pattern detection)
8. `BloodworkCard` — Manager/Admin attention items (only renders when populated — silence = health)
9. `PersonalEarningsCard` — Individual hero with attainment and Goal-Gradient bar
10. `AllocationCard` — Individual highest-leverage component recommendation
11. `ComponentBreakdownCard` — Individual stacked bar with amounts
12. `RelativePositionCard` — Individual leaderboard (3 above, 3 below, anonymous below median)

### 3D: Admin Intelligence Stream

Render order (highest impact first):
1. SystemHealthCard — "What is the state of this period?"
2. BloodworkCard (only if exceptions > 0) — "What needs my attention?"
3. LifecycleCard — "What is the next step?"
4. OptimizationCard (if any entities near tier boundaries) — "What can I improve?"
5. DistributionCard — "Is the population healthy?"

**Density: Highest.** 2-column grid for OptimizationCard + DistributionCard. Full-width for SystemHealth, Bloodwork, Lifecycle.

### 3E: Manager Intelligence Stream

Render order (highest impact first):
1. TeamHealthCard — "How is my team doing?"
2. CoachingPriorityCard — "Who should I coach and on what?"
3. TeamHeatmapCard — "Where are the patterns?"
4. BloodworkCard (only if items exist) — "What's broken?"

**Density: Medium.** Single-column for cards. Heatmap is full-width.

### 3F: Individual Intelligence Stream

Render order (highest impact first):
1. PersonalEarningsCard — "What did I earn? How close am I to the next tier?"
2. AllocationCard — "Where should I focus?"
3. ComponentBreakdownCard — "What makes up my earnings?"
4. RelativePositionCard — "Where do I stand?"

**Density: Lowest.** Single-column. Maximum 5-6 visible elements. Hero dominant.

### 3G: Cold Tier Disclosures

When `confidenceTier === 'cold'` (≤ 2 periods):
- AllocationCard shows: "Structural recommendation based on tier proximity. Insufficient data for behavioral projection."
- PersonalEarningsCard omits pace indicator (no trajectory data)
- CoachingPriorityCard shows: "Based on single-period data. Trajectory requires 3+ periods."
- OptimizationCard shows cost impact only: "Revenue impact: insufficient behavioral data to estimate."

When `confidenceTier === 'warm'` (3-6 periods, which BCL is):
- All elements active
- Pace indicator shows trajectory extrapolation
- Coaching priority includes trend direction and magnitude
- Optimization includes moderate-confidence behavioral estimates

**Commit:** `OB-165 Phase 3: Intelligence stream UI — [N] components, 3 persona variants`

---

## PHASE 4: NAVIGATION — INTELLIGENCE STREAM AS DEFAULT

### 4A: Redirect Landing Pages

- `/operate` → redirect to `/stream`
- `/perform` → redirect to `/stream`
- `/operate/briefing` → redirect to `/stream`
- Login landing → `/stream`

The Intelligence Stream is the primary experience. All other paths lead to it.

### 4B: Sidebar Configuration

**Sidebar shows persona-appropriate operational tasks:**

Admin sidebar:
- Intelligence (active default — links to /stream)
- Import Data
- Calculate
- Reconcile
- Approve
- Configure: Plans, Periods, Entities, Settings

Manager sidebar:
- Intelligence (active default — links to /stream)
- Team Detail
- Approvals

Individual sidebar:
- Intelligence (active default — links to /stream)
- My Statements
- My Plan

Sidebar links to non-existent pages show "Coming Soon" empty state. Do NOT link to stub pages that redirect.

### 4C: Remove OB-163 Briefing (Optional — Only If Clean)

If the OB-163 Briefing components at `/operate/briefing` can be cleanly removed without breaking other functionality, remove them. If removal risks regression, leave them but ensure the redirect in 4A sends users to `/stream` instead.

Do NOT spend time debugging OB-163 code. The Intelligence Stream replaces it.

**Commit:** `OB-165 Phase 4: Navigation — /stream as default, sidebar persona-aware`

---

## PHASE 5: SIGNAL CAPTURE WIRING

### 5A: Capture Signals on Intelligence Stream

Wire interaction signal capture for every IntelligenceCard:

```typescript
interface StreamSignal {
  signal_type: 'stream_interaction';
  tenant_id: string;
  user_id: string;       // auth.uid()
  persona: string;
  element_id: string;    // 'system_health' | 'coaching_priority' | 'allocation' | etc.
  action: 'view' | 'click' | 'expand' | 'act';
  metadata?: Record<string, unknown>;  // e.g., which action button was clicked
  timestamp: string;
}
```

Store in `classification_signals` table (same table, different `signal_type`).

### 5B: Buffered Writes

Use the same buffered async write pattern from OB-163 Phase 9 (if it exists). Do NOT write a signal on every render — batch and debounce. One write per user session per element per action type.

**Commit:** `OB-165 Phase 5: Signal capture — stream interactions wired`

---

## PHASE 6: PROOF GATES

**Every proof gate requires pasted evidence. Self-attestation is NOT accepted.**

### Five Elements Test

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-01 | Admin SystemHealthCard contains all 5 elements | Value: total payout. Context: entity count + component count. Comparison: vs prior period (trend arrow). Action: "Run Reconciliation →". Impact: lifecycle advancement. Paste the rendered card. |
| PG-02 | Manager CoachingPriorityCard contains all 5 elements | Value: entity name + component. Context: current attainment + trend. Comparison: gap to next tier. Action: "View Detail →". Impact: projected team payout increase. Paste the rendered card. |
| PG-03 | Individual PersonalEarningsCard contains all 5 elements | Value: total payout. Context: attainment %. Comparison: current tier + gap to next. Action: allocation recommendation. Impact: projected earnings increase. Paste the rendered card. |

### IAP Gate

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-04 | Every visible element passes IAP | For each rendered element, state which of I/A/P it delivers. Any element failing all 3 → must be removed. Paste the assessment. |

### Action Proximity

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-05 | Admin OptimizationCard has embedded Simulate button | Button is on the card, not a link to another page. Paste screenshot. |
| PG-06 | Manager CoachingPriorityCard has embedded action button | "View [Entity] Detail" button on the card. Paste screenshot. |
| PG-07 | Individual AllocationCard has embedded action or inline expansion | Action is proximate to the recommendation. Paste screenshot. |

### Persona Adaptation

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-08 | Admin sees indigo gradient | Background has indigo tint. Paste screenshot. |
| PG-09 | Manager sees amber gradient | Background has amber tint. Paste screenshot. |
| PG-10 | Individual sees emerald gradient | Background has emerald tint. Paste screenshot. |
| PG-11 | Persona switch changes content without page reload | Switching persona updates the intelligence stream content. No auth round-trip. Paste before/after. |

### Cognitive Fit (DS-003)

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-12 | Admin stream uses 3+ distinct visualization types | Count distinct types (HeroMetric, Histogram, Stepper, ActionCard, Heatmap, etc). Paste count and list. |
| PG-13 | Every quantitative element has a reference frame | "Is that good or bad?" answerable at a glance for every number. Paste assessment for each element. |

### Data Truth

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-14 | Admin hero total matches BCL GT for latest period | Paste the hero value AND a database query showing the matching SUM. |
| PG-15 | Manager team total matches SUM of direct reports | Paste the team total AND a query showing SUM of entity_relationships-scoped results. |
| PG-16 | Individual earnings match specific entity's calculation_results | Paste Valentina's hero value AND her calculation_results row. |

### Korean Test

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-17 | Zero hardcoded entity names in source code | `grep -rn "Valentina\|Diego\|Gabriela\|Fernando\|Patricia" web/src/` returns 0 results (excluding test data and scripts). Paste grep output. |
| PG-18 | Zero hardcoded component names in source code | `grep -rn "Colocacion\|Captacion\|Productos\|Regulatorio" web/src/` returns 0 results (excluding scripts). Paste grep output. |
| PG-19 | Component names rendered from rule_sets | The intelligence stream reads component names from the database, not from code. Paste the query or code path showing this. |

### Navigation

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-20 | /operate redirects to /stream | Navigate to /operate, end up at /stream. Paste URL bar. |
| PG-21 | Login lands on /stream | After login, /stream is the rendered page. Paste URL bar. |

### Regression

| Gate | Specification | PASS Criteria |
|------|---------------|---------------|
| PG-22 | Meridian tenant unaffected | Navigate to Meridian, verify MX$185,063. Paste evidence. |
| PG-23 | npm run build exits 0 | Paste final build output line. |

**Total: 23 proof gates. Every one requires pasted evidence.**

**Commit:** `OB-165 Phase 6: Proof gates documented in completion report`

---

## PHASE 7: BUILD + COMPLETION REPORT + PR

### 7A: Full Build

```bash
cd /path/to/spm-platform
rm -rf web/.next
cd web && npm run build
# MUST exit 0
```

### 7B: Completion Report

Create `OB-165_COMPLETION_REPORT.md` at repository root with:

1. Architecture Decision Record (pasted from Phase 1)
2. All 23 proof gates with pasted evidence for each
3. Files created (list)
4. Files modified (list)
5. Files removed (list, if any OB-163 components were removed)
6. Anti-Pattern Registry: AP-1 through AP-25, each PASS/FAIL with evidence for failures
7. DS-013 compliance: which sections of DS-013 are implemented, which are deferred

### 7C: PR

```bash
cd /path/to/spm-platform
gh pr create --base main --head dev \
  --title "OB-165: Intelligence Stream Foundation — DS-013 Phase A" \
  --body "## DS-013 Phase A: Cold-Start Adaptive Intelligence System

### What This Builds
A single adaptive surface (/stream) that replaces /operate/briefing, /perform,
and /operate as the platform's primary experience. Intelligence elements ranked
by impact, with embedded proximate actions, adapted per persona.

### The Five Elements
Every rendered element contains: Value + Context + Comparison + Action + Impact.
Elements missing any element were not shipped.

### Persona Variants
- Admin (indigo): System health → Bloodwork → Lifecycle → Optimization → Distribution
- Manager (amber): Team health → Coaching priority → Heatmap → Bloodwork
- Individual (emerald): Earnings + Goal-Gradient → Allocation → Components → Leaderboard

### Confidence Tier
Cold-start tier for tenants with ≤2 periods. Warm tier for BCL (6 periods).
Honest disclosure when data is insufficient for recommendations.

### Signal Capture
Interaction signals captured (stream_interaction type) for V2 adaptation. Dormant.

### Navigation
/stream is the default landing. /operate and /perform redirect to /stream.
Sidebar shows persona-appropriate operational tasks.

### DS-013 Compliance
Phase A (Cold-Start) implemented. Phases B-E (Warm, Adaptation, Hot, Temporal) deferred.

## Proof Gates: 23 — see OB-165_COMPLETION_REPORT.md
## Governing Specification: DS-013 Platform Experience Architecture"
```

**Commit:** `OB-165 Phase 7: Build passes, completion report, PR created`

---

## PRODUCTION VERIFICATION (Andrew performs after merge)

1. Login to vialuce.ai as admin@bancocumbre.ec → lands on /stream
2. Admin intelligence stream: SystemHealth shows BCL March 2026 total matching GT
3. Switch to Manager (Fernando) → amber gradient, team health, coaching priority card names a specific entity + component
4. Switch to Individual (Valentina) → emerald gradient, personal earnings, allocation recommendation
5. Every visible element has: value, context, comparison, action, impact
6. Navigate to /operate → redirects to /stream
7. Navigate to /perform → redirects to /stream
8. Switch to Meridian tenant → verify MX$185,063
9. Check Vercel Runtime Logs → zero 500 errors on /stream

---

## CC FAILURE PATTERN WARNINGS

| Pattern | Risk | Mitigation |
|---------|------|------------|
| Building a dashboard and calling it an "Intelligence Stream" | CRITICAL | Every element must pass the Five Elements test. A chart without an action is a dashboard, not intelligence. |
| FP-60: Completion without evidence | HIGH | 23 proof gates, each with pasted evidence. |
| FP-62: Celebrating proximity | HIGH | Every number must match a database query. |
| Hardcoding entity/component names | HIGH | Korean Test gates PG-17, PG-18, PG-19. |
| Identical density across personas | MEDIUM | Admin ≠ Manager ≠ Individual. PG-12 verifies diversity. |
| Missing reference frames | MEDIUM | PG-13 verifies every number has "is that good or bad?" context. |
| Action buttons that link to other pages | MEDIUM | PG-05, PG-06, PG-07 verify action proximity. |

---

## WHAT SUCCESS LOOKS LIKE

A user opens vialuce.ai and immediately sees what matters most. Not a sidebar to browse. Not a dashboard to interpret. Intelligence, ranked by impact, with the button to act right there.

The admin sees: "$60,107 this period. 85 entities. 0 exceptions. Next step: Reconcile →"
The manager sees: "Ana → Revenue Performance: +$2,400 if she reaches Premium. View Ana →"
The individual sees: "You earned $945. You're 8% from Premium. Focus on Loan Placement. 3 more loans →"

Every insight has an action. Every action has a projected impact. Every element earned its place by passing the IAP Gate.

This is not a page. This is the platform.

---

*End of prompt. DS-013 is the law. The Five Elements are non-negotiable. Build the Intelligence Stream.*
