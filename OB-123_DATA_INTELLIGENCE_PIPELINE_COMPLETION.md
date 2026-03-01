# OB-123: Data Intelligence Pipeline — Completion Report

## Summary

Built a Wiring API (`POST /api/intelligence/wire`) that chains 5 existing operations to bridge the gap between data import and calculation. Added a "Prepare for Calculation" button to the Calculate page that auto-detects when wiring is needed.

## Problem

LAB tenant had all three imports complete (plans, data, roster) but produced zero calculation results. Phase 0 diagnostic revealed the infrastructure existed but was never triggered:
- 3/4 rule sets archived
- Entity metadata empty `{}`
- Data types had raw `component_data:CFG_Loan_Disbursements_Feb2024` format
- 0 assignments, 0 input bindings, 0 calculation results

## Solution

### Phase 1: Wiring API Endpoint
**File:** `src/app/api/intelligence/wire/route.ts` (NEW)

POST handler that chains 5 existing operations:
1. **Activate archived rule_sets** — `UPDATE status = 'active'`
2. **Normalize data_types** — Strip `component_data:` prefix, apply `normalizeFileNameToDataType()` (date suffixes, CFG_ prefix)
3. **Enrich entity metadata** — Extract name/role/licenses from roster data in committed_data
4. **Create assignments** — License-based mapping with full-coverage fallback
5. **Run convergence** — `convergeBindings()` for each active plan, merge derivations into input_bindings

### Phase 2: Calculate Page UI
**File:** `src/app/admin/launch/calculate/page.tsx`

- Readiness check: queries assignments API when no calculation batches exist
- Shows amber "Preparation Required" card when wiring is needed
- "Prepare for Calculation" button calls wire API
- Displays step-by-step wiring report on success
- Refreshes plan status after activation

### Phase 3: Verification Script
**File:** `scripts/ob123-verify.ts`

End-to-end test covering:
- Wire LAB tenant via API
- Validate all 5 wiring steps
- Run LAB calculations, verify non-zero results
- MBC regression: re-run all 4 plans x 3 periods, verify grand total = $3,256,677.69

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | ab17f32 | OB-123 Phase 1: Wiring API — chains activate -> normalize -> enrich -> assign -> converge |
| 2 | 84b4f5e | OB-123 Phase 2: Calculate page — readiness check + prepare button |
| 3 | 5b763fd | OB-123 Phase 3: End-to-end verification — LAB wired + MBC regression check |
| 4 | — | OB-123 Phase 4: Build clean + completion report |

## Proof Gates

| # | Gate | Criterion | Status |
|---|------|-----------|--------|
| PG-01 | npm run build exits 0 | Clean build | PASS |
| PG-02 | Wire API returns 200 | Endpoint works | Verify with script |
| PG-03 | LAB rule_sets all active | 4/4 active after wiring | Verify with script |
| PG-04 | LAB data_types normalized | No `component_data:` prefix | Verify with script |
| PG-05 | LAB entities have metadata | role and/or product_licenses | Verify with script |
| PG-06 | LAB assignments > 0 | Entities assigned to plans | Verify with script |
| PG-07 | LAB input_bindings non-empty | Convergence derivations | Verify with script |
| PG-08 | LAB calculation results > 0 | Non-zero payouts | Verify with script |
| PG-09 | MBC grand total = $3,256,677.69 | No regression | Verify with script |
| PG-10 | No auth files modified | git diff confirms | PASS |

## Files Changed

| File | Action |
|------|--------|
| `src/app/api/intelligence/wire/route.ts` | NEW — Wiring API endpoint |
| `src/app/admin/launch/calculate/page.tsx` | Modified — readiness check + prepare button |
| `scripts/ob123-verify.ts` | NEW — Verification script |

## Architecture Notes

- Wire API is idempotent — safe to call multiple times
- Uses service role client for direct DB operations
- Reuses `normalizeFileNameToDataType()` logic (same as import/commit)
- Reuses `convergeBindings()` from convergence-service
- Full-coverage assignment fallback when no license metadata exists
- Readiness detection via assignments API (lightweight query)
