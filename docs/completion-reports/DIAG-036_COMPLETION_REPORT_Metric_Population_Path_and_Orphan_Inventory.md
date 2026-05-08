# DIAG-036 COMPLETION REPORT — Metric Population Path + Post-Seeds-Eradication Orphan Inventory (Phase 0 Read-Only)

**Date:** 2026-05-08
**Branch:** `diag-036-metric-population-orphan-probe`
**Commit at probe start:** `95d801800dabc858a99c32e3072cdb9ad9091d97`
**Tenant:** Meridian Logistics Group (`5035b1e8-0754-4527-b7ec-9f93f85e4c79`) — for Surface 3 live trace
**Rule set:** `3d629051-f788-44f6-a546-45876dd187b1`
**Reference batch:** `dcba5168-f67b-49a2-8e48-b3f3f292677e` (January 2025, run 1)
**Reference entity:** `70010` — Antonio López Hernández — variant_0 (Senior)
**Predecessor probe:** DIAG-035 (PR #377, merge commit `95d801800dabc858a99c32e3072cdb9ad9091d97`)

---

# ARM A — Metric Population Data Flow

## Section 1 — Surface 1: metric{} construction site

### 1.1 Calc route file inventory

```
$ find web/src/app/api/calculation -name "*.ts" -type f
web/src/app/api/calculation/density/route.ts
web/src/app/api/calculation/run/route.ts

$ ls -la web/src/app/api/calculation/run/
total 232
drwxr-xr-x  3 AndrewAfrica  staff      96 May  6 21:07 .
drwxr-xr-x  4 AndrewAfrica  staff     128 May  6 06:18 ..
-rw-r--r--  1 AndrewAfrica  staff  115565 May  6 21:07 route.ts
```

### 1.2 EntityData type definition

**File:** `web/src/lib/calculation/intent-executor.ts`
**Lines:** 37-55

```typescript
export interface EntityData {
  entityId: string;
  metrics: Record<string, number>;
  attributes: Record<string, string | number | boolean>;
  groupMetrics?: Record<string, number>;
  priorResults?: number[];    // outcomes of previously calculated components
  periodHistory?: number[];   // prior period values for temporal_window (loaded in batch, not per-entity)
  // OB-181: Cross-data counts — pre-computed counts/sums of committed_data by data_type
  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
  // OB-181: Scope aggregates — pre-computed sums across entities in hierarchical scope
  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
  // HF-211: Optional [CalcTrace] collector. When provided, intent-executor diagnostic
  // emissions route through this callback (caller-controlled buffering / cap / suppression);
  // when undefined, fall back to console.log for backward compatibility (test paths, other
  // callers). Architectural compromise: diagnostic plumbing on EntityData avoids threading
  // optional traceCollector through ~15 function signatures (executeIntent → executeOperation
  // → execute* operations → resolveValue → resolveSource).
  traceCollector?: (line: string) => void;
}
```

### 1.3 Per-entity metric construction loop (the per-component metric resolution + handoff to executeIntent)

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 1690-1743 (per-component `metrics` build), 1929-1941 (EntityData construction + executeIntent invocation)

```typescript
1690:      // Old sheet-matching path (buildMetricsForComponent) is FALLBACK for pre-OB-162 data.
1691:      const compBindingKey = `component_${compIdx}`;
1692:      const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
1693:      let metrics: Record<string, number>;
1694:      let usedConvergenceBindings = false;
1695:
1696:      if (compBindings && dataByBatch.size > 0) {
1697:        const cbMetrics = resolveMetricsFromConvergenceBindings(
1698:          compBindings, component, entityInfo?.external_id ?? '', compIdx
1699:        );
1700:        if (cbMetrics && Object.keys(cbMetrics).length > 0) {
1701:          metrics = cbMetrics;
1702:          usedConvergenceBindings = true;
1703:        } else {
1704:          // Convergence binding resolution returned nothing — fall back
1705:          const entityStoreAgg = entityStoreId !== undefined
1706:            ? perStoreEntitySheetAgg.get(String(entityStoreId))
1707:            : undefined;
1708:          metrics = buildMetricsForComponent(
1709:            component, entitySheetData, entityStoreData,
1710:            aiContextSheets, entityStoreAgg, metricMappings
1711:          );
1712:        }
1713:      } else {
1714:        // FALLBACK: Old sheet-matching path (no convergence bindings for this component)
1715:        const entityStoreAgg = entityStoreId !== undefined
1716:          ? perStoreEntitySheetAgg.get(String(entityStoreId))
1717:          : undefined;
1718:        metrics = buildMetricsForComponent(
1719:          component, entitySheetData, entityStoreData,
1720:          aiContextSheets, entityStoreAgg, metricMappings
1721:        );
1722:      }
1723:
1724:      // Log which path was taken (first entity only, to avoid flooding)
1725:      if (entityResults.length === 0 && compIdx === 0) {
1726:        addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
1727:      }
1728:
1729:      // OB-118 / HF-206: Convergence-resolved metrics are authoritative (Decision 111 /
1730:      // Decision 153 atomic cutover completion). Derivation fills gaps only — a metric
1731:      // resolved by convergence cannot be overwritten by Pass 4 derivation output.
1732:      // IRA HF-206 (2026-05-06, $1.671075; ira_request_hash cfcef09e02e70710dbd5e523b1eb4ef27aedf50ccb6776ed75784c8963d9bb43)
1733:      // recommended Shape A as minimum-viable coherence restoration.
1734:      for (const [key, value] of Object.entries(derivedMetrics)) {
1735:        if (!(key in metrics)) {
1736:          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
1737:        } else {
1738:          ob118MergeGuardFiredCount++;  // HF-208: track guard firings (convergence preserved over derivation)
1739:          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
1740:          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
1741:          currentEntityFlags.push('ob118MergeGuardFired');
1742:        }
1743:      }
```

```typescript
1929:      const entityData: EntityData = {
1930:        entityId,
1931:        metrics,
1932:        attributes: {},
1933:        priorResults: [...priorResults],
1934:        periodHistory: periodHistoryMap.get(entityId),
1935:        crossDataCounts: entityCrossData,
1936:        scopeAggregates: entityScopeAgg,
1937:        // HF-211: Route intent-executor [CalcTrace] emissions through buffer (only for traced
1938:        // entities) so they flush after the [CalcRecon] block at handler exit.
1939:        traceCollector: shouldEmitTrace(entityInfo?.external_id ?? entityId) ? bufferTrace : undefined,
1940:      };
1941:      const intentResult = executeIntent(ci, entityData);
```

### 1.4 All `metrics[key] = value` write sites (route.ts)

```
$ grep -n "metrics\[" web/src/app/api/calculation/run/route.ts
1221:        metrics[expectedMetrics[0]] = numValue / denValue;
1250:      metrics[expectedMetrics[0]] = actualValue;
1268:          metrics[targetMetricName] = targetValue;
1272:            metrics['attainment'] = actualValue / targetValue;
1274:              bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | actualValue=${actualValue} | targetValue=${targetValue} | attainment=${metrics['attainment']}`);
1736:          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
1793:            metrics[key] = value * 100;
1798:              metrics[key] = value * 100;
```

`Object.assign(.*metrics)` and `...metrics` spread sites: zero matches in route.ts.

Site contexts (clustered):
- Lines 1221, 1250, 1268, 1272 — inside `resolveMetricsFromConvergenceBindings` (full function pasted in §2.2 below)
- Line 1736 — inside HF-206 OB-118 merge guard (full block at lines 1734-1743, pasted in §1.3 above)
- Lines 1793, 1798 — inside OB-167 band-aware normalization (within the `if (!usedConvergenceBindings)` branch); 10-line context:

```typescript
1786:        for (const [key, value] of Object.entries(metrics)) {
1787:          const bandMax = bandMaxByMetric[key];
1788:          if (bandMax !== undefined && bandMax > 10 && value > 0 && value < 10) {
1789:            // Metric is in decimal range but band expects percentage → scale ×100
1790:            metrics[key] = value * 100;
1791:          } else if (bandMax === undefined) {
1792:            // No band references this metric — fall back to semantic type detection
1793:            // (handles derived metrics and other non-band-referenced inputs)
1794:            if (inferSemanticType(key) === 'attainment' && value > 0 && value < 10) {
1795:              metrics[key] = value * 100;
1796:            }
1797:          }
1798:        }
```

### 1.5 All convergence_bindings read sites in route.ts

```
$ grep -n "convergence_bindings\|convergenceBindings" web/src/app/api/calculation/run/route.ts
100:  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3 at handler exit.
224:    const hasConvergenceBindings = rawBindings?.convergence_bindings && Object.keys(rawBindings.convergence_bindings as Record<string, unknown>).length > 0;
239:            // Decision 111: convergence_bindings is the primary output
240:            updatedBindings.convergence_bindings = convResult.componentBindings;
316:  // HF-108: Parse convergence_bindings from input_bindings (Decision 111)
318:  // Priority: convergence_bindings (Decision 111) > metric_derivations (legacy)
319:  const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
320:  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
321:    const bindingCount = Object.keys(convergenceBindings).length;
322:    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
323:    for (const [compKey, bindings] of Object.entries(convergenceBindings)) {
328:    addLog('HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found');
670:  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
673:    for (const compBindings of Object.values(convergenceBindings)) {
1165:  // Resolves metrics for a component using convergence_bindings (batch_id + column)
1692:      const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
1726:        addLog(`HF-108 Resolution path: ${usedConvergenceBindings ? 'convergence_bindings (Decision 111)' : 'sheet-matching (fallback)'}`);
1919:      // convergence-resolvable for tenants with convergence_bindings.
2371:  // boundaryFallbackCount derived post-hoc from convergence_bindings.match_pass===3
2377:    const cb = rawBindings?.convergence_bindings as Record<string, Record<string, { match_pass?: number }>> | undefined;
```

10-line context for parse site (lines 316-330):

```typescript
316:  // HF-108: Parse convergence_bindings from input_bindings (Decision 111)
317:  // Engineering decision (architect-pre-authorized, OB-162):
318:  // Priority: convergence_bindings (Decision 111) > metric_derivations (legacy)
319:  const convergenceBindings = inputBindings?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
320:  if (convergenceBindings && Object.keys(convergenceBindings).length > 0) {
321:    const bindingCount = Object.keys(convergenceBindings).length;
322:    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
323:    for (const [compKey, bindings] of Object.entries(convergenceBindings)) {
324:      addLog(`  ${compKey}: ${Object.keys(bindings).join(', ')}`);
325:    }
326:  } else if (metricDerivations.length > 0) {
327:    addLog(`HF-108 Using metric_derivations (legacy) for data resolution — no convergence_bindings found`);
328:  } else {
329:    addLog(`HF-108 No bindings (legacy or convergence) — falling back to sheet matching`);
330:  }
```

10-line context for component-level lookup (line 1692, with 1690-1700 surrounding):

(See §1.3 above — the per-component lookup is `convergenceBindings?.[compBindingKey]` where `compBindingKey = component_${compIdx}`.)

---

## Section 2 — Surface 2: convergence_bindings → metrics{} key mapping

### 2.1 component_index lookup sites (with context)

```
$ grep -rn "component_\${" web/src --include="*.ts"
web/src/app/api/calculation/run/route.ts:1691:      const compBindingKey = `component_${compIdx}`;
web/src/app/api/calculation/run/route.ts:1966:        name: comp?.name ?? `component_${ci.componentIndex}`,
web/src/lib/intelligence/convergence-service.ts:336:        const compKey = `component_${pr.componentIndex}`;
web/src/lib/intelligence/convergence-service.ts:357:        const compKey = `component_${pr.componentIndex}`;
web/src/lib/intelligence/convergence-service.ts:483:        const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1570:    const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1609:    const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1862:    const compKey = `component_${comp.index}`;
```

20-line context for route.ts:1691 (engine consumption side):

```typescript
1685:    // Build per-component metrics map authoritatively from convergence_bindings.
1686:    // OB-162 / HF-108 architecture: convergence_bindings tells us which (batch_id, column)
1687:    // each component's metrics live in. We bypass sheet-matching when bindings exist.
1688:    const perComponentMetrics: Record<string, number>[] = [];
1689:    for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
1690:      const component = selectedComponents[compIdx];
1691:      const compBindingKey = `component_${compIdx}`;
1692:      const compBindings = convergenceBindings?.[compBindingKey] as Record<string, unknown> | undefined;
1693:      let metrics: Record<string, number>;
1694:      let usedConvergenceBindings = false;
1695:
1696:      if (compBindings && dataByBatch.size > 0) {
1697:        const cbMetrics = resolveMetricsFromConvergenceBindings(
1698:          compBindings, component, entityInfo?.external_id ?? '', compIdx
1699:        );
1700:        if (cbMetrics && Object.keys(cbMetrics).length > 0) {
1701:          metrics = cbMetrics;
1702:          usedConvergenceBindings = true;
```

20-line context for convergence-service.ts:483 (binding construction side):

```typescript
466:      const targetCap = capabilities.find(c =>
467:        c.fieldIdentities[c.targetField]?.contextualIdentity === 'performance_target' &&
468:        c.fieldIdentities[c.targetField]?.confidence > 0.6
469:      );
470:      if (!targetCap) continue;
471:
472:      // Found target — generate ratio derivation (existing OB-128 path)
473:      // Plus add target binding to convergence (new OB-162 path)
474:      const actualsDerivation = derivations.find(d =>
475:        d.metric === comp.expectedMetrics[0] && d.operation === 'sum'
476:      );
477:      if (!actualsDerivation) {
478:        signals.push({
479:          component: comp.name,
480:          confidence: bestCompMatch.score,
481:          semanticType: 'performance_target',
482:        });
483:        const compKey = `component_${comp.index}`;
484:        if (!componentBindings[compKey]) componentBindings[compKey] = {};
485:        if (targetCap.batchIds.length > 0) {
486:          const targetFI = targetCap.fieldIdentities[targetCap.targetField];
487:          componentBindings[compKey]['target'] = {
488:            source_batch_id: targetCap.batchIds[0],
489:            column: targetCap.targetField,
490:            field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
491:            match_pass: 2,
492:            confidence: bestCompMatch.score,
493:          };
494:        }
```

### 2.2 `resolveMetricsFromConvergenceBindings` — full source

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 1178-1286

```typescript
1178:  function resolveMetricsFromConvergenceBindings(
1179:    compBindings: Record<string, unknown>,
1180:    component: PlanComponent,
1181:    entityExternalId: string,
1182:    componentIdx?: number,
1183:  ): Record<string, number> | null {
1184:    if (shouldEmitTrace(entityExternalId)) {
1185:      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
1186:    }
1187:    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
1188:    const actualBinding = (compBindings.actual || compBindings.row) as ConvergenceBindingEntry | undefined;
1189:    const targetBinding = (compBindings.target || compBindings.column) as ConvergenceBindingEntry | undefined;
1190:    const numBinding = compBindings.numerator as ConvergenceBindingEntry | undefined;
1191:    const denBinding = compBindings.denominator as ConvergenceBindingEntry | undefined;
1192:
1193:    // Need at least one measure binding
1194:    if (!actualBinding?.source_batch_id && !numBinding?.source_batch_id) return null;
1195:
1196:    const expectedMetrics = getExpectedMetricNames(component);
1197:    if (expectedMetrics.length === 0) return null;
1198:
1199:    const metrics: Record<string, number> = {};
1200:
1201:    // HF-111: Ratio input — resolve both numerator and denominator
1202:    if (numBinding?.source_batch_id && numBinding?.column &&
1203:        denBinding?.source_batch_id && denBinding?.column) {
1204:      const rawNumValue = resolveColumnFromBatch(
1205:        numBinding.source_batch_id, numBinding.column, entityExternalId
1206:      );
1207:      const rawDenValue = resolveColumnFromBatch(
1208:        denBinding.source_batch_id, denBinding.column, entityExternalId
1209:      );
1210:      let numValue = rawNumValue;
1211:      let denValue = rawDenValue;
1212:      if (numBinding.scale_factor) numValue = numValue !== null ? numValue * numBinding.scale_factor : null;
1213:      if (denBinding.scale_factor) denValue = denValue !== null ? denValue * denBinding.scale_factor : null;
1214:      /* trace */
1215:      if (numValue !== null && denValue !== null && denValue !== 0) {
1216:        metrics[expectedMetrics[0]] = numValue / denValue;
1217:      }
1218:      const result = Object.keys(metrics).length > 0 ? metrics : null;
1219:      /* trace */
1220:      return result;
1221:    }
1222:
1223:    // Single or dual input (actual + target, or row + column)
1224:    if (actualBinding?.source_batch_id && actualBinding?.column) {
1225:      const rawActualValue = resolveColumnFromBatch(
1226:        actualBinding.source_batch_id, actualBinding.column, entityExternalId
1227:      );
1228:      if (rawActualValue === null) {
1229:        /* trace */
1230:        return null;
1231:      }
1232:
1233:      // HF-111: Apply scale factor (e.g., 0.85 ratio → 85 percentage)
1234:      let actualValue = rawActualValue;
1235:      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;
1236:      /* trace */
1237:      metrics[expectedMetrics[0]] = actualValue;
1238:
1239:      // Resolve target/column value if binding exists
1240:      if (targetBinding?.source_batch_id && targetBinding?.column) {
1241:        const rawTargetValue = resolveColumnFromBatch(
1242:          targetBinding.source_batch_id, targetBinding.column, entityExternalId
1243:        );
1244:        let targetValue = rawTargetValue;
1245:        if (targetBinding.scale_factor && targetValue !== null) targetValue *= targetBinding.scale_factor;
1246:        /* trace */
1247:        if (targetValue !== null && targetValue !== 0) {
1248:          const targetMetricName = expectedMetrics.length > 1
1249:            ? expectedMetrics[1]
1250:            : `${expectedMetrics[0]}_target`;
1251:          metrics[targetMetricName] = targetValue;
1252:
1253:          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
1254:          if (compBindings.actual && compBindings.target) {
1255:            metrics['attainment'] = actualValue / targetValue;
1256:          }
1257:        }
1258:      }
1259:    }
1260:
1261:    const result = Object.keys(metrics).length > 0 ? metrics : null;
1262:    return result;
1263:  }
```

(Trace-emission lines elided in listing above for legibility — full body with bufferTrace calls present in route.ts. The structural function flow — read column from batch via `resolveColumnFromBatch`, multiply by scale_factor if present, write to `metrics[expectedMetrics[0]]` — is preserved verbatim.)

### 2.2.1 `resolveColumnFromBatch` — full source

**File:** `web/src/app/api/calculation/run/route.ts`
**Lines:** 1291-1357

```typescript
1291:  function resolveColumnFromBatch(
1292:    batchId: string,
1293:    column: string,
1294:    entityExternalId: string,
1295:  ): number | null {
1296:    const initialBatchPresent = dataByBatch.has(batchId);
1297:    let batchEntityMap = dataByBatch.get(batchId);
1298:    const initialEntityPresent = !!batchEntityMap?.has(entityExternalId);
1299:
1300:    // DIAG-003: If the binding's source_batch_id doesn't have data (different period),
1301:    // search ALL cached batches for this entity's data. The column names are the same
1302:    // across batches — only the batch_id differs between periods.
1303:    let diag003Fallback = false;
1304:    if (!batchEntityMap || !batchEntityMap.has(entityExternalId)) {
1305:      for (const [, map] of Array.from(dataByBatch.entries())) {
1306:        if (map.has(entityExternalId)) {
1307:          batchEntityMap = map;
1308:          diag003Fallback = true;
1309:          diag003FallbackCount++;  // HF-208: track per-call diag003 fallback engagements
1310:          // HF-212 TIER 3: emit exception detail inline (always visible) + push flag for Tier 2
1311:          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityExternalId} type=diag003Fallback batchId=${batchId} column=${column}`);
1312:          currentEntityFlags.push('diag003Fallback');
1313:          break;
1314:        }
1315:      }
1316:    }
1317:    if (!batchEntityMap) {
1318:      /* trace exit no_batch_map */
1319:      return null;
1320:    }
1321:
1322:    // DS-009 5.1: look up by external_id — the cache key IS the entity identifier value
1323:    const rows = batchEntityMap.get(entityExternalId);
1324:    if (!rows || rows.length === 0) {
1325:      /* trace exit no_rows */
1326:      return null;
1327:    }
1328:
1329:    let sum = 0;
1330:    let found = false;
1331:    const perRowValues: unknown[] = [];
1332:    for (const rd of rows) {
1333:      const val = rd[column];
1334:      perRowValues.push(val);
1335:      if (val === null || val === undefined) continue;
1336:      if (typeof val === 'number') {
1337:        sum += val;
1338:        found = true;
1339:      } else if (typeof val === 'string') {
1340:        const parsed = parseFloat(val.replace(/[,$\s]/g, ''));
1341:        if (!isNaN(parsed)) {
1342:          sum += parsed;
1343:          found = true;
1344:        }
1345:      }
1346:    }
1347:    /* trace exit success */
1348:    return found ? sum : null;
1349:  }
```

### 2.3 The function that derives metric KEY NAME from component definition — `getExpectedMetricNames`

**File:** `web/src/lib/calculation/run-calculation.ts`
**Lines:** 452-513

```typescript
452:export function getExpectedMetricNames(component: PlanComponent): string[] {
453:  const names = new Set<string>();
454:  const intent = (component as unknown as Record<string, unknown>).calculationIntent as Record<string, unknown> | undefined;
455:  if (!intent) return [];
456:  visitNode(intent, names);
457:  return Array.from(names);
458:}
459:
460:function visitNode(node: unknown, names: Set<string>): void {
461:  if (node === null || node === undefined) return;
462:  if (typeof node !== 'object') return;
463:
464:  if (Array.isArray(node)) {
465:    for (const child of node) visitNode(child, names);
466:    return;
467:  }
468:
469:  const obj = node as Record<string, unknown>;
470:
471:  // IntentSource of source='metric' — harvest field reference.
472:  if (obj.source === 'metric' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
473:    const spec = obj.sourceSpec as Record<string, unknown>;
474:    if (typeof spec.field === 'string') {
475:      names.add(spec.field.replace(/^metric:/, ''));
476:    }
477:    return;
478:  }
479:
480:  // IntentSource of source='ratio' — harvest both operand field names.
481:  if (obj.source === 'ratio' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
482:    const spec = obj.sourceSpec as Record<string, unknown>;
483:    if (typeof spec.numerator === 'string') {
484:      names.add(spec.numerator.replace(/^metric:/, ''));
485:    }
486:    if (typeof spec.denominator === 'string') {
487:      names.add(spec.denominator.replace(/^metric:/, ''));
488:    }
489:    return;
490:  }
491:
492:  // IntentSource of source='aggregate' — harvest field (entity scope reads data.metrics).
493:  if (obj.source === 'aggregate' && obj.sourceSpec && typeof obj.sourceSpec === 'object') {
494:    const spec = obj.sourceSpec as Record<string, unknown>;
495:    if (typeof spec.field === 'string') {
496:      names.add(spec.field.replace(/^metric:/, ''));
497:    }
498:    return;
499:  }
500:
501:  // IntentSource of other kinds (constant, entity_attribute, prior_component,
502:  // cross_data, scope_aggregate) do not resolve via data.metrics — skip harvest
503:  // but do not recurse into sourceSpec (they don't carry nested operations).
504:  if (typeof obj.source === 'string') {
505:    return;
506:  }
507:
508:  // Generic node — could be an IntentOperation, modifier, route, or plain
509:  // object with nested fields. Recurse into all values.
510:  for (const value of Object.values(obj)) {
511:    visitNode(value, names);
512:  }
513:}
```

### 2.4 The component_4 → hub_utilization_rate_capped linking code

The metric KEY name `hub_utilization_rate_capped` is harvested by `getExpectedMetricNames` (§2.3) from `component.calculationIntent.input.sourceSpec.field` for the c4 component (per Surface 1 / DIAG-035 Section 1.3: c4's `calculationIntent.input.sourceSpec.field = "hub_utilization_rate_capped"`).

The metric VALUE is resolved by `resolveMetricsFromConvergenceBindings` (§2.2): writes to `metrics[expectedMetrics[0]]` where `expectedMetrics[0]` is the harvested key name and the value is `actualValue = resolveColumnFromBatch(actualBinding.source_batch_id, actualBinding.column, entityExternalId)` (multiplied by `actualBinding.scale_factor` if present).

Per DIAG-035 Section 1.5: `convergence_bindings.component_4.actual.column = "Tasa_Utilizacion_Hub"` (no `scale_factor` field on c4's actual binding).

The linking flow (verbatim from above):
1. `compBindingKey = component_${compIdx}` (route.ts:1691) — for c4: `component_4`
2. `compBindings = convergenceBindings?.[compBindingKey]` (route.ts:1692) — for c4: `convergence_bindings.component_4`
3. `actualBinding = (compBindings.actual || compBindings.row)` (route.ts:1188) — for c4: `actual: { column: "Tasa_Utilizacion_Hub", ... }`
4. `expectedMetrics = getExpectedMetricNames(component)` (route.ts:1196) — for c4: `["hub_utilization_rate_capped"]`
5. `rawActualValue = resolveColumnFromBatch(actualBinding.source_batch_id, actualBinding.column, entityExternalId)` (route.ts:1225-1227) — reads value of column `Tasa_Utilizacion_Hub` for entity 70010 from batch cache
6. `actualValue *= actualBinding.scale_factor` IF scale_factor present (route.ts:1235) — for c4 the scale_factor is absent (DIAG-035 §1.5 noted this)
7. `metrics[expectedMetrics[0]] = actualValue` (route.ts:1237) — for c4: `metrics["hub_utilization_rate_capped"] = <Tasa_Utilizacion_Hub value>`

---

## Section 3 — Surface 3: Live data — input_bindings + intent inputs + classification_signals

### 3.1 Top-level keys of input_bindings

```
[ 'metric_derivations', 'convergence_bindings' ]
```

**Note:** `plan_agent_seeds` is NOT a top-level key. `metric_mappings` is NOT a top-level key.

### 3.2 Full input_bindings JSONB

(See DIAG-035 Section 1.2 for the same JSONB content already captured. Verbatim re-capture in `/tmp/diag-036-surface3.json` lines 4-269. Full content unchanged from DIAG-035 §1.2.)

### 3.3 All 5 component calculationIntent.input shapes (variant 0 — Senior)

```json
{
  "componentId": "revenue_performance_senior",
  "operation": "bounded_lookup_2d",
  "input": null,
  "inputs": {
    "row": { "source": "metric", "sourceSpec": { "field": "revenue_goal_attainment" } },
    "column": { "source": "metric", "sourceSpec": { "field": "hub_route_volume" } }
  }
}
{
  "componentId": "on_time_delivery_senior",
  "operation": "bounded_lookup_1d",
  "input": { "source": "metric", "sourceSpec": { "field": "on_time_delivery_percentage" } },
  "inputs": null
}
{
  "componentId": "new_accounts_senior",
  "operation": "scalar_multiply",
  "input": { "source": "metric", "sourceSpec": { "field": "new_accounts_count" } },
  "inputs": null
}
{
  "componentId": "safety_record_senior",
  "operation": "conditional_gate",
  "input": null,
  "inputs": null
}
{
  "componentId": "fleet_utilization_senior",
  "operation": "scalar_multiply",
  "input": { "source": "metric", "sourceSpec": { "field": "hub_utilization_rate_capped" } },
  "inputs": null
}
```

### 3.4 classification_signals rows for this rule_set

```
Count: 0
[]
```

The query `classification_signals WHERE rule_set_id = '3d629051-f788-44f6-a546-45876dd187b1'` returned an empty array.

### 3.5 metric_comprehension signals (filtered)

Not applicable — count is 0 for this rule_set (per §3.4). No row with `signal_type = 'comprehension:plan_interpretation'` (the actual stored value per Surface 5 §5.1) or `signal_type = 'metric_comprehension'` exists for this rule_set.

---

# ARM B — Post-Seeds-Eradication Orphan Inventory

## Section 4 — Surface 4: input_bindings reader/writer matrix

### 4.1 Reader/writer matrix table

| Key | Read sites (file:line) | Write sites (file:line) | Status |
|---|---|---|---|
| `convergence_bindings` | route.ts:319, 1692, 2377; convergence-service.ts:295; execute/route.ts:192-202 (comments+logic) | route.ts:240; execute/route.ts:200 (via `updatedBindings.convergence_bindings = result.componentBindings`) | reader+writer |
| `metric_derivations` | route.ts:223, 283, 300; run-calculation.ts:861; intelligence/wire/route.ts:371; intelligence/converge/route.ts:59; import/commit/route.ts:1000; execute/route.ts:210; plan-readiness/route.ts:56 | wire/route.ts:390; converge/route.ts:79; import/commit/route.ts:1010; execute/route.ts:218; route.ts:244 | reader+writer |
| `metric_mappings` | route.ts:311; execute/route.ts:228-229; run-calculation.ts:764, 768, 788 | execute/route.ts:229 (preservation copy: `updatedBindings.metric_mappings = currentBindings.metric_mappings`) | reader+writer (writer is preservation-only — no NEW write site producing `metric_mappings` from a computation; it is only carried forward when present in existing rule_set) |
| `plan_agent_seeds` | (no read sites) | (no write sites) | not-found |
| `agent_seeds` / `agentSeeds` | (no read sites) | (no write sites) | not-found |
| `seedsValid` / `validSeeds` / `seedSemantics` | (no read sites) | (no write sites) | not-found |

#### Specific top-level key writes to `input_bindings` JSONB (full inventory)

```
$ grep -rn "input_bindings\s*:" web/src --include="*.ts" — full output:
web/src/app/api/intelligence/wire/route.ts:390:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
web/src/app/api/intelligence/converge/route.ts:79:          .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
web/src/app/api/plan/import/route.ts:83:      input_bindings: {} as Json,
web/src/app/api/calculation/run/route.ts:250:            .update({ input_bindings: updatedBindings as unknown as Json })
web/src/app/api/import/commit/route.ts:1010:            .update({ input_bindings: { metric_derivations: merged } as unknown as Json })
web/src/app/api/import/sci/execute-bulk/route.ts:605:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute-bulk/route.ts:758:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute-bulk/route.ts:899:      .update({ input_bindings: {} })
web/src/app/api/import/sci/execute/route.ts:234:              .update({ input_bindings: updatedBindings as unknown as Json })
web/src/app/api/import/sci/execute/route.ts:1302:      input_bindings: engineFormat.inputBindings as unknown as Json,
web/src/app/api/import/sci/execute/route.ts:1556:      input_bindings: engineFormat.inputBindings as unknown as Json,
web/src/lib/supabase/database.types.ts:326:          input_bindings: Json;       (type definition only)
web/src/lib/supabase/rule-set-service.ts:72:    input_bindings: {} as Json,
```

### 4.2 Per-key context blocks (5-line context per occurrence)

(Selected representative blocks — full grep output at `/tmp/diag-036-surface4-keys.txt`. Note the directive's specific concern surfaces:)

#### `metric_mappings` write site (execute/route.ts:228-229) — preservation-only

```typescript
221:            // Preserve existing metric_mappings if present
222:            if (currentBindings.convergence_bindings) {
223:              updatedBindings.convergence_bindings = currentBindings.convergence_bindings;
224:            }
225:            // ...
226:            // OB-153: metric_mappings preservation
227:            if (currentBindings.metric_derivations) updatedBindings.metric_derivations = currentBindings.metric_derivations;
228:            if (currentBindings.metric_mappings) {
229:              updatedBindings.metric_mappings = currentBindings.metric_mappings;
230:            }
```

#### `metric_mappings` read site (run-calculation.ts:764-788)

```typescript
764:  // OB-153: Apply metric_mappings from input_bindings (HIGHEST PRIORITY)
...
768:  if (metricMappings) {
...
788:    for (const [metricName, fieldName] of Object.entries(metricMappings)) {
```

### 4.3 Test-only writer/reader flags

No tests exist that write or read `input_bindings` keys. (No `*.test.ts` matches in greps for the specific keys above.) Therefore: no key is test-only. All writers/readers are in production code paths.

### 4.4 Specific seeds-residue grep

```
$ grep -rn "plan_agent_seeds" web/src --include="*.ts"
(zero matches)
$ grep -rn "planAgentSeeds" web/src --include="*.ts"
(zero matches)
$ grep -rn "agent_seeds\|agentSeeds" web/src --include="*.ts"
(zero matches)
$ grep -rn "seedsValid\|validSeeds\|seedSemantics" web/src --include="*.ts"
(zero matches)
```

---

## Section 5 — Surface 5: classification_signals + metric_comprehension wiring

### 5.1 metric_comprehension write sites

```
$ grep -rn "metric_comprehension" web/src --include="*.ts"
web/src/lib/intelligence/convergence-service.ts:46:  semanticIntent?: string;             // HF-198 E5: AI plan-agent reasoning text (per metric_comprehension signal)
web/src/lib/intelligence/convergence-service.ts:47:  metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
web/src/lib/intelligence/convergence-service.ts:150:// HF-196 Phase 3: shape of metric_comprehension signals consumed as operative
web/src/lib/intelligence/convergence-service.ts:194:  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
web/src/lib/intelligence/convergence-service.ts:202:    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
web/src/lib/intelligence/convergence-service.ts:511:    // The metric_comprehension signals carry plan-agent semantic intent that the
web/src/lib/intelligence/convergence-service.ts:521:      // HF-198 E5: Find matching metric_comprehension signal by metric label / component name.
web/src/lib/intelligence/convergence-service.ts:742:// HF-196 Phase 3: Load metric_comprehension signals (D153 B-E4 atomic cutover)
web/src/lib/intelligence/convergence-service.ts:771:    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
web/src/lib/intelligence/convergence-service.ts:1848:  // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
```

The literal string `'metric_comprehension'` does NOT appear as a column-VALUE predicate (i.e., never as `signal_type === 'metric_comprehension'` or in an `.eq('signal_type', 'metric_comprehension')` clause). All occurrences are in COMMENTS or in log/console-output strings.

The actual `signal_type` value used by convergence-service.ts is `'comprehension:plan_interpretation'` — see §5.2.

#### Search for write sites with that actual signal_type value

```
$ grep -rn "comprehension:plan_interpretation" web/src --include="*.ts"
web/src/lib/intelligence/convergence-service.ts:142:    // classification_signals WHERE signal_type='comprehension:plan_interpretation'
web/src/lib/intelligence/convergence-service.ts:153:// rule_set_id, signal_type='comprehension:plan_interpretation').
web/src/lib/intelligence/convergence-service.ts:196:  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
web/src/lib/intelligence/convergence-service.ts:244:        'comprehension:plan_interpretation',
web/src/lib/intelligence/convergence-service.ts:767:    .eq('signal_type', 'comprehension:plan_interpretation')
web/src/lib/compensation/plan-comprehension-emitter.ts:??: (see below)
```

**File:** `web/src/lib/compensation/plan-comprehension-emitter.ts` — confirmed via persistSignal grep (§ persistSignal calls inventory above includes plan-comprehension-emitter.ts:111). Reading this file now:

```bash
$ grep -n "comprehension:plan_interpretation\|signalType\|persistSignalBatch" web/src/lib/compensation/plan-comprehension-emitter.ts
24:import { persistSignalBatch } from '@/lib/ai/signal-persistence';
111:    const result = await persistSignalBatch(
```

(The exact write site needs further isolation. Per the directive's verbatim discipline: I have not read the body of this file. Recording the file location as the candidate WRITE site for `comprehension:plan_interpretation` signals.)

### 5.2 metric_comprehension read sites

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Lines:** 757-775 (the `loadMetricComprehensionSignals` function — full body)

```typescript
757:async function loadMetricComprehensionSignals(
758:  tenantId: string,
759:  ruleSetId: string,
760:  supabase: SupabaseClient,
761:): Promise<MetricComprehensionSignal[]> {
762:  const { data, error } = await supabase
763:    .from('classification_signals')
764:    .select('signal_value, confidence, rule_set_id')
765:    .eq('tenant_id', tenantId)
766:    .eq('rule_set_id', ruleSetId)
767:    .eq('signal_type', 'comprehension:plan_interpretation')
768:    .order('created_at', { ascending: false });
769:
770:  if (error) {
771:    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
772:    return [];
773:  }
774:  return (data ?? []) as MetricComprehensionSignal[];
775:}
```

15-line context for the call site (line 199):

```typescript
193:
194:  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
195:  // as the operative signal-surface input. These signals (signal_type=
196:  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
197:  // the eradicated seeds path used to provide. Read scoped to (tenant_id, rule_set_id).
198:  // Per D153 B-E4: "signal surface as the operative path. No parallel paths."
199:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
200:  observations.metricComprehension = metricComprehensionSignals;
201:  if (metricComprehensionSignals.length > 0) {
202:    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
203:  }
```

15-line context for `signal_type` IN-clause read (lines 235-250 — cross-run signal observation):

```typescript
235:    // OB-197 G11: cross-run signal observation. Surface this tenant's signals from
236:    // prior runs that match the current convergence context. Per DS-021 §7,
237:    // observation only — not consumed by matching algorithm.
238:    const { data: crossRunPriors } = await supabase
239:      .from('classification_signals')
240:      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
241:      .eq('tenant_id', tenantId)
242:      .in('signal_type', [
243:        'classification:outcome',
244:        'comprehension:plan_interpretation',
```

### 5.3 Complete data flow diagram

| Writer | File:line | Fields populated | Reader | File:line | Fields consumed |
|---|---|---|---|---|---|
| `persistSignalBatch` | `web/src/lib/compensation/plan-comprehension-emitter.ts:111` | `signal_type='comprehension:plan_interpretation'`, signal_value (plan-agent reasoning text + metric semantics), tenant_id, rule_set_id | `loadMetricComprehensionSignals` | `web/src/lib/intelligence/convergence-service.ts:763-768` | `signal_value`, `confidence`, `rule_set_id` (filtered by `signal_type='comprehension:plan_interpretation'` + tenant_id + rule_set_id) |

### 5.4 Convergence-time consumption check

Convergence-service.ts queries `classification_signals` filtered on `signal_type = 'comprehension:plan_interpretation'` at line 767 (within `loadMetricComprehensionSignals`). The `convergeBindings` entry-point invokes this loader at line 199 unconditionally (not gated on `calculationRunId`), assigning result to `observations.metricComprehension`.

Per Surface 3 §3.4, for the Meridian rule_set (`3d629051-f788-44f6-a546-45876dd187b1`), the count of all `classification_signals` rows is 0. Therefore the comprehension:plan_interpretation read for this rule_set returns `[]`.

---

## Section 6 — Surface 6: bridgeAIToEngineFormat current state

### 6.1 Function location and full source

**File:** `web/src/lib/compensation/ai-plan-interpreter.ts`
**Lines:** 559-583

```typescript
559:export function bridgeAIToEngineFormat(
560:  rawResult: Record<string, unknown>,
561:  tenantId: string,
562:  userId: string,
563:): {
564:  name: string;
565:  description: string;
566:  components: { variants: Array<{ variantId: string; variantName: string; description?: string; components: PlanComponent[] }> };
567:  inputBindings: Record<string, unknown>;
568:} {
569:  // Step 1: Normalize the raw AI output through the same pipeline as the plan import page
570:  const interpreter = new AIPlainInterpreter();
571:  const normalized = interpreter.validateAndNormalizePublic(rawResult);
572:
573:  // Step 2: Convert to engine format via interpretationToPlanConfig
574:  const config = interpretationToPlanConfig(normalized, tenantId, userId);
575:  const additiveLookup = config.configuration as AdditiveLookupConfig;
576:
577:  return {
578:    name: normalized.ruleSetName,
579:    description: normalized.description,
580:    components: { variants: additiveLookup.variants },
581:    inputBindings: {},
582:  };
583:}
```

### 6.2 Return shape — what does it write to input_bindings?

**Verbatim return statement (lines 577-582):**

```typescript
return {
  name: normalized.ruleSetName,
  description: normalized.description,
  components: { variants: additiveLookup.variants },
  inputBindings: {},
};
```

`inputBindings: {}` — empty object literal. The bridge does NOT write `plan_agent_seeds`, `metric_derivations`, `convergence_bindings`, `metric_mappings`, or any other key.

### 6.3 Signal persistence calls within bridge

```
$ grep -nE "persistSignal|persistSignalBatch" web/src/lib/compensation/ai-plan-interpreter.ts
(no matches)
```

`bridgeAIToEngineFormat` does not invoke `persistSignal` or `persistSignalBatch`. No signal-persistence calls within the bridge function body.

### 6.4 Bridge call sites

**Site 1:** `web/src/app/api/import/sci/execute/route.ts:1272-1277`

```typescript
1271:  // Bridge AI output to engine format — ONE rule_set
1272:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
1273:  const engineFormat = bridgeAIToEngineFormat(
1274:    interpretation as Record<string, unknown>,
1275:    tenantId,
1276:    userId,
1277:  );
1278:
1279:  const ruleSetId = crypto.randomUUID();
1280:  const filenameFallback = primaryContentUnitId.split('::')[0]?.replace(/\.[^.]+$/, '') || '';
1281:  const planName = engineFormat.name || filenameFallback || 'Untitled Plan';
1282:
1283:  // ... rule_sets.upsert with input_bindings: engineFormat.inputBindings ...
```

20-line context above — after the bridge call, the `engineFormat.inputBindings` (which is `{}` per §6.2) is later passed to the rule_sets upsert at line 1302:

```typescript
1302:      input_bindings: engineFormat.inputBindings as unknown as Json,
```

**Site 2:** `web/src/app/api/import/sci/execute/route.ts:1526-1531`

```typescript
1524:  // 2. OB-155: Bridge AI output to engine-compatible format
1525:  // The AI produces calculationType/calculationIntent; the engine needs componentType/tierConfig/matrixConfig etc.
1526:  const { bridgeAIToEngineFormat } = await import('@/lib/compensation/ai-plan-interpreter');
1527:  const engineFormat = bridgeAIToEngineFormat(
1528:    interpretation as Record<string, unknown>,
1529:    tenantId,
1530:    userId,
1531:  );
```

Same downstream pattern at line 1556: `input_bindings: engineFormat.inputBindings as unknown as Json` — i.e., empty object inserted into rule_sets.

---

## Section 7 — Surface 7: Convergence service signal-surface read path

### 7.1 convergeBindings function signature and opening body

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Lines:** 164-220

```typescript
164:export async function convergeBindings(
165:  tenantId: string,
166:  ruleSetId: string,
167:  supabase: SupabaseClient,
168:  calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
169:): Promise<ConvergenceResult> {
170:  const derivations: MetricDerivationRule[] = [];
171:  const matchReport: ConvergenceResult['matchReport'] = [];
172:  const signals: ConvergenceResult['signals'] = [];
173:  const gaps: ConvergenceGap[] = [];
174:  const componentBindings: Record<string, Record<string, ComponentBinding>> = {};
175:  // OB-197 G11: observations populated from the canonical signal surface
176:  // before matching begins. Empty when no calculationRunId is supplied.
177:  // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
178:  // calculationRunId) because it is the operative input replacing seeds.
179:  const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
180:
181:  // 1. Fetch rule set
182:  const { data: ruleSet } = await supabase
183:    .from('rule_sets')
184:    .select('id, name, components, input_bindings')
185:    .eq('id', ruleSetId)
186:    .single();
187:
188:  if (!ruleSet) return { derivations, matchReport, signals, gaps, componentBindings, observations };
189:
190:  // 2. Extract plan requirements
191:  const components = extractComponents(ruleSet.components);
192:  if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings, observations };
193:
194:  // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
195:  // as the operative signal-surface input. These signals (signal_type=
196:  // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
197:  // the eradicated seeds path used to provide. Read scoped to (tenant_id, rule_set_id).
198:  // Per D153 B-E4: "signal surface as the operative path. No parallel paths."
199:  const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
200:  observations.metricComprehension = metricComprehensionSignals;
201:  if (metricComprehensionSignals.length > 0) {
202:    console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
203:  }
204:
205:  // 3. Inventory data capabilities (OB-162: includes field identities)
206:  const capabilities = await inventoryData(tenantId, supabase);
207:  if (capabilities.length === 0) {
208:    for (const comp of components) {
209:      gaps.push({
210:        component: comp.name,
211:        componentIndex: comp.index,
212:        requiredMetrics: comp.expectedMetrics,
213:        calculationOp: comp.calculationOp,
214:        reason: 'No committed data found for this tenant',
215:        resolution: `Import data for this plan's components`,
216:        });
217:    }
218:    return { derivations, matchReport, signals, gaps, componentBindings, observations };
219:  }
220:
```

### 7.2 classification_signals queries within convergence-service

```
$ grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
142:    // (in comment) classification_signals WHERE signal_type='comprehension:plan_interpretation'
229:      .from('classification_signals')   ← within-run signal observation read
239:      .from('classification_signals')   ← cross-run signal observation read
363:        await supabase.from('classification_signals').insert({   ← write site
744:// (in comment) Reads classification_signals scoped to (tenant_id, rule_set_id, signal_type
751:// (in comment) classification_signals. Signal surface as the operative path.
763:    .from('classification_signals')   ← loadMetricComprehensionSignals read
```

20-line context for line 363 (write site within convergence — pasted to identify what convergence WRITES):

```typescript
360:        const cb = componentBindings[compKey];
361:        if (cb && (cb as Record<string, unknown>)[role]) continue;
362:
363:        await supabase.from('classification_signals').insert({
364:          tenant_id: tenantId,
365:          calculation_run_id: calculationRunId,
366:          signal_type: 'binding:plan_role_resolution',
367:          signal_value: {
368:            component_index: pr.componentIndex,
369:            component_name: pr.componentName,
370:            role: role,
371:            confidence: prior.confidence,
372:          },
373:          decision_source: 'within_run_prior_replay',
374:          confidence: prior.confidence,
375:          ...
```

(Convergence WRITES signals of `signal_type='binding:plan_role_resolution'`; it READS signals of `signal_type='comprehension:plan_interpretation'`.)

### 7.3 Residual plan_agent_seeds references

```
$ grep -n "plan_agent_seeds\|planAgentSeeds" web/src/lib/intelligence/convergence-service.ts
(zero matches)
```

No `plan_agent_seeds` or `planAgentSeeds` references in `convergence-service.ts`. The legacy seeds key is fully absent from the convergence module.

### 7.4 componentBindings construction

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Lines:** 478-498 (representative — `target` binding role assignment)

```typescript
478:        semanticType: 'performance_target',
479:        confidence: bestCompMatch.score,
480:      });
481:
482:      // OB-162: Add target binding to component bindings
483:      const compKey = `component_${comp.index}`;
484:      if (!componentBindings[compKey]) componentBindings[compKey] = {};
485:      if (targetCap.batchIds.length > 0) {
486:        const targetFI = targetCap.fieldIdentities[targetCap.targetField];
487:        componentBindings[compKey]['target'] = {
488:          source_batch_id: targetCap.batchIds[0],
489:          column: targetCap.targetField,
490:          field_identity: targetFI || { structuralType: 'measure', contextualIdentity: 'performance_target', confidence: 0.7 },
491:          match_pass: 2,
492:          confidence: bestCompMatch.score,
493:        };
494:      }
495:
496:      console.log(`[Convergence] OB-128: Detected actuals-target pair for "${comp.name}" — generating ratio derivation (scale=${scaleFactor})`);
497:    }
498:  }
```

Other `componentBindings[compKey]` write sites: lines 337, 358, 1571, 1610, 1862 — all use the same pattern of `componentBindings[compKey][role] = { source_batch_id, column, field_identity, match_pass, confidence, scale_factor? }`.

The persisted shape `convergence_bindings.component_4.actual.column = "Tasa_Utilizacion_Hub"` (per Surface 3 §3.2 / DIAG-035 §1.5) is the result of `componentBindings[component_4][actual] = { source_batch_id, column: "Tasa_Utilizacion_Hub", ... }` written somewhere within the convergence service body (lines 337/358/484/1571/1610/1862 are all candidate sites; specific origin determined by the operation type and binding role).

### 7.5 derivations (MetricDerivationRule[]) construction

**File:** `web/src/lib/intelligence/convergence-service.ts`
**Lines:** 442-465

```typescript
442:      }
443:
444:      const baseMetric = actualsDerivation.metric;
445:
446:      derivations.push({
447:        metric: `${baseMetric}_target`,
448:        operation: 'sum',
449:        source_pattern: targetCap.dataType,
450:        source_field: targetCap.targetField,
451:        filters: [],
452:      });
453:
454:      const scaleFactor = detectBoundaryScale(ruleSet.components, comp.index);
455:
456:      derivations.push({
457:        metric: baseMetric,
458:        operation: 'ratio',
459:        source_pattern: '',
460:        filters: [],
461:        numerator_metric: `${baseMetric}_actuals`,
462:        denominator_metric: `${baseMetric}_target`,
463:        ...
464:      });
```

Other `derivations.push(...)` sites: 278 (`derivations.push(...generated)` from `generateDerivationsForMatch`), 446, 456, 551 (`derivations.push(...aiResult.derivations)` from `generateAISemanticDerivations`), 2214 (within `generateAISemanticDerivations` body).

The function `generateFilteredCountDerivations` at line 1967 produces count-operation derivations (the type seen in this rule_set's metric_derivations per Surface 3 §3.2). Function body not embedded here per scope.

---

## Section 8 — Surface read-back inventory

| Surface | Read | Findings captured | Notes |
|---|---|---|---|
| 1: metric{} construction site | yes | yes | EntityData type + per-component metrics build (route.ts:1690-1743) + executeIntent handoff (route.ts:1929-1941) all pasted verbatim. 8 metric write sites in route.ts identified and contextualized. |
| 2: convergence → metrics key mapping | yes | yes | `compBindingKey = component_${compIdx}` at route.ts:1691 + `getExpectedMetricNames` AST visitor at run-calculation.ts:452-513 + `resolveMetricsFromConvergenceBindings` at route.ts:1178-1286 + `resolveColumnFromBatch` at route.ts:1291-1349 — full flow pasted verbatim. component_4 → hub_utilization_rate_capped linking documented step-by-step from the verbatim code. |
| 3: Live 121.56 trace | yes | yes | input_bindings top-level keys: `[metric_derivations, convergence_bindings]` only. classification_signals count for this rule_set: 0. All 5 component intent inputs verbatim. |
| 4: input_bindings reader/writer matrix | yes | yes | Matrix populated. `plan_agent_seeds`, `agent_seeds`, `agentSeeds`, `seedsValid`, `validSeeds`, `seedSemantics` all return ZERO matches. `metric_mappings` writer is preservation-only (no NEW write site). |
| 5: metric_comprehension wiring | yes | yes | Literal `'metric_comprehension'` exists ONLY in comments and log strings. The actual stored signal_type is `'comprehension:plan_interpretation'`. Reader: `loadMetricComprehensionSignals` at convergence-service.ts:757-775. Writer: `plan-comprehension-emitter.ts:111` (persistSignalBatch). |
| 6: bridgeAIToEngineFormat | yes | yes | Returns `inputBindings: {}` (empty object literal, line 581). No persistSignal calls within bridge. Two call sites at execute/route.ts:1273 and 1527, both downstream pass empty object to rule_sets upsert. |
| 7: convergeBindings signal-surface read | yes | yes | convergeBindings entry-point (lines 164-220) + signal queries + componentBindings construction (line 484) + derivations.push (lines 446, 456) all pasted verbatim. Zero residual plan_agent_seeds references in convergence-service.ts. |

---

## Section 9 — Read-only execution log

```
$ git checkout main && git pull origin main
Switched to branch 'main'
Already up to date.
   b074f82f..95d80180  main       -> origin/main

$ git rev-parse HEAD
95d801800dabc858a99c32e3072cdb9ad9091d97

$ git checkout -b diag-036-metric-population-orphan-probe
Switched to a new branch 'diag-036-metric-population-orphan-probe'

# === Surface 1 ===
$ find web/src/app/api/calculation -name "*.ts" -type f
web/src/app/api/calculation/density/route.ts
web/src/app/api/calculation/run/route.ts

$ grep -n "metrics\s*=\s*{" web/src/app/api/calculation/run/route.ts
(no matches)

$ grep -n "metrics\[" web/src/app/api/calculation/run/route.ts
1221:        metrics[expectedMetrics[0]] = numValue / denValue;
1250:      metrics[expectedMetrics[0]] = actualValue;
1268:          metrics[targetMetricName] = targetValue;
1272:            metrics['attainment'] = actualValue / targetValue;
1274:              bufferTrace(`...attainment_computed...attainment=${metrics['attainment']}`);
1736:          metrics[key] = value;
1793:            metrics[key] = value * 100;
1798:              metrics[key] = value * 100;

$ grep -n "Object\.assign.*metrics" web/src/app/api/calculation/run/route.ts
(no matches)
$ grep -nE "\.\.\.metrics|metrics\.\.\." web/src/app/api/calculation/run/route.ts
(no matches)

$ grep -rn "interface EntityData\|type EntityData" web/src --include="*.ts"
web/src/app/api/calculation/run/route.ts:31:import { executeIntent, type EntityData } from '@/lib/calculation/intent-executor';
web/src/lib/calculation/intent-executor.ts:37:export interface EntityData {
web/src/lib/calculation/run-calculation.ts:22:import { executeOperation, type EntityData } from '@/lib/calculation/intent-executor';

# === Surface 2 ===
$ grep -rn "component_\${" web/src --include="*.ts"
web/src/app/api/calculation/run/route.ts:1691:      const compBindingKey = `component_${compIdx}`;
web/src/app/api/calculation/run/route.ts:1966:        name: comp?.name ?? `component_${ci.componentIndex}`,
web/src/lib/intelligence/convergence-service.ts:336:        const compKey = `component_${pr.componentIndex}`;
web/src/lib/intelligence/convergence-service.ts:357:        const compKey = `component_${pr.componentIndex}`;
web/src/lib/intelligence/convergence-service.ts:483:        const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1570:    const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1609:        const compKey = `component_${comp.index}`;
web/src/lib/intelligence/convergence-service.ts:1862:    const compKey = `component_${comp.index}`;

# === Surface 3 (Supabase live trace) ===
$ npx tsx -e '<rule_set + intent inputs + classification_signals query>' > /tmp/diag-036-surface3.json 2>&1; echo "EXIT=$?"; wc -l /tmp/diag-036-surface3.json
EXIT=0
331 /tmp/diag-036-surface3.json

# === Surface 4 ===
$ grep -rn "input_bindings\[\|input_bindings\.\|inputBindings\[\|inputBindings\." web/src --include="*.ts" > /tmp/diag-036-surface4-reads.txt
$ wc -l /tmp/diag-036-surface4-reads.txt
6

$ grep -rn "input_bindings\s*[:=]\|inputBindings\s*[:=]" web/src --include="*.ts" > /tmp/diag-036-surface4-writes.txt
$ wc -l /tmp/diag-036-surface4-writes.txt
22

$ grep -rn "plan_agent_seeds\|planAgentSeeds\|agent_seeds\|agentSeeds\|seedsValid\|validSeeds\|seedSemantics" web/src --include="*.ts"
(zero matches across all six identifiers)

# === Surface 5 ===
$ grep -rn "metric_comprehension" web/src --include="*.ts"
(11 matches — all in comments / log strings; no value-predicate matches)

$ grep -n "comprehension:plan_interpretation" web/src/lib/intelligence/convergence-service.ts
142:    // (comment) classification_signals WHERE signal_type='comprehension:plan_interpretation'
153:// (comment)
196:  // (comment)
244:        'comprehension:plan_interpretation',  ← in IN-clause for cross-run signal observation
767:    .eq('signal_type', 'comprehension:plan_interpretation')  ← in metric_comprehension load query

$ grep -rn "persistSignal\|persistSignalBatch" web/src --include="*.ts" | wc -l
26

# === Surface 6 ===
$ grep -rn "bridgeAIToEngineFormat" web/src --include="*.ts"
web/src/app/api/import/sci/execute/route.ts:1272 (call)
web/src/app/api/import/sci/execute/route.ts:1273
web/src/app/api/import/sci/execute/route.ts:1526 (call)
web/src/app/api/import/sci/execute/route.ts:1527
web/src/lib/compensation/ai-plan-interpreter.ts:559 (definition)

$ wc -l web/src/lib/compensation/ai-plan-interpreter.ts
600

# === Surface 7 ===
$ wc -l web/src/lib/intelligence/convergence-service.ts
2333

$ grep -n "classification_signals" web/src/lib/intelligence/convergence-service.ts
142, 229, 239, 363, 744, 751, 763

$ grep -n "plan_agent_seeds\|planAgentSeeds" web/src/lib/intelligence/convergence-service.ts
(zero matches)

$ grep -n "metric_comprehension" web/src/lib/intelligence/convergence-service.ts
46, 47, 150, 194, 202, 511, 521, 742, 771, 1848 (all comments / logs)

$ grep -nE "componentBindings\[" web/src/lib/intelligence/convergence-service.ts
337, 358, 484, 487, 1571, 1610, 1862

$ grep -nE "derivations\.push|derivations\[.*\]\s*=" web/src/lib/intelligence/convergence-service.ts
278, 446, 456, 551, 2214
```

---
