# DIAG-033_SHAPE_C_VERIFICATION_GATE — Architect-Channel SQL

**Sequence:** 033 (DIAG-025 through 032 assigned this session)
**Type:** Read-only architect-channel SQL; single-pass empirical set-difference
**Question answered:** Is every metric key consumed by intent-executor's `resolveSource` resolvable from convergence_bindings? If yes, Shape C (per IRA HF-205 verdict) is clean to implement. If no, the unresolved keys are the substrate residue requiring either new convergence_bindings or documented exception.
**Decides:** Whether HF-205 ships as Shape C directly, or requires Shape A interim with sunset trigger
**Substrate authority:**
- **IRA HF-205 verdict (2026-05-06, $1.32609):** Shape C rank 1 with empirical verification gate per T1-E905 (Prove Don't Describe)
- **HF-204 trace (verbatim, 2026-05-06 13:22:42):** convergence produces correct scaled values; intent-executor reads from a parallel `data.metrics` map populated outside convergence
- **Decision 153 (Seeds Eradication — atomic cutover):** target end-state is signal-surface as single canonical path; this verification confirms whether the cutover is structurally completable for BCL or requires staged approach
- **Decision 109 / 124:** no thresholds; pure set-difference

**Supersession candidates from IRA:** deferred to post-reconciliation focused promotion effort per architect direction. Three entries pending VG-side ICA capture wave (T2-E08 extension; T2-E10 extension; T2-E01 extension; alongside HF-201 pending candidates T1-E906 + T2-E12).

## SQL

Run in Supabase SQL Editor. Two queries.

### Query 1 — Convergence-produced metric keys (per component, per variant)

The `convergence_bindings` JSONB at `rule_sets.input_bindings.convergence_bindings` is an object keyed by `component_<idx>`, with each component containing slots (`actual`, `target`, `row`, `column`, `numerator`, `denominator`) that each have a `column` field. The metric KEY that gets written to data.metrics is determined by `getExpectedMetricNames` at calc time, which reads `calculationIntent.input.sourceSpec.field` (or `inputs.<role>.sourceSpec.field`) from `rule_sets.components`.

**Approach:** for each component in each variant, extract the metric key(s) that `getExpectedMetricNames` would return. These are the keys convergence is responsible for resolving.

```sql
-- ═════════════════════════════════════════════════════════════════════
-- DIAG-033: Convergence-resolvable metric keys per component
-- ═════════════════════════════════════════════════════════════════════
WITH comp AS (
  SELECT
    rs.id           AS rule_set_id,
    rs.name         AS rule_set_name,
    variant->>'variantId'    AS variant_id,
    variant->>'variantName'  AS variant_name,
    (component_data.idx - 1) AS component_idx,
    component_data.value     AS component
  FROM rule_sets rs
  CROSS JOIN LATERAL jsonb_array_elements(rs.components->'variants') AS variant
  CROSS JOIN LATERAL jsonb_array_elements(variant->'components') WITH ORDINALITY AS component_data(value, idx)
  WHERE rs.tenant_id = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111'
)
SELECT
  rule_set_name,
  variant_name,
  component_idx,
  component->>'name'         AS component_name,
  component->>'componentType' AS component_type,
  -- bounded_lookup_2d: extract row.field + column.field
  component->'calculationIntent'->'inputs'->'row'->'sourceSpec'->>'field'    AS field_row,
  component->'calculationIntent'->'inputs'->'column'->'sourceSpec'->>'field' AS field_column,
  -- bounded_lookup_1d, scalar_multiply: extract input.field
  component->'calculationIntent'->'input'->'sourceSpec'->>'field'             AS field_input,
  -- conditional_gate: extract condition.left.field
  component->'calculationIntent'->'condition'->'left'->'sourceSpec'->>'field' AS field_condition_left
FROM comp
ORDER BY variant_name, component_idx;
```

PASTE output. The `field_*` columns name the metric keys intent-executor's `resolveSource` will look up via `data.metrics[key]`.

### Query 2 — Pre-convergence metrics map keys (from HF-204 trace evidence)

The HF-204 trace verbatim shows what intent-executor sees in its `metricsKeys` array. Compare across components to identify the union of keys present in `data.metrics` at execution time.

This query is documentary — extracts what HF-204 already proved. Architect cross-references against Query 1 manually.

From HF-204 trace 2026-05-06 13:22:42 (BCL October), `data.metrics` contained these keys at intent-executor consumption (verbatim):

```
For component_0 (bounded_lookup_2d) consumption:
  metricsKeys=[cumplimiento_colocacion,calidad_cartera,cumplimiento_depositos]

For component_1 (bounded_lookup_1d) consumption:
  metricsKeys=[cumplimiento_depositos,cumplimiento_colocacion]

For component_2 (scalar_multiply) consumption:
  metricsKeys=[productos_cruzados_vendidos,cumplimiento_colocacion,cumplimiento_depositos]

For component_3 (conditional_gate) consumption:
  metricsKeys=[infracciones_regulatorias,cumplimiento_colocacion,cumplimiento_depositos]
```

Union of keys consumed by intent-executor across all components for BCL Senior variant:
- cumplimiento_colocacion
- calidad_cartera
- cumplimiento_depositos
- productos_cruzados_vendidos
- infracciones_regulatorias

(5 keys total)

### Set difference computation (architect-channel)

Compare Query 1 output (per-component field_* values) against the 5-key union above:

| Metric key consumed by intent-executor | Convergence resolves? | Source in convergence binding |
|---|---|---|
| cumplimiento_colocacion | ? | Query 1 shows? |
| calidad_cartera | ? | Query 1 shows? |
| cumplimiento_depositos | ? | Query 1 shows? |
| productos_cruzados_vendidos | ? | Query 1 shows? |
| infracciones_regulatorias | ? | Query 1 shows? |

For each row, fill from Query 1:
- If a `field_*` column shows the key in Query 1 → convergence resolves it ✓
- If no `field_*` column shows the key → convergence does NOT resolve it ✗ (this is a Decision 153 completion item)

## Decisive interpretation

**If all 5 keys are resolvable by convergence:** Shape C clean to implement. HF-205 ships as Shape C — eradicate pre-convergence metrics path, convergence becomes sole authority. Decision 153 atomic cutover completes structurally for BCL.

**If any key is NOT resolvable by convergence:** that key is a Decision 153 completion item. Two sub-paths:
- **Sub-path X — extend convergence_bindings to resolve the missing keys.** Pure Decision 153 compliance. May require new binding production logic.
- **Sub-path Y — Shape A as PREPARE-pattern interim** with sunset trigger tied to Sub-path X completion.

## Out of scope (this diagnostic)

- Meridian / CRP equivalent set-difference — defer until BCL Shape C resolves; architect dispositions whether same pattern verifies for other tenants
- Substrate promotion of supersession_candidates — deferred to post-reconciliation focused effort per architect direction
- Code reading of `getExpectedMetricNames` AST visitor — DIAG-031 already confirmed byte-identical to HF-196 closure; static behavior known

## Architect post-execution

After running Query 1 + filling the set-difference table:

1. Paste Query 1 output here
2. Paste the completed set-difference table
3. Architect-channel interprets per "Decisive interpretation" above
4. Drafts HF-205 directly OR drafts Sub-path X scope first

NO CC dispatch needed for this diagnostic. Architect-channel SQL only.
