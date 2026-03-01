# OB-126 COMPLETION REPORT
## LAB Recalculation + CC-UAT-06 Forensic Verification
## Date: 2026-03-01

---

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| a884494 | Phase 0 | Pre-recalculation state snapshot |
| f6e1fbc | Phase 1 | Delete stale LAB results (400 rows from 100-assignment era) |
| b16ecf7 | Phase 2 | Recalculate all LAB plans with 67 assignments |
| c254e5f | Phase 3 | CC-UAT-06 forensic trace — 8-layer verification |
| c11b014 | Phase 4 | CC-UAT-05 vs CC-UAT-06 delta analysis — 9/9 improvements confirmed |
| [this] | Phase 5 | Build clean + completion report |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/scripts/ob126-phase0-snapshot.ts` | **NEW** — Pre-recalculation state snapshot |
| `web/scripts/ob126-phase1-delete.ts` | **NEW** — Delete stale LAB results |
| `web/scripts/ob126-phase2-recalculate.ts` | **NEW** — Recalculate all LAB plans |
| `web/scripts/ob126-phase3-forensic.ts` | **NEW** — CC-UAT-06 8-layer forensic trace |
| `web/scripts/ob126-phase4-delta.ts` | **NEW** — CC-UAT-05 vs CC-UAT-06 delta analysis |

## DATABASE CHANGES
| Table | Change |
|-------|--------|
| `calculation_results` | Deleted 400 stale rows, recalculated 268 fresh rows (LAB only) |
| `calculation_batches` | Deleted 16 stale batches, created 16 fresh batches (LAB only) |
| `entity_period_outcomes` | Deleted 100 stale rows, created fresh rows (LAB only) |

## CODE CHANGES
None — this is a measurement OB. All scripts are operational tooling, not product code.

---

## WHAT WAS DONE

### Phase 0: Pre-Recalculation Snapshot
Captured LAB state before any changes:
- 25 entities, 67 assignments, 4 periods, 1588 committed data rows
- 400 stale calculation results (from pre-HF-082 100-assignment era)
- 4 active plans with convergence-generated input_bindings
- MBC baseline: 240 results, 80 assignments, $3,245,212.66

### Phase 1: Delete Stale Results
Deleted all LAB calculation artifacts from the 100-assignment era:
- 400 calculation_results → 0
- 16 calculation_batches → 0
- 100 entity_period_outcomes → 0

### Phase 2: Recalculate
Recalculated all 4 plans × 4 periods via `POST /api/calculation/run`:
- 16/16 calculations succeeded
- 268 fresh results produced (was 400 under full-coverage assignment)
- Breakdown: CL:100 + MO:56 + IR:64 + DG:48 = 268

### Phase 3: CC-UAT-06 Forensic Trace
8-layer verification:
- Layer 0: Tenant state — 25 entities, 67 assignments, 268 results
- Layer 1: Entity + license verification — 25/25 with licenses
- Layer 2: Assignment verification — no fallback, 0/25 mismatches
- Layer 3: Input bindings + convergence — all source_patterns match ✓
- Layer 4: Committed data — 1588 rows across 6 data types
- Layer 5: Calculation results per plan — all non-trivial
- Layer 6: Officer 1001 forensic trace — 4 plans, $473,275.07 total
- Layer 7: MBC regression — PASS ($3,245,212.66)
- Layer 8: Korean Test — PASS (0 domain vocabulary in engine)

### Phase 4: Delta Analysis
CC-UAT-05 → CC-UAT-06 comparison: **9/9 expected improvements confirmed**

---

## DELTA: CC-UAT-05 vs CC-UAT-06

### System-Level
| Metric | CC-UAT-05 | CC-UAT-06 | Delta | Fix |
|--------|-----------|-----------|-------|-----|
| Assignments | 100 | 67 | -33 | HF-082 license-based |
| Method | Full-coverage fallback | License-based | — | HF-082 |
| Results | 400 | 268 | -132 | Fewer assignments |
| Grand total | $1,806,615.48 | $9,337,311.77 | +$7,530,696.29 | HF-081 |

### Per-Plan
| Plan | UAT-05 | UAT-06 | Delta | Root Cause |
|------|--------|--------|-------|------------|
| Consumer Lending | $15.48 (100 results) | $6,540,774.36 (100 results) | +$6,540,758.88 | HF-081: count→sum |
| Mortgage Origination | $0.00 (100 results) | $989,937.41 (56 results) | +$989,937.41 | HF-081: source_pattern |
| Insurance Referral | $366,600.00 (100 results) | $366,600.00 (64 results) | $0.00 | Unchanged |
| Deposit Growth | $1,440,000.00 (100 results) | $1,440,000.00 (48 results) | $0.00 | Unchanged (Tab 2 pending) |

### Officer 1001
| Plan | UAT-05 | UAT-06 | Delta |
|------|--------|--------|-------|
| Consumer Lending | $0.62 | $251,739.04 | +$251,738.42 |
| Mortgage Origination | $0.00 | $76,186.03 | +$76,186.03 |
| Insurance Referral | $25,350.00 | $25,350.00 | $0.00 |
| Deposit Growth | $120,000.00 | $120,000.00 | $0.00 |
| **TOTAL** | $145,350.62 | $473,275.07 | +$327,924.45 |

### Findings Resolution
| Finding | Status | Fix | Evidence |
|---------|--------|-----|----------|
| F-01: Full-coverage fallback | **RESOLVED** | HF-082 | 100 → 67 assignments, fallback NOT DETECTED |
| F-02: Mortgage source_pattern | **RESOLVED** | HF-081 | $0 → $989,937.41 |
| F-03: Consumer Lending count→sum | **RESOLVED** | HF-081 | $15.48 → $6,540,774.36 |
| F-04: Deposit Growth uniform | **OPEN** | OB-124 ready | Still $30K/entity — Tab 2 targets not imported |

---

## PROOF GATES — HARD

### PG-01: npm run build exits 0
**PASS**
```
ƒ Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### PG-02: Phase 1 deletes all LAB results
**PASS**
```
Before: 400 results, 16 batches, 100 outcomes
After:  0 results, 0 batches, 0 outcomes
```

### PG-03: Phase 2 recalculates all plans × periods
**PASS**
```
16/16 calculations succeeded (4 plans × 4 periods)
268 results created
```

### PG-04: No code changes (measurement OB)
**PASS**
```
Only new files: web/scripts/ob126-phase{0,1,2,3,4}-*.ts
No product code modified.
```

### PG-05: LAB result count = 268 (CL:100 + MO:56 + IR:64 + DG:48)
**PASS**
```
Consumer Lending Commission Plan 2024: 100 results, 75 non-zero
Mortgage Origination Bonus Plan 2024: 56 results, 37 non-zero
CFG Insurance Referral Program 2024: 64 results, 46 non-zero
Deposit Growth Incentive — Q1 2024: 48 results, 48 non-zero
Total: 268
```

### PG-06: Grand total = $9,337,311.77
**PASS**
```
Consumer Lending: $6,540,774.36
Mortgage Origination: $989,937.41
Insurance Referral: $366,600.00
Deposit Growth: $1,440,000.00
Grand total: $9,337,311.77
```

### PG-07: Consumer Lending total rises from ~$15 to real dollars
**PASS**
```
UAT-05: $15.48 (count operation produced pennies)
UAT-06: $6,540,774.36 (sum operation produces real dollars)
Delta: +$6,540,758.88
Fix: HF-081 count→sum
```

### PG-08: Mortgage total rises from $0
**PASS**
```
UAT-05: $0.00 (source_pattern referenced unnormalized data type)
UAT-06: $989,937.41 (source_pattern matches committed_data)
Delta: +$989,937.41
Fix: HF-081 source_pattern normalization
```

### PG-09: Insurance Referral unchanged
**PASS**
```
UAT-05: $366,600.00
UAT-06: $366,600.00
Delta: $0.00
```

### PG-10: Deposit Growth unchanged (Tab 2 not re-imported)
**PASS**
```
UAT-05: $1,440,000.00
UAT-06: $1,440,000.00
Delta: $0.00
Still uniform $30K/entity — OB-124 infrastructure ready for Tab 2
```

### PG-11: Assignments = 67 (license-based, no fallback)
**PASS**
```
UAT-05: 100 (full-coverage fallback)
UAT-06: 67 (license-based)
Fallback: NOT DETECTED ✓
License↔assignment mismatches: 0/25
```

### PG-12: Officer 1001 trace shows improvement
**PASS**
```
Consumer Lending: $0.62 → $251,739.04 (+$251,738.42)
Mortgage: $0.00 → $76,186.03 (+$76,186.03)
Insurance: $25,350 → $25,350 (unchanged)
Deposit: $120,000 → $120,000 (unchanged)
Total: $145,350.62 → $473,275.07 (+$327,924.45)
```

### PG-13: MBC regression — no change
**PASS**
```
MBC results: 240 (expected 240) — PASS
MBC assignments: 80 (expected 80) — PASS
MBC total: $3,245,212.66 (expected $3,245,212.64 ± $0.10) — PASS
Delta: $0.02
```

### PG-14: Korean Test
**PASS**
```
Domain vocabulary in engine code: 0 matches
Engine is domain-agnostic — no hardcoded field names.
```

---

## PROOF GATES — SOFT

### SPG-01: All source_patterns match committed_data
**PASS**
```
Layer 3 verification: every derivation source_pattern has matching rows in committed_data.
No ⚠ NO DATA warnings.
```

### SPG-02: License distribution matches assignment distribution
**PASS**
```
License distribution: CL:25, DG:12, IR:16, MO:14
Assignment distribution: CL:25, DG:12, IR:16, MO:14
Mismatches: 0/25
```

### SPG-03: No full-coverage fallback detected
**PASS**
```
Assignment range per entity: 1-4 (variable, not uniform)
Full-coverage fallback: NOT DETECTED ✓
```

### SPG-04: Delta analysis shows 9/9 expected improvements
**PASS**
```
PASS: Consumer Lending total rises from ~$15 to real dollars ($15.48 → $6,540,774.36)
PASS: Mortgage total rises from $0 ($0 → $989,937.41)
PASS: Insurance Referral unchanged ($366,600 → $366,600)
PASS: Deposit Growth unchanged ($1,440,000 → $1,440,000)
PASS: Assignments reduced from 100 (100 → 67)
PASS: Results reduced from 400 (400 → 268)
PASS: Officer 1001 CL rises from pennies ($0.62 → $251,739.04)
PASS: Officer 1001 Mortgage rises from $0 ($0 → $76,186.03)
PASS: MBC regression — no change ($3,245,212.64 → $3,245,212.66, Δ$0.02)
IMPROVEMENTS: 9/9 confirmed
```

---

## STANDING RULE COMPLIANCE
| Rule | Criterion | PASS/FAIL |
|------|-----------|-----------|
| Rule 1 | Commit+push each phase | **PASS** — 5 commits pushed before report |
| Rule 2 | Cache clear after build | **PASS** — `rm -rf .next && npm run build` |
| Rule 5 | Report at PROJECT ROOT | **PASS** — `OB-126_COMPLETION_REPORT.md` |
| Rule 25 | Report created before final build | **PASS** |
| Rule 26 | Mandatory structure | **PASS** |
| Rule 27 | Evidence = paste code/output | **PASS** |
| Rule 28 | One commit per phase | **PASS** |

---

## KNOWN ISSUES
- **F-04: Deposit Growth uniform** — Still $30K per entity per period. OB-124 multi-tab XLSX infrastructure is ready, but Tab 2 (goal/target data) has not been re-imported into LAB. When re-imported, Deposit Growth should produce variable payouts.
- **MBC rounding** — $0.02 delta from UAT-05 baseline ($3,245,212.64 vs $3,245,212.66). Within tolerance, likely floating-point accumulation.

---

## BEFORE/AFTER COMPARISON
| Metric | Before OB-126 (stale) | After OB-126 (fresh) |
|--------|----------------------|---------------------|
| Results source | 100-assignment era (pre-HF-082) | 67-assignment era (post-HF-082) |
| Result count | 400 | 268 |
| Assignment method | Full-coverage fallback | License-based |
| Consumer Lending | $15.48 (count bug) | $6,540,774.36 (sum) |
| Mortgage | $0.00 (source_pattern bug) | $989,937.41 |
| Insurance Referral | $366,600.00 | $366,600.00 |
| Deposit Growth | $1,440,000.00 | $1,440,000.00 |
| Grand total | $1,806,615.48 (UAT-05 baseline) | $9,337,311.77 |
| Improvement | — | +$7,530,696.29 (+416.8%) |

---

*"The engine always worked. We fixed what it was told — count→sum, source_pattern match, license-based assignments — and $7.5M in real compensation appeared."*
