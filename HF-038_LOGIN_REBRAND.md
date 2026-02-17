# HF-038: VISUAL IDENTITY + DESIGN FIDELITY — THE DEFINITIVE FIX

NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.

## CC ANTI-PATTERNS (DO NOT DO THESE)

- **Grep-Based Verification:** DO NOT verify visual fixes by grepping source files. HF-035 added correct class names and reported 19/19 PASS while the browser showed white backgrounds and illegible text. A class in source means nothing if a parent wrapper, CSS specificity, or Tailwind purging prevents rendering.
- **Schema Disconnect:** Writes to one component but the page renders a different component.
- **Placeholder Syndrome:** Substitutes stubs for real implementation.
- **Report Inflation:** DO NOT report PASS for visual gates unless you have traced the FULL rendering chain from `<html>` to the visible element and confirmed no parent overrides.

---

## CONTEXT — THREE BUILDS HAVE TRIED AND FAILED

This design gap has persisted through HF-034, HF-035, and HF-036. Each reported PASS. Each failed to match the DS-001 design spec in the browser. The root causes identified:
1. Parent wrappers override component-level dark classes (auth-shell or ChromeSidebar layout applies white/light background)
2. Dashboard content structure doesn't match DS-001 grid (wrong components, wrong layout)
3. CC verifies by grepping source files, not by tracing the rendered DOM

**This HF succeeds by combining two strategies:**
- Phase 0 forces CC to read the ACTUAL DS-001 file and compare to ACTUAL rendered components
- Each phase requires CC to trace the rendering chain before modifying

---

## BRAND IDENTITY (CANONICAL)

| Element | Value |
|---------|-------|
| Brand name | **Vialuce** (one word, title case, NOT "ViaLuce") |
| Category | **Performance Intelligence Platform** (NOT "Performance Management") |
| Tagline | **See what you've earned.** |
| Domain | **vialuce.ai** |

---

## WHAT THE DS-001 MOCK SHOWS (THE TARGET)

Read `DS-001_vialuce-ui-design-spec-v3.jsx` in the project files. This is the EXACT specification. Key elements:

### Page Wrapper
```jsx
<div className="min-h-screen bg-gradient-to-b ${persona.bg} text-white"
     style={{fontFamily:"'DM Sans',system-ui,sans-serif"}}>
```
Persona backgrounds:
- Admin: `from-slate-950 via-indigo-950/40 to-slate-950`
- Manager: `from-slate-950 via-amber-950/25 to-slate-950`
- Rep: `from-slate-950 via-emerald-950/25 to-slate-950`

### Top Bar
```
bg-black/30 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-50
```
Contents: Brand icon (gradient "V" square) | "Vialuce" | separator | Tenant name | separator | persona intent (italic) | ... | avatar + name + role

### Admin View — Row 1 (12-column grid):
- **col-span-5: Hero Card** — `bg-gradient-to-br from-indigo-600/80 to-violet-700/80 rounded-2xl border border-indigo-500/20`
  - "TOTAL COMPENSACIÓN · FEBRERO 2026" (uppercase tracking-widest, indigo-200/60)
  - MX$20,662 (4xl bold white, animated)
  - Grid: 12 entidades | 87% presupuesto | 3 excepciones

- **col-span-4: Distribution** — `bg-zinc-900/80 border border-zinc-800/60 rounded-2xl`
  - 5-bucket histogram with specific colors: rose, amber, blue, emerald, purple
  - Promedio/Mediana/Desv.Est stats below

- **col-span-3: Lifecycle** — Same card treatment
  - Cycle dots (7 circles, first 5 with checkmarks)
  - "Aprobado" + "Publicar Resultados →" button

### Admin View — Row 2 (12-column grid):
- **col-span-7: Locations vs Budget** — BenchBar components with:
  - Location name + payout + budget as sublabel
  - Gradient fill bar with white benchmark line at 100%
  - Delta percentage (emerald for positive, rose for negative)
  - Colors: emerald ≥100%, amber ≥85%, rose <85%

- **col-span-5: Component Stack + Exceptions**
  - Stacked horizontal bar (5px height, rounded-full)
  - Legend with colored dots + name + value
  - Divider, then "EXCEPCIONES ACTIVAS" with priority-coded items

### Manager View:
- **col-span-4: Zone Hero** — amber gradient, team total, vendedor count, meta/coaching split
- **col-span-8: Acceleration Opportunities** — prescriptive cards (emerald/amber/rose borders) with action buttons
- **Full-width: Team Performance** — horizontal bars with zone average benchmark, sparklines, streak indicators

### Rep View:
- **col-span-7: Hero** — emerald gradient, personal payout, attainment, position
- **col-span-5: Goal Progress + What-If** — multi-segment progress bar, simulator slider
- **Row 2: Components + Leaderboard + History + Actions**

---

## WHAT CLT50-1 SHOWS (WHAT ACTUALLY RENDERS — Feb 17 2026)

### Login (`/login`)
- ❌ "ViaLuce" with dollar-sign icon in blue circle
- ❌ "Performance Management"
- ❌ No tagline
- ❌ "Secured by Supabase Auth"
- ❌ Generic dark card, vertically too low

### Admin Perform (after tenant selection)
- ❌ Page title says "Gobernar / Governance & System Health" — BUT the layout is a payroll table, not the DS-001 admin grid
- ❌ NO hero card with gradient (indigo-to-violet)
- ❌ NO distribution histogram
- ❌ NO lifecycle/cycle card
- ❌ NO locations vs budget benchmark bars
- ❌ NO active exceptions panel
- ❌ INSTEAD: flat payroll table (Resumen de Nomina) with names, payouts, component count = 0
- ❌ A budget position bar exists but NOT the DS-001 benchmark bars

**The entire Admin dashboard content is wrong.** It's not a styling issue — the WRONG COMPONENTS are rendering. DS-001 specifies a 12-column grid with hero + distribution + lifecycle (row 1) and benchmark bars + component stack + exceptions (row 2). What renders is a flat payroll table.

### Vendedor Perform
- ✅ Hero card exists with green gradient, MX$3,348 — close to spec
- ✅ Component breakdown with amounts — functional
- ✅ Leaderboard with position — functional
- ❌ What-If simulator showing nonsensical projection (MX$75 at 125% attainment)
- ❌ Missing trajectory history (DS-001 shows 5-month small multiples)
- ❌ Missing action buttons (Simulador, Mi Plan)

### Gerente Perform
- ✅ Team total, member count, attainment — functional
- ✅ Horizontal bars with color coding — close to spec
- ✅ Acceleration opportunities with coaching items — thermostat principle working
- ❌ Payout amounts show "$" not "MX$"
- ❌ Missing sparklines per team member
- ❌ Missing zone average benchmark line on bars
- ❌ Missing certification badges and streak indicators

### Global Issues
- ❌ Sidebar brand: "ViaLuce" with dollar-sign icon
- ❌ Observatory: "ViaLuce" camelcase
- ❌ Admin components column: "0" for all entities

---

## PHASE 0: DIAGNOSTIC (NO CODE CHANGES)

```bash
echo "============================================"
echo "HF-038 PHASE 0 DIAGNOSTIC"
echo "============================================"

echo ""
echo "=== 0A: WHAT COMPONENT RENDERS FOR ADMIN DASHBOARD? ==="
echo "--- Main page.tsx ---"
cat web/src/app/page.tsx 2>/dev/null | head -60
echo ""
echo "--- What decides which dashboard to show? ---"
grep -rn "AdminDashboard\|ManagerDashboard\|RepDashboard\|PersonaDashboard\|effectivePersona\|persona.*switch\|persona.*admin" \
  web/src/app/page.tsx web/src/components/layout/auth-shell.tsx 2>/dev/null | head -20
echo ""
echo "--- Admin dashboard component ---"
find web/src -name "*Admin*Dashboard*" -name "*.tsx" | head -5
echo "--- Its content (first 80 lines) ---"
cat $(find web/src -name "*Admin*Dashboard*" -name "*.tsx" | head -1) 2>/dev/null | head -80

echo ""
echo "=== 0B: DOES DS-001 ADMIN VIEW EXIST AS A COMPONENT? ==="
echo "--- Search for DS-001 components ---"
find web/src -name "*DS001*" -o -name "*ds001*" -o -name "*design-spec*" | grep ".tsx" | head -5
echo ""
echo "--- Search for AdminView from DS-001 ---"
grep -rn "AdminView\|admin.*View\|BenchBar\|DistributionChart\|ComponentStack" \
  web/src/components/ --include="*.tsx" | grep -v node_modules | head -20

echo ""
echo "=== 0C: LOGIN PAGE ==="
cat web/src/app/login/page.tsx 2>/dev/null | head -80

echo ""
echo "=== 0D: SIDEBAR BRAND ==="
head -40 web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null
echo ""
grep -n "ViaLuce\|DollarSign\|CircleDollarSign\|dollar" web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null

echo ""
echo "=== 0E: ALL BRAND REFERENCES ==="
grep -rn '"ViaLuce"\|>ViaLuce<\|Performance Management' web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -30

echo ""
echo "=== 0F: PAGE BACKGROUND CHAIN ==="
echo "--- Root layout ---"
grep -n "bg-\|background\|gradient\|className" web/src/app/layout.tsx | head -10
echo "--- Auth shell ---"
grep -n "bg-\|background\|gradient\|className\|main\|content" web/src/components/layout/auth-shell.tsx 2>/dev/null | head -15
echo "--- ChromeSidebar content wrapper ---"
grep -n "bg-\|background\|gradient\|main\|content\|children" web/src/components/navigation/ChromeSidebar.tsx | head -15

echo ""
echo "=== 0G: DM SANS FONT ==="
grep -rn "DM.Sans\|DM_Sans\|dm-sans\|font.*family" web/src/app/globals.css web/src/app/layout.tsx 2>/dev/null | head -10

echo ""
echo "=== 0H: PERSONA-SPECIFIC GRADIENT ==="
grep -rn "indigo-950\|amber-950\|emerald-950\|persona.*bg\|persona.*gradient" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -10

echo ""
echo "=== 0I: CURRENCY FORMATTING ==="
grep -rn "formatCurrency\|useCurrency\|MX\\\$\|currency.*format" web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | head -15

echo ""
echo "=== 0J: WHAT RENDERS AT / AFTER TENANT SELECTION ==="
echo "--- Route structure ---"
ls -la web/src/app/page.tsx web/src/app/layout.tsx
echo "--- Does a layout.tsx apply to all routes? ---"
find web/src/app -name "layout.tsx" | head -10

echo ""
echo "============================================"
echo "PASTE ALL OUTPUT BEFORE PROCEEDING"
echo "============================================"
```

**Commit:** None — read-only.

---

## PHASE 1: LOGIN SCREEN — COMPLETE REWRITE

### 1A: Read current login, then REPLACE entirely

The login page must render on `#0A0E1A` full-screen background with centered content:

1. **"Vialuce"** — 36px, weight 700, `#F1F5F9`, letter-spacing -0.02em. NO ICON.
2. **"Performance Intelligence Platform"** — 14px, weight 400, `#94A3B8`
3. **"See what you've earned."** — 14px, italic, `#A5B4FC`
4. **48px spacer**
5. **Login card** — `rgba(15,23,42,0.8)` bg, `1px solid rgba(30,41,59,0.8)` border, `border-radius: 16px`, 32px padding
   - "Sign In" heading: 20px bold `#F1F5F9`
   - Email + Password: dark inputs (`bg-slate-900/60 border-slate-700/50 text-slate-100`)
   - Button: `bg-indigo-600 hover:bg-indigo-500`, white, full-width, `border-radius: 10px`
   - NO "Secured by Supabase Auth"
6. **"vialuce.ai"** — 12px, `#475569`, centered, 32px below card

Preserve ALL auth logic (Supabase auth call, redirect, error handling). Only visual changes.

Remove DollarSign/CircleDollarSign icon import and JSX.

**Commit:** `HF-038 Phase 1: Login rewrite — Vialuce Performance Intelligence Platform`

---

## PHASE 2: ADMIN DASHBOARD — REPLACE WITH DS-001 LAYOUT

**This is the critical phase.** The Admin dashboard currently renders a payroll table. DS-001 specifies a completely different layout.

### 2A: Read DS-001 carefully

```bash
cat DS-001_vialuce-ui-design-spec-v3.jsx | head -300
```

The AdminView function (lines 211-302) defines the EXACT layout.

### 2B: Create shared design-system components

If these don't already exist as standalone components, create them from DS-001:

**`web/src/components/design-system/AnimNum.tsx`** — Animated number counter (DS-001 lines 74-80)
**`web/src/components/design-system/BenchBar.tsx`** — Horizontal bar with benchmark reference line (lines 100-123)
**`web/src/components/design-system/DistributionChart.tsx`** — 5-bucket histogram (lines 125-145)
**`web/src/components/design-system/ComponentStack.tsx`** — Stacked horizontal bar with legend (lines 173-199)

These components must be EXACT copies of the DS-001 implementations. Do not "adapt" or "improve" — copy the JSX and class names precisely.

### 2C: Rewrite AdminDashboard.tsx

Replace the current AdminDashboard content with the DS-001 AdminView layout structure:

**Row 1: `grid grid-cols-12 gap-4`**
- `col-span-5`: Hero card (indigo-to-violet gradient) with total payout, entity count, budget %, exceptions
- `col-span-4`: Distribution histogram using real attainment data from `calculation_results`
- `col-span-3`: Lifecycle card showing current period state + action button

**Row 2: `grid grid-cols-12 gap-4`**
- `col-span-7`: Locations vs Budget — BenchBar for each entity showing payout vs budget with delta %
- `col-span-5`: ComponentStack (stacked bar + legend) + Active Exceptions list

### 2D: Wire to real Supabase data

The components currently have demo data in DS-001. Wire them to the real queries:
- Total payout: `calculation_batches.total_payout` or sum of `calculation_results.total_payout`
- Entity count: count of `entities` for this tenant
- Attainment data: from `entity_period_outcomes` or `calculation_results.components`
- Component breakdown: aggregate `calculation_results.components` across all entities
- Period/lifecycle: from `periods.status` or `calculation_batches.lifecycle_state`

If a data point isn't available, show a meaningful placeholder (e.g., "—" for budget % if no budget data exists), NOT a broken component.

### 2E: Page background

The main content area wrapper (wherever `children` are rendered inside the sidebar layout) MUST have:
```
className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950/40 to-slate-950"
```

If a parent wrapper (auth-shell, ChromeSidebar layout) sets a white/light background, REMOVE IT or override it. **Trace the rendering chain:** html → body → layout.tsx → auth-shell → ChromeSidebar → main content div → dashboard component. Find where white comes from and eliminate it.

### 2F: Card treatment

ALL cards in the dashboard:
```
Standard: bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-5
Hero:     bg-gradient-to-br from-indigo-600/80 to-violet-700/80 border border-indigo-500/20 rounded-2xl p-5
```

### 2G: Text hierarchy

```
Section labels: text-zinc-500 text-[10px] font-medium uppercase tracking-widest
Metric values:  text-white font-bold (text-4xl for hero, text-lg for secondary)
Sublabels:      text-zinc-500 text-[10px]  
Body/names:     text-zinc-200 text-sm
Muted:          text-zinc-400 text-xs
```

### 2H: Font

Ensure DM Sans is loaded and applied:
```css
font-family: 'DM Sans', system-ui, sans-serif
```

**Commit:** `HF-038 Phase 2: Admin dashboard — DS-001 layout with real data`

---

## PHASE 3: GERENTE DASHBOARD FIXES

The Gerente view is closest to DS-001 but missing:

### 3A: Currency prefix
Find where payout amounts render in the team bar chart. Replace hardcoded `$` with the tenant's currency format (MX$). Use the same `formatCurrency` function as AdminDashboard.

### 3B: Zone average benchmark line
DS-001 shows a white dashed reference line at the zone average on each team member's bar. Add this to the BenchBar component or the bar chart.

### 3C: Sparklines (if feasible)
DS-001 shows a tiny sparkline (6 data points) next to each team member. If historical data exists in `entity_period_outcomes`, wire it. If not, defer — don't show fake data.

**Commit:** `HF-038 Phase 3: Gerente fixes — currency, benchmarks`

---

## PHASE 4: VENDEDOR DASHBOARD FIXES

### 4A: Trajectory history
DS-001 shows 5-month small multiples at the bottom. If historical period data exists, wire it. If not, show the component with "—" values (not absent entirely).

### 4B: Action buttons
DS-001 shows "Simulador" and "Mi Plan" as two action cards at the bottom. Add these as styled stubs that are visually present even if not yet functional.

### 4C: What-If simulator
The current projection shows MX$75 at 125% attainment which is nonsensical. Diagnose: is the slider defaulting to a very low value? Is the projection formula wrong? Fix the logic so the projection makes sense relative to the current payout.

**Commit:** `HF-038 Phase 4: Vendedor fixes — trajectory, actions, what-if`

---

## PHASE 5: SIDEBAR + GLOBAL BRAND

### 5A: Sidebar brand
Replace dollar-sign icon + "ViaLuce" with text-only "Vialuce" (18px, weight 700, `#F1F5F9`). Remove DollarSign import.

### 5B: Global string replacement
- "ViaLuce" → "Vialuce" in ALL user-visible strings
- "Performance Management" → "Performance Intelligence Platform"
- "SPM Platform" → remove or replace
- "ClearComp" → "Vialuce" if any remain

### 5C: Page metadata
- title: "Vialuce"
- description: "Performance Intelligence Platform — See what you've earned."

### 5D: Auth shell
Update any "ViaLuce" or dollar icon in the loading screen.

### 5E: Observatory
Update "Platform Observatory ViaLuce" → "Vialuce Observatory" or "Platform Observatory — Vialuce"

### 5F: Admin components column
The payroll table (if it still exists in a sub-page, not the main dashboard) shows "0" components. Fix: `Object.keys(result.components || {}).length`

**Commit:** `HF-038 Phase 5: Brand sweep + component count fix`

---

## PHASE 6: VERIFICATION

```bash
echo "=== RENDERING CHAIN VERIFICATION ==="
echo "--- Page background (trace from html to dashboard) ---"
grep -n "bg-\|background\|gradient" web/src/app/layout.tsx web/src/components/layout/auth-shell.tsx web/src/components/navigation/ChromeSidebar.tsx 2>/dev/null | head -20

echo ""
echo "--- Admin dashboard: does it use DS-001 grid? ---"
grep -n "grid-cols-12\|col-span-5\|col-span-4\|col-span-3\|col-span-7\|BenchBar\|DistributionChart\|ComponentStack" \
  $(find web/src -name "*Admin*Dashboard*" -name "*.tsx" | head -1) 2>/dev/null | head -15

echo ""
echo "--- Font loaded? ---"
grep -rn "DM.Sans\|DM_Sans" web/src/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v node_modules | head -5

echo ""
echo "=== BRAND VERIFICATION ==="
echo "--- ViaLuce camelcase remaining ---"
grep -rn '"ViaLuce"\|>ViaLuce<' web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | grep -v "//" | wc -l

echo "--- Performance Management remaining ---"
grep -rn '"Performance Management"' web/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next" | wc -l

echo "--- DollarSign imports remaining ---"
grep -rn "DollarSign\|CircleDollarSign" web/src/ --include="*.tsx" | grep -v node_modules | grep -v ".next" | wc -l

echo ""
echo "=== BUILD ==="
cd web
npx tsc --noEmit 2>&1 | tail -3
npm run build 2>&1 | tail -5
```

### Proof Gates

| # | Gate | What to Check |
|---|------|---------------|
| PG-1 | Login: "Vialuce" text (not ViaLuce), no dollar icon | |
| PG-2 | Login: "Performance Intelligence Platform" | |
| PG-3 | Login: "See what you've earned." italic indigo-200 | |
| PG-4 | Login: no "Secured by Supabase Auth" | |
| PG-5 | Admin dashboard: 12-column grid row 1 (hero + distribution + lifecycle) | |
| PG-6 | Admin dashboard: 12-column grid row 2 (benchmark bars + components + exceptions) | |
| PG-7 | Admin hero card: indigo-to-violet gradient, MX$ amount, entity count | |
| PG-8 | Distribution histogram: 5 colored buckets (rose/amber/blue/emerald/purple) | |
| PG-9 | Benchmark bars: gradient fill with white reference line at 100% | |
| PG-10 | Page background: dark gradient (slate-950), NOT white | |
| PG-11 | Cards: bg-zinc-900/80 with border-zinc-800/60 (semi-transparent dark) | |
| PG-12 | Text: section labels uppercase zinc-500, values white bold | |
| PG-13 | Font: DM Sans loaded and applied | |
| PG-14 | Gerente: payout amounts show "MX$" prefix | |
| PG-15 | Gerente: zone average reference line on bars | |
| PG-16 | Vendedor: action buttons present (Simulador, Mi Plan) | |
| PG-17 | Sidebar: "Vialuce" text only, no dollar icon | |
| PG-18 | Zero "ViaLuce" camelcase in user-visible strings | |
| PG-19 | Zero "Performance Management" in user-visible strings | |
| PG-20 | Page title: "Vialuce" | |
| PG-21 | TypeScript: zero errors | |
| PG-22 | Production build: clean | |

---

## CLOSING SEQUENCE

```bash
cd web
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 15
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Write `HF-038_COMPLETION_REPORT.md` at PROJECT ROOT.

```bash
gh pr create --base main --head dev \
  --title "HF-038: Visual identity + DS-001 design fidelity — Vialuce Performance Intelligence Platform" \
  --body "## Changes
- Login screen rewritten: Vialuce brand, category, tagline
- Admin dashboard rebuilt to DS-001 spec: 12-col grid, hero+distribution+lifecycle, benchmarks+components+exceptions
- Design system components created from DS-001: AnimNum, BenchBar, DistributionChart, ComponentStack
- Page background: dark persona-specific gradient enforced
- Card treatment: DS-001 glass effect (zinc-900/80, border-zinc-800/60)
- Text hierarchy: DS-001 contrast (zinc-500 labels, white values)
- DM Sans font loaded and applied
- Gerente: MX$ currency fix, zone average benchmark
- Vendedor: action buttons, trajectory section
- Global brand sweep: ViaLuce -> Vialuce everywhere
- Dollar icon removed from login + sidebar
- Page metadata updated

## Design Reference
- DS-001_vialuce-ui-design-spec-v3.jsx (canonical spec)
- DS-003: Visualization Vocabulary
- CLT50-1 screenshots (evidence of gaps)

## Why Previous HFs Failed
HF-034/035/036 added correct CSS classes but didn't verify rendered output.
This HF replaces the entire Admin dashboard structure (not just styles) and traces the rendering chain to eliminate parent wrapper overrides.

## Proof Gates: See HF-038_COMPLETION_REPORT.md"
```
