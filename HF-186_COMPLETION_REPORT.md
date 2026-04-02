# HF-186 Completion Report

## Commits
1. `HF-186: Fix reference_key → entity_relationship for entity agent`

## Files
- `web/src/lib/sci/negotiation.ts` — 1 file, +5/-1 lines

## Hard Gates

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| G1 | `inferRoleForAgent` maps `reference_key` to `entity_relationship` when `agent === 'entity'` | PASS | `324: return { role: 'entity_relationship', context: \`${field.fieldName} — hierarchical reference\`, confidence: 0.75 };` |
| G2 | `inferRoleForAgent` maps `reference_key` to `entity_identifier` when `agent !== 'entity'` | PASS | `340: return { role: 'entity_identifier', context: \`${field.fieldName} — reference key\`, confidence: 0.90 };` |
| G3 | `entity_relationship` exists in `SemanticRole` type | PASS | `216: \| 'entity_relationship'     // hierarchical link (manager, parent)` |
| G4 | `npx tsc --noEmit` passes | PASS | No output (0 errors) |
| G5 | `npx next lint` passes | PASS | Pre-existing warnings only |
| G6 | `npm run build` succeeds | PASS | Build completed, 0 errors |

## Soft Gates

| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| S1 | No other files modified beyond `negotiation.ts` | PASS | `git diff --name-only` → `web/src/lib/sci/negotiation.ts` |
| S2 | Korean Test: zero hardcoded field names added | PASS | `grep -n 'reports_to\|manager_id\|employee_id' negotiation.ts` → line 321 is a COMMENT only |

## Compliance
- Korean Test: PASS — uses HC columnRole (structural signal), not field names
- OB-107: N/A
- Decision 92: N/A

## Issues
None.
