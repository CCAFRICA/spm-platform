# HF-132: Auto-Activate Plan Rule Sets on Creation

## Phase 0 Diagnostic

### Two rule_set upsert sites in SCI execute (route.ts)
1. Line 1250: `executeBatchedPlanInterpretation` — `status: 'draft' as const`
2. Line 1497: `executePlanPipeline` (per-unit fallback) — `status: 'draft' as const`

### Calculate page filter
Line 69 of calculate/page.tsx: `plans.filter(p => p.status === 'active')`
This is correct — only active plans should be calculated.

### Existing activation pattern
`/api/plan/import/route.ts` (Configure path) already has activation logic:
- Archives existing active rule_sets for the tenant (status='archived')
- Activates the new one (status='active')
- Triggered by `activate: true` flag from GPVWizard

### No other rule_set creation paths
No other `from('rule_sets').insert` or `from('rule_sets').upsert` found outside
the two SCI execute sites and the plan/import API route.

### No activation UI exists
No plan activation UI — confirmed Decision 114 gap.

### Fix
1. Change `status: 'draft'` to `status: 'active'` in both SCI execute upsert sites
2. Before each upsert, supersede existing active rule_sets for the tenant
3. Calculate page query unchanged
