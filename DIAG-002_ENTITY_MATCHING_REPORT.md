# DIAG-002: Entity Matching Trace — Report

## Evidence

### Entity external_id format
```
BCL-5001, BCL-5002, BCL-5003, BCL-5004, BCL-5005 (85 total)
```

### November row_data identifier values
```
ID_Empleado: "BCL-5001", "BCL-5002", "BCL-5003" (85 rows, source_date: 2025-11-01)
```

### October row_data identifier values
```
ID_Empleado: "BCL-5070" (matches entity external_id: BCL-5070)
```

### Match test results
- **Format matches exactly:** BCL-5001 = BCL-5001
- **Entity matching in execute-bulk WORKS:** 85/85 rows have entity_id
- **committed_data total:** 255 rows (85 Oct + 85 personal + 85 Nov)

## Root Cause

**"0 Entities Matched" is a UI display bug, not a data import bug.**

The "Entities Matched" number displayed on the Import Complete screen comes from `/api/plan-readiness`, which counts `rule_set_assignments` per plan. BCL has two rule_sets:

| Rule Set | Status | Assignments |
|----------|--------|-------------|
| Draft (created first) | draft | 0 |
| Active (used for calc) | active | 85 |

The plan-readiness API returns both without ordering. The frontend takes `plans[0].entityCount` — which is the DRAFT plan with 0 assignments.

## Fix

### API: `web/src/app/api/plan-readiness/route.ts`
Added `.order('status', { ascending: true })` — "active" sorts before "draft" alphabetically.

### Frontend: `web/src/app/operate/import/page.tsx`
Changed from `plans[0]` to `plans.find(p => p.status === 'active') || plans[0]` — explicitly prefers the active plan.

## Verification
- November data: 85 rows in committed_data, ALL with entity_id ✓
- October data: 85 rows + 85 personal, ALL with entity_id ✓
- Entity format match: BCL-5001 = BCL-5001 ✓
- Build: passes ✓

## Proof Gates

| # | Gate | Status |
|---|------|--------|
| PG-1 | Root cause with DB evidence | **PASS** — draft plan has 0 assignments, active has 85 |
| PG-2 | October vs November comparison | **PASS** — both work identically, same format |
| PG-3 | Fix targets evidenced root cause | **PASS** — API ordering + frontend active preference |
| PG-4 | Cleanup | **N/A** — November data is correct, no cleanup needed |
| PG-5 | npm run build exits 0 | **PASS** |
