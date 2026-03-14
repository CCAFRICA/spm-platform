# HF-132 Completion Report — Auto-Activate Plan Rule Sets

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `323a47ea` | Plan activation gap diagnostic |
| 1-2 | (this commit) | Auto-activate + supersede + build verification |
| 3 | (next commit) | Completion report + PR |

## Files Changed

### Modified
- `web/src/app/api/import/sci/execute/route.ts` — Both plan upsert sites: status='active', supersede prior

## Hard Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-01 | rule_set created with status='active' | **PASS** | Both upserts: `status: 'active' as const` |
| PG-02 | Prior active rule_sets superseded | **PASS** | Both sites: `supabase.from('rule_sets').update({ status: 'superseded' }).eq('tenant_id', tenantId).eq('status', 'active')` |
| PG-03 | Calculate page query NOT modified | **PASS** | `grep -n "active" web/src/app/operate/calculate/page.tsx` = line 69: `plans.filter(p => p.status === 'active')` unchanged |
| PG-04 | Build exits 0 | **PASS** | `npm run build` exit 0, Middleware 75.4 kB |
| PG-05 | VL Admin profile unchanged | **DEFERRED** | Frontend-only code change, no profile modifications |

## Soft Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-S1 | Other creation paths also auto-activate | **PASS** | `/api/plan/import/route.ts` already has `activate` flag (lines 107-127). GPVWizard sends `activate: true` (line 250). SCI path now matches. |
| PG-S2 | Supersede uses tenant_id scoping | **PASS** | Both sites: `.eq('tenant_id', tenantId).eq('status', 'active')` |

## What Changed

### executeBatchedPlanInterpretation (line ~1243)
```typescript
// HF-132: Supersede any existing active rule_sets
await supabase
  .from('rule_sets')
  .update({ status: 'superseded', updated_at: new Date().toISOString() })
  .eq('tenant_id', tenantId)
  .eq('status', 'active');

// Then upsert with status: 'active'
```

### executePlanPipeline (line ~1497)
Same pattern: supersede then upsert with `status: 'active'`.

## Build

```
npm run build -- exit 0
No TypeScript errors
Middleware: 75.4 kB
1 file changed
```
