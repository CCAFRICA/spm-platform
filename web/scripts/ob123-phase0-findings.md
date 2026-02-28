# OB-123 Phase 0: Wiring Gap Diagnostic — Findings

## LAB Tenant: `a630404c-0777-4f6d-b760-b8a190ecd63c`

### Current State

| Resource | Count | Status |
|----------|-------|--------|
| Entities | 25 | CREATED but metadata empty (no role, no product_licenses) |
| Rule sets | 4 | 1 active (Mortgage), 3 archived (CL, IR, DG) |
| Assignments | 0 | MISSING — critical gap |
| Committed data | 1,588 rows | EXISTS but data_types prefixed |
| Periods | 4 | Dec 2023, Jan/Feb/Mar 2024 |
| Input bindings | 0 | ALL EMPTY — convergence never ran |
| Calculation results | 0 | Cannot calculate |

### Gap Analysis (vs MBC which works)

| Gap | LAB | MBC (working) | Fix |
|-----|-----|----------------|-----|
| Rule set status | 3/4 archived | 4/4 active | Activate all |
| Entity metadata | Empty `{}` | `{role, product_licenses}` | Enrich from roster data |
| Data types | `component_data:CFG_Loan_Disbursements_Feb2024` | `loan_disbursements` | Normalize — strip prefix |
| Assignments | 0 | 80 | Create via license-based mapping API |
| Input bindings | All empty | 10 derivations total | Run convergence |

### Existing Infrastructure (already built)

1. Entity creation from roster: `import/commit/route.ts` lines 327-449
2. Rule set assignment API: `/api/rule-set-assignments` with license-based mode
3. Convergence service: `/api/intelligence/converge` + `convergence-service.ts`
4. Calculate page: `/admin/launch/calculate/page.tsx` — already handles multi-plan

### Root Cause

The infrastructure EXISTS but was never TRIGGERED for LAB. Three gaps prevented it:
1. Roster import created entities but didn't extract metadata (role, licenses)
2. No mechanism to normalize data_types from import filenames
3. No one-click "prepare for calculation" that chains: activate → normalize → assign → converge

### Architecture Decision

CHOSEN: Option B — Build a Wiring API that chains existing services.

- NOT rebuilding import (works mechanically)
- NOT rebuilding convergence (works when data_types are clean)
- NOT rebuilding calculate page (already handles multi-plan)
- BUILD: A `/api/intelligence/wire` endpoint that:
  1. Activates archived rule_sets
  2. Normalizes data_types (strip `component_data:` prefix)
  3. Enriches entity metadata from committed roster data
  4. Creates assignments using license-based mapping
  5. Runs convergence for all plans
  6. Returns readiness report
