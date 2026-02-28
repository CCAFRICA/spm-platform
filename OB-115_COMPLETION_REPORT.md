# OB-115 COMPLETION REPORT
## Semantic Pipeline Fixes — Data Type + Input Bindings + Routing
## Date: 2026-02-27
## Target: alpha.3.0
## Branch: dev

---

### CLT-113 Findings Addressed

| Finding | Root Cause | Fix Applied | Verified |
|---|---|---|---|
| T-15: CSV data_type "Sheet1" | import/commit/route.ts:581 uses XLSX.js sheet name | resolveDataType(): AI matchedComponent > classification:filename > filename stem > sheet name | grep shows new logic at line 600 |
| T-14: input_bindings NULL/empty | plan/import/route.ts:77 sets `{}` always | Migration: Mortgage→LoanAmount, Deposit→TotalDepositBalance. TODO Decision 64 for future. | DB query shows POPULATED for 2 plans |
| T-01: Sabor routing to import | Sabor has 2 active ICM rule sets → hasICM=true | Archived both ICM rule sets | DB query shows 0 active |
| T-16: findMatchingSheet fails | "Sheet1" can't match components | Fixed by T-15 — new imports get AI classification as data_type | Code analysis confirms |

### PDR Resolutions

| PDR | Status |
|---|---|
| PDR-02 (Sabor routing) | RESOLVED — financial-only via archived ICM rule sets. ruleSetCount=0 → hasICM=false → /financial |

### Proof Gate Results

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-01 | data_type no longer uses Sheet1 for CSVs | **PASS** | `resolveDataType(sheet.sheetName)` at line 600 |
| PG-02 | AI classification or filename used | **PASS** | `aiSheet.matchedComponent` → `classification:filename` → filename stem |
| PG-03 | Fallback chain documented | **PASS** | Comment: "Priority: 1) AI matchedComponent 2) AI classification + filename 3) filename (no ext) 4) sheet name" |
| PG-04 | Build clean after Phase 1 | **PASS** | npm run build exits 0 |
| PG-05 | Component metrics documented from DB | **PASS** | quarterly_mortgage_origination_volume, deposit_growth_attainment, NONE (Consumer), "unknown" (Insurance) |
| PG-06 | input_bindings populated where determinable | **PASS** | Mortgage + Deposit populated, Consumer + Insurance left empty |
| PG-07 | Correct metric → field mapping | **PASS** | quarterly_mortgage_origination_volume→LoanAmount (sum), deposit_growth_attainment→TotalDepositBalance (max_minus_min) |
| PG-08 | Unclear mappings documented, not guessed | **PASS** | Consumer Lending (no metrics), Insurance (all "unknown") — documented in commit message |
| PG-09 | TODO comment for Decision 64 | **PASS** | plan/import/route.ts:77 |
| PG-10 | Build clean after Phase 2 | **PASS** | npm run build exits 0 |
| PG-11 | Sabor rule sets archived | **PASS** | Comision por Ventas + Indice de Desempeno → archived |
| PG-12 | Zero active Sabor rule sets | **PASS** | count = 0 |
| PG-13 | Dev server responds | **PASS** | 307 (redirect to auth) |
| PG-14 | MBC plan + bindings state | **PASS** | 4 active plans, 2 with bindings, 2 empty |
| PG-15 | Sabor active count = 0 | **PASS** | Verified via DB query |
| PG-16 | No Sheet1 hardcoded in commit | **PASS** | Only appears in fallback detection, never as assignment |
| PG-17 | Final build clean | **PASS** | npm run build exits 0 |

### Files Modified

| # | File | Change |
|---|------|--------|
| 1 | `web/src/app/api/import/commit/route.ts` | +21/-2 — resolveDataType() function, AI classification priority chain |
| 2 | `web/src/app/api/plan/import/route.ts` | +3/-0 — TODO Decision 64 comment |

### Data Changes

| Change | Target | Effect |
|--------|--------|--------|
| Mortgage Origination Bonus input_bindings | `af511146...` | `quarterly_mortgage_origination_volume → LoanAmount (sum)` |
| Deposit Growth Incentive input_bindings | `ecc2507b...` | `deposit_growth_attainment → TotalDepositBalance (max_minus_min)` |
| Archive Sabor ICM rule sets | `10000000-0001...` | 2 rule sets → archived. ruleSetCount = 0 → financial-only routing |

### Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 6ee8043 | OB-115: Semantic pipeline fixes prompt |
| 2 | 6efba2c | OB-115 Phase 0: Architecture decision — semantic pipeline diagnostic |
| 3 | fdfbc63 | OB-115 Phase 1: Tag committed_data with AI classification, not XLSX.js sheet name |
| 4 | bbcda72 | OB-115 Phase 2: Populate input_bindings for MBC rule sets |
| 5 | 201234f | OB-115 Phase 3: Archive Sabor ICM rule sets — financial-only routing |
| 6 | 7d38260 | OB-115 Phase 4: System-verified acceptance test |

### What's NOT Fixed (Requires Design Session)

| Item | Why |
|---|---|
| T-13: Full semantic binding | Architectural — metric name resolution between plan concepts and data fields needs Decision 64 |
| Existing committed_data | Already committed with "Sheet1" — would need re-import to get new data_type |
| Consumer Lending Commission bindings | Components have no metric names defined — AI plan interpretation needs to produce metrics |
| Insurance Referral bindings | All metrics "unknown" — same AI plan interpretation gap |
| Future plan imports generating bindings | Needs AI to produce bindings during plan interpretation (Decision 64 TODO added) |

### Release Context
Target: alpha.3.0
CLT verification: CLT-115

---

*Vialuce.ai — Intelligence. Acceleration. Performance.*
*OB-115: "Layer 1: the engine can distinguish the data. Layer 2: the engine knows what it needs."*
