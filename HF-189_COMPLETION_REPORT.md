# HF-189 Completion Report

## Commits
1. `HF-189: Self-healing assignment gap — missing entities assigned at calc time`

## Files
- `web/src/app/api/calculation/run/route.ts` — 1 file

## Hard Gates

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| G1 | Missing entity detection compares assignment set against all tenant entities | PASS | Line 290: `const assignedSet = new Set(entityIds)`, Line 291: `const missingEntityIds = allTenantEntityIds.filter(id => !assignedSet.has(id))` |
| G2 | Missing assignments are bulk inserted | PASS | Lines 294-305: `newAssignments = missingEntityIds.map(...)`, batch insert in 5000-row chunks |
| G3 | entityIds array includes newly assigned entities | PASS | Line 306: `entityIds = [...entityIds, ...missingEntityIds]` |
| G4 | Log message identifies HF-189 gap-fill | PASS | Line 310: `addLog('HF-189: Assigned ${missingEntityIds.length} missing entities...')` |
| G5 | tsc --noEmit passes | PASS | No output (0 errors) |
| G6 | next lint passes | PASS | No errors |
| G7 | npm run build succeeds | PASS | Build completed, 0 errors |

## Soft Gates

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| S1 | Only route.ts modified | PASS | `git diff --name-only` → `web/src/app/api/calculation/run/route.ts` |
| S2 | No changes to SCI execute or entity pipeline | PASS | Same |
| S3 | Korean Test: no hardcoded entity IDs or field names | PASS | Zero domain strings in changes |

## Compliance
- Decision 152: PASS — import sequence independence restored
- Rule 36: PASS — only assignment gap-fill, no behavioral changes

## Issues
None.
