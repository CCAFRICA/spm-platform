# HF-034: Demo Landing Page — Match DS-001 Design Spec

## Summary
Fixed the demo dashboard to match the DS-001 design specification. Addressed
dark theme contrast for Mission Control sidebar components, human-readable
period labels, attainment extraction normalization, and Pulse metric trend
colors.

## Phases Completed

### Phase 0: Diagnostic Audit
- Verified page.tsx already routes persona dashboards (OB-46B)
- Verified auth-shell.tsx already uses ChromeSidebar (OB-46C)
- Identified 4 issues: light-theme Mission Control colors, raw period keys,
  attainment decimal mismatch, Pulse trend colors

### Phase 1: Wire Persona Dashboards — Already Done
- page.tsx confirmed to import AdminDashboard/ManagerDashboard/RepDashboard
- PersonaProvider at auth-shell level, PeriodProvider wrapping dashboard
- No code changes needed

### Phase 2: Ensure ChromeSidebar Renders — Already Done
- auth-shell.tsx confirmed to import ChromeSidebar (not old Sidebar/MissionControlRail)
- No code changes needed

### Phase 3: Dark Theme Contrast for Mission Control
- CycleIndicator: slate → zinc (skeleton, phase dots, connectors, progress bar,
  period timeline, lifecycle state pills)
- QueuePanel: slate → zinc (header, items, hover states, unread indicator)
- PulseMetrics: slate → zinc (skeleton, metric values, labels, empty state)
- UserIdentity: slate → zinc (avatar, name, role text, hover states)
- DistributionChart: bucket labels brightened (zinc-500 → zinc-400)

### Phase 4: Human-Readable Period Labels
- Added `activePeriodLabel` to PeriodContext (formatted from start_date as "Ene 2026")
- AdminDashboard hero card: `activePeriodKey` → `activePeriodLabel`
- RepDashboard hero card: `activePeriodKey` → `activePeriodLabel`
- RepDashboard history: period_id UUIDs → human labels via periods table lookup
- Added `formatPeriodLabelFromDate()` helper in persona-queries.ts

### Phase 5: Fix Attainment Extraction
- Seed data stores attainment as decimals (1.05 = 105%) not percentages
- Added `normalizeAttainment()`: values ≤ 3 multiplied by 100
- Added `store` key to extraction (Optica Luminar format)
- Fallback: average all numeric top-level values in attainment_summary
- Distribution chart now correctly buckets entities across attainment ranges

### Phase 6: Pulse Metric Trend Colors
- Trend colors updated for dark sidebar contrast:
  - up: text-green-600 → text-emerald-400
  - down: text-red-600 → text-rose-400
  - flat: text-gray-500 → text-zinc-500
- Pulse service wiring confirmed correct (OB-43A Supabase cutover)

### Phase 7: Verification
- `npx tsc --noEmit` — exits 0 (clean)
- `npm run build` — exits 0 (production build passes)
- No new lint errors introduced

## Proof Gates

| Gate | Evidence | Status |
|------|----------|--------|
| PG-1 | page.tsx routes AdminDashboard/ManagerDashboard/RepDashboard by persona | PASS |
| PG-2 | auth-shell.tsx imports ChromeSidebar | PASS |
| PG-3 | No slate-* classes in any mission-control component | PASS |
| PG-4 | CycleIndicator skeleton uses bg-zinc-700 | PASS |
| PG-5 | QueuePanel items use hover:bg-zinc-800/50 | PASS |
| PG-6 | PulseMetrics values use text-zinc-200 | PASS |
| PG-7 | UserIdentity avatar uses bg-zinc-700 | PASS |
| PG-8 | DistributionChart bucket labels use text-zinc-400 | PASS |
| PG-9 | AdminDashboard hero shows activePeriodLabel not activePeriodKey | PASS |
| PG-10 | RepDashboard hero shows activePeriodLabel not activePeriodKey | PASS |
| PG-11 | RepDashboard history resolves period UUIDs to labels | PASS |
| PG-12 | extractAttainment handles decimal ratios (1.05 → 105) | PASS |
| PG-13 | extractAttainment handles 'store' key (Optica Luminar) | PASS |
| PG-14 | Pulse trend colors are emerald-400/rose-400/zinc-500 | PASS |
| PG-15 | npx tsc --noEmit exits 0 | PASS |
| PG-16 | npm run build exits 0 | PASS |

## Files Modified
- `web/src/components/navigation/mission-control/CycleIndicator.tsx`
- `web/src/components/navigation/mission-control/QueuePanel.tsx`
- `web/src/components/navigation/mission-control/PulseMetrics.tsx`
- `web/src/components/navigation/mission-control/UserIdentity.tsx`
- `web/src/components/design-system/DistributionChart.tsx`
- `web/src/contexts/period-context.tsx`
- `web/src/components/dashboards/AdminDashboard.tsx`
- `web/src/components/dashboards/RepDashboard.tsx`
- `web/src/lib/data/persona-queries.ts`
- `web/src/lib/navigation/pulse-service.ts`
