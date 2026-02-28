# OB-119 Completion Report: Data Intelligence — Automated Import Pipeline

**Date**: 2026-02-28
**Branch**: `dev`
**PR**: [#131](https://github.com/CCAFRICA/spm-platform/pull/131)
**Status**: Complete — all 6 proof gates pass

---

## 1. Problem Statement

CLT-118's clean pipeline test identified six gaps between "data exists in storage" and "engine can calculate payouts." After importing 8 MBC (Mundo Bancario Caribe) files through the standard pipeline, the calculation engine produced **$0 out of expected $7.4M**. Root causes: no entity linkage, no period detection, no semantic data_type assignment, no input_bindings connecting plans to data, and no sum operation in the metric derivation engine.

## 2. Solution: Three-Tier Resolution Chain

Architecture decision: **Option A — Call AI field mapping at commit time** with a deterministic fallback chain.

| Tier | Name | Mechanism | Weight in Testing |
|------|------|-----------|-------------------|
| 1 | AI-Primary | `aiService.suggestImportFieldMappings()` at commit time | 0% (confidence=0 for all files) |
| 2 | Deterministic Tier 2 | Value matching, serial date analysis, header analysis, statistical inference | 100% |
| 3 | Header Fallback | `ENTITY_ID_TARGETS` / `DATE_TARGETS` / `AMOUNT_TARGETS` header matching | Supplement |

**Korean Test compliant**: Zero hardcoded field names in Tier 2. Entity detection uses value matching against existing entities. Amount detection uses statistical analysis (numeric avg > 100). Roster detection uses structural header patterns.

## 3. Phases Delivered

### Phase 0: Diagnostic (`3069174`)
Complete import pipeline trace identifying all six gaps.

### Phase 1: AI-Driven Entity Resolution (`b8ac189`)
- Step 4.5: Calls `aiService.suggestImportFieldMappings()` at commit time
- Injects high-confidence (≥70%) field mappings into `sheet.mappings`
- Downstream code picks up entity_id/date mappings automatically

### Phase 2: AI-Driven Period Detection (`28de5c5`)
- Tier 2 date column detection scans values for Excel serial dates (43831–47848)
- Verifies 2-year clustering before accepting a column as date
- Converts serial dates to ISO format for period creation

### Phase 3: Semantic data_type (`4a444a9`)
- `normalizeFileNameToDataType()` strips date suffixes/prefixes
- `CFG_Loan_Disbursements_Jan2024` → `loan_disbursements`
- Matches against `SHEET_COMPONENT_PATTERNS` for semantic assignment

### Phase 4: input_bindings Auto-Population (`34be374`)
- Matches plan components to data_types via `SHEET_COMPONENT_PATTERNS`
- Finds primary value field per component
- Generates `MetricDerivationRule`-compatible derivations
- Output format: `{metric, operation, source_pattern, source_field, filters}`

### Phase 5: Tier 2 Intelligence (`534108e`)
Five sub-fixes in a single commit:

1. **Value-based entity detection** (Step 6.5): Loads existing entities from DB, samples column values, checks overlap ≥50% with entity `external_id`s
2. **Roster detection**: Header analysis — entity_id + name + role/status columns, no amount column → marks as roster sheet
3. **Amount field inference**: Numeric column avg > 100, excludes serial date range (43000–48000) and entity ID columns
4. **MetricDerivationRule extended**: Added `sum` operation + `source_field` alongside existing `count` + `filters`
5. **component.enabled fix**: `!component.enabled` with `undefined` → `true` → skipped ALL components. Changed to `component.enabled === false`

## 4. Proof Gates

| # | Metric | Result | Target | Status |
|---|--------|--------|--------|--------|
| 1 | Entity linkage | **100.0%** (1588/1588 rows) | >90% | PASS |
| 2 | Period linkage | **98.4%** (1563/1588 rows) | >90% | PASS |
| 3 | Semantic data_types | **4** (loan_disbursements, deposit_balances, insurance_referrals, loan_defaults) | >1 | PASS |
| 4 | Non-empty input_bindings | **3/4** plans | ≥2 | PASS |
| 5 | Grand total payout | **$1,046,891** | >$0 | PASS |
| 6 | Periods created | **4** (2023-12, 2024-01, 2024-02, 2024-03) | ≤5 | PASS |

### Payout Breakdown by Plan

| Plan | Results | Non-Zero | Total Payout |
|------|---------|----------|-------------|
| Mortgage Origination Bonus Plan 2024 | 56 | 38 | $1,046,890.05 |
| Consumer Lending Commission Plan 2024 | 100 | 100 | $1.00 |
| Deposit Growth Incentive — Q1 2024 | 100 | 0 | $0.00 |
| Insurance Referral Program 2024 | 64 | 0 | $0.00 |
| **Total** | **320** | **138** | **$1,046,891.05** |

### Payout Breakdown by Period

| Period | Results | Total Payout |
|--------|---------|-------------|
| 2024-01 | 80 | $423,212.51 |
| 2024-03 | 80 | $345,059.48 |
| 2024-02 | 80 | $278,618.81 |
| 2023-12 | 80 | $0.25 |

### Input Bindings Detail

| Plan | Derivations | Detail |
|------|------------|--------|
| Consumer Lending Commission Plan 2024 | 1 | `sum(LoanAmount)` from `loan_disbursements` → `total_loan_disbursement` |
| Mortgage Origination Bonus Plan 2024 | 1 | `sum(OriginalAmount)` from `mortgage_closings` → `total_mortgage_closing_amount` |
| Deposit Growth Incentive — Q1 2024 | 1 | `sum(TotalDepositBalance)` from `deposit_balances` → `deposit_growth_attainment` |
| Insurance Referral Program 2024 | 0 | No matching component→data_type pattern |

### Data Distribution

| data_type | Rows |
|-----------|------|
| loan_disbursements | 755 |
| insurance_referrals | 188 |
| deposit_balances | 48 |
| loan_defaults | 9 |
| **Total** | **1,588** (across 25 entities, 4 periods) |

## 5. Known Limitations

1. **Consumer Lending produces $1 instead of expected ~$5M**: The intent executor's `bounded_lookup_1d` returns the tier rate (0.01) but does not apply `postProcessing` (scalar_multiply by loan volume). The intent engine needs compound-operation support — scoped for **OB-120**.

2. **Insurance Referral has 0 input_bindings**: No `SHEET_COMPONENT_PATTERNS` entry matches both the `insurance_referrals` data_type and the Insurance Referral plan's component names. The pattern match works for discovery but the plan's component structure doesn't expose a clear metric name.

3. **Deposit Growth produces $0**: The plan's tier lookup expects an attainment ratio (0.0–2.0) but receives a raw dollar sum (~$200K). A normalization layer (actual/goal) is needed — scoped for **OB-120**.

4. **AI confidence=0**: The AI field mapping service returned confidence=0 for all 8 files in testing. Tier 2 deterministic detection carried 100% of the weight. The AI integration is wired and ready but untested with high-confidence responses.

## 6. Files Modified

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `web/src/app/api/import/commit/route.ts` | +401 | Phases 1–5: AI mapping injection, Tier 2 entity/date/roster/amount detection, input_bindings generation |
| `web/src/lib/calculation/run-calculation.ts` | +19 −8 | MetricDerivationRule `sum` operation + `source_field`, `component.enabled === false` fix |
| `web/scripts/ob119-phase5-test.ts` | +271 (new) | Integrated test: clean reset → reimport → verify linkage → run calculations |
| `OB-119_DATA_INTELLIGENCE_PIPELINE.md` | +743 (new) | Architecture decision record |

**Diff totals**: 4 files changed, 1,426 insertions, 8 deletions

## 7. Commit History

| Hash | Phase | Message | Date |
|------|-------|---------|------|
| `3069174` | 0 | Diagnostic — complete import pipeline trace | 2026-02-27 22:18 |
| `b8ac189` | 1 | AI-driven entity resolution — three-tier chain | 2026-02-27 22:25 |
| `28de5c5` | 2 | AI-driven period detection — date field recognition | 2026-02-27 22:27 |
| `4a444a9` | 3 | Semantic data_type from filename normalization | 2026-02-27 22:29 |
| `34be374` | 4 | Auto-populate input_bindings from plan intent + data fields | 2026-02-27 22:32 |
| `534108e` | 5 | Tier 2 intelligence + integrated test — all 6 proof gates pass | 2026-02-28 05:24 |

## 8. Key Design Decisions

1. **Inject at commit time, not import time**: AI mappings are called once during the commit step (Step 4.5), not during file upload. This keeps the upload fast and puts intelligence at the critical path.

2. **Tier 2 carries full weight**: The system works entirely without AI. All 6 proof gates pass using deterministic detection alone. AI is a future accelerator, not a requirement.

3. **Value-based entity detection**: Instead of relying on column headers matching `ENTITY_ID_TARGETS`, Tier 2 loads existing entities and checks if column VALUES overlap ≥50% with known `external_id`s. This is language-agnostic (Korean Test compliant).

4. **MetricDerivationRule backward compatible**: Extended the interface with optional `source_field` and `'sum'` operation. Existing `'count'` + `filters` derivations continue to work unchanged.

5. **component.enabled default**: AI-interpreted plans omit the `enabled` field. Changed guard from `!component.enabled` (truthy check that treats `undefined` as disabled) to `component.enabled === false` (explicit opt-out only).

## 9. Rule Set Assignments

- **80 total assignments** across 25 entities × 4 rule sets (via roster-based `ProductLicenses` detection)
- **320 calculation results** generated (80 per period × 4 periods)

## 10. Build Status

```
✓ Compiled successfully (npm run build)
Warnings only: React Hook dependency warnings (pre-existing, not OB-119)
No TypeScript errors. No ESLint errors in OB-119 files.
```

## 11. Auth & Security

No authentication, authorization, or security files were modified. All changes are in the import commit pipeline and calculation engine.

---

*Generated 2026-02-28. Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>*
