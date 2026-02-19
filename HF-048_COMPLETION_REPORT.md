# HF-048 Completion Report — PERIOD CREATION IN IMPORT PIPELINE

**Status**: COMPLETE (code ready, backfill migration ready for manual execution)
**Date**: 2026-02-18
**Branch**: dev

---

## Root Cause

The import pipeline (HF-047) created periods using `period_key` column name, but the actual `periods` table schema uses `canonical_key`. Additionally, the INSERT was missing the required `label` field (NOT NULL, no DEFAULT).

This caused:
1. Period INSERT failed silently (wrong column name + missing required field)
2. `periodKeyMap` stayed empty → all `resolvePeriodId()` calls returned null
3. All 119,129 committed_data rows got `period_id = NULL`
4. 0 periods created

Additionally, the TypeScript types file (`database.types.ts`) was out of sync with the actual DB schema — it defined `period_key` instead of `canonical_key` and was missing `label` and `metadata` fields.

---

## Architecture Decision

**Column alignment approach**: Update ALL code to use `canonical_key` (matching the migration/DB schema) rather than adding a DB alias. This is the correct long-term fix — the types file was wrong, not the migration.

**Scope**: 14 files modified across the entire periods query surface area.

---

## Commits

| Commit | Description |
|--------|-------------|
| `b3ee871` | Fix period creation — canonical_key alignment + backfill migration |

---

## Files Modified

| File | Change |
|------|--------|
| `web/src/app/api/import/commit/route.ts` | period_key → canonical_key in SELECT/INSERT, added label + metadata |
| `web/src/lib/supabase/database.types.ts` | periods Row/Insert/Update: period_key → canonical_key, added label, metadata |
| `web/src/contexts/period-context.tsx` | API response type + property access: period_key → canonical_key |
| `web/src/app/api/periods/route.ts` | SELECT: added canonical_key + label |
| `web/src/lib/data/page-loaders.ts` | 5 functions: all period queries + interfaces updated |
| `web/src/lib/data/platform-queries.ts` | SELECT + Map types: period_key → canonical_key |
| `web/src/app/api/platform/observatory/route.ts` | SELECT + Map types: period_key → canonical_key |
| `web/src/lib/supabase/data-service.ts` | Period creation: canonical_key + label + metadata |
| `web/src/lib/calculation/run-calculation.ts` | SELECT: period_key → canonical_key |
| `web/src/lib/data/persona-queries.ts` | SELECT: added canonical_key + label |
| `web/src/lib/governance/approval-service.ts` | SELECT + Map: period_key → canonical_key |
| `web/src/app/operate/page.tsx` | Property access: period_key → canonical_key |
| `web/src/app/admin/launch/calculate/page.tsx` | State type + map access: period_key → canonical_key |
| `web/supabase/migrations/011_backfill_periods_from_committed_data.sql` | **NEW** — Backfill periods + update period_id on existing data |

---

## Proof Gates

### Phase 1: Code Fix
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-1 | canonical_key in commit route SELECT | route.ts:342 `.select('id, canonical_key')` | **PASS** |
| PG-2 | canonical_key in commit route INSERT | route.ts:365 `canonical_key: key` | **PASS** |
| PG-3 | label field in period INSERT | route.ts:366 `label: MONTH_NAMES[month] + year` | **PASS** |
| PG-4 | metadata field in period INSERT | route.ts:371 `metadata: { year, month }` | **PASS** |
| PG-5 | Types file matches schema | database.types.ts: canonical_key, label, metadata | **PASS** |
| PG-6 | All 12 consumer files updated | grep confirms 0 remaining period_key on periods table | **PASS** |
| PG-7 | committed_data uses period_id FK | page-loaders.ts:242 `.eq('period_id', period.id)` | **PASS** |
| PG-8 | TypeScript zero errors | `npm run build` — compiled successfully | **PASS** |
| PG-9 | Build clean | All pages compiled, no type errors | **PASS** |

### Phase 2: Backfill Migration
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-10 | Migration handles Año/año/year variants | Helper functions with COALESCE | **PASS** |
| PG-11 | Migration handles Mes/mes/month variants | Helper functions with COALESCE | **PASS** |
| PG-12 | ON CONFLICT DO NOTHING | Safe to run multiple times | **PASS** |
| PG-13 | Cleanup drops helper functions | DROP FUNCTION at end of migration | **PASS** |

### Phase 3: Manual Verification (for Andrew)
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-14 | Run backfill migration in Supabase SQL Editor | Execute 011_backfill_periods_from_committed_data.sql | PENDING |
| PG-15 | Periods created | `SELECT * FROM periods WHERE tenant_id = '9b2bb4e3-...'` | PENDING |
| PG-16 | committed_data.period_id populated | `SELECT COUNT(*) FROM committed_data WHERE period_id IS NOT NULL` | PENDING |
| PG-17 | Re-import creates periods | Upload Excel → periods auto-created | PENDING |

---

## Backfill Instructions

Run migration `011_backfill_periods_from_committed_data.sql` in Supabase SQL Editor:

```sql
-- After running the migration, verify:
SELECT COUNT(*) as period_count FROM periods
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f';
-- Expected: 1-12 (one per unique month in the data)

SELECT COUNT(*) as rows_with_period FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND period_id IS NOT NULL;
-- Expected: ~119,129

SELECT COUNT(*) as rows_without_period FROM committed_data
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  AND period_id IS NULL;
-- Expected: 0
```

---

## What Changed: Before vs After

### BEFORE (HF-047)
```
periods table:   canonical_key, label, metadata
TypeScript types: period_key (no label, no metadata)
Import route:    INSERT { period_key: '2024-01' }  ← WRONG column, missing label
Other queries:   .select('id, period_key')          ← WRONG column name
Result:          INSERT fails → 0 periods → all period_id = NULL
```

### AFTER (HF-048)
```
periods table:   canonical_key, label, metadata
TypeScript types: canonical_key, label, metadata    ← ALIGNED
Import route:    INSERT { canonical_key: '2024-01', label: 'January 2024', metadata: {year,month} }
Other queries:   .select('id, canonical_key, label') ← CORRECT
Result:          Periods created → period_id populated → full data linkage
```

---

*HF-048 — February 18, 2026*
*"Fix the column name, not the data."*
