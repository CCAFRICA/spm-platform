# HF-110: FIELD IDENTITY PIPELINE — THREE ROOT CAUSE FIXES
## DS-009 Production Verification Failures — Diagnosed from Live Data

**Priority:** P0 — Pipeline Blocked
**Trigger:** Production verification of OB-162 + HF-108 + HF-109. Import succeeds (200), HC runs (avgConf=1.00), but field_identities never stored in committed_data metadata. Convergence produces 0 bindings. Entity resolution creates 18 entities (9 hubs + 9 row indices) instead of 50 employees.
**Branch:** dev
**Ground truth:** MX$185,063 — Meridian Logistics Group, January 2025
**Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**VL Admin:** `9c179b53-c5ee-4af7-a36b-09f5db3e35f2` (platform@vialuce.com, role='platform', tenant_id IS NULL)
**Depends on:** OB-162 (PR #210) + HF-108 (PR #211) + HF-109 (PR #212) merged
**Controlling specification:** DS-009_Field_Identity_Architecture_20260308.md

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase sequentially. Commit and push after every change. If a phase fails, diagnose and fix — do not stop and ask.

---

## READ FIRST

1. Read `CC_STANDING_ARCHITECTURE_RULES.md` in the repo root.
2. Read `DS-009_Field_Identity_Architecture_20260308.md` in project knowledge. This is the controlling specification.

---

## WHY THIS HF EXISTS

Production verification of Decision 111 revealed three root causes that block the entire pipeline. All three were diagnosed from live Supabase queries — not hypothesized.

### ROOT CAUSE A: field_identities NOT stored in committed_data metadata

**Evidence (Supabase query):**
```sql
SELECT metadata ? 'field_identities' as has_fi_key FROM committed_data
WHERE tenant_id = '5035b1e8-...' GROUP BY metadata ? 'field_identities';
-- Result: has_fi_key = false for ALL 136 rows
```

**Actual metadata structure:**
```json
{
  "source": "sci",
  "proposalId": "...",
  "semantic_roles": { "No_Empleado": { "role": "entity_identifier", "confidence": 0.9 }, ... },
  "resolved_data_type": "plantilla",
  "informational_label": "entity"
}
```

`informational_label` is present (OB-162 added it). `field_identities` is absent. OB-162's code was:
```typescript
...(txnFieldIdentities ? { field_identities: txnFieldIdentities } : {})
```

`extractFieldIdentitiesFromTrace()` returns null because the classification trace structure doesn't match what it expects (`classificationTrace.headerComprehension.interpretations`). The HC data exists — logs show HC ran with avgConf=1.00 and produced all 32 column roles — but the extraction function can't find it in the trace object, so `txnFieldIdentities` is null and `field_identities` is never written.

**DS-009 Section 1.3 requires:** `metadata.field_identities` populated on every committed_data row.

### ROOT CAUSE B: Convergence reads components as top-level array, but plan stores variants

**Evidence (Supabase query):**
```sql
SELECT jsonb_array_length(components) FROM rule_sets WHERE tenant_id = '5035b1e8-...';
-- ERROR: cannot get array length of a non-array
```

**Actual plan structure:**
```json
{
  "variants": [
    { "variantId": "senior", "components": [ ...5 components... ] },
    { "variantId": "standard", "components": [ ...5 components... ] }
  ]
}
```

`rule_sets.components` is `{"variants": [...]}`, NOT a JSON array of components. Convergence code that reads `components` as an array finds nothing. It must unwrap `components.variants[N].components` to find the actual calculation intents.

Each component has a well-structured `calculationIntent` with:
- `operation`: "bounded_lookup_2d", "bounded_lookup_1d", "scalar_multiply", "conditional_gate"
- `input`/`inputs`: with `source: "metric"`, `sourceSpec: { field: "..." }`

These are exactly what convergence needs for structural matching — but convergence never reaches them because it can't unwrap the variant structure.

**DS-009 Section 4.1 requires:** Convergence matches plan component data requirements against field identities.

### ROOT CAUSE C: Entity resolution finds no field_identities, falls back to wrong column

**Evidence (Supabase query):**
```sql
SELECT external_id, display_name FROM entities WHERE tenant_id = '5035b1e8-...';
-- Result: 9 hubs (CDMX Hub, Chihuahua Hub, ...) + 9 digits (0, 1, 2, ...)
-- Expected: 50 employees (No_Empleado values)
```

Entity resolution (HF-109) scans `metadata.field_identities` for `structuralType === 'identifier'`. Since field_identities doesn't exist (Root Cause A), the function falls through to a fallback that picks the wrong column — producing hub names and row indices instead of employee numbers.

Meanwhile, `metadata.semantic_roles` correctly identifies `No_Empleado` as `entity_identifier` with confidence 0.9. Entity resolution doesn't check semantic_roles.

**DS-009 Section 3.1 requires:** Entity resolution reads committed_data and identifies person identifiers using field identities.

---

## THE THREE FIXES

**Fix A:** Build field_identities directly from HC's LLMHeaderResponse at the point where metadata is constructed in the execute pipeline — not by extracting from the classification trace after the fact. The HC response data is available at execute time. Use it directly.

**Fix B:** Convergence unwraps `components.variants[N].components` to find actual components with calculationIntents. Iterates all variants. Extracts `calculationIntent.operation` for structural matching.

**Fix C:** Entity resolution checks `metadata.semantic_roles` as a fallback when `metadata.field_identities` is absent. Uses `role === 'entity_identifier'` to find the person identifier column. This bridges old SCI agent output with DS-009's field identity model. Long-term, Fix A ensures field_identities is always populated, but Fix C provides robustness.

---

## WHAT NOT TO DO

1. **DO NOT attempt to fix `extractFieldIdentitiesFromTrace`.** The function is architecturally wrong — it tries to extract field identities from a trace object that was serialized with a different structure. Build field_identities directly from HC response instead.
2. **DO NOT hardcode column names, field names, or domain vocabulary.** Korean Test (AP-25).
3. **DO NOT assume plan component structure without querying.** The variant structure is a fact. Query `SELECT jsonb_typeof(components) FROM rule_sets` and handle both array and object formats. FP-49.
4. **DO NOT provide answer values (MX$185,063) to the engine.** Fix logic, not data.
5. **DO NOT create parallel code paths.** AP-17.
6. **DO NOT skip SQL verification.** Decision 78 — test with SQL first.

---

## PHASE 0: DIAGNOSTIC — TRACE THE EXACT FAILURE POINTS

### 0.1: Find where HC response is available during execute

```bash
# Where does the execute pipeline receive HC data?
grep -rn "headerComprehension\|hcResult\|LLMHeaderResponse\|classificationTrace\|hc_result\|header_comprehension" \
  web/src/app/api/import/sci/execute/route.ts | head -20

# Where is the classification trace constructed?
grep -rn "classificationTrace\|classification_trace" \
  web/src/app/api/import/sci/ web/src/lib/sci/ --include="*.ts" | head -20

# Where does extractFieldIdentitiesFromTrace get called?
grep -rn "extractFieldIdentities" \
  web/src/app/api/import/sci/execute/route.ts web/src/lib/sci/ --include="*.ts" | head -10
```

### 0.2: Find where convergence reads components

```bash
# How does convergence read plan components?
grep -rn "components\|rule_sets.*components\|planComponents\|comp\." \
  web/src/lib/intelligence/convergence-service.ts | head -20

# Does convergence handle the variant structure?
grep -rn "variant\|variants" \
  web/src/lib/intelligence/convergence-service.ts | head -10
```

### 0.3: Find where entity resolution falls back

```bash
# The fallback path in entity resolution when field_identities is missing
grep -rn "field_identities\|fallback\|identifier\|personId" \
  web/src/lib/sci/entity-resolution.ts | head -20
```

### 0.4: Verify HC response structure is accessible at execute time

This is critical — we need to know what data is available when building metadata.

```bash
# What does the content unit / proposal carry from HC?
grep -rn "contentUnit\|effectiveUnit\|proposalUnit\|classificationTrace\|headerComprehension" \
  web/src/app/api/import/sci/execute/route.ts | head -30

# What fields does the proposal/content unit have?
grep -rn "interface.*ContentUnit\|interface.*ProposalUnit\|type.*ContentUnit" \
  web/src/lib/sci/sci-types.ts | head -10
```

### 0.5: Decision 78 — SQL test of what field_identities SHOULD contain

Using the HC log output, construct what field_identities should look like for Datos_Rendimiento:

```sql
-- This is what metadata.field_identities SHOULD contain after Fix A
-- (constructed from HC log: sheet=Datos_Rendimiento roles=[No_Empleado:identifier@1.00, ...])
-- Verify this structure would enable convergence matching:

SELECT '{"No_Empleado": {"structuralType": "identifier", "contextualIdentity": "person_identifier", "confidence": 1.0},
  "Ingreso_Meta": {"structuralType": "measure", "contextualIdentity": "currency_amount", "confidence": 1.0},
  "Ingreso_Real": {"structuralType": "measure", "contextualIdentity": "currency_amount", "confidence": 1.0},
  "Mes": {"structuralType": "temporal", "contextualIdentity": "date", "confidence": 1.0}}'::jsonb as expected_field_identities;
```

### PROOF GATE 0:
```
□ HC response access point in execute pipeline identified (file:line)
□ extractFieldIdentitiesFromTrace call site identified — why it returns null (file:line + trace structure mismatch explained)
□ Convergence component reading code identified (file:line — expects array, gets {variants:[...]})
□ Entity resolution fallback path identified (file:line — what it does when field_identities missing)
□ Content unit / proposal structure documented — what HC data is available at execute time
□ SQL test of expected field_identities structure (paste)
```

**Commit:** `HF-110 Phase 0: three root cause diagnostic from production data` + push

---

## PHASE 1: FIX A — BRIDGE HC OUTPUT TO COMMITTED_DATA METADATA

### 1.1: Find the HC response at execute time

The SCI analyze route runs HC and stores the result in the proposal / classification signals. The SCI execute route receives the confirmed proposal with classification traces.

Find what HC data is available on the content unit at execute time. The HC response contains `sheets[sheetName].columns[colName]` with `columnRole` and `semanticMeaning` — these map directly to `structuralType` and `contextualIdentity`.

### 1.2: Build field_identities directly from HC data

Instead of calling `extractFieldIdentitiesFromTrace(classificationTrace)` (which fails), build field_identities directly from whatever HC data IS available on the content unit.

**Option 1:** If the content unit carries the full classification trace with HC data accessible at a different path than `extractFieldIdentitiesFromTrace` expects — fix the path.

**Option 2:** If the HC interpretations are stored in classification_signals (not on the content unit) — query classification_signals for this sheet's HC data and build field_identities from it.

**Option 3:** If the HC data is available as `semantic_roles` on the content unit (which we KNOW is stored in metadata) — transform semantic_roles to field_identities format. This is a mapping:
```typescript
// semantic_roles format (what exists):
{ "No_Empleado": { "role": "entity_identifier", "confidence": 0.9 } }

// field_identities format (what DS-009 needs):
{ "No_Empleado": { "structuralType": "identifier", "contextualIdentity": "person_identifier", "confidence": 0.9 } }
```

The mapping from semantic_roles role to structuralType:
- `entity_identifier` → structuralType: `identifier`, contextualIdentity: `person_identifier`
- `entity_name` → structuralType: `name`, contextualIdentity: `person_name`
- `entity_attribute` → structuralType: `attribute`, contextualIdentity from role context
- `measure` → structuralType: `measure`
- `temporal` → structuralType: `temporal`

**HOWEVER** — semantic_roles comes from the old SCI agent claims, NOT from HC. The HC data (which has columnRole + semanticMeaning at the granularity DS-009 needs) must be the source. The diagnostic in Phase 0 will determine which option is correct.

### 1.3: Regardless of the source, ensure field_identities is ALWAYS written

The conditional spread `...(fieldIdentities ? { field_identities: fieldIdentities } : {})` must be replaced with a guaranteed write. If field identity extraction fails for any reason, log a warning and write a minimal field_identities derived from whatever signal IS available (semantic_roles, data type analysis, etc.). field_identities should NEVER be absent from committed_data metadata.

```typescript
// BEFORE (conditional — produces null frequently):
...(fieldIdentities ? { field_identities: fieldIdentities } : {})

// AFTER (guaranteed — always writes something):
field_identities: fieldIdentities || buildFieldIdentitiesFromSemanticRoles(semanticRoles) || {}
```

### 1.4: Test with SQL (Decision 78)

After implementing the fix, generate the cleanup + re-import SQL for Andrew. But first, write a test that constructs committed_data metadata with field_identities and verifies the structure matches what convergence expects:

```bash
# Verify field_identities key appears in metadata construction for ALL four pipelines
grep -n "field_identities" web/src/app/api/import/sci/execute/route.ts
# Should show field_identities in entity, transaction, target, AND reference metadata
# Should NOT show conditional spread (?.) — must be guaranteed write
```

### PROOF GATE 1:
```
□ Root cause of extractFieldIdentitiesFromTrace returning null identified (paste: what trace structure is vs what function expects)
□ Fix implemented: field_identities built from correct HC data source (paste new code)
□ field_identities ALWAYS written — no conditional spread (paste metadata construction for all 4 pipelines)
□ Fallback: buildFieldIdentitiesFromSemanticRoles implemented (paste function)
□ Korean Test: zero language-specific strings in field identity construction (grep)
□ npm run build exits 0
```

**Commit:** `HF-110 Phase 1: bridge HC output to committed_data field_identities (DS-009 1.3)` + push

---

## PHASE 2: FIX B — CONVERGENCE UNWRAPS VARIANT COMPONENTS

### 2.1: Handle the variant structure

The plan's `components` column contains:
```json
{ "variants": [{ "variantId": "senior", "components": [...] }, { "variantId": "standard", "components": [...] }] }
```

Convergence must:
1. Detect whether `components` is an array (direct components) or an object with `variants` key
2. If variants, iterate all variants and collect all unique components
3. Extract `calculationIntent.operation` from each component for structural matching
4. For convergence binding purposes, components across variants that share the same input requirements can share the same binding

```typescript
// Extract components from rule_set, handling both formats
function extractPlanComponents(componentsJson: unknown): PlanComponent[] {
  if (Array.isArray(componentsJson)) {
    // Direct array of components
    return componentsJson;
  }
  if (componentsJson && typeof componentsJson === 'object' && 'variants' in componentsJson) {
    // Variant structure: { variants: [{ components: [...] }] }
    const variants = (componentsJson as { variants: Array<{ components: unknown[] }> }).variants;
    if (!Array.isArray(variants)) return [];
    
    // Collect components from first variant (all variants share the same structural pattern)
    // Convergence binds data to component TYPES, not variant-specific values
    const firstVariant = variants[0];
    if (firstVariant?.components && Array.isArray(firstVariant.components)) {
      return firstVariant.components as PlanComponent[];
    }
  }
  return [];
}
```

**Why first variant only:** All variants of the same component share the same structural pattern. "Revenue Performance - Senior" and "Revenue Performance - Standard" both need the same inputs (revenue_attainment metric + hub_route_volume metric via bounded_lookup_2d). The payout values differ, but the DATA REQUIREMENTS are identical. Convergence binds data sources, not payout amounts.

### 2.2: Verify each component's calculationIntent is accessible

From the production data, each component has:
```json
{
  "calculationIntent": {
    "operation": "bounded_lookup_2d",
    "inputs": { "row": { "source": "metric", "sourceSpec": { "field": "revenue_attainment" } }, ... }
  }
}
```

Convergence structural matching reads `calculationIntent.operation` for `getRequiredMeasureCount`. Verify this path works with the extracted components.

### 2.3: Schema verification (FP-49)

```bash
# Verify the actual structure before writing code that assumes it
grep -rn "extractPlanComponents\|variants.*components\|components.*variants" \
  web/src/lib/intelligence/convergence-service.ts | head -10
```

### PROOF GATE 2:
```
□ extractPlanComponents function handles both array and variant structure (paste function)
□ Convergence uses extractPlanComponents to get components (paste wiring)
□ calculationIntent.operation accessible from extracted components (paste evidence — log or test)
□ All 5 Meridian component operations identified: bounded_lookup_2d, bounded_lookup_1d, scalar_multiply, conditional_gate, scalar_multiply (paste from production data)
□ npm run build exits 0
```

**Commit:** `HF-110 Phase 2: convergence unwraps variant components (DS-009 4.1)` + push

---

## PHASE 3: FIX C — ENTITY RESOLUTION SEMANTIC_ROLES FALLBACK

### 3.1: Add semantic_roles as fallback signal source

In `web/src/lib/sci/entity-resolution.ts`, the entity resolution function scans `metadata.field_identities`. When that's missing, add a fallback that reads `metadata.semantic_roles`:

```typescript
// Primary: field_identities (DS-009)
const fieldIds = row.metadata?.field_identities as Record<string, FieldIdentity> | undefined;

// Fallback: semantic_roles (pre-DS-009 SCI agent claims)
if (!fieldIds || Object.keys(fieldIds).length === 0) {
  const semanticRoles = row.metadata?.semantic_roles as Record<string, { role?: string; confidence?: number }> | undefined;
  if (semanticRoles) {
    // Find entity_identifier from semantic_roles
    for (const [colName, sr] of Object.entries(semanticRoles)) {
      if (sr.role === 'entity_identifier') {
        idColumn = colName;
      }
      if (sr.role === 'entity_name') {
        nameColumn = colName;
      }
    }
  }
}
```

### 3.2: This is a bridge, not the permanent solution

Fix A (Phase 1) ensures field_identities is always populated going forward. Fix C ensures entity resolution works even with old data that only has semantic_roles. Once Fix A is deployed and data is re-imported, all committed_data rows will have field_identities and this fallback won't be needed. But it provides robustness.

### 3.3: Remove the digit/index fallback

The current code produces entities with external_id = "0", "1", "2"... — these are row indices or column indices being picked up as identifiers. The fallback that picks "any identifier column" when no person identifier is found must be more careful. If the candidate identifier column produces values that look like sequential small integers (0, 1, 2, 3...), it's likely a row index, not a real identifier. Skip it.

```typescript
// Guard against row index misidentification
function looksLikeRowIndex(values: string[]): boolean {
  if (values.length < 3) return false;
  const nums = values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
  if (nums.length < values.length * 0.8) return false;
  // Check if values are sequential starting from 0 or 1
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[0] <= 1 && sorted[sorted.length - 1] === sorted.length - 1 + sorted[0];
}
```

### PROOF GATE 3:
```
□ semantic_roles fallback implemented in entity resolution (paste code)
□ field_identities remains primary signal source (paste priority logic)
□ Row index guard implemented (paste looksLikeRowIndex or equivalent)
□ Korean Test: entity resolution uses role strings ("entity_identifier"), not column names (grep)
□ npm run build exits 0
```

**Commit:** `HF-110 Phase 3: entity resolution semantic_roles fallback (DS-009 3.1)` + push

---

## PHASE 4: SQL VERIFICATION + CLEANUP + BUILD

### 4.1: Generate cleanup SQL for Andrew

```sql
-- HF-110 Cleanup: Clear Meridian data for re-import through fixed pipeline
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Reset input_bindings to empty (convergence will regenerate)
UPDATE rule_sets SET input_bindings = '{}'::jsonb
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Verify plan preserved
SELECT id, name, status FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

### 4.2: Post-re-import verification SQL

```sql
-- V1: field_identities present in metadata (Fix A proof)
SELECT
  import_batch_id,
  metadata->>'informational_label' as label,
  metadata ? 'field_identities' as has_fi,
  count(*) as rows
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY import_batch_id, metadata->>'informational_label', metadata ? 'field_identities';
-- Expected: has_fi = true for ALL batches

-- V2: field_identities contain correct structural types (Fix A detail)
SELECT DISTINCT ON (import_batch_id)
  import_batch_id,
  metadata->>'informational_label' as label,
  jsonb_pretty(metadata->'field_identities') as field_identities
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND metadata ? 'field_identities'
ORDER BY import_batch_id;
-- Expected: structuralType + contextualIdentity for each column

-- V3: convergence_bindings populated (Fix B proof)
SELECT
  input_bindings ? 'convergence_bindings' as has_cb,
  input_bindings->'convergence_bindings' IS NOT NULL as cb_not_null,
  jsonb_typeof(input_bindings->'convergence_bindings') as cb_type
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
-- Expected: has_cb = true, cb_type = object with component_N keys

-- V4: Entity count (Fix C proof)
SELECT count(*) as entity_count FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
-- Expected: 50 (not 9, not 18)

-- V5: Entity values are employee IDs not hubs (Fix C proof)
SELECT external_id, display_name FROM entities
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
ORDER BY external_id
LIMIT 10;
-- Expected: No_Empleado values and Nombre_Completo values, NOT hub names or digits

-- V6: Engine Contract 7-value
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
-- Expected: rule_sets=1, entities=50, committed_data≥136, reference_data=0, reference_items=0
```

### 4.3: Build and PR

```bash
kill dev server
rm -rf .next
npm run build   # MUST exit 0
npm run dev

gh pr create --base main --head dev \
  --title "HF-110: Field identity pipeline — three root cause fixes from production verification" \
  --body "Fixes three production-diagnosed root causes blocking Decision 111 pipeline.

## Root Causes (from Supabase production queries)
A. field_identities never stored in committed_data metadata — extractFieldIdentitiesFromTrace returns null
B. Convergence reads components as array but plan stores {variants: [{components: [...]}]}
C. Entity resolution finds no field_identities, falls back to wrong column (9 hubs + 9 digits instead of 50 employees)

## Fixes
A. Build field_identities directly from HC response data, not from trace extraction. Guaranteed write — never conditional.
B. extractPlanComponents handles both array and variant structures. Uses first variant's components for structural matching.
C. Entity resolution falls back to semantic_roles when field_identities absent. Row index guard prevents 0,1,2,3 misidentification.

## Verification
- field_identities present on ALL committed_data rows
- convergence_bindings populated (≥1 component binding)
- 50 entities created (No_Empleado values, not hub names)
- MX\$185,063 pending Andrew's production verification"
```

### PROOF GATE 4:
```
□ Cleanup SQL generated (paste)
□ Post-re-import verification SQL generated (paste — 6 queries)
□ npm run build exits 0 (paste last 5 lines)
□ PR created (paste PR URL)
□ Completion report saved as HF-110_COMPLETION_REPORT.md
```

---

## COMPLETION REPORT REQUIREMENTS (Evidentiary Gates — Slot 25)

The completion report MUST include:
1. For each root cause: the exact code that was wrong (file:line) and the exact code that replaces it
2. For Fix A: the actual HC data source used (not the trace — what DOES work)
3. For Fix B: the extractPlanComponents function with both format handlers
4. For Fix C: the semantic_roles fallback with priority logic
5. grep results confirming Korean Test compliance
6. npm run build output

---

## ANDREW'S PRODUCTION VERIFICATION (Post-Merge)

After Andrew merges HF-110 and Vercel deploys:

1. **Run cleanup SQL** (Phase 4.1 above) in Supabase SQL Editor
2. **Verify plan preserved** with input_bindings reset to `{}`
3. **Upload Meridian XLSX** on vialuce.ai
4. **Check Vercel Runtime Logs** for:
   - `field_identities` in metadata log lines (Fix A working)
   - Convergence log showing >0 component bindings (Fix B working)
   - Entity resolution showing 50 created (Fix C working)
5. **Run post-re-import verification SQL** (Phase 4.2 — all 6 queries)
6. **Navigate to Calculate** → run January 2025
7. **Verify MX$185,063** rendered
8. **Screenshot** as production evidence

**No finding marked ✅ without production evidence.**

---

## SCOPE BOUNDARIES

**IN SCOPE:**
- Fix A: Bridge HC output to committed_data field_identities
- Fix B: Convergence unwraps variant component structure
- Fix C: Entity resolution semantic_roles fallback + row index guard

**OUT OF SCOPE:**
- HC prompt changes (OB-162 — correct as-is)
- Engine data resolution logic (HF-108 + HF-109 — correct pending working convergence bindings)
- Convergence Pass 2 structural matching (HF-109 — correct pending working component extraction)
- Evaluate surface, flywheel, new tenants

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ Every fix traces to a DS-009 section and a production query result?
□ Anti-Pattern Registry checked — zero violations?
□ FP-49: Schema/structure verified before writing code? (components variant structure)
□ Korean Test: zero language-specific strings in new code?
□ Evidentiary gates: pasted code/output/grep, not PASS/FAIL?
□ Decision 78: SQL tests prepared for production verification?
□ No conditional field_identities write — guaranteed on every row?
□ Git commands from repo root?
```

---

*HF-110 — Field Identity Pipeline Root Cause Fixes | March 9, 2026*

*"The HC data was there all along. It just couldn't find its way to the metadata. The plan components were there all along. Convergence just couldn't unwrap them. The employee IDs were there all along. Entity resolution just couldn't see them. Three bridges, one pipeline."*
