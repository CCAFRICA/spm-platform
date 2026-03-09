# HF-108 Phase 0: Engine Data Resolution Diagnostic

## Engine Data Fetching Code

All queries in `web/src/app/api/calculation/run/route.ts`:

| Query | Lines | Filter | Purpose |
|-------|-------|--------|---------|
| Current period via source_date | 245-258 | `.gte('source_date', start).lte('source_date', end)` | Primary (new imports) |
| Current period via period_id | 271-282 | `.eq('period_id', periodId)` | Fallback (LAB/legacy) |
| Period-agnostic | 292-303 | `.is('period_id', null).is('source_date', null)` | Store/reference data |
| Prior period via source_date | 376-394 | `.gte/.lte prior period dates` | Delta derivations |
| Prior period via period_id | 397-411 | `.eq('period_id', priorPeriodId)` | Prior fallback |

Select columns: `entity_id, data_type, row_data` — **does NOT select import_batch_id**.

## Engine Entity Iteration

- Entity IDs from `rule_set_assignments` (lines 149-181)
- Entity metadata fetch in batches of 200 (lines 185-196)
- Main entity loop: **line 775**: `for (const entityId of calculationEntityIds)`
- Data grouped into `dataByEntity: Map<entityId, Map<dataType, Array<{row_data}>>>` (lines 309-350)

## Engine Input Source Resolution

Per-entity per-component resolution at **lines 863-893**:

```
for (const component of selectedComponents) {
  metrics = buildMetricsForComponent(component, entitySheetData, ...)   // line 868
  for (const [key, value] of derivedMetrics) metrics[key] = value       // line 878
  normalize attainment                                                   // line 884
  result = evaluateComponent(component, metrics)                         // line 889
}
```

`buildMetricsForComponent()` in `run-calculation.ts:717`:
1. Match sheets to component via AI context or pattern
2. Aggregate row_data values to numeric metrics
3. Resolve expected metric names via semantic type
4. Apply metric_mappings overrides (OB-153)

`applyMetricDerivations()` in `run-calculation.ts:149-245`:
- Called at route.ts:854-856
- Operations: count (with filters), sum, delta, ratio
- Derived metrics override base metrics at route.ts:878

## Convergence Bindings — Parsed but NOT Used

Location: route.ts:133-142

```typescript
const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
if (convergenceBindings) {
  addLog(`OB-162 Convergence bindings: ${bindingCount} ...`);
  // LOGGING ONLY — never passed to calculation loop
}
```

The variable `convergenceBindings` is declared at line 135 and referenced ONLY in logging (lines 136-142). It is never consumed for actual data resolution. The engine proceeds with the old path (buildMetricsForComponent + applyMetricDerivations).

## Entity Pipeline Write Target

Location: `web/src/app/api/import/sci/execute/route.ts:708-857`

Entity pipeline writes **directly to `entities` table** (line 814):
```typescript
await supabase.from('entities').insert(slice);
```

Entity pipeline does **NOT write to committed_data**. This is the only pipeline that skips committed_data.

Other pipelines comparison:
- Target: writes to committed_data (line 475) with field_identities + informational_label
- Transaction: writes to committed_data (line 665) with field_identities + informational_label
- Reference: writes to committed_data (line 948) with field_identities + informational_label
- Entity: writes to entities only (line 814) — **NO committed_data, NO field_identities**

## SQL Test: Convergence Bindings

Data was cleaned via OB-162_CLEANUP_SQL.md before OB-162 merge. No re-import has occurred yet. Convergence bindings will be empty.

SQL ready for Andrew to run after re-import:
```sql
SELECT jsonb_pretty(input_bindings->'convergence_bindings')
FROM rule_sets
WHERE tenant_id = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
```

## Current Engine Data Resolution Path (Full Trace)

```
1. Parse rule_set → components, input_bindings
2. Parse metric_derivations from input_bindings (OB-118)
3. Parse metric_mappings from input_bindings (OB-153)
4. Parse convergence_bindings from input_bindings (OB-162) — LOG ONLY
5. Fetch entities via rule_set_assignments
6. Fetch committed_data (5 queries: current/prior × source_date/period_id + period-agnostic)
7. Group data: dataByEntity[entityId][dataType] = [{row_data}...]
8. Group store data: storeData[storeKey][dataType] = [{row_data}...]
9. For each entity:
   a. Aggregate all entity rows → allEntityMetrics
   b. Find storeId, role from entity rows
   c. Select variant by role
   d. Apply metric derivations (count/sum/delta/ratio) → derivedMetrics
   e. For each component:
      i.   buildMetricsForComponent → sheet matching + aggregation + semantic resolution
      ii.  Merge derivedMetrics (override)
      iii. Normalize attainment
      iv.  evaluateComponent → payout
   f. Intent engine dual-path (OB-76)
   g. Store entity result
```

**Gap: Step 9.e.i uses sheet matching + aggregation. Convergence bindings (step 4) are never consumed.**

---

*HF-108 Phase 0 Diagnostic | March 8, 2026*
