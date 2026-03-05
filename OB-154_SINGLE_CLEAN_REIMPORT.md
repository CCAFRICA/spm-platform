# OB-154: SINGLE CLEAN REIMPORT + CALCULATE + VERIFY
## Vertical Slice Proof | Entity Dedup | Source Date Windowing | CC-UAT-07
## Óptica Luminar — 719 Employees, MX$1,253,832 Ground Truth

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema (post OB-152, includes source_date)
3. `ENGINE_CONTRACT_BINDING.sql` — the 5-table contract the engine reads
4. `OB-152_COMPLETION_REPORT.md` — Decision 92 (hybrid data-fetch, source_date extraction)
5. `OB-153_COMPLETION_REPORT.md` — Vertical pipeline slice (period removed from import, SCI construction, components parsing)
6. `HF-088_COMPLETION_REPORT.md` — Nuclear clear (Óptica is clean slate, 0 domain data)

---

## FOUNDATIONAL RULES (ENFORCED)

1. **Engine and experience evolve together.** This OB is a vertical slice. Import → construct → calculate → render. One PR.
2. **Fix logic, not data.** If entity dedup produces wrong counts, fix the dedup code. Do not manually insert entities.
3. **Korean Test.** Zero field-name matching. Entity identification by structural heuristics, not column name patterns.
4. **No manual SQL against production.** (Pattern #32)
5. **Supabase .in() batching ≤200.** (Section G)

---

## CONTEXT

HF-088 delivered a clean Óptica tenant: 0 domain data, tenant config + 3 persona profiles preserved. OB-153 proved the pipeline connects end-to-end but left inflated data (19,578 entities instead of 719, 140K rows instead of ~119K). This OB does it right — one clean import, correct entity dedup, correct source_date binding, and January-only calculation matching MX$1,253,832.

### Ground Truth (CLT-14B, February 11, 2026 — 100% match proven)

| Component | January 2024 Total | Employees w/Non-Zero |
|---|---|---|
| Optical Sales (matrix_lookup) | MX$748,600 | 620 of 719 |
| Store Sales (tier_lookup) | MX$116,250 | 362 of 719 |
| New Customers (tier_lookup) | MX$39,100 | 141 of 719 |
| Collections (tier_lookup) | MX$283,000 | 710 of 719 |
| Club Protection (conditional_percentage) | MX$10 | 2 of 719 |
| Warranty (flat_percentage) | MX$66,872 | 8 of 719 |
| **TOTAL** | **MX$1,253,832** | **719 employees** |

### Source Data Structure

File: `BacktTest_Optometrista_mar2025_Proveedores.xlsx`
~119,000 records across 7 sheets (roster, individual sales, store sales, customers, collections, insurance, warranty). 719 unique employees identified by `num_empleado`. 3 monthly periods (Jan/Feb/Mar 2024) in transaction data. Entity type: Puesto field contains OPTOMETRISTA CERTIFICADO or OPTOMETRISTA NO CERTIFICADO (variant routing).

---

## PHASE 0: PRE-IMPORT VERIFICATION

### 0A: Confirm Clean State

Run Engine Contract verification against Óptica:
```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT count(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as committed_data,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments
FROM t;
```

Expected: ALL ZEROS. If any value is non-zero, STOP. HF-088 didn't complete cleanly.

### 0B: Verify Import Surface

Open localhost:3000. Navigate to Óptica tenant. Go to Import. Confirm:
- No period selector or period references visible (OB-153 Phase 1)
- Upload area is functional
- No errors in browser console

### 0C: Verify Calculate Surface

Navigate to Calculate. Confirm:
- No rule sets listed (correct — none imported yet)
- No errors

**Commit:** `OB-154 Phase 0: Pre-import verification — clean state confirmed`

---

## PHASE 1: IMPORT PLAN

### 1A: Import the Plan PPTX

Upload `RetailCorp_Plan1.pptx` through the import surface on localhost:3000.

SCI should:
1. Classify as Plan content
2. AI interprets components (expect 7: two optical variants + 5 others)
3. Create rule_set with components JSONB array
4. No period creation (Decision 92)

### 1B: Verify Plan Import

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  rs.id, rs.name, rs.status,
  jsonb_typeof(rs.components) as comp_type,
  CASE
    WHEN jsonb_typeof(rs.components) = 'array' THEN jsonb_array_length(rs.components)
    WHEN rs.components ? 'components' THEN jsonb_array_length(rs.components->'components')
    ELSE -1
  END as component_count
FROM rule_sets rs
WHERE rs.tenant_id = (SELECT id FROM t);
```

Expected: 1 rule set, ≥6 components.

**If component_count is 0 or -1:** The components parsing bug from OB-153 has regressed. Debug before proceeding.

### Proof Gate 1:
- PG-1: Rule set exists with ≥6 components
- PG-2: No duplicate rule_sets (exactly 1 row)

**Commit:** `OB-154 Phase 1: Plan imported — [N] components`

---

## PHASE 2: IMPORT DATA + VERIFY ENTITY DEDUP

### 2A: Import the Data XLSX

Upload `BacktTest_Optometrista_mar2025_Proveedores.xlsx` through the import surface.

SCI should:
1. Classify content units (entity roster, transaction sheets, target sheets)
2. Commit data to committed_data
3. Extract source_date from date fields (OB-152)
4. Create entities from unique identifiers
5. Bind committed_data.entity_id
6. Create rule_set_assignments

### 2B: Verify Entity Dedup — THE CRITICAL CHECK

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as total_entities,
  count(DISTINCT external_id) as unique_external_ids
FROM entities
WHERE tenant_id = (SELECT id FROM t);
```

**Expected: total_entities = unique_external_ids ≈ 719.**

If total_entities >> 719, the entity dedup bug from OB-153 has NOT been fixed. The SCI entity construction is creating one entity per data row instead of one per unique employee.

**Root cause to investigate if entity count is inflated:**
- Is the entity creation code deduplicating by external_id before INSERT?
- Is there a UNIQUE constraint on (tenant_id, external_id) or (tenant_id, external_id, entity_type)?
- Is the entity creation running once per content unit instead of once per unique identifier across all content units?

**If entity count is wrong, FIX IT before proceeding.** Do not calculate on inflated entities — the results will be meaningless (proven by OB-153's MX$7,187,662.60 on 2,513 entities).

### 2C: Verify Source Date Binding

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as total_rows,
  count(source_date) as with_source_date,
  count(*) - count(source_date) as without_source_date,
  min(source_date) as earliest,
  max(source_date) as latest
FROM committed_data
WHERE tenant_id = (SELECT id FROM t);
```

Expected: majority of rows have source_date. Date range should span Jan–Mar 2024 (approximately 2024-01-01 to 2024-03-31).

### 2D: Verify Committed Data Volume

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as total_committed,
  count(entity_id) as bound_to_entity,
  count(*) - count(entity_id) as orphan_rows
FROM committed_data
WHERE tenant_id = (SELECT id FROM t);
```

Expected: ~119,000 total rows (NOT 140,510 — that was duplicate imports). Bound rows should be high percentage.

### 2E: Verify Assignments

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT count(*) as assignments
FROM rule_set_assignments
WHERE tenant_id = (SELECT id FROM t);
```

Expected: ≈ entity count (719 × number of rule sets).

### 2F: Full Engine Contract

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM rule_sets WHERE tenant_id = t.id) as rule_sets,
  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT count(*) FROM periods WHERE tenant_id = t.id) as periods,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id) as committed_data,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL) as bound_rows,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND source_date IS NOT NULL) as source_date_rows,
  (SELECT count(*) FROM rule_set_assignments WHERE tenant_id = t.id) as assignments
FROM t;
```

### Proof Gate 2:
- PG-3: Entities ≈ 719 (NOT 19,578)
- PG-4: Committed data ≈ 119,000 (NOT 140,510)
- PG-5: Source_date populated on transaction rows
- PG-6: Assignments created (count ≈ entities × rule_sets)
- PG-7: Entity_id bound on transaction rows (orphans minimal)

**Commit:** `OB-154 Phase 2: Data imported — [N] entities, [M] committed rows, [K] assignments`

---

## PHASE 3: CREATE PERIODS + CALCULATE JANUARY

### 3A: Create Periods

If periods = 0 (expected — Decision 92 removed period creation from import):

Navigate to Calculate surface on localhost:3000. Use the "Create periods from data" button (OB-153 added this) or create manually:

January 2024: 2024-01-01 to 2024-01-31
February 2024: 2024-02-01 to 2024-02-29
March 2024: 2024-03-01 to 2024-03-31

Verify:
```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT label, start_date, end_date FROM periods WHERE tenant_id = (SELECT id FROM t) ORDER BY start_date;
```

### 3B: Calculate January ONLY

Select the January 2024 period and the Óptica rule set. Click Calculate.

The engine hybrid path (OB-152) will:
1. Try `source_date BETWEEN '2024-01-01' AND '2024-01-31'` first
2. Fall back to period_id if no source_date rows match
3. Evaluate only entities with data in the January window

### 3C: Verify Calculation Results

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as result_count,
  SUM(total_payout) as total_payout
FROM calculation_results cr
JOIN calculation_batches cb ON cr.batch_id = cb.id
WHERE cr.tenant_id = (SELECT id FROM t)
  AND cb.created_at = (SELECT MAX(created_at) FROM calculation_batches WHERE tenant_id = (SELECT id FROM t));
```

Expected:
- result_count: ≈ 719 (one per entity with January data)
- total_payout: within ±5% of MX$1,253,832

### Proof Gate 3:
- PG-8: Periods created (at least January 2024)
- PG-9: Calculation executes without error
- PG-10: Result count ≈ 719
- PG-11: Total payout within ±5% of MX$1,253,832
- PG-12: Results render on the calculate/results page in browser

**Commit:** `OB-154 Phase 3: January calculated — [N] entities, MX$[total]`

---

## PHASE 4: CC-UAT-07 — FORENSIC VERIFICATION

This is the strict verification phase. CC must produce forensic evidence of pipeline correctness, not summary claims.

### 4A: Entity-Level Trace — 5 Employees

Pick these 5 employees (or the closest matches by external_id):

| external_id | Expected Role | Expected Jan Payout (approx) |
|---|---|---|
| 96568046 | OPTOMETRISTA CERTIFICADO | ~MX$1,504 |
| 90319253 | OPTOMETRISTA NO CERTIFICADO | ~MX$1,119 |
| 90198149 | OPTOMETRISTA NO CERTIFICADO | ~MX$2,500 |
| 98872222 | OPTOMETRISTA CERTIFICADO | ~MX$3,000 |
| 90162065 | OPTOMETRISTA CERTIFICADO | ~MX$0 |

For each employee, create `scripts/ob154-entity-trace.ts` and output:

```
=== ENTITY TRACE: [external_id] ===
Entity ID: [uuid]
External ID: [external_id]
Entity Type: [type]

COMMITTED DATA FOR JANUARY:
  Total rows: [N]
  Source dates: [min] to [max]
  Data types present: [list]
  Key fields: [first 5 field names from row_data]

RULE SET ASSIGNMENT:
  Assigned to: [rule_set_name]
  Assignment type: [type]

CALCULATION RESULT:
  Batch ID: [uuid]
  Total payout: MX$[amount]
  Components: [per-component breakdown from components JSONB]
    - [component_name]: MX$[amount]
    - [component_name]: MX$[amount]
    ...

MATCH CHECK:
  Expected: ~MX$[expected]
  Actual: MX$[actual]
  Delta: MX$[delta] ([percentage]%)
```

### 4B: Component Aggregate Check

```sql
-- Extract component-level totals across ALL January results
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1),
latest_batch AS (
  SELECT id FROM calculation_batches
  WHERE tenant_id = (SELECT id FROM t)
  ORDER BY created_at DESC LIMIT 1
)
SELECT
  comp->>'name' as component_name,
  count(*) as entity_count,
  SUM((comp->>'payout')::numeric) as component_total
FROM calculation_results cr,
  jsonb_array_elements(cr.components) as comp
WHERE cr.batch_id = (SELECT id FROM latest_batch)
GROUP BY comp->>'name'
ORDER BY component_total DESC;
```

Compare each component total against ground truth:

| Component | Ground Truth | Engine | Delta % |
|---|---|---|---|
| Optical Sales | MX$748,600 | MX$[?] | [?]% |
| Store Sales | MX$116,250 | MX$[?] | [?]% |
| New Customers | MX$39,100 | MX$[?] | [?]% |
| Collections | MX$283,000 | MX$[?] | [?]% |
| Club Protection | MX$10 | MX$[?] | [?]% |
| Warranty | MX$66,872 | MX$[?] | [?]% |

### 4C: Temporal Windowing Verification

Prove that the engine only used January data, not all 3 months:

```sql
-- How many committed_data rows were in the January window?
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  count(*) as january_rows,
  count(DISTINCT entity_id) as january_entities
FROM committed_data
WHERE tenant_id = (SELECT id FROM t)
  AND source_date BETWEEN '2024-01-01' AND '2024-01-31';

-- How many total committed_data rows exist?
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT count(*) as total_rows FROM committed_data WHERE tenant_id = (SELECT id FROM t);
```

January rows should be approximately 1/3 of total rows (3 months of data). If January rows = total rows, temporal windowing is NOT working — the engine is using all data regardless of source_date.

### 4D: Entity Count Verification

```sql
-- Verify no duplicate entities
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT external_id, count(*) as duplicates
FROM entities
WHERE tenant_id = (SELECT id FROM t)
GROUP BY external_id
HAVING count(*) > 1
ORDER BY count(*) DESC
LIMIT 10;
```

Expected: 0 rows returned (no duplicates).

### 4E: Source Date Distribution

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  date_trunc('month', source_date) as month,
  count(*) as row_count,
  count(DISTINCT entity_id) as entity_count
FROM committed_data
WHERE tenant_id = (SELECT id FROM t)
  AND source_date IS NOT NULL
GROUP BY date_trunc('month', source_date)
ORDER BY month;
```

Expected: 3 months, each with ~1/3 of total rows, each with ~719 entities.

### CC-UAT-07 DELIVERABLE

Write `CC-UAT-07_OPTICA_VERIFICATION.md` at project root with ALL query outputs pasted verbatim. This is forensic evidence, not summary. Every SQL query, every result, every number.

### Proof Gate 4 (CC-UAT):
- PG-13: 5-entity trace completed with per-component breakdown
- PG-14: Component aggregates match ground truth ±5% per component
- PG-15: Temporal windowing proven (January rows < total rows)
- PG-16: Entity dedup proven (0 duplicate external_ids)
- PG-17: Source date distribution shows 3 distinct months
- PG-18: All query outputs pasted verbatim (not summarized)

**Commit:** `OB-154 Phase 4: CC-UAT-07 — forensic verification complete`

---

## PHASE 5: BROWSER VERIFICATION

This phase verifies what the USER sees, not what SQL returns.

### 5A: Calculate Page

On localhost:3000, as VL Admin in Óptica tenant:
1. Navigate to Calculate
2. Rule set is visible with component count (not "no components")
3. Period selector shows January 2024
4. Click Calculate
5. Results render with total payout

### 5B: Results Display

1. Total payout visible on screen
2. Entity count visible
3. Per-entity results navigable (if results detail page exists)

### 5C: Evidence

Paste browser console output showing:
- No errors
- API responses (calculation route returns 200)
- Total payout value rendered

### Proof Gate 5 (Browser):
- PG-19: Calculate page shows rule set with components
- PG-20: Calculate executes without browser errors
- PG-21: Total payout renders on screen
- PG-22: `npm run build` exits 0

**Commit:** `OB-154 Phase 5: Browser verification — rendered result confirmed`

---

## PHASE 6: COMPLETION REPORT + PR

### 6A: Completion Report

Write `OB-154_COMPLETION_REPORT.md` at project root:

1. Phase 0: Clean state confirmation
2. Phase 1: Plan import (component count)
3. Phase 2: Data import (entity count, committed rows, source_date coverage, assignments)
4. Phase 3: Calculation (result count, total payout, delta vs ground truth)
5. Phase 4: CC-UAT-07 summary (5-entity traces, component aggregates, temporal windowing, entity dedup)
6. Phase 5: Browser evidence
7. All 22 proof gates — PASS/FAIL with evidence

Include the Engine Contract final state:
```
rule_sets: [N]
entities: [N] (expected ≈ 719)
periods: [N]
committed_data: [N] (expected ≈ 119,000)
assignments: [N]
results: [N] (expected ≈ 719 for January)
total_payout: MX$[amount] (expected ≈ MX$1,253,832)
```

### 6B: PR

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-154: Single Clean Reimport + Calculate — Óptica Vertical Slice Proof" \
  --body "## What This OB Proves

### The Vertical Pipeline Slice Works End-to-End
1. Import plan (PPTX) → AI extracts [N] components → 1 rule_set
2. Import data (XLSX, ~119K rows) → SCI classifies → [N] entities created → source_dates bound → assignments created
3. Calculate January 2024 → [N] entity results → MX\$[total]

### Entity Dedup
- Created: [N] entities from ~119K data rows
- Unique external_ids: [N]
- Duplicates: 0

### Temporal Windowing (Decision 92)
- Total committed rows: [N]
- January window rows: [N] (~1/3 of total)
- Engine correctly windowed by source_date

### Calculation Accuracy
- Total payout: MX\$[amount]
- Ground truth: MX\$1,253,832
- Delta: [N]%
- Component-level breakdown: see CC-UAT-07

### CC-UAT-07 Forensic Verification
- 5 employee traces with per-component breakdown
- Component aggregates vs ground truth
- Temporal windowing proof
- Entity dedup proof
- All evidence pasted verbatim

## Proof Gates: see OB-154_COMPLETION_REPORT.md"
```

### FULL PROOF GATE TABLE

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Plan imported | Rule set exists with ≥6 components |
| PG-2 | No duplicate rule sets | Exactly 1 rule_set row |
| PG-3 | Entity dedup correct | Entities ≈ 719 (NOT 19,578) |
| PG-4 | Committed data correct | ≈ 119,000 rows (NOT 140,510) |
| PG-5 | Source_date populated | Transaction rows have source_date |
| PG-6 | Assignments created | Count ≈ entities × rule_sets |
| PG-7 | Entity binding | Entity_id populated on transaction rows |
| PG-8 | Periods created | At least January 2024 |
| PG-9 | Calculation executes | No errors |
| PG-10 | Result count | ≈ 719 |
| PG-11 | Total payout | Within ±5% of MX$1,253,832 |
| PG-12 | Results render | Visible on calculate/results page |
| PG-13 | Entity traces | 5 employees with per-component breakdown |
| PG-14 | Component aggregates | Each within ±5% of ground truth |
| PG-15 | Temporal windowing | January rows < total rows |
| PG-16 | No entity duplicates | 0 duplicate external_ids |
| PG-17 | Source date distribution | 3 months visible |
| PG-18 | Evidence verbatim | All SQL outputs pasted, not summarized |
| PG-19 | Calculate page | Shows rule set with components |
| PG-20 | No browser errors | Console clean during calculation |
| PG-21 | Payout renders | Total visible on screen |
| PG-22 | Build clean | `npm run build` exits 0 |

**Commit:** `OB-154 Complete: Single clean reimport — vertical slice proven`

---

## WHAT NOT TO DO

1. **Do NOT import the data file more than once.** One clean import. If it fails, debug and fix the code, then nuclear clear and try again — do not stack imports.
2. **Do NOT skip Phase 4 (CC-UAT).** The UAT is the proof. Without it, this is another OB-153 — pipeline connects but numbers are wrong.
3. **Do NOT report PG-11 as PASS if total payout is >5x ground truth.** OB-153 reported MX$7,187,662.60 as "complete." That was 5.73x the target. That is not a pass.
4. **Do NOT summarize SQL outputs.** Paste them verbatim. (Pattern #26, #27, #29)
5. **Do NOT fix engine then UI or UI then engine.** Vertical slice. (Foundational Rule)
6. **Do NOT hardcode field names.** Korean Test applies. (AP-5, AP-6, AP-24, AP-25)
7. **Do NOT create entities per data row.** Deduplicate by unique identifier first. (Entity Model Design Spec: UNIQUE(tenant_id, external_id, entity_type))
8. **Do NOT calculate on all 3 months.** January ONLY for the proof gate. The ground truth is MX$1,253,832 for January 2024.

---

## IF THE ENTITY COUNT IS WRONG (>1,000)

This is the most likely failure point based on OB-153. If Phase 2B shows entities >> 719:

1. **STOP.** Do not proceed to Phase 3.
2. **Diagnose:** Find the entity creation code in the SCI execute pipeline. Trace how it identifies unique entity identifiers.
3. **Fix:** The entity creation must:
   a. Scan committed_data for the high-cardinality identifier column (structural detection, not field-name matching)
   b. Extract DISTINCT values
   c. Check entities table for existing matches by (tenant_id, external_id)
   d. INSERT only new entities
   e. The entities table should enforce UNIQUE(tenant_id, external_id, entity_type)
4. **Nuclear clear Óptica** (run HF-088 nuclear clear script again)
5. **Re-import** from Phase 1

Do NOT proceed to calculation on inflated entities. The results will be meaningless.

---

## IF THE TOTAL PAYOUT IS WRONG (>±20% of MX$1,253,832)

If Phase 3C shows total_payout far from ground truth:

1. Run Phase 4 (CC-UAT) anyway — the forensic trace reveals WHERE the gap is.
2. Check component aggregates — which component(s) are off?
3. Check temporal windowing — is January data correctly isolated?
4. Check variant routing — are certified/non-certified matrices applying to correct entities?
5. Document the gap analysis in the completion report with specific root causes identified.
6. Do NOT inflate proof gate scores. If PG-11 fails, it fails. Document why and what needs fixing next.

---

*OB-154 — March 4, 2026*
*"One import. One calculation. One proof. Every number accounted for."*
