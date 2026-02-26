# OB-102: PLATFORM BLOODWORK LANDING & IAP ENFORCEMENT
## Unified Module-Aware Dashboard + ICM Visualization Compliance

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` at the project root — all rules apply
2. `PERSISTENT_DEFECT_REGISTRY.md` — verify all in-scope items before completion report
3. `SCHEMA_REFERENCE.md` — authoritative column reference for every Supabase query
4. `AUTH_FLOW_REFERENCE.md` — DO NOT MODIFY ANY AUTH FILE without reading this first
5. `DS-003_VISUALIZATION_VOCABULARY.md` — component library, page composition rules

**If you have not read all five files, STOP and read them now.**

---

## WHY THIS OB EXISTS

The platform's landing pages — `/operate` and `/perform` — do not serve the IAP (Intelligence, Acceleration, Performance) framework. They were built as ICM-specific pages that assume a single module. Three fundamental problems:

### Problem 1: No Module-Aware Landing
Sabor Grupo has BOTH ICM and Financial modules enabled. The previous approach (`useFinancialOnly` redirect) assumed tenants are either Financial-only or ICM-only. This is wrong. Dual-module tenants need a **unified dashboard showing both modules** — not a redirect to one or the other. The `useFinancialOnly` hook and all its redirect logic must be REMOVED entirely.

### Problem 2: ICM Pages Violate Design System
OB-101 enforced DS-003 (Visualization Vocabulary), Cognitive Fit, reference frames, and deterministic commentary on every Financial page. The ICM pages — Admin Home (Gobernar), Manager Home (Acelerar), Rep Home (Crecer), Operate lifecycle, Results Dashboard — have NONE of this. The same standards that OB-101 applied to Financial must now apply to ICM and to the platform-level landing pages.

CLT-51A (Feb 17) cataloged every ICM measure, proposed visual forms, and identified violations. That work was never implemented. This OB makes it real.

### Problem 3: Landing Pages Don't Follow Bloodwork Principle
The Bloodwork Principle (Standing Rule 23) says: surface clean summary by default, highlight only items needing attention, full detail on demand. Passing checks build confidence silently.

Currently `/operate` dumps directly into an ICM lifecycle stepper. For a dual-module tenant, the landing should be a Bloodwork health summary showing the status of ALL enabled modules — with click-through to detail.

**Design Assumption Correction (Decision 46):** Sabor Grupo has BOTH ICM and Financial modules. The entire `useFinancialOnly` redirect approach is removed. `/operate` shows a unified, module-aware Bloodwork landing. Tenants see what they have enabled.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000 responds
3. Final step: `gh pr create --base main --head dev` with descriptive title and body
4. **Git commands from repo root (spm-platform), NOT from web/.**
5. **Commit this prompt to git as first action.**
6. **Fix logic, not data.** Do not insert test data. Do not provide answer values.
7. **Domain-agnostic always.** Korean Test on all code.
8. **Supabase .in() ≤ 200 items.**
9. **Zero component-level Supabase calls (Standing Rule 26).**
10. **One canonical location per surface (Standing Rule 24).**
11. **Effective persona scope derivation (Standing Rule 27).**
12. **DO NOT MODIFY ANY FILE IN THE AUTH CHAIN** (auth-service.ts, session-context.tsx, auth-shell.tsx, middleware.ts, use-financial-only.ts removal is the ONE exception). Read AUTH_FLOW_REFERENCE.md.

---

## DESIGN SYSTEM REFERENCE

These documents define WHAT to build. This OB enforces them platform-wide:

| Document | Content |
|----------|---------|
| `DS-003` (Visualization Vocabulary) | Component library, page composition rules, color encoding |
| `TMR Addendum 8` | Cognitive Fit Framework — 6 decision tasks, visual forms, diversity rule |
| `TMR Addendum 7` | Persona-Driven Visualization Psychology — color, density, environment |
| `CLT-51A` Part 2-5 | Per-persona measure inventory, proposed forms, page consolidation |
| `FM_Views_Data_Persona_Analysis.docx` | 6 persona roles, view hierarchy, data requirements |

**The Cognitive Fit Test (mandatory before every component):**
1. What decision task does this serve? (Identification / Comparison / Ranking / Monitoring / Selection / Planning)
2. Does the visual form match that task?
3. Is this form already used for a different task on the same page? (If yes, change one)
4. Does the visualization include a reference frame?
5. Which processing mode? (Type 1 for monitoring/identification, Type 2 for selection/planning)

---

## PHASE 0: DIAGNOSTIC — MAP CURRENT STATE

```bash
echo "============================================"
echo "OB-102 PHASE 0: PLATFORM LANDING DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: REMOVE useFinancialOnly — FIND ALL REFERENCES ==="
grep -rn "useFinancialOnly\|financialOnly\|financial.*redirect\|redirect.*financial\|isFinancialOnly" web/src/ --include="*.tsx" --include="*.ts"

echo ""
echo "=== 0B: OPERATE LANDING PAGE ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -80
echo "---"
wc -l web/src/app/operate/page.tsx 2>/dev/null

echo ""
echo "=== 0C: PERFORM LANDING PAGE ==="
cat web/src/app/perform/page.tsx 2>/dev/null | head -80
echo "---"
wc -l web/src/app/perform/page.tsx 2>/dev/null

echo ""
echo "=== 0D: CURRENT ICM VISUALIZATION COMPONENTS ==="
echo "--- Bar charts ---"
grep -rn "BarChart\|Bar " web/src/app/perform/ web/src/app/operate/ web/src/components/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20
echo "--- Line/Area charts ---"
grep -rn "LineChart\|AreaChart\|Line " web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -20
echo "--- Distribution/Histogram ---"
grep -rn "Distribution\|Histogram\|histogram" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -10
echo "--- Sparklines ---"
grep -rn "Sparkline\|sparkline" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -10
echo "--- Other ---"
grep -rn "Gauge\|Radar\|Heatmap\|Treemap\|GoalGradient\|ProgressRing" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -10

echo ""
echo "=== 0E: REFERENCE FRAMES IN ICM PAGES ==="
grep -rn "trend\|arrow\|↑\|↓\|→\|vs prior\|vs last\|percent.*change\|reference.*frame\|benchmark" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -20

echo ""
echo "=== 0F: COMMENTARY / INSIGHTS IN ICM PAGES ==="
grep -rn "insight\|commentary\|narrat\|InsightPanel\|intelligence\|deterministic" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -15

echo ""
echo "=== 0G: MODULE DETECTION ==="
grep -rn "hasFinancial\|modules_enabled\|module.*enabled\|enabledModules\|tenant.*module" web/src/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== 0H: SIDEBAR NAVIGATION CONFIG ==="
cat web/src/lib/navigation/workspace-config.ts 2>/dev/null | head -60
echo "---"
grep -n "perform\|operate\|Perform\|Operate" web/src/lib/navigation/workspace-config.ts 2>/dev/null | head -20

echo ""
echo "=== 0I: CURRENT ICM DASHBOARD COMPONENTS ==="
grep -rn "LifecycleStepper\|lifecycle\|Lifecycle\|ComponentStack\|BenchBar\|DistributionChart" web/src/app/perform/ web/src/app/operate/ web/src/components/ --include="*.tsx" | head -20

echo ""
echo "=== 0J: SESSION CONTEXT — WHAT DATA IS AVAILABLE ==="
grep -rn "ruleSetCount\|ruleSets\|calculationBatches\|batchCount\|SessionContext\|useSession" web/src/lib/ web/src/contexts/ --include="*.tsx" --include="*.ts" | head -20

echo ""
echo "=== 0K: PERSONA PAGES — ADMIN/MANAGER/REP ROUTES ==="
find web/src/app/perform -name "page.tsx" | sort
find web/src/app/operate -name "page.tsx" | sort
grep -rn "effectivePersona\|persona" web/src/app/perform/ web/src/app/operate/ --include="*.tsx" | head -15

echo ""
echo "=== 0L: RESULTS DASHBOARD ==="
cat web/src/app/operate/results/page.tsx 2>/dev/null | head -60
grep -rn "BarChart\|LineChart\|Distribution\|BenchBar\|Sparkline" web/src/app/operate/results/ --include="*.tsx" | head -10
```

**PASTE ALL OUTPUT.** This diagnostic maps the gap between specification and reality for the platform landing pages and ICM visualizations.

---

## PHASE 1: REMOVE useFinancialOnly — CLEAN SURGICAL DELETE

The `useFinancialOnly` hook was built on a wrong design assumption. It must be completely removed.

### 1A: Delete the hook file

```bash
# Find the hook
find web/src/ -name "use-financial-only*" -o -name "useFinancialOnly*"
```

Delete the file entirely.

### 1B: Remove all imports and usages

```bash
# Find every file that imports or uses it
grep -rn "useFinancialOnly\|use-financial-only\|isFinancialOnly" web/src/ --include="*.tsx" --include="*.ts"
```

For each file:
1. Remove the import line
2. Remove the hook call (`const isFinancialOnly = useFinancialOnly()` or similar)
3. Remove any conditional logic that depended on it (early returns, redirects, conditional renders)
4. If the file had an early `return null` gated on `isFinancialOnly`, remove it — let the page render normally

### 1C: Remove redirect guards from Operate and Perform pages

In `/operate/page.tsx` and `/perform/page.tsx` (or their layout files), remove any code that:
- Checks for Financial-only status
- Calls `router.replace('/financial')`
- Returns null or a loading spinner while checking financial status

The operate and perform pages should render their content unconditionally (auth-gated, but not module-gated via redirect).

### PROOF GATE 1: Clean Removal
```
PG-01: `grep -rn "useFinancialOnly\|isFinancialOnly\|use-financial-only" web/src/` returns zero results
PG-02: npm run build exits 0 (no broken imports)
PG-03: Sabor Grupo → /operate loads without redirect loop or infinite spinner
PG-04: Pipeline Test Co → /operate loads normally (ICM tenant unaffected)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 1: Remove useFinancialOnly — wrong design assumption" && git push origin dev`

---

## PHASE 2: UNIFIED MODULE-AWARE OPERATE LANDING — BLOODWORK DASHBOARD

### 2A: Detect Tenant Modules

Create or extend a hook that detects what modules a tenant has enabled:

```typescript
// Conceptual — adapt to existing data model
function useTenantModules() {
  // From session context or tenant config:
  // - hasICM: true if tenant has ICM rule sets configured
  // - hasFinancial: true if tenant has Financial module/POS data
  // - modules: ['icm', 'financial'] array
  // Sabor Grupo: { hasICM: true, hasFinancial: true }
  // Pipeline Test Co: { hasICM: true, hasFinancial: false }
  // Future tenant: { hasICM: false, hasFinancial: true }
}
```

The detection should be based on actual data presence (rule sets exist, POS data imported), not a configuration flag that could be stale.

### 2B: Operate Landing — Bloodwork Module Health Dashboard

Replace the current `/operate` page content with a Bloodwork-style module health dashboard.

**Design:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Operations Overview — [Tenant Name]                                 │
│  [Deterministic commentary paragraph]                                │
│                                                                      │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐│
│  │ ICM Module                      │  │ Financial Module             ││
│  │ ✅ Healthy                      │  │ 🟡 Attention                 ││
│  │                                 │  │                              ││
│  │ 2 Active Plans                  │  │ 20 Active Locations          ││
│  │ 719 Entities                    │  │ 47,051 Cheques               ││
│  │ Last Calculation: Jan 2024      │  │ MX$17M Revenue               ││
│  │ Reconciliation: 100% Match     │  │ 2 Locations Flagged          ││
│  │                                 │  │                              ││
│  │ → Operations Center             │  │ → Financial Dashboard        ││
│  │ → Import Data                   │  │ → Network Pulse              ││
│  │ → Calculate                     │  │ → Import POS Data            ││
│  │ → View Results                  │  │                              ││
│  └─────────────────────────────────┘  └─────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Recent Activity                                                 │ │
│  │ • Jan 24 — ICM Calculation completed: 719 entities, MX$1.25M   │ │
│  │ • Jan 22 — POS Data imported: 47,051 cheques                   │ │
│  │ • Jan 20 — Reconciliation: 100% match verified                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Module Health Cards:**
- One card per enabled module (read from tenant data, not hardcoded)
- Each shows: module name, health status (green/amber/red), key stats, quick action links
- Health status derived from data freshness, calculation recency, anomaly counts
- Click module name → navigates to that module's primary workspace
- Click action links → navigates to specific pages

**Conditional rendering:**
- ICM-only tenant (Pipeline Test Co): shows only ICM card, full width
- Financial-only tenant (hypothetical): shows only Financial card, full width
- Dual-module tenant (Sabor Grupo): shows both cards side by side
- No modules: shows "Configure your first module" with link to Configure

**Bloodwork Principle:**
- If ALL modules are healthy: "All systems operational" — confidence builds silently
- If ANY module has issues: that module card gets amber/red with specific callout
- Detail on demand: click for full module workspace

### 2C: Deterministic Commentary Block

At the top of the Operate landing, below the header:

```
📊 Operations Summary — Enero 2024
ICM: 2 plans configured, last calculation Jan 24 with 100% reconciliation match.
Financial: MX$17M revenue across 20 locations, 3 brands. 2 locations flagged for
attention (Fuego Dorado Chapultepec below brand average). Network leakage 1.0%
within target.
```

This is deterministic — computed from:
- ICM: rule set count, last batch date, reconciliation status, entity count
- Financial: revenue totals, location count, brand count, flagged locations
- Template + data = natural language summary

### 2D: Recent Activity Timeline

Below the module cards, show a chronological activity feed:
- Last N significant events across all modules
- Import completions, calculation runs, reconciliation results, data imports
- Each entry: timestamp, module badge, description, status
- NOT a filing cabinet — show only the last 5-7 meaningful events

### PROOF GATE 2: Operate Landing
```
PG-05: Sabor Grupo /operate shows BOTH ICM and Financial module cards
PG-06: Pipeline Test Co /operate shows ONLY ICM module card (full width)
PG-07: Each module card shows health status (green/amber/red)
PG-08: Each module card shows real data (entity counts, revenue, dates)
PG-09: Clicking module name navigates to correct workspace
PG-10: Deterministic commentary visible with tenant-specific data
PG-11: Recent activity timeline shows last 5+ events
PG-12: No ICM lifecycle stepper visible on landing (moved to Operations Center)
PG-13: No currency amounts showing cents (PDR-01)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 2: Unified module-aware Operate landing with Bloodwork dashboard" && git push origin dev`

---

## PHASE 3: PERFORM LANDING — MODULE-AWARE BLOODWORK DASHBOARD

### 3A: Perform Landing Redesign

The `/perform` page is the "see data" workspace. For a dual-module tenant, it should show a Bloodwork summary of performance across ALL modules.

**Admin Persona — Home (Gobernar):**

From CLT-51A measure inventory, the Admin Home should show:

| Measure | Decision Task | Visual Form | Reference Frame |
|---------|---------------|-------------|-----------------|
| Total Compensation (ICM) | Identification | HeroMetric | ↑/↓ vs prior period |
| Entity count | Identification | HeroMetric sub-metric | — |
| Budget pacing | Monitoring | HeroMetric + threshold color | vs 100% budget |
| Exceptions count | Selection | HeroMetric sub-metric (expand when populated) | — |
| Distribution | Pattern | DistributionChart (histogram) | Mean/Median/StdDev |
| Lifecycle phase | Planning | LifecycleStepper (compact, not truncated) | Current phase |
| Entities vs Budget | Comparison | BenchBar with budget reference line | Budget line |
| Component breakdown | Part-of-whole | ComponentStack (stacked bar) | Color-coded |
| Network Revenue (Financial) | Identification | HeroMetric | ↑/↓ trend |
| Location Health (Financial) | Monitoring | Mini status indicators | Green/amber/red |

**Visualization Diversity Target: 7+ forms.** Currently at 6 per CLT-51A — add Sparkline or GaugeMetric to reach 7.

**Module-Aware Sections:**
- If ICM enabled: show ICM performance section (compensation summary, distribution, lifecycle)
- If Financial enabled: show Financial performance section (revenue KPIs, brand health mini-cards)
- Both: show both sections with clear module headers

### 3B: Manager Persona — Home (Acelerar)

From CLT-51A:

| Measure | Decision Task | Visual Form | Reference Frame |
|---------|---------------|-------------|-----------------|
| Zone total payout | Identification | HeroMetric + TrendArrow | vs prior period |
| Zone avg attainment | Identification | HeroMetric sub-metric | vs budget |
| Team on target count | Identification | HeroMetric sub-metric | N / total |
| Coaching needed count | Identification | HeroMetric sub-metric | N flagged |
| **Acceleration cards** | **Selection** | **3 cards: Certify (emerald), Coach (amber), Intervene (rose)** | **Impact estimate** |
| Per-member bars | Comparison | BenchBar with zone average line | Zone average |
| Per-member trajectory | Monitoring | Sparkline (6 points) in team row | Trend direction |
| Per-member payout | Identification | Currency in team row | — |
| Streak recognition | Identification | Pill badge (gold + 🔥) | 3+ months threshold |
| Coaching flags | Selection | Warning badge on declining members | 3+ period decline |

**Key Thermostat element:** The 3 Acceleration cards (Certify / Coach / Intervene) — this is Vialuce's competitive differentiator. Not just showing data but prescribing action. Each card estimates impact.

**Visualization Diversity: 6+ forms (HeroMetric, ActionCards, BenchBar, Sparkline, PillBadge, TrendArrow).**

### 3C: Rep Persona — Home (Crecer)

From CLT-51A:

| Measure | Decision Task | Visual Form | Reference Frame |
|---------|---------------|-------------|-----------------|
| YTD payout | Identification | HeroMetric (5xl, dominant) | vs prior (TrendArrow) |
| Attainment % | Monitoring | ProgressRing (right of hero) | 100% = full circle |
| Pill badges | Identification | Rank, Certification, Streak badges | Achievement thresholds |
| **Tier progress** | **Planning** | **GoalGradientBar: 0% → 80% Base → 100% Premium → 150% Élite** | **Tier markers** |
| Gap framing | Planning | Dynamic label | Distance to next tier |
| Deposit signal | Identification | Footer text | "Aprobado · Depósito: 28 de Febrero" |
| Component breakdown | Comparison | ComponentStack + drill-down | Component total |
| Dispute link | Selection | Action link per component | — |
| Relative position | Ranking | NeighborhoodLeaderboard (3 above, 3 below) | Current position |
| Trajectory | Monitoring | 5-month sparkline series | Personal trend |

**Visualization Diversity: 9 forms (HeroMetric, Ring, GoalGradient, ComponentStack, RelativeLeaderboard, SmallMultiples, PillBadge, ActionCards, TrendArrow). Exceeds spec.**

**Key: Goal-Gradient Effect** (Hull 1932, Kivetz 2006) — the GoalGradientBar with tier markers is the most motivating element. Near the next tier: "Solo MX$125k más para Élite ↑". Already past: "Ya lograste 125%".

### 3D: Deterministic Commentary on Perform Landing

Each persona gets contextual commentary:

**Admin:** "Total compensation MX$1,253,832 across 719 entities. Budget pacing 91% — on track. 0 exceptions active. Distribution shows 42% of entities in MX$1,000-2,000 band."

**Manager:** "Team of 8: 5 on target, 2 need coaching (declining 3+ periods), 1 exceeding. Zone total MX$345,000 ↑3.2% vs prior. Top performer: [name] at 142% attainment."

**Rep:** "Your YTD payout MX$24,500 ↑8% vs last period. Attainment 112% — Premium tier. MX$47,500 more to reach Élite. Ranked #4 of 12 in your zone."

### PROOF GATE 3: Perform Landing
```
PG-14: Admin sees module-aware dashboard with ICM + Financial sections (if both enabled)
PG-15: Admin dashboard shows 7+ distinct visualization forms
PG-16: Manager sees Acceleration cards (Certify/Coach/Intervene) — not just data
PG-17: Manager sees BenchBar with zone average reference line
PG-18: Manager sees Sparkline per team member
PG-19: Rep sees GoalGradientBar with tier markers
PG-20: Rep sees NeighborhoodLeaderboard (3 above, 3 below)
PG-21: Rep sees ProgressRing for attainment
PG-22: Every persona landing has deterministic commentary
PG-23: Every hero metric has a reference frame (trend arrow or threshold)
PG-24: Visualization diversity minimum met per persona
PG-25: No currency amounts showing cents on ≥ MX$10,000 (PDR-01)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 3: Module-aware Perform landing with per-persona Bloodwork dashboards" && git push origin dev`

---

## PHASE 4: ICM RESULTS DASHBOARD — COGNITIVE FIT ENFORCEMENT

The Results Dashboard (`/operate/results`) shows calculation output. Apply the same standards OB-101 applied to Financial pages.

### 4A: Required Content

| Section | Decision Task | Visual Form | Reference Frame |
|---------|---------------|-------------|-----------------|
| Total Compensation | Identification | HeroMetric (dominant) | ↑/↓ vs prior batch |
| Entity count | Identification | HeroMetric sub-metric | — |
| Mean / Median | Identification | HeroMetric pair | Mean vs Median gap indicates skew |
| Distribution | Pattern | DistributionChart (5-7 buckets) | Mean + Median lines |
| Component breakdown | Part-of-whole | ComponentStack (stacked bar) | % of total per component |
| Per-entity detail | Selection | Sortable table with anomaly flags | vs mean (highlight outliers) |
| Anomalies (Bloodwork) | Monitoring | Summary cards → grouped → full | Severity: Critical/Warning/Info |
| Commentary | Intelligence | Deterministic paragraph | Data-driven insights |

### 4B: Anomaly Display — Bloodwork Principle (OB-92 spec)

The anomaly display MUST follow Standing Rule 23:

**Layer 1 — Summary cards (DEFAULT VIEW):**
- Critical / Warning / Info counts
- If 0 critical and 0 warnings: "All checks passed" — green confidence card
- Passing checks build confidence silently

**Layer 2 — Grouped (EXPAND):**
- Anomalies grouped by type with context
- "Identical Payouts (12 warnings): 83 entities at $1,500 · Common in tiered rate tables."

**Layer 3 — Full list (ON DEMAND):**
- "Show All Anomalies" reveals flat list

### 4C: Visualization Diversity

Results page minimum 5 distinct forms:
1. HeroMetric cards (Identification)
2. DistributionChart histogram (Pattern)
3. ComponentStack stacked bar (Part-of-whole)
4. Sortable table with anomaly flags (Selection)
5. Bloodwork summary cards (Monitoring)

### PROOF GATE 4: Results Dashboard
```
PG-26: 5+ distinct visualization forms on Results page
PG-27: Anomaly display follows Bloodwork 3-layer pattern (summary → grouped → full)
PG-28: Zero-anomaly state shows "All checks passed" confidence card
PG-29: Every hero metric has reference frame
PG-30: Distribution chart shows mean + median reference lines
PG-31: Deterministic commentary paragraph visible
PG-32: Currency formatting correct (PDR-01)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 4: ICM Results Dashboard — cognitive fit + Bloodwork anomalies" && git push origin dev`

---

## PHASE 5: OPERATIONS CENTER — LIFECYCLE COCKPIT REDESIGN

The Operations Center (`/operate/operations` or wherever the lifecycle stepper lives) is the detailed ICM operational view. It should NOT be the landing page — it's the detail behind the module card click-through.

### 5A: Required Content

| Element | Decision Task | Visual Form |
|---------|---------------|-------------|
| Lifecycle phases | Planning | ConfigurablePipeline with expandable steps + action buttons |
| Import status | Monitoring | StatusCards per data source with freshness timestamp |
| Calculation queue | Selection | PrioritySortedList with urgency encoding |
| Current batch summary | Identification | HeroMetric cards (entities, total payout, components) |
| Commentary | Intelligence | Deterministic paragraph about current lifecycle position |

### 5B: Lifecycle Stepper Fix

CLT-51A F-23 identified the lifecycle stepper as truncated. Fix:
- Full-width stepper with all phases visible
- Current phase highlighted with accent color
- Each phase has: status icon, label, duration, action button
- Past phases: green checkmark
- Current phase: pulsing accent
- Future phases: muted/outline

### PROOF GATE 5: Operations Center
```
PG-33: Lifecycle stepper not truncated — all phases visible
PG-34: Each phase has action button (Import → "Import Data", Calculate → "Run Calculation")
PG-35: Import status shows data freshness timestamp
PG-36: Commentary paragraph with lifecycle-specific insights
PG-37: Operations Center is reachable from Operate landing module card click-through
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 5: Operations Center lifecycle cockpit redesign" && git push origin dev`

---

## PHASE 6: PAGE CONSOLIDATION — ELIMINATE DUPLICATES

CLT-51A identified significant page duplication. Execute the consolidation:

### 6A: Eliminate Duplicates

| Route to Remove | Reason | Redirect To |
|-----------------|--------|-------------|
| Performance Dashboard | Identical to Overview (F-29) | `/perform` |
| Statement (if separate) | Merged into My Pay | `/perform/pay` |
| My Transactions (if separate) | Merged into My Pay | `/perform/pay` |
| Find Transaction (if separate) | Search on My Pay | `/perform/pay` |
| Rankings (if separate) | Merged into Home leaderboard | `/perform` |
| Performance Trends (if separate) | Merged into Home | `/perform` |

For each eliminated route:
1. Check if the route exists: `ls web/src/app/[route]/page.tsx`
2. If it exists and is a duplicate, delete the page file
3. Add a redirect in the parent or middleware
4. Remove from sidebar navigation config

### 6B: Sidebar Navigation Cleanup

Update `workspace-config.ts` (or equivalent) to match the consolidated page structure:

**Admin:**
```
PERFORM: Home (module-aware overview), Results, Trends (only if unique content)
OPERATE: Operations Center, Import Data, Calculate, Reconciliation
CONFIGURE: Plans, Periods, Entities, Settings
FINANCIAL: (only if tenant has Financial module)
```

**Manager:**
```
PERFORM: Home (team overview), Results
OPERATE: Approvals (if built)
FINANCIAL: (filtered to their locations, if enabled)
```

**Rep:**
```
PERFORM: Home (my performance), My Pay
FINANCIAL: Server Detail (if enabled)
```

### 6C: Remove Dead-End Navigation Items

```bash
# Find all sidebar nav items
grep -n "label\|path\|href\|route" web/src/lib/navigation/workspace-config.ts | head -40
```

For every sidebar item, verify the target page exists and renders content. Remove any item that leads to:
- An empty page
- A placeholder
- A route that 404s
- A route that redirects to its parent

### PROOF GATE 6: Consolidation
```
PG-38: Performance Dashboard route eliminated (redirect to /perform)
PG-39: No duplicate routes (every route renders unique content)
PG-40: Sidebar items per persona: Admin ≤10, Manager ≤5, Rep ≤4
PG-41: No dead-end sidebar items (every link has real, populated page)
PG-42: Single-child workspace sections navigate directly (no expand click)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 6: Page consolidation — eliminate duplicates, clean navigation" && git push origin dev`

---

## PHASE 7: PLATFORM-WIDE REFERENCE FRAMES + COMMENTARY

### 7A: Reference Frames on Every ICM Metric

Audit every ICM page. Any HeroMetric, KPI card, or quantitative display without a reference frame is a violation.

**Reference frame types:**
- Trend arrow: ↑/↓ % vs prior period
- Threshold color: green (on target), amber (warning), red (below target)
- Benchmark line: vs budget, vs average, vs prior
- Fraction: N / total

**Rules:**
- If only one period exists, show "—" not "0% vs prior"
- If no budget configured, show trend vs prior only
- Every number must answer "is that good or bad?"

### 7B: Deterministic Commentary on Every ICM Page

Every page that shows data gets a deterministic commentary paragraph:
- Computed from data (NOT an LLM call)
- References specific values, names, and comparisons
- Highlights what needs attention
- Generated from template + data values

Pages needing commentary:
- `/perform` (admin/manager/rep landing)
- `/operate` (module health dashboard)
- `/operate/results` (calculation results)
- `/operate/operations` (lifecycle status)
- `/operate/reconciliation` (reconciliation results)

### PROOF GATE 7: Reference Frames + Commentary
```
PG-43: Every HeroMetric on ICM pages has a reference frame
PG-44: No "0% vs prior" on any metric (show "—" if single period)
PG-45: Deterministic commentary visible on /perform, /operate, /operate/results
PG-46: Commentary references specific data values (not generic template text)
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Phase 7: Reference frames and deterministic commentary on all ICM pages" && git push origin dev`

---

## PHASE 8: BUILD + VERIFICATION + COMPLETION

### 8A: Build

```bash
cd /Users/AndrewAfrica/spm-platform/web
rm -rf .next
npm run build 2>&1 | tail -20
# MUST exit 0
```

### 8B: Route Verification

```bash
echo "=== ALL ROUTES ==="
for route in "" "perform" "operate" "operate/results" "operate/reconciliation" "operate/calculate" "configure" "financial"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: $STATUS"
done

echo ""
echo "=== ELIMINATED ROUTES (should redirect) ==="
for route in "investigate" "govern" "design" "data"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/$route)
  echo "/$route: $STATUS (expect 307 or 404)"
done
```

### 8C: Tenant Verification

```
Load vialuce.ai as Sabor Grupo (dual-module):
  → /operate shows module health dashboard with BOTH ICM and Financial cards
  → /perform shows admin dashboard with ICM + Financial sections
  → No redirect to /financial
  → No ICM lifecycle stepper on landing page

Load vialuce.ai as Pipeline Test Co (ICM-only):
  → /operate shows module health dashboard with ICM card only (full width)
  → /perform shows admin dashboard with ICM section only
  → No Financial module card or section visible
```

### 8D: Persistent Defect Registry — Verification

| PDR # | Description | In Scope? | Status | Evidence |
|-------|-------------|-----------|--------|----------|
| PDR-01 | Currency no cents | YES | PASS/FAIL | [Screenshot of any page with currency ≥ MX$10K] |
| PDR-02 | ~~Financial redirect~~ → Module-aware landing | **REPLACED** | PASS/FAIL | [Screenshot of Sabor Grupo /operate showing BOTH modules] |
| PDR-03 | Bloodwork Financial Landing | VERIFY | PASS/FAIL | [Confirm /financial still shows card-based landing from OB-101] |
| PDR-04 | N+1 platform overhead | NOTE | PASS/FAIL | [Network tab count on /operate and /perform] |
| PDR-05 | Persona effectivePersona | YES | PASS/FAIL | [Rep persona showing scoped view on perform landing] |
| PDR-06 | Brand cards as headers | VERIFY | PASS/FAIL | [Financial Network Pulse still correct] |
| PDR-07 | Amber threshold ±5% | VERIFY | PASS/FAIL | [Financial Network Pulse still correct] |

**PDR-02 is REPLACED** with new definition:
> **PDR-02 (revised): Module-Aware Operate Landing**
> **Rule:** `/operate` shows a unified Bloodwork module health dashboard. Dual-module tenants see BOTH module cards. Single-module tenants see one card full-width. No redirects. No `useFinancialOnly` hook.
> **Correct:** Sabor Grupo → `/operate` → shows ICM card + Financial card side by side
> **Wrong:** Sabor Grupo → `/operate` → redirects to `/financial` OR shows ICM lifecycle stepper only

### 8E: Cognitive Fit Verification Matrix

| Page | Component Types Used | Count | Diversity Pass? | Commentary? | Reference Frames? |
|------|---------------------|-------|-----------------|-------------|-------------------|
| /operate (landing) | | | ≥3? | Yes/No | Yes/No |
| /perform (admin) | | | ≥7? | Yes/No | Yes/No |
| /perform (manager) | | | ≥6? | Yes/No | Yes/No |
| /perform (rep) | | | ≥7? | Yes/No | Yes/No |
| /operate/results | | | ≥5? | Yes/No | Yes/No |
| /operate/operations | | | ≥3? | Yes/No | Yes/No |

### 8F: Completion Report

Create `OB-102_COMPLETION_REPORT.md` at project root:

1. useFinancialOnly removal — before/after
2. Operate landing — module health dashboard with Bloodwork
3. Perform landing — per-persona redesign (Admin/Manager/Rep)
4. Results Dashboard — cognitive fit + Bloodwork anomalies
5. Operations Center — lifecycle cockpit
6. Page consolidation — routes eliminated, nav items per persona
7. Reference frames — before/after count
8. Commentary blocks — pages with deterministic narration
9. PDR verification (all 7, including PDR-02 revision)
10. Cognitive fit matrix (6+ pages)
11. All proof gates PASS/FAIL with evidence

### 8G: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-102: Platform Bloodwork Landing & IAP Enforcement" \
  --body "## What This OB Delivers

### Design Assumption Correction (Decision 46)
Sabor Grupo has BOTH ICM and Financial modules. The useFinancialOnly redirect
hook is removed entirely. /operate shows a unified module-aware Bloodwork
dashboard — not a redirect.

### Unified Operate Landing
- Module health cards (ICM + Financial) with Bloodwork status
- Dual-module tenants see both; single-module see one full-width
- Deterministic commentary + recent activity timeline
- Replaces ICM-specific lifecycle stepper as landing content

### Per-Persona Perform Dashboards
- Admin (Gobernar): 7+ visualization forms, module-aware sections
- Manager (Acelerar): Acceleration cards (Certify/Coach/Intervene)
- Rep (Crecer): GoalGradientBar, ProgressRing, NeighborhoodLeaderboard
- Every persona has deterministic commentary + reference frames

### ICM Cognitive Fit Enforcement
- Results Dashboard: 5+ forms, Bloodwork anomaly display, commentary
- Operations Center: Full-width lifecycle stepper, action buttons
- Reference frames on every quantitative metric
- Deterministic commentary on every data page

### Page Consolidation
- Duplicate routes eliminated (Performance Dashboard = Overview)
- Dead-end navigation items removed
- Nav items reduced: Admin ≤10, Manager ≤5, Rep ≤4

### PDR Updates
- PDR-02 revised: Module-aware landing (replaces Financial redirect)
- PDR-01 verified: Currency formatting on all new pages
- PDR-05 verified: Persona filtering on all new pages

## Proof Gates: 46
## PDR Verification: 7/7
## Cognitive Fit Matrix: 6+ pages verified"
```

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "OB-102 Complete: Platform Bloodwork Landing & IAP Enforcement" && git push origin dev`

---

## SCOPE BOUNDARIES

### IN SCOPE
- Remove `useFinancialOnly` hook entirely
- Unified module-aware Operate landing (Bloodwork dashboard)
- Per-persona Perform landing redesign (Admin/Manager/Rep)
- ICM Results Dashboard cognitive fit enforcement
- Operations Center lifecycle cockpit improvement
- Page consolidation (eliminate duplicates)
- Sidebar navigation cleanup per persona
- Reference frames on every ICM metric
- Deterministic commentary on every data page
- PDR-02 revision (redirect → unified landing)
- PDR-01/05 verification on new pages

### OUT OF SCOPE — DO NOT BUILD
- Financial page changes (OB-101 scope — verify but don't modify)
- Calculation engine changes
- New Supabase tables
- Auth flow changes (DO NOT TOUCH — read AUTH_FLOW_REFERENCE.md)
- LLM-powered narration (S32 — deterministic only)
- Mobile layouts
- Óptica Luminar data pipes
- N+1 systemic fix (PDR-04 — separate OB)
- New seed data
- Budget/target imports

---

## ANTI-PATTERNS TO AVOID

| # | Anti-Pattern | Prevention |
|---|---|---|
| AP-1 | Redirect hack for module awareness | Unified landing with conditional rendering per module |
| AP-2 | ICM lifecycle stepper as landing page | Bloodwork module health cards as landing; stepper in Operations Center |
| AP-3 | Same visualization for different tasks | Cognitive Fit Test before every component |
| AP-4 | Metrics without reference frames | Every number needs "is that good or bad?" |
| AP-5 | Generic commentary | Every commentary must reference specific data values |
| AP-6 | Dead-end navigation items | Every sidebar link verified against actual pages |
| AP-7 | Modifying auth files | Read AUTH_FLOW_REFERENCE.md — DO NOT TOUCH |
| AP-8 | Data table as landing page content | Landing = Bloodwork summary cards; tables are detail pages |
| AP-9 | Hardcoded module detection | Read from actual data (rule sets, POS imports) not config flags |
| AP-10 | Rep persona seeing admin density | Lowest density for rep — 5-6 elements above fold max |

---

*ViaLuce.ai — The Way of Light*
*OB-102: The Bloodwork Principle doesn't stop at Financial. Every surface is a cockpit.*
*"A platform that redirects away from its landing page has already lost the demo."*
