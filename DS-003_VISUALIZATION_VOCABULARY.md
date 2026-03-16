# DS-003: VIALUCE VISUALIZATION VOCABULARY
## Cognitive Fit Design Specification
## February 17, 2026

---

## PURPOSE

This specification defines the visualization vocabulary for every ViaLuce surface. It is the implementable companion to TMR Addendum 8 (Visualization-Task Cognitive Fit Framework). Every component built by CC must reference this specification when choosing how to represent data.

**The rule is simple:** The visual form must match the decision task. The form carries meaning before the label is read.

---

## SECTION 1: THE VISUALIZATION COMPONENT LIBRARY

### 1.1 Identification Components — "What is this value?"

**Use when:** The user needs to read a current value quickly. No comparison, no trend, no sequence — just "what is the number right now?"

**Component: HeroMetric**
```
┌─────────────────────────┐
│  ◎ ACTIVE TENANTS       │  ← Label: slate-400, uppercase, xs, tracking-wide
│                         │
│  57                     │  ← Value: slate-100, text-4xl, font-bold, tabular-nums
│  ↑ 12% vs last period  │  ← Context: trend arrow + benchmark comparison
│                         │
│  2 total                │  ← Subtitle: slate-500, text-sm
└─────────────────────────┘
```
- Icon prefix (lucide-react) identifies the metric category
- Value is the dominant element (largest font on the card)
- Context line provides the reference frame (trend, benchmark, or subtitle)
- Background: card surface (`#0F172A`) with optional focal glow per Design Theme Analysis
- Persona accent: subtle left border or glow tint

**Component: GaugeMetric**
```
     ╭───────╮
    ╱    87%  ╲        ← Semicircular gauge with fill
   │           │       ← Fill color: green <80%, amber 80-90%, red >90%
   ╰───────────╯       ← Or inverse: green >target, amber near, red below
   Fleet Confidence     ← Label below gauge
```
- Use ONLY when the value has a natural 0-100% range with meaningful thresholds
- Do NOT use for open-ended values (revenue, user counts — use HeroMetric)
- Threshold bands visible on the gauge arc provide the reference frame

**Anti-pattern:** Progress bar for identification. A progress bar implies movement toward a goal. If the task is just "read this number," use a KPI card or gauge.

---

### 1.2 Comparison Components — "How does A relate to B?"

**Use when:** The user needs to compare two or more values against each other or against a benchmark.

**Component: HorizontalBar (ranked comparison)**
```
  Zone Norte    ████████████████████████░░░░  87%
  Zone Centro   ██████████████████████░░░░░░  82%    ← Reference line at zone average
  Zone Sur      ████████████████░░░░░░░░░░░░  68%
                ─────────────────|──────────
                              avg: 79%
```
- Sorted by value (highest first) to enable instant ranking
- Reference line (zone average, budget, target) as vertical marker
- Bar color: persona accent at full opacity; unfilled portion at 15% opacity
- Label left-aligned, value right-aligned — eyes scan naturally

**Component: SideBySideCards (entity comparison)**
```
┌──────────────┐  ┌──────────────┐
│ Óptica       │  │ Velocidad    │
│ Luminar      │  │ Deportiva    │
│              │  │              │
│  22 entities │  │  35 entities │
│  MX$20,662   │  │  MX$34,100   │
│  ██████░░ 7  │  │  █████░░░ 5  │
│  lifecycle   │  │  lifecycle   │
└──────────────┘  └──────────────┘
```
- Use for 2-5 items where each has multiple dimensions
- Consistent layout across cards enables visual diff
- Highlight the dimension with the largest variance

**Component: StackedBar (part-of-whole comparison)**
```
  Total Payout: MX$20,662
  ┌────────────────────────────────────┐
  │ Base ████  Tier ██████  Cert ███   │
  │ 28%         42%          18%       │  ← Component breakdown
  └────────────────────────────────────┘
```
- Use instead of pie charts (perceptually more accurate per Cleveland & McGill 1984)
- Segment colors from the persona palette, desaturated
- Hover/tap reveals exact values per segment

**Anti-pattern:** Table of numbers for spatial comparison. Tables force serial reading; bars enable parallel comparison.

---

### 1.3 Ranking Components — "Where do I stand?"

**Use when:** The user needs to understand their relative position within a population.

**Component: NeighborhoodLeaderboard (rep view)**
```
   3  María López      MX$52,100   ↑2
   ─────────────────────────────────
 → 4  Carlos García    MX$47,200   ──    ← YOU — highlighted, persona accent
   ─────────────────────────────────
   5  Ana Reyes        MX$45,800   ↓1
   6  Diego Morales    MX$41,200   ↑3
   7  Sofia Navarro    MX$39,900   ↓2
```
- Shows 2-3 positions above and below the user
- User's row is highlighted with persona accent background
- Movement arrows show change since last period
- Does NOT show rank #1 unless the user is in the neighborhood (prevents demotivation from large gaps — Social Comparison Theory, DS-001 Research #2)

**Component: DistributionPosition (admin/manager view)**
```
                    ╱╲
                   ╱  ╲
                  ╱    ╲
                 ╱      ╲
               ╱    ▲    ╲
              ╱     │     ╲
             ╱──────┼──────╲
            ╱       │       ╲
  ─────────╱────────┼────────╲──────
          P25      P50      P75
                 You: P62
```
- Distribution curve (histogram or density) with the user/entity's position marked
- Admin sees the full population shape
- Manager sees their team's distribution within the broader population
- Reference lines at quartile boundaries

**Anti-pattern:** Absolute rank list (#1 through #500). This demotivates everyone below the top 10 and adds no actionable insight. Use neighborhood view for individuals, distribution for managers/admins.

---

### 1.4 Monitoring Components — "Is this on track?"

**Use when:** The user needs to detect trends, trajectory, and deviation from expected path over time.

**Component: Sparkline (embedded trend)**
```
  Revenue Attainment    ▁▂▃▄▅▆▇█▇▆    87%
                        Jan ────── Now
```
- Small, inline, no axis labels — the shape IS the information
- Embed within cards, table rows, or next to KPI values
- Color: single persona accent, or gradient from red→green based on trajectory
- Max 12-15 data points for readability

**Component: ThresholdArea (pacing monitor)**
```
  │ ╱╲                        Target zone
  │╱  ╲    ╱╲   ╱╲  ╱       ┌──────────┐
  │    ╲  ╱  ╲ ╱  ╲╱        │ ░░░░░░░░ │
  │     ╲╱                   └──────────┘
  └──────────────────────
    Jan  Feb  Mar  Apr
```
- Area chart with a shaded "target band" (expected range)
- Line within the band = healthy. Line outside = deviation.
- Band color: green fill at 10% opacity. Deviation: amber or red area fill.
- Use for metrics with a known expected trajectory (budget pacing, quota attainment, lifecycle SLA)

**Component: TrendArrow (minimal monitoring)**
```
  ↑ 12%    ← Green up arrow: positive trend
  ↓ 3%     ← Red down arrow: negative trend
  → 0%     ← Neutral: flat/stable
```
- Simplest monitoring signal — attach to any KPI card
- Arrow direction + percentage + color = three signals in one compact element
- Use when space is constrained (table cells, mobile, rail metrics)

**Anti-pattern:** Single number without temporal context. "85% attainment" means nothing without "and it was 78% last month" or "trending ↑ 7%."

---

### 1.5 Selection Components — "Which should I choose?"

**Use when:** The user needs to evaluate multiple options and pick one (or prioritize).

**Component: PrioritySortedList (triage)**
```
  ┌─ 🔴 ─────────────────────────────────────┐
  │  Velocidad Deportiva — Lifecycle stalled   │
  │  at PENDING_APPROVAL for 72h               │  → [Review]
  └────────────────────────────────────────────┘
  ┌─ 🟡 ─────────────────────────────────────┐
  │  New tenant onboarding — No data imported  │
  │  Created 3 days ago                        │  → [Guide]
  └────────────────────────────────────────────┘
  ┌─ 🔵 ─────────────────────────────────────┐
  │  Óptica Luminar — Period ready to close    │
  │  All gates passed                          │  → [Close]
  └────────────────────────────────────────────┘
```
- Severity encoding: left border color + icon (red/amber/blue/gray)
- Action button on each item — the thermostat principle
- Sorted by urgency (critical first)
- Use for Operations Queue, approval queue, exception list

**Component: RadarChart (multi-dimensional evaluation)**
```
         Technical
            ╱╲
           ╱  ╲
  Speed ──╱────╲── Quality
          ╲    ╱
           ╲  ╱
            ╲╱
         Coverage
```
- Use for comparing 3-6 dimensions of a single entity or comparing 2-3 entities
- Overlay target profile as a reference shape
- Limit to 6 axes maximum — beyond that, switch to parallel coordinates or table
- Use sparingly — most users are unfamiliar; annotate axes clearly

**Anti-pattern:** Unstructured card grid for evaluation. Cards are for browsing, not for deliberate comparison. If the user needs to pick one, provide sorting, filtering, and clear comparison dimensions.

---

### 1.6 Planning Components — "What steps reach the goal?"

**Use when:** The user needs to understand a sequence of actions, see where they are in the sequence, and know what comes next.

**Component: ConfigurablePipeline (lifecycle)**
```
  ●────●────●────◐────○────○────○
  DRAFT  PREVIEW  OFFICIAL  APPROVE  POST  CLOSE  PAID
                    ▲
                 You are here
                 Next: Submit for Approval
                 Required by: Feb 20
```
- Active state: filled circle with glow
- Completed states: filled circles with check or muted
- Future states: hollow circles
- Gate type encoding: Required gates have solid borders, Conditional have dashed, Auto have dotted
- Action label beneath current position: "Next: [action]" — the thermostat
- Timeline/SLA indicator: "Required by [date]" or "3 days remaining"

**Component: SteppedProgress (rep goal path)**
```
  ┌─────────┐    ┌─────────┐    ┌─────────┐
  │ Tier 1  │───▸│ Tier 2  │───▸│ Tier 3  │
  │ 0-80%   │    │ 80-100% │    │ 100%+   │
  │ Base    │    │ 1.2x    │    │ 1.5x    │
  └─────────┘    └─────────┘    └─────────┘
       ✓              ▲ 87%         ○
                   You are here
                   MX$125k more to Tier 3
```
- Shows the tiers/stages as discrete steps, not a continuous bar
- Current position marked with persona accent
- Gap to next step shown as specific actionable number
- Uses Goal-Gradient framing from DS-001: near goal = gap framing, far from goal = progress framing

**Component: FlowDiagram (process visualization)**
```
  Upload → Classify → Map → Validate → Commit
    ✓        ✓       ◐      ○          ○
                     ▲
               3 fields need review
```
- Use for import pipeline, onboarding flow, any multi-step process
- Width can encode volume (river metaphor)
- Color can encode health (green = flowing, amber = slow, red = blocked)

**Anti-pattern:** Linear progress bar for planning. A progress bar says "you're 60% done" but doesn't tell the user what the steps are, which step they're on, or what the next action is. It collapses sequence into a single dimension.

---

## SECTION 2: PAGE-LEVEL COMPOSITION RULES

### Rule 1: The Diversity Minimum
Any page with 4+ data elements must use at least 3 different component types. If all metrics are HeroMetric cards, the page has failed Cognitive Fit.

### Rule 2: The Visual Hierarchy
Primary surface (above the fold): 1 dominant element + 3-4 supporting metrics. The dominant element should be the highest-priority decision task for that persona. Supporting metrics use smaller, less attention-demanding forms (sparklines, trend arrows, compact cards).

### Rule 3: The Reference Frame Mandate
Every quantitative visualization must include at least one reference frame: benchmark, target, average, trend, or threshold. "Is that good or bad?" must be answerable at a glance without reading surrounding text.

### Rule 4: Persona Density Gradient
- **Admin:** Highest density. Multiple visualization types. Tables acceptable. Dense grid layouts.
- **Manager:** Medium density. People-focused cards with embedded sparklines. 2-column layouts.
- **Rep:** Lowest density. Hero metric dominant. Maximum 5-6 visible elements. Single-column focus.

### Rule 5: The Ambient Environment
Background gradient shifts per persona (DS-001, TMR Addendum 7). Visualization components sit on this environment. The environment color should NOT compete with the data encoding colors. Environment = identity. Data colors = state.

### Rule 6: Interaction Reveals Depth
Primary surface is glanceable (Type 1 processing). Click/hover/expand reveals detail (Type 2 processing). Never put Type 2 content on the primary surface. Progressive disclosure, not progressive overload.

---

## SECTION 3: COLOR ENCODING RULES

### Semantic Colors (Reserved — Never Use for Brand/Decoration)
| Color | Meaning | Hex | Usage |
|---|---|---|---|
| Green | Healthy / On Track / Positive | `#10B981` | Status, trend direction, within threshold |
| Amber | Warning / Attention / Approaching Limit | `#F59E0B` | Nearing threshold, requires review |
| Red | Critical / Off Track / Exceeded | `#EF4444` | Exceeded threshold, blocked, failed |
| Blue | Informational / Neutral / New | `#3B82F6` | Low urgency, informational, unstarted |

### Persona Accent Colors (Environment + Highlights)
| Persona | Primary | Gradient | Usage |
|---|---|---|---|
| Admin | `#6366F1` (indigo-500) | `indigo-500 → violet-500` | Card borders, active states, focal glow |
| Manager | `#F59E0B` (amber-500) | `amber-500 → yellow-500` | Card borders, active states, focal glow |
| Rep | `#10B981` (emerald-500) | `emerald-500 → lime-400` | Card borders, active states, focal glow |

**Note:** Manager's amber overlaps with warning semantic color. Disambiguate by context: amber as environment/border = persona; amber as icon/badge = warning. Consider using `#D97706` (amber-600) for warning to create visual separation.

### Data Encoding Colors (Charts)
Use a sequential palette for ordered data, categorical palette for distinct categories:
- Sequential: `slate-700 → indigo-400 → violet-300` (low to high)
- Categorical: Limit to 5-6 distinct hues. Use the ViaLuce palette: indigo, violet, emerald, amber, rose, sky
- Never use red/green as the sole differentiator (color blindness)

### Text Hierarchy on Dark Background
| Level | Color | Weight | Size | Usage |
|---|---|---|---|---|
| Headline | `#F1F5F9` (slate-100) | 700 | text-2xl+ | Page titles, hero values |
| Section Label | `#CBD5E1` (slate-300) | 600 | text-sm, uppercase, tracking-wide | Section headers like "TENANT FLEET" |
| Body | `#94A3B8` (slate-400) | 400-500 | text-sm/base | Descriptions, labels, secondary info |
| Muted | `#64748B` (slate-500) | 400 | text-xs/sm | Timestamps, metadata, disabled |
| Disabled | `#475569` (slate-600) | 400 | text-xs | Truly inactive, placeholder |

**Critical:** Never use `#FFFFFF` for body text on dark backgrounds. Maximum brightness for extended reading: `#E2E8F0` (slate-200). Headlines can go to `#F1F5F9` but not pure white.

---

## SECTION 4: PLATFORM-SPECIFIC SURFACES

### Observatory (VL Admin)

| Element | Decision Task | Component | Data Source |
|---|---|---|---|
| Active Tenants | Identification | HeroMetric | `tenants` count |
| Total Entities | Identification | HeroMetric | `entities` count |
| Calculation Runs | Identification | HeroMetric with trend | `calculation_batches` count + sparkline |
| Active Periods | Identification | HeroMetric | `periods` where status ≠ closed |
| Operations Queue | Selection | PrioritySortedList | Derived from stalled lifecycles, missing data, new tenants |
| Tenant Fleet | Comparison | SideBySideCards → click to enter | `tenants` with entity/period/lifecycle overlay |
| AI Confidence | Monitoring | GaugeMetric + per-tenant sparklines | `classification_signals` confidence |
| Autonomous Rate | Monitoring | ThresholdArea (target: 85%+) | Files processed without human intervention |
| Processing Pipeline | Planning | FlowDiagram | Aggregate lifecycle positions across fleet |

### Tenant Dashboard — Admin

| Element | Decision Task | Component |
|---|---|---|
| Total Compensation | Identification | HeroMetric (hero position, largest) |
| Budget Pacing | Monitoring | ThresholdArea with budget band |
| Component Breakdown | Comparison | StackedBar |
| Team Distribution | Ranking | DistributionPosition (histogram) |
| Lifecycle Position | Planning | ConfigurablePipeline |
| Exception Queue | Selection | PrioritySortedList |

### Tenant Dashboard — Manager

| Element | Decision Task | Component |
|---|---|---|
| Zone Total | Identification | HeroMetric |
| Team Performance | Comparison + Ranking | HorizontalBar with zone average |
| Coaching Flags | Selection | Flagged cards with action buttons |
| Quota Pacing | Monitoring | ThresholdArea or progress arc |
| Individual Sparklines | Monitoring | Sparkline per team member |

### Tenant Dashboard — Rep

| Element | Decision Task | Component |
|---|---|---|
| YTD Payout | Identification | HeroMetric (hero, dominant) |
| Progress to Tier | Planning | SteppedProgress with gap framing |
| Relative Position | Ranking | NeighborhoodLeaderboard |
| Component Split | Comparison | HorizontalStackedBar |
| Earnings Trend | Monitoring | Sparkline |

---

## SECTION 5: IMPLEMENTATION NOTES FOR CC

1. **Read TMR Addendum 8 for the WHY.** This document tells you WHAT to build.
2. **Every visualization decision is testable.** Before implementing, state: "This [component] serves the [decision task] task for [persona] because [rationale]."
3. **Use recharts for React charts.** Already available in the project. Sparklines, bars, areas, radar all supported.
4. **Use lucide-react for icons.** Already available. Match icons to metric categories.
5. **Focal glow CSS pattern:**
```css
.hero-card::before {
  content: '';
  position: absolute;
  inset: -20px;
  background: radial-gradient(ellipse at center, var(--persona-accent-glow) 0%, transparent 70%);
  z-index: -1;
  pointer-events: none;
}
```
6. **Persona background gradients (from DS-001):**
```
Admin:   from-slate-950 via-indigo-950/40 to-slate-950
Manager: from-slate-950 via-amber-950/25 to-slate-950
Rep:     from-slate-950 via-emerald-950/25 to-slate-950
```
7. **The Cognitive Fit Test (from TMR Addendum 8) must pass before any PR ships.** Add to proof gates: "PG-X: Visualization diversity — page uses 3+ distinct component types for 4+ data elements."

---

*ViaLuce.ai — The Way of Light*

*DS-003: Visualization Vocabulary — February 17, 2026*

*"A dashboard that uses one visual form for every metric is a filing cabinet with identical drawers. A dashboard with cognitive fit is a cockpit — every instrument is shaped for its purpose, and the pilot reads the room before reading any gauge."*
