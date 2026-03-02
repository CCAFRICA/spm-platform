# HF-079: Fix DELETE-before-INSERT Not Executing in runCalculation()

## READ FIRST
- `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections
- `SCHEMA_REFERENCE.md` — calculation_results table schema

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Complete all phases, all proof gates, commit, push, PR.

## PROBLEM STATEMENT

**HF-078 (PR #135) did not fix the production issue.** The error message extraction works (we now see the real error), but the DELETE-before-INSERT is still not executing before the INSERT in `runCalculation()`.

**Production error (browser alert, all 4 plans):**
```
Consumer Lending Commission Plan 2024: Failed to write results: 
duplicate key value violates unique constraint "calculation_results_unique_entity_period_plan"
```

**Production database state (CORRECT — do not corrupt):**
```
mexican-bank-co | Consumer Lending Commission Plan 2024     | 100 rows | $2,084,387.67
mexican-bank-co | Deposit Growth Incentive — Q1 2024        | 100 rows | $0.00
mexican-bank-co | Insurance Referral Program 2024           |  64 rows | $125,400.00
mexican-bank-co | Mortgage Origination Bonus Plan 2024      |  56 rows | $1,046,890.05
Grand Total: $3,256,677.72 | 320 rows
```

Also in production (DO NOT AFFECT):
```
pipeline-test          | 719 rows
pipeline-proof         | 719 rows  
optica-luminar         | 1450 rows
retail-conglomerate-mexico | 719 rows
retailcdmx             | 1005 rows
velocidad-deportiva    | 108 rows
```

**What happened:** HF-078 added DELETE-before-INSERT to `runCalculation()` in `run-calculation.ts`. This passed on localhost because the database was empty (MBC had 0 rows after the failed calculation attempt). In production, MBC has 320 correct rows. When "Calculate All 4 Plans" runs, the DELETE either:
1. Is not being reached (conditional logic, early return, or wrong code path)
2. Is being reached but with wrong parameters (wrong tenant_id, wrong scope)
3. Is in the wrong position (after the INSERT attempt, not before)

## DIAGNOSTIC PHASE (MANDATORY — commit findings before fixing)

### Step 1: Find HF-078's DELETE code
Read `src/lib/calculation/run-calculation.ts` completely. Find the exact DELETE statement that HF-078 added. Record:
- Exact line number
- What conditions gate it (is it inside an if block? a try/catch? a function that may not be called?)
- What parameters it uses (tenant_id, entity_id, period_id, rule_set_id — all four?)
- Where it sits relative to the INSERT call (`writeCalculationResults()`)

### Step 2: Trace the execution path
When the admin clicks "Calculate All 4 Plans" on `/admin/launch/calculate`:
1. What function is called first?
2. Does it call `runCalculation()` once per plan, or once for all plans?
3. Inside `runCalculation()`, trace the exact path from entry to the INSERT. Does the DELETE execute on this path?

### Step 3: Add temporary logging
Add `console.log('HF-079 DELETE executing for tenant:', tenantId, 'plan:', ruleSetId)` immediately before the DELETE statement. Add `console.log('HF-079 DELETE result:', deleteResult)` after it. This proves whether the DELETE path is reached.

### Step 4: Test on localhost with EXISTING data
**CRITICAL:** Do NOT test against an empty database. The bug only manifests when rows already exist. Before testing:
1. Run calculation once (should succeed — empty DB)
2. Run calculation AGAIN (this is the test — must succeed with DELETE firing first)

If the second run fails with the UNIQUE constraint error, you've reproduced the production bug. Fix it, then test the second run again.

## THE FIX

The DELETE must:
1. Execute BEFORE any INSERT into calculation_results
2. Use the same key columns as the UNIQUE constraint: `(tenant_id, entity_id, period_id, rule_set_id)`
3. Delete ALL existing rows for the entities being calculated in this run
4. Be UNCONDITIONAL — no if-check, no try/catch that swallows errors, no conditional path that skips it

**Recommended pattern:**
```typescript
// DELETE all existing results for this plan+period BEFORE calculating
const { error: deleteError } = await supabase
  .from('calculation_results')
  .delete()
  .eq('tenant_id', tenantId)
  .eq('rule_set_id', ruleSetId)
  .eq('period_id', periodId);

if (deleteError) {
  console.error('Failed to delete existing results:', deleteError);
  throw new Error(`Failed to clear existing results: ${deleteError.message}`);
}

// NOW calculate and insert fresh results
```

The DELETE should be scoped to (tenant_id, rule_set_id, period_id) — deleting ALL entities for this plan+period. This is simpler and safer than per-entity DELETE, and ensures no stale rows remain.

## ALSO CHECK: route.ts DELETE

OB-121 added a DELETE to `src/app/api/calculation/run/route.ts:862-867`. Verify this DELETE is also correctly scoped. The two code paths (route.ts and runCalculation()) must both have working DELETE-before-INSERT. Reference CC Failure Pattern 21: fix applied to one code path but not the other.

## PROOF GATES

| Gate | Description | Verification |
|------|-------------|-------------|
| PG-01 | Root cause identified | Paste the exact code showing why DELETE doesn't execute, with line numbers |
| PG-02 | DELETE confirmed executing | Console.log output showing DELETE fires before INSERT |
| PG-03 | Idempotent calculation | Run calculation TWICE on localhost — second run succeeds, no constraint error |
| PG-04 | MBC totals match baseline | Grand total ≈ $3,256,677.72 after recalculation |
| PG-05 | MBC row count = 320 | Exactly 320 rows, zero duplicates |
| PG-06 | `npm run build` clean | Zero TypeScript errors |
| PG-07 | Other tenants unaffected | Pipeline Test Co rows still present |
| PG-08 | Browser console clean | No 409 errors on Calculate |

## CC FAILURE PATTERNS TO AVOID

- **Pattern 18 (Stale accumulation):** DELETE must fire. No exceptions.
- **Pattern 21 (NEW — Dual code path):** Both route.ts AND runCalculation() must have working DELETE-before-INSERT. Test BOTH paths.
- **AP-14 (Partial state):** If DELETE succeeds but INSERT fails, the results are gone. Consider wrapping DELETE+INSERT in a single operation, or ensure INSERT cannot fail after DELETE.
- **AP-9 (Report PASS on file existence):** Must test with EXISTING data, not empty database. Empty DB passes trivially.

## GIT PROTOCOL

1. All work on `dev` branch
2. Commit diagnostic findings first
3. Commit fix
4. `git push origin dev`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
6. Test calculation TWICE (second run is the real test)
7. `gh pr create --base main --head dev --title "HF-079: Fix DELETE-before-INSERT execution in runCalculation()" --body "HF-078 added DELETE but it was not executing. Root cause: [fill from diagnostic]. Second calculation run now succeeds. All proof gates pass."`
