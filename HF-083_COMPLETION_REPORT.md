# HF-083 COMPLETION REPORT
## DG Junk Data Cleanup + Isolated Recalculation
## Date: 2026-03-01

---

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| 3d1ccc1 | Phase 0 | DG junk data diagnostic — 17 junk rows identified, 12 targets intact |
| 6f39a21 | Phase 1 | Delete 17 junk rows — 0 __EMPTY remaining, 12 targets preserved |
| 1c6a06c | Phase 2 | Isolated DG recalculation — 48 results, uniform $30K, F-04 still OPEN |
| c2401d4 | Phase 3 | Regression check — CL/MO/IR untouched, MBC PASS, all green |
| [this] | Phase 4 | Build clean + completion report |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/scripts/hf083-phase0-diagnostic.ts` | **NEW** — Diagnostic identifying junk vs target data |
| `web/scripts/hf083-phase1-cleanup.ts` | **NEW** — Delete 17 junk rows, verify 12 targets preserved |
| `web/scripts/hf083-phase2-recalculate.ts` | **NEW** — Isolated DG recalculation, F-04 analysis |
| `web/scripts/hf083-phase3-regression.ts` | **NEW** — Regression check for CL/MO/IR/MBC |

## DATABASE CHANGES
| Table | Change |
|-------|--------|
| `committed_data` | Deleted 17 junk rows (data_type: `reference:CFG_Deposit_Growth_Incentive_Q1_2024`) |
| `calculation_results` | Deleted 48 stale DG results, recalculated 48 fresh DG results |
| `calculation_batches` | Deleted 4 stale DG batches, created 4 fresh DG batches |

## CODE CHANGES
None — scripts only. No product code modified.

---

## DIAGNOSTIC FINDINGS

### Import Batch
- **Batch ID:** `cc7be949` (not `eae63444` — CLT-126 reference was internal session ID)
- **File:** `CFG_Deposit_Growth_Incentive_Q1_2024.xlsx`
- **Date:** 2026-03-01T14:53:12

### Data Committed
| Data Type | Rows | Source | Status |
|-----------|------|--------|--------|
| `reference:CFG_Deposit_Growth_Incentive_Q1_2024` | 17 | Tab 1 (Plan Rules) | **JUNK** — plan rules parsed as data rows with `__EMPTY` fields |
| `component_data:CFG_Deposit_Growth_Incentive_Q1_2024` | 12 | Tab 2 (Growth Targets) | **LEGITIMATE** — per-entity target data |

### Junk Row Characteristics
- `__EMPTY`, `__EMPTY_1`, `__EMPTY_2` field names (unnamed XLSX columns)
- Content: "CARIBE FINANCIAL GROUP", "Deposit Growth Incentive", "ATTAINMENT TIERS", "Below Threshold", "No bonus earned"
- `_sheetName: "Plan Rules"` — Tab 1 plan configuration parsed as data rows

### Target Data (Preserved)
- 12 rows with entity-specific target amounts
- `_sheetName: "Growth Targets"` — Tab 2 per-entity targets

---

## F-04 ANALYSIS: DEPOSIT GROWTH UNIFORM PAYOUTS

**STATUS: OPEN — Engine wiring gap**

### Current DG Derivation
```
deposit_growth_attainment → sum on deposit_balances .amount
```

The DG plan has only 1 derivation, referencing `deposit_balances` (existing transaction data). The new target data type `component_data:CFG_Deposit_Growth_Incentive_Q1_2024` is **NOT referenced by any derivation**. The engine cannot see the targets.

### Root Cause
The convergence service generated the DG derivation against the data that existed at wiring time (OB-123). At that point, only `deposit_balances` existed. The new Tab 2 target data was imported later (CLT-126) but convergence was never re-run to generate a new derivation.

### What's Needed (future OB)
1. Normalize the data_type: `component_data:CFG_Deposit_Growth_Incentive_Q1_2024` → `deposit_growth_targets` (or similar)
2. Re-run convergence for the DG plan to generate a new derivation referencing the target data
3. The engine needs the target amount per entity to compute attainment = actual / target → tier lookup → payout

### Evidence
```
Pre-recalculation:  48 results, $1,440,000.00, uniform $30,000/entity
Post-recalculation: 48 results, $1,440,000.00, uniform $30,000/entity
Delta: $0.00
```

---

## PROOF GATES

### PG-01: Junk data removed
**PASS**
```
Junk rows (reference:CFG_Deposit_Growth_Incentive_Q1_2024): 0
__EMPTY scan: 0 rows with __EMPTY fields
```

### PG-02: Target data preserved
**PASS**
```
Target rows (component_data:CFG_Deposit_Growth_Incentive_Q1_2024): 12
```

### PG-03: DG recalculated
**PASS**
```
4/4 periods recalculated successfully
48 DG results (12 entities × 4 periods)
```

### PG-04: DG payout analysis
**DOCUMENTED**
```
Payouts: uniform $30,000.00 per entity per period
Reason: Engine derivation references deposit_balances only, not target data
F-04 STATUS: OPEN — requires convergence re-run + data_type normalization
```

### PG-05: CL unchanged
**PASS**
```
Consumer Lending: 100 results, $6,540,774.36 (expected 100, $6,540,774.36)
```

### PG-06: Mortgage unchanged
**PASS**
```
Mortgage Origination: 56 results, $989,937.41 (expected 56, $989,937.41)
```

### PG-07: IR unchanged
**PASS**
```
Insurance Referral: 64 results, $366,600.00 (expected 64, $366,600.00)
```

### PG-08: MBC regression
**PASS**
```
MBC results: 240 (expected 240)
MBC assignments: 80 (expected 80)
MBC total: $3,245,212.66 (expected $3,245,212.64 ± $0.10)
Delta: $0.02
```

### PG-09: No product code changes
**PASS**
```
Only new files: web/scripts/hf083-phase{0,1,2,3}-*.ts
No product code modified.
```

### PG-10: Build clean
**PASS**
```
ƒ Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## STANDING RULE COMPLIANCE
| Rule | Criterion | PASS/FAIL |
|------|-----------|-----------|
| Rule 1 | Commit+push each phase | **PASS** — 4 commits pushed before report |
| Rule 2 | Cache clear after build | **PASS** — `rm -rf .next && npm run build` |
| Rule 5 | Report at PROJECT ROOT | **PASS** — `HF-083_COMPLETION_REPORT.md` |
| Rule 25 | DELETE before INSERT | **PASS** — DG results deleted before recalculation |
| Rule 27 | Evidence = paste code/output | **PASS** |
| Rule 28 | One commit per phase | **PASS** |

---

## DATA STATE AFTER HF-083

| Metric | Before HF-083 | After HF-083 |
|--------|---------------|-------------|
| Total committed_data | 1617 (1588 + 29 import) | 1600 (1588 + 12 targets) |
| Junk rows | 17 | 0 |
| Target rows | 12 | 12 |
| DG results | 48, $1,440,000 uniform | 48, $1,440,000 uniform |
| CL results | 100, $6,540,774.36 | 100, $6,540,774.36 (unchanged) |
| MO results | 56, $989,937.41 | 56, $989,937.41 (unchanged) |
| IR results | 64, $366,600.00 | 64, $366,600.00 (unchanged) |
| Grand total | $9,337,311.77 | $9,337,311.77 (unchanged) |
| MBC total | $3,245,212.66 | $3,245,212.66 (unchanged) |

---

*"The target data is in the building. It's just not connected to the elevator yet. Clean the junk, measure the gap, wire it next."*
