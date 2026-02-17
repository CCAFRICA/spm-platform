# OB-51: VISUAL FIDELITY AND VISUALIZATION INTELLIGENCE — EVERY SURFACE

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## WHY THIS OB EXISTS

Five consecutive attempts (HF-034, 035, 036, 038, OB-46/47/49) tried to land DS-001 visual fidelity. All reported PASS. None matched the browser output. The DS-001 mock — a rendered JSX artifact — shows crisp dark gradients, vibrant colored cards, floating glass panels, and research-backed visualization diversity. Every page in production looks flat, dull, and monochrome.

**This is not a per-component problem. It is a systemic problem.**

Every page suffers because the global CSS theme (globals.css, Tailwind config, shadcn/ui defaults) establishes a low-contrast, muted foundation that every component inherits. Adding DS-001 classes to individual components fights the global defaults and loses. The fix is to change the global defaults so every page inherits DS-001 automatically.

Additionally, our accumulated design research (TMR Addendum 7: Persona-Driven Visualization Psychology, TMR Addendum 8: Cognitive Fit Framework, DS-003: Visualization Vocabulary) specifies that:
- No page should use the same visual form for two different cognitive tasks
- Every metric needs a reference frame ("is this good or bad?")
- Visualization type must match decision task (identification → HeroMetric, comparison → BenchBar, distribution → histogram, monitoring → sparkline, etc.)
- Metrics must be expanded beyond what currently renders — sparklines, trend arrows, deltas, gauges, relative leaderboards, goal-gradient progress bars

None of this has been implemented on any surface.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT.
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev`.
6. Commit this prompt to git as first action.

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What CC Did | What To Do Instead |
|---|---|---|
| Grep-based verification | Searched source files for class names, reported PASS | Trace rendering chain from `<html>` to visible element. If ANY parent sets white/light bg, the child classes don't matter |
| Wrong component rendered | Added DS-001 layout to AdminDashboard.tsx, but admin routes to /operate | Verify the component you're editing actually renders on the URL the user visits |
| Style-only fix on structural problem | Added dark classes to Operations Center, but the Operations Center is the wrong page | If the wrong PAGE renders, no amount of styling fixes it |
| Report inflation | 22/22 PASS while 3 fundamental problems persisted | If you can't verify browser output, report INCONCLUSIVE |
| Per-component surgery on systemic issue | Fixed one card on one page while 30 other cards on 15 pages had the same problem | Fix the GLOBAL theme so all components inherit correct styles |

---

## DESIGN REFERENCES — READ ALL BEFORE PHASE 1

```bash
echo "=== READING ALL DESIGN REFERENCES ==="
echo "=== 1. DS-001: The visual spec (604 lines) ==="
cat DS-001_vialuce-ui-design-spec-v3.jsx

echo ""
echo "=== 2. DS-003: Visualization vocabulary ==="
cat DS-003_VISUALIZATION_VOCABULARY.md

echo ""
echo "=== 3. TMR Addendum 7: Persona visualization psychology ==="
cat ViaLuce_TMR_Addendum7_Feb2026.md

echo ""
echo "=== 4. TMR Addendum 8: Cognitive fit framework ==="
cat ViaLuce_TMR_Addendum8_Feb2026.md
```

If any file is not at project root, search `/mnt/user-data/outputs/` and `/mnt/project/`.

---

## PHASE 0: DIAGNOSTIC — GLOBAL THEME AUDIT

Before changing anything, understand WHY every page is flat.

```bash
echo "============================================"
echo "PHASE 0: GLOBAL THEME AUDIT"
echo "============================================"

echo ""
echo "=== 0A: GLOBAL CSS — The root cause ==="
cat web/src/app/globals.css

echo ""
echo "=== 0B: TAILWIND CONFIG — Theme variables ==="
cat web/tailwind.config.ts 2>/dev/null || cat web/tailwind.config.js 2>/dev/null

echo ""
echo "=== 0C: shadcn THEME — CSS custom properties ==="
grep -n "hsl\|--background\|--foreground\|--card\|--primary\|--muted\|--border\|--accent\|--ring" \
  web/src/app/globals.css | head -40

echo ""
echo "=== 0D: ROOT LAYOUT — html/body classes ==="
cat web/src/app/layout.tsx

echo ""
echo "=== 0E: AUTH SHELL — Content wrapper ==="
cat web/src/components/layout/auth-shell.tsx 2>/dev/null | head -60

echo ""
echo "=== 0F: CHROME SIDEBAR — Content area ==="
grep -n "main\|content\|children\|bg-\|background\|className" \
  web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | head -20

echo ""
echo "=== 0G: PERSONA LAYOUT ==="
cat web/src/components/layout/PersonaLayout.tsx 2>/dev/null

echo ""
echo "=== 0H: WHAT DOES ADMIN SEE? ==="
cat web/src/app/page.tsx | head -80

echo ""
echo "=== 0I: WHAT IS AT /operate? ==="
cat web/src/app/operate/page.tsx 2>/dev/null | head -60

echo ""
echo "=== 0J: ALL PAGES WITH BACKGROUNDS ==="
grep -rn "bg-white\|bg-background\|bg-slate-50\|bg-gray-\|bg-zinc-100\|bg-neutral" \
  web/src/ --include="*.tsx" --include="*.css" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== 0K: SHADCN CARD COMPONENT ==="
cat web/src/components/ui/card.tsx 2>/dev/null

echo ""
echo "=== 0L: ADMIN DASHBOARD COMPONENT ==="
find web/src -name "*Admin*Dashboard*" -o -name "*admin*dashboard*" | head -5
cat $(find web/src -path "*dashboard*" -name "*Admin*" -name "*.tsx" | head -1) 2>/dev/null | head -80

echo ""
echo "=== 0M: FONT LOADING ==="
grep -rn "DM.Sans\|DM_Sans\|dm-sans\|fontFamily\|Inter\|Geist" \
  web/src/app/layout.tsx web/src/app/globals.css 2>/dev/null | head -10

echo ""
echo "=== 0N: CYCLE/QUEUE/PULSE STATUS ==="
grep -rn "CycleIndicator\|QueuePanel\|PulseMetrics\|CompensationClock\|LifecycleStepper" \
  web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== 0O: LOGIN PAGE ==="
cat web/src/app/login/page.tsx | head -40

echo ""
echo "=== 0P: EVERY PAGE ROUTE ==="
find web/src/app -name "page.tsx" | sort

echo ""
echo "PASTE FULL OUTPUT INTO COMPLETION REPORT"
```

**Commit:** `OB-51 Phase 0: Global theme and rendering chain diagnostic`

---

## PHASE 1: GLOBAL THEME REWRITE — THE ROOT FIX

This is the phase that makes every subsequent phase work. Without this, adding DS-001 classes to individual components will be overridden again.

### 1A: globals.css — Rewrite the CSS custom properties

The shadcn/ui theme likely defines `--background`, `--foreground`, `--card`, `--border`, etc. using HSL values. The dark mode values need to match DS-001:

```css
/* DS-001 Dark Theme */
:root {
  /* These are ONLY for components that use CSS variables */
  --background: 222.2 47.4% 3.9%;     /* #0a0e1a — near-black with blue undertone */
  --foreground: 210 40% 96%;           /* #e2e8f0 — zinc-200 */
  --card: 222.2 47.4% 5.5%;            /* #0f172a — slate-900 */
  --card-foreground: 210 40% 96%;      /* #e2e8f0 */
  --popover: 222.2 47.4% 5.5%;
  --popover-foreground: 210 40% 96%;
  --primary: 238.7 83.5% 66.7%;        /* #818cf8 — indigo-400 */
  --primary-foreground: 0 0% 100%;
  --secondary: 217.2 32.6% 12%;        /* #1e293b — slate-800 */
  --secondary-foreground: 210 40% 96%;
  --muted: 217.2 32.6% 12%;
  --muted-foreground: 215 20.2% 55%;   /* #71717a — zinc-500 */
  --accent: 217.2 32.6% 12%;
  --accent-foreground: 210 40% 96%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 100%;
  --border: 217.2 32.6% 15%;           /* ~slate-700/60 */
  --input: 217.2 32.6% 15%;
  --ring: 238.7 83.5% 66.7%;
  --radius: 0.75rem;
}
```

**CRITICAL:** If there are separate `:root` and `.dark` selectors, DS-001 values go in BOTH (or remove the `:root` light theme and only keep `.dark`). The app must always be dark.

### 1B: Remove ANY light backgrounds in globals.css

Search for and remove:
- `background-color: white`
- `bg-white`
- `bg-background` if --background maps to a light color
- Any `@media (prefers-color-scheme: light)` overrides
- Any `.light` class definitions

### 1C: tailwind.config — Extend with DS-001 colors

Add DS-001's specific colors to the Tailwind extend config:

```javascript
theme: {
  extend: {
    colors: {
      // DS-001 chart colors (named for clarity)
      chart: {
        rose: '#f87171',
        amber: '#fbbf24',
        blue: '#60a5fa',
        emerald: '#34d399',
        purple: '#a78bfa',
        pink: '#f472b6'
      }
    },
    fontFamily: {
      sans: ['DM Sans', 'system-ui', 'sans-serif'],
    }
  }
}
```

### 1D: shadcn Card component — Override defaults

Find `web/src/components/ui/card.tsx`. Replace the Card background with DS-001 defaults:

```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-2xl border text-card-foreground", className)}
      style={{
        background: 'rgba(24, 24, 27, 0.8)',
        borderColor: 'rgba(39, 39, 42, 0.6)',
        ...style
      }}
      {...props}
    />
  )
);
```

This ensures every `<Card>` in the app automatically gets DS-001 glass treatment. Individual pages can override with persona-specific gradients.

### 1E: DM Sans font

In `layout.tsx`, load DM Sans:

```tsx
import { DM_Sans } from 'next/font/google';
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['300','400','500','600','700'] });

// In the <body> tag:
<body className={`${dmSans.className} dark antialiased`}>
```

### 1F: html and body — Force dark

```tsx
<html lang="es" className="dark" style={{ colorScheme: 'dark' }}>
<body className={`${dmSans.className} dark antialiased`}
  style={{ background: '#0a0e1a', color: '#e2e8f0', minHeight: '100vh' }}>
```

Inline styles as insurance against any CSS class that might override.

### 1G: Auth shell / main content wrapper — Transparent

Whatever wraps `{children}` after the sidebar MUST be transparent, not white:

```tsx
<main className="flex-1 overflow-auto" style={{ background: 'transparent' }}>
  {children}
</main>
```

### 1H: PersonaLayout — Gradient wrapper

Create or update PersonaLayout to provide the persona-specific gradient:

```tsx
export function PersonaLayout({ children, persona }: { children: React.ReactNode, persona: string }) {
  const gradients = {
    admin: 'linear-gradient(to bottom, #020617, rgba(30, 27, 75, 0.4), #020617)',
    manager: 'linear-gradient(to bottom, #020617, rgba(69, 26, 3, 0.25), #020617)',
    rep: 'linear-gradient(to bottom, #020617, rgba(6, 78, 59, 0.25), #020617)',
  };
  return (
    <div style={{
      background: gradients[persona] || gradients.admin,
      minHeight: '100vh',
      fontFamily: "'DM Sans', system-ui, sans-serif"
    }}>
      {children}
    </div>
  );
}
```

### 1I: Validation — no light backgrounds in the chain

```bash
echo "=== POST-FIX: Verify no white/light backgrounds ==="
grep -rn "bg-white\|bg-slate-50\|bg-gray-50\|bg-neutral-50\|bg-zinc-50\|bg-background" \
  web/src/ --include="*.tsx" --include="*.css" | grep -v node_modules | grep -v ".next" | grep -v "hover:" | wc -l
echo "COUNT MUST BE 0 (or only in explicit light-on-dark elements like buttons)"
```

**Proof gate PG-1:** Zero white/light backgrounds in the rendering chain from `<html>` to any page content. The global CSS variables all map to DS-001 dark values. DM Sans loaded. Every `<Card>` defaults to glass treatment.

**Commit:** `OB-51 Phase 1: Global theme rewrite — DS-001 dark foundation for all surfaces`

---

## PHASE 2: DS-001 DESIGN SYSTEM COMPONENTS

Create or replace the shared visualization components. These are the building blocks used across ALL persona dashboards. Copy the implementations EXACTLY from DS-001 (lines 74-199).

### Component inventory — each in `web/src/components/design-system/`:

| File | DS-001 Lines | Purpose | Cognitive Task |
|------|-------------|---------|---------------|
| `AnimNum.tsx` | 74-81 | Animated counting number | Identification — "what is this value?" |
| `Ring.tsx` | 82-92 | Circular progress/gauge | Monitoring — "how full is this?" |
| `Pill.tsx` | 93-98 | Status/achievement badge | Identification — "what state is this?" |
| `BenchBar.tsx` | 100-123 | Horizontal bar with benchmark reference line | Comparison — "how does this compare to expected?" |
| `DistributionChart.tsx` | 125-145 | 5-bucket colored histogram | Distribution — "what is the shape of this population?" |
| `RelativeLeaderboard.tsx` | 148-171 | Neighbor-only relative position | Ranking — "where do I stand?" |
| `ComponentStack.tsx` | 173-199 | Stacked bar with legend | Part-of-whole — "what's the breakdown?" |
| `Spark.tsx` | NEW (from DS-001 line 325-329) | Tiny SVG polyline sparkline | Monitoring — "what is the trajectory?" |
| `TrendArrow.tsx` | NEW (from DS-003 §1.4) | ↑/↓/→ with % delta and color | Monitoring — "is this going up or down?" |
| `GoalGradient.tsx` | NEW (from DS-001 lines 468-489) | Multi-tier progress bar with landmarks | Progress — "how close am I to the next tier?" |

### Implementation rules:
- Copy JSX and Tailwind classes EXACTLY from DS-001
- Add TypeScript interfaces for props
- Use INLINE STYLES for backgrounds and gradients (Tailwind has failed 4x)
- Export from a barrel: `web/src/components/design-system/index.ts`
- Each component is self-contained — no external shadcn dependency

### DS-003 Cognitive Fit rule embedded:
Every component has a `/** @cognitiveFit */` JSDoc tag:
```tsx
/** @cognitiveFit comparison — "How does A relate to B?" */
export function BenchBar({ ... }) { ... }
```

**Proof gate PG-2:** All 10 components exist, export correctly, have TypeScript props, use inline styles for critical visuals, and have cognitive fit annotations.

**Commit:** `OB-51 Phase 2: DS-001 design system components — 10 shared visualizations`

---

## PHASE 3: ADMIN DEFAULT ROUTE FIX

Admin persona must land on the DASHBOARD page (showing DS-001 AdminView), NOT on `/operate`.

Trace the redirect chain from Phase 0 diagnostic. Fix so:
- Login → tenant selection → admin lands on `/` (dashboard)
- `/operate` remains accessible from sidebar as a workspace
- The dashboard page at `/` detects persona from context and renders persona-specific content

If the routing is hardcoded (middleware, auth-shell, or persona context redirecting admin to /operate), change it.

**Proof gate PG-3:** Admin persona lands on dashboard (/) after tenant selection, NOT /operate.

**Commit:** `OB-51 Phase 3: Admin default route → dashboard`

---

## PHASE 4: ADMIN DASHBOARD — DS-001 EXACT + METRICS EXPANSION

Rewrite the admin dashboard to match DS-001 lines 211-302 EXACTLY, plus the metrics expansion from our design conversations.

### Layout:

```
ROW 1: grid grid-cols-12 gap-4
├── col-span-5: HERO (indigo-to-violet gradient)
│   ├── "TOTAL COMPENSACIÓN · FEBRERO 2026" — uppercase, 10px, tracking-widest
│   ├── MX$20,662 — AnimNum, 4xl, bold, white
│   ├── 12 entidades | 87% presupuesto | 3 excepciones (THE PULSE)
│   └── TrendArrow: +3.2% vs prior period
├── col-span-4: DISTRIBUTION HISTOGRAM
│   ├── 5-bucket: rose/amber/blue/emerald/purple (SPECIFIC hex colors from DS-001)
│   ├── Count labels above bars
│   └── Stats: Promedio, Mediana, Desv.Est
└── col-span-3: LIFECYCLE STEPPER (THE CYCLE)
    ├── 7 circles: B→C→R→O→A→P→X, first N with checkmarks
    ├── Current state name (bold white)
    ├── "Publicar a 12 entidades" (muted)
    └── Action button: "Publicar Resultados →" (indigo-500)

ROW 2: grid grid-cols-12 gap-4
├── col-span-7: LOCATIONS VS BUDGET (BenchBar per entity)
│   ├── Each: name, sublabel (payout + budget), gradient bar, white 100% reference line
│   ├── Delta % right-aligned: emerald positive, rose negative
│   ├── Bar color: emerald ≥100%, amber ≥85%, rose <85%
│   └── Spark sparkline per entity if history exists
└── col-span-5: COMPONENT STACK + EXCEPTIONS (THE QUEUE)
    ├── Stacked horizontal bar (rounded-full, h-5)
    ├── Legend with colored dots + name + MX$ value
    ├── Divider
    └── EXCEPCIONES ACTIVAS
        ├── Priority-sorted items with rose/amber/zinc left border
        └── Each with action text (thermostat — what to do, not just what is)
```

### Visualization diversity check (DS-003 Cognitive Fit Test):
| Element | Visual Form | Cognitive Task | Unique? |
|---------|------------|----------------|---------|
| Total payout | HeroMetric (AnimNum) | Identification | ✓ |
| Attainment distribution | Histogram (5-bucket) | Distribution | ✓ |
| Lifecycle state | Phase stepper (circles) | Planning/Sequence | ✓ |
| Locations vs budget | BenchBar (horizontal bars + reference) | Comparison | ✓ |
| Component composition | StackedBar (part-of-whole) | Part-of-whole | ✓ |
| Exceptions | PrioritySortedList (severity-coded) | Selection/Triage | ✓ |
| Trend vs prior period | TrendArrow | Monitoring | ✓ |

**7 distinct visual forms for 7 data elements.** Zero duplication. This passes the Cognitive Fit Test.

### Data wiring:
- Total payout: `SUM(entity_period_outcomes.total_payout)` or `SUM(calculation_results.total_payout)`
- Entity count: `COUNT(entities)` for tenant
- Attainment distribution: Array of `entity_period_outcomes.attainment_percentage`
- Budget: From `tenants.settings` or `plan_rules` — show "—" if not configured
- Components: Aggregate `calculation_results.components` JSONB — use `Object.keys(obj || {})` not `.length`
- Lifecycle: From `periods.status` or `calculation_batches.lifecycle_state`
- Exceptions: Derive from attainment < 80% or > 130%, pending approvals, open disputes
- Prior period delta: Compare current period total vs previous period total

### INLINE STYLES for critical visual elements:
```jsx
// Hero card
style={{
  background: 'linear-gradient(to bottom right, rgba(79, 70, 229, 0.8), rgba(109, 40, 217, 0.8))',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  borderRadius: '16px', padding: '20px'
}}
// Standard card
style={{
  background: 'rgba(24, 24, 27, 0.8)',
  border: '1px solid rgba(39, 39, 42, 0.6)',
  borderRadius: '16px', padding: '20px'
}}
```

**Proof gates PG-4 through PG-7:**
- PG-4: Admin dashboard has TWO rows with `grid-cols-12` layout
- PG-5: 7 distinct visual forms — no duplicated chart type for different data
- PG-6: All chart colors use DS-001 hex values (not generic Tailwind)
- PG-7: Every metric has a reference frame (benchmark, delta, or trend)

**Commit:** `OB-51 Phase 4: Admin dashboard — DS-001 exact with metrics expansion`

---

## PHASE 5: MANAGER DASHBOARD — DS-001 EXACT + METRICS EXPANSION

Rewrite the manager dashboard to match DS-001 lines 314-415.

### Layout:

```
ROW 1: grid grid-cols-12 gap-4
├── col-span-4: ZONE HERO (amber-to-yellow gradient)
│   ├── Zone name, team total (AnimNum), vendor count, period
│   ├── Grid: promedio % | N en meta | N coaching (THE PULSE)
│   └── TrendArrow: delta vs prior period
└── col-span-8: ACCELERATION OPPORTUNITIES (THE THERMOSTAT)
    ├── Emerald card: certification opportunity (name → impact = +MX$/mes) [Agendar]
    ├── Amber card: near-threshold opportunity (name — solo N% para meta) [Coaching]
    └── Rose card: declining trend warning (name — Nth month below) [Plan]

ROW 2: full width
└── TEAM PERFORMANCE
    ├── Legend: zone avg line, color codes
    └── Per team member:
        ├── Rank # | Avatar | Name + store | BenchBar (zone avg reference) | Spark (6pts) | MX$ payout | Streak badge
        └── Bar color: emerald ≥100%, amber ≥85%, rose <85%
```

### Visualization diversity check:
| Element | Visual Form | Cognitive Task | Unique? |
|---------|------------|----------------|---------|
| Zone total | HeroMetric (AnimNum) | Identification | ✓ |
| Acceleration opportunities | Prescriptive action cards | Selection/Decision | ✓ |
| Team performance | BenchBar per person (horizontal bars + reference) | Comparison | ✓ |
| Individual trajectory | Sparkline (embedded SVG polyline) | Monitoring | ✓ |
| Streak recognition | Pill badge (gold + fire emoji) | Identification (achievement) | ✓ |
| Certification status | Dot indicator (emerald filled/empty) | Status | ✓ |

**6 distinct visual forms. Zero duplication.**

### Additional metrics from our conversations:
- **Coaching flags:** Bold callout for team members with negative trajectory (3+ period decline)
- **Top performer:** Highlighted in the team list, not just #1 by rank
- **Period comparison:** If >1 period exists, delta % per team member vs prior period
- **Data freshness:** Small text showing last import time (thermostat: "stale data" warning if > 48h)

### Sparklines implementation:
For each team member, if `entity_period_outcomes` has data for 3+ periods, render Spark component (DS-001 lines 325-329). If <3 periods, show "—" instead.

**Proof gates PG-8, PG-9:**
- PG-8: Every team member row has BenchBar + Spark + payout + streak (4 elements)
- PG-9: Acceleration cards each have an ACTION BUTTON (not just display)

**Commit:** `OB-51 Phase 5: Manager dashboard — DS-001 exact with sparklines and acceleration cards`

---

## PHASE 6: REP DASHBOARD — DS-001 EXACT + METRICS EXPANSION

Rewrite the rep dashboard to match DS-001 lines 429-560.

### Layout:

```
HERO: full width
└── Emerald-to-teal gradient
    ├── LEFT: "Mi Compensación · Febrero 2026" | MX$3,348 (5xl) | Pill badges (#1 de 12, Certificado, 🔥6 meses)
    ├── RIGHT: Ring gauge (125% attainment)
    ├── GOAL-GRADIENT PROGRESS BAR
    │   ├── Tier markers: 0% | 80% Base | 100% Premium | 150% Élite
    │   ├── Warm gradient fill: emerald → lime → yellow
    │   ├── White dot at current position
    │   └── Dynamic label: "Solo MX$125k más para Élite →" (gap framing near goal)
    └── "Aprobado · Depósito: 28 de Febrero" (closure signal)

ROW 2: grid grid-cols-12 gap-4
├── col-span-7: CADA PESO EXPLICADO
│   ├── ComponentStack (stacked bar)
│   ├── Per-component expandable rows: name, description, MX$ value
│   ├── "¿Disputar? →" link (thermostat)
│   └── Total line
└── col-span-5: stack
    ├── RELATIVE LEADERBOARD (neighbors only, bottom anonymized)
    ├── TRAJECTORY (5-month small multiples)
    └── ACTION CARDS: Simulador + Mi Plan
```

### Visualization diversity check:
| Element | Visual Form | Cognitive Task | Unique? |
|---------|------------|----------------|---------|
| Personal payout | HeroMetric (AnimNum, 5xl) | Identification | ✓ |
| Attainment | Ring gauge | Monitoring | ✓ |
| Tier progress | GoalGradient (multi-tier progress bar) | Progress | ✓ |
| Component breakdown | StackedBar + expandable list | Part-of-whole + drill-down | ✓ |
| Relative position | RelativeLeaderboard (neighbors) | Ranking | ✓ |
| Trajectory | Small multiples (5 months) | Comparison over time | ✓ |
| Actions | Card buttons (Simulador, Mi Plan) | Selection | ✓ |

**7 distinct visual forms. Zero duplication.**

### Goal-gradient feedback framing:
```javascript
// Dynamic label based on position
const pctToElite = attainment / 150;
const label = pctToElite >= 0.7
  ? `Solo MX$${remainingForElite.toLocaleString()} más para Élite →`  // gap framing near goal
  : `Ya lograste ${attainment}%`;  // progress framing far from goal
```

### What-If simulator:
If the What-If component exists but shows nonsensical values (MX$75 at 125%), diagnose:
- Is the slider defaulting to 0 instead of current attainment?
- Is the projection formula using wrong tier rates?
- Fix: `calculateProjectedPayout(currentAttainment)` must equal actual current payout as baseline

**Proof gates PG-10 through PG-12:**
- PG-10: GoalGradient renders with 4 tier markers and warm gradient fill
- PG-11: RelativeLeaderboard shows neighbors with bottom 2 anonymized
- PG-12: Rep hero card has Ring gauge on the right side

**Commit:** `OB-51 Phase 6: Rep dashboard — DS-001 exact with goal-gradient and leaderboard`

---

## PHASE 7: OPERATE WORKSPACE — VISUAL ALIGNMENT

The Operate page (lifecycle cockpit) also needs the global theme + DS-001 treatment:

### Apply:
- PersonaLayout gradient wrapper (admin = indigo undertone)
- Cards use DS-001 glass treatment (inline styles)
- Text hierarchy: zinc-500 labels, white values
- Lifecycle stepper: if it exists here too, it should match the Cycle card from Phase 4
- Any data tables: dark rows (`bg-zinc-800/30`), subtle row borders (`border-zinc-800/40`), white text for values, zinc-400 for labels
- Any buttons: indigo-500 primary, zinc-800 secondary

### Visualization diversity:
The Operate page should NOT duplicate the dashboard's visualizations. If the dashboard shows lifecycle as a phase stepper, Operate shows lifecycle as a detailed pipeline/timeline with expandable steps, status per step, and action buttons per step. Different visual form for the same data = different cognitive task (dashboard = "where am I?", operate = "what's the next step?").

**Proof gate PG-13:** Operate page uses DS-001 card treatment, dark background, correct text hierarchy. No white backgrounds.

**Commit:** `OB-51 Phase 7: Operate workspace — visual alignment to global theme`

---

## PHASE 8: OBSERVATORY — VISUAL ALIGNMENT + METRICS EXPANSION

The Platform Observatory (VL Admin's landing page) must have the same visual standard.

### Apply:
- Dark gradient background (indigo undertone — VL Admin is a super-admin)
- All cards use DS-001 glass treatment
- Tab navigation: dark pills, active tab with persona accent
- Text hierarchy consistent with DS-001

### Metrics expansion — from our conversations:
Each Observatory tab should use visualization diversity:

**Observatory tab:**
- HeroMetric: Active tenants (with trend arrow vs last period)
- HeroMetric: Total calculations today (with 7-day sparkline)
- GaugeMetric: Platform health (composite score)
- Tenant fleet cards: per-tenant health dot, lifecycle state, entity count, last activity timestamp
- PrioritySortedList: Operations queue (critical first)

**AI Intelligence tab:**
- GaugeMetric: Classification accuracy (% auto-accepted)
- Sparkline: Accuracy trend over 30 days
- HeroMetric: Training signal velocity (corrections/period)
- HeroMetric: Autonomous processing rate (% zero-touch imports)
- BenchBar per tenant: AI confidence score with platform average reference line

**Billing & Usage tab:**
- HeroMetric: MRR (monthly recurring revenue)
- StackedBar: Revenue by plan tier
- BenchBar per tenant: Entity usage vs entitlement
- TrendArrow: Growth metrics

**Infrastructure tab:**
- GaugeMetric: Supabase connections (% of limit)
- GaugeMetric: Vercel build minutes (% of limit)
- HeroMetric: API calls today
- Sparkline: Error rate (7-day)

**Onboarding tab:**
- Pipeline stepper: stages from "Lead → Provisioned → Data Imported → Calculated → Live"
- Per-tenant progress through pipeline
- Action buttons at each stage (thermostat)

### Cognitive Fit enforcement per tab:
Each tab must use 3+ distinct component types. No tab should be all HeroMetrics or all tables.

**Proof gate PG-14:** Observatory uses DS-001 visual treatment. Each tab has 3+ distinct visual forms. No white backgrounds.

**Commit:** `OB-51 Phase 8: Observatory — visual alignment with metrics expansion`

---

## PHASE 9: ALL REMAINING PAGES — GLOBAL SWEEP

With the global theme fixed in Phase 1, most pages should already look better. But verify and fix any remaining pages:

```bash
echo "=== ALL PAGE ROUTES ==="
find web/src/app -name "page.tsx" | sort
```

For each page:
1. Verify it inherits the dark background (no explicit white/light override)
2. Verify cards use DS-001 treatment (if using shadcn Card, Phase 1 fixed it; if custom div, add inline styles)
3. Verify text hierarchy (labels zinc-500, values white)
4. If the page has data visualizations, verify they use the DS-001 components (BenchBar, not a raw div with width %)

### Specific pages to check:
- `/my-compensation` — calculation waterfall drill-down
- `/disputes` — dispute list with priority coding
- `/login` — already fixed in prior HF, verify tagline
- `/select-tenant` or `/observatory` — Platform Observatory
- Any `/investigate`, `/design`, `/configure`, `/govern` stubs

### Login fix (Option A):
Remove "Performance Intelligence Platform" from login. Keep only:
```
Vialuce
Intelligence. Acceleration. Performance.
```
Tagline: not italic, font-weight 500, letter-spacing 0.05em, indigo-400 color.

**Proof gate PG-15:** Every page.tsx in the app renders on a dark background with DS-001 text hierarchy. Zero white/light backgrounds remain. Login shows tagline only.

**Commit:** `OB-51 Phase 9: Global sweep — all pages aligned to DS-001 theme`

---

## PHASE 10: CYCLE/QUEUE/PULSE REINTEGRATION

OB-49 removed Cycle/Queue/Pulse from the sidebar. They return as dashboard-embedded elements:

### THE CYCLE = Lifecycle Stepper Card (Admin Dashboard, Row 1, col-span-3)
Already built in Phase 4. Verify it renders with real lifecycle data from Supabase.

### THE QUEUE = Exceptions Panel (Admin Dashboard, Row 2, col-span-5)
Already built in Phase 4. Verify it shows derived exceptions from calculation data.

### THE PULSE = Hero Card Metrics (All Persona Dashboards)
Already built in Phases 4/5/6. Verify each hero card shows 3 vital-sign metrics with TrendArrows.

### Breadcrumb Status Chip
If OB-49 added a lifecycle status chip to the breadcrumb, verify it renders. If not, add a small StatusPill next to the period name in the breadcrumb showing current lifecycle state.

### Verification:
After all phases, can a user at a glance:
1. Know what phase of the cycle they're in? → Lifecycle stepper (admin) or breadcrumb StatusPill
2. Know what needs attention? → Exceptions panel (admin) or acceleration cards (manager) or dispute link (rep)
3. Know if the system is healthy? → Hero card pulse metrics with trend arrows

**Proof gate PG-16:** Cycle expressed as lifecycle stepper, Queue as exceptions list, Pulse as hero metrics — all with real data or meaningful empty states.

**Commit:** `OB-51 Phase 10: Cycle/Queue/Pulse reintegrated into dashboard surfaces`

---

## PHASE 11: VERIFICATION

### Full rendering chain audit:
```bash
echo "=== FINAL RENDERING CHAIN ==="
echo "1. html:" && grep "className\|class=" web/src/app/layout.tsx | head -3
echo "2. body style:" && grep "style\|background" web/src/app/layout.tsx | head -3
echo "3. globals.css --background:" && grep "\-\-background" web/src/app/globals.css | head -3
echo "4. auth-shell:" && grep "bg-\|background\|style" web/src/components/layout/auth-shell.tsx 2>/dev/null | head -5
echo "5. ChromeSidebar content:" && grep "bg-\|background\|style" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | head -5
echo "6. PersonaLayout:" && grep "style\|gradient" web/src/components/layout/PersonaLayout.tsx 2>/dev/null | head -5
echo "7. Card default:" && grep "style\|background" web/src/components/ui/card.tsx 2>/dev/null | head -5
echo ""
echo "=== LIGHT BACKGROUND COUNT (must be 0) ==="
grep -rn "bg-white\|bg-slate-50\|bg-gray-50\|bg-zinc-50" web/src/ --include="*.tsx" --include="*.css" | grep -v node_modules | grep -v ".next" | grep -v "hover:" | wc -l
```

### Build verification:
```bash
cd web
npx tsc --noEmit 2>&1 | tail -10
npm run build 2>&1 | tail -10
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
kill %1
```

### PROOF GATE SUMMARY

| # | Gate | Category |
|---|------|----------|
| PG-1 | Global theme: zero light backgrounds in chain, DM Sans, dark CSS variables | Global |
| PG-2 | 10 design-system components exist with TypeScript props and inline styles | Components |
| PG-3 | Admin lands on dashboard (/), not /operate | Routing |
| PG-4 | Admin dashboard: 2 rows, grid-cols-12 layout | Admin |
| PG-5 | Admin dashboard: 7 distinct visual forms, zero duplication | Cognitive Fit |
| PG-6 | Chart colors use DS-001 hex values (#f87171, #fbbf24, #60a5fa, #34d399, #a78bfa) | Visual |
| PG-7 | Every admin metric has a reference frame (benchmark, delta, or trend) | Reference |
| PG-8 | Manager: each team member has BenchBar + Spark + payout + streak | Manager |
| PG-9 | Manager: acceleration cards have ACTION BUTTONS (Agendar, Coaching, Plan) | Thermostat |
| PG-10 | Rep: GoalGradient with 4 tier markers and warm gradient fill | Rep |
| PG-11 | Rep: RelativeLeaderboard with anonymized bottom | Rep |
| PG-12 | Rep: Ring gauge on hero card | Rep |
| PG-13 | Operate page: dark bg, DS-001 cards, correct text hierarchy | Operate |
| PG-14 | Observatory: DS-001 treatment, 3+ visual forms per tab | Observatory |
| PG-15 | ALL pages: dark background, DS-001 text hierarchy, no white | Global sweep |
| PG-16 | Cycle/Queue/Pulse: lifecycle stepper + exceptions + hero metrics | Living system |
| PG-17 | Login: "Vialuce" + tagline only, no category line, not italic | Login |
| PG-18 | Zero "ViaLuce" camelcase in user-visible strings | Brand |
| PG-19 | TypeScript: zero errors (`npx tsc --noEmit`) | Build |
| PG-20 | Production build: clean (`npm run build`) | Build |
| PG-21 | DS-003 Cognitive Fit: no page uses same visual form for 2 different data types | Design Rule |

### Completion Report

Create `OB-51_COMPLETION_REPORT.md` at PROJECT ROOT with:
1. Phase 0 diagnostic output (FULL)
2. Phase 1 globals.css BEFORE and AFTER
3. All 21 proof gates with PASS/FAIL/INCONCLUSIVE
4. Rendering chain verification output
5. Per-page screenshot checklist (what you expect to see)
6. Files created/modified count
7. Any items deferred with rationale

```bash
gh pr create --base main --head dev \
  --title "OB-51: DS-001 Visual Fidelity — Global Theme + Visualization Intelligence + Every Surface" \
  --body "## Root Cause
The global CSS theme (globals.css, Tailwind config, shadcn defaults) established a low-contrast,
muted foundation. Every component inherited it. 5 previous attempts added DS-001 classes to
individual components, which were overridden by the global theme at render time.

## What This OB Does

### Phase 1: Global Theme Rewrite (THE ROOT FIX)
- CSS custom properties → DS-001 dark values
- shadcn Card component → inline glass treatment
- DM Sans font loaded via next/font
- html/body forced dark with inline styles as insurance
- Auth shell / content wrapper → transparent (no white)
- PersonaLayout → persona-specific gradient backgrounds

### Phase 2: Design System Components (10 shared visualizations)
AnimNum, Ring, Pill, BenchBar, DistributionChart, RelativeLeaderboard,
ComponentStack, Spark, TrendArrow, GoalGradient

### Phases 3-6: Persona Dashboards (DS-001 exact)
- Admin: 2-row 12-column grid, hero + distribution + lifecycle + benchmarks + components + exceptions
- Manager: zone hero + acceleration cards + team bars with sparklines + streak badges
- Rep: hero with Ring gauge + GoalGradient + ComponentStack + RelativeLeaderboard + trajectory small multiples

### Phase 7-9: All Other Surfaces
- Operate workspace aligned to dark theme
- Observatory: DS-001 treatment + metrics expansion (sparklines, gauges, trend arrows per tab)
- Global sweep: every page.tsx verified dark, zero white backgrounds

### Phase 10: Cycle/Queue/Pulse Reintegrated
Living system expressed through dashboard surfaces, not sidebar widgets.
Cycle = lifecycle stepper. Queue = exceptions panel. Pulse = hero metrics.

### Design Rules Enforced
- DS-003 Cognitive Fit: no page duplicates a visual form for different data
- TMR Addendum 7: persona-specific color psychology
- TMR Addendum 8: visualization type matches decision task
- Every metric has a reference frame (benchmark, trend, or delta)

## Proof Gates: See OB-51_COMPLETION_REPORT.md"
```

---

*OB-51 — February 17, 2026*
*"When every component inherits the wrong defaults, fixing components is fixing symptoms. Fix the defaults."*
*"A dashboard where every metric is a card is a filing cabinet. A dashboard with cognitive fit is a cockpit."*
