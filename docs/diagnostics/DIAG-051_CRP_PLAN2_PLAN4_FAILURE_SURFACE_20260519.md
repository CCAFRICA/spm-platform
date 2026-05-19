# DIAG-051 — CRP Plan 2 + Plan 4 Failure Surface Diagnostic

**Date:** 2026-05-19
**HEAD:** `1f54ad57` (post PR #417 AUD-010 merge)
**Branch (this diagnostic):** `diag-051-crp-plan2-plan4`
**Type:** Read-only. No code modifications. Two throwaway probe scripts live under `web/scripts/` (idempotent reads only).

---

## Probe 1 — Plan 2 metric derivation filter application

### Probe 1A — filter application code

**Filter helper, `web/src/lib/calculation/run-calculation.ts:99-117`:**

```typescript
 99 export function rowMatchesFilters(
100   rd: Record<string, unknown>,
101   filters: MetricDerivationRule['filters'],
102 ): boolean {
103   if (!filters || filters.length === 0) return true;
104   return filters.every(filter => {
105     const fieldValue = rd[filter.field];
106     switch (filter.operator) {
107       case 'eq':       return fieldValue === filter.value;
108       case 'neq':      return fieldValue !== filter.value;
109       case 'gt':       return typeof fieldValue === 'number' && fieldValue > (filter.value as number);
110       case 'gte':      return typeof fieldValue === 'number' && fieldValue >= (filter.value as number);
111       case 'lt':       return typeof fieldValue === 'number' && fieldValue < (filter.value as number);
112       case 'lte':      return typeof fieldValue === 'number' && fieldValue <= (filter.value as number);
113       case 'contains': return typeof fieldValue === 'string' && fieldValue.includes(String(filter.value));
114       default:         return false;
115     }
116   });
117 }
```

**Derivation application, `run-calculation.ts:119-200` (sum branch shown verbatim):**

```typescript
119 export function applyMetricDerivations(
120   entitySheetData: Map<string, Array<{ row_data: Json }>>,
121   derivations: MetricDerivationRule[],
122   priorPeriodData?: Map<string, Array<{ row_data: Json }>>
123 ): Record<string, number> {
124   const derived: Record<string, number> = {};
125
126   for (const rule of derivations) {
127     ...
130     let matchingRows: Array<{ row_data: Json }> = [];
131     for (const [, rows] of Array.from(entitySheetData.entries())) {
132       matchingRows = matchingRows.concat(rows);
133     }
134
135     // OB-128: Ratio operation works on already-derived metrics, not raw rows
136     if (rule.operation === 'ratio') {
...
141     }
142
143     if (matchingRows.length === 0) continue;
144
145     // Apply derivation operation
146     if (rule.operation === 'sum' && rule.source_field) {
147       // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
148       let total = 0;
149       for (const row of matchingRows) {
150         const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
151           ? row.row_data as Record<string, unknown>
152           : {};
153         if (!rowMatchesFilters(rd, rule.filters)) continue;
154         const val = rd[rule.source_field];
155         if (typeof val === 'number') total += val;
156       }
157       derived[rule.metric] = total;
158     }
```

**Engine invocation site, `web/src/app/api/calculation/run/route.ts:1802-1805`:**

```typescript
1802     const perEntitySheetData = dataByEntity.get(entityId);
1803     const derivedMetrics: Record<string, number> = perEntitySheetData && metricDerivations.length > 0
1804       ? applyMetricDerivations(perEntitySheetData, metricDerivations)
1805       : {};
```

**Merge order — `route.ts:2292-2312`:**

```typescript
2292       // HF-228 Phase 4: merge derived metrics into the component's metrics map.
2293       // Derived metrics (from convergence metric_derivations executed once
2294       // above per entity) carry operation+filter rules that produce metrics
2295       // the convergence_bindings cannot express (filtered counts, cross-
2296       // category sums, ratio derivations, prior-period deltas). Merge order:
2297       // binding-resolved values populate metrics first; derivation outputs
2298       // overlay so a derivation rule for a given metric name takes
2299       // precedence over an incomplete binding-resolved value for the same
2300       // name. Empty derivedMetrics ({}) is a no-op.
2301       for (const [key, value] of Object.entries(derivedMetrics)) {
2302         metrics[key] = value;
2303       }
```

Assessment: **the filter contract is honored** by `applyMetricDerivations` (line 153: `if (!rowMatchesFilters(rd, rule.filters)) continue;`). When a `metric_derivations` rule carries a populated `filters` array, the sum excludes non-matching rows. The merge at `route.ts:2301-2303` overlays derivation-derived values onto binding-derived values for the same metric key.

### Probe 1B — Plan 2 live `input_bindings`

```json
{
  "metric_derivations": [
    {
      "metric": "consumable_revenue",
      "filters": [
        {
          "field": "product_category",
          "value": "Consumables",
          "operator": "eq"
        }
      ],
      "operation": "sum",
      "source_field": "total_amount",
      "source_pattern": "transaction"
    },
    {
      "metric": "monthly_quota",
      "filters": [],
      "operation": "sum",
      "source_field": "monthly_quota",
      "source_pattern": "target"
    }
  ],
  "convergence_version": "HF-234",
  "convergence_bindings": {
    "component_0": {
      "actual": {
        "column": "unit_price",
        "confidence": 0.26349999999999996,
        "match_pass": 3,
        ...
      },
      "period": { "column": "effective_date", ... },
      "numerator": {
        "column": "total_amount",
        "filters": [],
        "confidence": 0.9,
        "match_pass": 1,
        ...
      },
      "denominator": {
        "column": "monthly_quota",
        "filters": [],
        ...
      },
      "entity_identifier": {
        "column": "entity_id",
        "confidence": 1,
        "match_pass": 1,
        ...
      }
    }
  }
}
```

`rule_sets` columns (no separate `convergence_bindings` column): `id, tenant_id, name, description, status, version, effective_from, effective_to, population_config, input_bindings, components, cadence_config, outcome_config, metadata, created_by, approved_by, created_at, updated_at`. The convergence bindings live nested inside `input_bindings`.

### Probe 1C — Plan 2 assessment

**Filter IS present on metric_derivations** (`product_category eq "Consumables"` on `consumable_revenue`). **Filter is ABSENT on convergence_bindings.numerator** (`filters: []`). These two surfaces co-exist for the same column (`total_amount`):

- Binding path (`route.ts:1332-1367 resolveMetricsFromConvergenceBindings` ratio branch): reads `numBinding.column = total_amount` with `numBinding.filters = []` → sums **all** `total_amount` rows for the entity → writes `metrics.consumable_revenue = unfiltered_sum`.
- Derivation path (`run-calculation.ts:119-200 applyMetricDerivations` sum branch): reads `rule.filters = [{product_category, eq, "Consumables"}]` → sums only Consumables rows → writes `derivedMetrics.consumable_revenue = filtered_sum`.
- Merge (`route.ts:2301-2303`): overlay loop writes `metrics.consumable_revenue = derivedMetrics.consumable_revenue` (the filtered value) — **derivation overlay wins**.

**Conclusion (Probe 1):** The current pipeline **DOES apply the Consumables filter** to `consumable_revenue` via the metric_derivations overlay path. The binding's unfiltered numerator is computed but is OVERWRITTEN by the derivation's filtered value before the executor reads it. Therefore the $3,244.03 January delta observed in CRP Plan 2 reconciliation **is not explained by a missing filter at this layer.** The delta originates elsewhere — possible candidates outside this diagnostic's read scope:

1. The `denominator` `monthly_quota` resolves to a different value than the plan reconciliation reference expects (target data sourcing).
2. The piecewise_linear segment boundaries / rates in the plan's `calculationIntent.segments` differ from the reconciliation reference's tier table.
3. Decimal precision / rounding mismatch (Decision 122 at the executor's output boundary).
4. The intent's `targetValue` parameter (if set) is being used as a fallback denominator at `intent-executor.ts:561` instead of the binding-derived `monthly_quota`.

The architect's question "is the filter being applied" answers **YES** — `metric_derivations` filter on `consumable_revenue` reaches the engine and is applied to row sums; the derived value overlays the binding's unfiltered value before executor read.

---

## Probe 2 — Plan 4 failure surface disambiguation

### Probe 2A — Plan 4 live state

```
id: 2df3544d-f268-4333-8991-e7363f075173
name: District Override Plan

input_bindings: {}    ← EMPTY

components:
  variants:
    - variantId: district_manager
      components:
        - id: district_manager_override
          name: District Manager Override
          componentType: scalar_multiply
          measurementLevel: store
          calculationIntent:
            operation: scalar_multiply
            rate: 0.015
            input:
              source: aggregate
              sourceSpec:
                metric: equipment_revenue
                function: sum
    - variantId: regional_vp
      components:
        - id: regional_vp_override
          name: Regional VP Override
          componentType: scalar_multiply
          measurementLevel: store
          calculationIntent:
            operation: scalar_multiply
            rate: 0.005
            input:
              source: aggregate
              sourceSpec:
                metric: equipment_revenue
                function: sum
```

**Three structural mismatches in this calculationIntent vs the engine's actual contract:**

1. `input.source` = **`aggregate`**, not `scope_aggregate`. Per `intent-types.ts:32-41`, `aggregate` (line 26) and `scope_aggregate` (line 37) are distinct IntentSource discriminators. The engine's resolveSource has separate branches:
   - `aggregate` at `intent-executor.ts:113-132` reads `data.metrics[key]` or `data.groupMetrics[key]`.
   - `scope_aggregate` at `intent-executor.ts:159-165` reads `data.scopeAggregates[scope:field:aggregation]`.

   Plan 4's intent routes to the `aggregate` case (line 113), NOT the `scope_aggregate` case. The scope-aggregation pre-computation at `route.ts:2345-2397` writes to `entityData.scopeAggregates` — which Plan 4's executor never reads.

2. `sourceSpec.metric` (vs the typed `sourceSpec.field` the engine expects). The `aggregate` case at `intent-executor.ts:118` reads `const field = src.sourceSpec?.field ?? '';` — which is `undefined` because the AI emitted `metric` not `field`. The coercion produces `field = ''`, `key = ''`, `data.metrics[''] = undefined → 0`.

3. `sourceSpec.function` (vs the typed `sourceSpec.aggregation` the engine expects, with values `'sum' | 'average' | 'count' | ...`). Not consumed by the `aggregate` case at all — the case ignores aggregation type, just reads `data.metrics[key]`. The `function: 'sum'` field is silently discarded.

Per `intent-types.ts:23-43` the canonical IntentSource shapes:

```typescript
23 export type IntentSource =
24   | { source: 'metric'; sourceSpec: { field: string } }
25   | { source: 'ratio'; sourceSpec: { numerator: string; denominator: string } }
26   | { source: 'aggregate'; sourceSpec: { field: string; scope: 'entity' | 'group' | 'global'; aggregation: AggregationType } }
27   | { source: 'constant'; value: number }
28   | { source: 'entity_attribute'; sourceSpec: { attribute: string } }
29   | { source: 'prior_component'; sourceSpec: { componentIndex: number } }
30   | { source: 'cross_data'; sourceSpec: { dataType: string; field?: string; aggregation: 'count' | 'sum' } }
31   | { source: 'scope_aggregate'; sourceSpec: { field: string; scope: 'district' | 'region'; aggregation: AggregationType } };
```

The intent the plan-agent produced for Plan 4 does not match ANY of these shapes structurally — `aggregate` is the closest match by `source` value, but its `sourceSpec` uses non-canonical key names (`metric` / `function` instead of `field` / `aggregation` / `scope`).

### Probe 2B — Entity metadata

DM-candidate entities for the CRP tenant (`CRP-6001` … `CRP-6006`):

```
CRP-6001  Marcus Chen      role=Regional VP        region=NE  district=-      ← Regional VP variant
CRP-6002  Diana Reeves     role=Regional VP        region=SE  district=-      ← Regional VP variant
CRP-6003  James Whitfield  role=District Manager   region=NE  district=NE-NE
CRP-6004  Sarah Okonkwo    role=District Manager   region=NE  district=NE-MA
CRP-6005  Robert Vasquez   role=District Manager   region=SE  district=SE-CR
CRP-6006  Elena Marchetti  role=District Manager   region=SE  district=SE-GS
```

All 4 District Managers carry `metadata.district` populated (`NE-NE`, `NE-MA`, `SE-CR`, `SE-GS`). Both Regional VPs carry `metadata.region` populated (`NE`, `SE`). The scope-aggregation pre-computation at `route.ts:2345-2397` WOULD compute correctly if invoked — but isn't, per Probe 2A's intent-shape finding.

`metadata` columns observed: `role, region, status, district, job_title, department`. Both `role` and `job_title` carry the same value (`"District Manager"` / `"Regional VP"`). `district` and `region` are populated on the appropriate rows.

### Probe 2C — Cross-plan derivations available to Plan 4

```
--- Consumables Commission Plan (2 derivations) ---
  metric=consumable_revenue   op=sum  source_field=total_amount    source_pattern=transaction  filters=product_category eq "Consumables"
  metric=monthly_quota        op=sum  source_field=monthly_quota   source_pattern=target       filters=(none)

--- Capital Equipment Commission Plan (0 derivations) ---
--- District Override Plan (0 derivations) ---
--- Cross-Sell Bonus Plan (0 derivations) ---
```

Three of four plans (Plan 1 Capital Equipment, Plan 3 Cross-Sell, Plan 4 District Override) carry **zero** `metric_derivations` in `input_bindings`. Only Plan 2 (Consumables) has any.

When Plan 4 runs (`metricDerivations.length === 0`), the OB-186 cross-plan resolution at `route.ts:321-337` fires and pulls all derivations from sibling plans. The harvest yields 2 derivations from Plan 2 only:
- `consumable_revenue` (filtered to Consumables)
- `monthly_quota` (unfiltered)

These are fed to `applyMetricDerivations` (line 1804) per Plan 4 entity, so `data.metrics` for any Plan 4 entity carries:
- `data.metrics.consumable_revenue = filtered sum across the entity's rows`
- `data.metrics.monthly_quota = sum of monthly_quota values for the entity`

And to `aggregateScopeRows` (line 2382-2390), so `data.scopeAggregates` for any Plan 4 entity carries:
- `data.scopeAggregates['district:consumable_revenue:sum']`
- `data.scopeAggregates['district:monthly_quota:sum']`
- `data.scopeAggregates['region:consumable_revenue:sum']`
- `data.scopeAggregates['region:monthly_quota:sum']`

**Neither surface carries `equipment_revenue`.** Plan 4's intent reads `data.metrics.equipment_revenue` (via the `aggregate` source case, although that read is itself broken per Probe 2A — `field` is undefined). Even if the read shape were correct, the metric doesn't exist in `data.metrics` because no plan's metric_derivations produces an `equipment_revenue` metric. Plan 1 (Capital Equipment Commission Plan), which would naturally own this metric, has 0 derivations of its own.

### Probe 2D — assessment

Plan 4's $0 output across every entity is the combined consequence of three independent defects:

| # | Surface | Defect | Caught by |
|---|---|---|---|
| **D1** | Plan 4 `calculationIntent.input.source` | Emitted as `aggregate` (entity-scope) instead of `scope_aggregate` (district/region cross-entity). Routes the resolver to `intent-executor.ts:113`, not :159. The scope-aggregation pre-computation that DOES correctly populate district/region sums is bypassed entirely. | Probe 2A |
| **D2** | Plan 4 `calculationIntent.input.sourceSpec` | Uses non-canonical key names (`metric`, `function`) instead of typed canonical names (`field`, `aggregation`, `scope`). The aggregate case at `intent-executor.ts:118` reads `src.sourceSpec?.field` which is `undefined` → `key = ''` → `data.metrics[''] = undefined → 0`. | Probe 2A |
| **D3** | Plan 1 (Capital Equipment Commission Plan) `metric_derivations` | Zero derivations stored — therefore no `equipment_revenue` metric exists in any plan's `metric_derivations`, so the OB-186 cross-plan resolution Plan 4 invokes finds nothing to harvest under that key. Plan 1's reconciliation depends on convergence_bindings.actual being filtered (out of scope to verify here; needs separate probe). | Probe 2C |

**Disambiguation of AUD-010 Stage 5B's three hypotheses:**

- AUD-010 §5B hypothesis 1 ("`entityMetadata.district` null on DM entities") — **DISPROVED.** All 4 DMs have `metadata.district` populated correctly per Probe 2B.
- AUD-010 §5B hypothesis 2 ("intent doesn't reference `scope_aggregate`") — **CONFIRMED.** Intent emits `source: 'aggregate'` not `source: 'scope_aggregate'`. Plus the sourceSpec keys are non-canonical (`metric`/`function` instead of `field`/`aggregation`).
- AUD-010 §5B hypothesis 3 ("cross-plan derivation metric names don't match Plan 4's intent reads") — **CONFIRMED**, as a secondary defect. Even if D1 + D2 were corrected, Plan 4's intent reads `equipment_revenue` which no sibling plan currently produces in `metric_derivations`. Plan 1 has zero derivations.

The PRIMARY defect is the plan-agent's emission of an `aggregate` intent shape with non-canonical `sourceSpec` keys for what is structurally a scope-aggregate (cross-entity district/region sum) computation. The intent reading code path the plan-agent SHOULD have emitted is `scalar_multiply { input: { source: 'scope_aggregate', sourceSpec: { field: '<metric>', scope: 'district', aggregation: 'sum' } }, rate: 0.015 }` per `primitive-registry.ts:41` ("scope aggregation as `scalar_multiply { input.source: 'scope_aggregate' }`").

The SECONDARY defect (`equipment_revenue` missing from cross-plan derivations) is independent: even with the correct scope_aggregate intent shape, the engine cannot look up `district:equipment_revenue:sum` because no plan's derivations produce an `equipment_revenue` metric.

---

## Summary

| Plan | Reconciliation status | Probe finding |
|---|---|---|
| **Plan 2** (Consumables) | $3,244.03 January delta | **NOT** a filter-application defect. `metric_derivations[0]` carries the `product_category=Consumables` filter correctly; `applyMetricDerivations` honors the filter; merge order at `route.ts:2301-2303` overlays the filtered derivation value onto the binding-derived unfiltered value. Delta source is elsewhere — needs separate investigation (denominator value, segment boundaries, rounding, or `targetValue` fallback in piecewise executor). |
| **Plan 4** (District Override) | $0 every entity | **Two compounding plan-agent-emission defects** (D1: `aggregate` instead of `scope_aggregate`; D2: non-canonical sourceSpec keys `metric`/`function` vs typed `field`/`aggregation`) plus a **third upstream defect** (D3: Plan 1 has zero `metric_derivations` for `equipment_revenue` — even a correct Plan 4 intent shape couldn't look up the metric). Plan 4's `input_bindings` is empty (`{}`), so the OB-186 cross-plan resolution must populate `data.metrics` and `data.scopeAggregates` from sibling plans; only Plan 2 currently provides any derivations, and they cover `consumable_revenue` / `monthly_quota`, not `equipment_revenue`. |

Probe scripts committed alongside this diagnostic for reproducibility:
- `web/scripts/diag051-probe1-plan2.ts` (Probe 1B + 1C)
- `web/scripts/diag051-probe2-plan4.ts` (Probe 2A + 2B + 2C)

No source files in `web/src/` were modified.
