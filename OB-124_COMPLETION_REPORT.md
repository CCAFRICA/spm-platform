# OB-124 COMPLETION REPORT
## DATA INTELLIGENCE — Multi-Tab XLSX + File Processing Fix
## Date: 2026-02-28

---

## COMMITS (in order)
| Hash | Phase | Description |
|------|-------|-------------|
| 7e093f8 | Prompt | Commit prompt per Standing Rule 15 |
| 7471176 | Phase 0 | Architecture-level diagnostic — file processing pipeline trace |
| 56d6762 | Phase 1 | Fix resolveDataType — multi-tab XLSX gets distinct data_type per sheet |
| 74e24a4 | Phase 2 | Verification — all 8 tests PASS |
| [this] | Phase 3 | Completion report + PR |

## FILES MODIFIED
| File | Change |
|------|--------|
| `web/src/app/api/import/commit/route.ts` | OB-124: Multi-tab data_type resolution in `resolveDataType()` (lines 768-784) |

## DATABASE CHANGES
None — code-only change. No data modified.

---

## ROOT CAUSE ANALYSIS

### Problem
Multi-tab XLSX files had ALL tabs assigned the SAME `data_type` in `committed_data`. For example, a file `CFG_Deposit_Growth_Q1_2024.xlsx` with Tab 1 "Account Balances" and Tab 2 "Growth Targets" would store ALL rows as `data_type = "deposit_growth"`. The convergence layer couldn't distinguish actuals from targets.

### Location
`web/src/app/api/import/commit/route.ts:757-779` — `resolveDataType()` function.

Priority 3 in the resolution chain used `normalizeFileNameToDataType(fileName)`, which normalizes the FILE name. This always succeeds for real files, so the sheet name fallback (Priority 4) was never reached. ALL tabs got the same data_type.

### Fix
When `sheetData.length > 1` (multi-tab workbook), append the normalized sheet name to the data_type using `__` separator:
- `deposit_growth__account_balances` (Tab 1)
- `deposit_growth__growth_targets` (Tab 2)

Single-sheet files (CSV, single-tab XLSX) keep existing filename-based behavior unchanged.

```typescript
// OB-124: For multi-tab workbooks, append normalized sheet name so each tab
// gets a DISTINCT data_type.
if (sheetData.length > 1) {
  const isGenericSheet = sheetName === 'Sheet1' || sheetName === 'Hoja1';
  if (!isGenericSheet) {
    const normalizedSheet = sheetName.toLowerCase().replace(/[\s\-]+/g, '_');
    return `${normalized}__${normalizedSheet}`;
  }
}
return normalized;
```

### Convergence Compatibility
The `tokenize()` function in `convergence-service.ts` splits on non-alphanumeric characters, so `deposit_growth__growth_targets` tokenizes to `["deposit", "growth", "growth", "targets"]`. Token overlap matching works correctly:
- Component "Deposit Growth" → matches `deposit_growth__account_balances` (100%)
- Component "Deposit Growth Target" → matches `deposit_growth__growth_targets` (100%)

---

## PROOF GATES — HARD

### PG-01: npm run build exits 0
**PASS**
```
ƒ Middleware                                  75 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### PG-02: Single-sheet CSV backward compatibility
**PASS**
```
PASS CFG_Loan_Disbursements_Jan2024.csv → loan_disbursements
PASS CFG_Mortgage_Closings_Q1_2024.csv → mortgage_closings
PASS CFG_Deposit_Balances_Feb2024.csv → deposit_balances
PASS CFG_Insurance_Referrals_Mar2024.csv → insurance_referrals
```

### PG-03: Multi-tab XLSX produces distinct data_types per tab
**PASS**
```
PASS CFG_Deposit_Growth_Q1_2024.xlsx [Account Balances] → deposit_growth__account_balances
PASS CFG_Deposit_Growth_Q1_2024.xlsx [Growth Targets] → deposit_growth__growth_targets
PASS CFG_Deposit_Growth_Q1_2024.xlsx [Sheet1] → deposit_growth
PASS Performance_Data.xlsx [Mortgage] → performance_data__mortgage
PASS Performance_Data.xlsx [Consumer Lending] → performance_data__consumer_lending
PASS Performance_Data.xlsx [Insurance] → performance_data__insurance
```

### PG-04: Tokenize handles __ separator
**PASS**
```
PASS tokenize("deposit_growth__growth_targets") → [deposit, growth, growth, targets]
PASS tokenize("deposit_growth__account_balances") → [deposit, growth, account, balances]
PASS tokenize("loan_disbursements") → [loan, disbursements]
```

### PG-05: MBC grand total = $3,245,212.64 +/- $0.10
**PASS**
```
Grand total:  $3245212.66
Expected:     $3245212.64
Delta:        $0.02
Row count:    240 (expected: 240)
VERDICT:      PASS
```

### PG-06: LAB data_types unchanged
**PASS**
```
PASS data_type "deposit_balances" present
PASS data_type "insurance_referrals" present
PASS data_type "loan_defaults" present
PASS data_type "loan_disbursements" present
PASS data_type "mortgage_closings" present
Total data_types: 6
All expected types present: PASS
```

### PG-07: LAB calculation results unchanged
**PASS**
```
Grand total:  $9337311.77
Expected:     $9337311.77 (from HF-081)
Delta:        $0.00
Row count:    400 (expected: 400)
VERDICT:      PASS
```

### PG-08: No auth files modified
**PASS**
```
$ git log --oneline 7e093f8..HEAD --diff-filter=M -- web/src/middleware.ts web/src/components/layout/auth-shell.tsx
(empty — no auth files touched)
Only modified: web/src/app/api/import/commit/route.ts (+15 lines)
```

---

## PROOF GATES — SOFT

### PG-S1: Token overlap matching correctly routes multi-tab data
**PASS**
```
Component "Deposit Growth" → best match: "deposit_growth__account_balances" (score: 100%)
Component "Deposit Growth Target" → best match: "deposit_growth__growth_targets" (score: 100%)
Component "Mortgage Origination" → best match: "mortgage_closings" (score: 50%)
```

### PG-S2: No domain vocabulary in new code (Korean Test)
**PASS**
```
New code references sheetName, normalizedSheet, isGenericSheet only.
No hardcoded field names, plan names, or domain-specific vocabulary.
```

### PG-S3: Multi-sheet UI already renders all tabs
**PASS**
```
enhanced/page.tsx renders all sheets in categorized cards:
- Component Data sheets: .filter(s => s.classification === 'component_data').map()
- Roster sheets: .filter(s => s.classification === 'roster').map()
- Reference sheets: .filter(s => s.classification === 'reference').map()
- Each sheet gets its own card + mapping step navigation tab
```

---

## STANDING RULE COMPLIANCE
| Rule | Criterion | PASS/FAIL |
|------|-----------|-----------|
| Rule 1 | Commit+push each phase | **PASS** — 3 commits pushed before report |
| Rule 2 | Cache clear after build | **PASS** — `rm -rf .next && npm run build` |
| Rule 5 | Report at PROJECT ROOT | **PASS** — `OB-124_COMPLETION_REPORT.md` |
| Rule 25 | Report created before final build | **PASS** |
| Rule 26 | Mandatory structure: Commits, Files, Hard Gates, Soft Gates, Compliance, Issues | **PASS** |
| Rule 27 | Evidence = paste code/output | **PASS** — all gates include pasted terminal output |
| Rule 28 | One commit per phase | **PASS** — Phase 0, 1, 2, 3 |

---

## KNOWN ISSUES
- **F-01** (full-coverage fallback): NOT ADDRESSED — all 25 entities assigned to all 4 plans. Separate fix, lower priority.
- **F-04** (Deposit Growth uniform $30K): PARTIALLY ADDRESSED — `resolveDataType()` now produces distinct data_types per tab. To fully resolve, LAB needs re-import with multi-tab XLSX file containing Tab 2 targets.
- **F-65** (Tab 2 targets): INFRASTRUCTURE FIX APPLIED — multi-tab XLSX files will now produce separate data_types per tab. Actual targets data needs to be re-imported.

---

## ARCHITECTURE TRACE

### Before OB-124
```
CFG_Deposit_Growth_Q1_2024.xlsx
  Tab 1 "Account Balances" → data_type = "deposit_growth"
  Tab 2 "Growth Targets"   → data_type = "deposit_growth"  ← COLLISION
```
Convergence sees ONE data_type for both tabs. Cannot generate separate derivations for actuals vs targets.

### After OB-124
```
CFG_Deposit_Growth_Q1_2024.xlsx
  Tab 1 "Account Balances" → data_type = "deposit_growth__account_balances"
  Tab 2 "Growth Targets"   → data_type = "deposit_growth__growth_targets"
```
Convergence sees TWO data_types. Can match "Deposit Growth" component → actuals, "Deposit Growth Target" component → targets.

---

*"The platform treated every upload as a single-sheet entity. After OB-124, every tab is an independent content unit with its own data_type."*
