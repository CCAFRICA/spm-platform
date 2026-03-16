# OB-167: BCL Calculation Delta — Diagnostic First, Fix Second
## $20,834 actual vs $48,314 GT for October 2025. Three root causes. Zero guessing.

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules, anti-patterns, operational requirements
2. `SCHEMA_REFERENCE_LIVE.md` — actual database schema
3. This prompt IN ITS ENTIRETY — especially the Meridian Lessons section

---

## MERIDIAN LESSONS — READ THIS BEFORE WRITING ANY CODE

The Meridian reconciliation (MX$185,063) took 25+ prompt cycles across multiple sessions. The first 15 cycles were wasted because CC guessed at root causes instead of tracing the actual data path. The breakthrough came when we applied these rules:

### Rule 1: DIAGNOSE BEFORE FIX
OB-85 R1 through R4 each attempted fixes based on theories. Each introduced new breakage. R3 introduced "surgical trace" — follow ONE entity through EVERY table — and that's when progress began. **This OB does not write any fix code until Phase 2. Phase 0 and Phase 1 are pure diagnosis.**

### Rule 2: TRACE ONE ENTITY THROUGH EVERY TABLE
Pick one entity with a known GT value. Trace it from committed_data → metric resolution → component binding → calculation → result. Find where the number diverges from GT. The divergence point IS the root cause.

### Rule 3: TOUCH ONLY THE BROKEN PIPE
OB-85 R4 fixed one problem but disconnected three components. Every fix must be minimal and surgical. If a component is producing the correct value, do NOT touch its code path.

### Rule 4: THE VERCEL LOGS TOLD US THE ROOT CAUSES
The production calculation logs already show three specific failures. This OB's diagnostic must confirm or refute each one with database evidence. Do not theorize. Query.

### Rule 5: CC WILL SKIP DIAGNOSIS AND JUMP TO FIXING
**This is the single most expensive CC failure pattern across the entire project.** CC reads the symptoms, theorizes a cause, and writes a fix — without verifying the theory. The fix breaks something else. Another HF. Another fix. Another break. 25 cycles for Meridian.

**In this OB: Phase 0 and Phase 1 produce ZERO code changes. Only queries, traces, and documented findings. If CC writes any fix code before Phase 2 is committed, the OB has failed.**

---

## CLT REGISTRY CROSS-REFERENCE

| ID | Finding | Relevance |
|----|---------|-----------|
| CLT166-F25 (NEW) | BCL October: $20,834 vs $48,314 GT (57% delta) | This OB |
| CLT111-F45 | $0.00 all entities | Same pattern — wrong inputs, engine math correct |
| CLT113-T13 | MBC calculation $0.00 | Same root cause family — data pipe disconnection |
| CLT113-T17 | Óptica works via domain patterns | Precedent: sheet-matching fallback hides real problems |

---

## THE EVIDENCE — WHAT THE LOGS ALREADY SHOW

From the Vercel production logs of the BCL October calculation:

```
[CalcAPI] HF-108 Resolution path: sheet-matching (fallback)
[CalcAPI] No AI context found in import_batches — using fallback name matching
[CalcAPI] HF-119 Variant discriminants: V0=[senior,con,tasas,mejoradas] V1=[estandar]
[VARIANT] Adriana Reyes Molina: disc=[V0:1,V1:0] → variant_0 (discriminant_token)
[VARIANT] Gabriela Vascones Delgado: disc=[V0:1,V1:0] → variant_0 (discriminant_token)
[CalcAPI] OB-76 Dual-path: 11 match, 74 mismatch (12.9% concordance)
[CalcAPI] Grand total: 20,834
```

**Three hypothesized root causes from these logs:**

| RC | Hypothesis | Log Evidence |
|----|-----------|--------------|
| RC-1 | Metric resolver falls to sheet-matching fallback because import_batches lacks AI context metadata | "No AI context found in import_batches — using fallback name matching" |
| RC-2 | Variant discrimination fails — all 85 entities route to variant_0 (Senior) when 58 should be variant_1 (Standard) | Every entity shown has `disc=[V0:1,V1:0] → variant_0` |
| RC-3 | Component binding gaps — 3 of 4 components can't resolve data columns | "4 component bindings, 3 gaps" (from import logs) |

**This OB must CONFIRM OR REFUTE each hypothesis with database evidence before writing any fix.**

---

## CC EVASION WARNINGS

1. **CC will read the hypotheses above and immediately write fixes for all three.** DO NOT. Phase 0 and Phase 1 are diagnostic ONLY. The hypotheses may be wrong. The real root cause may be something else. QUERY FIRST.

2. **CC will query one table, find one issue, and declare it the root cause.** There are three hypotheses. Each must be individually investigated with database evidence. The delta may be caused by one, two, or all three — or by something not listed.

3. **CC will modify engine code "just to add logging" and break something.** Phase 0 and Phase 1 add ZERO code changes. Queries only. If CC needs to understand what the code does, READ it. Don't modify it.

4. **CC will fix the variant routing for BCL specifically instead of fixing the structural issue.** Any fix must work for ANY tenant. Korean Test.

---

## PHASE 0: TRACE ONE ENTITY — VALENTINA SALAZAR

Valentina Salazar (BCL-5012, Ejecutivo variant) has a known October GT:
- C1 (Colocación de Créditos): $450
- C2 (Captación de Depósitos): $275
- C3 (Productos Cruzados): $120
- C4 (Cumplimiento Regulatorio): $100
- **Total: $945**

The engine produced $112 for Valentina (from logs: `Valentina Salazar Mendieta: 112 | intent=12 ✗`).

**Trace her through every table. PASTE the query and result for each step.**

### Step 0A: Find Valentina's entity

```sql
SELECT id, external_id, display_name, entity_type, status, metadata
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND display_name ILIKE '%valentina%salazar%';
```

### Step 0B: Find Valentina's committed_data

```sql
SELECT id, data_type, source_date, entity_id, row_data, metadata
FROM committed_data
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND entity_id = '<VALENTINA_ENTITY_ID>'
ORDER BY data_type;
```

### Step 0C: Find Valentina's calculation_results

```sql
SELECT id, total_payout, components, metadata
FROM calculation_results
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND entity_id = '<VALENTINA_ENTITY_ID>';
```

### Step 0D: Check what the components JSONB contains

From 0C, examine the `components` field. Which components have values? Which are $0? Which are missing?

### Step 0E: Check Valentina's rule_set_assignment

```sql
SELECT id, rule_set_id, entity_id, assignment_type, metadata
FROM rule_set_assignments
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND entity_id = '<VALENTINA_ENTITY_ID>';
```

### Step 0F: Check the convergence bindings for BCL plan

```sql
SELECT id, name, 
  components->0->'input_bindings' as c0_bindings,
  components->1->'input_bindings' as c1_bindings,
  components->2->'input_bindings' as c2_bindings,
  components->3->'input_bindings' as c3_bindings
FROM rule_sets
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND status = 'active';
```

### Step 0G: Check import_batches metadata

```sql
SELECT id, file_name, metadata, status
FROM import_batches
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
ORDER BY created_at DESC;
```

**The log said "No AI context found in import_batches." This query reveals whether metadata is NULL, empty, or structured differently than the metric resolver expects.**

### Step 0H: Check Valentina's entity metadata for variant data

```sql
SELECT metadata, temporal_attributes
FROM entities
WHERE tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
AND display_name ILIKE '%valentina%salazar%';
```

**The variant discriminant should find "Ejecutivo" (standard) in Valentina's data. If her metadata doesn't contain the cargo/nivel field, variant routing can't differentiate.**

**Document ALL query results. Do NOT interpret them yet — just collect evidence.**

**Commit:** `OB-167 Phase 0: Entity trace — Valentina Salazar through every table`

---

## PHASE 1: CONFIRM OR REFUTE ROOT CAUSES

Using the Phase 0 evidence, write a determination for each hypothesis:

### RC-1: Import batch metadata missing

**Compare** the `import_batches.metadata` from Phase 0G against what the metric resolver expects. The resolver looks for AI context in the metadata — what specific field/structure does it read? Check the code:

```bash
grep -n "AI context\|import_batch\|metadata\|fallback.*name" \
  web/src/app/api/calculation/run/route.ts | head -20
```

**Determination:** CONFIRMED / REFUTED / PARTIAL — with evidence.

### RC-2: Variant discrimination failure

**Compare** Valentina's entity metadata (Phase 0H) against what the variant discriminant expects. Valentina is "Ejecutivo" (standard variant). If her metadata doesn't contain the cargo/nivel attribute, or if it's stored in a format the discriminant can't read, all entities default to variant_0.

```bash
grep -n "discriminant\|variant.*disc\|V0\|V1\|cargo\|nivel" \
  web/src/app/api/calculation/run/route.ts | head -20
```

**Determination:** CONFIRMED / REFUTED / PARTIAL — with evidence.

### RC-3: Component binding data resolution

**Compare** the convergence bindings (Phase 0F) against Valentina's committed_data (Phase 0B). For each component, does the binding point to a data_type and column that actually exists in her committed_data? If the binding says "look in data_type=X, column=Y" but her committed_data has data_type=Z, the component gets $0.

**Determination:** CONFIRMED / REFUTED / PARTIAL — with evidence.

### Unexpected findings

If the Phase 0 evidence reveals a root cause NOT in the three hypotheses, document it. The data may tell a different story than the logs suggested.

**Write up all three determinations with evidence. Commit.**

**Commit:** `OB-167 Phase 1: Root cause determination — 3 hypotheses confirmed/refuted with evidence`

---

## PHASE 2: FIX CONFIRMED ROOT CAUSES ONLY

**Only fix what Phase 1 CONFIRMED.** If a hypothesis was REFUTED, do not touch that code path.

**For each confirmed root cause:**
1. Identify the minimal code change
2. Verify the change doesn't affect Meridian (MX$185,063 must still work)
3. Implement and commit

**After fixes, re-run calculation for BCL October on localhost (if possible) or document expected behavior.**

**Commit per fix:** `OB-167 Phase 2A: Fix RC-X — [one-line description]`

---

## PHASE 3: VERIFY

### 3A: BCL October calculation

After fixes, trigger calculation. Compare total against $48,314 GT.

If the total doesn't match, check individual entity anchors:
- Valentina Salazar: $945 (C1=$450, C2=$275, C3=$120, C4=$100)
- Diego Mora: $671 (C1=$300, C2=$275, C3=$96, C4=$0 gate fail)
- Gabriela Vascones: $2,070 (C1=$900, C2=$750, C3=$270, C4=$150)

### 3B: Meridian regression

Verify Meridian still produces MX$185,063. If you can't run Meridian on localhost, verify that no Meridian-specific code was touched.

### 3C: Vercel logs

After production deployment, check the calculation logs for:
- Resolution path: should NOT be "sheet-matching (fallback)"
- Variant routing: Ejecutivo Senior entities → variant_0, Ejecutivo entities → variant_1
- Dual-path concordance: should be higher than 12.9%

**Commit:** `OB-167 Phase 3: Verification — BCL total + entity anchors + Meridian regression`

---

## PHASE 4: COMPLETION REPORT

```markdown
# OB-167 Completion Report — BCL Calculation Delta

## Phase 0: Entity Trace (Valentina Salazar)
[Paste ALL query results from Steps 0A through 0H]

## Phase 1: Root Cause Determination
- RC-1 (Import batch metadata): CONFIRMED/REFUTED — [evidence]
- RC-2 (Variant discrimination): CONFIRMED/REFUTED — [evidence]
- RC-3 (Component binding gaps): CONFIRMED/REFUTED — [evidence]
- Unexpected findings: [any]

## Phase 2: Fixes Applied
[For each confirmed RC: file, line, change, rationale]

## Phase 3: Verification
- BCL October total: [actual] vs $48,314 GT
- Valentina: [actual] vs $945
- Diego: [actual] vs $671
- Gabriela: [actual] vs $2,070
- Meridian: [status]
- Concordance: [new %] vs 12.9% before

## CLT Registry Updates
| Finding | Previous | New | Evidence |
|---------|----------|-----|----------|
| CLT166-F25 (BCL delta) | OPEN | [status] | [total achieved] |

## Build
[Paste npm run build last 10 lines]
```

**Commit:** `OB-167 Phase 4: Completion report with evidence`

---

## PHASE 5: PR

```bash
cd /Users/AndrewAfrica/spm-platform
gh pr create --base main --head dev \
  --title "OB-167: BCL Calculation Delta — Diagnostic-First Root Cause Resolution" \
  --body "## The Delta
BCL October: \$20,834 actual vs \$48,314 GT (57% delta)

## Root Causes (from Phase 1 diagnosis)
[Paste confirmed root causes]

## Fixes
[One line per fix]

## Evidence
See OB-167_COMPLETION_REPORT.md — includes full entity trace and verification anchors"
```

---

## REGRESSION — DO NOT BREAK

- **Meridian: MX$185,063** — any change to metric resolution, variant routing, or component binding MUST be verified against Meridian
- **BCL entity count: 85** — do not create or delete entities
- **BCL assignments: 85** — created by HF-126 self-healing, do not delete
- **HF-125/126/127 fixes** — navigation, operate, calculate access must remain working

---

*"Diagnosis before code. Trace one entity through every table. Touch only the broken pipe. The Meridian proof took 25 cycles because we skipped these rules. BCL will not repeat that."*
