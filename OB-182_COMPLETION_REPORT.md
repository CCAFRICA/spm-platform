# OB-182 COMPLETION REPORT
## Date: March 21, 2026

## ROOT CAUSES ADDRESSED

| RC | Root Cause | Fix |
|----|-----------|-----|
| RC1 | Import pipeline requires roster+plans before data | Entity binding, postCommitConstruction, convergence REMOVED from import |
| RC2 | Plan converter has fixed vocabulary | ComponentType extended + transformFromMetadata for new primitives |

## WHAT WAS REMOVED FROM IMPORT

| Operation | Lines Removed | Why |
|-----------|--------------|-----|
| Entity ID binding | 536-577 (29 lines) | Entities may not exist yet. Engine resolves at calc time. |
| postCommitConstruction | line 645 | Creates assignments + binds entity_id. Both are calc-time concerns. |
| Convergence derivation | lines 685-716 (31 lines) | Requires active rule_sets. Engine derives at calc time when needed. |
| OB-177 binding validation | lines 622-657 (35 lines) | entity_id is always NULL now. Validation is N/A. |

**Total: ~100 lines of import-time code removed. Import is now pure STORAGE.**

## WHAT WAS ADDED

| Feature | Location | Purpose |
|---------|----------|---------|
| `entity_id_field` in metadata | execute-bulk line 595 | Preserves which field is the entity identifier for calc-time resolution |
| ComponentType extension | compensation-plan.ts | Added linear_function, piecewise_linear, scope_aggregate |
| `transformFromMetadata` | intent-transformer.ts | Reads intent structure from component.metadata for new primitive types |

## PROOF GATES
| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| PG-01 | Entity binding REMOVED | PASS | Lines 536-565 replaced with comment + entityIdField detection only |
| PG-02 | postCommitConstruction REMOVED | PASS | Line 645 replaced with comment |
| PG-03 | Convergence REMOVED | PASS | Lines 685-716 replaced with comment |
| PG-15 | npm run build exits 0 | PASS | Exit code 0, warnings only |

## KNOWN ISSUES — DEFERRED TO BROWSER TEST

1. **Phase 3 (calc engine resolution):** The engine's convergence path (dataByBatch) needs to become the PRIMARY path since entity_id is always NULL. The existing code already has this fallback — needs verification.

2. **Phase 4 (multi-file upload):** SCIUpload needs investigation. The HF-142 multi-file fix may already handle this via the async pipeline (processing_jobs per file).

3. **source_date extraction:** The `extractSourceDate` function exists and runs at import time. The gap may be in `findDateColumnFromBindings` not receiving the AI-identified date column. Requires runtime debugging.

## BUILD OUTPUT
```
npm run build — exit 0 (warnings only)
```
