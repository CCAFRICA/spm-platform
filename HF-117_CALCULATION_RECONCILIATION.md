# HF-117: CALCULATION RECONCILIATION — THREE SYSTEMIC ISSUES
## Variant Routing + Conditional Gate Semantics + Entity Resolution Completeness

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply
2. `SCHEMA_REFERENCE_LIVE.md` — authoritative column reference
3. `DS-009_Field_Identity_Architecture_20260308.md` — controlling specification
4. `DS-009_Section6_Convergence_Calculation_Validation.md` — Decision 121

**Read all four before writing any code.**

---

## TROUBLESHOOTING FAILURE DOCUMENTATION

### FP-61: Ignoring Available Ground Truth

**What happened:** The ground truth file (Meridian_Resultados_Esperados.xlsx) was available throughout the session. The session handoff explicitly references it. Claude created this file. Instead of comparing engine output against the GT file immediately after the first calculation run, the session spent three HF cycles (HF-114, HF-115, HF-116) fixing issues one at a time through reactive diagnosis:

- HF-114: Fixed AI column mapping format → correct bindings, but MX$3.7M
- HF-115: Added convergence calculation validation → detected no anomaly because sample calc was correct
- HF-116: Fixed engine ratio scaling → MX$171,656 (still wrong)

**If the GT file had been examined after the first calculation run (MX$3.7M),** all four issues would have been visible simultaneously:
1. Variant routing (all employees treated as Senior)
2. Safety gate inverted (0 incidents → $0 instead of bonus)
3. Entity resolution (50 of 67 employees)
4. Fleet Utilization scale (100x — the only one that was actually caught)

Three of the four issues were invisible because Fleet Utilization's 100x error dominated the total. But comparing component-by-component against GT would have revealed variant routing and safety gate immediately — Revenue Performance for Claudia (Standard) should be MX$800, not MX$1,600.

**The pattern:** When a ground truth file exists, use it FIRST. Compare component-by-component BEFORE any diagnosis. The GT file is the reconciliation tool — it tells you exactly which components are wrong and by how much, eliminating the need for reactive SQL debugging (FP-45).

**Carry forward as FP-61: Always compare against ground truth file before diagnosing calculation errors. GT comparison identifies all issues simultaneously. Reactive diagnosis finds them one at a time.**

---

## CONTEXT — WHERE WE ARE

The DS-009 pipeline works end-to-end in production:
- Import → HC → field identities → AI column mapping → correct convergence bindings ✅
- Convergence calculation validation (Decision 121) ✅
- Engine uses convergence_bindings path (100% concordance) ✅
- **Grand total: MX$171,656 vs ground truth MX$185,063 (−7.2%)**

### Ground Truth Reconciliation (from Meridian_Resultados_Esperados.xlsx)

**GT: 67 employees, MX$185,063. Engine: 50 employees, MX$171,656.**

#### Claudia Cruz Ramírez (70001) — Coordinador (Standard), Monterrey Hub

| Component | GT Expected | Engine Produced | Delta | Root Cause |
|---|---|---|---|---|
| C1 Revenue Performance | MX$800 | MX$1,600 | +MX$800 | **Variant routing: treated as Senior** |
| C2 On-Time Delivery | MX$100 | MX$200 | +MX$100 | **Variant routing: treated as Senior** |
| C3 New Accounts | MX$0 | MX$0 | MX$0 | ✅ Correct |
| C4 Safety Record | MX$300 | MX$0 | −MX$300 | **Gate inverted: 0 incidents = FAIL** |
| C5 Fleet Utilization | MX$373 | MX$663 | +MX$290 | **Variant routing: Senior rate applied** |
| **Total** | **MX$1,573** | **MX$2,463** | **+MX$890** | |

#### Three Systemic Issues Identified

**ISSUE 1: Variant Routing — ALL employees treated as Senior (SYSTEMIC)**

The plan has 2 variants: Coordinador Senior (26 employees) and Coordinador/Standard (41 employees). The engine applies the Senior variant to ALL 50 calculated employees. This is not Meridian-specific — any multi-variant plan will have the same problem.

GT variant distribution:
- Coordinador Senior: 26 employees, total MX$99,178
- Coordinador (Standard): 41 employees, total MX$85,885

Evidence: C1 payouts form two distinct populations (Senior values: 200-2100, Standard values: 0-1050). The engine produces only Senior-range values.

**ISSUE 2: Conditional Gate Inverted — 0 incidents = FAIL instead of PASS (SYSTEMIC)**

The Safety Record component is a conditional gate. GT shows:
- 0 incidents → PASS → bonus (MX$300 Standard, MX$500 Senior)
- >0 incidents → FAIL → MX$0

The engine produces MX$0 for Claudia (0 incidents). The gate logic treats the input VALUE (0) as the output, not the gate CONDITION. Zero incidents means "passed the safety check" — but the engine sees the number 0 and returns 0 as the payout.

GT pattern: 55/67 employees earn safety bonus (0 incidents), 12/67 earn $0 (had incidents).

This is systemic — any conditional gate where the passing condition is "metric equals zero" will produce wrong results.

**ISSUE 3: Entity Resolution Drops 17 Employees (NEEDS INVESTIGATION)**

GT: 67 employees for January 2025. Engine: 50 entities calculated.
Plantilla sheet: 67 rows. Entity resolution: "50 created, 50 rows linked."
17 Plantilla rows did not produce entities. The data file (Datos_Rendimiento) has 201 rows = 67 × 3 months. All 67 employees have data.

This is likely a duplicate detection or row processing issue in entity resolution, not a data gap.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. Git commands from repo root (spm-platform), NOT from web/.
4. Commit this prompt as first action.
5. DO NOT MODIFY ANY AUTH FILE.
6. Supabase .in() ≤ 200 items.

---

## COMPLETION REPORT RULES (25-28)

25. Report file created BEFORE final build, not after
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues
27. Evidence = paste code/output. NOT "this was implemented."
28. One commit per phase. Collapsed commits = standing rule violation.

---

## MERIDIAN GROUND TRUTH

- **Tenant ID:** `5035b1e8-0754-4527-b7ec-9f93f85e4c79`
- **Ground truth grand total:** MX$185,063 (January 2025, 67 employees)
- **Current engine total:** MX$171,656 (50 employees)
- **Component totals (GT):** C1=44,000 | C2=15,550 | C3=69,900 | C4=20,700 | C5=34,913

### Variant Payout Reference (from GT — DO NOT hardcode, verify against plan)

| Component | Senior Payout Range | Standard Payout Range |
|---|---|---|
| C1 Revenue Performance | MX$0-2,100 (matrix lookup) | MX$0-1,050 (matrix lookup — ~50% of Senior) |
| C2 On-Time Delivery | MX$0-1,200 (tier lookup) | MX$0-600 (tier lookup — ~50% of Senior) |
| C3 New Accounts | MX$0-2,800 (scalar) | MX$0-1,600 (scalar — different rate) |
| C4 Safety Record | MX$0 or MX$500 (gate) | MX$0 or MX$300 (gate) |
| C5 Fleet Utilization | Hub-specific (higher rate) | Hub-specific (lower rate, ~56% of Senior) |

**These values are verification targets, not answer keys. The engine must derive them from the plan interpretation. Fix Logic Not Data.**

---

## CC ANTI-PATTERNS — THE SPECIFIC FAILURES TO AVOID

| Anti-Pattern | What Happened | What To Do Instead |
|---|---|---|
| FP-61: Ignoring GT | Three HF cycles before comparing against GT file | Compare against GT FIRST. All issues visible at once. |
| FP-45: Reactive SQL | Chased Fleet Utilization scale with SQL queries | Read engine code. The bug is in specific lines. |
| FP-54: Spec deviation as pragmatic | "Close enough" at 7.2% delta | Decision 95: 100% is the only gate. |
| Hardcoded fix for one tenant | Fix Meridian's variant assignment data | Fix the variant routing ENGINE CODE so it works for any plan |
| Fix data not logic | Adjust entity attributes to match Senior/Standard | Fix how the engine READS entity attributes for variant selection |

---

## PHASE 0: COMPREHENSIVE DIAGNOSTIC — ALL THREE ISSUES

**No code changes. Code reading + GT comparison only.**

### 0A: Variant Routing Diagnostic

```bash
echo "============================================"
echo "HF-117 PHASE 0A: VARIANT ROUTING"
echo "============================================"

echo ""
echo "=== 1. HOW ARE VARIANTS STORED IN RULE_SET? ==="
# The plan has 2 variants. Where are they in the components JSONB?
echo "Paste the components→variants structure from rule_sets"

echo ""
echo "=== 2. HOW DOES THE ENGINE SELECT A VARIANT? ==="
# Find the variant selection / routing code
grep -rn "variant\|Variant\|eligib\|Eligib\|qualification\|certified\|tipo\|coordinador" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -30

echo ""
echo "=== 3. PRINT THE VARIANT SELECTION FUNCTION ==="
# Find and print the full function that determines which variant an entity gets
grep -rn "function.*variant\|selectVariant\|resolveVariant\|matchVariant\|determineVariant" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -10

echo ""
echo "=== 4. WHAT ENTITY ATTRIBUTES ARE AVAILABLE? ==="
# What does the entities table store? Does it have tipo/variant info?
grep -rn "entity.*attributes\|temporal_attributes\|entity_type\|variant.*entity\|tipo" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 5. CHECK ENTITY DATA IN DB ==="
# What attributes do entities actually have?
echo "Run in Supabase:"
echo "SELECT external_id, display_name, entity_type, temporal_attributes"
echo "FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79' LIMIT 5;"
```

### 0B: Conditional Gate Diagnostic

```bash
echo "============================================"
echo "HF-117 PHASE 0B: CONDITIONAL GATE"
echo "============================================"

echo ""
echo "=== 1. FIND THE GATE EVALUATION CODE ==="
grep -rn "conditional\|gate\|evaluateGate\|evaluateConditional\|conditional_gate\|conditional_percentage" \
  web/src/app/api/calculation/run/route.ts \
  web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 2. PRINT THE GATE EVALUATION FUNCTION ==="
# Print the full function that evaluates conditional gates
grep -rn "function.*[Cc]onditional\|function.*[Gg]ate" \
  web/src/lib/calculation/ --include="*.ts" | head -5
# Then print surrounding context

echo ""
echo "=== 3. HOW IS THE GATE CONDITION EXTRACTED FROM THE PLAN? ==="
# The plan says "0 incidents = pass" — how does the AI extract this?
grep -rn "condition\|threshold\|gateValue\|passWhen\|failWhen\|zeroMeans" \
  web/src/lib/calculation/ --include="*.ts" | head -20

echo ""
echo "=== 4. WHAT DOES THE PLAN STORE FOR THE SAFETY COMPONENT? ==="
echo "Run in Supabase:"
echo "SELECT jsonb_pretty(components->'variants') FROM rule_sets"
echo "WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';"
echo "(Look for the Safety Record component — what condition is stored?)"
```

### 0C: Entity Resolution Diagnostic

```bash
echo "============================================"
echo "HF-117 PHASE 0C: ENTITY RESOLUTION (67 → 50)"
echo "============================================"

echo ""
echo "=== 1. FIND THE ENTITY RESOLUTION CODE ==="
grep -rn "entity.*resolut\|createEntit\|resolveEntit\|dedup\|duplicate.*detect" \
  web/src/lib/sci/ web/src/app/api/import/ --include="*.ts" | head -20

echo ""
echo "=== 2. PRINT THE ENTITY RESOLUTION FUNCTION ==="
# Find and print the function that creates entities from Plantilla rows
find web/src -name "entity-resolution*" -o -name "entity_resolution*" | head -5

echo ""
echo "=== 3. CHECK CURRENT ENTITY COUNT AND ATTRIBUTES ==="
echo "Run in Supabase:"
echo "SELECT count(*) FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';"
echo ""
echo "SELECT external_id, display_name, entity_type, jsonb_pretty(temporal_attributes) as attrs"
echo "FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'"
echo "ORDER BY external_id LIMIT 10;"

echo ""
echo "=== 4. CHECK WHAT COMMITTED_DATA HAS FOR PLANTILLA ==="
echo "Run in Supabase:"
echo "SELECT count(*), import_batch_id, informational_label"
echo "FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'"
echo "GROUP BY import_batch_id, informational_label;"
```

### PHASE 0 DELIVERABLE

Write `HF-117_ARCHITECTURE_DECISION.md`:

```
ARCHITECTURE DECISION RECORD
============================

ISSUE 1: VARIANT ROUTING
Finding: [How does the engine currently select variants? Why does it default to Senior?]
Code location: [file:line]
Root cause: [entity attributes missing? eligibility matching broken? default to first?]
Fix approach: [structural — works for any multi-variant plan]

ISSUE 2: CONDITIONAL GATE
Finding: [How does the gate evaluate? Why does 0 = FAIL?]
Code location: [file:line]
Root cause: [gate uses value as output? condition not extracted? inversion?]
Fix approach: [structural — works for any conditional gate where passing = zero]

ISSUE 3: ENTITY RESOLUTION (67 → 50)
Finding: [Why did 17 rows not create entities?]
Code location: [file:line]
Root cause: [dedup? processing limit? missing identifier?]
Fix approach: [structural — all roster rows must produce entities]

SCALE AND KOREAN TEST VERIFICATION:
- Variant routing fix works for ANY multi-variant plan? ___
- Conditional gate fix works for ANY gate condition? ___
- Entity resolution fix works for ANY roster size? ___
- Zero hardcoded field names? ___
```

**Commit:** `git add -A && git commit -m "HF-117 Phase 0: Comprehensive diagnostic — variant routing + gate logic + entity resolution" && git push origin dev`

---

## PHASE 1: FIX VARIANT ROUTING

Based on Phase 0 findings, fix the engine's variant selection so it reads entity attributes and matches to variant eligibility criteria from the plan interpretation.

### Constraints

- The fix must be **structural** — it works for any multi-variant plan, not just Coordinador Senior/Coordinador
- The variant-determining attribute (tipo, certification status, role, etc.) comes from entity data — the engine must read it from entity attributes or committed_data
- If the plan interpretation doesn't extract eligibility criteria, the fix must handle that gracefully (log a warning, not silently default to first variant)
- **Korean Test:** No hardcoded variant names, attribute names, or role strings

### Proof Gates — Phase 1

- PG-1: Variant selection code identified (paste before)
- PG-2: Fix applied — reads entity attributes for variant matching (paste after)
- PG-3: Fix is structural, not Meridian-specific (paste the condition — no hardcoded names)
- PG-4: When no attribute matches, behavior is explicit (logged warning, not silent default)
- PG-5: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-117 Phase 1: Fix variant routing — entity attribute matching" && git push origin dev`

---

## PHASE 2: FIX CONDITIONAL GATE SEMANTICS

Based on Phase 0 findings, fix the conditional gate so that "0 incidents" is correctly interpreted as PASSING the safety check.

### Constraints

- The fix must be **structural** — works for any conditional gate, not just safety incidents
- The plan interpretation must extract the gate condition semantics: "pass when value equals X" or "pass when value is below threshold X"
- If the plan says "0 incidents = safe = bonus earned," the gate must evaluate 0 as PASS
- The engine currently appears to use the metric VALUE as the output — 0 value = 0 payout. The correct behavior: evaluate the CONDITION, then pay the fixed bonus amount when condition is met
- **Korean Test:** No hardcoded metric names or condition values

### Proof Gates — Phase 2

- PG-6: Gate evaluation code identified (paste before)
- PG-7: Fix applied — evaluates condition, pays fixed bonus on pass (paste after)
- PG-8: Fix is structural (paste the logic — no hardcoded condition values)
- PG-9: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-117 Phase 2: Fix conditional gate — condition evaluation, not value passthrough" && git push origin dev`

---

## PHASE 3: FIX ENTITY RESOLUTION COMPLETENESS

Based on Phase 0 findings, fix entity resolution so all 67 Plantilla rows produce entities.

### Constraints

- Entity resolution must process ALL rows in the roster sheet, not just the first 50
- Duplicate detection must not incorrectly merge distinct employees
- If there's a batch size limit, it must be documented and raised
- The fix must work for any roster size (Scale by Design)

### Proof Gates — Phase 3

- PG-10: Entity resolution code identified (paste the processing loop)
- PG-11: Root cause of 67→50 drop identified (paste evidence)
- PG-12: Fix applied (paste after)
- PG-13: `npm run build` exits 0

**Commit:** `git add -A && git commit -m "HF-117 Phase 3: Fix entity resolution — all roster rows produce entities" && git push origin dev`

---

## PHASE 4: PRODUCTION VERIFICATION WITH GT RECONCILIATION

### Step 4A: Nuclear clear + re-import

```sql
-- Clear all Meridian data (same sequence as before)
DELETE FROM calculation_traces WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entity_period_outcomes WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM calculation_results WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM calculation_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM committed_data WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_set_assignments WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM classification_signals WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM import_batches WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM rule_sets WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM periods WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
DELETE FROM synaptic_density WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

Re-import plan PPTX + data XLSX. Create period. Activate plan. Calculate.

### Step 4B: GT Reconciliation Queries

```sql
-- Entity count: must be 67
SELECT count(*) as entity_count
FROM entities WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Grand total: must be MX$185,063
SELECT SUM(total_payout) as grand_total
FROM calculation_results
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

-- Claudia component check
SELECT e.display_name, cr.total_payout, jsonb_pretty(cr.components) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70001';
-- Expected: C1=800, C2=100, C3=0, C4=300, C5=373, Total=1573

-- Antonio (Senior) component check
SELECT e.display_name, cr.total_payout, jsonb_pretty(cr.components) as components
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
  AND e.external_id = '70010';
-- Expected: C1=1600, C2=700, C3=2800, C4=500, C5=663, Total=6263

-- Variant distribution check
SELECT count(*) as count, SUM(total_payout) as total
FROM calculation_results
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79'
GROUP BY true;
-- Expected: 67 entities, MX$185,063
```

### Proof Gates — Phase 4

- PG-14: Entity count = 67 (paste query result)
- PG-15: Claudia total = MX$1,573 (paste components)
- PG-16: Claudia C1=800, C2=100, C3=0, C4=300, C5=373 (paste)
- PG-17: Antonio total = MX$6,263 (paste components)
- PG-18: Antonio C1=1600, C2=700, C3=2800, C4=500, C5=663 (paste)
- PG-19: Grand total = MX$185,063 (paste SUM result)
- PG-20: `npm run build` exits 0
- PG-21: PR created (paste URL)

**Commit:** `git add -A && git commit -m "HF-117 Phase 4: Build + PR + GT reconciliation queries" && git push origin dev`

---

## COMPLETION REPORT

Create file `HF-117_COMPLETION_REPORT.md` in PROJECT ROOT:

```markdown
# HF-117 COMPLETION REPORT
## Calculation Reconciliation — Variant Routing + Gate Logic + Entity Resolution

### FP-61 Acknowledgment
This HF addresses issues that should have been identified in the first calculation run
by comparing against the GT file. Three HF cycles (114-116) were spent on reactive diagnosis
when a single GT comparison would have revealed all issues simultaneously.

### Commits
[list all phase commits]

### Files Changed
[list every file]

### Hard Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-1 through PG-21 | | [paste evidence] |

### GT Reconciliation
| Check | Expected | Actual | Delta |
|-------|----------|--------|-------|
| Entity count | 67 | | |
| Grand total | MX$185,063 | | |
| Claudia (70001) total | MX$1,573 | | |
| Claudia C1 | MX$800 | | |
| Claudia C4 | MX$300 | | |
| Antonio (70010) total | MX$6,263 | | |
| Antonio C4 | MX$500 | | |

### Standing Rule Compliance
| Rule | Status |
|------|--------|
| Korean Test | |
| Fix Logic Not Data | |
| Scale by Design | |
| Decision 95 (100% reconciliation) | |
```

**Commit:** `git add -A && git commit -m "HF-117 Completion Report" && git push origin dev`

---

## WHAT SUCCESS LOOKS LIKE

1. **67 entities** — all Plantilla rows produce entities
2. **Variant routing works** — 26 Senior, 41 Standard, different payouts per variant
3. **Conditional gate correct** — 0 incidents = PASS = bonus earned (55/67 employees)
4. **Grand total = MX$185,063** — exact match, not "close enough"
5. **Claudia = MX$1,573** — Standard variant, all components correct
6. **Antonio = MX$6,263** — Senior variant, all components correct
7. **All three fixes are structural** — work for any plan, any tenant, any domain

**Decision 95: 100% reconciliation. MX$185,063. Not MX$185,062. Not MX$185,064. Not "within 7.2%."**

**"The ground truth file existed from day one. It tells you exactly what's wrong, for every employee, for every component. Use it first. Always."**
