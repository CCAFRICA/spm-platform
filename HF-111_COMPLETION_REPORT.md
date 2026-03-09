# HF-111 Completion Report: Convergence Column-Level Binding Accuracy

## Specification
**HF-111**: CONVERGENCE COLUMN-LEVEL BINDING ACCURACY — The Right Columns for the Right Components

## Root Cause
Convergence found the right batch but selected the SAME column (`Ingreso_Meta`) for ALL 5 components. `generateComponentBindings` sorted measure columns by confidence (all equal) and picked the first one. Result: MX$25,415,161,650 instead of MX$185,063.

## Fix: Value Distribution + Boundary Range Matching

### Architecture
1. **Extract input requirements** from each component's `calculationIntent` — boundary ranges define expected value scale
2. **Profile column value distributions** (min/max/mean) during convergence inventory — O(columns) per batch
3. **Score columns against boundaries** — Korean Test compliant (value characteristics, not names)
4. **Column exclusion** after binding — prevents all components binding to same column
5. **Multi-input bindings** — 2D lookup (row + column), ratio (numerator + denominator)
6. **Scale factor** — detects ratio columns (0-1) needing percentage conversion (0-100)

### Korean Test Compliance
- Column selection uses value range overlap with boundary ranges — zero language dependency
- `scoreColumnForRequirement` compares `ColumnValueStats.min/max` against `Boundary.min/max`
- No column name matching, no field name dictionaries

## Phases Executed

### Phase 0: Diagnostic (`75cc43e`)
- Identified `generateComponentBindings` (line 759) as the bug — highest-confidence measure for ALL components
- Mapped expected correct bindings from component boundary ranges

### Phase 1-3: Implementation (`127cf06`)
**convergence-service.ts:**
- Extended `PlanComponent` with `calculationIntent` field
- Added `ColumnValueStats` interface and `columnStats` to `DataCapability`
- Added `extractInputRequirements()` — parses operation type to determine roles + boundary ranges
- Added `extractRangeFromBoundaries()` — extracts min/max from `Boundary[]`
- Added `scoreColumnForRequirement()` — scores column fit against boundary range with scale detection
- Replaced per-component `generateComponentBindings()` with `generateAllComponentBindings()` — processes all components with column exclusion

**route.ts (engine):**
- Extended `ConvergenceBindingEntry` with `scale_factor`
- `resolveMetricsFromConvergenceBindings` now reads `row`, `column`, `numerator`, `denominator` binding roles
- Applies `scale_factor` to resolved values
- Batch indexing covers all binding roles

## Expected Bindings (Post Re-convergence)
```
Component 0 (bounded_lookup_2d): row → percentage-scale column, column → volume-scale column
Component 1 (bounded_lookup_1d): actual → percentage-scale column (different from comp 0)
Component 2 (scalar_multiply):   actual → small integer column (count)
Component 3 (conditional_gate):  actual → small integer column (different from comp 2)
Component 4 (scalar_multiply):   numerator + denominator → volume columns
```

## Verification SQL (Post Re-import)

### V1: Each component binds to a DIFFERENT column
```sql
SELECT
  key as component,
  value->'actual'->>'column' as actual_col,
  value->'row'->>'column' as row_col,
  value->'column'->>'column' as col_col,
  value->'numerator'->>'column' as num_col,
  value->'denominator'->>'column' as den_col,
  value->'actual'->>'match_pass' as match_pass
FROM rule_sets,
  jsonb_each(input_bindings->'convergence_bindings')
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

### Reset SQL (Before Re-convergence)
```sql
UPDATE rule_sets
SET input_bindings = '{}'::jsonb
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

## Commit History
| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | `75cc43e` | Column binding diagnostic |
| 1-3 | `127cf06` | Boundary matching + multi-input engine |
| 4 | This commit | Completion report + PR |

## Ground Truth
**MX$185,063** — Meridian Logistics Group, January 2025
Pending production verification after merge + re-import + re-convergence.

---
*HF-111 Complete | March 9, 2026*
