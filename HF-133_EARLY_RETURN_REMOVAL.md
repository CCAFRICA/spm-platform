# HF-133: Remove Plan "Already Exists" Early Return

## Phase 0 Diagnostic

### Two "already exists" early return sites in SCI execute (route.ts)

1. **Line 1054-1076**: `executeBatchedPlanInterpretation`
   - Loops all plan units, queries `rule_sets` by `metadata->>contentUnitId`
   - If ANY match found, returns success for ALL units with stale data
   - Short-circuits the entire HF-129/130/131/132 chain

2. **Line 1314-1335**: `executePlanPipeline` (per-unit fallback)
   - Queries `rule_sets` by `metadata->>contentUnitId` for single unit
   - If match found, returns success with stale data
   - Short-circuits per-unit interpretation

### Why removal is safe

HF-132 added supersede-then-activate at both upsert sites:
- **Line 1243-1248**: Batched path — supersedes all active rule_sets before upserting
- **Line 1497-1502**: Per-unit path — same supersede pattern

The supersede logic handles the "duplicate" concern — old rule_sets get `status: 'superseded'`,
new one gets `status: 'active'`. The early return was returning stale DRAFT rule_sets from
failed prior runs, preventing fresh interpretation with the HF-129/130/131/132 improvements.

### No other idempotency concerns

- The upsert uses `crypto.randomUUID()` — always creates a new rule_set
- Old rule_sets are superseded, not orphaned
- No unique constraint on `metadata->>contentUnitId` in the schema

### Fix
1. Remove lines 1054-1076 (batched early return loop)
2. Remove lines 1314-1335 (per-unit early return check)
3. Build verification
