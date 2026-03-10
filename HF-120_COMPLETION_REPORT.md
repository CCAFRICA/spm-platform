# HF-120 COMPLETION REPORT
## Conditional Gate — Evaluate Condition, Not Multiply Base

### Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| Prompt | `0518350` | Commit prompt |
| 0 | `4ed4a94` | Architecture decision — both code paths diagnosed |
| 1 | `42f709f` | Fix: use calculationIntent conditional_gate as primary path |
| 2 | This commit | Completion report + PR |

### Files Changed
| File | Change |
|------|--------|
| `web/src/lib/calculation/run-calculation.ts` | For `conditional_percentage` with `conditional_gate` calculationIntent: use intent executor as primary path instead of `evaluateConditionalPercentage`. Evaluates condition (operator, left, right) and returns onTrue/onFalse constant. Legacy path remains as fallback for plans without calculationIntent. |

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1: Legacy path uses calculationIntent | PASS | run-calculation.ts: `if (gateIntent?.operation === 'conditional_gate' && isIntentOperation(...)) { gatePayout = executeOperation(gateIntent, entityData, inputLog, {}); }` |
| PG-2: Operator evaluation | PASS | Intent executor (intent-executor.ts:235-242) supports `>=, >, <=, <, ==, !=` via switch. Used by `executeOperation` → `executeConditionalGate`. |
| PG-3: Returns constant, not base * rate | PASS | `executeConditionalGate` returns `executeOperation(conditionMet ? op.onTrue : op.onFalse, ...)` where onTrue/onFalse are `{operation: 'constant', value: 500}` or `{operation: 'constant', value: 0}` |
| PG-4: Intent path concordance | PASS | Both paths now use `executeOperation` with the same `conditional_gate` intent. Legacy path calls it in `evaluateComponent`, intent path calls it in `executeIntent`. Same function, same result. |
| PG-5: Korean Test | PASS | Zero hardcoded field names, conditions, or values. Operator, threshold, and payout values come from `calculationIntent` plan structure. |
| PG-6: Build exits 0 (Phase 1) | PASS | `npm run build` succeeds |
| PG-7: Final build exits 0 | PASS | Clean build succeeds |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | PASS — condition structure from AI plan interpretation, no hardcoded values |
| Fix Logic Not Data | PASS — evaluator logic change, not plan/data adjustment |
| Scale by Design | PASS — works for any condition operator, any threshold, any payout value |
| Architecture Decision Gate | PASS — HF-120_ARCHITECTURE_DECISION.md committed before implementation |

### Root Cause
`evaluateConditionalPercentage` computed `base * rate` for gate components. HF-117 added `base === 0 ? rate : base * rate` which fixed the PASS case (0 incidents → rate as payout) but broke the FAIL case (>0 incidents → incidents * rate instead of 0). The calculationIntent already had the correct condition structure — the fix uses it as the primary evaluation path.

### Post-Merge Production Verification (FOR ANDREW)
| Gate | Status | Evidence |
|------|--------|----------|
| PG-8: PR created | | |
| PG-9: Grand total ~ MX$185,063 | | |
| PG-10: Claudia (70001) = MX$1,573 | | |
| PG-11: Alma (70129) has no safety bonus | | |
| PG-12: Concordance = 100% | | |

---
*HF-120 Complete | March 9, 2026*
