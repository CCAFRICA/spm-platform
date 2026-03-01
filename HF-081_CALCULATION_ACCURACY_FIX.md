# HF-081 COMPLETION REPORT
## LAB Calculation Accuracy — Mortgage Source Pattern + Consumer Lending Derivation Fix
## Date: 2026-02-28

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| 350c299 | Phase 0 | Diagnostic — current LAB state before fixes |
| ffb7a71 | Phase 1+2 | Fix Mortgage source_pattern + Consumer Lending derivation |
| 57a6221 | Phase 3 | Convergence source_pattern validation — prevent race condition |
| 0adc31a | Phase 4 | Re-run LAB calculation with fixed derivations |
| 562b5fd | Phase 5 | CC-UAT verification trace — Layers 2, 5, 6 |
| [this] | Phase 6 | This completion report |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/intelligence/wire/route.ts` | Added source_pattern validation in Step 5 (convergence) |
| `web/scripts/hf081-phase0.ts` | Diagnostic script |
| `web/scripts/hf081-fix-derivations.ts` | Derivation fix script |
| `web/scripts/hf081-phase4-recalc.ts` | Recalculation script |
| `web/scripts/hf081-phase5-verify.ts` | CC-UAT verification script |

## DATABASE CHANGES
| Table | Change |
|-------|--------|
| rule_sets (LAB Mortgage `6a142ac3`) | `input_bindings.metric_derivations[0].source_pattern`: `component_data:CFG_Mortgage_Closings_Q1_2024` → `mortgage_closings` |
| rule_sets (LAB Consumer Lending `e2edd6c9`) | `input_bindings.metric_derivations[*].operation`: `count` → `sum`; added `source_field: "LoanAmount"` to all 3 derivations |
| calculation_results (LAB) | Deleted 400 old results, re-calculated 400 new results |
| calculation_batches (LAB) | Deleted and recreated |
| entity_period_outcomes (LAB) | Deleted (recalculation recreates) |

## PROOF GATES — HARD
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| PG-01 | npm run build exits 0 | **PASS** | Build completed with no errors |
| PG-02 | Mortgage source_pattern references normalized data_type | **PASS** | `source_pattern: mortgage_closings PASS` |
| PG-03 | Consumer Lending derivation uses sum, not count | **PASS** | All 3 derivations: `operation: sum` |
| PG-04 | Consumer Lending source_field references actual amount column | **PASS** | `source_field: LoanAmount` (confirmed from committed_data sample: `"LoanAmount":41515.4`) |
| PG-05 | Mortgage results > $0 (at least 1 non-zero entity) | **PASS** | 37 non-zero entities, total: $989,937.41, max: $106,522.95 |
| PG-06 | Consumer Lending max payout > $100 (realistic dollar amounts) | **PASS** | max: $153,878.92, total: $6,540,774.36 |
| PG-07 | Insurance Referral results unchanged ($366,600) | **PASS** | $366,600.00 (identical) |
| PG-08 | MBC grand total = $3,245,212.64 +/- $0.10 | **PASS** | $3,245,212.66 (delta: $0.02) |
| PG-09 | MBC row count = 240 | **PASS** | 240 results |
| PG-10 | No auth files modified | **PASS** | `wire/route.ts` only file changed in src/ |

## PROOF GATES — SOFT
| # | Criterion | PASS/FAIL | Evidence |
|---|-----------|-----------|----------|
| PG-S1 | Officer 1001 has non-zero Mortgage payout | **PASS** | Jan: $20,214.90, Feb: $36,159.66, Mar: $19,811.47 |
| PG-S2 | Officer 1001 Consumer Lending payout > $100 | **PASS** | Jan: $36,538.66, Feb: $127,070.23, Mar: $88,130.15 |
| PG-S3 | Convergence validation prevents future race conditions | **PASS** | Wire API Step 5 validates `source_pattern` against `committed_data.data_type` before writing derivations |
| PG-S4 | No domain vocabulary in new code (Korean Test) | **PASS** | `grep -i 'commission\|mortgage\|loan\|insurance\|deposit' wire/route.ts` → 0 matches |

## STANDING RULE COMPLIANCE
- Rule 1 (commit+push each phase): **PASS** — 5 commits pushed before report
- Rule 2 (cache clear after build): **PASS** — `rm -rf .next && npm run build`
- Rule 25 (report before final build): **PASS** — report created before final commit
- Rule 27 (evidence = paste): **PASS** — all proof gates include pasted output
- Rule 28 (commit per phase): **PASS** — Phase 0, Phase 1+2, Phase 3, Phase 4, Phase 5, Phase 6

## KNOWN ISSUES
- F-01 (full-coverage fallback): **NOT ADDRESSED** — all 25 entities assigned to all 4 plans. Separate fix, lower priority.
- F-04 (Deposit Growth uniform): **NOT ADDRESSED** — $30K/entity/period. Requires Decision 72 multi-tab XLSX.
- F-65 (Tab 2 targets): **NOT ADDRESSED** — requires separate OB.
- Insurance `unknown` metric: Derivation with `metric: "unknown"` exists but doesn't break calculation. Low priority.

## CC-UAT-05 TRACE COMPARISON
| Finding | Before HF-081 | After HF-081 | Delta |
|---------|---------------|--------------|-------|
| F-02 Mortgage | $0.00 (0 non-zero) | $989,937.41 (37 non-zero) | **+$989,937** |
| F-03 Consumer Lending | $15.48 (max $0.32) | $6,540,774.36 (max $153,878.92) | **+$6,540,759** |
| F-01 Full-coverage | 100 assignments | 100 assignments | unchanged |
| F-04 Deposit Growth | $1,440,000 (uniform $30K) | $1,440,000 (uniform $30K) | unchanged |
| Insurance Referral | $366,600 | $366,600 | unchanged |
| **Grand Total** | **$1,806,615.48** | **$9,337,311.77** | **+$7,530,696** |

## OFFICER 1001 DETAILED TRACE
| Plan | Dec 2023 | Jan 2024 | Feb 2024 | Mar 2024 | Total |
|------|----------|----------|----------|----------|-------|
| Insurance Referral | $0 | $9,750 | $11,700 | $3,900 | $25,350 |
| Consumer Lending | $0 | $36,538.66 | $127,070.23 | $88,130.15 | $251,739.04 |
| Mortgage Origination | $0 | $20,214.90 | $36,159.66 | $19,811.47 | $76,186.03 |
| Deposit Growth | $30,000 | $30,000 | $30,000 | $30,000 | $120,000 |
| **Total** | **$30,000** | **$96,503.56** | **$204,929.89** | **$141,841.62** | **$473,275.07** |

## CODE CHANGE: CONVERGENCE VALIDATION (wire/route.ts)

```typescript
// HF-081: Validation gate — get actual data_types AFTER normalization completes
const validDataTypes = new Set<string>();
const { data: dtRows } = await supabase
  .from('committed_data')
  .select('data_type')
  .eq('tenant_id', tenantId)
  .not('data_type', 'is', null)
  .limit(5000);
if (dtRows) {
  for (const r of dtRows) validDataTypes.add(r.data_type as string);
}

// In convergence merge loop:
if (d.source_pattern && !validDataTypes.has(d.source_pattern)) {
  console.warn(`[Wire] Skipping derivation "${d.metric}" — source_pattern "${d.source_pattern}" has no matching committed_data`);
  skippedDerivations++;
  continue;
}
```

---

*"Mortgage $0 and Consumer Lending $0.32 both passed the row-count verification. They both fail the forensic trace."*
*"After HF-081: Mortgage $989,937 and Consumer Lending $6,540,774. The forensic trace now passes."*
