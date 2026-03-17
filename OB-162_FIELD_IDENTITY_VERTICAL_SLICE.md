# OB-162: FIELD IDENTITY VERTICAL SLICE
## Decision 111 — Phase 1 through Phase 4 as Single Vertical Slice

**Priority:** P0 — Architecture
**Trigger:** DS-009 (Decision 111 — Field Identity Architecture)
**Branch:** dev
**Ground truth:** MX$185,063 — Meridian Logistics Group, January 2025
**Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
**VL Admin:** `9c179b53-c5ee-4af7-a36b-09f5db3e35f2` (platform@vialuce.com, role='platform', tenant_id IS NULL)

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I." Just act. Execute every phase sequentially. Commit and push after every change. If a phase fails, diagnose and fix — do not stop and ask.

---

## READ FIRST — CC_STANDING_ARCHITECTURE_RULES.md

Read the full contents of `CC_STANDING_ARCHITECTURE_RULES.md` in the repo root before proceeding. Every principle, anti-pattern, and operational rule applies to this OB.

---

## WHAT THIS OB DOES

This OB implements the first vertical slice of Decision 111 (Field Identity Architecture). The core change: **import identifies WHAT each column IS (field identity) and stores everything in committed_data. Convergence matches plan requirements against field identities. The engine queries committed_data via convergence bindings.**

The vertical slice proves the full chain: import → field identity → unified storage → convergence → calculation → rendered MX$185,063.

### WHAT CHANGES

1. HC prompt changes from "what role does each column play?" to "what IS each column?"
2. Import stores field identities in committed_data.metadata.field_identities
3. Import stops routing to reference_data/reference_items — all data → committed_data
4. Classification becomes informational labeling (metadata.informational_label), not routing logic
5. Convergence matches plan component data requirements against field identities
6. Engine queries committed_data via convergence input_bindings (batch_id + column name)

### WHAT STAYS THE SAME

- HC still runs via AIService (HF-100/101 uniformity)
- Level 1 HC pattern classifier still runs (informational)
- Level 2 CRR still exists in codebase (not touched)
- Entity resolution still creates entities table rows (but from committed_data field identities)
- Structural primitives unchanged
- rule_sets, periods, rule_set_assignments unchanged
- source_date extraction unchanged (Decision 92)
- Plan import/interpretation unchanged

---

## WHAT NOT TO DO

1. **DO NOT route data to reference_data or reference_items.** All data → committed_data. This is the core architectural change.
2. **DO NOT hardcode column names, field names, or domain vocabulary.** Korean Test (AP-25) applies to ALL field identification and convergence matching.
3. **DO NOT create separate code paths for entity/transaction/reference processing.** Single committed_data insert path. AP-17.
4. **DO NOT send row data through HTTP bodies.** File storage transport (AP-1). Existing bulk pipeline stays.
5. **DO NOT create new database tables.** Use existing metadata JSONB column on committed_data.
6. **DO NOT delete reference_data or reference_items tables.** Deprecate — stop writing and reading. Tables stay in schema.
7. **DO NOT provide answer values (MX$185,063) to the engine.** Fix logic, not data. The engine must derive the correct result from source material.
8. **DO NOT ask questions.** Execute autonomously. Diagnose and fix failures inline.
9. **DO NOT modify plan import or plan interpretation.** The plan is already imported correctly (rule_set exists).
10. **DO NOT create periods during import.** Decision 92: engine creates at calc time from source_date.

---

## PRE-IMPLEMENTATION: ARCHITECTURE DECISION GATE

Before writing ANY code, answer these questions in writing and commit as `OB-162_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================
Problem: Import currently routes data to separate tables (entities, committed_data, 
reference_data) based on classification. This forces premature routing decisions. 
Decision 111 requires unified storage with field identity metadata.

Option A: Modify existing SCI execute route to store field identities and route 
everything to committed_data. Modify convergence to match field identities.
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option B: Create new import pipeline alongside existing one (parallel paths).
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Option A is the only acceptable answer.** Option B violates AP-17 (dual code paths). If CC chooses Option B, it has failed the Architecture Decision Gate.

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE VERIFICATION

Before any changes, verify the current state. This establishes the baseline.

### 0.1: Schema verification

```bash
# Verify committed_data schema (metadata column exists and is JSONB)
# Use SQL against information_schema — FP-49 compliance
```

Run in Supabase SQL Editor:
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'committed_data'
ORDER BY ordinal_position;
```

Paste full output in completion report.

### 0.2: Current data state

```sql
-- Engine Contract verification (7-value query)
SELECT 
  (SELECT count(*) FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as committed_data,
  (SELECT count(*) FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_data,
  (SELECT count(*) FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as reference_items,
  (SELECT count(*) FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as periods,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79') as assignments;
```

Expected (from handoff): rule_sets=1, entities=50, committed_data=86, reference_data=0, reference_items=0, periods=0.

### 0.3: Current input_bindings state

```sql
SELECT input_bindings FROM rule_sets 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Expected: empty `{}` (convergence not yet working — handoff Section 1 P0 item #3).

### 0.4: Trace existing HC output

```bash
# Find the current HC prompt and response structure
grep -rn "header.*comprehension\|headerComprehension\|HC.*prompt\|hc.*prompt" web/src/ --include="*.ts" --include="*.tsx" | head -30

# Find where HC results are consumed in the execute pipeline
grep -rn "columnRoles\|column_roles\|headerAnalysis\|hcResult" web/src/ --include="*.ts" --include="*.tsx" | head -30

# Find the SCI execute route
grep -rn "classification\|entity.*route\|transaction.*route\|reference.*route" web/src/app/api/import/sci/execute/ --include="*.ts" | head -30
```

### 0.5: Trace existing convergence

```bash
# Find convergence service
grep -rn "convergence\|input_bindings\|token.*overlap\|tokenize" web/src/ --include="*.ts" --include="*.tsx" | head -40

# Find where convergence writes input_bindings
grep -rn "input_bindings" web/src/ --include="*.ts" | head -20
```

### PROOF GATE 0:
```
□ committed_data schema pasted (columns, types, nullability)
□ Engine Contract 7-value query pasted
□ input_bindings content pasted (expect empty {})
□ HC prompt location identified (file:line)
□ HC output structure identified (what fields it returns)
□ SCI execute routing logic identified (file:line for entity/transaction/reference fork)
□ Convergence service location identified (file:line)
□ Convergence input_bindings write location identified (file:line)
```

**Commit:** `OB-162 Phase 0: diagnostic baseline` + push

---

## PHASE 1: DATA CLEANUP + HC FIELD IDENTITY

### 1.1: Clean existing Meridian data (SQL — Andrew executes)

Generate the cleanup SQL for Andrew to run. This clears the existing import data so the re-import flows through the new field identity path.

```sql
-- CLEANUP SQL FOR ANDREW — do not execute in CC
-- Clears Meridian import data while preserving plan (rule_set) and tenant

DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM reference_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM reference_items WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Verify plan preserved
SELECT id, name, status FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

**IMPORTANT:** Verify column names against SCHEMA_REFERENCE_LIVE.md before generating cleanup SQL. Run `SELECT column_name FROM information_schema.columns WHERE table_name = 'X'` for every table in the DELETE statements. FP-49.

### 1.2: Modify HC prompt — stable question

Find the HC prompt template. Change the question from contextual ("what role does each column play in this sheet?") to stable ("what IS each column?").

**Current HC prompt** (locate in codebase — grep from Phase 0):

The new HC prompt must ask:
```
For each column, identify WHAT the column IS — not how it's used in this sheet.

For each column, provide:
1. structuralType: one of [identifier, name, temporal, measure, attribute, reference_key]
   - identifier: uniquely identifies something (person, location, transaction)
   - name: human-readable label
   - temporal: date, period, timestamp
   - measure: numeric value representing a quantity
   - attribute: categorical or descriptive property
   - reference_key: links to another dataset
2. contextualIdentity: what kind of identifier/measure/etc (e.g., person_identifier, location_code, currency_amount, delivery_percentage)
3. confidence: 0.0-1.0

Respond ONLY with valid JSON. No markdown, no explanation.
```

**Korean Test verification:** The structuralType list is language-agnostic. No field-name matching in the prompt. HC uses column headers + data samples for identification, which is language-aware by design (HC reads whatever language the headers are in).

### 1.3: Modify HC response parsing

HC's response must be parsed into the FieldIdentity structure:

```typescript
interface FieldIdentity {
  structuralType: 'identifier' | 'name' | 'temporal' | 'measure' | 'attribute' | 'reference_key';
  contextualIdentity: string;
  confidence: number;
}

// Stored per-batch in metadata:
// metadata.field_identities: Record<string, FieldIdentity>
// Key = original column name (customer vocabulary)
```

Update the HC parsing code to extract field identities instead of (or in addition to) column roles.

### 1.4: Modify SCI execute — unified committed_data storage

Find the execute route's routing fork (Phase 0 identified the file:line). Currently it routes:
- Entity-classified → entities table
- Transaction-classified → committed_data table  
- Reference-classified → reference_data/reference_items tables

**Change to:**
- ALL classifications → committed_data table
- Field identities stored in metadata.field_identities
- Classification stored in metadata.informational_label (informational only)
- Entity resolution still runs post-insert (creates entities from person identifiers)

The entity resolution logic must be preserved but modified:
- Instead of "this sheet was classified as entity, so create entities from it"
- Change to "scan committed_data rows for columns with structuralType='identifier' + contextualIdentity containing 'person', deduplicate, create/update entities"

**Critical:** Entity resolution must still populate entity_id on committed_data rows. The engine needs entity_id to iterate over entities.

### 1.5: Reference data routing removal

Remove the code path that writes to reference_data and reference_items. Replace with committed_data insert using the same row_data + metadata structure.

**DO NOT delete the reference_data/reference_items tables.** Only stop writing to them.

### PROOF GATE 1:
```
□ HC prompt updated — asks "what IS each column?" (paste new prompt text)
□ HC response parsing updated — extracts FieldIdentity structure (paste code)
□ SCI execute route modified — all classifications → committed_data (paste routing code diff)
□ metadata.field_identities structure populated on committed_data rows (paste example)
□ metadata.informational_label populated (paste example)
□ Entity resolution preserved — creates entities from person identifier field identities (paste code)
□ reference_data/reference_items writes removed (grep -rn "reference_data\|reference_items" in execute route — zero writes)
□ Korean Test: zero language-specific string literals in field identification code (grep confirmation)
□ npm run build exits 0
```

**Commit:** `OB-162 Phase 1: HC field identity + unified committed_data storage` + push

---

## PHASE 2: CONVERGENCE ENHANCEMENT

### 2.1: Define plan component data requirements

The plan's components (in rule_sets.components JSONB) define what calculation each component performs. Convergence needs to know what DATA each component requires.

Examine the existing Meridian rule_set components:
```sql
SELECT components FROM rule_sets 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Each component has a calculationIntent with input sources (metric:actual, metric:target, etc.). Convergence must map these input source requirements to committed_data columns via field identities.

### 2.2: Implement field identity convergence matching

Replace the existing token-overlap convergence with field identity matching.

**Three-pass algorithm:**

**Pass 1 — Structural match:** Find committed_data batches (grouped by import_batch_id) that have the required structural types. A component needing a measure + identifier + temporal can only bind to batches that have all three.

```typescript
// Pseudocode — actual implementation in convergence service
async function structuralMatch(
  tenantId: string, 
  requirement: { requiredType: string; context?: string }
): Promise<BatchMatch[]> {
  // Query committed_data metadata for batches with matching structural types
  // Use JSONB path queries against metadata.field_identities
  // Return: batch_id, column_name, field_identity for each match
}
```

**Pass 2 — Contextual match:** Among structurally valid candidates, use contextualIdentity to disambiguate. If two batches both have measures, but one has currency_amount and the other has delivery_percentage, the component's input description narrows the match.

**Pass 3 — Semantic match:** Flywheel knowledge (future — skip for now, Pass 1+2 sufficient for Meridian).

### 2.3: Generate input_bindings

Write the convergence result to rule_sets.input_bindings:

```jsonc
{
  "component_0": {
    "actual": {
      "source_batch_id": "uuid",
      "column": "Ingreso_Real",
      "field_identity": { "structuralType": "measure", "contextualIdentity": "currency_amount" },
      "match_pass": 2,
      "confidence": 0.92
    },
    "target": { ... },
    "entity_identifier": { ... },
    "period": { ... }
  },
  "component_1": { ... }
}
```

### 2.4: Trigger convergence after import

After SCI execute completes (Phase 1), trigger convergence automatically. Convergence reads:
- All committed_data metadata.field_identities for this tenant
- All rule_sets.components for this tenant
- Produces input_bindings

### PROOF GATE 2:
```
□ Convergence service reads field identities from committed_data metadata (paste code)
□ Pass 1 structural matching implemented (paste matching logic)
□ Pass 2 contextual matching implemented (paste matching logic)
□ input_bindings written to rule_sets (paste resulting JSON from DB query)
□ input_bindings reference specific batch_id + column names (not token overlap)
□ Zero hardcoded column names in convergence matching (grep confirmation)
□ Convergence triggered automatically after SCI execute (paste wiring code)
□ npm run build exits 0
```

**Commit:** `OB-162 Phase 2: field identity convergence + input_bindings generation` + push

---

## PHASE 3: ENGINE — QUERY VIA CONVERGENCE BINDINGS

### 3.1: Modify engine data resolution

The engine currently resolves input data by querying committed_data with entity_id + period_id (or source_date). Under Decision 111, the engine reads input_bindings to know WHICH batch and WHICH column to query.

Find the engine's data resolution code:
```bash
grep -rn "input_bindings\|metric.*actual\|metric.*target\|resolveInput\|getEntityData" web/src/ --include="*.ts" | head -30
```

Modify to:
1. Read input_bindings for the component being calculated
2. For each input (actual, target, entity_identifier, period):
   - Extract source_batch_id and column name from bindings
   - Query committed_data WHERE import_batch_id = source_batch_id AND row_data->>entity_column = entity_external_id AND source_date BETWEEN period_start AND period_end
   - Extract the bound column value from row_data

### 3.2: Modify lookup table resolution

For components using bounded_lookup_1d or bounded_lookup_2d, the lookup tables (rate schedules) come from the plan's components JSONB — NOT from committed_data. The lookup grid is part of the plan interpretation output (already in rule_sets.components). Verify this is the case:

```sql
SELECT jsonb_pretty(components->0->'calculationIntent') 
FROM rule_sets 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

If lookup tables are embedded in the component intent, no change needed for lookup resolution. If they reference external data (reference_data), modify to read from committed_data via convergence bindings.

### 3.3: Ensure periods work (Decision 92)

Periods are created at calculation time from source_date. Verify the engine creates periods from source_date ranges:

```bash
grep -rn "source_date\|period.*create\|period.*generate\|BETWEEN" web/src/ --include="*.ts" | head -20
```

### 3.4: Test with SQL first (Decision 78)

Before modifying engine code, manually construct the query the engine would run and verify it returns correct data:

```sql
-- For one entity (pick any from entities table), get their data via field identity bindings
-- This query mimics what the engine will do after convergence

-- Step 1: Get an entity
SELECT id, external_id, display_name FROM entities 
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' 
LIMIT 1;

-- Step 2: Get their committed_data using the bound column
-- (Replace $external_id with the value from step 1)
-- (Replace $column_name with the actual column from input_bindings)
SELECT row_data->>$column_name as value, source_date
FROM committed_data
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND row_data->>$entity_column = $external_id
  AND source_date IS NOT NULL;
```

Paste full SQL query and results in completion report.

### PROOF GATE 3:
```
□ Engine reads input_bindings for data resolution (paste code diff)
□ Engine queries committed_data using batch_id + column from bindings (paste query construction code)
□ Manual SQL test returns correct data for one entity (paste SQL + results)
□ Lookup table resolution verified — from components JSONB or from committed_data via bindings (paste evidence)
□ Period creation from source_date verified (paste code reference)
□ Zero references to reference_data/reference_items in engine code (grep confirmation)
□ npm run build exits 0
```

**Commit:** `OB-162 Phase 3: engine queries via convergence bindings` + push

---

## PHASE 4: LOCALHOST PROOF — VERTICAL SLICE

### 4.1: Clean localhost test

```bash
kill dev server
rm -rf .next
npm run build
npm run dev
```

Confirm localhost:3000 responds.

### 4.2: Re-import test (requires Andrew to upload Meridian XLSX on localhost or production)

**NOTE TO ANDREW:** After merging this PR, you will need to:
1. Run the cleanup SQL from Phase 1.1 in Supabase
2. Upload the Meridian XLSX on vialuce.ai
3. Verify field identities appear in committed_data metadata
4. Navigate to Calculate/Evaluate and verify convergence bindings
5. Run calculation for January 2025
6. Verify MX$185,063

### 4.3: Automated CLT phase

Create a diagnostic script that verifies the full chain WITHOUT browser interaction (for CC to run on localhost):

```bash
# Verify committed_data has field_identities in metadata
# This is a DB query, not a browser test
```

```sql
-- After re-import, verify field identities
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
- entities ≥ 50 (from field identity entity resolution)
- committed_data ≥ 86 (all data, including what was previously reference_data)
- reference_data = 0 (no new writes)
- reference_items = 0 (no new writes)
- periods = 0 (engine creates at calc time)
- input_bindings ≠ {} (convergence populated)

### PROOF GATE 4:
```
□ npm run build exits 0 (paste last 5 lines of build output)
□ localhost:3000 responds (paste confirmation)
□ committed_data has field_identities in metadata (paste DB query + result)
□ reference_data = 0, reference_items = 0 (paste engine contract query)
□ input_bindings populated (paste full JSON)
□ Entity count correct (paste count)
□ Zero console errors on localhost (paste browser console screenshot or text)
```

**Commit:** `OB-162 Phase 4: localhost vertical slice proof` + push

---

## PHASE 5: BUILD + PR

```bash
# Final clean build
kill dev server
rm -rf .next
npm run build   # MUST exit 0
npm run dev     # confirm localhost:3000

# Create PR
gh pr create --base main --head dev \
  --title "OB-162: Decision 111 Field Identity Vertical Slice" \
  --body "Implements Decision 111 (DS-009): Field Identity Architecture.

## What Changed
- HC prompt asks 'what IS each column?' (stable question) instead of 'what role does each column play?' (contextual question)
- All imported data stored in committed_data with field_identities in metadata
- reference_data/reference_items deprecated — zero new writes
- Convergence matches plan requirements against field identities (3-pass: structural → contextual → semantic)
- Engine queries committed_data via convergence input_bindings
- Classification becomes informational labeling, not routing logic

## Proof
- Meridian 3-sheet import: all data → committed_data with field identities
- Convergence: input_bindings populated for all 5 components
- Engine: queries via convergence bindings
- Ground truth: MX\$185,063 pending Andrew's production verification

## Decision 111 Specification
DS-009_Field_Identity_Architecture_20260308.md"
```

### PROOF GATE 5:
```
□ npm run build exits 0 (paste last 5 lines)
□ PR created with descriptive title and body (paste PR URL)
□ Completion report saved to project root as OB-162_COMPLETION_REPORT.md
```

---

## COMPLETION REPORT REQUIREMENTS (Evidentiary Gates — Slot 25)

The completion report MUST include pasted evidence for EVERY proof gate. PASS/FAIL self-attestation is NOT accepted.

For each proof gate, paste:
- The actual code (not a description of the code)
- The actual terminal output (not "it worked")
- The actual grep results (not "no matches found")
- The actual DB query results (not "correct count")

If any proof gate cannot produce evidence, explain why and mark as INCOMPLETE — not PASS.

---

## ANDREW'S PRODUCTION VERIFICATION (Post-Merge)

After Andrew merges this PR to main and Vercel deploys to production:

1. **Run cleanup SQL** from Phase 1.1 in Supabase SQL Editor
2. **Verify plan preserved:** `SELECT id, name FROM rule_sets WHERE tenant_id = '5035b1e8-...'`
3. **Upload Meridian XLSX** on vialuce.ai (3-sheet file: Plantilla, Datos_Rendimiento, Datos_Flota_Hub)
4. **Check Vercel Runtime Logs** for any errors during import
5. **Verify in Supabase:**
   - committed_data has field_identities in metadata
   - reference_data = 0 (no new writes)
   - input_bindings populated on rule_set
6. **Navigate to Calculate** → run January 2025
7. **Verify MX$185,063** rendered in browser
8. **Screenshot** the rendered result as production evidence

**No finding is marked ✅ without production evidence.** Localhost PASS ≠ production PASS.

---

## SCOPE BOUNDARIES

**IN SCOPE:**
- HC prompt change (stable question)
- Field identity metadata on committed_data
- Unified committed_data storage (no routing to reference_data)
- Convergence field identity matching (Pass 1 + Pass 2)
- Engine data resolution via convergence bindings
- Entity resolution from field identities
- Informational classification labeling

**OUT OF SCOPE:**
- Evaluate surface (DS-007 — separate OB)
- Flywheel semantic identity learning (Pass 3 — future)
- Field Identity Registry UI
- Progressive entity resolution across imports
- CRR integration with convergence
- Plan import/interpretation changes
- reference_data/reference_items table deletion (deprecated only)
- New proof tenant data (Sabor, Caribe)
- Performance research

---

## ANTI-PATTERN CHECKLIST

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Scale test: works for 10x current volume?
□ AI-first: zero hardcoded field names/patterns added?
□ All Supabase migrations executed AND verified with DB query?
□ Proof gates verify LIVE/RENDERED state, not file existence?
□ Browser console clean on localhost?
□ Real data displayed, no placeholders?
□ Single code path (no duplicate pipelines)?
□ Atomic operations (clean state on failure)?
□ Korean Test: would this work with Hangul column names?
□ No SQL with unverified column names (FP-49)?
□ Git commands from repo root, not web/?
□ Evidentiary gates: pasted code/output/grep, not PASS/FAIL?
```

---

*OB-162 — Decision 111 Field Identity Vertical Slice | March 8, 2026*

*"Import identifies what data IS. Convergence determines how it's USED. Hub is always Hub. What changes is the question you're asking about it."*
