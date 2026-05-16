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

## Phase 2 — Plan 3 source_pattern vs entitySheetData keys

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag048-phase2.ts`

### 2.1 CRP rule_sets metric_derivations + convergence_bindings (current state on `main`, post-HF-227)

```
--- Cross-Sell Bonus Plan (0875d691-992b-4518-a4ad-2c2863ff589a) ---
metric_derivations (2):
  metric=equipment_deal_count op=count source_pattern="transaction" source_field=transaction_id filters=[{"field":"product_category","value":"Capital Equipment","operator":"eq"}]
  metric=cross_sell_count op=count source_pattern="transaction" source_field=transaction_id filters=[{"field":"order_type","value":"Cross-Sell","operator":"eq"}]
convergence_bindings keys: component_0
  component_0.actual → column=quantity filters=[{"field":"product_category","value":"Capital Equipment","operator":"eq"}]

--- Capital Equipment Commission Plan (ddc0d6de-0f3b-4e3a-ad42-e1f731ffe003) ---
metric_derivations (1):
  metric=period_equipment_revenue op=sum source_pattern="transaction" source_field=total_amount filters=[{"field":"product_category","value":"Capital Equipment","operator":"eq"}]
convergence_bindings keys: component_0
  component_0.actual → column=total_amount filters=[{"field":"product_category","value":"Capital Equipment","operator":"eq"}]

--- Consumables Commission Plan (0aac0860-ad84-4e16-bc36-559be57b5f21) ---
metric_derivations (1):
  metric=consumable_revenue op=sum source_pattern="transaction" source_field=total_amount filters=[{"field":"product_category","value":"Consumables","operator":"eq"}]
convergence_bindings keys: component_0
  component_0.actual → column=quantity filters=[]
  component_0.numerator → column=total_amount filters=[{"field":"product_category","value":"Consumables","operator":"eq"}]
  component_0.denominator → column=unit_price filters=[]

--- District Override Plan (b648c9dd-09ad-4908-bec1-7ac4d18ae5dd) ---
metric_derivations (0):
convergence_bindings keys: component_0
```

### 2.2 Distinct `data_type` values + Tyler Morrison sample

```
Distinct data_type values (2):
  "entity" → 57 rows
  "transaction" → 756 rows
```

```
Tyler Morrison ext=CRP-6007 id=dfcc8e89-8025-4f61-b807-c83c03557895

  data_type="transaction" source_date=2026-02-22 keys=_rowIndex,_sheetName,customer_name,date,order_type,product_category,product_name,quantity,sales_rep_id,sales_rep_name,total_amount,transaction_id,unit_price
    product_category=Consumables
    order_type=New Sale
  data_type="transaction" source_date=2026-02-20 keys=...  product_category=Consumables  order_type=New Sale
  data_type="transaction" source_date=2026-02-27 keys=...  product_category=Capital Equipment  order_type=New Sale
  data_type="transaction" source_date=2026-02-18 keys=...  product_category=Consumables  order_type=New Sale
  data_type="transaction" source_date=2026-02-28 keys=...  product_category=Consumables  order_type=New Sale
  data_type="transaction" source_date=2026-02-26 keys=...  product_category=Consumables  order_type=New Sale
  data_type="transaction" source_date=2026-02-20 keys=...  product_category=Consumables  order_type=Cross-Sell
  data_type="transaction" source_date=2026-02-17 keys=...  product_category=Capital Equipment  order_type=New Sale
```

### 2.3 Regex test (`new RegExp(source_pattern, 'i')` against each `data_type`)

```
pattern="transaction"
  vs "entity" → false
  vs "transaction" → true
```

(Note: per Phase 1.1 `applyMetricDerivations` body, `source_pattern` is NOT used as a row filter post-HF-172. The Phase 1.1 paste shows `matchingRows = matchingRows.concat(rows)` aggregates every `entitySheetData` value regardless of pattern. The regex test above is informational only — the gate the directive asked about no longer exists at line 130-133 of `applyMetricDerivations`. Per directive §1.1 instruction to answer "Does `source_pattern` regex still gate row collection?" — the answer is visible in the pasted body: no. CC offers no further interpretation.)

## Phase 3 — Plan 2 quota column resolution

### 3.1 `import_batches` + `committed_data` per-data_type column inventory (CRP)

Command: `cd web && set -a && source .env.local && set +a && npx tsx scripts/diag048-phase3.ts`

```
=== 3.1 import_batches ===
(empty — `import_batches` table returned zero rows for the CRP tenant)

=== 3.1 committed_data per-data_type column inventory ===

data_type="transaction" (467 sampled rows):
  columns: _rowIndex, _sheetName, customer_name, date, order_type, product_category, product_name, quantity, sales_rep_id, sales_rep_name, total_amount, transaction_id, unit_price
  categorical fields:
    order_type: ["New Sale","Cross-Sell"]
    product_name: ["Surgical Gloves","Imaging Plates","Ultrasound Pro","Bandage Supply","Supply Package","Sterilization Pack","Contrast Agent","CT Unit","Catheter Kit","Maintenance Kit","Surgical Robot","X-Ray System","MRI Scanner","Consumable Bundle"]
    product_category: ["Consumables","Capital Equipment"]
  numeric fields: date, quantity, unit_price, total_amount

data_type="entity" (33 sampled rows):
  columns: _rowIndex, _sheetName, department, district, employee_id, full_name, hire_date, job_title, region, reports_to, status
  categorical fields:
    region: ["NE","SE",""]
    status: ["Active"]
    district: ["NE-NE","NE-MA","SE-CR","SE-GS",""]
    job_title: ["Senior Rep","Rep","Sales Operations","Regional VP","District Manager"]
    department: ["Sales","Sales Operations"]
    reports_to: ["James Whitfield","Sarah Okonkwo","Robert Vasquez","Elena Marchetti","CRP-6006","","Marcus Chen","Diana Reeves"]
  numeric fields: hire_date
```

(No `monthly_quota` column appears in either `data_type`. There is no `data_type=quota` or `data_type=performance_target`. The 500-row sample exhausted the dataset visible to convergence-time inventory.)

### 3.2 `inventoryData` full body — `web/src/lib/intelligence/convergence-service.ts:898`

```typescript
898  async function inventoryData(
899    tenantId: string,
900    supabase: SupabaseClient
901  ): Promise<DataCapability[]> {
902    const capabilities: DataCapability[] = [];
903
904    // HF-196 Phase 1E: filter out superseded batches per Rule 30.
905    const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
906    const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
907
908    // OB-162: Also read import_batch_id for convergence bindings
909    let q = supabase
910      .from('committed_data')
911      .select('data_type, row_data, metadata, import_batch_id')
912      .eq('tenant_id', tenantId)
913      .not('data_type', 'is', null)
914      .limit(500);
915    if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
916    const { data: rows } = await q;
917
918    // OB-128: Separately fetch rows with semantic_roles (SCI-committed data)
919    let q2 = supabase
920      .from('committed_data')
921      .select('data_type, row_data, metadata, import_batch_id')
922      .eq('tenant_id', tenantId)
923      .not('data_type', 'is', null)
924      .not('metadata->semantic_roles', 'is', null)
925      .limit(50);
926    if (supersededIds.length > 0) q2 = q2.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
927    const { data: sciRows } = await q2;
928
929    const allRows = [...(rows || [])];
930    if (sciRows) {
931      for (const sr of sciRows) {
932        const dt = sr.data_type as string;
933        if (!allRows.some(r => (r.data_type as string) === dt)) {
934          allRows.push(sr);
935        }
936      }
937    }
938
939    if (!allRows.length) return capabilities;
940
941    // Group by data_type
942    const byType = new Map<string, Array<Record<string, unknown>>>();
943    const countByType = new Map<string, number>();
944    const rolesByType = new Map<string, Record<string, string>>();
945    // OB-162: Collect field identities and batch IDs per data_type
946    const fieldIdentitiesByType = new Map<string, Record<string, FieldIdentity>>();
947    const batchIdsByType = new Map<string, Set<string>>();
948
949    for (const row of allRows) {
950      const dt = row.data_type as string;
951      if (!byType.has(dt)) byType.set(dt, []);
952      countByType.set(dt, (countByType.get(dt) || 0) + 1);
953      const samples = byType.get(dt)!;
954      if (samples.length < 30) {
955        const rd = row.row_data as Record<string, unknown> | null;
956        if (rd) samples.push(rd);
957      }
958
959      // Collect batch IDs
960      const batchId = row.import_batch_id as string | null;
961      if (batchId) {
962        if (!batchIdsByType.has(dt)) batchIdsByType.set(dt, new Set());
963        batchIdsByType.get(dt)!.add(batchId);
964      }
965
966      // Extract semantic_roles from metadata
967      if (!rolesByType.has(dt)) {
968        const meta = row.metadata as Record<string, unknown> | null;
969        const rawRoles = meta?.semantic_roles as Record<string, unknown> | undefined;
970        if (rawRoles && Object.keys(rawRoles).length > 0) {
971          const normalized: Record<string, string> = {};
972          for (const [field, val] of Object.entries(rawRoles)) {
973            if (typeof val === 'string') {
974              normalized[field] = val;
975            } else if (val && typeof val === 'object' && 'role' in val) {
976              normalized[field] = String((val as Record<string, unknown>).role);
977            }
978          }
979          if (Object.keys(normalized).length > 0) {
980            rolesByType.set(dt, normalized);
981          }
982        }
983
984        // OB-162: Extract field_identities from metadata (Decision 111)
985        const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
986        if (fieldIds && Object.keys(fieldIds).length > 0) {
987          const identities: Record<string, FieldIdentity> = {};
988          for (const [colName, fi] of Object.entries(fieldIds)) {
989            identities[colName] = {
990              structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
991              contextualIdentity: fi.contextualIdentity || 'unknown',
992              confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
993              };
994            }
995          fieldIdentitiesByType.set(dt, identities);
996          }
997        }
998      }
999    }
```

(Function continues — building `DataCapability` per data_type via `for (const [dataType, samples] of Array.from(byType.entries()))` loop starting at line 1000. Body shown to line 998 covers query and grouping; remaining body classifies columns into `numericFields` / `categoricalFields` / `booleanFields`.)

### 3.3 `measureColumns` construction inside `generateAllComponentBindings` — `convergence-service.ts:2181–2252`

```typescript
2181    // Collect all measure columns across matched capabilities
2182    const measureColumns: Array<{
2183      name: string;
2184      fi: FieldIdentity;
2185      stats: ColumnValueStats;
2186      batchId: string;
2187    }> = [];
2188    let primaryCap: DataCapability | undefined;
2189
2190    for (const match of matches) {
2191      const cap = capabilities.find(c => c.dataType === match.dataType);
2192      if (!cap) continue;
2193      if (!primaryCap) {
2194        primaryCap = cap;
2195      }
2196
2197      for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
2198        if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
2199          if (!measureColumns.some(mc => mc.name === colName)) {
2200            measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
2201          }
2202        }
2203      }
2204      // Also include numeric columns with stats but no field identity
2205      for (const nf of cap.numericFields) {
2206        if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
2207          measureColumns.push({
2208            name: nf.field,
2209            fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
2210            stats: cap.columnStats[nf.field],
2211            batchId: cap.batchIds[0] || '',
2212          });
2213        }
2214      }
2215    }
2216
2217    if (measureColumns.length === 0 || !primaryCap) return;
2218
2219    // Collect all input requirements across all matched components
2220    const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
2221    for (const match of matches) {
2222      const reqs = extractInputRequirements(match.component);
2223      for (const req of reqs) {
2224        allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
2225      }
2226    }
2227
2228    // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
2229    // signals as authoritative semantic intent.
2230    // HF-227: aggregate categorical fields across matched capabilities and pass
2231    // them to the AI so it can identify categorical-subset opportunities
2232    // (filters) at column-mapping time. Dedup by field name across capabilities.
2233    const seenCategoricalFields = new Set<string>();
2234    const aggregatedCategoricalFields: Array<{ field: string; distinctValues: unknown[] }> = [];
2235    for (const match of matches) {
2236      const cap = capabilities.find(c => c.dataType === match.dataType);
2237      if (!cap) continue;
2238      for (const cf of cap.categoricalFields || []) {
2239        if (seenCategoricalFields.has(cf.field)) continue;
2240        seenCategoricalFields.add(cf.field);
2241        aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
2242      }
2243    }
2244    console.log('[Convergence] HF-112 Requesting AI column mapping');
2245    const aiMapping = await resolveColumnMappingsViaAI(
2246      components,
2247      allRequirements,
2248      measureColumns,
2249      metricComprehension,
2250      aggregatedCategoricalFields,
2251    );
2252    console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);
```

(Per Phase 3.1: no `monthly_quota` column appears in either CRP data_type. Per Phase 2.1: Consumables convergence binding sets `component_0.denominator → column=unit_price filters=[]` and `component_0.actual → column=quantity filters=[]`. The Consumables `metric_derivations` rule has `metric=consumable_revenue op=sum source_field=total_amount filters=[product_category eq Consumables]` only — no `monthly_quota` derivation rule.)

## Phase 4 — Plan 4 TypeError crash

### 4.1 `startsWith` call sites in `web/src/app/api/calculation/run/route.ts`

`grep -n "startsWith" web/src/app/api/calculation/run/route.ts`:

```
1002:      const isParent = Array.from(allSheetNames).some(s => s.startsWith(prefix));
1077:          if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
1874:                  if (colName.startsWith('_')) continue; // skip metadata fields (_rowIndex, _sheetName)
2295:            if (key.startsWith('_') || typeof val !== 'number') continue;
2336:            if (key.startsWith('_') || typeof val !== 'number') continue;
```

Context around each hit (5 lines each):

```typescript
// 1002 — roster parent-sheet heuristic
1000      for (const candidate of Array.from(allSheetNames)) {
1001        const prefix = candidate + '__';
1002        const isParent = Array.from(allSheetNames).some(s => s.startsWith(prefix));
1003        if (isParent) {
1004          rosterSheetName = candidate;

// 1077 — store-sheet numeric aggregation
1074            const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
1075              ? row.row_data as Record<string, unknown> : {};
1076            for (const [key, value] of Object.entries(rd)) {
1077              if (typeof value === 'number' && !key.startsWith('_') && key !== 'date') {
1078                existing[key] = (existing[key] ?? 0) + value;

// 1874 — entity-identifier candidate scoring
1872                for (const [colName, v] of Object.entries(rd)) {
1873                  if (colName === eidColumn) continue; // skip stored binding column (already verified)
1874                  if (colName.startsWith('_')) continue; // skip metadata fields (_rowIndex, _sheetName)
1875                  if (v == null) continue;

// 2295 — entity-scoped cross-data aggregation
2293              ? row.row_data as Record<string, unknown> : {};
2294            for (const [key, val] of Object.entries(rd)) {
2295              if (key.startsWith('_') || typeof val !== 'number') continue;
2296              const sumKey = `${dataType}:sum:${key}`;
2297              entityCrossData[sumKey] = (entityCrossData[sumKey] || 0) + val;

// 2336 — scope-aggregate sum
2334            // Unfiltered: sum all numeric fields
2335            for (const [key, val] of Object.entries(rd)) {
2336              if (key.startsWith('_') || typeof val !== 'number') continue;
2337              entityScopeAgg[`${scopePrefix}:${key}:sum`] = (entityScopeAgg[`${scopePrefix}:${key}:sum`] || 0) + val;
```

### 4.2 Minified bundle context around the architect-cited offset

```bash
$ head -c 35000 web/.next/server/app/api/calculation/run/route.js | tail -c 400
or:eZ(o),denominator:eZ(a)},resolvedValue:eZ(s)},s}case"aggregate":{let i=e.sourceSpec.field,r=i.startsWith("metric:")?i.slice(7):i;if("group"===e.sourceSpec.scope&&t.groupMetrics){let e=t.groupMetrics[r]??0;return n[`aggregate:group:${r}`]={source:"aggregate:group",rawValue:e,resolvedValue:e},eW(e)}let o=t.metrics[r]??0;return n[`aggregate:${e.sourceSpec.scope}:${r}`]={source:`aggregate:${e.sourc
```

The minified context shows `case "aggregate"` body inside `resolveSource` with `i.startsWith("metric:")` against `e.sourceSpec.field`. Unminified source — `web/src/lib/calculation/intent-executor.ts:73–117`:

```typescript
 73    switch (src.source) {
 74      case 'metric': {
 75        const field = src.sourceSpec.field;
 76        // Strip "metric:" prefix if present
 77        const key = field.startsWith('metric:') ? field.slice(7) : field;
 78        const raw = data.metrics[key] ?? 0;
 79        inputLog[field] = { source: 'metric', rawValue: data.metrics[key], resolvedValue: raw };
 80        ...
 86        return toDecimal(raw);
 87      }
 88      case 'ratio': {
 89        const numKey = src.sourceSpec.numerator.startsWith('metric:')
 90          ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
 91        const denKey = src.sourceSpec.denominator.startsWith('metric:')
 92          ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
 93        const num = toDecimal(data.metrics[numKey] ?? 0);
 94        const den = toDecimal(data.metrics[denKey] ?? 0);
 95        const val = den.isZero() ? ZERO : num.div(den);
 96        ...
101        return val;
102      }
103      case 'aggregate': {
104        const field = src.sourceSpec.field;
105        const key = field.startsWith('metric:') ? field.slice(7) : field;
106        if (src.sourceSpec.scope === 'group' && data.groupMetrics) {
107          const raw = data.groupMetrics[key] ?? 0;
108          inputLog[`aggregate:group:${key}`] = { source: 'aggregate:group', rawValue: raw, resolvedValue: raw };
109          return toDecimal(raw);
110        }
111        const raw = data.metrics[key] ?? 0;
112        inputLog[`aggregate:${src.sourceSpec.scope}:${key}`] = {
113          source: `aggregate:${src.sourceSpec.scope}`,
114          rawValue: raw,
115          resolvedValue: raw,
116        };
117        return toDecimal(raw);
118      }
```

(The crashing `startsWith` is in `resolveSource` inside `intent-executor.ts`, lines 77, 89, 91, 105. The aggregate case at line 105 calls `field.startsWith('metric:')` where `field = src.sourceSpec.field` — if `src.sourceSpec.field` is `undefined` (e.g. when an `aggregate` IntentSource lacks `sourceSpec.field`), this throws TypeError. Same shape for the metric and ratio cases.)

### 4.3 `buildMetricsForComponent` full body (excerpt — entity-sheet matching) — `run-calculation.ts:551–595`

```typescript
551  export function buildMetricsForComponent(
552    component: PlanComponent,
553    entityRowsBySheet: Map<string, Array<{ row_data: Json }>>,
554    storeDataBySheet?: Map<string, Array<{ row_data: Json }>>,
555    aiContextSheets?: AIContextSheet[],
556    entitySheetStoreAggregates?: Map<string, Record<string, number>>,
557    metricMappings?: Record<string, string>
558  ): Record<string, number> {
559    // Step 1: Match entity-level sheet for this component
560    const entitySheets = Array.from(entityRowsBySheet.keys());
561    const entityMatch = findMatchingSheet(component.name, entitySheets, aiContextSheets);
562    let entityRows = entityMatch ? (entityRowsBySheet.get(entityMatch) || []) : [];
563
564    // OB-157: Semantic metric matching fallback — when name matching fails,
565    // find the sheet whose data columns best overlap the component's expected metrics.
566    // Korean Test: uses inferSemanticType (pattern-based), not field names.
567    if (entityRows.length === 0 && entitySheets.length > 0) {
568      const expectedTypes = getExpectedMetricNames(component)
569        .map(n => inferSemanticType(n))
570        .filter(t => t !== 'unknown');
571      if (expectedTypes.length > 0) {
572        let bestSheet: string | null = null;
573        let bestOverlap = 0;
574        for (const sheetName of entitySheets) {
575          const rows = entityRowsBySheet.get(sheetName) || [];
576          if (rows.length === 0) continue;
577          const rd = (rows[0].row_data && typeof rows[0].row_data === 'object' && !Array.isArray(rows[0].row_data))
578            ? rows[0].row_data as Record<string, unknown> : {};
579          const sheetTypes = new Set(
580            Object.keys(rd)
581              .filter(k => !k.startsWith('_'))
582              .map(k => inferSemanticType(k))
583              .filter(t => t !== 'unknown')
584          );
585          const overlap = expectedTypes.filter(t => sheetTypes.has(t)).length;
586          if (overlap > bestOverlap) {
587            bestOverlap = overlap;
588            bestSheet = sheetName;
589          }
590          ...
593        if (bestSheet) {
594          entityRows = entityRowsBySheet.get(bestSheet) || [];
595        }
```

(Body line 581 contains `startsWith('_')` against `Object.keys(rd)` — protected by the `Object.keys(rd)` shape guard at line 577. No bare `field.startsWith(...)` against possibly-undefined values inside this function.)

### 4.4 Elena Marchetti entity + committed_data

```
entities row keys: id,tenant_id,entity_type,status,external_id,display_name,profile_id,temporal_attributes,metadata,created_at,updated_at

Marchetti entities:
[
  {
    "id": "d42f8017-20bb-48da-852d-db1525dc6ba9",
    "tenant_id": "e44bbcb1-2710-4880-8c7d-a1bd902720b7",
    "entity_type": "individual",
    "status": "active",
    "external_id": "CRP-6006",
    "display_name": "Elena Marchetti",
    "metadata": {
      "role": "District Manager",
      "region": "SE",
      "status": "Active",
      "district": "SE-GS",
      "job_title": "District Manager",
      "department": "Sales"
    }
    ...
  }
]

committed_data for Elena Marchetti (entity_id=d42f8017-20bb-48da-852d-db1525dc6ba9): 1 rows
  data_type="entity" source_date=null keys=_rowIndex,_sheetName,department,district,employee_id,full_name,hire_date,job_title,region,reports_to,status
```

(Elena has exactly one committed_data row — the entity/roster row — and ZERO `data_type="transaction"` rows. The District Override Plan's `convergence_bindings.component_0` exists per Phase 2.1 but lists no roles (the Phase 2.1 dump showed `convergence_bindings keys: component_0` with no role detail).)

## Phase 5 — Plan 3 conditional_gate intent structure

### 5.1 Cross-Sell Bonus calculationIntent (current state on `main`)

```json
{
  "operation": "conditional_gate",
  "condition": {
    "left":  { "source": "metric",   "sourceSpec": { "field": "equipment_deal_count" } },
    "right": { "value": 1,           "source": "constant" },
    "operator": ">="
  },
  "onTrue": {
    "operation": "scalar_multiply",
    "rate": 50,
    "input": { "source": "metric", "sourceSpec": { "field": "cross_sell_count" } },
    "modifiers": [
      { "modifier": "cap", "maxValue": 1000 }
    ]
  },
  "onFalse": { "operation": "constant", "value": 0 }
}
```

```
expectedMetrics:   undefined  (no top-level expectedMetrics array on the component)
calculationMethod: undefined  (no legacy calculationMethod payload)
```

### 5.2 `executeConditionalGate` body — `web/src/lib/calculation/intent-executor.ts:312–334`

```typescript
312  function executeConditionalGate(
313    op: ConditionalGate,
314    data: EntityData,
315    inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
316    trace: Partial<ExecutionTrace>
317  ): Decimal {
318    const leftVal = resolveSource(op.condition.left, data, inputLog);
319    const rightVal = resolveSource(op.condition.right, data, inputLog);
320
321    let conditionMet = false;
322    switch (op.condition.operator) {
323      case '>=': conditionMet = leftVal.gte(rightVal); break;
324      case '>':  conditionMet = leftVal.gt(rightVal);  break;
325      case '<=': conditionMet = leftVal.lte(rightVal); break;
326      case '<':  conditionMet = leftVal.lt(rightVal);  break;
327      case '=':  // AI plan interpreter produces single-equals for equality
328      case '==': conditionMet = leftVal.eq(rightVal);  break;
329      case '!=': conditionMet = !leftVal.eq(rightVal); break;
330    }
331
332    const branch = conditionMet ? op.onTrue : op.onFalse;
333    return resolveValue(branch, data, inputLog, trace);
334  }
```

`grep -n "case 'conditional_gate'" web/src/lib/calculation/intent-executor.ts`:

```
496:    case 'conditional_gate':  return executeConditionalGate(op, data, inputLog, trace);
```

(`resolveSource` is the metric-name reader at intent-executor.ts:73-152 — `case 'metric'` at line 74-87 reads `data.metrics[field.startsWith('metric:') ? field.slice(7) : field]`. If `data.metrics['equipment_deal_count']` or `data.metrics['cross_sell_count']` is undefined, line 78 falls through to `?? 0`. Same for the onTrue branch's `cross_sell_count` lookup.)

### 5.3 `getExpectedMetricNames` body — `web/src/lib/calculation/run-calculation.ts:460–521`

```typescript
460  export function getExpectedMetricNames(component: PlanComponent): string[] {
461    const names = new Set<string>();
462    const intent = (component as unknown as Record<string, unknown>).calculationIntent as Record<string, unknown> | undefined;
463    if (!intent) return [];
464    visitNode(intent, names);
465    return Array.from(names);
466  }
467
468  function visitNode(node: unknown, names: Set<string>): void {
469    if (node === null || node === undefined) return;
470    if (typeof node !== 'object') return;
471
472    if (Array.isArray(node)) {
473      for (const child of node) visitNode(child, names);
474      return;
475    }
476
477    const obj = node as Record<string, unknown>;
478
479    // IntentSource of source='metric' — harvest field reference.
480    if (obj.source === 'metric' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
481      const spec = obj.sourceSpec as Record<string, unknown>;
482      if (typeof spec.field === 'string') {
483        names.add(spec.field.replace(/^metric:/, ''));
484      }
485      return;
486    }
487
488    // IntentSource of source='ratio' — harvest both operand field names.
489    if (obj.source === 'ratio' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
490      const spec = obj.sourceSpec as Record<string, unknown>;
491      if (typeof spec.numerator === 'string') {
492        names.add(spec.numerator.replace(/^metric:/, ''));
493      }
494      if (typeof spec.denominator === 'string') {
495        names.add(spec.denominator.replace(/^metric:/, ''));
496      }
497      return;
498    }
499
500    // IntentSource of source='aggregate' — harvest field (entity scope reads data.metrics).
501    if (obj.source === 'aggregate' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
502      const spec = obj.sourceSpec as Record<string, unknown>;
503      if (typeof spec.field === 'string') {
504        names.add(spec.field.replace(/^metric:/, ''));
505      }
506      return;
507    }
508
509    // IntentSource of other kinds (constant, entity_attribute, prior_component,
510    // cross_data, scope_aggregate) do not resolve via data.metrics — skip harvest
511    // but do not recurse into sourceSpec (they don't carry nested operations).
512    if (typeof obj.source === 'string') {
513      return;
514    }
515
516    // Generic node — could be an IntentOperation, modifier, route, or plain
517    // object with nested fields. Recurse into all values.
518    for (const value of Object.values(obj)) {
519      visitNode(value, names);
520    }
521  }
```

(For Cross-Sell intent above: `getExpectedMetricNames` walks the tree → harvests `equipment_deal_count` (condition.left) and `cross_sell_count` (onTrue.input). Returns `['equipment_deal_count', 'cross_sell_count']`.)

## Phase 6 — Plan 2 piecewise_linear intent and quota resolution

### 6.1 Consumables Commission Plan calculationIntent (current state on `main`)

The query returned 2 component entries (one per variant). Both have an identical intent shape:

```json
{
  "operation": "piecewise_linear",
  "segments": [
    { "min": 0,    "max": 0.9999, "rate": 0.03, "maxInclusive": true, "minInclusive": true },
    { "min": 1,    "max": 1.1999, "rate": 0.05, "maxInclusive": true, "minInclusive": true },
    { "min": 1.2,  "max": null,   "rate": 0.08, "maxInclusive": true, "minInclusive": true }
  ],
  "baseInput": {
    "source": "metric",
    "sourceSpec": { "field": "consumable_revenue" }
  },
  "ratioInput": {
    "source": "ratio",
    "sourceSpec": {
      "numerator":   "consumable_revenue",
      "denominator": "monthly_quota"
    }
  },
  "modifiers": [
    { "modifier": "cap", "maxValue": 5000 }
  ]
}
```

```
expectedMetrics: undefined
```

### 6.2 `executePiecewiseLinear` body — `web/src/lib/calculation/intent-executor.ts:535–566`

```typescript
535  function executePiecewiseLinear(
536    op: import('./intent-types').PiecewiseLinearOp,
537    data: EntityData,
538    inputLog: Record<string, { source: string; rawValue: unknown; resolvedValue: number }>,
539    trace: Partial<ExecutionTrace>
540  ): Decimal {
541    let ratio = toNumber(resolveValue(op.ratioInput, data, inputLog, trace));
542    const baseValue = resolveValue(op.baseInput, data, inputLog, trace);
543
544    // OB-186: If ratio resolved to 0 (missing denominator metric) and component
545    // has a targetValue (quota), compute attainment = baseValue / targetValue.
546    // This handles plans where quota is a plan parameter, not in transaction data.
547    if (ratio === 0 && op.targetValue && op.targetValue > 0 && toNumber(baseValue) > 0) {
548      ratio = toNumber(baseValue) / op.targetValue;
549      inputLog['piecewise_linear:targetValue'] = {
550        source: 'component_parameter',
551        rawValue: op.targetValue,
552        resolvedValue: ratio,
553      };
554    }
555
556    // Find the matching segment
557    for (const seg of op.segments) {
558      const inRange = ratio >= seg.min && (seg.max === null || ratio < seg.max);
559    if (inRange) {
560        return baseValue.mul(seg.rate);
561      }
562    }
563
564    // No segment matched — return zero
565    return ZERO;
566  }
```

`grep -n "case 'piecewise_linear'" web/src/lib/calculation/intent-executor.ts`:

```
503:    case 'piecewise_linear':  return executePiecewiseLinear(op, data, inputLog, trace);
```

### 6.3 `resolveSource` ratio branch — how `ratioInput` reads numerator and denominator

```typescript
 88      case 'ratio': {
 89        const numKey = src.sourceSpec.numerator.startsWith('metric:')
 90          ? src.sourceSpec.numerator.slice(7) : src.sourceSpec.numerator;
 91        const denKey = src.sourceSpec.denominator.startsWith('metric:')
 92          ? src.sourceSpec.denominator.slice(7) : src.sourceSpec.denominator;
 93        const num = toDecimal(data.metrics[numKey] ?? 0);
 94        const den = toDecimal(data.metrics[denKey] ?? 0);
 95        const val = den.isZero() ? ZERO : num.div(den);
 96        inputLog[`ratio(${numKey}/${denKey})`] = {
 97          source: 'ratio',
 98          rawValue: { numerator: toNumber(num), denominator: toNumber(den) },
 99          resolvedValue: toNumber(val),
100        };
101        return val;
102      }
```

(The `piecewise_linear` executor at line 541 calls `resolveValue(op.ratioInput, …)` which routes to `resolveSource` because `ratioInput.source === 'ratio'`. That case reads `data.metrics['consumable_revenue']` and `data.metrics['monthly_quota']`. If `monthly_quota` is undefined the ratio resolves to `ZERO` because `den.isZero()` at line 95.

Per Phase 3.1: CRP transaction data has no `monthly_quota` column. Per Phase 2.1: the Consumables `convergence_bindings.component_0.denominator → column=unit_price filters=[]` — convergence bound `monthly_quota` to `unit_price`. Per `resolveMetricsFromConvergenceBindings` ratio branch (HF-217/HF-224 quoted in earlier DIAG-047 §6.2, current state at route.ts ~1308-1357): the ratio branch writes `metrics[numMetricName]` and `metrics[denMetricName]` — i.e. `metrics['consumable_revenue']` and `metrics['monthly_quota']` — where `monthly_quota`'s value is the sum of `unit_price` across the entity's rows.

Per directive §6.3 question — `getExpectedMetricNames` on this intent harvests both metric names from the `ratio` source: `consumable_revenue`, `monthly_quota`. The ratio branch of `resolveMetricsFromConvergenceBindings` writes both metric keys; the `piecewise_linear` executor reads both via `resolveValue(op.ratioInput)` (which itself takes the ratio branch in `resolveSource`).)
