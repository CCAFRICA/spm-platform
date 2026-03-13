# HF-126 Phase 0: Diagnostic

## 0A: SCI Execute — Entity Creation

Entity resolution happens at line 253 via `resolveEntitiesFromCommittedData()`.
This runs AFTER all pipelines complete (entity, target, transaction, plan).
Creates entities and backfills entity_id on committed_data rows.
Does NOT create rule_set_assignments.

## 0B: Assignment Code Exists — But Is Gated

`postCommitConstruction()` (line 1123) contains assignment creation code (lines 1148-1197).
BUT the entire function is gated by `if (entityIdField)` at line 1135.
`entityIdField` comes from `confirmedBindings.find(b => b.semanticRole === 'entity_identifier')`.
If BCL's content units don't have an 'entity_identifier' binding, the assignment code NEVER RUNS.

## 0C: Entity Resolution Does Not Create Assignments

`web/src/lib/sci/entity-resolution.ts` — `resolveEntitiesFromCommittedData()`
Zero references to `rule_set_assignments`. Only creates entities and backfills entity_id.

## 0D: Import Commit Route — Has Working Assignment Code

`web/src/app/api/import/commit/route.ts` lines 898-978:
- Queries all entities
- Queries all active rule_sets
- Checks existing assignments
- Creates missing assignments
- Uses batch inserts (5000 per batch)

## Root Cause

The SCI execute flow:
1. Per-unit pipelines run (entity, target, transaction)
2. `postCommitConstruction()` called per unit — creates assignments IF `entityIdField` exists
3. Convergence runs (post all pipelines)
4. Entity resolution runs (HF-109) — creates entities, NO assignments
5. Response returned

Problem: Entity resolution (step 4) creates entities AFTER `postCommitConstruction` (step 2).
So even if `entityIdField` exists, the entities may not exist yet when step 2 runs.
And entity resolution itself never creates assignments.

## Fix Location

After entity resolution (line 257), add assignment creation for all entities that lack them.
This is the same pattern as postCommitConstruction lines 1148-1197, but triggered after entities exist.
