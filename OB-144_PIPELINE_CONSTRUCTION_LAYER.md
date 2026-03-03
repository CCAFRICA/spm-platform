# OB-144: PIPELINE CONSTRUCTION LAYER — MAKE SCI FILL THE ENGINE CONTRACT
## Classification Without Construction Ends Here

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `ENGINE_CONTRACT.md` — **THE 5-table boundary between pipeline and engine**
4. `ENGINE_CONTRACT_BINDING.sql` — **THE SQL that proves the binding logic works. This is your specification.**
5. `CLT-142_BROWSER_FINDINGS.md` — findings F-04, F-05, F-11 are the targets of this OB
6. `Vialuce_Synaptic_Content_Ingestion_Specification.md` — SCI architecture context

**Read all six before writing any code.**

---

## CONTEXT: THE PATTERN ACROSS 4 CLTs

CLT-137, CLT-139, CLT-142 (and implicitly CLT-122) found the same gap: the SCI pipeline classifies content correctly but never constructs what the engine needs. Specifically:

| What SCI Does Today | What SCI Must Also Do |
|---------------------|----------------------|
| ✅ Classifies content units (plan, entity, target, transaction) | ❌ Creates entities from entity identifier fields |
| ✅ Maps fields to semantic roles | ❌ Creates periods from date/month/year fields |
| ✅ Commits raw data to committed_data | ❌ Binds entity_id on committed_data rows |
| ✅ Reports confidence scores | ❌ Binds period_id on committed_data rows |
| ✅ Generates field_mappings | ❌ Creates rule_set_assignments for new entities |

The SQL binding script (`ENGINE_CONTRACT_BINDING.sql`) proved all five construction steps work. This OB wires that same logic into the SCI execute pipeline so it runs automatically after data is committed.

**Decision 78 applies:** The SQL binding script IS the specification. The code must implement the exact same logic. If the SQL does it in 5 steps, the code does it in 5 steps.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Final step: `gh pr create --base main --head dev`
4. **Commit this prompt to git as first action.**
5. **Git from repo root (spm-platform), NOT web/.**
6. Fix logic not data.
7. **Korean Test:** Zero hardcoded field names (no `num_empleado`, no `Mes`, no `Año`, no `Fecha Corte`). The binding logic must use semantic roles or field_mappings to identify which fields contain entity identifiers, dates, months, years.
8. Import ALL columns to committed_data — Carry Everything, Express Contextually.

---

## ENGINE CONTRACT REMINDER

The calculation engine reads five tables. The pipeline's job is to fill them:

| # | Table | What Pipeline Must Provide |
|---|-------|---------------------------|
| 1 | `rule_sets` | components (array of calculation rules) + input_bindings |
| 2 | `entities` | id, external_id, tenant_id, temporal_attributes |
| 3 | `periods` | id, tenant_id, start_date, end_date, canonical_key |
| 4 | `committed_data` | entity_id (FK), period_id (FK), row_data |
| 5 | `rule_set_assignments` | entity_id, rule_set_id (which entities get which plan) |

**Verification query (run before Phase 1 and after Phase 6):**

```sql
WITH t AS (
  SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1
)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as period_count,
  (SELECT COUNT(*) FROM rule_sets WHERE tenant_id = t.id AND status = 'active') as active_plans,
  (SELECT COALESCE(jsonb_array_length(components), 0) FROM rule_sets WHERE tenant_id = t.id AND status = 'active' LIMIT 1) as component_count,
  (SELECT COUNT(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignment_count,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL AND period_id IS NOT NULL) as bound_data_rows,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND (entity_id IS NULL OR period_id IS NULL)) as orphaned_data_rows
FROM t;
```

---

## PHASE 0: DIAGNOSTIC — UNDERSTAND THE CURRENT SCI EXECUTE PATH

### 0A: Run the Engine Contract verification query

Paste the full output. Record baseline values. These are the BEFORE numbers.

### 0B: Map the current SCI execute pipeline

```bash
echo "=== SCI EXECUTE API ROUTE ==="
find web/src -path "*sci*execute*" -name "route.ts" -o -path "*sci*execute*" -name "*.ts" | head -10

echo ""
echo "=== SCI EXECUTE IMPLEMENTATION ==="
# Read the full execute route
for f in $(find web/src -path "*sci*execute*" -name "route.ts" | head -3); do
  echo "=== $f ==="
  cat "$f"
done

echo ""
echo "=== WHERE DOES committed_data GET INSERTED? ==="
grep -rn "committed_data\|\.from('committed_data')\|INSERT.*committed_data" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== ENTITY CREATION IN PIPELINE ==="
grep -rn "entities.*insert\|\.from('entities')\|createEntit\|entity.*create" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== PERIOD CREATION IN PIPELINE ==="
grep -rn "periods.*insert\|\.from('periods')\|createPeriod\|period.*create\|detectPeriod" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== ASSIGNMENT CREATION IN PIPELINE ==="
grep -rn "rule_set_assignments.*insert\|\.from('rule_set_assignments')\|createAssign\|assignment.*create" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== ENTITY_ID BINDING ON committed_data ==="
grep -rn "entity_id.*=\|set.*entity_id\|UPDATE.*committed_data.*entity" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20

echo ""
echo "=== PERIOD_ID BINDING ON committed_data ==="
grep -rn "period_id.*=\|set.*period_id\|UPDATE.*committed_data.*period" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next | head -20
```

### 0C: Document the gap

After reading the code, document exactly:
1. What the SCI execute pipeline currently does after committing data
2. What it does NOT do (from the list: entity creation, period creation, entity_id binding, period_id binding, assignment creation)
3. Where in the existing code the construction logic should be added (specific file and function)

**Proof gate PG-00:** Diagnostic complete. Current pipeline behavior documented. Gap documented. Insertion point identified.

**Commit:** `OB-144 Phase 0: Diagnostic — pipeline construction gap mapped`

---

## PHASE 1: ENTITY CONSTRUCTION

After SCI commits data to `committed_data`, the pipeline must create entities from the data.

### The Logic (from ENGINE_CONTRACT_BINDING.sql)

The SQL binding script does this:
1. Find rows in committed_data that have an entity identifier field (e.g., a field with semantic_role = `entity_identifier`)
2. Extract unique values of that field
3. For each unique value, check if an entity with that `external_id` already exists for the tenant
4. Create new entities for values that don't have one yet

### Implementation Requirements

Create a function (or add to the existing SCI execute pipeline) that:

```typescript
// PSEUDOCODE — implement in whatever structure the codebase uses
async function constructEntities(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string
): Promise<{ created: number; matched: number; total: number }> {
  
  // 1. Find the entity identifier field from committed_data
  //    - Use field_mappings or semantic_roles to identify which row_data key 
  //      contains the entity identifier
  //    - DO NOT hardcode 'num_empleado' — use the mapping
  //    - The field might be mapped as 'entity_identifier', 'entity_id', 
  //      'external_id', or similar semantic role
  
  // 2. Extract unique entity identifiers from committed_data for this import
  //    - SELECT DISTINCT row_data->>'{entity_field}' FROM committed_data 
  //      WHERE import_batch_id = ? AND tenant_id = ?
  
  // 3. Check existing entities
  //    - SELECT external_id FROM entities WHERE tenant_id = ? 
  //      AND external_id IN (unique_identifiers)
  //    - NOTE: Supabase .in() has 200-item batch limit! Batch if needed.
  
  // 4. Create new entities for unmatched identifiers
  //    - INSERT INTO entities (id, tenant_id, external_id, entity_type, ...)
  //    - entity_type: 'individual' unless the data indicates otherwise
  //    - display_name: can be constructed from name fields if available
  
  // 5. Return counts
}
```

### Korean Test Enforcement

The function must identify the entity identifier field through semantic roles or field_mappings, NOT by field name. The same function must work if the field is called `num_empleado`, `EmployeeID`, `직원번호`, or `officer_id`.

How to find the entity identifier field:
- Check `field_mappings` on the committed_data rows (or the import_batch metadata) for a field mapped to `entity_identifier` or `entity_id`
- OR check `semantic_roles` for `entity_identifier`
- OR check the SCI proposal's field classifications for which field was classified as the entity identifier
- If multiple fields could be the identifier, use the one with the highest cardinality relative to row count

### Supabase Batch Limit

**CRITICAL:** `supabase.from('entities').select().in('external_id', array)` silently returns zero rows if array > 200 items. Batch in groups of 200.

```typescript
// REQUIRED batching pattern
const BATCH_SIZE = 200;
const existingEntities = new Set<string>();
for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
  const batch = uniqueIds.slice(i, i + BATCH_SIZE);
  const { data } = await supabase
    .from('entities')
    .select('external_id')
    .eq('tenant_id', tenantId)
    .in('external_id', batch);
  data?.forEach(e => existingEntities.add(e.external_id));
}
```

**Proof gate PG-01:** Entity construction function exists. Handles dedup, batching, Korean Test (no hardcoded field names). Paste the full function.

**Commit:** `OB-144 Phase 1: Entity construction — create entities from imported data`

---

## PHASE 2: PERIOD CONSTRUCTION

After SCI commits data, the pipeline must detect and create periods.

### The Logic (from ENGINE_CONTRACT_BINDING.sql)

The SQL script does this:
1. Find rows with period indicators (month + year fields, or date fields)
2. Extract unique month/year combinations
3. For each combination, check if a period with that `canonical_key` already exists
4. Create new periods for combinations that don't exist

### Implementation Requirements

```typescript
// PSEUDOCODE
async function constructPeriods(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string
): Promise<{ created: number; matched: number; total: number }> {
  
  // 1. Find period indicator fields from committed_data
  //    Use field_mappings/semantic_roles to identify:
  //    - Month field (semantic_role: 'period_month' or similar)
  //    - Year field (semantic_role: 'period_year' or similar)
  //    - OR date field (semantic_role: 'transaction_date' or 'period_date')
  //    DO NOT hardcode 'Mes', 'Año', 'Fecha Corte'
  
  // 2. Extract unique period boundaries
  //    Strategy A (month + year fields):
  //      SELECT DISTINCT row_data->>'{month_field}', row_data->>'{year_field}'
  //    Strategy B (date field):
  //      Parse dates, extract month/year, deduplicate
  //    Strategy C (Excel serial date):
  //      Convert serial to date, extract month/year
  
  // 3. For each unique month/year, construct canonical_key: 'YYYY-MM'
  //    E.g., month=1, year=2024 → '2024-01'
  
  // 4. Check existing periods
  //    SELECT canonical_key FROM periods WHERE tenant_id = ? 
  //      AND canonical_key IN (keys)
  
  // 5. Create new periods
  //    INSERT INTO periods (id, tenant_id, label, period_type, status,
  //      start_date, end_date, canonical_key, metadata)
  //    - start_date: first day of month
  //    - end_date: last day of month
  //    - label: human-readable (e.g., 'January 2024' or tenant locale equivalent)
  //    - period_type: 'monthly'
  //    - status: 'open'
  
  // 6. Validate: year must be within reasonable range (current year ± 5)
  //    AP-22: Don't interpret month values (1,2,3) as years (2001,2002,2003)
}
```

### Period Label Localization

The label should be human-readable. If the tenant's data is in Spanish (Mes/Año), generate Spanish labels (Enero 2024). If English, generate English. Use a simple month name map or the detected language from the data. If uncertain, use numeric format: '2024-01'.

**Do NOT hardcode Spanish month names.** Use a locale-aware approach or fall back to numeric.

**Proof gate PG-02:** Period construction function exists. Handles month+year, date fields, Excel serial dates. AP-22 year validation included. Korean Test passes. Paste the full function.

**Commit:** `OB-144 Phase 2: Period construction — detect and create periods from imported data`

---

## PHASE 3: ENTITY_ID BINDING

After entities exist, bind committed_data rows to their entity.

### The Logic (from ENGINE_CONTRACT_BINDING.sql)

```sql
UPDATE committed_data cd
SET entity_id = e.id
FROM entities e
WHERE e.external_id = (cd.row_data->>'{entity_field}')
  AND e.tenant_id = cd.tenant_id
  AND cd.tenant_id = ?
  AND cd.entity_id IS NULL
  AND cd.row_data->>'{entity_field}' IS NOT NULL;
```

### Implementation Requirements

```typescript
// PSEUDOCODE
async function bindEntityIds(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string,
  entityField: string  // the row_data key containing entity identifiers
): Promise<{ bound: number; unbound: number }> {
  
  // 1. Get all entities for this tenant (with batching if > 200)
  //    Map: external_id → entity UUID
  
  // 2. Get all committed_data rows for this import where entity_id IS NULL
  //    In batches (committed_data could be 100K+ rows)
  
  // 3. For each row, look up row_data[entityField] in the entity map
  //    If found: set entity_id
  //    If not found: leave as orphan (log for later)
  
  // 4. Batch UPDATE committed_data with entity_id
  //    Use Supabase RPC or batch updates
  //    WARNING: Supabase .update() on 100K rows needs chunking
  
  // 5. Return bound/unbound counts
}
```

### Performance Consideration

Óptica Luminar has ~119K rows of committed_data. The binding must handle this volume without timeouts. Options:
- **Supabase RPC (preferred):** Write a PostgreSQL function that does the UPDATE in one statement (like the SQL binding script). Call it via `supabase.rpc()`. This is the fastest path.
- **Batch updates:** If RPC isn't available, batch UPDATE in groups of 1000 rows.

The SQL binding script ran in seconds against 119K rows. A single PostgreSQL UPDATE is far more efficient than 119K individual API calls. **Prefer the RPC approach.**

```sql
-- Example RPC function to bind entity_ids
CREATE OR REPLACE FUNCTION bind_entity_ids(
  p_tenant_id UUID,
  p_import_batch_id UUID,
  p_entity_field TEXT
) RETURNS TABLE(bound_count BIGINT, unbound_count BIGINT) AS $$
BEGIN
  -- Bind entity_id where entity matches
  UPDATE committed_data cd
  SET entity_id = e.id
  FROM entities e
  WHERE e.external_id = (cd.row_data->>p_entity_field)
    AND e.tenant_id = cd.tenant_id
    AND cd.tenant_id = p_tenant_id
    AND cd.import_batch_id = p_import_batch_id
    AND cd.entity_id IS NULL
    AND cd.row_data->>p_entity_field IS NOT NULL;
  
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM committed_data WHERE tenant_id = p_tenant_id AND import_batch_id = p_import_batch_id AND entity_id IS NOT NULL),
    (SELECT COUNT(*) FROM committed_data WHERE tenant_id = p_tenant_id AND import_batch_id = p_import_batch_id AND entity_id IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**If creating an RPC function:** Execute the migration in Supabase SQL Editor AND verify with a DB query. File existence ≠ applied. (Standing rule 6.)

**Proof gate PG-03:** Entity_id binding function exists. Handles 100K+ rows efficiently. Uses RPC or batched updates. Paste the function.

**Commit:** `OB-144 Phase 3: Entity_id binding — link committed_data rows to entities`

---

## PHASE 4: PERIOD_ID BINDING

After periods exist, bind committed_data rows to their period.

### The Logic (from ENGINE_CONTRACT_BINDING.sql)

Two strategies from the proven script:

**Strategy A — Month + Year fields:**
```sql
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE p.canonical_key = CONCAT(
    (cd.row_data->>'{year_field}')::text, 
    '-', 
    LPAD((cd.row_data->>'{month_field}')::text, 2, '0')
  )
  AND p.tenant_id = cd.tenant_id
  AND cd.period_id IS NULL;
```

**Strategy B — Date field (Excel serial or ISO):**
```sql
UPDATE committed_data cd
SET period_id = p.id
FROM periods p
WHERE ('1899-12-30'::date + ((cd.row_data->>'{date_field}')::int))
      BETWEEN p.start_date AND p.end_date
  AND p.tenant_id = cd.tenant_id
  AND cd.period_id IS NULL;
```

### Implementation Requirements

```typescript
// PSEUDOCODE
async function bindPeriodIds(
  supabase: SupabaseClient,
  tenantId: string,
  importBatchId: string,
  periodFields: {
    monthField?: string;  // row_data key for month
    yearField?: string;   // row_data key for year
    dateField?: string;   // row_data key for date (Excel serial or ISO)
  }
): Promise<{ bound: number; unbound: number }> {
  
  // Prefer RPC for same reasons as entity binding
  // The function must handle BOTH strategies:
  // - If monthField + yearField: use CONCAT + LPAD to build canonical_key
  // - If dateField: parse date, extract YYYY-MM, match to canonical_key
  // - If dateField is Excel serial number: convert using 1899-12-30 epoch
}
```

**Same RPC approach as Phase 3 is recommended.** Create a `bind_period_ids` function.

**Proof gate PG-04:** Period_id binding function exists. Handles month+year, date, and Excel serial formats. Paste the function.

**Commit:** `OB-144 Phase 4: Period_id binding — link committed_data rows to periods`

---

## PHASE 5: ASSIGNMENT CONSTRUCTION

After entities are created and bound, create rule_set_assignments linking them to the active plan.

### The Logic (from ENGINE_CONTRACT_BINDING.sql)

```sql
INSERT INTO rule_set_assignments (id, tenant_id, rule_set_id, entity_id, effective_from, assignment_type, metadata)
SELECT 
  gen_random_uuid(),
  e.tenant_id,
  rs.id,
  e.id,
  '{earliest_period_start}'::date,
  'standard',
  '{}'::jsonb
FROM entities e
CROSS JOIN (
  SELECT id FROM rule_sets 
  WHERE tenant_id = ? AND status = 'active' LIMIT 1
) rs
WHERE e.tenant_id = ?
  AND NOT EXISTS (
    SELECT 1 FROM rule_set_assignments rsa 
    WHERE rsa.entity_id = e.id AND rsa.rule_set_id = rs.id
  );
```

### Implementation Requirements

```typescript
// PSEUDOCODE
async function constructAssignments(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ created: number; existing: number }> {
  
  // 1. Find the active rule_set for this tenant
  //    If none exists: skip assignment creation (no plan to assign to)
  //    If multiple: use the most recently created one? Or the one linked to the import?
  
  // 2. Find entities without assignments to this rule_set
  //    SELECT e.id FROM entities e 
  //    WHERE e.tenant_id = ? 
  //    AND NOT EXISTS (SELECT 1 FROM rule_set_assignments 
  //                    WHERE entity_id = e.id AND rule_set_id = ?)
  
  // 3. Create assignments in batch
  //    Supabase .insert() with array — batch in groups of 200
  //    effective_from: start_date of the earliest period for this tenant
  //    assignment_type: 'standard'
  
  // 4. Return counts
}
```

### Single Active Plan Assumption

For now, assign to the single active plan. If multiple plans exist, log a warning and assign to the most recently activated. Future: support multi-plan assignment with admin confirmation.

**Proof gate PG-05:** Assignment construction function exists. Handles dedup (no duplicate assignments). Batched insert respects Supabase limits. Paste the function.

**Commit:** `OB-144 Phase 5: Assignment construction — link entities to active plan`

---

## PHASE 6: WIRE INTO SCI EXECUTE PIPELINE

Now wire all five functions into the SCI execute pipeline so they run automatically after data is committed.

### 6A: Find the execute hook point

The SCI execute API (`/api/import/sci/execute` or equivalent) commits data to committed_data. The construction functions must run AFTER the commit succeeds.

```bash
echo "=== SCI EXECUTE — FIND THE COMMIT POINT ==="
# Find where committed_data INSERT happens in the execute pipeline
grep -rn "committed_data.*insert\|\.from('committed_data').*insert\|bulkInsert.*committed" web/src/ --include="*.ts" | grep -v node_modules | grep -v .next | head -10
```

### 6B: Add post-commit construction

After committed_data is inserted, add calls to the five construction functions in order:

```typescript
// AFTER committed_data INSERT succeeds:

// Step 1: Create entities from imported data
const entityResult = await constructEntities(supabase, tenantId, importBatchId);

// Step 2: Create periods from date fields in imported data
const periodResult = await constructPeriods(supabase, tenantId, importBatchId);

// Step 3: Bind entity_id on committed_data rows
const entityBindResult = await bindEntityIds(supabase, tenantId, importBatchId, entityField);

// Step 4: Bind period_id on committed_data rows
const periodBindResult = await bindPeriodIds(supabase, tenantId, importBatchId, periodFields);

// Step 5: Create assignments for new entities
const assignmentResult = await constructAssignments(supabase, tenantId);

// Log the construction results
console.log('[SCI Pipeline Construction]', {
  entities: entityResult,
  periods: periodResult,
  entityBinding: entityBindResult,
  periodBinding: periodBindResult,
  assignments: assignmentResult,
});
```

### 6C: How to identify the entity and period fields

The SCI proposal (from the analyze step) contains semantic role assignments for each field. The execute step should receive or look up:
- Which field is the `entity_identifier` → used for entity construction + entity_id binding
- Which fields are `period_month` + `period_year` OR `transaction_date` → used for period construction + period_id binding

If semantic roles are not available on the committed_data rows, check:
1. `field_mappings` on the committed_data or import_batch
2. The SCI proposal metadata stored with the import
3. The `semantic_roles` JSONB column if it exists

If NONE of these are available, fall back to heuristic detection:
- Entity identifier: the field with the highest cardinality that isn't a date, amount, or percentage
- Period fields: fields with names matching common temporal patterns (using AI-classified semantic roles, not hardcoded strings)

### 6D: Run Engine Contract verification query

After construction completes, run the 7-value verification query and log the results. This is the pipeline's own health check.

**Proof gate PG-06:** Construction functions wired into SCI execute. Runs after commit. Logs results. Verification query runs at end. Paste the wired code showing the call sequence.

**Commit:** `OB-144 Phase 6: Wire construction into SCI execute pipeline`

---

## PHASE 7: TEST — FRESH IMPORT THROUGH ÓPTICA LUMINAR

### 7A: Preparation

To test the pipeline construction, we need to create conditions where the construction layer has work to do. Two options:

**Option A (Preferred): Use a different tenant.** If another test tenant exists with data that needs importing, use it. This proves the construction works generically, not just for Óptica.

**Option B: Reset and re-import for Óptica.**
1. Delete the SQL-binding-created entities, periods, assignments (keeping only the 22 seed entities, 1 seed period)
2. Null out entity_id and period_id on committed_data rows that were bound by the SQL script
3. Re-run SCI execute for the existing import
4. Verify the construction layer recreates what the SQL script created

**For Option B, the reset SQL would be:**
```sql
-- WARNING: Only run this for testing. Removes binding-script artifacts.
-- Delete non-seed assignments
DELETE FROM rule_set_assignments 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND created_at > '2026-03-01';  -- after the binding script ran

-- Delete non-seed periods (keep Febrero 2026)
DELETE FROM periods 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND canonical_key != '2026-02';

-- Delete non-seed entities (keep the 22 seed entities)
DELETE FROM entities 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND created_at > '2026-03-01';

-- Null out bindings on committed_data
UPDATE committed_data 
SET entity_id = NULL, period_id = NULL
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND import_batch_id IS NOT NULL;
```

### 7B: Run Engine Contract verification BEFORE test

```sql
-- BEFORE: Should show reduced numbers (seed only)
-- entity_count ≈ 22, period_count ≈ 1, assignment_count ≈ 12, bound_data_rows ≈ 0
```

### 7C: Trigger the construction

Either:
- Re-run the SCI execute endpoint for the existing import batch
- OR trigger a new import through the browser

### 7D: Run Engine Contract verification AFTER test

```sql
-- AFTER: Should show construction results
-- entity_count ≈ 741, period_count ≈ 4, assignment_count ≈ 741
-- bound_data_rows ≈ 114,807, orphaned_data_rows ≈ 4,340
```

### 7E: Compare to SQL binding script results

The construction layer should produce the SAME numbers as the SQL binding script:

| Metric | SQL Script Result | Pipeline Construction Result | Match? |
|--------|-------------------|------------------------------|--------|
| entity_count | 741 | ? | |
| period_count | 4 | ? | |
| assignment_count | 741 | ? | |
| bound_data_rows | 114,807 | ? | |
| orphaned_data_rows | 4,340 | ? | |

If the numbers don't match, investigate why. The pipeline should produce IDENTICAL results to the SQL script because it implements the same logic.

**Proof gate PG-07:** Engine Contract verification shows construction results matching (or very close to) SQL binding script results. Paste both BEFORE and AFTER query outputs.

**Commit:** `OB-144 Phase 7: Pipeline construction test — verification query proof`

---

## PHASE 8: COMPLETION REPORT + PR

### 8A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
npm run dev &
sleep 8
curl -s -o /dev/null -w "localhost:3000 status: %{http_code}\n" http://localhost:3000
kill %1 2>/dev/null
```

### 8B: Completion report

Save as `OB-144_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-144 COMPLETION REPORT
## Pipeline Construction Layer — SCI Now Fills the Engine Contract

### Engine Contract Verification — BEFORE
[Paste SQL output from Phase 0]

### Phase 1: Entity Construction
- Function location: [file:line]
- Korean Test: [PASS/FAIL — any hardcoded field names?]
- Supabase batching: [200-item limit respected?]

### Phase 2: Period Construction
- Function location: [file:line]
- Strategies implemented: [month+year / date / Excel serial]
- AP-22 validation: [year range check?]

### Phase 3: Entity_id Binding
- Function location: [file:line]
- Method: [RPC / batch update]
- Performance: [time for ~119K rows]

### Phase 4: Period_id Binding
- Function location: [file:line]
- Strategies: [month+year / date / both]

### Phase 5: Assignment Construction
- Function location: [file:line]
- Dedup: [NOT EXISTS check?]

### Phase 6: Pipeline Wiring
- Hook point: [file:line — where construction runs after commit]
- Call sequence: [entity → period → bind_entity → bind_period → assign]
- Field identification: [how entity/period fields are detected]

### Phase 7: Test Results
| Metric | SQL Script | Pipeline | Match |
|--------|-----------|----------|-------|
| entity_count | 741 | ? | |
| period_count | 4 | ? | |
| assignment_count | 741 | ? | |
| bound_data_rows | 114,807 | ? | |
| orphaned_data_rows | 4,340 | ? | |

### Engine Contract Verification — AFTER
[Paste SQL output from Phase 7]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | Diagnostic complete, gap documented |
| PG-01 | | Entity construction function |
| PG-02 | | Period construction function |
| PG-03 | | Entity_id binding function |
| PG-04 | | Period_id binding function |
| PG-05 | | Assignment construction function |
| PG-06 | | Pipeline wiring complete |
| PG-07 | | Test results match SQL script |

### Files Changed
[Every file with nature of change]

### RPC Functions Created (if any)
[List with SQL, note whether executed in Supabase AND verified]

### What This OB Does NOT Fix
- 4,340 orphaned rows (No_Tienda store-level data) → future OB
- SCI proposal UX refinements → future OB
- Multi-plan assignment UI → future OB
- N+1 query optimization → future OB
```

### 8C: Create PR

```bash
gh pr create --base main --head dev \
  --title "OB-144: Pipeline Construction Layer — SCI fills the Engine Contract" \
  --body "## What
The SCI pipeline now creates entities, periods, and assignments, and binds 
entity_id + period_id on committed_data rows AUTOMATICALLY after import.

## Why
CLT-137, 139, 142 all found the same gap: SCI classifies correctly but never 
constructs what the engine needs. The ENGINE_CONTRACT_BINDING.sql script proved 
the logic works. This OB wires that logic into the pipeline.

## Engine Contract
Verification query shows all 7 values non-zero after pipeline construction.
BEFORE and AFTER results in OB-144_COMPLETION_REPORT.md.

## Korean Test
Zero hardcoded field names. Entity/period fields identified via semantic roles.

## Proof Gates: PG-00 through PG-07
Documented in completion report."
```

**Proof gate PG-08:** PR created. Completion report committed. Build exits 0.

**Commit:** `OB-144 Phase 8: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Has Done Before | What To Do Instead |
|---|---|---|
| Hardcode field names | `if (key === 'num_empleado')` | Use semantic roles or field_mappings to find entity identifier field |
| Skip RPC, use 119K individual updates | `for (const row of rows) await update(row)` | Use PostgreSQL function via RPC, or batch in groups of 1000 |
| Forget Supabase 200-item batch limit | `.in('external_id', allIds)` with 719 items → 0 results | Batch in groups of 200 |
| Create construction as separate API route | `POST /api/pipeline/construct` | Wire INTO the existing SCI execute flow |
| Report PASS without verification query | "Construction functions created" | Run the 7-value verification query. Paste output. Numbers must be non-zero. |
| Interpret months as years (AP-22) | Month value 1 → year 2001 | Validate year is within current ± 5 range |
| Skip the test phase | "Functions are written, should work" | Phase 7 exists for a reason. Run the test. Paste BEFORE and AFTER. |
| Modify the engine | "Updated calculation engine to..." | The engine reads the 5 tables. Do NOT change the engine. Fill the tables. |

---

## WHAT SUCCESS LOOKS LIKE

After this OB, a fresh file uploaded through SCI → committed to committed_data → entities created automatically → periods detected automatically → entity_id bound on every row → period_id bound on every row → assignments created → Engine Contract verification query shows all non-zero → the engine can calculate without any manual SQL intervention.

The gap that caused 323+ findings across 11 CLTs is closed.

---

*"The engine never broke. The pipeline never filled the contract. Now it does."*
