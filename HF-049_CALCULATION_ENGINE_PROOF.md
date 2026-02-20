# HF-049: Calculation Engine Proof of Life
## Hotfix — Diagnostic + Fix
## Date: February 19, 2026
## PREREQUISITE: CC_STANDING_ARCHITECTURE_RULES.md (read FIRST)
## PREREQUISITE: SCHEMA_REFERENCE.md (source of truth for ALL column names)

NEVER ask yes/no. NEVER say "shall I". JUST ACT.

---

## WHY THIS HOTFIX EXISTS

OB-65 validated the data model by seeding calculation_results directly into Supabase via REST API. This proved the schema works and dashboards can read data. But **the calculation engine code path was never triggered.** The orchestrator was never called. The engine never read committed_data, never applied rule_set components, never wrote calculation_results.

This hotfix has ONE objective: **prove the calculation engine produces correct results from real data, triggered through the actual code path.**

We are NOT building new features. We are NOT redesigning the engine. We are finding the existing code path, fixing any schema drift blocking it, and proving it works.

---

## CONTEXT: WHAT EXISTS IN SUPABASE RIGHT NOW

OB-65 seeded data for the RetailCDMX tenant (c11ca8de). This data is USEFUL — it gives us entities, periods, rule_sets, rule_set_assignments, and committed_data to test against. DO NOT delete it.

Expected state (from OB-65):
- 5 entities (Maria Garcia, Carlos Rodriguez, Ana Martinez, Luis Hernandez, Sofia Lopez)
- Period "January 2024" (2024-01)
- Rule set "CGMX Retail Plan" with 2 components (Sales Commission 5%, Attainment Bonus tiers)
- 5 rule_set_assignments linking entities to rule set
- 5 committed_data rows with sales amounts
- 5 calculation_results (SEEDED — these are the ones we need to REPLACE with engine output)
- 5 entity_period_outcomes (SEEDED — must be replaced by engine materialization)

---

## PHASE 0: DIAGNOSTIC — FIND THE CODE PATH

### 0A: Find the calculation trigger

```bash
echo "=== WHERE DOES CALCULATION START? ==="
grep -rn "runCalculation\|triggerCalculation\|startCalculation\|executeCalculation\|calculateBatch\|runBatch\|startBatch" web/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | head -20

echo ""
echo "=== CALCULATION API ROUTES ==="
find web/src/app/api -path "*calc*" -name "route.ts" 2>/dev/null
find web/src/app/api -path "*batch*" -name "route.ts" 2>/dev/null

echo ""
echo "=== CALCULATE PAGE UI ==="
find web/src/app -path "*calculate*" -name "page.tsx" 2>/dev/null
find web/src/app -path "*calc*" -name "page.tsx" 2>/dev/null
```

### 0B: Read the orchestrator

```bash
echo "=== ORCHESTRATOR FILE ==="
find web/src -name "*orchestrat*" -name "*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ORCHESTRATOR STRUCTURE ==="
# Read the full file — do NOT skip this
cat web/src/lib/orchestration/calculation-orchestrator.ts 2>/dev/null || \
cat web/src/lib/calculation/calculation-orchestrator.ts 2>/dev/null || \
echo "ORCHESTRATOR NOT FOUND AT EXPECTED PATHS"
```

### 0C: Read the calculation engine

```bash
echo "=== ENGINE FILE ==="
find web/src -name "*calculation-engine*" -name "*.ts" | grep -v node_modules | grep -v ".next"
find web/src -name "*calc-engine*" -name "*.ts" | grep -v node_modules | grep -v ".next"

echo ""
echo "=== ENGINE STRUCTURE ==="
cat web/src/lib/compensation/calculation-engine.ts 2>/dev/null || \
cat web/src/lib/calculation/calculation-engine.ts 2>/dev/null || \
echo "ENGINE NOT FOUND AT EXPECTED PATHS"
```

### 0D: Trace the data flow

Document (commit as comment in completion report):

1. **Entry point**: What function/API route initiates calculation?
2. **Input resolution**: Where does the orchestrator get its data? (Supabase? localStorage? In-memory?)
   - Rule set: How is the active rule set loaded?
   - Entities: How are entities resolved?
   - Committed data: How is sales/transaction data loaded?
   - Assignments: How are entity→rule_set links resolved?
3. **Engine execution**: What does the engine receive? What does it return?
4. **Output persistence**: Where do results get written? (Supabase? localStorage?)
5. **Schema alignment**: Do ALL Supabase queries use column names from SCHEMA_REFERENCE.md?

### 0E: Identify blockers

Check EVERY Supabase query in the calculation path against SCHEMA_REFERENCE.md:

```bash
echo "=== ALL SUPABASE READS IN CALC PATH ==="
grep -n "\.from(\|\.select(\|\.eq(\|\.order(" web/src/lib/orchestration/ web/src/lib/calculation/ web/src/lib/compensation/ -r --include="*.ts" 2>/dev/null | grep -v node_modules | head -30

echo ""
echo "=== ALL SUPABASE WRITES IN CALC PATH ==="
grep -n "\.insert(\|\.upsert(\|\.update(" web/src/lib/orchestration/ web/src/lib/calculation/ web/src/lib/compensation/ -r --include="*.ts" 2>/dev/null | grep -v node_modules | head -30
```

Cross-reference EVERY column name against SCHEMA_REFERENCE.md. List mismatches.

**Commit:** `HF-049 Phase 0: Calculation engine diagnostic`

---

## PHASE 1: ARCHITECTURE DECISION

```
ARCHITECTURE DECISION RECORD
============================
Problem: Calculation engine code path untested against live Supabase data.

What did the diagnostic find?
- Does the orchestrator read from Supabase or localStorage?
- Are there schema mismatches blocking execution?
- Is there an API route or is calculation client-side only?

Option A: Fix schema mismatches in existing code path
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option B: [If orchestrator reads localStorage] Rewire to Supabase reads
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

Option C: [If no server-side path exists] Create API route for calculation
  - Scale test: Works at 10x? ___
  - AI-first: Any hardcoding? ___
  - Transport: Data through HTTP bodies? ___
  - Atomicity: Clean state on failure? ___

CHOSEN: Option ___ because ___
REJECTED: Option ___ because ___
```

**Commit:** `HF-049 Phase 1: Architecture decision`

---

## PHASE 2: FIX — MAKE THE ENGINE RUN

Based on Phase 0 findings, fix whatever is blocking the calculation engine from executing against live Supabase data.

**Rules:**
- Fix ONLY what's blocking execution. Do not refactor, redesign, or add features.
- Every Supabase query MUST use column names from SCHEMA_REFERENCE.md.
- Do NOT seed results. The engine must PRODUCE results from committed_data + rule_sets.
- Do NOT hardcode expected values. Fix logic, not data.
- Anti-Pattern Registry: check AP-1 through AP-17 before implementing.

**What "fixed" means:**
1. The orchestrator reads rule_sets, entities, committed_data, rule_set_assignments from Supabase
2. The engine calculates per-entity, per-component payouts
3. Results are written to calculation_results in Supabase
4. entity_period_outcomes are materialized from calculation_results

---

## PHASE 3: PROVE — DELETE SEEDED DATA, RUN ENGINE, VERIFY

This is the critical proof. Delete the OB-65 seeded results, run the engine, verify it produces correct output.

### 3A: Delete seeded calculation data

```bash
echo "=== DELETE SEEDED RESULTS ==="
# Delete ONLY calculation_results and entity_period_outcomes for RetailCDMX tenant
# Do NOT delete committed_data, entities, periods, rule_sets, or rule_set_assignments
# Those are inputs — the engine needs them

# Use Supabase REST API with service role key:
# DELETE FROM calculation_results WHERE tenant_id = 'c11ca8de-...'
# DELETE FROM entity_period_outcomes WHERE tenant_id = 'c11ca8de-...'
# DELETE FROM calculation_batches WHERE tenant_id = 'c11ca8de-...'
```

Verify zero results:
```sql
SELECT count(*) FROM calculation_results WHERE tenant_id = 'c11ca8de-...';
-- Must return 0
SELECT count(*) FROM entity_period_outcomes WHERE tenant_id = 'c11ca8de-...';
-- Must return 0
```

### 3B: Trigger calculation

Trigger the calculation through whatever code path exists (API route, UI button handler, direct function call). Document exactly how it was triggered.

### 3C: Verify results

```sql
-- Calculation batch created?
SELECT id, lifecycle_state, entity_count, summary 
FROM calculation_batches 
WHERE tenant_id = 'c11ca8de-...' 
ORDER BY created_at DESC LIMIT 1;

-- Results created?
SELECT cr.entity_id, e.display_name, cr.total_payout, cr.components
FROM calculation_results cr
JOIN entities e ON cr.entity_id = e.id
WHERE cr.tenant_id = 'c11ca8de-...'
ORDER BY e.display_name;

-- Outcomes materialized?
SELECT epo.entity_id, e.display_name, epo.total_payout, epo.component_breakdown
FROM entity_period_outcomes epo
JOIN entities e ON epo.entity_id = e.id
WHERE epo.tenant_id = 'c11ca8de-...'
ORDER BY e.display_name;
```

### 3D: Validate math

The OB-65 seeded data defined these inputs:
- Maria Garcia: 150,000 MXN sales, 115% attainment
- Carlos Rodriguez: 120,000 MXN sales, 92% attainment
- Ana Martinez: 200,000 MXN sales, 135% attainment
- Luis Hernandez: 80,000 MXN sales, 65% attainment
- Sofia Lopez: 175,000 MXN sales, 105% attainment

Rule set has:
- Sales Commission: 5% on amount
- Attainment Bonus: <80%=0, 80-99%=2000, 100-119%=5000, 120%+=10000

**DO NOT hardcode these expected values in the engine.** The engine must derive them from the rule_set components and committed_data. But you CAN verify the output matches:

| Rep | Expected Commission | Expected Bonus | Expected Total |
|-----|-------------------|---------------|----------------|
| Maria Garcia | 7,500 | 5,000 | 12,500 |
| Carlos Rodriguez | 6,000 | 2,000 | 8,000 |
| Ana Martinez | 10,000 | 10,000 | 20,000 |
| Luis Hernandez | 4,000 | 0 | 4,000 |
| Sofia Lopez | 8,750 | 5,000 | 13,750 |
| **TOTAL** | | | **58,250 MXN** |

If the engine produces different values, that's a finding — investigate WHY. Do not patch to match.

**Commit:** `HF-049 Phase 3: Calculation engine proof — live results from engine execution`

---

## PHASE 4: BUILD + COMPLETION REPORT + PR

```bash
cd web
npx tsc --noEmit
npm run build
npm run dev
# Confirm localhost:3000 responds
```

### Completion Report

Create `HF-049_COMPLETION_REPORT.md` at PROJECT ROOT:

1. **Diagnostic findings** — what did Phase 0 reveal about the code path?
2. **Architecture decision** — what was chosen and why?
3. **Fixes applied** — what schema mismatches or code issues were fixed?
4. **PROOF: Calculation results** — paste the actual SQL query output showing:
   - calculation_batch record with lifecycle_state and entity_count
   - Per-entity calculation_results with total_payout and components
   - Entity_period_outcomes with component_breakdown
5. **Math validation** — do the engine-produced values match expected? If not, why?
6. **How to trigger calculation** — document the exact steps (API route, UI path, function call)

### Proof Gates

| # | Gate | Method | Pass Criteria |
|---|------|--------|--------------|
| PG-1 | Diagnostic documents full code path | Completion report | Entry point → engine → output documented |
| PG-2 | Seeded calculation_results deleted | DB query | 0 rows before engine runs |
| PG-3 | Engine produces calculation_results | DB query | Rows created by engine, not seed |
| PG-4 | Per-entity payouts are non-zero | DB query | At least 4 of 5 entities have total_payout > 0 |
| PG-5 | Total payout in correct range | DB query | Sum between 50,000 and 70,000 MXN |
| PG-6 | entity_period_outcomes materialized | DB query | Rows exist with component_breakdown |
| PG-7 | Build clean | npm run build | Exit 0 |
| PG-8 | Zero new anti-pattern violations | Self-check | AP-1 through AP-17 clear |

### Section F Quick Checklist

```
Before submitting completion report, verify:
☐ Architecture Decision committed before implementation?
☐ Anti-Pattern Registry checked — zero violations?
☐ Scale test: works for 10x current volume?
☐ AI-first: zero hardcoded field names/patterns added?
☐ All Supabase migrations executed AND verified with DB query?
☐ Proof gates verify LIVE/RENDERED state, not file existence?
☐ Browser console clean on localhost?
☐ Real data displayed, no placeholders?
☐ Single code path (no duplicate pipelines)?
☐ Atomic operations (clean state on failure)?
```

### Create PR

```bash
gh pr create --base main --head dev \
  --title "HF-049: Calculation Engine Proof of Life" \
  --body "## What This Proves

The calculation engine RUNS against live Supabase data and produces correct results.

### Evidence
- Seeded calculation_results deleted (0 rows verified)
- Engine triggered via [document code path]
- Engine produced calculation_results for 5 entities
- Per-entity payouts verified against rule_set components
- entity_period_outcomes materialized

### Proof Gates: 8 — see HF-049_COMPLETION_REPORT.md"
```

**Commit:** `HF-049 Final: Build, completion report, PR`

---

## WHAT THIS HOTFIX IS NOT

- NOT a redesign of the calculation engine
- NOT adding new calculation types or components
- NOT building UI for calculation triggering (that's a future OB)
- NOT testing with new data — using OB-65 seeded inputs
- NOT about the import pipeline — that's proven by HF-047/048

This is the simplest possible proof: does the engine code path work end-to-end against real database data?

---

*HF-049 — February 19, 2026*
*"The engine must calculate, not just store."*
