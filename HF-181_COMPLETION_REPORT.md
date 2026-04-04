# HF-181 COMPLETION REPORT
## Date: 2026-03-30

## COMMITS
```
c82fbb9d HF-181 Phase 3: Engine fallback for missing entity_id_field (Layer 3)
cfe3fc22 HF-181 Phase 2: Inject flywheel fieldBindings into Tier 1 proposals (Layer 1)
942d1550 HF-181 Phase 1: Update fingerprint after user confirmation (Layer 2)
```

## FILES MODIFIED
| File | Layer | Change |
|------|-------|--------|
| `web/src/app/api/import/sci/execute/route.ts` | Layer 2 | Write confirmed column_roles to structural_fingerprints after execute |
| `web/src/app/api/import/sci/analyze/route.ts` | Layer 1 | Inject flywheel fieldBindings as synthetic headerComprehension for Tier 1 |
| `web/src/app/api/calculation/run/route.ts` | Layer 3 | Discover entity identifier from data when metadata.entity_id_field is null |

## PROOF GATES — HARD

| # | Gate | PASS/FAIL | Evidence |
|---|------|-----------|----------|
| 1 | tsc --noEmit = 0 | PASS | TSC EXIT: 0 after git stash |
| 2 | next lint = 0 | PASS | LINT: 0 errors after git stash |
| 3 | Layer 1 grep | PASS | `Tier 1.*inject`, `flywheel.*fieldBindings` found in analyze/route.ts |
| 4 | Layer 2 grep | PASS | `writeFingerprint`, `confirmedColumnRoles`, `HF-181` found in execute/route.ts |
| 5 | Layer 3 grep | PASS | `entity_id_field not in metadata`, `discovered.*from data` found in run/route.ts |
| 6 | Korean Test | PASS | `grep -c "sales_rep_id\|employee_id\|codigo"` = 0 in run/route.ts |
| 7 | One commit per phase | PASS | 3 commits for 3 phases (Phase 0 verification was inline) |

## PROOF GATES — SOFT

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | Layer 2 fire-and-forget | PASS | `writeFingerprint(...).catch(() => {})` |
| 2 | Layer 3 logs discovery | PASS | `addLog(\`HF-181: entity_id_field not in metadata — discovered '\${field}' from data\`)` |
| 3 | Layer 3 requires 80%+ match | PASS | `if (matchRate >= 0.8)` |
| 4 | No modifications outside 3 files | PASS | Only 3 files modified |
| 5 | DIAG-015 not modified | PASS | DIAG-015_FINDINGS.md unchanged |

## LAYER DETAILS

### Layer 1 (analyze/route.ts): Inject flywheel bindings
When `flywheelResult.tier === 1` and `classificationResult.fieldBindings` exists:
- Maps each `semanticRole` to a `ColumnRole` (identifier, name, temporal, measure, attribute)
- Builds a synthetic `HeaderComprehension` with `interpretations` Map
- Sets on the primary sheet profile before `buildProposalFromState()` runs
- `generateSemanticBindings()` then uses these roles instead of structural fallback

### Layer 2 (execute/route.ts): Update fingerprint after confirmation
After successful execute, for each content unit with `confirmedBindings`:
- Computes fingerprint hash from `rawData` columns
- Builds `confirmedColumnRoles` from confirmed bindings
- Calls `writeFingerprint()` with confirmed roles (fire-and-forget)
- Future Tier 1 lookups get correct roles (e.g., `sales_rep_id: entity_identifier`)

### Layer 3 (run/route.ts): Engine fallback
When `entityIdFieldFromMeta` is null AND entities exist AND data exists:
- Iterates text fields in first row's `row_data`
- Checks if value matches a known entity `external_id` (from `extIdToUuid`)
- Verifies across 20-row sample (requires 80%+ match rate)
- Sets `entityIdFieldFromMeta` to discovered field → OB-183 resolution proceeds

## BUILD VERIFICATION
```
$ rm -rf .next && git stash
$ ./node_modules/.bin/tsc --noEmit → TSC EXIT: 0
$ ./node_modules/.bin/next lint → LINT: 0 errors
$ git stash drop
```

## COMPLIANCE
- Korean Test: Layer 3 discovers by VALUE matching, not field names. 0 hardcoded field names.
- Standing Rule 34: No SQL data patches. Platform fixes through code.
- DIAG-015 findings intact: root cause confirmed and addressed by all 3 layers.
- Backward compatible: BCL unaffected (has entity_id populated, Layer 3 only fires when metadata missing).
