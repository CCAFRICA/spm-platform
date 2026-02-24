# OB-85 R5: RECONNECT THREE COMPONENT DATA PIPES
## Three components produce $0. The data pipes were disconnected by overcorrection. Trace, diagnose, reconnect.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE.md` — actual database schema
3. The OB-85 R3/R4 completion report — what was fixed, what broke

---

## STANDING RULES UPDATES — ADD IMMEDIATELY

Before doing ANYTHING else, add these to `CC_STANDING_ARCHITECTURE_RULES.md`:

```markdown
## TERMINOLOGY ENFORCEMENT (Rule 21)

- "Classification Signal" — NOT "Training Signal". We enrich prompts, not retrain models.
- "LLM-Primary, Deterministic Fallback, Human Authority" — NOT "AI-Primary, ML Fallback".
- Apply to all code, comments, documentation, commit messages.
```

**Commit:** `OB-85-R5: Standing rule — terminology enforcement`

---

## CONTEXT — WHAT HAPPENED AND WHY THIS EXISTS

### Pipeline Status (after R3/R4)
- **Import:** ✅ 119,129 records, 7 sheets, field mapping + sheet classification
- **Entity Resolution:** ✅ 719 entities
- **Calculation — Performance Matrix:** ✅ MX$525,000 (correct tier lookups)
- **Calculation — Tiered Bonus:** ❌ $0 — store data pipe disconnected
- **Calculation — Percentage Commission:** ❌ $0 — insurance data pipe disconnected
- **Calculation — Conditional Percentage:** ❌ $0 — service data pipe disconnected
- **Reconciliation:** ✅ 719/719 matched, 100% match rate

### The Problem
R4 fixed three formula bugs (percentage vs decimal, rate table lookups, compounding) that brought the total from MX$4.19B down to MX$525K. But during that fix, three component data pipes were disconnected — likely by overcorrection that removed or broke the data routing for components that depend on store-level, insurance, or service data.

### The Numbers
- **VL Total:** MX$525,000 (only Performance Matrix contributing)
- **Benchmark Total:** MX$3,665,282
- **Delta:** 48.73% — the gap IS these three dead components
- **Target after R5:** <15% delta

### Key Test Entity
- **Entity 93515855:** VL = MX$2,200, Benchmark = MX$4,650
- The MX$2,450 gap per entity × 719 entities ≈ the missing MX$3.14M

### Tenant
- Tenant ID: `9b2bb4e3-6828-4451-b3fb-dc384509494f`
- Import file: `BacktTest_Optometrista_mar2025_Proveedores.xlsx`
- 7 sheets, 719 entities, January 2024 period

---

## CC FAILURE PATTERN WARNING

These patterns have occurred in previous rounds. **Do not repeat them.**

| Pattern | What Happened | What To Do Instead |
|---------|---------------|-------------------|
| Theory-first diagnosis | R2 guessed "period selection" without tracing data. Wrong. | Phase 0 SQL trace before ANY code. |
| Overcorrection | R4 fixed inflation but killed 3 components. | Touch ONLY the broken pipe. Do not refactor working code. |
| "Was never broken" claims | R2 claimed engine "was NEVER broken." Browser disagreed. | Trust browser + SQL output over theory. |
| Supabase silent failure | `.in()` with >200 UUIDs returns 0 rows silently. | Batch ≤200. Grep for `.in(` in any new code. |
| Fix doesn't deploy | Code fixed but browser shows old data. | Pull → build → restart → verify in browser. |

---

## PHASE 0: SURGICAL DIAGNOSIS — MANDATORY BEFORE ANY CODE

### Philosophy
This is the PROVEN methodology from R3. It works. Do not skip it. Do not theorize. Trace actual data through actual tables.

### 0A: What components exist in the plan's rule_set?

```sql
-- Get the active plan's rule_set for this tenant
SELECT id, name, jsonb_pretty(rule_set) as rules
FROM plans
WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND status = 'active'
LIMIT 1;
```

**PASTE THE FULL rule_set JSON.** We need every component name, formula type, and data source reference.

### 0B: What does the calculation engine produce per component?

```sql
-- Get component_results for entity 93515855
SELECT 
  e.external_id,
  cr.total_payout,
  jsonb_pretty(cr.component_results) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
AND (e.external_id = '93515855' OR e.external_id LIKE '%-93515855')
LIMIT 1;
```

**PASTE THE FULL component_results.** Identify which components have `payout: 0` or are missing entirely.

### 0C: What raw data exists for this entity across ALL sheets?

```sql
-- All committed_data sheets for entity 93515855
SELECT cd.sheet_name, 
       COUNT(*) as row_count,
       substring(cd.raw_data::text, 1, 500) as sample_data
FROM committed_data cd
JOIN entities e ON e.id = cd.entity_id
WHERE cd.tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
AND (e.external_id = '93515855' OR e.external_id LIKE '%-93515855')
GROUP BY cd.sheet_name, cd.raw_data
LIMIT 20;
```

**Key question:** Do records from ALL 7 sheets appear for this entity? Or only some sheets?

### 0D: What does the data layer assemble for this entity?

Trace the code path in `data-layer-service.ts` that builds the entity's data package for the calculation engine:

```bash
echo "=== DATA LAYER: How entity data is assembled for calculation ==="
grep -n "componentMetrics\|buildEntity\|assembleEntity\|entityData\|storeAttribution\|store_component\|employee_component" \
  src/lib/data-architecture/data-layer-service.ts | head -40

echo ""
echo "=== CALCULATION ENGINE: How it reads entity data ==="
grep -n "componentMetrics\|getMetric\|getAttainment\|resolveMetric\|component.*data" \
  src/lib/orchestration/calculation-orchestrator.ts \
  src/lib/orchestration/metric-resolver.ts 2>/dev/null | head -30

echo ""
echo "=== WHAT COMPONENTS DOES THE ENGINE TRY TO CALCULATE? ==="
grep -n "component\|formula\|calculate\|payout" \
  src/lib/calculation/calculation-engine.ts 2>/dev/null | head -30
```

### 0E: Identify the EXACT disconnection point

For each of the three broken components, trace:

1. **What data source does the component need?** (which sheet, which metrics)
2. **Does committed_data have rows for that sheet for entity 93515855?**
3. **Does the data layer include that sheet in componentMetrics?**
4. **Does the calculation engine attempt to read it?**
5. **WHERE does the pipe break?** (data layer assembly? sheet classification? store attribution? metric resolution?)

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-85 R5
//
// PLAN COMPONENTS (from rule_set):
// 1. [component name] — formula type — data source — STATUS
// 2. [component name] — formula type — data source — STATUS
// ... (all 6)
//
// ENTITY 93515855 COMPONENT RESULTS:
// [paste from 0B]
//
// SHEETS WITH DATA FOR ENTITY 93515855:
// [list sheets from 0C]
//
// DISCONNECTION POINTS:
// Component "Percentage Commission": breaks at [exact location]
// Component "Conditional Percentage": breaks at [exact location]
// Component "Tiered Bonus": breaks at [exact location]
//
// ROOT CAUSE HYPOTHESIS:
// [ONE specific hypothesis based on traced evidence]
```

**Commit:** `OB-85-R5 Phase 0: Surgical diagnosis — three dead component data pipes`

**Do NOT write fix code until Phase 0 is committed.**

---

## MISSION 1: RECONNECT COMPONENT DATA PIPES

Based on Phase 0 diagnosis, reconnect the three broken pipes.

### Critical Constraints

1. **TOUCH ONLY THE BROKEN PIPE.** The Performance Matrix works. Do not change any code path that the Performance Matrix uses. If a shared function needs modification, ensure the Performance Matrix path is unaffected.

2. **NO NEW CODE PATHS.** Do not create a parallel calculation pipeline, a second data assembly function, or a "component router." Fix the existing path that these three components USED to flow through before R4 broke them.

3. **KOREAN TEST.** Zero hardcoded sheet names, column names, component names, or language-specific patterns in the fix. The fix must work for any sheet classified as store_component or employee_component by the AI.

4. **CARRY EVERYTHING.** All fields preserved. The fix restores data routing, not data filtering.

5. **FIX LOGIC NOT DATA.** Do not insert test values, mock data, or answer keys. The fix ensures the engine can FIND the data that already exists in committed_data.

6. **SUPABASE BATCH ≤200.** Any new `.in()` calls must batch at 200 max.

### Expected Outcome Per Component

| Component | Data Source | Join Type | What Should Happen |
|-----------|-----------|-----------|-------------------|
| Percentage Commission | Insurance/individual sheet | employee_component | Entity's attainment/amount from sheet → formula → payout |
| Conditional Percentage | Service sheet | employee_component or store_component | Entity's metrics from sheet → conditional check → payout |
| Tiered Bonus | Store-level sheet(s) | store_component → employee via roster storeId | Store metrics attributed to employee → tier lookup → payout |

### After Fix — Verify With SQL

```sql
-- Re-trigger calculation (from browser or API), then:

-- Check entity 93515855 component breakdown
SELECT 
  e.external_id,
  cr.total_payout,
  jsonb_pretty(cr.component_results) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
)
AND (e.external_id = '93515855' OR e.external_id LIKE '%-93515855')
LIMIT 1;

-- Check aggregate
SELECT 
  SUM(cr.total_payout) as vl_total,
  COUNT(*) as entity_count,
  AVG(cr.total_payout) as avg_payout
FROM calculation_results cr
WHERE cr.batch_id = (
  SELECT id FROM calculation_batches 
  WHERE tenant_id = '9b2bb4e3-6828-4451-b3fb-dc384509494f'
  ORDER BY created_at DESC LIMIT 1
);
```

### Accuracy Targets

- Entity 93515855: closer to MX$4,650 (benchmark) than MX$2,200 (current)
- Aggregate total: closer to MX$3,665,282 than MX$525,000
- At least 4 of 6 components producing non-zero payouts
- Delta target: <15% (stretch: <10%)

**Commit:** `OB-85-R5 Mission 1: Reconnect [component name] data pipe — [what was wrong]`

(One commit per component fix is fine. Or one combined commit if root cause is shared.)

**STOP HERE. Report findings and wait for Andrew to re-test in browser + re-run reconciliation.**

---

## MISSION 2: RECONCILIATION VERIFICATION (Andrew-led)

After Andrew confirms the fix in browser:

1. Navigate to Operate → Reconciliation
2. Run reconciliation against benchmark
3. Report: match count, match rate, delta %, per-component breakdown if visible
4. Screenshot or paste results

If delta is >15%, we do R6 with another surgical trace on the remaining gap.
If delta is <15%, we proceed to OB-86.

---

## MISSION 3: BUILD + PR

Only after Mission 2 confirms improvement:

```bash
pkill -f "next dev" 2>/dev/null || true
rm -rf .next
npm run build
npm run dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Completion Report

Save as `OB-85_R5_COMPLETION_REPORT.md` in PROJECT ROOT.

Include:
1. **Phase 0 diagnosis** — exact disconnection points per component (with SQL evidence)
2. **Root cause** — what R4 overcorrection broke and why
3. **Fix description** — files changed, lines changed, before/after
4. **Entity 93515855** — before R5, after R5, benchmark value
5. **Aggregate** — before R5 (MX$525K), after R5, benchmark (MX$3.67M), delta %
6. **Per-component** — which components now produce non-zero, which still $0
7. **All proof gates** — PASS/FAIL with evidence

### PR

```bash
gh pr create --base main --head dev \
  --title "OB-85 R5: Reconnect Component Data Pipes — Close 48.73% Delta" \
  --body "## What This Fixes

### Three Components Producing \$0
- Percentage Commission: [status after fix]
- Conditional Percentage: [status after fix]  
- Tiered Bonus: [status after fix]

### Accuracy
- Before R5: MX\$525,000 (48.73% of benchmark)
- After R5: MX\$[NEW_TOTAL] ([NEW_DELTA]% of benchmark)
- Benchmark: MX\$3,665,282

### Root Cause
[What R4 overcorrection broke — one sentence]

## Proof Gates: see OB-85_R5_COMPLETION_REPORT.md"
```

### Proof Gates

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Phase 0 committed | Diagnosis with SQL output before any fix code |
| PG-2 | Root cause identified | Specific file(s), line(s), and what changed in R4 that broke these pipes |
| PG-3 | Performance Matrix unharmed | Still produces MX$525K (±5%) after fix |
| PG-4 | Percentage Commission non-zero | Produces payout for at least some entities |
| PG-5 | Conditional Percentage non-zero | Produces payout for at least some entities |
| PG-6 | Tiered Bonus non-zero | Produces payout for at least some entities |
| PG-7 | Entity 93515855 improved | Closer to MX$4,650 than MX$2,200 |
| PG-8 | Aggregate delta improved | <15% delta from benchmark MX$3,665,282 |
| PG-9 | No hardcoded field names | Zero instances of sheet-specific or language-specific patterns in fix |
| PG-10 | Supabase batch ≤200 | Any new `.in()` calls verified |
| PG-11 | `npm run build` exits 0 | Clean build |
| PG-12 | localhost:3000 responds | HTTP 200 |

**Commit:** `OB-85-R5 Final: Completion report + PR`

---

## CRITICAL REMINDERS

- **Diagnosis before code.** Phase 0 is non-negotiable. It worked in R3.
- **Touch only the broken pipe.** Performance Matrix = sacred. Do not disturb.
- **Expect iteration.** If R5 doesn't close to <15%, we do R6. That's normal.
- **Trust the browser.** If SQL says it's fixed but the browser shows $0, it's not fixed.
- **One entity, every table.** The surgical trace methodology: entity 93515855 through every table, every transformation, every output. Find where the data disappears.

---

*OB-85 R5 — February 24, 2026*
*"Three pipes disconnected. Three pipes reconnected. The delta closes."*
*"Diagnosis before code. Touch only the broken pipe. Trust the browser."*
