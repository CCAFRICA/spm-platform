# CLT-160 DIAGNOSTIC: COMPREHENSIVE PIPELINE STATE ANALYSIS
## CC-Executed — Full inspection of Meridian tenant state after plan import
## Type: Diagnostic — no code changes
## Purpose: Single comprehensive view of everything in the database before proceeding with data import

---

## AUTONOMY DIRECTIVE
NEVER ask yes/no. NEVER say "shall I". Just act. Run every query. Paste every result. Commit the report.

---

## WHAT HAPPENED

Plan PPTX imported successfully through vialuce.ai browser. "Import Complete" shown.
Before proceeding with data import, we need a complete picture of what the plan import created,
what state the pipeline is in, and what gaps exist.

This diagnostic runs ONCE and produces a comprehensive report. No reactive query-by-query debugging.

---

## PHASE 1: TENANT STATE

```bash
# Run ALL of these in Supabase SQL Editor as a single batch.
# Paste the COMPLETE output for each.
```

### 1.1 Tenant Record
```sql
SELECT id, name, slug, locale, currency, 
  settings->>'industry' as industry,
  settings->>'domain' as domain,
  created_at
FROM tenants WHERE id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

### 1.2 Engine Contract — Full State
```sql
SELECT 
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM calculation_results WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as calc_results,
  (SELECT count(*) FROM import_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as import_batches;
```

---

## PHASE 2: RULE SETS — COMPLETE INSPECTION

### 2.1 All Rule Sets for Meridian
```sql
SELECT id, name, status, version,
  effective_from, effective_to,
  jsonb_typeof(components) as comp_structure,
  length(components::text) as comp_size,
  input_bindings IS NOT NULL as has_bindings,
  CASE WHEN input_bindings IS NOT NULL THEN length(input_bindings::text) ELSE 0 END as bindings_size,
  created_at
FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at;
```

### 2.2 Latest Rule Set — Variant Structure
```sql
WITH latest AS (
  SELECT id, components FROM rule_sets 
  WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 
  jsonb_array_length(components->'variants') as variant_count,
  v.idx as variant_index,
  v.val->>'name' as variant_name,
  v.val->>'variantName' as variant_label,
  v.val->>'role' as variant_role,
  v.val->>'description' as variant_desc,
  jsonb_array_length(v.val->'components') as component_count
FROM latest, jsonb_array_elements(components->'variants') WITH ORDINALITY AS v(val, idx);
```

### 2.3 Latest Rule Set — Component Details (Variant 0)
```sql
WITH latest AS (
  SELECT id, components FROM rule_sets 
  WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 
  c.idx as comp_index,
  c.val->>'name' as comp_name,
  c.val->>'calculationType' as calc_type,
  c.val->'calculationIntent' IS NOT NULL as has_intent,
  c.val->'calculationIntent'->>'operation' as intent_operation,
  jsonb_typeof(c.val->'tierConfig') as tier_type,
  jsonb_typeof(c.val->'matrixConfig') as matrix_type,
  length(c.val::text) as comp_size
FROM latest, jsonb_array_elements(components->'variants'->0->'components') WITH ORDINALITY AS c(val, idx);
```

### 2.4 Latest Rule Set — Component Details (Variant 1)
```sql
WITH latest AS (
  SELECT id, components FROM rule_sets 
  WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 
  c.idx as comp_index,
  c.val->>'name' as comp_name,
  c.val->>'calculationType' as calc_type,
  c.val->'calculationIntent' IS NOT NULL as has_intent,
  c.val->'calculationIntent'->>'operation' as intent_operation,
  length(c.val::text) as comp_size
FROM latest, jsonb_array_elements(components->'variants'->1->'components') WITH ORDINALITY AS c(val, idx);
```

### 2.5 Latest Rule Set — input_bindings
```sql
SELECT id, 
  jsonb_typeof(input_bindings) as bindings_type,
  input_bindings
FROM rule_sets 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at DESC LIMIT 1;
```

### 2.6 Full Component JSON (first component, variant 0) — for structure inspection
```sql
WITH latest AS (
  SELECT id, components FROM rule_sets 
  WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  ORDER BY created_at DESC LIMIT 1
)
SELECT jsonb_pretty(components->'variants'->0->'components'->0) as first_component
FROM latest;
```

---

## PHASE 3: CLASSIFICATION SIGNALS

### 3.1 All Signals for Meridian
```sql
SELECT id, source_file_name, sheet_name, classification, confidence, 
  decision_source, scope, signal_type,
  structural_fingerprint IS NOT NULL as has_fingerprint,
  classification_trace IS NOT NULL as has_trace,
  vocabulary_bindings IS NOT NULL as has_vocab,
  created_at
FROM classification_signals 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at DESC LIMIT 20;
```

### 3.2 Convergence Signals
```sql
SELECT classification, confidence, decision_source,
  agent_scores,
  created_at
FROM classification_signals 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND classification LIKE 'convergence%'
ORDER BY created_at DESC LIMIT 10;
```

---

## PHASE 4: IMPORT BATCHES

### 4.1 All Import Batches
```sql
SELECT id, file_name, file_type, row_count, status, 
  error_summary,
  created_at, completed_at
FROM import_batches 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY created_at;
```

---

## PHASE 5: STALE DATA CHECK

### 5.1 Duplicate Rule Sets
```sql
SELECT name, count(*) as copies, 
  array_agg(id) as ids,
  array_agg(created_at::text) as dates
FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY name HAVING count(*) > 1;
```

### 5.2 Orphaned Data
```sql
-- Entities without rule_set assignments
SELECT count(*) as unassigned_entities
FROM entities e
WHERE e.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND NOT EXISTS (
    SELECT 1 FROM rule_set_assignments rsa WHERE rsa.entity_id = e.id
  );

-- Committed data without matching entities
SELECT count(*) as orphaned_committed
FROM committed_data cd
WHERE cd.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND cd.entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entities e WHERE e.id = cd.entity_id
  );
```

---

## PHASE 6: FLYWHEEL STATE

### 6.1 Foundational Patterns
```sql
SELECT pattern_signature, confidence_mean, total_executions, tenant_count,
  learned_behaviors IS NOT NULL as has_behaviors
FROM foundational_patterns 
WHERE pattern_signature LIKE 'sci:%'
ORDER BY total_executions DESC LIMIT 10;
```

### 6.2 Domain Patterns
```sql
SELECT pattern_signature, domain_id, confidence_mean, total_executions
FROM domain_patterns
ORDER BY total_executions DESC LIMIT 10;
```

---

## PHASE 7: CODEBASE — EXECUTE ROUTE PLAN PIPELINE

### 7.1 How does the plan pipeline work in execute?
```bash
grep -B 5 -A 50 "executePlanPipeline\|plan.*pipeline\|classification.*plan" \
  web/src/app/api/import/sci/execute/route.ts | head -80
```

### 7.2 What does bridgeAIToEngineFormat do?
```bash
grep -rn "bridgeAIToEngineFormat\|bridge.*engine\|bridge.*format" \
  web/src/lib/ --include="*.ts" | head -10

# Show the function
grep -B 5 -A 40 "function bridgeAIToEngineFormat\|export.*bridgeAIToEngineFormat" \
  web/src/lib/ --include="*.ts" -r | head -60
```

### 7.3 How is rule_set.components structured after bridge?
```bash
grep -B 5 -A 20 "components.*=\|\.components\s*=" \
  web/src/app/api/import/sci/execute/route.ts | head -40
```

---

## DELIVERABLE

Create `CLT-160_DIAGNOSTIC_REPORT.md` in PROJECT ROOT with ALL query results pasted.

### Report Structure
1. **Tenant State** — identity, engine contract counts
2. **Rule Sets** — count, structure, variants, components, input_bindings
3. **Component Inventory** — name, type, intent, operation for each component in each variant
4. **Classification Signals** — what signals exist, types, scopes
5. **Import Batches** — history of imports
6. **Stale Data** — duplicates, orphans
7. **Flywheel State** — foundational and domain patterns
8. **Plan Pipeline Code** — how execute processes plan content
9. **Assessment** — what's correct, what's wrong, what's missing
10. **Recommended Actions** — ordered list of what to fix before data import

**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "CLT-160 Diagnostic: Comprehensive pipeline state analysis after plan import" && git push origin dev`
