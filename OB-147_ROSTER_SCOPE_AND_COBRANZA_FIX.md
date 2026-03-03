# OB-147: ROSTER POPULATION SCOPE + COBRANZA FIX
## From 78% to 95%+ — Port the Proven Fixes

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Read the full prompt, then execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

Before reading further, open and read these files COMPLETELY:

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules (27, 28, 29 included)
2. `SCHEMA_REFERENCE.md` — authoritative column reference
3. `web/src/lib/calculation/run-calculation.ts` — THE calculation engine. COMPLETELY.
4. `web/src/app/api/calculation/run/route.ts` — THE server-side calculation route. COMPLETELY.
5. `OB-146_COMPLETION_REPORT.md` — current state: MX$977,609 (78%)
6. `OB-75_COMPLETION_REPORT.md` — proof that 100.7% accuracy is achievable with 3 specific fixes

**Read all files before writing any code.**

---

## CONTEXT — OB-75 ALREADY SOLVED THIS

OB-75 achieved MX$1,262,865 (100.7% accuracy) on a clean Pipeline Test Co tenant using THREE specific fixes that are NOT present in the current Óptica Luminar calculation path:

### Fix 1: Roster-Based Population Filter (22K → 719)
**OB-75 report:** "22K+ entities calculated → No roster filter — transaction sheets have all-month entities → Population filter: only calculate rostered entities"

The engine currently calculates ALL 22,159 entities. The benchmark covers 719 employees from the Datos_Colaborador roster for Enero 2024. Entities not in the roster are from other months' transaction data and should not be calculated.

**Effect on OB-146:** Venta Tienda shows 231% because 22K entities each contribute. Filter to 719 and the total drops to ~MX$116K (matching benchmark).

### Fix 2: Cross-Sheet Contamination Guard
**OB-75 report:** "Warranty: $98M vs $67K → Cross-sheet contamination — fallback to ALL entity rows → Return empty {} when no sheet match"

When the engine can't find the right sheet for a component, it falls back to using ALL entity rows. This causes massive overcounting. The fix: return empty metrics instead of falling back.

**Effect on OB-146:** May explain some of the inflation in Venta Tienda (231%) and overcount in other components.

### Fix 3: Attainment Heuristic (raw > 1000 = monetary)
**OB-75 report:** "Collections: $0 vs $283K → attainment field = Monto Acotado (monetary), not ratio → Override when raw attainment > 1000"

The Cobranza sheet has a field called `Monto Acotado` that looks like attainment but is actually a monetary amount (e.g., 15,000). The engine treats it as 15,000% attainment. The fix: if raw attainment > 1000, it's monetary, compute the ratio from goal fields instead.

**OB-146 Cobranza at 13.4%:** Only 154 entities resolve collections data. But even those 154 may be miscalculating because the attainment value is monetary, not a ratio.

---

## THE QUESTION: ARE THESE FIXES ALREADY IN THE CODE?

OB-75 applied these fixes to the engine. But subsequent OBs (OB-76 through OB-146) may have modified run-calculation.ts or route.ts. Phase 0 must determine whether each fix STILL EXISTS in the current codebase or was lost.

---

## STANDING RULES

1. After EVERY commit: `git push origin dev`
2. After EVERY push: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm localhost:3000
3. **Commit this prompt to git as first action.**
4. **Git from repo root (spm-platform), NOT web/.**
5. Fix logic not data. Korean Test applies.
6. **Standing Rule 26:** Zero component-level Supabase calls.
7. **Standing Rule 27:** Engine Contract verification at Phase 0 and Phase 7.
8. **Standing Rule 28:** No PR merge without browser or SQL verification.
9. **Standing Rule 29:** Bulk mutations (>1,000 rows) do not require confirmation.
10. **Supabase .in() batch limit:** ≤200 items per call.

---

## ENGINE CONTRACT VERIFICATION

Run at Phase 0 and Phase 7:

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM periods WHERE tenant_id = t.id) as period_count,
  (SELECT COUNT(*) FROM committed_data WHERE tenant_id = t.id AND entity_id IS NOT NULL AND period_id IS NOT NULL) as bound_data_rows,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as result_count,
  (SELECT COALESCE(SUM(total_payout), 0) FROM calculation_results WHERE tenant_id = t.id) as total_payout
FROM t;
```

---

# PHASE 0: DIAGNOSTIC — DO THE OB-75 FIXES EXIST?

### 0A: Engine Contract (before)
Paste output.

### 0B: Search for roster population filter

```bash
echo "=== FIX 1: ROSTER POPULATION FILTER ==="
echo ""
echo "--- Does the engine filter entities to roster? ---"
grep -n "roster\|population\|Datos_Colaborador\|rosterFilter\|entityFilter\|populationFilter" \
  web/src/lib/calculation/run-calculation.ts web/src/app/api/calculation/run/route.ts | head -20

echo ""
echo "--- How are entities fetched for calculation? ---"
grep -n "entities\|\.from('entities')\|entity_id" \
  web/src/app/api/calculation/run/route.ts | head -20

echo ""
echo "--- Is there a WHERE clause limiting which entities get calculated? ---"
grep -B 3 -A 10 "from('entities')" web/src/app/api/calculation/run/route.ts | head -30

echo ""
echo "--- Count: how many entities have Datos_Colaborador data for Enero 2024? ---"
echo "RUN IN SUPABASE SQL EDITOR:"
echo ""
cat << 'SQL'
-- Roster population for Enero 2024
SELECT COUNT(DISTINCT cd.entity_id) as roster_entities
FROM committed_data cd
JOIN periods p ON p.id = cd.period_id
WHERE cd.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND cd.sheet_name = 'Datos_Colaborador'
  AND p.canonical_key = '2024-01';
SQL
```

### 0C: Search for cross-sheet contamination guard

```bash
echo "=== FIX 2: CROSS-SHEET CONTAMINATION GUARD ==="
echo ""
echo "--- What happens when no sheet matches a component? ---"
grep -n "findSheet\|matchingSheet\|sheetMatch\|fallback\|empty.*metric\|return {}" \
  web/src/lib/calculation/run-calculation.ts | head -20

echo ""
echo "--- Does buildMetricsForComponent return empty on no match? ---"
grep -B 5 -A 15 "function buildMetrics" web/src/lib/calculation/run-calculation.ts | head -40

echo ""
echo "--- Is there a fallback to ALL rows? ---"
grep -n "allRows\|all.*entity\|fallback\|\.filter\|entityRows" \
  web/src/lib/calculation/run-calculation.ts | head -20
```

### 0D: Search for attainment heuristic

```bash
echo "=== FIX 3: ATTAINMENT HEURISTIC ==="
echo ""
echo "--- Is there a >1000 check for monetary vs ratio? ---"
grep -n "1000\|monetary\|heuristic\|override\|Monto.*Acotado\|attainment.*>" \
  web/src/lib/calculation/run-calculation.ts web/src/app/api/calculation/run/route.ts | head -20

echo ""
echo "--- How is attainment resolved for Cobranza/store components? ---"
grep -B 3 -A 10 "attainment" web/src/lib/calculation/run-calculation.ts | head -60
```

### 0E: What does OB-146's engine fix look like?

```bash
echo "=== OB-146 ENGINE CHANGES ==="
echo ""
echo "--- Recent commits to run-calculation.ts ---"
cd /Users/AndrewAfrica/spm-platform
git log --oneline -10 -- web/src/lib/calculation/run-calculation.ts

echo ""
echo "--- Recent commits to route.ts ---"
git log --oneline -10 -- web/src/app/api/calculation/run/route.ts

echo ""
echo "--- Full diff of recent engine changes ---"
git diff HEAD~5 -- web/src/lib/calculation/run-calculation.ts | head -200
```

### Phase 0 Output — MANDATORY FORMAT

```
// PHASE 0 FINDINGS — OB-147
//
// FIX 1 — ROSTER POPULATION FILTER:
// Present in current code? YES/NO
// Location: [file:line] or MISSING
// Current behavior: [calculates all entities / filters to roster / other]
// Roster entities for Enero 2024: [count from SQL]
//
// FIX 2 — CROSS-SHEET CONTAMINATION GUARD:
// Present in current code? YES/NO
// Location: [file:line] or MISSING
// Current behavior: [returns empty / falls back to all rows / other]
//
// FIX 3 — ATTAINMENT HEURISTIC:
// Present in current code? YES/NO
// Location: [file:line] or MISSING
// Current behavior: [checks >1000 / uses raw value / other]
//
// CONCLUSION:
// Fixes to apply: [list which of the 3 are missing]
// Fixes already present: [list which exist]
```

**Proof gate PG-00:** Phase 0 complete. Three fixes mapped: present/missing for each.

**Commit:** `OB-147 Phase 0: Diagnostic — OB-75 fix verification`

---

# PHASE 1: ROSTER POPULATION FILTER

**Skip this phase if Fix 1 already exists and is active.**

### 1A: Identify the roster sheet

The Datos_Colaborador sheet is the roster. It contains every employee who should be calculated for a given period. The engine should ONLY calculate entities that appear in committed_data with sheet_name='Datos_Colaborador' (or the AI-classified roster sheet) for the target period.

### 1B: Implement the filter

In the calculation route (`route.ts`) or engine (`run-calculation.ts`), BEFORE the main calculation loop:

```
1. Query committed_data for the target period where sheet matches the roster classification
2. Extract unique entity_ids from those rows
3. Filter the entities array to ONLY include those entity_ids
4. Log: "Population filter: {total} entities → {filtered} roster entities for {period}"
```

**How OB-75 did it:** "Population filter: roster-based entity filtering (22K→719)"

### 1C: Domain-agnostic implementation

The roster sheet identification must NOT hardcode "Datos_Colaborador". Use the AI context's sheet classification:
- The SCI or AI import context classifies one sheet as type `roster` or `entity_data`
- Filter to committed_data rows matching that classification
- If no roster classification exists, fall back to ALL entities (no filter) and log a warning

### 1D: Verify

```sql
-- After applying filter, the calculation should only process roster entities
-- For Enero 2024, expect ~719 entities
SELECT COUNT(DISTINCT entity_id) 
FROM committed_data 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND sheet_name = 'Datos_Colaborador'
  AND period_id = (SELECT id FROM periods WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1) AND canonical_key = '2024-01');
```

**Proof gate PG-01:** Population filter implemented. Roster entity count logged. Expected ~719 for Enero 2024.

**Commit:** `OB-147 Phase 1: Roster population filter — calculate only rostered entities`

---

# PHASE 2: CROSS-SHEET CONTAMINATION GUARD

**Skip this phase if Fix 2 already exists.**

### 2A: Find the fallback path

When `findSheetForComponent()` or `buildMetricsForComponent()` can't match a sheet to a component, what happens? If it falls through to using all entity rows, fix it.

### 2B: Implement the guard

When no sheet matches a component for an entity:
- Return empty metrics `{}` for that component
- The component payout becomes $0
- Log: "No sheet match for component {name} — returning empty metrics"

Do NOT fall back to all entity rows. That causes cross-sheet contamination.

### 2C: Verify the guard doesn't break working components

Garantía Extendida has no data in the import. With the guard, it should produce MX$0 cleanly (not MX$98M from contamination).

**Proof gate PG-02:** Cross-sheet guard returns empty metrics on no match. No fallback to all rows.

**Commit:** `OB-147 Phase 2: Cross-sheet contamination guard`

---

# PHASE 3: ATTAINMENT HEURISTIC FOR MONETARY VALUES

**Skip this phase if Fix 3 already exists.**

### 3A: The problem

Cobranza (collections) data has fields like `Monto_Recuperado_Actual` and `Monto_Recuperado_Meta` (monetary amounts). If the engine treats the raw value as an attainment percentage (e.g., 15000%), it produces absurd tier lookups.

OB-146 added metric derivation rules that compute `collections_attainment_percent = ratio(Monto_Recuperado_Actual / Monto_Recuperado_Meta) × 100`. But the attainment normalization may still pick up the raw monetary value instead of the derived ratio.

### 3B: Check the derivation flow

```bash
echo "=== COBRANZA DERIVATION ==="
grep -n "cobranza\|collections\|Monto_Recuperado\|Monto Acotado" \
  web/src/lib/calculation/run-calculation.ts \
  web/src/app/api/calculation/run/route.ts \
  web/scripts/ob144-phase5-vocabulary-bridge.ts 2>/dev/null | head -20

echo ""
echo "--- Derivation rules in rule_set ---"
echo "RUN IN SUPABASE:"
cat << 'SQL'
SELECT jsonb_pretty(
  (SELECT comp FROM jsonb_array_elements(components) comp 
   WHERE comp->>'name' ILIKE '%cobran%' OR comp->>'name' ILIKE '%collect%'
   LIMIT 1)
)
FROM rule_sets
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND status = 'active';
SQL
```

### 3C: Implement the heuristic (if needed)

In the attainment resolution path, after all derivation and normalization:

```
if (attainment > 1000) {
  // This is a monetary value, not a percentage
  // Look for goal/meta field to compute ratio
  const goal = metrics.goal || metrics.meta || metrics.target;
  if (goal && goal > 0) {
    attainment = (attainment / goal) * 100;
  } else {
    attainment = 0; // Can't compute ratio without goal
  }
}
```

This is the same heuristic OB-75 used. It's a safety net, not the primary derivation path.

### 3D: Also check attainment for all store components

The same monetary-vs-ratio issue could affect Clientes Nuevos (Clientes_Actuales vs Meta fields).

**Proof gate PG-03:** Attainment heuristic applied. Cobranza attainment values are ratios (0-200%), not monetary (1000+).

**Commit:** `OB-147 Phase 3: Attainment heuristic — monetary detection for store components`

---

# PHASE 4: RECALCULATE WITH ALL THREE FIXES

### 4A: Delete old results

```sql
DELETE FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

### 4B: Run calculation

Trigger calculation for Enero 2024 period. The population filter should reduce from 22,159 to ~719 entities.

**CRITICAL:** Capture the log output showing the population filter count.

### 4C: Quick verification

```sql
-- Result count — should be ~719, NOT 22,159
SELECT 
  COUNT(*) as result_count,
  SUM(total_payout) as total_payout,
  COUNT(*) FILTER (WHERE total_payout > 0) as non_zero,
  AVG(total_payout) FILTER (WHERE total_payout > 0) as avg_nonzero
FROM calculation_results
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);
```

```sql
-- Per-component totals
SELECT 
  comp_key,
  COUNT(*) as entities,
  SUM((comp_value->>'amount')::numeric) as total,
  AVG((comp_value->>'amount')::numeric) FILTER (WHERE (comp_value->>'amount')::numeric > 0) as avg_nonzero
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
GROUP BY comp_key
ORDER BY total DESC;
```

**PASTE BOTH RESULTS.**

**Proof gate PG-04:** Result count ~719 (not 22K). Total payout significantly closer to MX$1,253,832. At least 4 components non-zero.

**Commit:** `OB-147 Phase 4: Recalculation with roster filter + contamination guard + attainment heuristic`

---

# PHASE 5: CC-UAT-08 — FULL RECONCILIATION

This is the verification. No shortcuts.

### 5A: Per-component reconciliation table

```sql
SELECT 
  comp_key,
  COUNT(*) as entities,
  SUM((comp_value->>'amount')::numeric) as total
FROM calculation_results,
  jsonb_each(component_results) AS kv(comp_key, comp_value)
WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
GROUP BY comp_key
ORDER BY total DESC;
```

Map each comp_key to the benchmark component name and fill:

```
CC-UAT-08 RECONCILIATION TABLE — OB-147

| Component | Ground Truth | OB-147 Engine | Delta | Accuracy | vs OB-146 |
|-----------|-------------|---------------|-------|----------|-----------|
| Venta Óptica | MX$748,600 | MX$[X] | [X] | [X]% | was 81.6% |
| Venta Tienda | MX$116,250 | MX$[X] | [X] | [X]% | was 231.1% |
| Clientes Nuevos | MX$39,100 | MX$[X] | [X] | [X]% | was 122.8% |
| Cobranza | MX$283,000 | MX$[X] | [X] | [X]% | was 13.4% |
| Club de Protección | MX$10 | MX$[X] | [X] | [X]% | was PASS* |
| Garantía Extendida | MX$66,872 | MX$[X] | [X] | [X]% | was 0% |
| **TOTAL** | **MX$1,253,832** | **MX$[X]** | **[X]** | **[X]%** | was 78.0% |

PASS = within ±10% of ground truth
TARGET: Total ≥ 95% (MX$1,191,140+)
STRETCH: Total ≥ 98% (matches OB-75)
```

### 5B: Entity traces — same 3 employees

**Entity 93515855 (certificado, high performer):**
```sql
SELECT cr.total_payout, jsonb_pretty(cr.component_results)
FROM calculation_results cr
JOIN entities e ON e.id = cr.entity_id
WHERE cr.tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
  AND e.external_id = '93515855';
```
**CLT-14B benchmark:** ~MX$4,650 (Optical $1,500, Store $0, Customers $0, Collections $350, Club $3, Warranty $24, other $2,773)

**Entity 96568046 (certificado, moderate):**
**CLT-14B benchmark:** ~MX$1,877 (Optical $1,500, Collections $350, Club $3)

**Entity 90319253 (no certificado, warranty heavy):**
**CLT-14B benchmark:** ~MX$6,617 (Optical $400, Store $500, Collections $400, Warranty $5,317)

For each: paste full component_results, compute delta vs benchmark, diagnose any gaps.

### 5C: OB-75 comparison

```
ACCURACY PROGRESSION

| OB | Total | Accuracy | Components Non-Zero |
|----|-------|----------|---------------------|
| OB-144 | MX$12,659 | 1.0% | 2/6 |
| OB-146 | MX$977,609 | 78.0% | 5/6 |
| OB-147 | MX$[X] | [X]% | [X]/6 |
| OB-75 (reference) | MX$1,262,865 | 100.7% | 6/6 |
| Benchmark | MX$1,253,832 | 100.0% | 6/6 |
```

### 5D: Gap analysis for remaining delta

For any component still >10% off:

```
COMPONENT: [name]
OB-147 RESULT: MX$[X]
GROUND TRUTH: MX$[X]
ACCURACY: [X]%
ROOT CAUSE: [specific]
FIX COMPLEXITY: [trivial / moderate / complex]
FIX PATH: [description]
```

**Proof gate PG-05:** CC-UAT-08 table complete. 3 entity traces with component breakdowns. Accuracy progression table filled.

**Commit:** `OB-147 Phase 5: CC-UAT-08 — full reconciliation with entity traces`

---

# PHASE 6: DS-007 REFRESH + ENGINE CONTRACT

### 6A: Engine Contract

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT 
  (SELECT COUNT(*) FROM entities WHERE tenant_id = t.id) as entity_count,
  (SELECT COUNT(*) FROM calculation_results WHERE tenant_id = t.id) as result_count,
  (SELECT COALESCE(SUM(total_payout), 0) FROM calculation_results WHERE tenant_id = t.id) as total_payout
FROM t;
```

### 6B: Verify DS-007 page

Navigate to results page in browser:
- Hero total should show new (higher) number
- Entity count should be ~719 (not 22K)
- Store heatmap should populate (entities have store_id from OB-146)
- Expand entity: Narrative should mention more components with non-zero payouts
- Component bars: at least 4 visible bars

**Proof gate PG-06:** DS-007 renders with ~719 entities and updated totals. Screenshot evidence.

**Commit:** `OB-147 Phase 6: Engine Contract + DS-007 verification`

---

# PHASE 7: COMPLETION REPORT + PR

### 7A: Final build

```bash
cd web && rm -rf .next && npm run build
echo "Final build exit code: $?"
```

### 7B: Completion report

Save as `OB-147_COMPLETION_REPORT.md` in **PROJECT ROOT**.

```markdown
# OB-147 COMPLETION REPORT
## Roster Population Scope + Cobranza Fix

### Engine Contract — BEFORE
[Paste Phase 0]

### Engine Contract — AFTER
[Paste Phase 6]

### Fixes Applied

| Fix | OB-75 Reference | Status in OB-147 |
|-----|----------------|-----------------|
| Roster population filter | 22K → 719 | [APPLIED / ALREADY PRESENT] |
| Cross-sheet contamination guard | Return empty {} on no match | [APPLIED / ALREADY PRESENT] |
| Attainment heuristic (>1000) | Override monetary with ratio | [APPLIED / ALREADY PRESENT] |

### CC-UAT-08 RECONCILIATION TABLE

| Component | Ground Truth | OB-147 Engine | Delta | Accuracy |
|-----------|-------------|---------------|-------|----------|
| Venta Óptica | MX$748,600 | MX$[X] | [X] | [X]% |
| Venta Tienda | MX$116,250 | MX$[X] | [X] | [X]% |
| Clientes Nuevos | MX$39,100 | MX$[X] | [X] | [X]% |
| Cobranza | MX$283,000 | MX$[X] | [X] | [X]% |
| Club de Protección | MX$10 | MX$[X] | [X] | [X]% |
| Garantía Extendida | MX$66,872 | MX$[X] | [X] | [X]% |
| **TOTAL** | **MX$1,253,832** | **MX$[X]** | **[X]** | **[X]%** |

### Accuracy Progression
| OB | Total | Accuracy |
|----|-------|----------|
| OB-144 | MX$12,659 | 1.0% |
| OB-146 | MX$977,609 | 78.0% |
| OB-147 | MX$[X] | [X]% |
| OB-75 ref | MX$1,262,865 | 100.7% |

### Entity Traces
[Paste 3 entity traces with component breakdowns]

### Remaining Gaps
[Document any component >10% off with root cause]

### Proof Gates
| Gate | Status | Evidence |
|------|--------|----------|
| PG-00 | | OB-75 fix verification |
| PG-01 | | Roster population filter |
| PG-02 | | Cross-sheet contamination guard |
| PG-03 | | Attainment heuristic |
| PG-04 | | Recalculation (~719 entities) |
| PG-05 | | CC-UAT-08 reconciliation |
| PG-06 | | DS-007 + Engine Contract |
```

### 7C: PR

```bash
gh pr create --base main --head dev \
  --title "OB-147: Roster Scope + Cobranza — [X]% accuracy (MX$[X] of MX$1,253,832)" \
  --body "## Three Proven Fixes from OB-75

### Before (OB-146): MX$977,609 (78.0%) with 22,159 entities
### After (OB-147): MX$[X] ([X]%) with ~719 roster entities

### Fixes Applied
1. Roster population filter: 22,159 → ~719 entities
2. Cross-sheet contamination guard: empty {} on no sheet match
3. Attainment heuristic: monetary values (>1000) converted to ratios

### CC-UAT-08 Reconciliation
[Paste table]

### Accuracy Progression: 1.0% → 78.0% → [X]%
Target: ≥95% | Stretch: ≥98% (matching OB-75)

### Standing Rules Enforced: 26, 27, 28, 29"
```

**Proof gate PG-07:** PR created. Build exits 0.

**Commit:** `OB-147 Phase 7: Completion report + PR`

---

## CC ANTI-PATTERNS — SPECIFIC TO THIS OB

| Anti-Pattern | What CC Might Do | What To Do Instead |
|---|---|---|
| Rewrite the engine | Refactor run-calculation.ts broadly | Apply ONLY the 3 targeted fixes. Minimal changes. |
| Skip Phase 0 | "I'll just add the population filter" | Phase 0 determines which fixes ALREADY EXIST. You may only need 1 of 3. |
| Hardcode "Datos_Colaborador" | `WHERE sheet_name = 'Datos_Colaborador'` | Use AI context classification or semantic role for roster identification |
| Filter entities at query time only | Remove non-roster from calculation_results | Filter BEFORE calculation loop — don't calculate 22K then delete 21K results |
| Break Cobranza by over-fixing | Change derivation rules that OB-146 already working | The attainment heuristic is a SAFETY NET, not a replacement for derivation rules |
| Report without population count | "Calculation complete" | Log and report: "Population: X total → Y roster entities for period Z" |
| Skip the entity traces | "Total is close enough" | Trace 93515855, 96568046, 90319253. Per-component. Compare to benchmark. |
| Calculate all periods | Run for Jan + Feb + Mar + Apr | Calculate ONLY Enero 2024. Benchmark is January only. |

---

## WHAT SUCCESS LOOKS LIKE

After this OB:

1. **Result count: ~719** (not 22,159)
2. **Total payout: MX$1,000,000+** (minimum), MX$1,200,000+ (target), MX$1,250,000+ (stretch)
3. **Venta Tienda drops from 231% to ~99%** (population filter eliminates inflation)
4. **Cobranza rises from 13.4% to 90%+** (attainment heuristic fixes monetary interpretation)
5. **Entity 96568046: within 20% of MX$1,877 benchmark**
6. **DS-007 shows ~719 entities** with the heatmap populated
7. **Accuracy progression: 1.0% → 78% → 95%+** in three OBs

The gap between OB-75's Pipeline Test Co (100.7%) and the Óptica Luminar production tenant should be nearly closed. Any remaining delta is documented with specific root causes for surgical follow-up.

---

*"OB-75 proved it's possible. OB-147 proves it's repeatable. That's the difference between a demo and a product."*
