# HF-034: DEMO LANDING PAGE — MATCH DS-001 DESIGN SPEC

## Autonomy Directive
NEVER ask yes/no. NEVER say "shall I". Just act. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.

## Standing Rules
1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server, `rm -rf .next`, `npm run build`, `npm run dev`, confirm localhost:3000 responds.
3. Completion reports and proof gates at PROJECT ROOT (same level as package.json).
4. Never provide CC with answer values — fix logic not data.
5. Final step: `gh pr create --base main --head dev` with descriptive title and body.
6. Completion report file is created BEFORE final build verification, then appended with build results.

## CC Anti-Patterns (DO NOT DO THESE)
- **Placeholder Syndrome:** Substitutes stubs for real logic
- **Schema Disconnect:** Writes to one field, reads from another
- **Silent Fallbacks:** Returns zero/null instead of throwing errors — if data is missing, show a visible error or empty state, do NOT silently swallow
- **Report Burial:** Saves reports in subdirectories instead of project root
- **Autonomy Leakage:** Stops to ask despite explicit autonomy directive

---

## THE PROBLEM

The demo landing page (what users see after login → tenant selection → dashboard) does not match the DS-001 design specification. The page is the first thing prospects, investors, and partners see. It is currently unreadable and broken. This is a P0 production issue.

### What DS-001 Specifies (the target):
- Clean top bar: ViaLuce logo | tenant name | workspace intent | user avatar
- Three hero cards in a row: Total Compensation (purple gradient with amount + entity count + budget %), Distribution histogram (5-bucket with mean/median), Cycle state with action button ("Publicar Resultados →")
- Location vs Budget horizontal bars (color-coded by variance: green >0%, amber -1 to -5%, red < -5%)
- Component composition stacked bar with legend (Ventas Ópticas, Ventas Tienda, Cobranza, Clientes Nuevos, Garantías, Seguros)
- Active exceptions list (color-coded priority items)
- All text readable against dark background, proper contrast, dark theme works

### What Currently Renders (both tenants, confirmed post-merge of PRs #20-22):
1. **Sidebar is the OLD Operate-heavy nav** (Import, Calculate, Reconcile, Approve, Pay, Monitor sections) — NOT the ChromeSidebar from OB-46C
2. **"No hay periodos disponibles"** banner at top but then shows period data below — contradictory
3. **Period IDs showing raw UUIDs** (b2000000-0010-0000-0000...) instead of human-readable names
4. **Distribution chart nearly invisible** — purple on dark purple, unreadable axis labels, no contrast
5. **Component composition chart** — text illegible, colors bleed into background
6. **Exceptions list shows "Attainment critically below benchmark at 0%"** for ALL entities — suggests attainment metrics not resolving from Supabase data
7. **Employee table** — component count shows "0" for all entities
8. **Persona switcher** — showing OLD bar style (Vista, Admin, Gerente, Vendedor, Auto), not the 46C floating persona chips
9. **The Cycle shows raw period IDs** not friendly names
10. **Pulse metrics** — "Total Users" and "Outstanding Issues" show "—"

---

## ROOT CAUSE ANALYSIS

The dashboard page (`web/src/app/page.tsx` or the landing dashboard route) is likely NOT using the OB-46A/B/C components. It's probably still the pre-46 dashboard that reads from old data paths. The 46 series built:

- **46A:** Design system components (AnimatedNumber, ProgressRing, BenchmarkBar, DistributionChart, ComponentStack, etc.) + persona-queries.ts + lifecycle-service.ts
- **46B:** Three persona dashboards (AdminDashboard, ManagerDashboard, RepDashboard) + Operate cockpit + Period Ribbon + 10 new viz components
- **46C:** ChromeSidebar, fixed DemoPersonaSwitcher, route stubs

The gap: the 46B persona dashboards exist as components but the MAIN DASHBOARD PAGE may not be rendering them. The page.tsx may still be importing old dashboard components.

---

## PHASE 0: DIAGNOSTIC — Read Before You Write

Before changing ANY code, audit these files and report your findings:

```
# What is the main dashboard page currently rendering?
web/src/app/page.tsx

# What does the auth-shell layout include?
web/src/components/layout/auth-shell.tsx

# Do the 46B persona dashboards exist?
web/src/components/dashboard/AdminDashboard.tsx (or similar)
web/src/components/dashboard/ManagerDashboard.tsx
web/src/components/dashboard/RepDashboard.tsx

# What does the persona context provide?
web/src/contexts/persona-context.tsx

# What does persona-queries return for each role?
web/src/lib/data/persona-queries.ts

# What does the ChromeSidebar look like?
web/src/components/navigation/ChromeSidebar.tsx

# Is the Sidebar.tsx (old) still being imported anywhere?
grep -r "Sidebar" web/src/components/layout/ web/src/app/
```

Report findings as Phase 0 output. Do NOT change code in this phase.

---

## PHASE 1: WIRE PERSONA DASHBOARDS TO MAIN PAGE

The main dashboard page.tsx must render the CORRECT persona dashboard based on the current user's role:

```typescript
// Pseudocode — adapt to actual file structure
import { usePersona } from '@/contexts/persona-context';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import RepDashboard from '@/components/dashboard/RepDashboard';

// In the page component:
const { effectivePersona } = usePersona();

switch (effectivePersona) {
  case 'admin': return <AdminDashboard />;
  case 'manager': return <ManagerDashboard />;
  case 'rep': return <RepDashboard />;
  default: return <AdminDashboard />;  // VL Admin sees admin view within tenant
}
```

If the 46B persona dashboards DON'T exist as separate components but are embedded in the DS-001 spec visualization, you need to create them. The DS-001 JSX artifact at `web/src/components/design-system/` or as specified in OB-46B defines all three views.

**Proof gate:** Switching persona via DemoPersonaSwitcher changes the dashboard content.

---

## PHASE 2: FIX SIDEBAR — ENSURE CHROMESIDEBAR RENDERS

The auth-shell layout must use ChromeSidebar (from 46C), not the old Sidebar.tsx.

Check `web/src/components/layout/auth-shell.tsx` for which sidebar it imports. If it's still importing the old sidebar, replace it with ChromeSidebar.

If auth-shell already imports ChromeSidebar (per 46C completion report), check:
- Is ChromeSidebar actually being rendered in the JSX?
- Is it wrapped in the right context providers (PersonaProvider, NavigationProvider)?
- Are there CSS conflicts causing the old sidebar to show instead?

**Proof gate:** Sidebar shows workspace pills (Operate, Perform, etc.) + Mission Control zones + persona accent stripe — NOT the old Operate-heavy section list.

---

## PHASE 3: FIX DATA READABILITY — CHART CONTRAST AND LABELS

The charts rendered on the dashboard must be readable. Specifically:

1. **Distribution histogram:** Axis labels must be visible against dark background. Bar colors must contrast with card background. Use the DS-001 color scheme: bucket bars use persona accent gradient, axis text is slate-400 (#94A3B8), background is card-level dark (not page-level dark).

2. **Component composition stacked bar:** Legend text must be readable. Each component gets a distinct, high-contrast color from the COMPONENT_PALETTE in design tokens. Label text is slate-300 minimum.

3. **Budget position bar:** Percentage labels must be visible. Use white/light text on dark background. Green/amber/red variance indicators per DS-001.

If these are the 46A design system components (DistributionChart, ComponentStack, BenchmarkBar), check whether they're receiving correct data. If they're old pre-46 components, REPLACE them with the 46A design system equivalents.

**Proof gate:** All charts are legible at normal viewing distance. No text disappears into background.

---

## PHASE 4: FIX PERIOD DISPLAY — HUMAN-READABLE NAMES

The Cycle indicator and Periods list must show human-readable period names, not raw UUIDs.

The `periods` table in Supabase has a `label` field (e.g., "Enero 2026", "Febrero 2026"). The UI must read `period.label` (or `period.name` — check the schema), NOT `period.id`.

Check:
- The lifecycle-service.ts or CompensationClockService for how it formats period display
- Any component that renders period references
- The sidebar's Cycle section

**Proof gate:** Periods display as "Octubre 2025", "Noviembre 2025", etc. — not UUIDs.

---

## PHASE 5: FIX EXCEPTIONS DATA — ATTAINMENT RESOLUTION

The exceptions list shows "Attainment critically below benchmark at 0%" for ALL entities. This means the dashboard query is not resolving attainment from calculation_results or entity_period_outcomes.

Check:
- What query powers the exceptions list
- Whether it's reading `calculation_results.components` JSONB for attainment values
- Whether the entity names resolve (they show real names like "Ana Martinez" — good)
- Whether the 0% is because the metric key doesn't match what's stored in Supabase

The seeded data for Velocidad Deportiva has real attainment values (45%-135% range for the sports incentive plan). If the query returns 0, it's a field name mismatch, not missing data.

**Proof gate:** Exceptions show varied attainment percentages, not all 0%. At least some entities show above-benchmark attainment.

---

## PHASE 6: FIX PULSE METRICS — WIRE TO REAL DATA

The Pulse section in the sidebar shows:
- Active Tenants: 2 (but may show stale)
- Total Users: — (not wired)
- Calculations Today: 2 (may be stale)
- Outstanding Issues: — (not wired)

These should read from Supabase:
- Active Tenants: `SELECT count(*) FROM tenants WHERE status = 'active'` (or equivalent)
- Total Users: `SELECT count(*) FROM profiles WHERE tenant_id = current_tenant`
- Calculations Today: `SELECT count(*) FROM calculation_batches WHERE created_at > today AND tenant_id = current_tenant`
- Outstanding Issues: `SELECT count(*) FROM verification_items WHERE status = 'pending' AND tenant_id = current_tenant` (or disputes count, or queue items)

If these tables don't exist yet, show the count of what IS available (entities, periods, calculation_results) rather than "—".

**Proof gate:** Pulse metrics show real numbers, not dashes.

---

## PHASE 7: VERIFICATION BUILD

```bash
npx tsc --noEmit        # Must exit 0
npm run build            # Must exit 0
npm run dev              # Must start without errors
# Open localhost:3000, login, select each tenant, verify:
```

### Browser Proof Gates (screenshot each):

| Gate | Check | Pass? |
|------|-------|-------|
| PG-1 | ChromeSidebar renders (workspace pills + Mission Control), NOT old sidebar | |
| PG-2 | Admin persona: hero cards (Total Compensation + Distribution + Cycle) in a row | |
| PG-3 | Admin persona: chart text is legible (axis labels, legends readable) | |
| PG-4 | Admin persona: exceptions show varied attainment (not all 0%) | |
| PG-5 | Manager persona: team view renders when switching persona | |
| PG-6 | Rep persona: personal view renders when switching persona | |
| PG-7 | Periods show human-readable names (not UUIDs) | |
| PG-8 | Pulse metrics show real numbers (not "—") | |
| PG-9 | Óptica Luminar dashboard loads without console errors | |
| PG-10 | Velocidad Deportiva dashboard loads without console errors | |
| PG-11 | DemoPersonaSwitcher shows floating persona chips (not old bar) | |
| PG-12 | Persona switch is instant (no page reload, no auth round-trip) | |
| PG-13 | No "No hay periodos disponibles" contradiction (either no periods OR show period data, not both) | |
| PG-14 | Budget position bar text is readable | |
| PG-15 | Component composition legend text is readable | |
| PG-16 | npx tsc --noEmit exits 0 | |
| PG-17 | npm run build exits 0 | |

---

## WHAT SUCCESS LOOKS LIKE

After this HF, login → select Óptica Luminar → see the DS-001 Admin dashboard:
- Purple gradient hero card: "TOTAL COMPENSACIÓN — FEBRERO 2026 / MX$20,662 / 12 entidades / 87% presupuesto / 3 excepciones"
- Distribution histogram: 5 buckets with counts, mean/median/stdev
- Cycle card: "Aprobado" with green checkmarks and "Publicar Resultados →" button
- Locations vs Budget: Polanco +8%, Kukulcán +3%, Reforma +1%, San Pedro -2%, Providencia -7%, Angelópolis -11%
- Component composition: Ventas Ópticas MX$9,800 | Ventas Tienda MX$4,200 | Cobranza MX$3,100 | etc.
- Active exceptions: "3 disputas abiertas — plazo: 48h" | "Angelópolis bajo meta 3 meses" | "Simulación Q2 disponible"

Switch to Velocidad Deportiva → see the same quality dashboard with sports retail data:
- $357,553 total payout, 18 entities
- Component composition reflecting the VD plan components
- Exceptions showing actual performance issues (not all 0%)

Switch persona to Manager → different dashboard (team view).
Switch persona to Rep → different dashboard (personal view with goal gradient).

---

## FILES LIKELY TO CHANGE

```
web/src/app/page.tsx                               — Main dashboard, must render persona dashboards
web/src/components/layout/auth-shell.tsx            — Must use ChromeSidebar
web/src/components/dashboard/AdminDashboard.tsx     — May need data wiring fixes
web/src/components/dashboard/ManagerDashboard.tsx   — May need data wiring fixes
web/src/components/dashboard/RepDashboard.tsx       — May need data wiring fixes
web/src/lib/data/persona-queries.ts                — Supabase query fixes for attainment, periods
web/src/components/navigation/ChromeSidebar.tsx     — Period display, Pulse metrics
web/src/lib/lifecycle/lifecycle-service.ts          — Period label resolution
```

---

## COMMIT SEQUENCE

```
Phase 0: git commit -m "HF-034 Phase 0: diagnostic audit"
Phase 1: git commit -m "HF-034 Phase 1: wire persona dashboards to main page"
Phase 2: git commit -m "HF-034 Phase 2: ensure ChromeSidebar renders"
Phase 3: git commit -m "HF-034 Phase 3: fix chart contrast and readability"
Phase 4: git commit -m "HF-034 Phase 4: human-readable period names"
Phase 5: git commit -m "HF-034 Phase 5: fix exception attainment resolution"
Phase 6: git commit -m "HF-034 Phase 6: wire Pulse metrics to Supabase"
Phase 7: git commit -m "HF-034 Phase 7: verification build and completion report"
Final:   gh pr create --base main --head dev --title "HF-034: Demo landing page match DS-001 design spec" --body "Fixes dashboard rendering to match DS-001 design specification. Wires persona dashboards, ChromeSidebar, chart contrast, period labels, exception data, and Pulse metrics."
```
