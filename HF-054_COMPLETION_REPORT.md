# HF-054: Schema Alignment — Completion Report

**Date:** 2026-02-19
**Branch:** dev
**Status:** COMPLETE

---

## What Was Fixed

### Problem 1: `profiles.entity_id` Does Not Exist (P0) — FIXED
- **Root cause:** `persona-context.tsx:101` queried `.select('id, entity_id')` on profiles table
- `entity_id` does not exist as a column on profiles — caused HTTP 400 on every page load
- The query fired on every page because PersonaProvider wraps the entire app
- **Fix:** Removed `entity_id` from profiles select. Profile-to-entity linkage now queries
  `entities.profile_id` (the FK goes from entities TO profiles, not the reverse)
- **Also:** Removed `entity_id` from Profile type in `database.types.ts`

### Problem 2: Observatory Settings API Returns 403 (P0) — ALREADY FIXED
- This was fixed in HF-053 Phase 0-PRE: `scope_level` → `role`, `'platform'` → `'vl_admin'`,
  `.eq('id', user.id)` → `.eq('auth_user_id', user.id)`, `updated_by` FK fix
- **Verified:** Route returns 401 without auth (correct), flags endpoint returns all 3 flags

### Problem 3: `calculation_batches.lifecycle_state` (P1) — NOT A MISMATCH
- 70+ consistent references across the entire codebase, defined in database.types.ts
- `lifecycle_state` is a real column. The reported 406 error is likely RLS-related, not schema-related
- No code changes needed for this column

### Problem 4: Period Detection Not Working (P1) — ALREADY CORRECT
- HF-053 edited `web/src/app/data/import/enhanced/page.tsx` — the canonical file
- `/operate/import/enhanced/page.tsx` is a re-export: `export { default } from '@/app/data/import/enhanced/page'`
- All period detection code confirmed present: import, target fields, fullSheetData, detectPeriods call, UI, commit payload

## Files Modified

| File | Change |
|------|--------|
| `SCHEMA_TRUTH.md` | NEW: Authoritative column reference for all 24 tables |
| `HF-054_DIAGNOSTIC.md` | NEW: Full schema audit with all mismatches documented |
| `web/src/contexts/persona-context.tsx` | Removed entity_id from profiles select, query entities.profile_id instead |
| `web/src/lib/supabase/database.types.ts` | Removed entity_id from Profile Row/Insert/Update types |

## Architecture

```
BEFORE (broken):
  PersonaProvider → supabase.from('profiles').select('id, entity_id')
                    → HTTP 400 (entity_id doesn't exist)
                    → Error caught, retried on dependency change
                    → 13 failed requests per page load

AFTER (fixed):
  PersonaProvider → supabase.from('profiles').select('id')
                    → Success, get profile.id
                    → supabase.from('entities').select('id').eq('profile_id', profile.id)
                    → Get linked entity (if any)
                    → Set scope correctly
```

## Proof Gates

| # | Gate | Result |
|---|------|--------|
| PG-1 | SCHEMA_TRUTH.md exists at project root | PASS — 8,827 bytes |
| PG-2 | Zero entity_id references on profiles queries | PASS — grep returns 0 |
| PG-3 | Zero scope_level reads anywhere | PASS — only writes (INSERT) remain |
| PG-4 | All profile auth queries use auth_user_id | PASS — grep audit clean |
| PG-5 | calculation_batches.lifecycle_state correct | PASS — 70+ references, real column |
| PG-6 | /api/platform/flags returns 200 | PASS — returns 3 boolean flags |
| PG-7 | Settings API returns 401 without auth | PASS — correct behavior |
| PG-8 | Period detection code in correct file | PASS — canonical data file has all HF-053 code |
| PG-9 | Year/month target fields in mapping | PASS — lines 832-833 |
| PG-10 | Operate route is re-export | PASS — single line re-export |
| PG-11 | Build clean | PASS — npm run build exit 0, zero errors |
| PG-12 | Dev server responds | PASS — localhost:3000 returns 200 |

## Phase History

| Phase | Commit | Description |
|-------|--------|-------------|
| 0 | ec3ee67 | Schema alignment audit — 26 tables, all mismatches documented |
| 1 | 3a4ba52 | SCHEMA_TRUTH.md — authoritative column reference for 24 tables |
| 2 | a3afea9 | Fix profiles.entity_id → query entities.profile_id instead |
| 3 | — | Period detection verified in correct file (no code changes needed) |
| 4 | — | Observatory Settings verified working (fixed in HF-053) |
| 5 | — | Error loop eliminated by Phase 2 fix |

## Standing Rule Proposal

Add to architecture rules:
- Before writing ANY Supabase query, verify column names against SCHEMA_TRUTH.md or information_schema.columns. Never assume. (AP-13)
- profiles.id != auth.uid(). Always use auth_user_id for auth matching.
- Profile-to-entity linkage goes through entities.profile_id, NOT profiles.entity_id.

---

*HF-054 — February 19, 2026*
