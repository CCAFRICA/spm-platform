# HF-173 COMPLETION REPORT

## Type: Database-only HF — zero code changes

## Phase 1: Diagnostics

### Query 1 — William Drake
- **external_id:** CRP-6025
- **metadata:** `{"role":"Rep"}` — WRONG, should be "Senior Rep"
- **temporal_attributes.job_title:** "Rep" — WRONG
- **Scenario A confirmed:** Drake missing Senior Rep designation

### Query 2 — Entity Role Pattern
- Working Senior Reps (Tyler Morrison, Kevin O'Brien, Brian Foster, Carlos Mendez, Nathan Brooks, Patrick Sullivan, Thomas Grant): `metadata.role = "Senior Rep"`, `job_title = "Senior Rep"`
- William Drake: `metadata.role = "Rep"`, `job_title = "Rep"` — MISMATCH
- All entities use same structure: `metadata.role` + `temporal_attributes[].key=job_title`

### Query 3 — Unresolved Rows
- **389 rows with entity_id IS NULL** — ALL committed_data rows
- Expected: OB-183 resolves at calc time via row_data.sales_rep_id, not entity_id column
- Rows are normal transaction data with sales_rep_id references

### Query 4 — Periods (Before Fix)
- 1 period: January 2026 | monthly | 2026-01-01 to 2026-01-31

## Phase 2: William Drake Fix (Scenario A)

**Updated:**
- `metadata.role`: "Rep" → "Senior Rep"
- `temporal_attributes[0].value` (job_title): "Rep" → "Senior Rep"
- All other fields unchanged (department, region, district, status)

**Verified:** `metadata = {"role":"Senior Rep"}`

## Phase 3: Bi-Weekly Periods

**Created:**
| Label | Type | Start | End | ID |
|-------|------|-------|-----|-----|
| Jan 1-15 2026 | biweekly | 2026-01-01 | 2026-01-15 | c1fd1b8c-... |
| Jan 16-31 2026 | biweekly | 2026-01-16 | 2026-01-31 | 8a22fdae-... |

**Existing monthly period preserved** (needed for Plans 2, 3, 4).

**Note:** `period_type` check constraint requires "biweekly" (no hyphen), not "bi-weekly".

## Phase 4: Browser Verification Required (Andrew)

1. Calculate Plan 1 for "Jan 1-15 2026" → check Drake variant assignment
2. Calculate Plan 1 for "Jan 16-31 2026" → sum should approach $182,282 GT
3. Regression: Plans 2, 3, 4 for "January 2026" must be unchanged

## Files Modified
NONE. All changes are Supabase database operations.

## Issues
- period_type check constraint only accepts: monthly, biweekly, weekly, quarterly, annual (no hyphen variants)
