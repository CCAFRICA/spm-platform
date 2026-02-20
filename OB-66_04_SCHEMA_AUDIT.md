# OB-66 Phase 4: Schema Alignment Audit

## Schema Reference

See `SCHEMA_TRUTH.md` at project root for complete table/column inventory (24 tables, created by HF-054).

## Supabase Query Inventory

**Total `.select()` calls:** ~100 across codebase
**Total `.insert()` calls:** ~48
**Total `.update()` calls:** ~27
**Total `.eq()` calls:** ~60+

### Heaviest Query Files

| File | select | insert | update | Tables |
|------|--------|--------|--------|--------|
| `api/platform/observatory/route.ts` | 15+ | 0 | 0 | profiles, tenants, entities, periods, calculation_batches, classification_signals, platform_events |
| `api/import/commit/route.ts` | 5 | 5 | 2 | entities, periods, committed_data, import_batches, rule_set_assignments |
| `api/calculation/run/route.ts` | 4 | 3 | 1 | rule_sets, entities, periods, committed_data, calculation_batches, calculation_results |
| `lib/supabase/calculation-service.ts` | 8 | 4 | 3 | calculation_batches, calculation_results, calculation_traces, entity_period_outcomes |
| `lib/supabase/data-service.ts` | 5 | 3 | 0 | import_batches, committed_data, classification_signals, audit_logs |
| `lib/data/platform-queries.ts` | 6 | 0 | 0 | profiles, tenants, entities, periods, calculation_batches |
| `lib/data/page-loaders.ts` | 5 | 0 | 0 | periods, calculation_batches, committed_data, entities |

## Schema Mismatches Found

### FIXED (by HF-054)

| Issue | File | Status |
|-------|------|--------|
| `profiles.entity_id` queried (column doesn't exist) | `contexts/persona-context.tsx:101` | FIXED — now queries `entities.profile_id` |
| `.eq('id', user.id)` on profiles (should be `auth_user_id`) | various API routes | FIXED — all use `auth_user_id` |
| `database.types.ts` includes `entity_id` on profiles | `lib/supabase/database.types.ts:147` | FIXED — removed |

### REMAINING: scope_level writes

| File | Line | Code | Risk |
|------|------|------|------|
| `api/auth/signup/route.ts` | 139 | `scope_level: 'tenant'` (INSERT) | MEDIUM — fails silently if column absent |
| `api/platform/users/invite/route.ts` | 150 | `scope_level: template.scope` (INSERT) | MEDIUM — same |
| `api/admin/tenants/create/route.ts` | 149 | `scope_level: 'tenant'` (INSERT) | MEDIUM — same |
| `lib/supabase/database.types.ts` | 154,171,185 | Type definitions | LOW — types only |

**Status:** `scope_level` is in the TypeScript types and written during profile creation. If the column exists in DB, these are correct. If not, INSERTs may silently fail (Supabase ignores unknown columns in inserts). **Needs DB verification.**

### NOT A MISMATCH: lifecycle_state

`calculation_batches.lifecycle_state` has 70+ references across the entire codebase, is defined in database.types.ts, and is used consistently in all batch operations. This is almost certainly a real column. The reported 406 error is likely RLS-related, not schema-related.

## Column Verification Needed

To complete this audit, run in Supabase SQL Editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
```

This will definitively confirm whether `scope_level`, `scope_override`, `settings`, and `status` exist on the profiles table.

## Error Impact Assessment

| Mismatch | HTTP Error | Frequency | User Impact |
|----------|-----------|-----------|-------------|
| `profiles.entity_id` SELECT | 400 | 13x per page load | CRITICAL — error loop on every page (FIXED) |
| `scope_level` INSERT | Silent fail | On signup/invite | LOW — profile still created, field ignored |
| `lifecycle_state` SELECT | 406 (reported) | On period/batch pages | MEDIUM — needs RLS investigation |

---
*OB-66 Phase 4 — February 19, 2026*
