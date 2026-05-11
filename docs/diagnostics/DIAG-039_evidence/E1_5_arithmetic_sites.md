# E1.5 — Arithmetic site inventory (verbatim)

Lines where an arithmetic operator (`*`, `/`, `+`, `-`, `Math.*`) appears AND the line mentions any of: `c4`, `fleet`, `utilization`, `component`, `value`, `actual`, `expected`, `rate`, `amount`, `total`, `result` (case-insensitive). Files scanned: route.ts + 14 E1.4 source files.

**Command:**
```bash
grep -nHE "[*/+-]|Math\\." <files> | grep -iE "c4|fleet|utilization|component|\\bvalue\\b|actual|expected|\\brate\\b|\\bamount\\b|\\btotal\\b|\\bresult\\b"
```

**Output (218 lines verbatim):**
```
web/src/app/api/calculation/run/route.ts:7: * this proves the actual engine logic, not a reimplementation.
web/src/app/api/calculation/run/route.ts:12:// OB-150: Production timeout fix (processes all entities × components)
web/src/app/api/calculation/run/route.ts:32:import type { ComponentIntent, RoundingTrace } from '@/lib/calculation/intent-types';
web/src/app/api/calculation/run/route.ts:33:import type { PlanComponent } from '@/types/compensation-plan';
web/src/app/api/calculation/run/route.ts:34:import { toNumber, roundComponentOutput, inferOutputPrecision, ZERO } from '@/lib/calculation/decimal-precision';
web/src/app/api/calculation/run/route.ts:135:  // HF-211: Per-component totals accumulator — sum of rounded outcomes per component index.
web/src/app/api/calculation/run/route.ts:136:  // Populated at component_complete site UNCONDITIONALLY (every entity, every component);
web/src/app/api/calculation/run/route.ts:137:  // surfaced in [CalcRecon] block per-component breakdown for direct ground-truth reconciliation.
web/src/app/api/calculation/run/route.ts:188:  // Parse components from JSONB — handle 3 formats:
web/src/app/api/calculation/run/route.ts:190:  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
web/src/app/api/calculation/run/route.ts:191:  // 3. Legacy nested: { variants: [{ components: [...] }] }
web/src/app/api/calculation/run/route.ts:200:      // OB-153: Wrapped object format { components: [...] }
web/src/app/api/calculation/run/route.ts:203:      // Legacy nested format: { variants: [{ components: [...] }] }
web/src/app/api/calculation/run/route.ts:265:          addLog(`HF-165: Convergence complete — ${derivationCount} derivations, ${bindingCount} component bindings, ${gapCount} gaps`);
web/src/app/api/calculation/run/route.ts:269:            addLog(`HF-165 Gap: ${gap.component} — ${gap.reason}`);
web/src/app/api/calculation/run/route.ts:311:  // Maps semantic metric names (in components) to raw field names (in row_data)
web/src/app/api/calculation/run/route.ts:318:  // Per-component bindings: { component_N: { actual: { source_batch_id, column, ... }, ... } }
web/src/app/api/calculation/run/route.ts:323:    addLog(`HF-108 Using convergence_bindings (Decision 111) for data resolution — ${bindingCount} component bindings`);
web/src/app/api/calculation/run/route.ts:334:  // ── OB-76: Transform components to intents (once, before entity loop) ──
web/src/app/api/calculation/run/route.ts:336:  addLog(`OB-76 Intent layer: ${componentIntents.length} components transformed to intents`);
web/src/app/api/calculation/run/route.ts:582:  // Korean Test: discovers by VALUE matching (entity external_ids), not by field name
web/src/app/api/calculation/run/route.ts:669:  // Key is the VALUE of row_data[entity_identifier_column], NOT the entity_id FK UUID
web/src/app/api/calculation/run/route.ts:680:      // HF-111: Index ALL binding role batches (actual, target, row, column, numerator, denominator)
web/src/app/api/calculation/run/route.ts:692:    // Step 2: Index committed_data by row_data[entity_column] value (DS-009 pattern)
web/src/app/api/calculation/run/route.ts:989:            existing[key] = (existing[key] ?? 0) + value;
web/src/app/api/calculation/run/route.ts:998:  // Korean Test: PASSES — AI determined sheet→component mapping at import time
web/src/app/api/calculation/run/route.ts:1071:  // Generate pattern signatures and initialize density for each component
web/src/app/api/calculation/run/route.ts:1166:  // Resolves metrics for a component using convergence_bindings (batch_id + column)
web/src/app/api/calculation/run/route.ts:1186:      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:entry entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} componentName=${JSON.stringify(component.name)} | compBindingsKeys=${Object.keys(compBindings).join(',')}`);
web/src/app/api/calculation/run/route.ts:1188:    // HF-111: Support multiple binding roles — actual, row, column, numerator, denominator
web/src/app/api/calculation/run/route.ts:1218:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=ratio | rawNum=${rawNumValue} | numScale=${numBinding.scale_factor ?? 'undefined'} | postNum=${numValue} | rawDen=${rawDenValue} | denScale=${denBinding.scale_factor ?? 'undefined'} | postDen=${denValue}`);
web/src/app/api/calculation/run/route.ts:1222:        metrics[expectedMetrics[0]] = numValue / denValue;
web/src/app/api/calculation/run/route.ts:1226:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=ratio | metrics=${JSON.stringify(metrics)} | returnedNull=${result === null}`);
web/src/app/api/calculation/run/route.ts:1231:    // Single or dual input (actual + target, or row + column)
web/src/app/api/calculation/run/route.ts:1238:          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_actual_null | returnedNull=true`);
web/src/app/api/calculation/run/route.ts:1245:      if (actualBinding.scale_factor) actualValue *= actualBinding.scale_factor;
web/src/app/api/calculation/run/route.ts:1248:        bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=actual | rawActual=${rawActualValue} | actualScale=${actualBinding.scale_factor ?? 'undefined'} | postActual=${actualValue} | metricKey=${expectedMetrics[0]}`);
web/src/app/api/calculation/run/route.ts:1253:      // Resolve target/column value if binding exists
web/src/app/api/calculation/run/route.ts:1262:          bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:scale_applied entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | slot=target | rawTarget=${rawTargetValue} | targetScale=${targetBinding.scale_factor ?? 'undefined'} | postTarget=${targetValue}`);
web/src/app/api/calculation/run/route.ts:1271:          // Only compute attainment for actual+target pairs, NOT row+column 2D lookups
web/src/app/api/calculation/run/route.ts:1273:            metrics['attainment'] = actualValue / targetValue;
web/src/app/api/calculation/run/route.ts:1275:              bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:attainment_computed entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | actualValue=${actualValue} | targetValue=${targetValue} | attainment=${metrics['attainment']}`);
web/src/app/api/calculation/run/route.ts:1284:      bufferTrace(`[CalcTrace] resolveMetricsFromConvergenceBindings:exit entity=${entityExternalId} componentIdx=${componentIdx ?? 'n/a'} | path=single_or_dual | metrics=${JSON.stringify(result)} | returnedNull=${result === null}`);
web/src/app/api/calculation/run/route.ts:1289:  // HF-109: Resolve a single column value for an entity from the batch data cache (DS-009 5.1).
web/src/app/api/calculation/run/route.ts:1325:    // DS-009 5.1: look up by external_id — the cache key IS the entity identifier value
web/src/app/api/calculation/run/route.ts:1527:  addLog(`[CalcRecon-T1] entitiesAssigned=${calculationEntityIds.length} components=${defaultComponents.length}`);
web/src/app/api/calculation/run/route.ts:1529:  addLog(`[CalcRecon-T1] componentList=[${t1ComponentNames}]`);
web/src/app/api/calculation/run/route.ts:1538:    // HF-212: Per-entity component breakdown. Cleared per iteration.
web/src/app/api/calculation/run/route.ts:1539:    // Populated at component_complete site (per-component); consumed at Tier 2 emission.
web/src/app/api/calculation/run/route.ts:1592:        // Tie on discriminants — try total overlap
web/src/app/api/calculation/run/route.ts:1686:    for (let compIdx = 0; compIdx < selectedComponents.length; compIdx++) {
web/src/app/api/calculation/run/route.ts:1691:      // Old sheet-matching path (buildMetricsForComponent) is FALLBACK for pre-OB-162 data.
web/src/app/api/calculation/run/route.ts:1715:        // FALLBACK: Old sheet-matching path (no convergence bindings for this component)
web/src/app/api/calculation/run/route.ts:1737:          metrics[key] = value;  // derivation fills gaps only; convergence values preserved
web/src/app/api/calculation/run/route.ts:1741:          addLog(`[CalcRecon-T3] EXCEPTION entity=${entityInfo?.external_id ?? entityId} component=${compIdx} type=ob118MergeGuardFired existingKey=${key} preserved=convergence`);
web/src/app/api/calculation/run/route.ts:1746:      // Compare metric values against the component's band ranges (from the plan spec).
web/src/app/api/calculation/run/route.ts:1747:      // If value is in decimal range (0-2) but the band expects percentage range (max > 10),
web/src/app/api/calculation/run/route.ts:1794:            metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:1799:              metrics[key] = value * 100;
web/src/app/api/calculation/run/route.ts:1806:      // HF-122: Per-component rounding (Decision 122).
web/src/app/api/calculation/run/route.ts:1823:    // HF-188: Legacy total preserved for concordance comparison only
web/src/app/api/calculation/run/route.ts:1827:    // HF-119: Use selected variant's intents, not always defaultComponents
web/src/app/api/calculation/run/route.ts:1917:      // cutover completion). Per-component metrics map MUST be populated; fail fast
web/src/app/api/calculation/run/route.ts:1918:      // if not (rather than silently falling back to seeds-era raw-row-value map).
web/src/app/api/calculation/run/route.ts:1924:          `HF-205 invariant: per-component metrics missing for component ${ci.componentIndex} ` +
web/src/app/api/calculation/run/route.ts:1926:          `must populate metrics for every component before intent-executor handoff. ` +
web/src/app/api/calculation/run/route.ts:1954:      // Override componentResults payout with intent-authority value
web/src/app/api/calculation/run/route.ts:1963:      // HF-211: Accumulate per-component total UNCONDITIONALLY (every entity, every component).
web/src/app/api/calculation/run/route.ts:1964:      // Source for [CalcRecon] block per-component breakdown — independent of trace cap.
web/src/app/api/calculation/run/route.ts:1968:        total: (_existingCompTotal?.total ?? 0) + (Number(roundedValue) || 0),
web/src/app/api/calculation/run/route.ts:1971:      // HF-212 TIER 2: Per-entity component breakdown — accumulate THIS entity's
web/src/app/api/calculation/run/route.ts:1972:      // per-component totals for the Tier 2 summary line emitted after the per-entity total.
web/src/app/api/calculation/run/route.ts:1975:        (perEntityComponentBreakdown.get(ci.componentIndex) ?? 0) + (Number(roundedValue) || 0),
web/src/app/api/calculation/run/route.ts:1995:    // ── SYNAPTIC: Write per-component confidence synapses ──
web/src/app/api/calculation/run/route.ts:1996:    for (let ci = 0; ci < componentIntents.length; ci++) {
web/src/app/api/calculation/run/route.ts:1997:      const compMatch = componentResults[ci] && Math.abs(componentResults[ci].payout - (priorResults[ci] ?? 0)) < 0.01;
web/src/app/api/calculation/run/route.ts:2063:      addLog(`[CalcRecon-T2] ${t2ExternalId} | ${t2EntityName} | variant=${variantKey} | total=${entityTotal} | components=[${t2Breakdown}] | flags=[${currentEntityFlags.join(',')}]`);
web/src/app/api/calculation/run/route.ts:2158:      console.warn('[CalcAPI] Dual-path concordance signal unexpected error:', err instanceof Error ? err.message : String(err));
web/src/app/api/calculation/run/route.ts:2366:  // ── OB-83: Domain Agent dispatch — score result through IAP ──
web/src/app/api/calculation/run/route.ts:2368:  const avgConfidence = concordanceRate / 100; // concordance rate as 0-1 confidence
web/src/app/api/calculation/run/route.ts:2372:    null, // actual results are in the response body below
web/src/app/api/calculation/run/route.ts:2395:            addLog(`[CalcRecon-T3] EXCEPTION component=${compKey} role=${role} type=boundaryFallback`);
web/src/app/api/calculation/run/route.ts:2403:  const t1FooterTotalLookups = entityResults.length * (((ruleSet.components as unknown[]) ?? []).length);
web/src/app/api/calculation/run/route.ts:2406:  const t1SortedComponents = Array.from(componentTotals.entries()).sort((a, b) => a[0] - b[0]);
web/src/app/api/calculation/run/route.ts:2408:  addLog(`[CalcRecon-T1] componentTotals=[${t1ComponentSummary}]`);
web/src/lib/calculation/run-calculation.ts:17:import type { PlanComponent } from '@/types/compensation-plan';
web/src/lib/calculation/run-calculation.ts:24:import { toNumber, roundComponentOutput, inferOutputPrecision } from '@/lib/calculation/decimal-precision';
web/src/lib/calculation/run-calculation.ts:75:  scale_factor?: number;       // multiply ratio result (e.g., 100 for percentage)
web/src/lib/calculation/run-calculation.ts:88: * @returns Map of derived metric name → numeric value
web/src/lib/calculation/run-calculation.ts:147:        if (typeof val === 'number') total += val;
web/src/lib/calculation/run-calculation.ts:224:// Legacy component evaluators (evaluateTierLookup, evaluatePercentage,
web/src/lib/calculation/run-calculation.ts:252:  // Post-Phase-1.7, ComponentType union admits foundational identifiers only — legacy
web/src/lib/calculation/run-calculation.ts:272:        `[run-calculation] Unreachable componentType reached evaluateComponent: ` +
web/src/lib/calculation/run-calculation.ts:273:        `"${component.componentType as string}" (componentId=${component.id}, ` +
web/src/lib/calculation/run-calculation.ts:274:        `componentName=${component.name}). Foundational ComponentType union admits ` +
web/src/lib/calculation/run-calculation.ts:282:  // and the component has an AI-produced calculationIntent, attempt evaluation
web/src/lib/calculation/run-calculation.ts:291:      // operations (rate × volume), but the executor only handles nested IntentOperations.
web/src/lib/calculation/run-calculation.ts:293:      //         → scalar_multiply{input: volume, rate: bounded_lookup_1d}
web/src/lib/calculation/run-calculation.ts:306:      // OB-120: Auto-detect isMarginal for bounded_lookup_1d with rate-like outputs.
web/src/lib/calculation/run-calculation.ts:307:      // Mirrors OB-117 rate heuristic in evaluateTierLookup: if all non-zero outputs
web/src/lib/calculation/run-calculation.ts:308:      // are < 1.0, they represent rates to multiply against the input value.
web/src/lib/calculation/run-calculation.ts:371:        result[key] = (result[key] || 0) + value;
web/src/lib/calculation/run-calculation.ts:390: * Find which sheet (data_type) feeds a given plan component.
web/src/lib/calculation/run-calculation.ts:404:      componentName, // componentId = componentName for matching
web/src/lib/calculation/run-calculation.ts:413:  const normComponent = componentName.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/calculation/run-calculation.ts:431: * Get all metric names a component expects from its configuration.
web/src/lib/calculation/run-calculation.ts:501:  // IntentSource of other kinds (constant, entity_attribute, prior_component,
web/src/lib/calculation/run-calculation.ts:516: * Compute attainment from goal + actual if not already present.
web/src/lib/calculation/run-calculation.ts:522:    const computedAttainment = actual / metrics['goal'];
web/src/lib/calculation/run-calculation.ts:523:    // Override if attainment is missing or looks like a monetary value (>1000)
web/src/lib/calculation/run-calculation.ts:531: * Build metrics for a specific component using source-aware resolution.
web/src/lib/calculation/run-calculation.ts:537: * 2. Build store context from ALL store sheets (shared across components)
web/src/lib/calculation/run-calculation.ts:551:  // Step 1: Match entity-level sheet for this component
web/src/lib/calculation/run-calculation.ts:557:  // find the sheet whose data columns best overlap the component's expected metrics.
web/src/lib/calculation/run-calculation.ts:589:  // Step 2: Match store-level sheet for this component
web/src/lib/calculation/run-calculation.ts:630:  // (e.g., amount from tienda+cobranza = 99M instead of tienda-only 44M).
web/src/lib/calculation/run-calculation.ts:653:  // Step 4: Resolve expected metrics with source preference
web/src/lib/calculation/run-calculation.ts:678:    // Semantic resolution: infer what kind of value this metric name needs
web/src/lib/calculation/run-calculation.ts:713:      // First try literal semantic key (e.g., metrics["amount"])
web/src/lib/calculation/run-calculation.ts:765:  // Maps semantic metric names (used by components) to raw field names (in row_data).
web/src/lib/calculation/run-calculation.ts:767:  // Uses FIRST-VALUE extraction (not sum) to handle duplicate rows correctly.
web/src/lib/calculation/run-calculation.ts:769:    // Build first-value pool: scan ALL entity + store rows for field values
web/src/lib/calculation/run-calculation.ts:831:  // Parse components from JSONB — handle 3 formats:
web/src/lib/calculation/run-calculation.ts:833:  // 2. Wrapped object: { components: [{id, name, ...}, ...] }
web/src/lib/calculation/run-calculation.ts:834:  // 3. Legacy nested: { variants: [{ components: [...] }] }
web/src/lib/calculation/run-calculation.ts:843:      // OB-153: Wrapped object format { components: [...] }
web/src/lib/calculation/run-calculation.ts:846:      // Legacy nested format: { variants: [{ components: [...] }] }
web/src/lib/calculation/run-calculation.ts:1374:    // Evaluate each component with sheet-aware metrics
web/src/lib/calculation/run-calculation.ts:1390:      // buildMetricsForComponent normalizes but the derivation override can
web/src/lib/calculation/run-calculation.ts:1395:          metrics[key] = value * 100;
web/src/lib/calculation/run-calculation.ts:1400:      // HF-122: Per-component rounding (Decision 122).
web/src/lib/calculation/run-calculation.ts:1402:      // intent only. inferOutputPrecision tolerates undefined componentConfig.
web/src/lib/calculation/run-calculation.ts:1409:      entityTotal += result.payout;
web/src/lib/orchestration/metric-resolver.ts:7: * The aggregation produces semantic values (attainment, amount, goal).
web/src/lib/orchestration/metric-resolver.ts:20:  /rate/i,
web/src/lib/orchestration/metric-resolver.ts:34:  /amount/i,
web/src/lib/orchestration/metric-resolver.ts:36:  /total/i,
web/src/lib/orchestration/metric-resolver.ts:38:  /value/i,
web/src/lib/orchestration/metric-resolver.ts:69: * Priority order ensures "sales_attainment" returns 'attainment' not 'amount'.
web/src/lib/orchestration/metric-resolver.ts:75:  // "sales_attainment" should be attainment, not amount)
web/src/lib/orchestration/metric-resolver.ts:93: * Component metric configuration - extracted from plan component configs
web/src/lib/orchestration/metric-resolver.ts:103: * For a given plan component, determine which aggregated semantic value
web/src/lib/orchestration/metric-resolver.ts:104: * maps to each of the plan's expected metric names.
web/src/lib/orchestration/metric-resolver.ts:140: * Build the metrics object for one employee on one plan component.
web/src/lib/orchestration/metric-resolver.ts:142: * Takes the plan's expected metric names and fills them with the
web/src/lib/orchestration/metric-resolver.ts:146: * - tier_lookup components ONLY accept attainment values (no amount fallback)
web/src/lib/orchestration/metric-resolver.ts:150: * @param component - Plan component with metric name config
web/src/lib/orchestration/metric-resolver.ts:151: * @param sheetMetrics - Aggregated semantic values {attainment, amount, goal, quantity}
web/src/lib/orchestration/metric-resolver.ts:152: * @param componentType - Optional: the plan component type (tier_lookup, matrix_lookup, etc.)
web/src/lib/orchestration/metric-resolver.ts:153: * @returns Metrics object with plan-expected keys and aggregated values
web/src/lib/orchestration/metric-resolver.ts:175:        // OB-29 Phase 3B: For tier_lookup, amount is INVALID - it expects attainment
web/src/lib/orchestration/metric-resolver.ts:200:          // Unknown type - try amount as fallback (most common) for non-tier_lookup
web/src/lib/orchestration/metric-resolver.ts:224: * Extract metric configuration from a plan component's foundational intent.
web/src/lib/orchestration/metric-resolver.ts:246:      `[metric-resolver] Missing metadata.intent and calculationIntent on component ` +
web/src/lib/orchestration/metric-resolver.ts:247:      `${component.id ?? '<unknown id>'} (${component.name ?? '<unknown name>'}). ` +
web/src/lib/orchestration/metric-resolver.ts:297: * Find the sheet that matches a plan component by matching component names/IDs.
web/src/lib/orchestration/metric-resolver.ts:298: * The AI Import Context stores which sheet feeds which plan component.
web/src/lib/orchestration/metric-resolver.ts:313:  const normName = componentName.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/orchestration/metric-resolver.ts:314:  const normId = componentId.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/orchestration/metric-resolver.ts:316:  // STRATEGY 1: Use AI matchedComponent if available
web/src/lib/orchestration/metric-resolver.ts:320:    const matchedNorm = sheet.matchedComponent.toLowerCase().replace(/[-\s]/g, '_');
web/src/lib/calculation/intent-transformer.ts:2: * Intent Transformer — Bridge from PlanComponent to ComponentIntent
web/src/lib/calculation/intent-transformer.ts:5: * Reads the existing plan component and produces a structural intent
web/src/lib/calculation/intent-transformer.ts:11:import type { PlanComponent } from '../../types/compensation-plan';
web/src/lib/calculation/intent-transformer.ts:25: * Transform a PlanComponent into a ComponentIntent.
web/src/lib/calculation/intent-transformer.ts:26: * Returns null if the component is disabled or has no valid intent.
web/src/lib/calculation/intent-transformer.ts:42:      // Default path: any component with calculationIntent or metadata.intent
web/src/lib/calculation/intent-transformer.ts:43:      // routes through metadata-driven construction. Components lacking either
web/src/lib/calculation/intent-transformer.ts:50: * Transform all components in a variant into ComponentIntents.
web/src/lib/calculation/intent-transformer.ts:56:  for (let i = 0; i < components.length; i++) {
web/src/lib/calculation/intent-transformer.ts:73:// The AI plan interpreter stores the intent structure in component.metadata.intent
web/src/lib/calculation/intent-transformer.ts:74:// or component.calculationIntent.
web/src/lib/calculation/intent-transformer.ts:83: * AI format for constants: { source: "constant", value: N } → pass through
web/src/lib/calculation/intent-transformer.ts:219:      interpretationNotes: `AI-interpreted ${component.componentType} via calculationIntent`,
web/src/lib/calculation/decimal-precision.ts:40:/** Round a component output per its outputPrecision and return the trace */
web/src/lib/calculation/decimal-precision.ts:78: * Infer outputPrecision from a component's plan structure.
web/src/lib/calculation/decimal-precision.ts:95:  // Collect from legacy component configs
web/src/lib/calculation/decimal-precision.ts:146:      // Recurse into nested input/rate operations
web/src/lib/calculation/decimal-precision.ts:171:/** Collect output values from legacy component configs */
web/src/lib/domain/domain-dispatcher.ts:33:  /** The actual calculation results (unchanged from current pipeline) */
web/src/lib/domain/domain-dispatcher.ts:86:// Dispatch Exit — Score result through IAP
web/src/lib/domain/domain-dispatcher.ts:132:    result: null, // actual results are in CalculationDispatchResult.results
web/src/lib/calculation/intent-executor.ts:4: * Executes structural operations defined by ComponentIntent.
web/src/lib/calculation/intent-executor.ts:42:  priorResults?: number[];    // outcomes of previously calculated components
web/src/lib/calculation/intent-executor.ts:45:  crossDataCounts?: Record<string, number>;  // key: "dataType:count" or "dataType:sum:field" → value
web/src/lib/calculation/intent-executor.ts:47:  scopeAggregates?: Record<string, number>;  // key: "scope:field:aggregation" → value
web/src/lib/calculation/intent-executor.ts:156:// Composable Value Resolution — handles IntentSource or nested IntentOperation
web/src/lib/calculation/intent-executor.ts:166:    // Recursive: execute the nested operation to get a value
web/src/lib/calculation/intent-executor.ts:237:  // OB-117: isMarginal — outputs are rates to multiply against the input value
web/src/lib/calculation/intent-executor.ts:416:  // Graceful degradation: no history → return current value
web/src/lib/calculation/intent-executor.ts:476: * LegacyEngineUnknownComponentTypeError pattern at the next dispatch layer.
web/src/lib/calculation/intent-executor.ts:485:// OB-117: Exported for use by evaluateComponent's calculationIntent fallback
web/src/lib/calculation/intent-executor.ts:532:// OB-180: Piecewise Linear — attainment selects rate, applied to base
web/src/lib/calculation/intent-executor.ts:544:  // OB-186: If ratio resolved to 0 (missing denominator metric) and component
web/src/lib/calculation/intent-executor.ts:626:  // the foundational primitive that defines the component.
web/src/lib/agents/agent-memory.ts:103: * - interpretation: primarily interpretationSignals + componentPattern density
web/src/lib/calculation/pattern-signature.ts:4: * Produces structural hashes from ComponentIntent.
web/src/lib/calculation/pattern-signature.ts:15:import type { ComponentIntent, IntentOperation, IntentSource } from './intent-types';
web/src/lib/calculation/pattern-signature.ts:19: * Generate a structural signature for a ComponentIntent.
web/src/lib/calculation/flywheel-pipeline.ts:11: * - Only: pattern_signature, confidence, execution count, anomaly rate, structural behaviors
web/src/lib/sci/import-batch-supersession.ts:82: * Returns supersession result for caller logging. Throws on update error
web/src/lib/sci/import-batch-supersession.ts:220:        `[HF-213] Superseded prior batch ${result.prior_batch_id} → new batch ${result.new_batch_id} ` +
web/src/lib/calculation/synaptic-surface.ts:65:  // Component-level
web/src/lib/calculation/synaptic-surface.ts:151:  // Group confidence synapses by componentIndex to compute per-pattern density
web/src/lib/calculation/synaptic-surface.ts:165:    // Find which componentIndex maps to this signature
web/src/lib/calculation/synaptic-surface.ts:202:    // Training signal per component (not per entity)
web/src/lib/calculation/synaptic-surface.ts:240:  // Write a pattern synapse to track signature → componentIndex mapping
web/src/lib/agents/insight-agent.ts:24:    concentrationAlert: number;     // default 0.50 (50% of total in top 10%)
web/src/lib/agents/insight-agent.ts:66:  // Check 1: Anomaly rate
web/src/lib/agents/insight-agent.ts:82:      componentIndex: -1,
web/src/lib/agents/insight-agent.ts:92:    const avgConf = confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length;
web/src/lib/agents/insight-agent.ts:229:    ? confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length
web/src/lib/agents/insight-agent.ts:257:  // ── Insight: Anomaly rate ──
web/src/lib/agents/insight-agent.ts:265:      description: `${stats.anomalyCount} anomalies detected across ${summary.entityCount} entities (${(anomalyRate * 100).toFixed(1)}% rate)`,
web/src/lib/agents/insight-agent.ts:275:      description: `${(anomalyRate * 100).toFixed(1)}% anomaly rate (threshold: ${(config.thresholds.anomalyRateAlert * 100).toFixed(0)}%)`,
web/src/lib/agents/insight-agent.ts:287:      description: `Average confidence: ${(avgConf * 100).toFixed(1)}% — some components may have interpretation uncertainty`,
web/src/lib/agents/insight-agent.ts:288:      recommendation: 'Review component rule interpretations for low-confidence patterns',
web/src/lib/agents/insight-agent.ts:304:        description: `Top ${summary.topEntities.length} entities account for ${(concentrationRatio * 100).toFixed(1)}% of total outcomes`,
```
