# HF-088 Completion Report: Production Data Cleanup + Optica Nuclear Clear

## Summary
HF-088 cleaned two layers of data damage: HF-086 auto-created VL Admin tenant-scoped profiles and OB-153 inflated Optica domain data. All changes via TypeScript scripts — no manual SQL (Pattern #32 enforced).

## Phase 0: Pre-Cleanup Diagnostic

### VL Admin Profile State
- Total VL Admin profiles: 1
- Platform-level (tenant_id IS NULL): 1 — KEEP
- Tenant-scoped (tenant_id IS NOT NULL): 0 — already clean

### Optica Engine Contract (Before)
| Table | Count |
|-------|-------|
| rule_sets | 2 (14 components) |
| entities | 19,578 |
| periods | 7 |
| committed_data | 140,510 (93,112 entity-bound, 140,510 with source_date) |
| rule_set_assignments | 39,156 |
| calculation_results | 2,513 |
| calculation_batches | 8 |
| entity_period_outcomes | 2,513 |

### Unique Entity Identifiers
- Total entity rows: 19,578
- Distinct external_id: 19,578 (inflation factor 1.0x — one entity per data row, not per employee)
- Expected after reimport: 719 unique employees

### Import Batches
- 32 batches from chunked SCI execution

### LAB Baseline
- Results: 719
- Total payout: $1,262,864.66
- Note: Diverges from original prompt expectation (268/$8,498,311.77). Pre-existing divergence documented in OB-153 completion report.

### Persona Profiles (Preserved)
- Laura Mendez (admin@opticaluminar.mx) role=admin
- Roberto Castillo (gerente@opticaluminar.mx) role=manager
- Sofia Navarro (vendedor@opticaluminar.mx) role=viewer

## Phase 1: VL Admin Profile Cleanup

Already clean — 0 tenant-scoped profiles found. 1 platform-level profile confirmed (role=vl_admin).

No deletions needed. Verification pass only.

## Phase 2: Nuclear Clear Optica Domain Data

### Deletion Summary (FK-ordered, batch size 200)
| Table | Rows Deleted |
|-------|-------------|
| calculation_results | 2,513 |
| calculation_batches | 8 |
| entity_period_outcomes | 2,513 |
| disputes | 0 |
| approval_requests | 0 |
| rule_set_assignments | 39,156 |
| committed_data | 140,510 |
| classification_signals | 94 |
| import_batches | 32 |
| entities | 19,578 |
| periods | 7 |
| rule_sets | 2 |
| reference_items | 0 |
| reference_data | 0 |
| audit_logs | 0 |
| **TOTAL** | **204,413** |

### Preserved
- Tenant record: Optica Luminar (optica-luminar)
- Persona profiles: 3 (Laura, Roberto, Sofia)

## Phase 3: Post-Clear Verification

### LAB Regression
- Results: 719 — UNCHANGED
- Total payout: $1,262,864.66 — UNCHANGED

### Optica Engine Contract (After)
All 14 domain tables: 0 rows

### VL Admin Access
- Tenant exists: YES
- VL Admin platform profile: EXISTS (role=vl_admin)
- Persona profiles: 3 preserved

## Proof Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| PG-0 | Diagnostic captured | PASS | HF-088_DIAGNOSTIC_OUTPUT.md committed |
| PG-1 | VL Admin profiles clean | PASS | 0 tenant-scoped, 1 platform-level |
| PG-2 | Optica nuclear cleared | PASS | All 15 domain tables = 0 |
| PG-3 | Persona profiles preserved | PASS | 3 profiles (Laura, Roberto, Sofia) |
| PG-4 | LAB untouched | PASS | 719 results, $1,262,864.66 |
| PG-5 | VL Admin can see Optica | PASS | Tenant record + platform profile exist |
| PG-6 | npm run build exits 0 | PASS | Clean build |
| PG-7 | PR created | PASS | See below |

## Scripts
- `web/scripts/hf088-diagnostic.ts` — Read-only state capture
- `web/scripts/hf088-clean-profiles.ts` — VL Admin profile cleanup
- `web/scripts/hf088-nuclear-clear.ts` — Optica data wipe (FK-ordered, batch 200)
- `web/scripts/hf088-verify.ts` — Post-clear verification

## Files Changed
- `web/scripts/hf088-diagnostic.ts` — Updated
- `web/scripts/hf088-clean-profiles.ts` — NEW
- `web/scripts/hf088-nuclear-clear.ts` — NEW
- `web/scripts/hf088-verify.ts` — NEW
- `HF-088_DIAGNOSTIC_OUTPUT.md` — NEW
- `HF-088_COMPLETION_REPORT.md` — Updated

## What Happens Next
Optica is a clean slate with 0 domain data and preserved tenant config. The next action is a single clean reimport as a vertical slice proof.
