# OB-162 Cleanup SQL — For Andrew to Execute in Supabase SQL Editor

## Step 1: Clean Meridian Import Data (Preserves Plan)

```sql
-- OB-162 Phase 1.1: Clean existing Meridian data for re-import through field identity path
-- Tenant: 5035b1e8-0754-4527-b7ec-9f93f85e4c79 (Meridian Logistics Group)

DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

## Step 2: Verify Plan Preserved

```sql
SELECT id, name, status FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Expected: 1 row with the Meridian plan name, status='draft' or 'active'.

## Step 3: After Re-Import — Verify Field Identities

```sql
-- Verify committed_data has field_identities in metadata
SELECT
  import_batch_id,
  metadata->'field_identities' IS NOT NULL as has_field_identities,
  metadata->>'informational_label' as label,
  count(*) as rows
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY import_batch_id, metadata->'field_identities' IS NOT NULL, metadata->>'informational_label';

-- Verify convergence produced input_bindings
SELECT jsonb_pretty(input_bindings)
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Verify entity resolution from field identities
SELECT count(*) as entity_count FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Engine Contract 7-value (post-import)
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```

Expected post-import:
- rule_sets = 1 (preserved)
- entities >= 50 (from field identity entity resolution)
- committed_data >= 86 (all data, including what was previously reference_data)
- reference_data = 0 (no new writes)
- reference_items = 0 (no new writes)
- periods = 0 (engine creates at calc time)
- input_bindings != {} (convergence populated)
