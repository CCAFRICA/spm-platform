# OB-69 Architecture Decision Record

**Date:** 2026-02-20

---

## FINDING 1: 406 Root Cause
- **Query:** `.from('profiles').select('id').eq('auth_user_id', user.id).eq('tenant_id', tenantId).single()`
- **File:** `persona-context.tsx:104`
- **Problem:** `.single()` returns 406 when zero rows match. RetailCDMX tenant has ZERO profiles. Platform admin profile has `tenant_id = null`.

## FINDING 2: Pipeline Data State
- rule_sets: 1 row (active)
- entities: 24,833 rows
- periods: 7 rows (canonical_key: 2024-01 through 2024-07)
- committed_data: 119,129 total, ALL with period_id
- calculation_batches: **0 rows**
- calculation_results: **0 rows**
- entity_period_outcomes: **0 rows**
- rule_set_assignments: 24,833 rows
- **Pipeline gap:** No calculation has ever been triggered. Import data is complete and correct.

---

## DECISION 1: 406 Fix Approach

**Problem:** Profile query returns 406 on every page load.

**Option A:** Fix queries to use `.maybeSingle()` instead of `.single()`
- Pro: Graceful null return. Code already handles null profile.
- Con: Does not address the root issue (missing profile data for tenant).

**Option B:** Ensure platform admin has a profile scoped to RetailCDMX tenant.
- Pro: Fixes root cause — data will exist.
- Con: Platform admins browse across tenants — they shouldn't need per-tenant profiles.
- Con: "Fix data not logic" violates standing rule #5 ("fix logic, not data").

**Option C:** Fix both — `.maybeSingle()` for resilience + code handles null gracefully.
- Pro: Defense in depth. Works for ALL tenants, not just RetailCDMX.

**CHOSEN:** Option A — Change `.single()` to `.maybeSingle()` in all profile lookup queries used during page load.
- The code already handles null profiles (persona-context falls back gracefully, middleware allows through).
- Platform admins legitimately have `tenant_id = null` — they're cross-tenant.
- `.maybeSingle()` is the correct PostgREST pattern for "zero or one" results.
- This is a logic fix (correct API usage), not a data fix.

**REJECTED:** Option B — Creating profiles per tenant violates the cross-tenant platform admin model. Standing rule #5 says "fix logic, not data."

---

## DECISION 2: Period Binding Strategy

**Problem:** committed_data rows may not have period_id.

**FINDING:** ALL 119,129 committed_data rows already have `period_id` set. The import commit route (`/api/import/commit/route.ts`) correctly creates periods and binds period_id during import. **No fix needed.**

**CHOSEN:** VERIFY ONLY — the import pipeline already works correctly:
- Creates periods with correct `canonical_key` column
- Sets `period_id` on all committed_data rows
- No hardcoded field names
- All 119K existing rows have period_id

---

## DECISION 3: Dashboard Data Source

**Problem:** Dashboard must show real calculation results.

**FINDING:** Dashboard code (`persona-queries.ts`) already reads from `entity_period_outcomes` with fallback to `calculation_results`. Both tables are empty because no calculation has been run, not because the code is wrong.

**Option A:** Trigger a calculation via the API to populate results.
- Pro: Proves the full pipeline works.
- Con: Requires the 406 fix first (API needs authenticated profile context).

**Option B:** Verify calculation code uses correct schema, then verify calculation can be triggered from UI.
- Pro: Proves code correctness without requiring CLI-triggered calculation.

**CHOSEN:** Option B — Verify the calculation code path uses SCHEMA_REFERENCE.md columns. Then verify the dashboard handles both empty state and populated state. The actual calculation trigger will happen via the UI, proving the E2E pipeline.
