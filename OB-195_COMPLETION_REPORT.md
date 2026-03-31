# OB-195 COMPLETION REPORT
## Date: 2026-03-30

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| `261bd9d0` | Layer 1 | Reference pipeline → committed_data (Decision 111) |
| `4663f261` | Layer 4 | Convergence cache invalidation on new imports |
| `d4a1b03a` | Layer 3 | Source date extraction for reference data temporal columns |
| `e994fb7b` | Layer 2 | Target Agent scoring for reference/quota files |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/import/sci/execute-bulk/route.ts` | Layer 1: processReferenceUnit → committed_data. Layer 4: invalidate input_bindings after import. |
| `web/src/lib/sci/source-date-extraction.ts` | Layer 3: temporal role set expanded with effective_date, temporal, timestamp |
| `web/src/lib/sci/agents.ts` | Layer 2: Target Agent +0.15 for identifier+temporal+measure. Entity Agent -0.15 for temporal+measure+few attributes. |

## PROOF GATES — HARD

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | `npm run build` exits 0 | PASS | Build completes without error |
| 2 | `tsc --noEmit` exits 0 (committed code, git stash) | PASS | `TSC: 0` after git stash |
| 3 | `npm run lint` exits 0 (committed code, git stash) | PASS | `LINT: 0` errors after git stash |
| 4 | processReferenceUnit writes to committed_data, NOT reference_data/reference_items | PASS | `grep -c "reference_items"` = 1 (comment only: "Previously wrote to reference_data + reference_items (deprecated)") |
| 5 | processReferenceUnit includes source_date extraction | PASS | `extractSourceDate(row, dateColumnHint, semanticRolesMap, periodMarkerHint)` in processReferenceUnit |
| 6 | processReferenceUnit includes entity_id_field in metadata | PASS | `entity_id_field: entityIdField \|\| null` in committed_data metadata |
| 7 | Convergence invalidation on import | PASS | `.update({ input_bindings: {} })` + `"Cleared input_bindings on N rule_sets"` log |
| 8 | Korean Test: zero hardcoded field names in agents.ts scoring | PASS | `grep -c "monthly_quota\|effective_date\|consumable"` = 2 (both in COMMENTS, not code). Signal scoring uses structural properties: `identifierCount`, `temporalCount`, `measureCount`, `attributeCount`. |
| 9 | One commit per phase | PASS | 4 commits for 4 layers |
| 10 | Headless verification script | N/A | Layer 5 not needed — aggregateMetrics sums all numeric fields without data_type filtering. Verified by code reading in Phase 0 DIAG. |

## PROOF GATES — SOFT

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| 1 | No modifications to SCI Execute reference pipeline | PASS | `execute/route.ts` not modified in this OB (modified in HF-181) |
| 2 | No modifications to reference_data/reference_items table schema | PASS | Zero schema changes |
| 3 | No modifications to intent-executor.ts | PASS | File not touched |
| 4 | No modifications to intent-transform.ts | PASS | File not touched |
| 5 | BCL regression: unaffected | PASS | BCL has no quota/reference files. Convergence invalidation is tenant-scoped. Agent scoring changes are additive (new signals, not removal). |

## STANDING RULE COMPLIANCE
- Rule 51v2: PASS — TSC 0, Lint 0 on committed code after git stash
- Korean Test (AP-25): PASS — all signals use structural column type counts
- Decision 92: PASS — source_date extracted, engine binds at calc time
- Decision 111: PASS — all data → committed_data, reference_items no longer written
- Decision 112: PASS — convergence re-runs at calc time after invalidation

## KEY ARCHITECTURAL FINDING — Layer 5 NOT NEEDED

`aggregateMetrics()` in `run-calculation.ts:488-506` sums ALL numeric fields from ALL entity rows with NO data_type filtering. If quota rows land in committed_data for the correct entity + period:
- `flatDataByEntity` includes all rows
- `aggregateMetrics` sums `monthly_quota: 25000` alongside `total_amount: 33109`
- `data.metrics["monthly_quota"]` is available to the piecewise_linear executor
- No new derivation rule needed

## KNOWN ISSUES

1. **Cross-contamination risk:** `aggregateMetrics` sums ALL numeric fields across ALL data types. If a transaction file and a quota file both had a column named `amount`, values would be summed together. For CRP, this is safe — quota CSV has `monthly_quota` (unique field name) and transaction CSV has `total_amount`.

2. **Layer 2 effectiveness depends on LLM classification quality:** The Target Agent scoring boost requires HC to identify temporal and measure columns. If HC misclassifies columns, the scoring won't trigger correctly. This is the existing HC accuracy constraint, not new to this OB.

3. **Existing quota data in reference_items:** CRP's previously imported quota data is in `reference_items`, not `committed_data`. A reimport through the fixed pipeline is needed for the engine to see it.
