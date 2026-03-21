# OB-181: Cross-Plan Coordination + District Aggregate Scope

## Date: March 20, 2026
## Type: OB (Objective Build)
## Scope: Build the final 2 capability gaps so Andrew can execute the CRP login-to-login test

---

## READ FIRST: CC_STANDING_ARCHITECTURE_RULES.md

Open and read `CC_STANDING_ARCHITECTURE_RULES.md` in the repository root.

---

## CONTEXT

OB-180 Phase 0 diagnostic confirmed 23 of 28 required capabilities already exist. OB-180 built 3 gaps (linear_function, piecewise_linear, lifecycle justifications). Two gaps remain:

**D16: Cross-plan coordination gate** — Plan 3 (Cross-Sell Bonus) has a gate that checks whether the entity had at least 1 equipment sale in the month. That data lives in Plan 1 (Capital Equipment). The engine currently has no mechanism for one plan's component to read another plan's data or results.

**D27: District aggregate scope** — Plan 4 (District Override) pays a manager 1.5% of their district's total equipment revenue. The aggregate primitive currently operates at entity scope. It needs to operate at district or region scope — summing across all entities within a manager's organizational unit.

After this OB, all 28 capabilities exist. Andrew runs the login-to-login test.

### What CC Does NOT Do
- ❌ Does NOT create the CRP tenant
- ❌ Does NOT upload files or import data
- ❌ Does NOT run calculations or verify results
- ❌ Does NOT touch BCL or Meridian data

**CC builds the last two capabilities. Andrew tests everything.**

---

## STANDING RULES

- **Rule 1:** Commit + push after every change
- **Rule 2:** Kill dev server → rm -rf .next → npm run build → npm run dev → confirm localhost:3000
- **Rule 25-28:** Completion report enforcement
- **Rule 34:** No bypass recommendations
- **Rule 39:** Compliance verification gate
- **Rule 40:** Diagnostic-first

### COMPLETION REPORT RULES (25-28)
25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

### SQL VERIFICATION GATE (FP-49)
Before writing ANY SQL, verify column names against SCHEMA_REFERENCE_LIVE.md or live DB:
```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = '{TABLE}' ORDER BY ordinal_position;
```

---

## PHASE 0: DIAGNOSTIC — CURRENT STATE OF BOTH GAPS

**READ-ONLY. NO CODE CHANGES.**

### 0A: Cross-Plan Coordination (D16)

Examine the calculation engine to answer:

1. **How does calculation currently work per plan?** Trace the flow from "Calculate" button → API route → engine → results stored. Paste the key function signatures.

2. **Where are calculation results stored?** The `calculation_results` table has `rule_set_id`. When Plan CE calculates, its results are stored with Plan CE's rule_set_id. Confirm this. Paste a sample query.

3. **Can the engine read results from another plan's batch?** Search for any existing cross-plan references. Grep for: `cross_plan`, `plan_reference`, `other_rule_set`, `dependency`. Paste results.

4. **How does the conditional_gate primitive currently work?** Find and paste the `executeConditionalGate` function (or equivalent) from the intent executor.

5. **Where is committed_data stored per plan?** When equipment transactions are imported, they go to committed_data. When the Cross-Sell gate needs to count equipment deals, does it read from committed_data or from calculation_results? This is the key architectural question.

### 0B: District Aggregate Scope (D27)

1. **How does the aggregate primitive currently work?** Find and paste the `executeAggregate` function from the intent executor.

2. **What scope does it operate at?** Does it sum across the entity's own data, or can it sum across multiple entities?

3. **How is hierarchy stored?** Check `entity_relationships` for relationship_type values. Paste any existing relationship creation code (from roster import or entity creation). 

4. **Can the engine resolve "all entities in district X"?** Search for district resolution, hierarchy traversal, scope expansion. Paste results.

5. **How does the engine get entity metadata?** When calculating for a District Manager, can the engine read the manager's district assignment from `entities.metadata` or `entity_relationships`? Paste the entity data loading code.

**Output: Append diagnostic findings to `OB-180_PHASE0_DIAGNOSTIC.md` or create new section.**
**Commit: "OB-181 Phase 0: Cross-plan + aggregate scope diagnostic"**

---

## PHASE 1: ARCHITECTURE DECISION — CROSS-PLAN COORDINATION

Based on Phase 0 findings, evaluate these options:

```
ARCHITECTURE DECISION RECORD
============================
Problem: How does the engine resolve a conditional gate that depends on 
         another plan's data?

Context: Plan 3 (Cross-Sell Bonus) has a gate: "entity must have ≥1 
         equipment sale in the calendar month." Equipment sales are 
         transactions committed via Plan 1 (Capital Equipment). The gate 
         needs to COUNT equipment sales for the entity in the month.

Option A: Gate reads committed_data directly
  - The gate queries committed_data filtered by entity_id + date range + 
    data type (equipment sale)
  - Does NOT depend on Plan 1 being calculated first
  - The gate operates on raw imported data, not calculation results
  - Scale test: Direct query, indexed by entity_id + source_date ___
  - AI-first: No hardcoding — gate definition specifies what to count ___
  - Domain-agnostic: The gate counts rows matching structural criteria,
    not "equipment sales" by name ___
  - Atomicity: Read-only query, no state change ___

Option B: Gate reads calculation_results from another plan's batch
  - Plan 1 must calculate FIRST
  - Engine determines plan calculation order from declared dependencies
  - The gate reads Plan 1's results to find deal count
  - Scale test: Dependency ordering adds complexity ___
  - AI-first: Plan dependency graph is structural ___
  - Domain-agnostic: References plan by ID, not name ___
  - Atomicity: Plan ordering failure leaves partial state ___

Option C: Two-pass calculation
  - First pass: all plans calculate independently
  - Second pass: gates that reference other plans' data are evaluated
  - Scale test: Double computation ___
  - AI-first: No hardcoding ___
  - Domain-agnostic: Yes ___
  - Atomicity: Complex — partial first pass + full second pass ___

CHOSEN: [CC evaluates based on codebase inspection]
REJECTED: [CC justifies]
```

### IMPORTANT GUIDANCE

**Option A is likely the simplest and most robust** because:
- It has zero dependency on plan calculation ordering
- committed_data is the source of truth for transactions
- The gate counts structural facts (rows matching criteria) not calculation outputs
- It works regardless of whether Plan 1 has been calculated yet

But CC must verify this against the actual codebase. If committed_data doesn't carry the information needed to distinguish equipment transactions from consumable transactions, Option B may be necessary.

### Korean Test
The cross-plan gate must NOT reference plans by name ("Capital Equipment"). It must reference plans by structural identifier (rule_set_id or plan code stored in metadata). The gate condition must be:
```
"count rows in committed_data where entity_id = X 
 AND source_date BETWEEN period.start AND period.end 
 AND [structural criterion that identifies equipment transactions]"
```
NOT:
```
"count equipment sales" — this is domain language
```

The "structural criterion" could be: the committed_data rows were imported via a specific processing_job linked to a specific rule_set, or the committed_data.metadata contains a classification tag that the SCI pipeline assigned during import.

**Commit: "OB-181 Phase 1: ADR — Cross-plan coordination"**

---

## PHASE 2: IMPLEMENT CROSS-PLAN COORDINATION GATE

Based on the Architecture Decision, implement the chosen approach.

### If Option A (gate reads committed_data):

Add a new gate source type to the conditional_gate primitive:

```typescript
// In intent-types.ts — extend gate condition sources
interface CrossDataGateCondition {
  source: 'cross_data';
  // Structural filter for the data to count
  dataFilter: {
    // How to identify the relevant committed_data rows
    // This could be by import_batch, by classification tag, by rule_set linkage
    filterType: string;
    filterValue: string;
  };
  aggregation: 'count' | 'sum' | 'exists';
  field?: string; // which field to aggregate (for sum)
  operator: '>=' | '>' | '=' | '<' | '<=';
  threshold: number;
}
```

### If Option B (gate reads calculation_results):

Add plan dependency resolution to the calculation engine:
1. Before calculating, scan all plans' components for cross-plan references
2. Build a dependency graph
3. Calculate plans in topological order
4. Gate reads from the dependency plan's calculation_results

### Implementation Requirements (whichever option)

1. The gate must be expressible in the Calculation Intent vocabulary (it's a primitive extension, not a domain handler)
2. The gate must pass the Korean Test — no plan names, no transaction type names in engine code
3. The gate must work for ANY cross-plan condition, not just "count equipment deals" — it's a structural capability

### Unit Tests

Write tests that verify:
- Gate passes when entity has qualifying data (count ≥ 1)
- Gate fails when entity has no qualifying data (count = 0)
- Gate correctly scopes to the entity and period
- Gate works with sum aggregation (not just count)
- Gate condition uses structural identifiers, not domain names

**Commit: "OB-181 Phase 2: Cross-plan coordination gate implementation"**

---

## PHASE 3: ARCHITECTURE DECISION — DISTRICT AGGREGATE SCOPE

```
ARCHITECTURE DECISION RECORD
============================
Problem: How does the engine aggregate a metric across all entities in a 
         district (or region) to calculate a manager's override?

Context: Plan 4 (District Override) pays a District Manager 1.5% of the 
         TOTAL equipment revenue from ALL reps in their district. The 
         engine currently aggregates at entity scope (one entity's own 
         data). It needs to aggregate across MULTIPLE entities based on 
         organizational hierarchy.

Schema context:
- entity_relationships table exists with:
  source_entity_id, target_entity_id, relationship_type, context (jsonb)
- Hierarchy: Rep → manages → District Manager → manages → Regional VP
  (or equivalent relationship_type values)
- entities.metadata may carry district/region codes

Option A: Aggregate reads entity_relationships to find scope members
  - For a District Manager, query entity_relationships to find all 
    entities where relationship_type = 'manages' (or 'reports_to') and 
    the manager is the target
  - Then sum committed_data across all those entities for the period
  - Scale test: Graph traversal per manager per period ___
  - AI-first: Hierarchy is data, not code ___
  - Domain-agnostic: "manages" is structural, not domain-specific ___
  - Atomicity: Read-only aggregation ___

Option B: Aggregate reads entities.metadata for scope membership
  - District code stored in entities.metadata.district
  - For a District Manager, read their district code, then query all 
    entities with the same district code
  - Scale test: Simple metadata filter ___
  - AI-first: District assignment is data ___
  - Domain-agnostic: Scope code is structural ___
  - Atomicity: Read-only ___

Option C: Aggregate reads calculation_results from reps' Plan CE batches
  - First calculate Plan CE for all reps
  - Then sum their total_payout or specific component values by district
  - Scale test: Depends on Plan CE being calculated first ___
  - AI-first: No ___
  - Domain-agnostic: Yes ___
  - Atomicity: Dependency ordering ___

CHOSEN: [CC evaluates]
REJECTED: [CC justifies]
```

### IMPORTANT GUIDANCE

**Option A or B is preferred** because:
- The override is based on REVENUE (equipment sales amount), not on the reps' commission payouts
- Revenue is in committed_data, not in calculation_results
- No dependency on Plan CE being calculated first
- Option A uses the entity graph (which already exists per schema)
- Option B uses metadata (simpler but less structural)

The choice between A and B depends on whether entity_relationships are populated during roster import, and whether the relationship_type values provide clean hierarchy traversal.

**Commit: "OB-181 Phase 3: ADR — District aggregate scope"**

---

## PHASE 4: IMPLEMENT DISTRICT AGGREGATE SCOPE

Based on the Architecture Decision, extend the aggregate primitive.

### Extend aggregate operation in intent-types.ts:

```typescript
// Current aggregate — entity scope only
interface AggregateOperation {
  operation: 'aggregate';
  scope: 'entity'; // currently only option
  // ...
}

// Extended — add hierarchical scope
interface AggregateOperation {
  operation: 'aggregate';
  scope: 'entity' | 'hierarchical';
  hierarchicalScope?: {
    // How to determine scope membership
    resolution: 'relationship_graph' | 'metadata_match';
    // For relationship_graph: traverse entity_relationships
    relationshipType?: string; // e.g., 'manages', 'reports_to'
    direction?: 'children' | 'parents'; // manager's children = their reports
    // For metadata_match: match a field in entities.metadata
    metadataField?: string; // e.g., 'district'
  };
  metric: string;
  function: 'sum' | 'count' | 'avg';
}
```

### Implementation Requirements

1. When scope = 'hierarchical', the engine must:
   a. Determine the calculating entity's scope (their district or region)
   b. Find all entities within that scope
   c. Sum the specified metric across all those entities' committed_data for the period
   d. Return the aggregate value as the operation result

2. The hierarchy resolution must handle two levels:
   - **District Manager:** sum across reps in their district (direct reports)
   - **Regional VP:** sum across ALL reps in their region (across districts)

3. Korean Test: No hardcoded role names ("District Manager", "Regional VP") in the engine. The scope is determined by the entity's position in the relationship graph or by metadata, not by checking a role string.

### Unit Tests

- District Manager aggregate: 6 reps with known revenue → sum matches
- Regional VP aggregate: 12 reps across 2 districts → sum matches
- Entity with no reports: aggregate returns 0 (not error)
- Aggregate correctly scopes to the period's date range

**Commit: "OB-181 Phase 4: District aggregate scope implementation"**

---

## PHASE 5: INTEGRATION VERIFICATION

### 5A: Verify Both Features Coexist
Run the existing test suite. Verify no regressions. Both new capabilities must not break existing primitive execution (bounded_lookup_1d, bounded_lookup_2d, scalar_multiply, conditional_gate, aggregate at entity scope, ratio, constant, linear_function, piecewise_linear).

### 5B: BCL Regression Check
Verify BCL engine still produces $312,033. This is a non-negotiable regression gate.

### 5C: Combined Scenario Test
Write a test that exercises BOTH new capabilities together:
1. Create test entities: 1 manager, 3 reps
2. Create committed_data for reps (simulating equipment transactions)
3. Calculate using aggregate at hierarchical scope → manager gets override based on team total
4. Create a conditional_gate that reads cross-data → verify gate passes for rep with data, fails for rep without

This does NOT use CRP data — it uses synthetic test data. CRP data goes through Andrew's browser test.

**Commit: "OB-181 Phase 5: Integration verification"**

---

## PHASE 6: BUILD VERIFICATION + PR

1. Kill dev server
2. `rm -rf .next`
3. `npm run build` — must exit 0
4. `npm run dev` — confirm localhost:3000 loads
5. Verify no TypeScript errors

### PR Creation
```bash
gh pr create --base main --head dev --title "OB-181: Cross-Plan Coordination + District Aggregate Scope" --body "Builds the final 2 capability gaps for CRP login-to-login test. Cross-plan coordination gate allows one plan's component to evaluate conditions against data from another plan's imports. District/region aggregate scope allows management override calculations that sum across all entities in the manager's organizational unit. All 28 capabilities now exist. Andrew executes the login-to-login test after merge."
```

**Commit: "OB-181 Phase 6: Build verification passed"**

---

## PROOF GATES — HARD

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| PG-01 | Architecture Decision Record for cross-plan coordination committed | Paste ADR content |
| PG-02 | Architecture Decision Record for district aggregate committed | Paste ADR content |
| PG-03 | Cross-plan gate resolves data from another plan's committed_data (or results) | Paste test output showing gate pass + gate fail |
| PG-04 | Cross-plan gate uses structural identifiers, not plan names | Paste grep for plan names in engine code — zero hits |
| PG-05 | Aggregate at district scope sums across multiple entities | Paste test output showing correct sum |
| PG-06 | Aggregate at region scope sums across entities in multiple districts | Paste test output |
| PG-07 | Entity with no reports gets aggregate = 0, not error | Paste test output |
| PG-08 | No Korean Test violations in new code | Paste grep results |
| PG-09 | BCL regression: $312,033 still correct | Paste verification output |
| PG-10 | npm run build exits 0 | Paste exit code |
| PG-11 | All existing tests pass (no regressions) | Paste test output |

## PROOF GATES — SOFT

| # | Criterion | Evidence Required |
|---|-----------|-------------------|
| SG-01 | Combined scenario test (both capabilities together) | Paste test output |
| SG-02 | Cross-plan gate works with sum aggregation, not just count | Paste test output |
| SG-03 | Hierarchical aggregate handles both direct reports and transitive (region) | Paste code showing traversal depth |

---

## COMPLETION REPORT ENFORCEMENT

The completion report is created as a FILE, not terminal output.
- File: `OB-181_COMPLETION_REPORT.md` in PROJECT ROOT
- Created BEFORE final build verification
- Contains VERBATIM proof gate criteria with PASS/FAIL and PASTED evidence
- Committed to git as part of the batch
- If this file does not exist at batch end, the batch is considered INCOMPLETE regardless of how many phases executed successfully.

---

## POST-MERGE PRODUCTION VERIFICATION (MANDATORY)

After the PR is merged and deployed to production:

1. **Vercel deployment:** Confirm build succeeded
2. **BCL regression:** $312,033 in production
3. **No production errors in Vercel logs**

**No finding marked ✅ without production evidence.**

---

## WHAT HAPPENS AFTER THIS OB

All 28 capabilities exist. Andrew runs the CRP login-to-login test:

```
1. VL Admin → provision CRP tenant + admin
2. CRP Admin → upload 4 PDF plans → SCI interprets → 4 rule sets
3. CRP Admin → upload roster → 32 entities with hierarchy
4. CRP Admin → upload 3 CSVs → committed_data
5. CRP Admin → assign entities to plans (24×3 + 6×1 = 78 assignments)
6. CRP Admin → create periods (4 bi-weekly + 2 monthly)
7. CRP Admin → calculate all plans
8. CRP Admin → view commission statements
9. CRP Admin → upload GT → reconcile → 100% or findings
10. CRP Admin → lifecycle: PREVIEW → RECONCILE → OFFICIAL → APPROVE → POST
11. CRP Admin → payroll export
12. CRP Manager → log in → see team performance
13. CRP Rep → log in → see personal compensation
14. Both personas → commission intelligence
```

**CC builds the machine. Andrew turns the key.**
