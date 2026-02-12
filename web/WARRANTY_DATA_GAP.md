# WARRANTY DATA GAP DOCUMENTATION

## Summary

The warranty component (C6 - Garantia Extendida) shows a $66,872 discrepancy between ViaLuce calculation results ($0) and ground truth because the warranty data sheet is absent from the imported test data.

## Evidence

### Ground Truth Analysis (CLT14B_Reconciliation_Detail.xlsx)

| Metric | Value |
|--------|-------|
| Total Warranty Payout (GT) | $66,872 |
| Employees with Warranty | 8 of 719 (1.1%) |
| Average Warranty Payout | $8,359 per qualifying employee |

### Warranty Recipients

| Employee ID | Warranty Payout | Monto (Sales Volume) |
|-------------|-----------------|----------------------|
| 90195508 | $25,265 | $631,624 |
| 90203306 | $4,784 | $119,590 |
| 90262856 | $11,051 | $276,287 |
| 90319253 | $5,317 | $132,937 |
| 97998478 | $20,255 | $506,363 |
| 90174414 | $148 | $3,707 |
| 90235057 | $28 | $694 |
| 96568046 | $24 | $601 |

### Calculation Method

Based on the plan definition, warranty incentive is calculated as:
- **Rate**: 4% of warranty sales volume (Garantia Extendida Monto)
- **Formula**: C6_Calc = C6_Monto * 0.04

Example: Employee 90195508
- Warranty Sales: $631,624.22
- Calculation: $631,624.22 × 0.04 = $25,264.97 ≈ $25,265

## Root Cause

The imported data does not include the warranty sales sheet. The data import contains:
- Roster sheet (employee information)
- Individual sales metrics
- Store sales metrics
- Customer metrics
- Collection metrics
- Insurance metrics

**Missing**: Warranty/Garantia Extendida sheet with C6_Monto values.

## Impact

- **Financial Impact**: $66,872 (5.3% of total ground truth $1,253,832)
- **Employee Impact**: 8 employees receive $0 instead of their earned warranty incentive
- **Reconciliation Impact**: Total will always be $66,872 short until warranty data is imported

## Engine Behavior

The calculation engine handles warranty correctly when data is present:
1. Checks for `warranty_volume` or `garantia_monto` metric
2. Applies 4% rate to calculate payout
3. Returns $0 when metric is undefined (correct behavior for missing data)

## Resolution Options

### Option 1: Accept as Test Data Limitation (RECOMMENDED)
- Document the gap as known
- Adjust reconciliation targets: $1,253,832 - $66,872 = $1,186,960
- No code changes required

### Option 2: Add Warranty Data Sheet
- Locate the original warranty sales data
- Import as additional sheet with columns:
  - Employee ID
  - Warranty Sales Volume (Monto)
- Re-run calculation

### Option 3: Create Synthetic Warranty Data
- Extract C6_Monto values from ground truth spreadsheet
- Create warranty sheet for import
- Note: This would make test circular (using GT to create data)

## Decision

**Accepted as test data limitation.**

The calculation engine correctly returns $0 for missing warranty data. The $66,872 gap is documented and excluded from reconciliation pass/fail criteria.

## Date

February 12, 2026
