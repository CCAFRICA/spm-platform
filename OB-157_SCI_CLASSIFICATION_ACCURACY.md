# OB-157: SCI CLASSIFICATION ACCURACY — ENTITY, DATE, AND METRIC RESOLUTION
## Zero Hardcoding | Korean Test | Fix Intelligence, Not Mechanics

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". NEVER pause for confirmation. Execute every phase sequentially. Commit after each phase. Push after each commit.**

---

## READ FIRST (MANDATORY)

1. `CC_STANDING_ARCHITECTURE_RULES.md` — AP-5, AP-6, AP-24, AP-25, Korean Test
2. `SCHEMA_REFERENCE.md` — entities, committed_data, rule_sets
3. `OB-155_COMPLETION_REPORT.md` — P1 findings: entity inflation, source date, component name mismatch
4. `OB-152_COMPLETION_REPORT.md` — source_date extraction (3 strategies), Korean Test pass

---

## FOUNDATIONAL RULES (ENFORCED)

1. **Korean Test.** Every fix must work if all field names, sheet names, and component names were in Korean. Zero string literals matching field names in any language.
2. **Fix logic, not data.** Do not hardcode component names to match Óptica sheets.
3. **Engine and experience evolve together.** Vertical slice — classification fixes must produce correct calculation results.
4. **Structural heuristics only.** Entity identification, date detection, and metric resolution by data patterns and value distributions, never by column name.

---

## CONTEXT

OB-155 proved the pipeline mechanics work but the intelligence feeding them is wrong:

| Problem | Symptom | Root Cause |
|---|---|---|
| Entity inflation | 12,646 entities (expect 719) | Store IDs from store-level sheets classified as entity_identifier |
| Source date wrong | Dates scattered 2000-2024 | Hire dates from roster sheet used instead of Mes/Año from transaction sheets |
| $0 payout | Component names don't match data_type | AI names like "Optical Sales Incentive" don't substring-match `base_venta_individual` |

All three are SCI classification problems. The downstream pipeline faithfully executes on wrong metadata.

---

## PHASE 0: DIAGNOSTIC — TRACE CLASSIFICATION DECISIONS

### 0A: Entity Identifier Classification

```bash
# How does SCI decide which field is entity_identifier?
grep -rn "entity_identifier\|entityIdentifier\|identifier.*field\|primary.*key" web/src/app/api/import/sci/ web/src/lib/sci/ --include="*.ts" | head -30

# How does postCommitConstruction decide which committed_data rows produce entities?
grep -rn "postCommitConstruction\|createEntit\|entity.*create" web/src/app/api/import/sci/execute/route.ts | head -20
```

Document: what signal causes `No_Tienda` (store ID) to be classified as entity_identifier on store-level sheets?

### 0B: Source Date Detection

```bash
# How does source-date-extraction.ts detect dates?
cat web/src/lib/sci/source-date-extraction.ts | head -100

# What does OB-152's 3-strategy approach do?
grep -rn "Content.*Profile\|semantic.*role\|structural.*scan\|source.*date" web/src/lib/sci/source-date-extraction.ts | head -20
```

Document: why does it pick hire dates from roster instead of Mes/Año from transaction sheets?

### 0C: Component-to-Data Matching

```bash
# How does the engine match components to data sheets?
grep -rn "findMatchingSheet\|matchedComponent\|data_type.*match\|component.*match" web/src/lib/calculation/ web/src/app/api/calculation/ --include="*.ts" | head -20

# What data_type values exist after import?
echo "Run in Supabase SQL Editor:"
echo "SELECT DISTINCT data_type FROM committed_data WHERE tenant_id = (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1);"
```

Document: what does `findMatchingSheet` expect, and what does it actually receive?

### PHASE 0 DELIVERABLE

Write `OB-157_DIAGNOSTIC.md` with:
1. Entity identifier classification logic + why store IDs are misclassified
2. Source date detection logic + why wrong dates are selected
3. Component-to-data matching logic + the name gap

**Commit:** `OB-157 Phase 0: Classification accuracy diagnostic`

---

## PHASE 1: FIX ENTITY SCOPE — ONLY ENTITY-CLASSIFIED SHEETS

### The Problem

`postCommitConstruction()` creates entities from whatever field is classified as `entity_identifier` across ALL content units. Store-level sheets have store IDs as their identifier. These become entities alongside employee IDs.

### The Fix

Entity creation must be scoped to content units classified as ENTITY type by the SCI agent, not from every sheet:

1. **During SCI analyze:** Each content unit has an agent classification (plan, entity, target, transaction, reference). The entity agent claims roster/people sheets.
2. **During entity construction:** Only create entities from content units where `agentType === 'entity'`. Transaction and target sheets may have an identifier column, but it's a foreign key reference to an entity — not an entity definition.
3. **Entity binding:** After entities are created from entity-classified sheets, bind `entity_id` on transaction/target sheets by matching their identifier column to existing entities' `external_id`.

**Korean Test:** The fix must not check sheet names or field names. It uses the SCI agent classification (structural heuristic) to determine which content units define entities.

### Store-Level Data Handling

Store-level sheets (venta_tienda, clientes_nuevos, cobranza) have store IDs, not employee IDs. The engine needs to attribute store-level metrics to employees. This attribution happens at calculation time through the roster's store assignment (employee → store mapping), not at import time through entity creation.

**Do NOT create store entities.** Store IDs are reference data (location identifiers), not entities to be calculated. If store-level attribution is needed at calculation time, the engine resolves it through the employee's store assignment in committed_data.

### Proof Gate 1:
- PG-1: Entity creation only from entity-classified content units
- PG-2: After import, entities ≈ 719 (employees only, no store IDs)
- PG-3: Store-level committed_data exists but does not produce entity rows
- PG-4: Korean Test — zero field name matching in entity creation

**Commit:** `OB-157 Phase 1: Entity scope — only entity-classified content units create entities`

---

## PHASE 2: FIX SOURCE DATE EXTRACTION

### The Problem

OB-152's source-date-extraction.ts has 3 strategies (Content Profile hint → semantic role → structural scan). It's picking hire dates from the roster sheet instead of the period indicators (Mes/Año) from transaction sheets.

### The Fix

Source date extraction must distinguish:

| Date Type | Structural Signal | Should Be source_date? |
|---|---|---|
| Period indicator (Mes=1, Año=2024) | Low cardinality (1-12 for month, 2020-2026 for year), appears on transaction sheets | YES — construct date from Mes+Año |
| Transaction date (Fecha Corte) | Date type, clustered in recent range, appears on transaction sheets | YES — use directly |
| Hire date / birth date | Date type, scattered across decades, appears on roster sheets | NO — this is entity metadata |

**Structural heuristics (Korean Test compliant):**

1. **Date column on a transaction-classified sheet** with values clustered within a narrow range (e.g., all within same year) → likely source_date
2. **Integer columns with values 1-12 and 2020-2030** on transaction sheets → likely Mes/Año period indicators → construct date as `{Año}-{Mes}-01`
3. **Date column on an entity-classified sheet** with values spanning decades → likely hire date or birth date → NOT source_date
4. **Date column with values before 2020** → likely not current transaction data → NOT source_date unless tenant's data range is explicitly older

**Key rule:** Source date comes from transaction and target content units, NOT from entity/roster content units.

### Proof Gate 2:
- PG-5: Source dates clustered in 2024-01 through 2024-03 (not scattered 2000-2024)
- PG-6: Roster sheet dates NOT used as source_date
- PG-7: Transaction sheet dates used as source_date
- PG-8: Korean Test — zero field name matching in date detection

**Commit:** `OB-157 Phase 2: Source date extraction — transaction dates, not hire dates`

---

## PHASE 3: FIX COMPONENT-TO-DATA MATCHING

### The Problem

The engine's `findMatchingSheet()` matches component names to `data_type` values by substring. AI names components "Optical Sales Incentive - Certified." Data types are `base_venta_individual`, `base_venta_tienda`, etc. No substring match → component gets no data → $0 payout.

OB-154 hardcoded component names to match. That violates AP-5 and Korean Test.

### The Fix — Semantic Metric Resolution

The component-to-data matching must not depend on name substring matching. Two approaches:

**Approach A: AI Bridge Names Components to Match Data**

When `bridgeAIToEngineFormat()` runs (OB-155 delivered this), it also receives the SCI analysis results (content unit classifications, field bindings). The bridge uses structural signals to name components in a way that matches data_type patterns:

- If the AI component references metrics that match fields in a specific content unit → name the component to match that content unit's data_type
- This is domain-agnostic because it's matching metric requirements to data availability, not matching strings

**Approach B: Engine Uses Semantic Bindings Instead of Name Matching**

Replace `findMatchingSheet()` with a resolution that uses `input_bindings` to connect components to data:

- Each component's `input_bindings` declares what metrics it needs (from the AI interpretation)
- Each content unit's field bindings declare what metrics it provides (from SCI classification)
- The engine matches components to content units by metric semantic type, not by name

**Approach B is architecturally correct** but larger scope. **Approach A is practical** and can use the existing `findMatchingSheet()` path while the component gets correctly named.

### Choose the approach based on Phase 0C findings. Either way, zero hardcoded field names or sheet names.

### Metric Derivation Generation

OB-154 manually created 14 metric_derivation rules (e.g., `store_sales_attainment = Real/Meta × 100`). These must be generated structurally:

When the AI component references a ratio metric (attainment, achievement) and the data has paired actual/goal fields (detected by SCI field classification as `actual_value` + `target_value`), automatically generate:

```json
{
  "metric": "[component]_attainment",
  "operation": "ratio",
  "numerator": { "source": "field", "semanticType": "actual_value" },
  "denominator": { "source": "field", "semanticType": "target_value" }
}
```

This is structural — it works for any language, any field names, any data.

### Proof Gate 3:
- PG-9: Components match data without hardcoded names
- PG-10: Metric derivations generated structurally (not manually scripted)
- PG-11: Korean Test — zero field name literals in matching logic
- PG-12: At least 4 of 6 components produce non-zero payouts

**Commit:** `OB-157 Phase 3: Semantic metric resolution — components match data by structure`

---

## PHASE 4: VERTICAL SLICE PROOF

### 4A: Nuclear Clear + Reimport

Nuclear clear Óptica. Import plan PPTX + data XLSX through the pipeline (use OB-156's file transport if available, otherwise the existing path with smaller test dataset).

### 4B: Verify Engine Contract

```sql
WITH t AS (SELECT id FROM tenants WHERE slug LIKE '%optica%' LIMIT 1)
SELECT
  (SELECT count(*) FROM entities WHERE tenant_id = t.id) as entities,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND source_date BETWEEN '2024-01-01' AND '2024-03-31') as correct_date_rows,
  (SELECT count(*) FROM committed_data WHERE tenant_id = t.id AND source_date < '2024-01-01') as wrong_date_rows
FROM t;
```

Expected: entities ≈ 719, correct_date_rows = majority, wrong_date_rows ≈ 0.

### 4C: Calculate January + Verify

Calculate January 2024. Check total payout and component breakdown.

Ground truth: MX$1,253,832. Acceptance gate: 100% match ($0.00 delta) — five components are already exact, optical is the only variable.

### Proof Gate 4:
- PG-13: Entities ≈ 719 (not 12,646)
- PG-14: Source dates in 2024 range (not scattered)
- PG-15: Total payout closer to MX$1,253,832 than OB-155's $0
- PG-16: Build clean

**Commit:** `OB-157 Phase 4: Vertical slice — classification fixes produce calculation results`

---

## PHASE 5: COMPLETION REPORT + PR

Write `OB-157_COMPLETION_REPORT.md`. Include:
1. Entity scope fix (what changed, entity count before/after)
2. Source date fix (what changed, date distribution before/after)
3. Component matching fix (approach chosen, components matched before/after)
4. Calculation results (component breakdown, delta vs ground truth)
5. All proof gates

```bash
cd /Users/AndrewAfrica/spm-platform && \
gh pr create --base main --head dev \
  --title "OB-157: SCI Classification Accuracy — Entity, Date, and Metric Resolution" \
  --body "## Three Classification Fixes

### 1. Entity Scope
- Before: 12,646 entities (store IDs + employee IDs)
- After: ~719 entities (employees only)
- Fix: Entity creation scoped to entity-classified content units only

### 2. Source Date
- Before: Dates scattered 2000-2024 (hire dates from roster)
- After: Dates clustered in 2024-01 through 2024-03
- Fix: Source date from transaction/target sheets only, structural date range validation

### 3. Component-to-Data Matching
- Before: AI names don't match data_type → \$0 payout
- After: [approach] resolution produces non-zero payouts
- Fix: [describe] — zero hardcoded names, Korean Test pass

### Results
- Entities: [N] (target: 719)
- Total payout: MX\$[amount] (target: MX\$1,253,832)
- Korean Test: PASS

## Proof Gates: see OB-157_COMPLETION_REPORT.md"
```

| # | Gate | Criterion |
|---|------|-----------|
| PG-1 | Entity scope | Only entity-classified sheets create entities |
| PG-2 | Entity count | ≈ 719 |
| PG-3 | No store entities | Store IDs not in entities table |
| PG-4 | Korean Test (entities) | Zero field name matching |
| PG-5 | Source dates correct | Clustered in 2024 range |
| PG-6 | No roster dates | Hire dates not used as source_date |
| PG-7 | Transaction dates | Used as source_date |
| PG-8 | Korean Test (dates) | Zero field name matching |
| PG-9 | Component matching | No hardcoded names |
| PG-10 | Metric derivations | Generated structurally |
| PG-11 | Korean Test (matching) | Zero field name literals |
| PG-12 | Non-zero payouts | ≥ 4 of 6 components |
| PG-13 | Entity count verified | ≈ 719 after reimport |
| PG-14 | Dates verified | 2024 range |
| PG-15 | Payout improved | Closer to MX$1,253,832 |
| PG-16 | Build clean | `npm run build` exits 0 |

---

## WHAT NOT TO DO

1. **Do NOT hardcode component names** to match Óptica sheet names. (AP-5, Korean Test)
2. **Do NOT hardcode field names** for entity detection or date detection. (AP-6, AP-24)
3. **Do NOT create store entities.** Store IDs are location identifiers, not calculation targets.
4. **Do NOT use Mes/Año by field name.** Detect low-cardinality integer pairs structurally.
5. **Do NOT match components to data by name substring.** Use semantic type or structural binding.
6. **Do NOT manually create metric derivation rules.** Generate them from actual/goal field pair detection.

---

*OB-157 — March 4, 2026*
*"The pipeline works. The intelligence feeding it doesn't. Fix the intelligence."*
