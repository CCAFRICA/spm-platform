# OB-182: CLT-181 P0 Resolution — Import Independence + Plan Converter + Calculation Engine

## Date: March 21, 2026
## Type: OB (Objective Build)
## Scope: Fix all 6 P0 findings from CLT-181 browser testing

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Open and read `CC_STANDING_ARCHITECTURE_RULES.md` in the repository root.

---

## CONTEXT — WHAT THE BROWSER TEST REVEALED

CLT-181 (Andrew's login-to-login browser test of CRP, third proof tenant) exposed 6 P0 failures that prevent the platform from completing a basic user journey. These group into 4 root causes that must ALL be fixed in this OB.

### The Findings

| # | Finding | Root Cause |
|---|---------|------------|
| F04 | Plan 1 interpreted as tiered_lookup with 0 tiers (should be linear_function) | RC2: Converter |
| F05 | Plan 2 interpreted as tiered_lookup (should be piecewise_linear) | RC2: Converter |
| F06 | Plan 3 missing cross-plan gate | RC2: Converter |
| F07 | AI Assessment correct but converter ignores it — ROOT CAUSE of F04-F06 | RC2: Converter |
| F08 | Entity binding 0% when roster not imported before transaction data | RC1: Import + RC3: Engine |
| F09 | source_dates empty despite date column correctly identified | RC1: Import |
| F10 | Convergence runs at import time, requires plans to exist first | RC1: Import |
| F11 | postCommitConstruction requires entities + plans to exist | RC1: Import |
| F02 | Multi-file upload processes only first file | RC4: Upload UI |

### The Root Causes

| RC | Root Cause | Fix |
|----|-----------|-----|
| RC1 | Import pipeline violates sequence-independence — 3 operations at import time require other data to exist first | Remove from import, fix source_date |
| RC2 | Plan converter has fixed vocabulary, ignores AI assessment | Rewrite converter to use full primitive vocabulary |
| RC3 | Calculation engine depends on import-time entity binding + doesn't populate cross_data/scope_aggregate | Make calc-time entity resolution primary, populate new IntentSources |
| RC4 | Multi-file upload only processes first file | Process all files |

---

## THE PRINCIPLE BEING ENFORCED

**Sequence-independence: Data, roster, and plans can be imported in ANY order. The platform figures it out at calculation time.**

- Import is STORAGE. Preserve everything. Require nothing external.
- Calculation is RESOLUTION. Resolve entities, bind periods, derive metrics, execute intents.
- The AI assessment is INTELLIGENCE. The converter must USE it, not ignore it.

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 34:** No bypass recommendations — structural fixes only
- **Rule 39:** Compliance verification gate
- **Rule 40:** Diagnostic-first

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### SQL VERIFICATION GATE (FP-49)
Before writing ANY SQL, verify against SCHEMA_REFERENCE_LIVE.md or live DB:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = '{TABLE}' ORDER BY ordinal_position;
```

---

## PHASE 0: DIAGNOSTIC — VERIFY DIAG-012 FINDINGS

**READ-ONLY. Confirm the DIAG-012 findings are still accurate before changing code.**

1. Verify execute-bulk/route.ts lines 536-577 (entity binding), line 645 (postCommitConstruction), lines 685-716 (convergence) — these are the lines to modify
2. Verify run/route.ts lines 362-444 (engine data loading, convergence fallback path)
3. Verify intent-executor.ts contains linear_function, piecewise_linear, cross_data, scope_aggregate
4. Verify the plan converter location: find `convertComponent` and `interpretationToPlanConfig` — paste file path and function signatures
5. Verify SCIUpload component — how many files does it process?

**Commit: "OB-182 Phase 0: Diagnostic verification"**

---

## PHASE 1: IMPORT PIPELINE — REMOVE SEQUENCE DEPENDENCIES

### 1A: Remove Entity ID Binding from Import
In execute-bulk/route.ts (approximately lines 536-577):
- Remove the entity_id resolution logic
- committed_data rows are inserted with `entity_id: null`
- The raw identifier (e.g., sales_rep_id = "CRP-6007") is preserved in `row_data` — this is what the engine reads at calc time
- Do NOT remove the entity_id column from committed_data — it becomes a cache that the engine CAN populate at calc time for performance, but it is NOT required at import time

### 1B: Remove postCommitConstruction from Import
In execute-bulk/route.ts (approximately line 645):
- Remove or disable the `postCommitConstruction` call
- This function attempts entity assignment and entity_id binding — both are calc-time concerns
- Entity creation from roster imports should STILL work (if the file is classified as roster, entities should be created) — verify this is a separate code path from postCommitConstruction

### 1C: Remove Convergence Derivation from Import
In execute-bulk/route.ts (approximately lines 685-716):
- Remove the convergence derivation loop
- Convergence will run at calculation time (Phase 3 of this OB)
- This removes the requirement that plans must exist before data import

### 1D: Fix source_date Extraction
The `extractSourceDate` function exists but `dateColumnHint` is empty because the AI assessment's date column identification doesn't flow to `findDateColumnFromBindings`.

- Trace how the AI assessment identifies the "date" column (the assessment panel shows `date → date (90%)`)
- Trace how `findDateColumnFromBindings` receives its input
- Fix the gap: the AI-identified date column must reach `extractSourceDate`
- After fix: committed_data.source_date must be populated from the transaction's date value
- Verify: import a CSV with a "date" column and confirm source_date is NOT null on committed_data rows

### Korean Test
- No field name matching by English column names
- The date column is identified by STRUCTURAL heuristics (temporal patterns, date formats, sequential values)
- The entity identifier is identified by structural heuristics (repeat ratio, ID patterns)

**Commit: "OB-182 Phase 1: Import pipeline sequence-independence"**

---

## PHASE 2: PLAN CONVERTER — FULL PRIMITIVE VOCABULARY

### The Problem
`convertComponent` / `interpretationToPlanConfig` has a hardcoded vocabulary:
- `tiered_lookup` → bounded_lookup_1d
- `flat_percentage` → scalar_multiply
- (possibly others)

It does NOT produce: linear_function, piecewise_linear, cross_data gate, scope_aggregate, uncapped modifier.

The AI assessment CORRECTLY identifies the plan structure. The converter IGNORES the assessment and forces everything into its limited vocabulary.

### The Fix
The converter must read the AI assessment output and produce Calculation Intents that use the FULL primitive vocabulary defined in intent-types.ts.

### 2A: Audit the AI Assessment Output
- When the AI interprets a plan, what data structure does it produce?
- Paste the AI interpretation output for at least one CRP plan (check the database: query rule_sets.metadata or processing_jobs.classification_result for a CRP plan)
- Identify WHERE in the assessment output the calculation method, rates, formulas, gates, and scope are described

### 2B: Map Assessment to Intents
The converter must handle these mappings:

| Assessment Content | Primitive | Intent Structure |
|-------------------|-----------|-----------------|
| Linear formula: y = mx + b (rate × revenue + base) | linear_function | `{ operation: "linear_function", slope: m, intercept: b, input: { source: "metric" } }` |
| Accelerator: rate changes at attainment breakpoints | piecewise_linear | `{ operation: "piecewise_linear", segments: [...], input: { source: "ratio" }, baseInput: { source: "metric" } }` |
| Flat amount per unit (e.g., $50 per cross-sell) | scalar_multiply | `{ operation: "scalar_multiply", rate: 50, input: { source: "metric", metric: "count" } }` |
| Gate: requires data from another plan | conditional_gate with cross_data | `{ operation: "conditional_gate", condition: { source: "cross_data", ... }, trueOp: ..., falseOp: ... }` |
| Override: % of team's total revenue | scope_aggregate + scalar_multiply | `{ operation: "scalar_multiply", rate: 0.015, input: { source: "scope_aggregate", scope: "district" } }` |
| No cap specified | modifiers.cap = null | Ensure uncapped when plan says no cap |
| Cap specified (e.g., $5,000/month) | modifiers.cap = 5000 | Cap value from assessment |

### 2C: Rewrite convertComponent
The function must:
1. Read the AI assessment's calculation method description
2. Determine which primitive(s) express the described behavior
3. Produce a ComponentIntent with the correct operation, parameters, and modifiers
4. Handle variants (Senior Rep vs Rep with different rates/quotas)
5. Preserve cap/floor/proration modifiers from the assessment

### 2D: Verify All 4 CRP Plans
After rewriting, delete the existing CRP rule_sets and reimport all 4 PDF plans. Verify each produces correct components JSONB:

- Plan 1 (CE): linear_function with slope=0.06/0.04, intercept=200/150, uncapped
- Plan 2 (CN): piecewise_linear with 3 segments (0.03/0.05/0.08), cap=5000
- Plan 3 (XS): conditional_gate with cross_data source, scalar_multiply at $50/unit, cap=1000
- Plan 4 (DO): scope_aggregate at district/region scope, scalar_multiply at 0.015/0.005

**This is NOT about getting CRP-specific values right. It's about the converter producing the correct PRIMITIVE TYPE so the executor can handle any plan.**

### Korean Test
- The converter must NOT contain hardcoded plan names ("Capital Equipment")
- The converter reads structural signals from the assessment (formula patterns, breakpoint structures, gate conditions)
- The same converter must work for ANY plan in ANY language

**Commit: "OB-182 Phase 2: Plan converter — full primitive vocabulary"**

---

## PHASE 3: CALCULATION ENGINE — SEQUENCE-INDEPENDENT RESOLUTION

### The Problem
The engine's primary data loading path (run/route.ts line 362: `if (row.entity_id)`) routes rows to `dataByEntity`. Rows with NULL entity_id go to `storeData` and fall through to the convergence path (lines 397-444). After Phase 1 removes import-time binding, ALL rows will have NULL entity_id. The convergence path must become the PRIMARY path, not a fallback.

### 3A: Entity Resolution at Calc Time — Primary Path
Rewrite the engine data loading to:
1. Query committed_data for the tenant + period (by source_date range per Decision 92)
2. For EACH row, resolve the entity by matching the entity identifier column value against `entities.external_id`
3. The entity identifier column name comes from convergence bindings (or from the import's semantic role mapping stored in processing_jobs)
4. Group resolved rows by entity for calculation
5. Rows that cannot be resolved to an entity (entity doesn't exist yet) are EXCLUDED from this calculation but remain in committed_data for future calculations

### 3B: Convergence at Calc Time
If convergence bindings don't exist yet for a rule_set (because convergence was removed from import), the engine must derive them at calculation time:
1. Check rule_sets.input_bindings — if populated, use them
2. If NOT populated, run convergence derivation NOW (same logic previously in import, but triggered by calculation)
3. Cache the result in rule_sets.input_bindings for next time
4. This ensures convergence works regardless of import order

### 3C: CrossDataCounts Population
OB-181 added the `cross_data` IntentSource to intent-types.ts but the engine doesn't populate `crossDataCounts` on EntityData. Fix this:

1. Before executing intents for an entity, the engine must query committed_data for that entity
2. Group by `data_type` (which comes from the import classification — identifies what kind of data each row is)
3. Count rows per data_type for the period
4. Populate `EntityData.crossDataCounts = { [data_type]: count }`
5. The conditional_gate with source='cross_data' reads from this

### 3D: ScopeAggregates Population
OB-181 added the `scope_aggregate` IntentSource but the engine doesn't populate `scopeAggregates` on EntityData. Fix this:

1. When calculating for a manager entity (District Manager or Regional VP), determine their scope
2. Scope resolution: query `entity_relationships` to find entities managed by this manager, OR read the manager's district/region from `entities.metadata` and find all entities with the same value
3. For each metric needed by scope_aggregate components, sum committed_data across all entities in scope for the period
4. Populate `EntityData.scopeAggregates = { [scope_key]: { [metric]: sum } }`
5. The intent executor reads from this when resolving scope_aggregate sources

### 3E: Mixed Cadence Period Binding
When calculating Plan CE (bi-weekly cadence), the engine must bind committed_data to bi-weekly periods. When calculating Plan CN (monthly cadence), the engine must bind the SAME committed_data to monthly periods. This is Decision 92: source_date BETWEEN period.start AND period.end.

Verify:
1. The engine reads the plan's cadence_config to determine which periods to use
2. Period binding uses source_date range, not period_id on committed_data
3. A transaction on Jan 22 binds to BW-01B when calculating Plan CE and to MO-01 when calculating Plan CN

### Korean Test
- Entity resolution uses structural column identification, not field names
- Scope resolution uses relationship graph or metadata, not role name matching
- No `if (role === 'District Manager')` in the engine
- The engine determines scope from the entity's position in the hierarchy, not from a hardcoded role check

**Commit: "OB-182 Phase 3: Calculation engine — sequence-independent resolution"**

---

## PHASE 4: MULTI-FILE UPLOAD

### The Problem
When multiple files are selected for upload, only the first file is processed. The remaining files are silently dropped.

### The Fix
Find and fix the constraint:
1. Check SCIUpload component — does it accept multiple files?
2. Check the analyze-document API — does it process one file or multiple?
3. If the UI sends multiple files but the API processes only one: fix the API to loop
4. If the UI only sends one file: fix the UI to send all selected files
5. Each file should create its own processing_job and appear as a separate content unit in the import review

### Verification
- Select 4 PDF files for upload
- All 4 appear in the import review panel
- Each has its own classification (plan, transaction, roster, etc.)
- Each can be confirmed independently

**Commit: "OB-182 Phase 4: Multi-file upload"**

---

## PHASE 5: INTEGRATION VERIFICATION

### 5A: Sequence-Independence Test
Write a test script that verifies the core principle:

```
Test 1: Import transaction data FIRST (no roster, no plans)
  → committed_data rows exist with source_date, entity_id=NULL
  → No errors, no warnings about missing entities

Test 2: Import plan PDF (no roster yet)
  → rule_set created with correct components JSONB
  → No errors about missing entities or data

Test 3: Import roster
  → entities created

Test 4: Calculate
  → Engine resolves entities from committed_data.row_data
  → Engine binds periods from source_date
  → Engine executes calculation
  → Results produced for all entities with matching data
```

### 5B: BCL Regression
BCL must still calculate $312,033. This is non-negotiable.

### 5C: Build Verification
1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000

### PR Creation
```bash
gh pr create --base main --head dev --title "OB-182: CLT-181 P0 Resolution — Import Independence + Plan Converter + Calc Engine" --body "Fixes all 6 P0 findings from CLT-181 browser testing. (1) Import pipeline no longer requires roster or plans to exist before transaction data — entity binding, postCommitConstruction, and convergence removed from import. source_date extraction fixed. (2) Plan converter rewritten to use full primitive vocabulary — linear_function, piecewise_linear, cross_data, scope_aggregate, uncapped. AI assessment intelligence now flows to components JSONB. (3) Calculation engine performs entity resolution, convergence, crossData population, and scopeAggregate population at calc time. Mixed cadence period binding verified. (4) Multi-file upload processes all selected files."
```

**Commit: "OB-182 Phase 5: Integration verification + PR"**

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | Entity binding REMOVED from import pipeline | Paste execute-bulk code showing removal |
| PG-02 | postCommitConstruction REMOVED from import pipeline | Paste code showing removal |
| PG-03 | Convergence derivation REMOVED from import pipeline | Paste code showing removal |
| PG-04 | source_date populated on committed_data after CSV import | Paste DB query: `SELECT source_date FROM committed_data WHERE tenant_id='{CRP}' LIMIT 5` — no NULLs |
| PG-05 | Transaction data imports successfully with NO roster present | Paste import log showing 0 errors, committed_data rows with entity_id=NULL |
| PG-06 | Plan 1 converter produces linear_function intent | Paste components JSONB showing operation="linear_function" |
| PG-07 | Plan 2 converter produces piecewise_linear intent | Paste components JSONB showing operation="piecewise_linear" |
| PG-08 | Plan 3 converter produces conditional_gate with cross_data | Paste components JSONB showing cross_data source |
| PG-09 | Plan 4 converter produces scope_aggregate | Paste components JSONB showing scope_aggregate source |
| PG-10 | Engine resolves entities at calc time from row_data | Paste engine code showing entity resolution from external_id |
| PG-11 | Engine populates crossDataCounts before intent execution | Paste code |
| PG-12 | Engine populates scopeAggregates before intent execution | Paste code |
| PG-13 | Multi-file upload: 4 PDFs all appear in review | Paste code fix + description of test |
| PG-14 | BCL regression: $312,033 still correct | Paste verification |
| PG-15 | npm run build exits 0 | Paste exit code |
| PG-16 | Zero Korean Test violations | Paste grep for hardcoded names in engine/converter |

## PROOF GATES — SOFT

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| SG-01 | Sequence test: data → plan → roster → calculate = results | Paste test output |
| SG-02 | Mixed cadence: same row binds to bi-weekly and monthly periods | Paste engine period binding code |
| SG-03 | Convergence runs at calc time when not cached | Paste code path |
| SG-04 | Uncapped modifier works (no default cap) | Paste intent showing cap=null |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-182_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## POST-MERGE PRODUCTION VERIFICATION (MANDATORY)

After the PR is merged and deployed to production:

1. **Vercel deployment:** Confirm build succeeded
2. **BCL regression:** $312,033 in production
3. **Import test:** Upload a CSV to CRP tenant WITHOUT roster — no errors
4. **No production errors in Vercel logs**

**No finding marked ✅ without production evidence.**

---

## WHAT HAPPENS AFTER THIS OB

Andrew re-runs the CLT-181 browser test:
1. Upload 4 PDF plans (multi-file or one at a time) → all produce correct intents
2. Upload transaction data BEFORE roster → no errors, data stored
3. Upload roster → entities created
4. Calculate → engine resolves entities, binds periods, executes new primitives
5. Continue through lifecycle, personas, reconciliation, payroll

**CC builds the fix. Andrew verifies in the browser.**
