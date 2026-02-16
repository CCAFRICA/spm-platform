# Velocidad Deportiva Seed — Completion Report

## Summary

Created the second demo tenant "Velocidad Deportiva" — a Mexican sporting goods retail chain with gamification medals, attendance gates, streak bonuses, and deferred quarterly payouts. Also fixed Optica Luminar tenant and built a Demo Persona Switcher component.

## Phase 0: Optica Luminar Fix + Demo Persona Switcher

| # | Gate | Status |
|---|------|--------|
| 1 | OL tenant exists with 22 entities | PASS |
| 2 | OL profiles restored (3 auth users) | PASS |
| 3 | Platform admin role = vl_admin | PASS |
| 4 | demo_users in OL tenant settings | PASS |
| 5 | DemoPersonaSwitcher component renders | PASS |
| 6 | Diagnostics page: no retail_conglomerate fallback | PASS |
| 7 | Build passes | PASS |

### Component: DemoPersonaSwitcher
- **File**: `web/src/components/demo/DemoPersonaSwitcher.tsx`
- Floating bar at bottom of screen for VL Admin
- Reads `demo_users` from tenant settings JSONB
- Sign out → signInWithPassword → full page reload
- Only visible when: authenticated + VL Admin + tenant selected + demo_users exist

## Phase 1: Velocidad Deportiva Seed

### Data Created

| Table | Count | Details |
|-------|-------|---------|
| tenants | 1 | Velocidad Deportiva (b2c3d4e5...) |
| auth users | 3 | admin@, gerente@, asociado@ |
| profiles | 3 | admin, manager, viewer roles |
| entities | 35 | 1 org + 3 regions + 8 stores + 3 teams + 20 individuals |
| entity_relationships | 67 | contains, member_of, manages |
| rule_sets | 2 | Plan de Ventas de Piso, Plan de Asistencia Online |
| rule_set_assignments | 36 | 18 floor associates x 2 plans |
| periods | 8 | 6 monthly (Jul-Dec 2024) + 2 quarterly (Q3, Q4) |
| import_batches | 6 | 1 per month |
| committed_data | 156 | 8 stores x 6 months + 18 associates x 6 months |
| calculation_results | 108 | 18 associates x 6 months |
| entity_period_outcomes | 36 | 18 associates x 2 quarters |

### Key Narratives

| Associate | Story |
|-----------|-------|
| VD-A01 Carlos Mendoza | 6-month Oro streak, highest earner, streak bonus 5000 |
| VD-A05 Diego Castillo | GATED - 88% attendance, zero payout all months |
| VD-A10 Lucia Gutierrez | GATED - 85% attendance, zero payout all months |
| VD-A12 Ana Martinez | Rising star, 4-month Oro streak, climbing trajectory |
| VD-A11 Roberto Flores | Borderline 90% attendance, inconsistent medals |

### Rule Set Design

**Plan de Ventas de Piso** (Floor Sales):
- Comision Base per unit (calzado 45, rodados 65, textil 30, accesorios 20)
- Bono por Logro: tiered by store attainment (0/1500/3500/6000)
- Streak bonus: 3mo->2000, 6mo->5000, 12mo->15000
- Gamification medals: oro/plata/bronce/sin_medalla
- Gate: attendance >= 90% required

**Plan de Asistencia Online** (Online Assist):
- Bono per online order fulfilled (25 MXN each)
- CSAT multiplier: <4.0->0.8x, 4.0-4.4->1.0x, >=4.5->1.3x
- Gate: attendance >= 90% required

### Deferred Payment Model
- Calculations run monthly
- Payouts aggregated quarterly
- Q3 (Jul-Sep): CLOSED / paid
- Q4 (Oct-Dec): APPROVED / pending

## Verification (14/14 Gates Passed)

```
1. Tenant exists - Velocidad Deportiva
2. Entity count = 35
3. Entity types correct - org=4, loc=8, team=3, ind=20
4. Active rule sets = 2
5. Assignments = 36
6. Periods = 8
7. Committed data = 156
8. Calc results = 108
9. Outcomes = 36
10. Management relationships exist - manages count = 19
11. A01 has 6 Oro medals
12. A05 gated (all zero payouts)
13. VD auth profiles = 3
14. demo_users in tenant settings - 3 demo users
```

## Files Created/Modified

- `web/scripts/seed-velocidad-deportiva.ts` - Main seed script (idempotent)
- `web/scripts/fix-vd-seed.ts` - One-time fix for reports_to->manages + Q4 period
- `web/scripts/verify-velocidad-seed.ts` - 14-gate verification
- `web/scripts/fix-optica-luminar.ts` - OL profile/settings fixes
- `web/scripts/diagnose-tenants.ts` - Multi-tenant diagnostic
- `web/src/components/demo/DemoPersonaSwitcher.tsx` - Floating persona switcher
- `web/src/components/layout/auth-shell.tsx` - Added DemoPersonaSwitcher
- `web/src/app/admin/launch/calculate/diagnostics/page.tsx` - Removed fallback

## Bugs Fixed During Seed

1. **`reports_to` not in CHECK constraint** - Used `manages` type with manager as source
2. **`status: 'active'` not valid for periods** - Used `status: 'open'` for Q4
3. **Q4 period missing -> Q4 outcomes FK failure** - Created Q4 period first via fix script

## Commits

| Hash | Description |
|------|-------------|
| 42e76f5 | Phase 0: Fix Optica Luminar + demo persona switcher |
| 7bca39b | Seed Velocidad Deportiva: 35 entities, 6 months data, gamification |
