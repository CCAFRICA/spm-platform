# HF-035: Visual Fidelity — Match DS-001 Design Spec

## Status: COMPLETE

## Summary
Full visual fidelity pass to match DS-001 design specification exactly. Every dashboard, chart component, navigation element, and typographic decision now follows the design language document.

## Phases Completed

### Phase 0: Diagnostic Audit
- Identified white page background (no dark class on html)
- Navbar using light theme (bg-white/95)
- Cards using rounded-xl instead of rounded-2xl
- Chart colors not matching DS-001 palette
- Font was Geist, not DM Sans
- Manager/Rep dashboards blank on persona override

### Phase 1: Page Background — Persona Gradient
- Added `className="dark"` to `<html>` in layout.tsx
- Activates dark CSS variables (--background: 0 0% 3.9%)
- PersonaLayout already had correct gradient backgrounds

### Phase 2: Card Treatment — Glass Effect
- All dashboard cards: `bg-zinc-900/80 border border-zinc-800/60 rounded-2xl`
- Hero cards: `bg-gradient-to-br` with persona-specific gradients
  - Admin: `from-indigo-600/80 to-violet-700/80`
  - Manager: `from-amber-600/80 to-yellow-700/80`
  - Rep: `from-emerald-600/80 to-lime-700/80`

### Phase 3: Text Contrast Hierarchy
- Section labels: `text-[10px] font-medium text-zinc-500 uppercase tracking-widest`
- Page header: `text-2xl font-bold text-white`
- Intent description: `text-xs text-zinc-500`
- Navbar: dark theme with `bg-black/30 backdrop-blur-xl`

### Phase 4: Chart Rendering Fidelity
- DistributionChart colors: `#f87171, #fbbf24, #60a5fa, #34d399, #a78bfa`
- COMPONENT_PALETTE: `#818cf8, #6ee7b7, #fbbf24, #60a5fa, #f472b6, #a78bfa`
- DistributionChart: `rounded-t-md`, 4px min height, `text-[9px]` count labels
- ComponentStack: `h-5 rounded-full bg-zinc-800`
- BenchmarkBar: gradient fill, `bg-zinc-800` track, `w-px bg-white/40` benchmark line

### Phase 5: DM Sans Font
- Replaced Geist with DM Sans via `next/font/google`
- DM Mono for monospace contexts
- Body: `font-family: var(--font-dm-sans), system-ui, sans-serif`

### Phase 6: Manager Dashboard Data Wiring
- `getManagerDashboardData()` accepts `canSeeAll` flag
- When admin overrides to manager persona, fetches ALL entities
- ManagerDashboard passes `scope.canSeeAll` to query

### Phase 7: Rep Dashboard Data Wiring
- `getRepDashboardData()` accepts `null` entityId
- Falls back to top-performing entity when admin overrides to rep
- RepDashboard no longer short-circuits on null entityId

### Phase 8: Verification
- 19/19 proof gates PASS
- Build clean (zero TS errors)

## Files Modified
- `web/src/app/layout.tsx` — dark class + DM Sans font
- `web/src/app/globals.css` — DM Sans font-family on body
- `web/src/app/page.tsx` — text hierarchy
- `web/src/components/navigation/Navbar.tsx` — dark theme
- `web/src/components/layout/auth-shell.tsx` — dark loading states
- `web/src/components/dashboards/AdminDashboard.tsx` — DS-001 card treatment
- `web/src/components/dashboards/ManagerDashboard.tsx` — DS-001 + data wiring
- `web/src/components/dashboards/RepDashboard.tsx` — DS-001 + data wiring
- `web/src/components/design-system/DistributionChart.tsx` — DS-001 colors
- `web/src/components/design-system/ComponentStack.tsx` — DS-001 bar spec
- `web/src/components/design-system/BenchmarkBar.tsx` — gradient + benchmark line
- `web/src/lib/design/tokens.ts` — COMPONENT_PALETTE DS-001 colors
- `web/src/lib/data/persona-queries.ts` — Manager/Rep override fallbacks

## Proof Gates (19/19 PASS)
1. html dark class
2. PersonaLayout gradient
3. Admin hero gradient
4. Manager hero gradient
5. Rep hero gradient
6. All cards rounded-2xl
7. All cards bg-zinc-900/80
8. Section labels text-[10px]
9. Page header text-2xl
10. Navbar bg-black/30
11. DistributionChart DS-001 colors
12. COMPONENT_PALETTE DS-001 colors
13. BenchmarkBar bg-zinc-800 + w-px
14. ComponentStack h-5 rounded-full
15. DM Sans imported
16. Body font-family DM Sans
17. Manager canSeeAll param
18. Rep null entityId handling
19. Manager passes canSeeAll
