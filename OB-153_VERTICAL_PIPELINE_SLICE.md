# OB-153: VERTICAL PIPELINE SLICE — IMPORT TO RENDERED RESULT
## Decision 92 Compliant | Engine + Experience Together | One PR, One Proof

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema (post OB-152: includes source_date, reference_data, reference_items, alias_registry)
3. `ENGINE_CONTRACT_BINDING.sql` — the canonical 5-table contract the engine reads
4. `OB-152_COMPLETION_REPORT.md` — Decision 92 implementation (hybrid data-fetch, source_date extraction)

---

## THE FOUNDATIONAL RULE THIS OB ENFORCES

**Engine and Experience evolve together.** NEVER fix engine then UI or UI then engine as separate work. This OB is a VERTICAL SLICE: import surface → SCI pipeline → engine contract → calculate surface → rendered result. If any layer breaks, the proof gate fails. Treating engine and UI as separate concerns has caused mutual breakage across 152+ OBs. This pattern ends here.

---

## WHAT'S BROKEN (3 connected problems)

### Problem 1: Import UI requires period selection
The import surface at `/operate/import` still requires or assumes period context. Decision 92 (OB-152) eliminated period from import. SCI now extracts `source_date` from data and does NOT create periods during import. But the UI hasn't been updated — it still references period in its workflow, blocking correct data ingestion.

### Problem 2: SCI classifies but doesn't construct
SCI correctly classifies content (plan, entity, target, transaction, reference) but does NOT fill the Engine Contract tables. After a successful SCI import:
- `entities` table: 0 new entities created (only matches existing seed data)
- `rule_set_assignments`: 0 assignments created
- `committed_data.entity_id`: NULL (no FK binding to entities)
- `committed_data.source_date`: NULL (OB-152 added extraction but it's not wired to existing import flows)

The Engine Contract verification query returns zeros despite "successful" import.

### Problem 3: Components parsing bug
CLT-142 F-02: Calculate page shows "Rule set has no components" despite the database containing a valid 6+ element JSONB array. `jsonb_array_length` returns 6, `jsonb_typeof` returns 'array'. This is a code-side parsing bug — the UI reads the components column but fails to parse or display it.

### Why these are ONE problem
You cannot get MX$1,253,832 to render on screen unless:
- Import works without period dependency (Problem 1)
- Import fills the engine contract (Problem 2)  
- The engine reads what was written and the UI displays it (Problem 3)

Fix any one alone and the pipeline still fails. Fix all three as a vertical slice and the pipeline works end-to-end.

---

## PHASE 0: DIAGNOSTIC — MAP THE FULL VERTICAL

Before writing ANY code, trace the complete pipeline from browser to rendered result.

### 0A: Import Surface Audit

Open `/operate/import` on localhost:3000. Document:
1. Every reference to "period" in the import workflow (UI elements, API params, state variables)
2. Which API routes the import surface calls (analyze, execute)
3. What happens after SCI execute returns — does the UI navigate somewhere? Show a summary? Require period?

Trace files:
- `web/src/app/operate/import/page.tsx` (or wherever the import route lives)
- `web/src/components/sci/SCIExecution.tsx`
- `web/src/components/sci/ImportReadyState.tsx`
- `web/src/app/api/import/sci/execute/route.ts`

### 0B: SCI Construction Gap

After SCI execute runs, query the Engine Contract:
```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT jsonb_array_length(components) FROM rule_sets WHERE tenant_id = t.id LIMIT 1) as component_count,
  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT count(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL) as bound_data_rows,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND source_date IS NOT NULL) as source_date_rows,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments
FROM t;
```

Document which values are 0 that should be non-zero. This is the construction gap.

### 0C: Components Parsing Trace

Find the EXACT file and line where the calculate page reads `rule_sets.components`:
1. Trace from the calculate page component to the data fetch
2. Trace from the data fetch to the render logic
3. Identify where the JSONB array fails to parse — is it a type mismatch? A null check? A wrong field name? A different column being read?

```bash
grep -rn "components" web/src/app/operate/calculate/ --include="*.tsx" --include="*.ts" | head -30
grep -rn "has no components\|no components\|Rule set has no" web/src/ --include="*.tsx" --include="*.ts" | head -20
```

### 0D: LAB Baseline

Before ANY code changes, verify LAB regression baseline:
```sql
SELECT count(*) as result_count, SUM(total_payout) as total
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%latin%' OR slug LIKE '%caribe%' LIMIT 1);
```

Expected: 268 results, $8,498,311.77.

### PHASE 0 DELIVERABLE

Write `OB-153_DIAGNOSTIC.md` at project root with:
1. Every period reference in the import UI (file, line, what it does)
2. Engine Contract query results showing the construction gap
3. Exact file:line where components parsing fails and WHY
4. LAB baseline confirmation

**Commit:** `OB-153 Phase 0: Full vertical diagnostic — import UI + construction gap + parsing trace`

**DO NOT write fix code until Phase 0 is committed.**

---

## PHASE 1: REMOVE PERIOD FROM IMPORT SURFACE

Based on Phase 0 findings, remove period dependency from the import workflow.

### What to remove:
- Period selector/dropdown in import UI (if any)
- Period creation during SCI execute (if still present after OB-152)
- Period-related state in import components
- Period-related API parameters in SCI analyze/execute calls
- Any "detected periods" display that implies period is part of import

### What to preserve:
- `source_date` extraction (OB-152 delivered this — it stays)
- File upload, classification, proposal, confirmation workflow
- All SCI agent logic (plan, entity, target, transaction, reference)

### What to add:
- After successful import, show what was imported WITHOUT period context: "65,049 rows committed. Source dates: 2024-01-03 through 2024-03-28. 719 unique entity identifiers detected."

### Proof Gate 1:
- Import surface renders on localhost:3000 with zero period references
- SCI analyze returns without period context
- SCI execute commits data without creating periods
- `npm run build` exits 0

**Commit:** `OB-153 Phase 1: Remove period dependency from import surface (Decision 92)`

---

## PHASE 2: SCI CONSTRUCTION PIPELINE — FILL THE ENGINE CONTRACT

This is the core phase. After SCI classifies and commits data, it must also construct what the engine needs.

### 2A: Entity Construction

When SCI processes entity/roster content units:
1. Extract unique entity identifiers from committed_data (structural detection — find the high-cardinality text column that looks like IDs)
2. For each unique identifier, check if entity exists in `entities` table
3. Create new entities for unmatched identifiers
4. Update `committed_data.entity_id` FK for all rows belonging to each entity

When SCI processes transaction content units:
1. Entity identifiers exist in the transaction data
2. Match transaction rows to entities (existing or newly created from roster)
3. Update `committed_data.entity_id` FK

### 2B: Source Date Binding

OB-152 created `source-date-extraction.ts` with 3 strategies. Verify it's called during SCI execute and that `committed_data.source_date` is populated on every transaction row.

If not wired: wire it. The extraction logic exists — it just needs to run during the commit step.

### 2C: Rule Set Assignment Construction

When both plans (rule_sets) and entities exist:
1. Determine which entities should be assigned to which rule sets
2. This can be:
   - License-based (entity metadata contains product licenses → match to rule set names)
   - Universal (all entities assigned to all active rule sets)
   - AI-suggested (SCI proposes assignments based on data patterns)
3. Create `rule_set_assignments` records

For the nuclear clear test (Óptica Luminar), the simplest correct approach: assign all entities to all active rule sets for this tenant. The plan has one rule set, 719 entities — all 719 get assigned.

### 2D: Period Creation (Configure, not Import)

Decision 92 says periods are created in Configure, not Import. But the engine still needs periods to exist for calculation. 

Add to the Calculate surface (Phase 3): if no periods exist but committed_data has source_dates, suggest period creation. "Your data spans 2024-01-01 to 2024-03-31. Create monthly periods?" This is the Evaluate page's Step 2 from DS-007.

For now, the minimum viable path: when the admin clicks Calculate and no periods exist, the platform auto-suggests based on source_date range and creates them on confirmation.

### 2E: Engine Contract Verification

After construction, run the Engine Contract verification query. ALL values must be non-zero:

| Value | Expected (Óptica) |
|---|---|
| rule_sets | ≥ 1 |
| component_count | ≥ 6 |
| entities | ≥ 100 (ideally 719) |
| periods | ≥ 1 |
| bound_data_rows | > 0 |
| source_date_rows | > 0 |
| assignments | ≥ entities count |

### Proof Gate 2:
- Engine Contract verification query returns non-zero for ALL 7 values
- `committed_data.entity_id` populated (not NULL) for transaction rows
- `committed_data.source_date` populated for transaction rows
- `rule_set_assignments` created linking entities to rule sets
- LAB regression: 268 results, $8,498,311.77 (UNCHANGED)

**Commit:** `OB-153 Phase 2: SCI construction pipeline — entities + source_date + assignments fill engine contract`

---

## PHASE 3: FIX COMPONENTS PARSING + CALCULATE SURFACE

### 3A: Components Parsing Fix

Based on Phase 0C diagnosis, fix the exact code path where components JSONB fails to parse. Common causes:
- Reading `structure` instead of `components` (legacy field name)
- Type guard checking for wrong shape (array vs object)
- Null check short-circuiting on valid empty-looking value
- Supabase client returning components as string instead of parsed JSON

Fix the parsing. Verify the calculate page shows "6 components" (or 7 for the AI-extracted plan) instead of "Rule set has no components."

### 3B: Calculate Surface — Period as Calculation Parameter

The calculate surface must work with Decision 92 architecture:
1. Show available rule sets for this tenant (with component counts — this proves 3A works)
2. Show available evaluation windows (periods) — or suggest creating them from source_date range
3. Calculate button that runs the engine
4. Results displayed with total payout

The calculate surface does NOT need to be the full DS-007 design. It needs to be FUNCTIONAL:
- Rule set selection (can be a simple list — multi-select if multiple rule sets exist)
- Period selection or creation (minimum: dropdown of existing periods + "create from data range")
- Calculate action
- Result display showing total payout and entity count

### 3C: Calculation Execution

Run calculation for the selected rule set × period. The engine hybrid path (OB-152) handles data fetch:
- Tries `source_date BETWEEN period.start_date AND period.end_date` first
- Falls back to `period_id` if no source_date rows found
- Combines both result sets

### Proof Gate 3:
- Calculate page shows rule sets WITH component counts (not "no components")
- Calculate page allows period selection without import-time period dependency
- Calculation executes and produces results
- Results page shows total payout for the tenant
- LAB regression: UNCHANGED

**Commit:** `OB-153 Phase 3: Components parsing fix + functional calculate surface`

---

## PHASE 4: RENDERED RESULT — THE PROOF GATE

### 4A: Full Pipeline Verification

On localhost:3000, as VL Admin:
1. Navigate to Óptica Luminar tenant
2. Go to Import — verify no period references
3. Import the plan PPTX — verify components are extracted and visible
4. Import the data XLSX — verify source_dates populated, entities created, assignments made
5. Go to Calculate — verify rule set shows with component count
6. Select/create period — verify periods from source_date range
7. Click Calculate — verify engine runs
8. View results — verify total payout renders on screen

### 4B: The Number

For Pipeline Test Co (Óptica Luminar): the ground truth is MX$1,253,832.

If the number on screen is within 5% of this value, the vertical slice is PROVEN. The exact match may require the R6 optical matrix fix (which is a separate refinement), but the pipeline working end-to-end is the gate.

If the number is $0 or the calculation fails, the vertical slice is NOT complete. Debug from the Engine Contract verification query — which of the 7 values is wrong?

### 4C: Screenshot Evidence

Take screenshots (or paste browser console output) showing:
1. Import surface without period
2. Engine Contract verification query (all non-zero)
3. Calculate page with component count visible
4. Results page with payout total

### Proof Gate 4 (FINAL):
- PG-FINAL-1: Import completes without period selection
- PG-FINAL-2: Engine Contract verification query: all 7 values non-zero
- PG-FINAL-3: Calculate page shows components (not "no components")
- PG-FINAL-4: Total payout renders on screen (any non-zero value; within 5% of $1,253,832 is ideal)
- PG-FINAL-5: LAB regression: 268 results, $8,498,311.77
- PG-FINAL-6: `npm run build` exits 0
- PG-FINAL-7: PR created

**Commit:** `OB-153 Phase 4: Vertical slice proven — import to rendered result`

---

## PHASE 5: COMPLETION REPORT + PR

### 5A: Completion Report

Write `OB-153_COMPLETION_REPORT.md` at project root with:
1. Phase 0 diagnostic summary (what was broken, where)
2. Phase 1 changes (period references removed, files changed)
3. Phase 2 changes (construction pipeline, entity creation, assignment creation)
4. Phase 3 changes (parsing fix, calculate surface)
5. Phase 4 evidence (screenshots/console output of rendered result)
6. LAB regression proof
7. All proof gates PASS/FAIL with evidence

### 5B: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-153: Vertical Pipeline Slice — Import to Rendered Result (Decision 92)" \
  --body "## The First Vertical Slice

### What This OB Proves
A user can import a plan and data WITHOUT period selection, the platform constructs the engine contract (entities, assignments, source_date bindings), and a calculated result renders on screen.

### Problem 1 Fixed: Period removed from import
- Decision 92 compliance: import surface has zero period references
- source_date extracted structurally at import time
- Periods created at calculation time, not import time

### Problem 2 Fixed: SCI fills the engine contract
- Entity construction: unique identifiers → entities table
- FK binding: committed_data.entity_id populated
- Source date: committed_data.source_date populated
- Assignments: rule_set_assignments created

### Problem 3 Fixed: Components parsing
- Calculate page reads and displays rule set components correctly
- [describe root cause and fix]

### Evidence
- Engine Contract: [7 values]
- Total payout: MX\$[value] (ground truth: MX\$1,253,832)
- LAB regression: 268 results, \$8,498,311.77 (UNCHANGED)

## Proof Gates: see OB-153_COMPLETION_REPORT.md"
```

---

## WHAT NOT TO DO

1. **Do NOT fix the engine without touching the UI.** This is a vertical slice. (Foundational Rule — engine and experience evolve together)
2. **Do NOT fix the UI without verifying the engine.** Same rule, other direction.
3. **Do NOT create new period-dependent import flows.** Decision 92 eliminated period from import. (AP-23)
4. **Do NOT use field-name matching for entity detection.** Korean Test applies. (AP-24, AP-25)
5. **Do NOT break LAB.** 268 results, $8,498,311.77 at every checkpoint. (Standing rule)
6. **Do NOT hardcode Óptica-specific field names, column names, or entity IDs.** (AP-5, AP-6)
7. **Do NOT report Phase 0 as PASS without pasting the actual findings.** (Pattern #26, #27, #29)
8. **Do NOT skip the Engine Contract verification query.** It's the shared boundary between pipeline and engine. (Decision 84, 87)
9. **Do NOT auto-create profiles for VL Admin in tenant scope.** (Decision 90, Pattern #30)
10. **Do NOT send manual SQL against production data.** (Pattern #32)

---

## CHECKLIST

```
Before submitting completion report, verify:
□ Architecture Decision committed before implementation?
□ Anti-Pattern Registry checked — zero violations?
□ Import surface has zero period references?
□ SCI execute populates source_date on committed_data?
□ SCI execute creates entities from unique identifiers?
□ SCI execute creates rule_set_assignments?
□ Engine Contract verification query returns all non-zero?
□ Calculate page shows components (not "no components")?
□ Total payout renders on screen?
□ LAB regression PASS (268 results, $8,498,311.77)?
□ npm run build exits 0?
□ PR created with descriptive body?
□ Browser evidence pasted (not CLI-only)?
```

---

## PREREQUISITE

**HF-088 must execute before this OB.** The database contains auto-created profiles and duplicate rule_sets from HF-086 damage. OB-153 starts from a clean state. If HF-088 has not been run, run it first.

---

*OB-153 — March 4, 2026*
*"The pipeline is not proven when the engine works. The pipeline is not proven when the UI works. The pipeline is proven when a user imports data and sees a result."*
