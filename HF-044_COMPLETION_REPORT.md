# HF-044 Completion Report — RLS POLICY FIX: IMPORT PIPELINE ACCESS

**Status**: COMPLETE
**Date**: 2026-02-19
**Branch**: dev

---

## Commits

| Commit | Phase | Description |
|--------|-------|-------------|
| `2439487` | Phase 0 | RLS and profiles audit |
| `5327ef2` | Phase 1 | RLS policy fixes — VL Admin write access (37 policies) |

---

## Root Cause

VL Admin (role='vl_admin', tenant_id=NULL) had SELECT policies on all tables (migration 006) but **ZERO INSERT/UPDATE/DELETE policies**. All existing write policies use:
```sql
tenant_id IN (SELECT tenant_id FROM profiles WHERE auth_user_id = auth.uid() AND capabilities @> '["..."]')
```
Since VL Admin's tenant_id is NULL, this subquery returns NULL → no rows writable → 403 on any write operation.

## Profiles Table Schema

```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY,
  tenant_id     UUID REFERENCES tenants(id),  -- nullable (migration 005)
  auth_user_id  UUID NOT NULL REFERENCES auth.users(id),
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  capabilities  JSONB NOT NULL DEFAULT '[]',  -- CONFIRMED EXISTS
  locale        TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
);
```

---

## Files Modified

| File | Change |
|------|--------|
| `web/supabase/migrations/009_vl_admin_write_access.sql` | 37 VL Admin write policies + capabilities UPDATE |

---

## Migration 009 Contents — All RLS Policies

### Summary: 37 policies across 21 tables

| # | Table | INSERT | UPDATE | DELETE |
|---|-------|--------|--------|--------|
| 1 | entities | `entities_insert_vl_admin` | `entities_update_vl_admin` | — |
| 2 | entity_relationships | `entity_relationships_insert_vl_admin` | `entity_relationships_update_vl_admin` | — |
| 3 | reassignment_events | `reassignment_events_insert_vl_admin` | — | — |
| 4 | rule_sets | `rule_sets_insert_vl_admin` | `rule_sets_update_vl_admin` | `rule_sets_delete_vl_admin` |
| 5 | rule_set_assignments | `rule_set_assignments_insert_vl_admin` | `rule_set_assignments_update_vl_admin` | `rule_set_assignments_delete_vl_admin` |
| 6 | periods | `periods_insert_vl_admin` | `periods_update_vl_admin` | — |
| 7 | import_batches | `import_batches_insert_vl_admin` | — | — |
| 8 | committed_data | `committed_data_insert_vl_admin` | — | — |
| 9 | calculation_batches | `calculation_batches_insert_vl_admin` | `calculation_batches_update_vl_admin` | — |
| 10 | calculation_results | `calculation_results_insert_vl_admin` | — | — |
| 11 | calculation_traces | `calculation_traces_insert_vl_admin` | — | — |
| 12 | disputes | `disputes_insert_vl_admin` | `disputes_update_vl_admin` | — |
| 13 | reconciliation_sessions | `reconciliation_sessions_insert_vl_admin` | — | — |
| 14 | audit_logs | `audit_logs_insert_vl_admin` | — | — |
| 15 | ingestion_configs | `ingestion_configs_insert_vl_admin` | `ingestion_configs_update_vl_admin` | — |
| 16 | ingestion_events | `ingestion_events_insert_vl_admin` | — | — |
| 17 | usage_metering | `usage_metering_insert_vl_admin` | — | — |
| 18 | classification_signals | `classification_signals_insert_vl_admin` | — | — |
| 19 | period_entity_state | `period_entity_state_insert_vl_admin` | `period_entity_state_update_vl_admin` | `period_entity_state_delete_vl_admin` |
| 20 | profile_scope | `profile_scope_insert_vl_admin` | `profile_scope_update_vl_admin` | `profile_scope_delete_vl_admin` |
| 21 | entity_period_outcomes | `entity_period_outcomes_insert_vl_admin` | `entity_period_outcomes_update_vl_admin` | `entity_period_outcomes_delete_vl_admin` |

### Policy Pattern (all 37 use this)
```sql
EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'vl_admin')
```

### VL Admin Capabilities Update (Track C)
```sql
UPDATE profiles
SET capabilities = '["full_access", "import_data", "manage_rule_sets", "manage_assignments",
  "approve_outcomes", "manage_profiles", "manage_tenants", "view_audit", "configure"]'::jsonb
WHERE role = 'vl_admin';
```

---

## Before/After: Pipeline Tables

### import_batches
| Operation | BEFORE (policies) | AFTER |
|-----------|-------------------|-------|
| SELECT | `import_batches_select_tenant` + `import_batches_select_vl_admin` (006) | unchanged |
| INSERT | `import_batches_insert` (requires `import_data` capability) | + `import_batches_insert_vl_admin` |
| UPDATE | none | none |
| DELETE | none | none |

### committed_data
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `committed_data_select_tenant` + `committed_data_select_vl_admin` (006) | unchanged |
| INSERT | `committed_data_insert` (requires `import_data` capability) | + `committed_data_insert_vl_admin` |

### entities
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `entities_select_tenant` + `entities_select_vl_admin` (006) | unchanged |
| INSERT | `entities_insert` (requires `manage_assignments` OR `import_data`) | + `entities_insert_vl_admin` |
| UPDATE | `entities_update` (requires `manage_assignments` OR `import_data`) | + `entities_update_vl_admin` |

### periods
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `periods_select_tenant` + `periods_select_vl_admin` (006) | unchanged |
| INSERT | `periods_insert` (requires `manage_rule_sets` OR `import_data`) | + `periods_insert_vl_admin` |
| UPDATE | `periods_update` (requires `manage_rule_sets`) | + `periods_update_vl_admin` |

### rule_sets
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `rule_sets_select_tenant` + `rule_sets_select_vl_admin` (006) | unchanged |
| INSERT | `rule_sets_insert` (requires `manage_rule_sets`) | + `rule_sets_insert_vl_admin` |
| UPDATE | `rule_sets_update` (requires `manage_rule_sets`) | + `rule_sets_update_vl_admin` |
| DELETE | `rule_sets_delete` (requires `manage_rule_sets` + draft) | + `rule_sets_delete_vl_admin` |

### rule_set_assignments
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `rule_set_assignments_select_tenant` + `rule_set_assignments_select_vl_admin` (006) | unchanged |
| INSERT | `rule_set_assignments_insert` (requires `manage_assignments`) | + `rule_set_assignments_insert_vl_admin` |
| UPDATE | `rule_set_assignments_update` (requires `manage_assignments`) | + `rule_set_assignments_update_vl_admin` |
| DELETE | `rule_set_assignments_delete` (requires `manage_assignments`) | + `rule_set_assignments_delete_vl_admin` |

### calculation_batches
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `calculation_batches_select_tenant` + `calculation_batches_select_vl_admin` (006) | unchanged |
| INSERT | `calculation_batches_insert` (requires `manage_rule_sets` OR `approve_outcomes`) | + `calculation_batches_insert_vl_admin` |
| UPDATE | `calculation_batches_update` (requires `manage_rule_sets` OR `approve_outcomes`) | + `calculation_batches_update_vl_admin` |

### calculation_results
| Operation | BEFORE | AFTER |
|-----------|--------|-------|
| SELECT | `calculation_results_select_tenant` + `calculation_results_select_vl_admin` (006) | unchanged |
| INSERT | `calculation_results_insert` (requires `manage_rule_sets` OR `approve_outcomes`) | + `calculation_results_insert_vl_admin` |

---

## Proof Gates

### Phase 0: Audit
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| — | profiles.capabilities column exists | `capabilities JSONB NOT NULL DEFAULT '[]'` in 001_core_tables.sql line 46 | PASS |
| — | VL Admin has NULL tenant_id | migration 005: `ALTER TABLE profiles ALTER COLUMN tenant_id DROP NOT NULL` | PASS |
| — | Import uses browser client (hits RLS) | enhanced/page.tsx imports `createClient` from `@/lib/supabase/client` | PASS |

### Phase 1: Fix
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-1 | import_batches has VL Admin INSERT | `import_batches_insert_vl_admin` in 009 | **PASS** |
| PG-2 | committed_data has VL Admin INSERT | `committed_data_insert_vl_admin` in 009 | **PASS** |
| PG-3 | entities has VL Admin INSERT | `entities_insert_vl_admin` in 009 | **PASS** |
| PG-4 | periods has VL Admin INSERT | `periods_insert_vl_admin` in 009 | **PASS** |
| PG-5 | All pipeline tables audited | 21 tables × 37 policies documented above | **PASS** |
| PG-6 | Migration file committed | `web/supabase/migrations/009_vl_admin_write_access.sql` in commit `5327ef2` | **PASS** |

### Phase 2: Verify
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-7 | GPV wizard import path: VL Admin covered | GPV calls directCommitImportDataAsync → all 5 tables have VL Admin INSERT | **PASS** |
| PG-8 | Enhanced Import path: VL Admin covered | Same function, same tables | **PASS** |
| PG-9 | Existing tenant-scoped policies unchanged | `git diff HEAD -- web/supabase/migrations/00{1,2,3,4,5,6}*.sql` = empty | **PASS** |

### Phase 3: Build
| # | Gate | Evidence | Result |
|---|------|----------|--------|
| PG-10 | TypeScript: zero errors | `npx tsc --noEmit` exit 0 | **PASS** |
| PG-11 | Build: clean | `npm run build` exit 0, all routes compile | **PASS** |

---

## Import Pipeline Table Coverage

| Table | directCommitImport | runCalculation | GPVWizard | VL Admin INSERT? |
|-------|-------------------|----------------|-----------|-----------------|
| import_batches | INSERT | — | via import | YES |
| entities | INSERT+UPDATE | — | via import | YES |
| committed_data | INSERT | — | via import | YES |
| periods | INSERT | — | via import | YES |
| rule_set_assignments | INSERT | — | via import | YES |
| calculation_batches | — | INSERT+UPDATE | via calculate | YES |
| calculation_results | — | INSERT | via calculate | YES |
| calculation_traces | — | INSERT | via calculate | YES |
| entity_period_outcomes | — | INSERT+UPDATE | via calculate | YES |
| usage_metering | — | INSERT | via calculate | YES |

---

## POST-MERGE STEPS

1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `web/supabase/migrations/009_vl_admin_write_access.sql`
3. Run
4. Verify:
```sql
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE policyname LIKE '%vl_admin%' AND cmd != 'SELECT'
ORDER BY tablename, cmd;
```
Expected: 37 rows (21 INSERT + 11 UPDATE + 5 DELETE)

---

## Manual Browser Gates (for Andrew)

| # | Test | Expected |
|---|------|----------|
| M-1 | Login as VL Admin → navigate to /data/import/enhanced | Page loads, no errors |
| M-2 | Upload CSV → Map → Commit | No 403 error on import_batches INSERT |
| M-3 | Navigate to /admin/launch/calculate → Run Calculation | No 403 on calculation_batches/results |
| M-4 | GPV Wizard → Complete all 3 steps | Import + Calculate pipeline works end-to-end |
| M-5 | Reconciliation → Select batch → Upload benchmark | No 403 on reconciliation_sessions |

---

*HF-044 — February 19, 2026*
*"If you can SELECT, you should be able to INSERT where appropriate."*
