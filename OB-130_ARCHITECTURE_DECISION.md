# OB-130: Architecture Decision — Calculate + Results Experience

## Date: 2026-03-01
## Decision: Option A — Plan-Centric Cards

---

## Context

The current calculate page at `/admin/launch/calculate` is a 1111-line monolith that:
1. Calculates ALL plans at once for a single period
2. Shows results as a flat entity table with no plan filter
3. Lives under `/admin/launch/` (not the Operate workspace)
4. `/operate/calculate` is just a redirect to the admin page

CLT-126 findings:
- F-126-08: No single-plan recalculation
- F-126-09: No plan filter on results

## Decision

**Option A: Plan-centric cards at /operate/calculate**

Replace the `/operate/calculate` redirect with a new plan-centric page:

1. **PlanCard** — One card per active plan showing:
   - Plan name, readiness state (entities, bindings, data)
   - "Calculate" button (single-plan, all periods)
   - Last result summary (entity count, total payout, date)

2. **PlanResults** — Expandable results panel per plan:
   - Outcome summary (entity count, total, average)
   - Entity table with search, sort, pagination
   - Component drill-down per entity (expandable rows)
   - Trace link to /investigate/trace/:entityId

3. **Page assembly** — /operate/calculate becomes:
   - Period selector (from OperateContext)
   - Plan cards grid (responsive)
   - Selected plan results panel
   - Lifecycle subway (if batch exists)

## Existing infrastructure reused

- Calculation API: `POST /api/calculation/run` already accepts single `ruleSetId`
- Plan readiness: `GET /api/plan-readiness` returns per-plan readiness data
- OperateContext: Plan/Period/Batch selections with sessionStorage persistence
- calculation-service: `getCalculationResults(tenantId, batchId)`
- lifecycle-utils: State labels, colors, transitions

## What stays

- `/admin/launch/calculate` — kept as-is (admin/VL workspace)
- `/operate/results` — kept as-is (Five Layers of Proof view)
- Calculation API — no changes needed

## What changes

- `/operate/calculate/page.tsx` — redirect → full plan-centric page
- New `web/src/components/calculate/PlanCard.tsx`
- New `web/src/components/calculate/PlanResults.tsx`
- Sidebar nav: "Calculate" → /operate/calculate
- page-status: /operate/calculate = active
- role-permissions: /operate/calculate = ['vl_admin', 'admin']
