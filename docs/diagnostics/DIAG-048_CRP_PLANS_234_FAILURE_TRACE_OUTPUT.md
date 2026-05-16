# DIAG-048 COMPLETION REPORT — CRP Plans 2/3/4 Failure Trace

**Date:** 2026-05-16
**Branch:** diag-048-crp-plans-234-trace
**Commit:** 013666d2 (base; per-phase commits below)
**Tenant:** Cascade Revenue Partners (e44bbcb1-2710-4880-8c7d-a1bd902720b7)
**Scope:** Read-only. Code verbatim. Data verbatim. No interpretation. Architect dispositions.

## Phase 1 — applyMetricDerivations source_pattern gate

### 1.1 `applyMetricDerivations` full body — `web/src/lib/calculation/run-calculation.ts:119`

```typescript
119  export function applyMetricDerivations(
120    entitySheetData: Map<string, Array<{ row_data: Json }>>,
121    derivations: MetricDerivationRule[],
122    priorPeriodData?: Map<string, Array<{ row_data: Json }>>
123  ): Record<string, number> {
124    const derived: Record<string, number> = {};
125
126    for (const rule of derivations) {
127      // HF-172: source_pattern is provenance metadata, NOT a row filter.
128      // All entity rows within the period's date range are candidates.
129      // Content filtering is done by the filters array, not source_pattern.
130      let matchingRows: Array<{ row_data: Json }> = [];
131      for (const [, rows] of Array.from(entitySheetData.entries())) {
132        matchingRows = matchingRows.concat(rows);
133      }
134
135      // OB-128: Ratio operation works on already-derived metrics, not raw rows
136      if (rule.operation === 'ratio') {
137        const num = derived[rule.numerator_metric || ''] ?? 0;
138        const den = derived[rule.denominator_metric || ''] ?? 0;
139        derived[rule.metric] = den !== 0 ? (num / den) * (rule.scale_factor ?? 1) : 0;
140        continue;
141      }
142
143      if (matchingRows.length === 0) continue;
144
145      // Apply derivation operation
146      if (rule.operation === 'sum' && rule.source_field) {
147        // HF-172: Apply filters to sum (was missing — caused cross-category aggregation)
148        let total = 0;
149        for (const row of matchingRows) {
150          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
151            ? row.row_data as Record<string, unknown>
152            : {};
153          if (!rowMatchesFilters(rd, rule.filters)) continue;
154          const val = rd[rule.source_field];
155          if (typeof val === 'number') total += val;
156        }
157        derived[rule.metric] = total;
158      } else if (rule.operation === 'delta' && rule.source_field) {
159        // OB-121: Period-over-period delta = current_sum - prior_sum
160        // HF-172: Apply filters to both current and prior period loops
161        let currentTotal = 0;
162        for (const row of matchingRows) {
163          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
164            ? row.row_data as Record<string, unknown>
165            : {};
166          if (!rowMatchesFilters(rd, rule.filters)) continue;
167          const val = rd[rule.source_field];
168          if (typeof val === 'number') currentTotal += val;
169        }
170
171        let priorTotal = 0;
172        if (priorPeriodData) {
173          // HF-172: Include ALL prior period rows, not just source_pattern matches
174          for (const [, rows] of Array.from(priorPeriodData.entries())) {
175            for (const row of rows) {
176              const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
177                ? row.row_data as Record<string, unknown>
178                : {};
179              if (!rowMatchesFilters(rd, rule.filters)) continue;
180              const val = rd[rule.source_field];
181              if (typeof val === 'number') priorTotal += val;
182            }
183          }
184        }
185
186        derived[rule.metric] = currentTotal - priorTotal;
187        if (!priorPeriodData) {
188          console.log(`[Derivation] delta: no prior period data for "${rule.metric}" — using current value only`);
189        }
190      } else if (rule.operation === 'count') {
191        // HF-172: Uses same rowMatchesFilters helper (was already correct, now DRY)
192        let count = 0;
193        for (const row of matchingRows) {
194          const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
195            ? row.row_data as Record<string, unknown>
196            : {};
197          if (rowMatchesFilters(rd, rule.filters)) count++;
198        }
199        derived[rule.metric] = count;
200      }
201    }
202
203    return derived;
204  }
```

### 1.2 `applyMetricDerivations` call + OB-118 merge — `web/src/lib/calculation/run-calculation.ts:1355–1405`

```typescript
1355
1356      // OB-118: Derive metrics once per entity from loaded data
1357      // OB-121: Pass prior period data for delta derivations
1358      // OB-146: Merge entity + store data for derivation so store-level metrics
1359      // (e.g., new_customers from clientes_nuevos, collections from cobranza)
1360      // can be derived. Store data has entity_id IS NULL but derivation rules
1361      // match by sheet name pattern, which is source-agnostic.
1362      const entityPriorData = priorDataByEntity.get(entityId);
1363      let derivationInput = entitySheetData;
1364      if (entityStoreData && entityStoreData.size > 0) {
1365        derivationInput = new Map(entitySheetData);
1366        for (const [sheetName, rows] of Array.from(entityStoreData.entries())) {
1367          if (!derivationInput.has(sheetName)) {
1368            derivationInput.set(sheetName, rows);
1369          } else {
1370            // OB-148: Append store rows even when entity has same sheet name.
1371            // Store data may have fields (e.g., Real_Venta_Tienda, Meta_Venta_Tienda)
1372            // not present in entity rows. The derivation sum/ratio operations
1373            // only aggregate fields that exist, so mixing is safe.
1374            derivationInput.set(sheetName, [...derivationInput.get(sheetName)!, ...rows]);
1375          }
1376        }
1377      }
1378      const derivedMetrics = metricDerivations.length > 0
1379        ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
1380        : {};
1381
1382      // Evaluate each component with sheet-aware metrics
1383      const componentResults: ComponentResult[] = [];
1384      let entityTotal = 0;
1385
1386      for (const component of selectedComponents) {
1387        const metrics = buildMetricsForComponent(
1388          component,
1389          entitySheetData,
1390          entityStoreData,
1391          aiContextSheets
1392        );
1393        // OB-118: Merge derived metrics
1394        for (const [key, value] of Object.entries(derivedMetrics)) {
1395          metrics[key] = value;
1396        }
1397        // OB-146: Normalize derived attainment metrics from decimal to percentage.
1398        // buildMetricsForComponent normalizes but the derivation override can
1399        // re-introduce decimal values (e.g., Cumplimiento = 1.165 → should be 116.5).
1400        // Apply the same heuristic: values < 10 are decimal ratios, multiply by 100.
1401        for (const [key, value] of Object.entries(metrics)) {
1402          if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
1403            metrics[key] = value * 100;
1404          }
1405        }
```

### 1.3 `route.ts` OB-118 merge-guard retirement — `web/src/app/api/calculation/run/route.ts:2185–2210`

```typescript
2185            context: { trigger: 'engine_no_bindings' },
2186          }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch(() => { /* non-blocking */ });
2187          metrics = {};
2188        }
2189
2190        // Log which path was taken (first entity only, to avoid flooding)
2191        if (entityResults.length === 0 && compIdx === 0) {
2192          addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
2193        }
2194
2195        // HF-220 R2 / ADR Decision 1: OB-118 merge-guard retired. With legacy derivation
2196        // path removed in R1, convergence binding resolution is the single populator of
2197        // metrics[key]; no merge required, no guard fires possible.
2198        // OB-167: Band-aware normalization — replaces inferSemanticType-gated normalization.
2199        // Compare metric values against the component's band ranges (from the plan spec).
2200        // If value is in decimal range (0-2) but the band expects percentage range (max > 10),
2201        // normalize ×100. Korean Test: uses plan structure, not metric name patterns.
2202        // HF-116: Still skip for convergence path (scale_factor handles it there).
2203        if (!usedConvergenceBindings) {
2204          // OB-196 Phase 2: band-normalization reads foundational metadata.intent (Decision 151
2205          // read-only projection). 1D lookup → intent.boundaries[0].max keyed by intent.input
2206          // metric field; 2D lookup → intent.rowBoundaries[0].max + intent.columnBoundaries[0].max
2207          // keyed by intent.inputs.row/column metric fields.
2208          // ...
2209          const bandMaxByMetric: Record<string, number> = {};
2210          const meta = (component.metadata || {}) as Record<string, unknown>;
```

`grep -n "applyMetricDerivations\|derivedMetrics\|derivationInput" web/src/lib/calculation/run-calculation.ts`:

```
119: export function applyMetricDerivations(
1363:     let derivationInput = entitySheetData;
1365:       derivationInput = new Map(entitySheetData);
1367:         if (!derivationInput.has(sheetName)) {
1368:           derivationInput.set(sheetName, rows);
1374:           derivationInput.set(sheetName, [...derivationInput.get(sheetName)!, ...rows]);
1378:     const derivedMetrics = metricDerivations.length > 0
1379:       ? applyMetricDerivations(derivationInput, metricDerivations, entityPriorData)
1380:       : {};
1394:       for (const [key, value] of Object.entries(derivedMetrics)) {
```

`grep -n "applyMetricDerivations" web/src/app/api/calculation/run/route.ts`:

```
1449:    // (applyMetricDerivations in run-calculation.ts) respected filters via
```

(route.ts no longer calls `applyMetricDerivations` directly — the single call is at run-calculation.ts:1379. The route.ts hit is a comment reference.)
