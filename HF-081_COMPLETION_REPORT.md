# HF-081 COMPLETION REPORT
## LAB Calculation Accuracy — Mortgage Source Pattern + Consumer Lending Derivation Fix
## Date: 2026-02-28

---

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| 350c299 | Phase 0 | Diagnostic — current LAB state before fixes |
| ffb7a71 | Phase 1+2 | Fix Mortgage source_pattern + Consumer Lending derivation |
| 57a6221 | Phase 3 | Convergence source_pattern validation — prevent race condition |
| 0adc31a | Phase 4 | Re-run LAB calculation with fixed derivations |
| 562b5fd | Phase 5 | CC-UAT verification trace — Layers 2, 5, 6 |
| 2bd660e | Phase 6 | Prior report (wrong filename) |
| [this] | Phase 6b | This completion report (corrected) |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/intelligence/wire/route.ts` | Added source_pattern validation gate in Step 5 (convergence). Lines 327-370. |

## DATABASE CHANGES
| Table | Change |
|-------|--------|
| rule_sets (LAB Mortgage `6a142ac3`) | `input_bindings.metric_derivations[0].source_pattern`: `component_data:CFG_Mortgage_Closings_Q1_2024` → `mortgage_closings` |
| rule_sets (LAB Consumer Lending `e2edd6c9`) | `input_bindings.metric_derivations[*].operation`: `count` → `sum`; added `source_field: "LoanAmount"` to all 3 derivations |
| calculation_results (LAB) | Deleted 400 old results, re-calculated 400 new results |
| calculation_batches (LAB) | Deleted and recreated during recalculation |
| entity_period_outcomes (LAB) | Deleted during recalculation |

---

## PROOF GATES — HARD

### PG-01: npm run build exits 0
**PASS**
```
Build completed with no errors. Output:
ƒ Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### PG-02: Mortgage source_pattern references normalized data_type
**PASS**
```
Mortgage Origination Bonus Plan 2024:
  metric: quarterly_mortgage_origination_volume
    source_pattern: mortgage_closings PASS
    operation: sum
    source_field: amount
```

### PG-03: Consumer Lending derivation uses sum, not count
**PASS**
```
Consumer Lending Commission Plan 2024:
  metric: personal_loan_disbursements
    source_pattern: loan_disbursements PASS
    operation: sum
    source_field: LoanAmount
  metric: auto_loan_disbursements
    source_pattern: loan_disbursements PASS
    operation: sum
    source_field: LoanAmount
  metric: payroll_loan_disbursements
    source_pattern: loan_disbursements PASS
    operation: sum
    source_field: LoanAmount
```

### PG-04: Consumer Lending source_field references actual amount column
**PASS**
```
source_field: LoanAmount

Confirmed from committed_data sample:
  "LoanAmount":41515.4  (matches row_data field name exactly)
```

### PG-05: Mortgage results > $0 (at least 1 non-zero entity)
**PASS**
```
Mortgage Origination Bonus Plan 2024:
  Results: 100 | Non-zero: 37 | Total: $989937.41
  Range: [$0.00, $106522.95]
```

### PG-06: Consumer Lending max payout > $100 (realistic dollar amounts)
**PASS**
```
Consumer Lending Commission Plan 2024:
  Results: 100 | Non-zero: 75 | Total: $6540774.36
  Range: [$0.00, $153878.92]
```

### PG-07: Insurance Referral results unchanged or improved (was $366,600)
**PASS**
```
CFG Insurance Referral Program 2024:
  Results: 100 | Non-zero: 46 | Total: $366600.00
  Range: [$0.00, $15600.00]
```

### PG-08: MBC grand total = $3,245,212.64 +/- $0.10
**PASS**
```
MBC tenant: Mexican Bank Co fa6a48c5-56dc-416d-9b7d-9c93d4882251
Grand total:  $3245212.66
Expected:     $3245212.64
Delta:        $0.02
Row count:    240
VERDICT:      PASS
```

### PG-09: MBC row count = 240
**PASS**
```
Row count:    240
```

### PG-10: No auth files modified by HF-081
**PASS**
```
$ git log --oneline --diff-filter=M -- web/src/middleware.ts web/src/components/layout/auth-shell.tsx | head -5
783a0e7 OB-123: Fix wire API middleware auth + data_type normalization
a01fa6d HF-080: Fix Create New Tenant button — add route to tenant-exempt list

(middleware.ts and auth-shell.tsx modified by OB-123 and HF-080, not HF-081)
HF-081 only modified: web/src/app/api/intelligence/wire/route.ts
```

---

## PROOF GATES — SOFT

### PG-S1: Officer 1001 has non-zero Mortgage payout
**PASS**
```
  Mortgage Origination Bonus Plan 2024 | January 2024: $20214.90
  Mortgage Origination Bonus Plan 2024 | February 2024: $36159.66
  Mortgage Origination Bonus Plan 2024 | March 2024: $19811.47
  Mortgage Origination Bonus Plan 2024 | December 2023: $0.00
```

### PG-S2: Officer 1001 Consumer Lending payout > $100
**PASS**
```
  Consumer Lending Commission Plan 2024 | January 2024: $36538.66
  Consumer Lending Commission Plan 2024 | February 2024: $127070.23
  Consumer Lending Commission Plan 2024 | March 2024: $88130.15
  Consumer Lending Commission Plan 2024 | December 2023: $0.00
```

### PG-S3: Convergence validation prevents future race conditions
**PASS**
```typescript
// wire/route.ts lines 327-370:

// HF-081: Validation gate — get actual data_types AFTER normalization completes
// This prevents the race condition where convergence writes source_patterns
// referencing pre-normalization data_types (e.g. component_data:CFG_...)

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

// In merge loop:
// HF-081: Validate source_pattern references an actual data_type
if (d.source_pattern && !validDataTypes.has(d.source_pattern)) {
  console.warn(`[Wire]   Skipping derivation "${d.metric}" — source_pattern "${d.source_pattern}" has no matching committed_data`);
  skippedDerivations++;
  continue;
}
```

### PG-S4: No domain vocabulary in new code (Korean Test)
**PASS**
```
$ grep -in 'commission\|mortgage\|loan\|insurance\|deposit\|referral\|lending\|disbursement' web/src/app/api/intelligence/wire/route.ts
0 matches — PASS
```

---

## STANDING RULE COMPLIANCE
| Rule | Criterion | PASS/FAIL |
|------|-----------|-----------|
| Rule 1 | Commit+push each phase | **PASS** — 6 commits pushed before report |
| Rule 2 | Cache clear after build | **PASS** — `rm -rf .next && npm run build` |
| Rule 5 | Report at PROJECT ROOT | **PASS** — `HF-081_COMPLETION_REPORT.md` |
| Rule 25 | Report created before final build | **PASS** |
| Rule 26 | Mandatory structure: Commits, Files, Hard Gates, Soft Gates, Compliance, Issues | **PASS** |
| Rule 27 | Evidence = paste code/output | **PASS** — all gates include pasted terminal output |
| Rule 28 | One commit per phase | **PASS** — Phase 0, 1+2, 3, 4, 5, 6 |

---

## KNOWN ISSUES
- **F-01** (full-coverage fallback): NOT ADDRESSED — all 25 entities assigned to all 4 plans. Separate fix, lower priority.
- **F-04** (Deposit Growth uniform): NOT ADDRESSED — $30K/entity/period. Requires Decision 72 multi-tab XLSX.
- **F-65** (Tab 2 targets): NOT ADDRESSED — requires separate OB.
- **Insurance `unknown` metric**: Derivation with `metric: "unknown"` exists in Insurance plan but does not break calculation. Low priority cleanup.

---

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

---

*"Mortgage $0 and Consumer Lending $0.32 both passed the row-count verification. They both fail the forensic trace."*
*"After HF-081: Mortgage $989,937 and Consumer Lending $6,540,774. The forensic trace now passes."*
