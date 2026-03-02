# HF-078: Calculation Results INSERT Path — UNIQUE Constraint Compatibility

## READ FIRST
- `CC_STANDING_ARCHITECTURE_RULES.md` — ALL sections (9 principles, anti-patterns, operational rules)
- `SCHEMA_REFERENCE.md` — calculation_results table schema

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Complete all phases, all proof gates, commit, push, PR.

## PROBLEM STATEMENT

**Production is broken.** After OB-121 merged (PR #134) and the UNIQUE constraint was applied to `calculation_results`, clicking "Calculate All 4 Plans" in the MBC tenant fails with 409 errors for all 4 plans:

```
Consumer Lending Commission Plan 2024: Failed to write results: unknown
Deposit Growth Incentive — Q1 2024: Failed to write results: unknown  
Insurance Referral Program 2024: Failed to write results: unknown
Mortgage Origination Bonus Plan 2024: Failed to write results: unknown
```

**The DELETE-before-INSERT code from OB-121 fires the DELETE correctly** (MBC calculation_results are now empty — 0 rows returned for MBC in production). **The INSERT then fails against the UNIQUE constraint** — meaning the calculation engine is attempting to INSERT multiple rows with the same `(tenant_id, entity_id, period_id, rule_set_id)` within a single run.

The UNIQUE constraint is:
```sql
UNIQUE (tenant_id, entity_id, period_id, rule_set_id)
```

The `calculation_results` schema:
```
id           | uuid (PK)
tenant_id    | uuid FK → tenants.id
batch_id     | uuid FK → calculation_batches.id
entity_id    | uuid FK → entities.id
rule_set_id  | uuid FK → rule_sets.id
period_id    | uuid FK → periods.id
total_payout | numeric
components   | jsonb
metrics      | jsonb
attainment   | jsonb
metadata     | jsonb
created_at   | timestamptz
```

## ROOT CAUSE HYPOTHESIS

The engine likely produces multiple result rows per entity×period×plan in one of these ways:

1. **Per-component INSERT instead of per-entity INSERT** — the engine writes one row per component instead of aggregating components into the `components` JSONB column of a single row
2. **Duplicate entity processing** — the same entity is processed twice in the same calculation run (e.g., entity appears in multiple assignment paths)
3. **The DELETE scope doesn't match** — the DELETE uses different columns than the UNIQUE constraint expects (e.g., DELETE by batch_id instead of by entity_id + period_id + rule_set_id)

## DIAGNOSTIC PHASE (Do this FIRST, commit findings)

### Step 1: Read the exact DELETE and INSERT code

Read these files completely:
- `src/app/api/calculation/run/route.ts` — find the DELETE statement and the INSERT statement
- `src/lib/calculation/run-calculation.ts` — find where results are assembled before INSERT

### Step 2: Trace the data flow

For a single entity (e.g., Luis, entity_id for employee 1005):
1. How many times does the engine call INSERT for this entity in one calculation run?
2. What are the exact column values for each INSERT?
3. Do any two INSERTs share the same (tenant_id, entity_id, period_id, rule_set_id)?

### Step 3: Identify the conflict

The UNIQUE constraint says: one row per (tenant_id, entity_id, period_id, rule_set_id). If the engine needs to write multiple rows for the same entity in the same period for the same plan, the architecture has a mismatch between the data model and the constraint.

**Possible fix paths:**
- A) If multiple rows per entity×period×plan are intentional (per-component results): change to UPSERT (INSERT ON CONFLICT UPDATE) or aggregate into single row before INSERT
- B) If duplicate processing: fix the entity iteration to process each entity exactly once
- C) If DELETE scope mismatch: align DELETE with UNIQUE constraint columns

## IMPLEMENTATION

Fix the INSERT path so that:
1. Each entity×period×plan combination produces exactly ONE row in calculation_results
2. Component-level detail lives in the `components` JSONB column (not as separate rows)
3. The DELETE before INSERT uses the same key columns as the UNIQUE constraint: `(tenant_id, entity_id, period_id, rule_set_id)`
4. The fix works for ALL tenants (Pipeline Test Co, MBC, Óptica Luminar) — Korean Test compliant

## CRITICAL CONSTRAINTS

- **Do NOT remove the UNIQUE constraint.** Decision 68 is locked. The constraint is correct. The INSERT path must conform to it.
- **Do NOT change the constraint columns.** `(tenant_id, entity_id, period_id, rule_set_id)` is the right key.
- **The fix must be in the application code**, not in the database schema.
- **Pipeline Test Co must still work.** After fix, Pipeline Test Co ground truth ($1,253,832 / 719 employees) must be verifiable.

## PROOF GATES

| Gate | Description | Verification |
|------|-------------|-------------|
| PG-01 | Root cause identified with exact file:line | Paste the code that generates duplicate INSERTs |
| PG-02 | Fix committed — single row per entity×period×plan | Show INSERT logic produces exactly 1 row per combination |
| PG-03 | DELETE scope matches UNIQUE constraint columns | Show DELETE uses tenant_id, entity_id, period_id, rule_set_id |
| PG-04 | `npm run build` clean | Zero TypeScript errors |
| PG-05 | MBC calculation succeeds on localhost | "Calculate All 4 Plans" → no errors, all 4 plans produce results |
| PG-06 | MBC grand total ≈ $3,256,677.69 | Within 1% of OB-121 clean baseline |
| PG-07 | MBC row count = 320 | `SELECT COUNT(*) FROM calculation_results WHERE tenant_id = [mbc_tenant_id]` |
| PG-08 | Zero duplicate rows | `SELECT COUNT(*) = COUNT(DISTINCT (tenant_id, entity_id, period_id, rule_set_id)) FROM calculation_results` |
| PG-09 | Pipeline Test Co unaffected | Verify PTC results still exist and total matches |
| PG-10 | Browser console clean | No 409 errors on Calculate |

## GIT PROTOCOL

1. All work on `dev` branch
2. Commit after diagnostic phase with findings
3. Commit after fix implementation
4. `git push origin dev`
5. Kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
6. Final: `gh pr create --base main --head dev --title "HF-078: Fix calculation INSERT path for UNIQUE constraint compatibility" --body "Fixes 409 errors when calculating plans. Root cause: [fill from diagnostic]. DELETE-before-INSERT now correctly scoped. All proof gates pass."`

## CC FAILURE PATTERNS TO AVOID

- **Pattern 18 (Stale accumulation):** The fix must preserve DELETE-before-INSERT. Do not remove the DELETE.
- **AP-14 (Partial state on failure):** If INSERT fails for one entity, don't leave other entities' DELETEd results missing. Consider wrapping in a transaction or ensuring DELETE + INSERT are atomic per plan.
- **AP-4 (Sequential per-entity calls):** Prefer bulk operations. DELETE all entities for a plan/period first, then bulk INSERT all results.
- **AP-13 (Assume column names):** Verify actual column names in calculation_results match what the INSERT uses.

## EXPECTED OUTCOME

After this HF:
- "Calculate All 4 Plans" succeeds for MBC with no errors
- Grand total displays approximately $3,256,677.69
- UNIQUE constraint remains in place (Decision 68)
- DELETE-before-INSERT pattern preserved (Standing Rule 25)
- All other tenants unaffected
