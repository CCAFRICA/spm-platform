# HF-094 Completion Report: Duplicate Rule Set + Signal Write Path Fix

## Phase 1: Duplicate Rule Set Cleanup

### Action Required (Andrew — Supabase SQL Editor)
```sql
DELETE FROM rule_sets WHERE id = '465ecdad-b471-4be1-b166-5f41964b10f9';
```
This removes the older duplicate "Meridian Logistics Group Incentive Plan 2025" rule set. The newer one (022b0e46) is retained.

**Verify after:**
```sql
SELECT id, name, created_at FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
-- Should return exactly 1 row (022b0e46)
```

---

## Phase 2: Signal Write Path Consolidation

### Problem
Two signal write paths existed:
- **OLD**: `captureSCISignalBatch` → `persistSignal` → writes to `signal_value` JSONB column only
- **NEW**: `writeClassificationSignal` → writes to HF-092 dedicated indexed columns (`source_file_name`, `sheet_name`, `classification`, `structural_fingerprint`, etc.)

The execute route had BOTH paths (redundant writes). The analyze route only had the OLD path (dedicated columns never populated for predictions).

### Fix
| Route | Before | After |
|-------|--------|-------|
| `analyze/route.ts` | `captureSCISignalBatch` (OLD) | `writeClassificationSignal` (NEW) |
| `execute/route.ts` | BOTH paths | `writeClassificationSignal` (NEW only) |

### Changes
1. **`execute/route.ts`**: Removed `captureSCISignalBatch` block (lines 193-218) and unused imports
2. **`analyze/route.ts`**: Replaced `captureSCISignalBatch` with `writeClassificationSignal` using proper `ClassificationTrace` structure and `fingerprintMap` for structural fingerprints

### Commits
- `2c6defb` — HF-094 Phase 2: Consolidate signal write path to HF-092 dedicated columns

---

## Phase 3: Verification

### Build Gate
```
npx next build → PASS (warnings only, no errors)
```

### Signal Write Path Coverage
| Signal Source | Write Function | Dedicated Columns |
|--------------|---------------|-------------------|
| Analyze (prediction) | `writeClassificationSignal` | YES |
| Execute (outcome) | `writeClassificationSignal` | YES |
| Execute (foundational) | `aggregateToFoundational` | YES |
| Execute (domain) | `aggregateToDomain` | YES |

### Columns Now Populated
- `source_file_name` — from `unit.sourceFile`
- `sheet_name` — from `unit.tabName`
- `classification` — from `unit.classification`
- `structural_fingerprint` — from `computeStructuralFingerprint(profile)`
- `confidence` — from `unit.confidence`
- `decision_source` — `'sci_prediction'` or `'sci_outcome'`
- `classification_trace` — full JSONB trace
- `agent_scores` — per-agent confidence map

### No Regressions
- Plan import pipeline: unchanged (does not write classification signals)
- Data import pipeline: single write path (was dual, now single — cleaner)
- Signal reads (`lookupPriorSignals`, `computeClassificationDensity`): read from dedicated columns — now correctly populated
