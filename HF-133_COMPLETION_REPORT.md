# HF-133 Completion Report — Remove Plan "Already Exists" Early Return

## Commits

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `692b2038` | Early return diagnostic |
| 1-2 | `ba1b0231` | Remove early returns + build verification |
| 3 | (this commit) | Completion report + PR |

## Files Changed

### Modified
- `web/src/app/api/import/sci/execute/route.ts` — Both "already exists" early returns removed

## Hard Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-01 | "already exists" early return removed from executeBatchedPlanInterpretation | **PASS** | `grep "returning existing" route.ts` = 0 matches. Lines 1054-1056: HF-133 comment only |
| PG-02 | "already exists" early return removed from executePlanPipeline | **PASS** | Lines 1294-1296: HF-133 comment only. No `existingRuleSet` query remains |
| PG-03 | HF-132 supersede logic preserved | **PASS** | `grep "superseded" route.ts` = lines 1226, 1461: both supersede-then-activate blocks intact |
| PG-04 | Build exits 0 | **PASS** | `npm run build` exit 0, Middleware 75.4 kB |
| PG-05 | VL Admin profile unchanged | **DEFERRED** | Backend-only code change, no profile modifications |

## Soft Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| PG-S1 | No other "already exists" patterns in SCI execute | **PASS** | `grep "already exists" route.ts` = only HF-133 comments at lines 1054, 1294 |
| PG-S2 | Re-import flow: supersede handles idempotency | **PASS** | Both paths: supersede active → upsert new active. Old drafts become irrelevant |

## What Changed

### executeBatchedPlanInterpretation (was lines 1054-1076)
```typescript
// REMOVED: Idempotency loop that checked all plan units for existing rule_sets
// and returned stale draft results, short-circuiting HF-129/130/131/132 chain
// REPLACED WITH: HF-133 comment explaining removal rationale
```

### executePlanPipeline (was lines 1314-1335)
```typescript
// REMOVED: Single-unit idempotency check that returned stale draft rule_set
// REPLACED WITH: HF-133 comment explaining removal rationale
```

## Build

```
npm run build -- exit 0
No TypeScript errors
Middleware: 75.4 kB
1 file changed, 6 insertions(+), 45 deletions(-)
```
