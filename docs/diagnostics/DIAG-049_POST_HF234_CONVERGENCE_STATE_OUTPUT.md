# DIAG-049 — Post-HF-234 Convergence Pipeline State Extraction

**Status:** ACTIVE (Phase 0 setup)
**Type:** Diagnostic, read-only.
**Branch:** `diag-049-post-hf234-convergence-state` off main `241c60af`.
**Working tree** at branch creation: post-HF-234 (PR #412 merged at `241c60af`).

This file is filled in phase-by-phase. Each subsequent commit appends one section. No interpretation, no PASS/FAIL claims, no fix proposals.

---

## Phase 1 — generateAllComponentBindings categorical fields

### 1.1 Function start line (`grep -n "function generateAllComponentBindings"`)

```
2173:async function generateAllComponentBindings(
```

Function spans `convergence-service.ts:2173` through closing `}` at `convergence-service.ts:2533`. Total span: 361 lines (counted via `awk '/^async function generateAllComponentBindings\(/,/^}/' | wc -l`).

### 1.2 Full function body, verbatim with line numbers

```typescript
2173 async function generateAllComponentBindings(
2174   components: PlanComponent[],
2175   matches: BindingMatch[],
2176   capabilities: DataCapability[],
2177   bindings: Record<string, Record<string, ComponentBinding>>,
2178   existingConvergenceBindings: Record<string, Record<string, unknown>> | undefined,
2179   metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2: E5 signals threaded through
2180   // HF-218 Component 1: tenant entity external_id set for binding self-verification.
2181   // generateAllComponentBindings receives the set so identifier-candidate selection can
2182   // verify column values against the tenant's registered entities (closes DIAG-042 §2.3
2183   // structural absence — no value-set intersection check).
2184   tenantEntityExternalIds: Set<string> = new Set(),
2185   // HF-218 Component 1: tenantId + supabase needed for (a) per-column distinct-value reads,
2186   // (b) writeSignal emission for convergence:binding_selection provenance.
2187   tenantId: string = '',
2188   supabase?: SupabaseClient,
2189 ): Promise<void> {
2190   // HF-222 Phase 1: HF-218 Component 4b tenant-adaptive boundary threshold block
2191   // RETIRED (Korean Test violation: developer-stated initial-state anchor value
2192   // and signal-window size were introduced at HF-218 design lock and reviewed via
2193   // an unfilled GP-2 citation slot). The boundary-fallback acceptance mechanism
2194   // is replaced in Phase 2 by a distribution-derived distinguishability test that
2195   // computes its threshold from the candidate distribution at decision time.
2196   //
2197   // The `convergence:dual_path_concordance` signal continues to be emitted by the
2198   // engine (calculation/run/route.ts) and is classified observation-only per the
2199   // VG substrate entry T2-E-signal-convergence-dual-path-concordance-observation-only.
2200
2201   // HF-112: Reuse existing bindings if complete (zero AI cost)
2202   if (hasCompleteBindings(existingConvergenceBindings, components.length)) {
2203     console.log('[Convergence] HF-112 Existing bindings complete — reusing (zero AI cost)');
2204     for (const [compKey, compBindings] of Object.entries(existingConvergenceBindings!)) {
2205       bindings[compKey] = compBindings as Record<string, ComponentBinding>;
2206     }
2207     return;
2208   }
2209
2210   // Collect all measure columns across matched capabilities
2211   const measureColumns: Array<{
2212     name: string;
2213     fi: FieldIdentity;
2214     stats: ColumnValueStats;
2215     batchId: string;
2216   }> = [];
2217   let primaryCap: DataCapability | undefined;
2218
2219   for (const match of matches) {
2220     const cap = capabilities.find(c => c.dataType === match.dataType);
2221     if (!cap) continue;
2222     if (!primaryCap) {
2223       primaryCap = cap;
2224     }
2225
2226     for (const [colName, fi] of Object.entries(cap.fieldIdentities)) {
2227       if (fi.structuralType === 'measure' && cap.columnStats[colName]) {
2228         if (!measureColumns.some(mc => mc.name === colName)) {
2229           measureColumns.push({ name: colName, fi, stats: cap.columnStats[colName], batchId: cap.batchIds[0] || '' });
2230         }
2231       }
2232     }
2233     // Also include numeric columns with stats but no field identity
2234     for (const nf of cap.numericFields) {
2235       if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
2236         measureColumns.push({
2237           name: nf.field,
2238           fi: { structuralType: 'measure', contextualIdentity: 'inferred_numeric', confidence: 0.5 },
2239           stats: cap.columnStats[nf.field],
2240           batchId: cap.batchIds[0] || '',
2241         });
2242       }
2243     }
2244   }
2245
2246   if (measureColumns.length === 0 || !primaryCap) return;
2247
2248   // Collect all input requirements across all matched components
2249   const allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }> = [];
2250   for (const match of matches) {
2251     const reqs = extractInputRequirements(match.component);
2252     for (const req of reqs) {
2253       allRequirements.push({ compIndex: match.component.index, compName: match.component.name, req });
2254     }
2255   }
2256
2257   // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
2258   // signals as authoritative semantic intent.
2259   //
2260   // HF-234 — categorical-field aggregation REMOVED from this call site.
2261   // Categorical-subset filter discovery has moved to Pass 4
2262   // (generateAISemanticDerivations), which reads categoricalFields directly
2263   // from the `capabilities` parameter and produces metric_derivations rules.
2264   // The cross-data-type measure-column discovery below (HF-228) is preserved
2265   // — it serves Call 1's structural column mapping for plans whose metrics
2266   // span multiple capability data types.
2267
2268   // HF-228 — cross-data-type column discovery. Pre-HF-228 `measureColumns`
2269   // was built only from capabilities whose data_type appears in `matches`;
2270   // unmatched capabilities contributed no columns and were invisible to
2271   // resolveColumnMappingsViaAI. For plans that combine transaction-style
2272   // measures with reference/target-style metrics from a different data_type
2273   // (e.g., a per-entity quota living on `target` data alongside revenue on
2274   // `transaction` data), the cross-source metric could not be resolved.
2275   // The cross-source columns are tagged `contextualIdentity: 'cross_source_numeric'`
2276   // with lower confidence (0.4) so the AI naturally prefers primary
2277   // (matched-capability) columns for principal metrics and uses cross-source
2278   // columns only for supplementary metrics.
2279   // Korean Test: structural type classification + numeric-field discovery,
2280   // no column-name matching.
2281   const matchedDataTypes = new Set(matches.map(m => m.dataType));
2282   for (const cap of capabilities) {
2283     if (matchedDataTypes.has(cap.dataType)) continue;
2284     for (const nf of cap.numericFields) {
2285       if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
2286         measureColumns.push({
2287           name: nf.field,
2288           fi: { structuralType: 'measure', contextualIdentity: 'cross_source_numeric', confidence: 0.4 },
2289           stats: cap.columnStats[nf.field],
2290           batchId: cap.batchIds[0] || '',
2291         });
2292       }
2293     }
2294   }
2295
2296   console.log('[Convergence] HF-112 Requesting AI column mapping');
2297   const aiMapping = await resolveColumnMappingsViaAI(
2298     components,
2299     allRequirements,
2300     measureColumns,
2301     metricComprehension,
2302   );
2303   console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);
2304
2305   // Build bindings using AI mapping + boundary validation
2306   const boundColumns = new Set<string>();
2307
2308   for (const match of matches) {
2309     const comp = match.component;
2310     const cap = capabilities.find(c => c.dataType === match.dataType);
2311     if (!cap) continue;
2312
2313     const compKey = `component_${comp.index}`;
2314     if (!bindings[compKey]) bindings[compKey] = {};
2315
2316     const batchId = cap.batchIds[0] || '';
2317     const requirements = extractInputRequirements(comp);
2318
2319     for (const req of requirements) {
2320       // HF-227: the AI mapping value may be a plain column-name string
2321       // (backward compatible) or the enriched shape { column, filters? }.
2322       // Extract both so filters land on the binding entry below.
2323       const proposedMapping = aiMapping[req.metricField];
2324       const proposedColumnName = typeof proposedMapping === 'string'
2325         ? proposedMapping
2326         : proposedMapping?.column;
2327       const proposedFilters = typeof proposedMapping === 'object' && proposedMapping !== null && Array.isArray(proposedMapping.filters)
2328         ? proposedMapping.filters
2329         : [];
2330
2331       if (proposedColumnName) {
2332         const mc = measureColumns.find(c => c.name === proposedColumnName);
2333         if (mc && !boundColumns.has(proposedColumnName)) {
2334           // Boundary validation of AI proposal
2335           const { score: boundaryScore, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
2336           const isValidated = !req.expectedRange || boundaryScore > 0.1;
2337
2338           bindings[compKey][req.role] = {
2339             column: proposedColumnName,
2340             field_identity: mc.fi,
2341             match_pass: isValidated ? 1 : 2,  // 1=AI+validated, 2=AI-only
2342             confidence: isValidated ? 0.9 : 0.6,
2343             scale_factor: scaleFactor !== 1 ? scaleFactor : undefined,
2344             learning_provenance: {
2345               batch_id: mc.batchId,
2346               learned_at: new Date().toISOString(),
2347             },
2348             // HF-227: filters live on the binding (Decision 111 single-structure
2349             // completion). Empty array preserves byte-identical pre-HF-227
2350             // engine behavior; populated array activates filter-respecting
2351             // sum at the engine.
2352             filters: proposedFilters,
2353           };
2354           boundColumns.add(proposedColumnName);
2355           console.log(`[Convergence] HF-112 ${comp.name}:${req.role} → ${proposedColumnName} (AI${isValidated ? '+validated' : ''}, scale=${scaleFactor}, filters=${proposedFilters.length})`);
2356           continue;
2357         }
2358       }
2359
2360       // Fallback: boundary matching for unmapped requirements (HF-111 logic)
2361       // HF-222 Phase 2: boundary-fallback acceptance uses distribution-derived
2362       // distinguishability (see distinctEnoughToBind). The threshold is computed
2363       // from the candidate distribution at decision time — no developer-stated
2364       // numerical constants. Cluster cases refuse to bind and surface convergence
2365       // gaps; clear-outlier cases bind.
2366       const candidates = measureColumns
2367         .filter(mc => !boundColumns.has(mc.name))
2368         .map(mc => {
2369           const { score, scaleFactor } = scoreColumnForRequirement(mc.name, mc.stats, req);
2370           return { ...mc, score, scaleFactor };
2371         })
2372         .sort((a, b) => b.score - a.score);
2373
2374       if (candidates.length > 0 && distinctEnoughToBind(candidates)) {
2375         const best = candidates[0];
2376         bindings[compKey][req.role] = {
2377           column: best.name,
2378           field_identity: best.fi,
2379           match_pass: 3,  // Boundary-only fallback (distribution-derived acceptance)
2380           confidence: Math.min(0.7, match.matchConfidence * (0.3 + best.score * 0.4)),
2381           scale_factor: best.scaleFactor !== 1 ? best.scaleFactor : undefined,
2382           learning_provenance: {
2383             batch_id: best.batchId,
2384             learned_at: new Date().toISOString(),
2385           },
2386         };
2387         boundColumns.add(best.name);
2388         console.log(`[Convergence] HF-222 ${comp.name}:${req.role} → ${best.name} (distribution-distinct, top=${candidates[0].score.toFixed(4)})`);
2389       } else if (candidates.length > 0) {
2390         console.log(`[Convergence] HF-222: ${comp.name}:${req.role}: candidate distribution insufficient to bind (top=${candidates[0].score.toFixed(4)}, n=${candidates.length}); surfacing as convergence gap.`);
2391       }
2392     }
2393
2394     // HF-218 Component 1 — Entity identifier self-verification.
2395     // Pre-HF-218: idEntries[0] (first-by-insertion-order; no value-content check, no
2396     // cardinality scoring, no tenant-entity intersection). Closes DIAG-042 §2.3
2397     // structural absences.
2398     //
2399     // Structural verification protocol (ADR Decision 1: product composition):
2400     //   1. Inventory all candidates where fi.structuralType === 'identifier'
2401     //   2. For each candidate, fetch distinct values from committed_data for batchIds
2402     //   3. Compute cardinality_ratio × intersection_ratio (vs tenant entity external_ids)
2403     //   4. Select highest-scoring candidate
2404     //   5. Fall back to cardinality-only if zero intersection across all candidates
2405     //   6. Persist with freshly-computed confidence; emit convergence:binding_selection signal
2406     const idEntries = Object.entries(cap.fieldIdentities)
2407       .filter(([, fi]) => fi.structuralType === 'identifier');
2408     if (idEntries.length > 0) {
2409       type CandidateScore = {
2410         colName: string;
2411         fi: FieldIdentity;
2412         conf: StructuralBindingConfidence;
2413       };
2414       const candidateScores: CandidateScore[] = [];
2415
2416       for (const [colName, fi] of idEntries) {
2417         const distinctValues = new Set<string>();
2418         let totalRows = 0;
2419         if (supabase && cap.batchIds.length > 0) {
2420           const PAGE_SIZE = 1000;
2421           let page = 0;
2422           while (true) {
2423             const from = page * PAGE_SIZE;
2424             const to = from + PAGE_SIZE - 1;
2425             const { data: rows } = await supabase
2426               .from('committed_data')
2427               .select('row_data')
2428               .in('import_batch_id', cap.batchIds)
2429               .range(from, to);
2430             if (!rows || rows.length === 0) break;
2431             for (const r of rows) {
2432               const rd = r.row_data as Record<string, unknown> | null;
2433               if (!rd) continue;
2434               const v = rd[colName];
2435               if (v != null && String(v).trim().length > 0) {
2436                 distinctValues.add(String(v).trim());
2437                 totalRows++;
2438               }
2439             }
2440             if (rows.length < PAGE_SIZE) break;
2441             page++;
2442             if (page > 10) break; // 10k row sampling ceiling for cardinality estimate
2443           }
2444         }
2445         const conf = computeStructuralBindingConfidence(distinctValues, totalRows, tenantEntityExternalIds);
2446         candidateScores.push({ colName, fi, conf });
2447       }
2448
2449       // Rank: prefer non-zero score (intersection > 0); fall back to cardinality-only if all zero.
2450       candidateScores.sort((a, b) => {
2451         if (a.conf.score !== b.conf.score) return b.conf.score - a.conf.score;
2452         // Tie-break on cardinality_ratio (handles all-zero-intersection case)
2453         return b.conf.cardinality_ratio - a.conf.cardinality_ratio;
2454       });
2455
2456       const winner = candidateScores[0];
2457       const winnerScore = winner.conf.score > 0 ? winner.conf.score : winner.conf.cardinality_ratio;
2458
2459       bindings[compKey]['entity_identifier'] = {
2460         column: winner.colName,
2461         field_identity: winner.fi,
2462         match_pass: 1,
2463         confidence: winnerScore,
2464         learning_provenance: {
2465           batch_id: batchId,
2466           learned_at: new Date().toISOString(),
2467         },
2468       };
2469
2470       // Emit convergence:binding_selection signal with full candidate provenance.
2471       // Per DS-022 v2 §5.1: canonical writer is the singular write path.
2472       if (supabase && tenantId) {
2473         try {
2474           await writeSignal({
2475             tenantId,
2476             signalType: 'convergence:binding_selection',
2477             signalValue: {
2478               component_index: comp.index,
2479               component_name: comp.name,
2480               selected_column: winner.colName,
2481               selected_confidence: winnerScore,
2482               tenant_entity_count: tenantEntityExternalIds.size,
2483               candidates: candidateScores.map(c => ({
2484                 column: c.colName,
2485                 score: c.conf.score,
2486                 cardinality_ratio: c.conf.cardinality_ratio,
2487                 intersection_ratio: c.conf.intersection_ratio,
2488                 distinct_count: c.conf.distinct_count,
2489                 intersection_count: c.conf.intersection_count,
2490               })),
2491               fallback_to_cardinality_only: winner.conf.score === 0,
2492             },
2493             confidence: winnerScore,
2494             source: 'convergence_validation',
2495             decisionSource: 'binding_self_verification',
2496           }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
2497         } catch (sigErr) {
2498           if (sigErr instanceof CanonicalWriteError) {
2501           } else {
2502             console.warn(`[Convergence] HF-218 binding_selection signal write failed (non-blocking): ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
2503           }
2504         }
2505       }
2506     }
2507
2508     // Find temporal column
2509     const temporalEntries = Object.entries(cap.fieldIdentities)
2510       .filter(([, fi]) => fi.structuralType === 'temporal');
2511     if (temporalEntries.length > 0) {
2512       const [colName, fi] = temporalEntries[0];
2513       bindings[compKey]['period'] = {
2514         column: colName,
2515         field_identity: fi,
2516         match_pass: 1,
2517         confidence: match.matchConfidence,
2518         learning_provenance: {
2519           batch_id: batchId,
2520           learned_at: new Date().toISOString(),
2521         },
2522       };
2523     }
2524   }
2525
2526   // Log complete binding map
2527   for (const [compKey, cb] of Object.entries(bindings)) {
2528     const roles = Object.entries(cb)
2529       .filter(([role]) => role !== 'entity_identifier' && role !== 'period')
2530       .map(([role, b]) => `${role}=${b.column}`)
2531       .join(', ');
2532     if (roles) console.log(`[Convergence] HF-112 ${compKey}: ${roles}`);
2533   }
2534 }
```

Notes on function-body completeness: lines 2498-2500 in the live file contain an inline `console.warn` and `signal CanonicalWriteError` message; the paste above shows lines 2497-2504 with the catch block boundaries intact. Function closes at line 2533 (the `}` after the `Log complete binding map` block).

### 1.3 Every `categoricalFields` reference in the file (`grep -n "categoricalFields\|categorical" web/src/lib/intelligence/convergence-service.ts`)

```
79:  categoricalFields: Array<{ field: string; distinctValues: string[]; count: number }>;
307:  // categorical-subset prompt and produces filter populated rules. The
603:  // HF-234 — when capabilities carry categorical fields, ALL required metrics
606:  // metric on data with categorical dimensions may need subsetting. Tenants
607:  // without categorical data (e.g., Meridian — one metric per column) keep
612:  // its membership semantics depend on the categorical-data branch below.
614:    (cap.categoricalFields?.length ?? 0) > 0,
1044:      categoricalFields: [],
1120:          cap.categoricalFields.push({
1275:  if (isSharedBase && capability.categoricalFields.length > 0) {
1958:// metric resolution. The prompt below no longer mentions categorical fields or
2023:  // HF-234 — categorical-context block REMOVED. Column mapping is structural;
2260:  // HF-234 — categorical-field aggregation REMOVED from this call site.
2262:  // (generateAISemanticDerivations), which reads categoricalFields directly
2540: * scoring between component-name and capability.categoricalFields[*].distinctValues,
2542: * heuristics (column distributions, categorical-value statistics) per the
2557:  for (const catField of capability.categoricalFields) {
2574:      for (const catField of capability.categoricalFields) {
2642:    for (const cf of cap.categoricalFields) {
2643:      columnDescriptions.push(`  - ${cf.field}: categorical (values: ${cf.distinctValues.join(', ')})`);
2681:    // vocabulary, etc. Pass-4 already instructs the AI to identify categorical
2705:2. Available data columns with types, statistics, and categorical values
2710:- Match the metric's semantic label to available data fields. If the label suggests a subset of a broader numeric field (e.g., "Equipment Revenue" from a general "total_amount"), identify the categorical field and value that filters to the correct subset.
2711:- Use the categorical field's distinct values to find exact filter matches. The filter value must be one of the listed distinct values.
2716:- sum: SUM a numeric field, optionally filtered by a categorical field value
2717:- count: COUNT rows, optionally filtered by a categorical field value
2790:            cap.categoricalFields.some(f => f.field === d.source_field) ||
2792:              cap.categoricalFields.some(f => f.field === df.field)
```

### 1.4 Categorical-field collection site, verbatim with line numbers (lines 1100-1132 context)

```typescript
1100         }
1101       }
1102
1103       if (stringValues.length > values.length * 0.5) {
1104         const distinctValues = Array.from(new Set(stringValues));
1105         if (distinctValues.length >= 2 && distinctValues.length <= 20) {
1106           if (distinctValues.length === 2) {
1107             const lower = distinctValues.map(v => v.toLowerCase());
1108             const isBoolLike = lower.some(v => ['yes', 'no', 'sí', 'si', 'true', 'false', 'qualified', 'not qualified'].includes(v));
1109             if (isBoolLike) {
1110               const trueVal = distinctValues.find(v => ['yes', 'sí', 'si', 'true', 'qualified'].includes(v.toLowerCase()));
1111               const falseVal = distinctValues.find(v => v !== trueVal);
1112               cap.booleanFields.push({
1113                 field: key,
1114                 trueValue: trueVal || distinctValues[0],
1115                 falseValue: falseVal || distinctValues[1],
1116               });
1117               continue;
1118             }
1119           }
1120           cap.categoricalFields.push({
1121             field: key,
1122             distinctValues,
1123             count: stringValues.length,
1124           });
1125         }
1126       }
1127     }
1128
1129     capabilities.push(cap);
1130   }
1131
1132   return capabilities;
1133 }
```

### 1.5 Type declaration of `categoricalFields` on `DataCapability` (line 79 in context, verbatim from `convergence-service.ts:75-84`)

```typescript
 75: interface DataCapability {
 76:   dataType: string;
 77:   rowCount: number;
 78:   numericFields: Array<{ field: string; avg: number; nonNullCount: number }>;
 79:   categoricalFields: Array<{ field: string; distinctValues: string[]; count: number }>;
 80:   booleanFields: Array<{ field: string; trueValue: string; falseValue: string }>;
 81:   // OB-128: Semantic role awareness — discovered from committed_data metadata
 82:   semanticRoles: Record<string, string>;  // fieldName → semanticRole
 83:   hasTargetData: boolean;                 // true if any field has 'performance_target' role
 84:   targetField?: string;                   // field name with 'performance_target' role
```

---

## Phase 2 — convergeBindings capabilities flow

### 2.1 convergeBindings entry, capabilities construction, and `generateAllComponentBindings` invocation

```
convergence-service.ts:194  export async function convergeBindings(
convergence-service.ts:236    const capabilities = await inventoryData(tenantId, supabase);
convergence-service.ts:299    const matches = matchComponentsToData(components, capabilities);
convergence-service.ts:370    await generateAllComponentBindings(...);
convergence-service.ts:674    const aiResult = await generateAISemanticDerivations(...);
```

Verbatim function header and capabilities build (lines 194-249):

```typescript
194 export async function convergeBindings(
195   tenantId: string,
196   ruleSetId: string,
197   supabase: SupabaseClient,
198   calculationRunId?: string,  // OB-197 G11: scope signals emitted by this convergence to a calculation run
199 ): Promise<ConvergenceResult> {
200   const derivations: MetricDerivationRule[] = [];
201   const matchReport: ConvergenceResult['matchReport'] = [];
202   const signals: ConvergenceResult['signals'] = [];
203   const gaps: ConvergenceGap[] = [];
204   const componentBindings: Record<string, Record<string, ComponentBinding>> = {};
205   // OB-197 G11: observations populated from the canonical signal surface
206   // before matching begins. Empty when no calculationRunId is supplied.
207   // HF-196 Phase 3: metricComprehension is read unconditionally (not gated on
208   // calculationRunId) because it is the operative input replacing seeds.
209   const observations: ConvergenceResult['observations'] = { withinRun: [], crossRun: [], metricComprehension: [] };
210
211   // 1. Fetch rule set
212   const { data: ruleSet } = await supabase
213     .from('rule_sets')
214     .select('id, name, components, input_bindings')
215     .eq('id', ruleSetId)
216     .single();
217
218   if (!ruleSet) return { derivations, matchReport, signals, gaps, componentBindings, observations };
219
220   // 2. Extract plan requirements
221   const components = extractComponents(ruleSet.components);
222   if (components.length === 0) return { derivations, matchReport, signals, gaps, componentBindings, observations };
223
224   // HF-196 Phase 3: D153 B-E4 atomic cutover — read metric_comprehension signals
225   // as the operative signal-surface input. These signals (signal_type=
226   // 'comprehension:plan_interpretation') carry plan-agent metric semantics that
227   // the eradicated seeds path used to provide. Read scoped to (tenant_id, rule_set_id).
228   // Per D153 B-E4: "signal surface as the operative path. No parallel paths."
229   const metricComprehensionSignals = await loadMetricComprehensionSignals(tenantId, ruleSetId, supabase);
230   observations.metricComprehension = metricComprehensionSignals;
231   if (metricComprehensionSignals.length > 0) {
232     console.log(`[Convergence] HF-196 D153 cutover: ${metricComprehensionSignals.length} metric_comprehension signals loaded as operative input (rule_set=${ruleSetId})`);
233   }
234
235   // 3. Inventory data capabilities (OB-162: includes field identities)
236   const capabilities = await inventoryData(tenantId, supabase);
237   if (capabilities.length === 0) {
238     for (const comp of components) {
239       gaps.push({
240         component: comp.name,
241         componentIndex: comp.index,
242         requiredMetrics: comp.expectedMetrics,
243         calculationOp: comp.calculationOp,
244         reason: 'No committed data found for this tenant',
245         resolution: `Import data for this plan's components`,
246       });
247     }
248     return { derivations, matchReport, signals, gaps, componentBindings, observations };
249   }
```

Verbatim `generateAllComponentBindings` invocation (lines 370-380):

```typescript
370   await generateAllComponentBindings(
371     components,
372     matches,
373     capabilities,
374     componentBindings,
375     existingConvergenceBindings,
376     observations.metricComprehension,
377     tenantEntityExternalIds,
378     tenantId,
379     supabase,
380   );
```

### 2.2 Pass 4 trigger and invocation, verbatim (`convergence-service.ts:595-694`)

```typescript
595
596   // HF-226 Phase 2B (IRA DS-025 Option D): Pass 4 is now the SOLE derivation
597   // authority. Pre-HF-226 it fired only for metrics the deterministic Path
598   // 1-3 (generateDerivationsForMatch, removed above) had failed to resolve.
599   // Removing that path means the `derivations` array entering this point
600   // contains ONLY the targets-pair ratio derivations (from the actuals+target
601   // capability detection block).
602   //
603   // HF-234 — when capabilities carry categorical fields, ALL required metrics
604   // flow through Pass 4 regardless of whether earlier code added a derivation
605   // for them. Pass 4 is the surface where filter discovery happens, and any
606   // metric on data with categorical dimensions may need subsetting. Tenants
607   // without categorical data (e.g., Meridian — one metric per column) keep
608   // the prior gate so Pass 4 fires only for metrics not already resolved by
609   // the targets-pair ratio block.
610   //
611   // The variable name `unresolvedForAI` is retained for git-blame readability;
612   // its membership semantics depend on the categorical-data branch below.
613   const hasCategoricalData = capabilities.some(cap =>
614     (cap.categoricalFields?.length ?? 0) > 0,
615   );
616   const allResolvedMetrics = new Set(derivations.map(d => d.metric));
617   const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
618   const unresolvedForAI = hasCategoricalData
619     ? allRequiredMetrics
620     : allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));
621
622   if (unresolvedForAI.length > 0 && capabilities.length > 0) {
623     // OB-191 / HF-198 E5: Build enriched metric context from calculationIntent
624     // and from comprehension:plan_interpretation signals (read before derive).
625     // The metric_comprehension signals carry plan-agent semantic intent that the
626     // legacy private-JSONB path used to provide; consumed here per AUD-004 v3 §2 E5.
627     const metricContexts: MetricContext[] = unresolvedForAI.map(metricName => {
628       const ownerComp = components.find(c => c.expectedMetrics.includes(metricName));
629       const intent = ownerComp?.calculationIntent;
630       let scope: string | undefined;
631       if (intent) {
632         // HF-224: scope lives on any leaf IntentSource. Walk the intent tree
633         // and take the first leaf that declares it so HF-223 nested shapes
634         // (e.g. conditional_gate-wrapped ratio) still surface their scope.
635         for (const leaf of extractLeafSources(intent)) {
636           const leafScope = leaf.sourceSpec?.scope;
637           if (typeof leafScope === 'string') {
638             scope = leafScope;
639             break;
640           }
641         }
642       }
643       // HF-198 E5: Find matching metric_comprehension signal by metric label / component name.
644       const matchedSignal = observations.metricComprehension.find(sig => {
645         const sv = sig.signal_value as Record<string, unknown> | null;
646         if (!sv) return false;
647         const sigLabel = (sv.metric_label as string | undefined) ?? '';
648         const ownerName = ownerComp?.name ?? '';
649         return sigLabel === ownerName || sigLabel === metricName;
650       });
651       const sigValue = (matchedSignal?.signal_value ?? {}) as Record<string, unknown>;
652       const semanticIntent = (sigValue.semantic_intent as string | undefined) ?? undefined;
653       const metricInputs = (sigValue.metric_inputs as Record<string, unknown> | null | undefined) ?? null;
654       // HF-226 Phase 2A: carry full signal_value as signalContext so the
655       // Pass 4 prompt builder can surface any field the plan-agent emitted
656       // beyond the three already-extracted keys.
657       return {
658         name: metricName,
659         label: humanizeMetricName(metricName),
660         componentName: ownerComp?.name || 'Unknown',
661         operation: ownerComp?.calculationOp || 'unknown',
662         scope,
663         semanticIntent,
664         metricInputs,
665         signalContext: matchedSignal ? sigValue : null,
666       };
667     });
668
669     console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} metrics for AI semantic derivation (hasCategoricalData=${hasCategoricalData})`);
670     for (const mc of metricContexts) {
671       console.log(`[Convergence] Pass 4 metric: ${mc.name} (label: "${mc.label}", op: ${mc.operation}${mc.scope ? ', scope: ' + mc.scope : ''})`);
672     }
673     try {
674       const aiResult = await generateAISemanticDerivations(
675         metricContexts, capabilities, supabase, tenantId
676       );
677       derivations.push(...aiResult.derivations);
678       for (const g of aiResult.gaps) {
679         gaps.push({
680           component: components.find(c => c.expectedMetrics.includes(g.metric))?.name || 'Unknown',
681           componentIndex: components.find(c => c.expectedMetrics.includes(g.metric))?.index || 0,
682           requiredMetrics: [g.metric],
683           calculationOp: 'derived',
684           reason: g.reason,
685           resolution: g.resolution,
686         });
687       }
688       console.log(`[Convergence] OB-185 Pass 4: ${aiResult.derivations.length} derivations, ${aiResult.gaps.length} gaps`);
689       for (const d of aiResult.derivations) {
690         console.log(`[Convergence] Pass 4 derivation: ${d.metric} → ${d.operation}(${d.source_field || ''}) filters=${JSON.stringify(d.filters || [])}`);
691       }
692     } catch (aiErr) {
693       console.error('[Convergence] OB-185 Pass 4 AI call failed:', aiErr);
694       // Non-blocking — gaps will be detected below
```

### 2.3 Same `capabilities` array reference across call sites

The `capabilities` local in `convergeBindings` (assigned at line 236 from `inventoryData`) is the same object reference passed to:

- `matchComponentsToData(components, capabilities)` at `convergence-service.ts:299`.
- `generateAllComponentBindings(..., capabilities, ...)` at `convergence-service.ts:373`.
- `generateAISemanticDerivations(metricContexts, capabilities, supabase, tenantId)` at `convergence-service.ts:675`.

`grep -nE 'capabilities\s*=|capabilities = \[|capabilities\.filter' web/src/lib/intelligence/convergence-service.ts` returns:

```
236:  const capabilities = await inventoryData(tenantId, supabase);
486:  const targetCapabilities = capabilities.filter(c => c.hasTargetData);
510:        const nonTargetCaps = capabilities.filter(c => !c.hasTargetData);
1149:  const capsWithFI = capabilities.filter(c => Object.keys(c.fieldIdentities).length > 0);
```

Line 486 (`targetCapabilities`) and line 510 (`nonTargetCaps`) are local subset arrays inside the targets-pair detection block; line 1149 (`capsWithFI`) is inside `matchComponentsToData`. The `capabilities` parameter passed to `generateAISemanticDerivations` at line 675 is the original array assigned at line 236, unmodified.

---

## Phase 3 — inventoryData capabilities

### 3.1 inventoryData function body, verbatim (`convergence-service.ts:908-1133`)

```typescript
908 async function inventoryData(
909   tenantId: string,
910   supabase: SupabaseClient
911 ): Promise<DataCapability[]> {
912   const capabilities: DataCapability[] = [];
913
914   // HF-196 Phase 1E: filter out superseded batches per Rule 30.
915   const { fetchSupersededBatchIds } = await import('@/lib/sci/import-batch-supersession');
916   const supersededIds = await fetchSupersededBatchIds(supabase, tenantId);
917
918   // OB-162: Also read import_batch_id for convergence bindings
919   let q = supabase
920     .from('committed_data')
921     .select('data_type, row_data, metadata, import_batch_id')
922     .eq('tenant_id', tenantId)
923     .not('data_type', 'is', null)
924     .limit(500);
925   if (supersededIds.length > 0) q = q.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
926   const { data: rows } = await q;
927
928   // OB-128: Separately fetch rows with semantic_roles (SCI-committed data)
929   let q2 = supabase
930     .from('committed_data')
931     .select('data_type, row_data, metadata, import_batch_id')
932     .eq('tenant_id', tenantId)
933     .not('data_type', 'is', null)
934     .not('metadata->semantic_roles', 'is', null)
935     .limit(50);
936   if (supersededIds.length > 0) q2 = q2.not('import_batch_id', 'in', `(${supersededIds.join(',')})`);
937   const { data: sciRows } = await q2;
938
939   const allRows = [...(rows || [])];
940   if (sciRows) {
941     for (const sr of sciRows) {
942       const dt = sr.data_type as string;
943       if (!allRows.some(r => (r.data_type as string) === dt)) {
944         allRows.push(sr);
945       }
946     }
947   }
948
949   if (!allRows.length) return capabilities;
950
951   // Group by data_type
952   const byType = new Map<string, Array<Record<string, unknown>>>();
953   const countByType = new Map<string, number>();
954   const rolesByType = new Map<string, Record<string, string>>();
955   // OB-162: Collect field identities and batch IDs per data_type
956   const fieldIdentitiesByType = new Map<string, Record<string, FieldIdentity>>();
957   const batchIdsByType = new Map<string, Set<string>>();
958
959   for (const row of allRows) {
960     const dt = row.data_type as string;
961     if (!byType.has(dt)) byType.set(dt, []);
962     countByType.set(dt, (countByType.get(dt) || 0) + 1);
963     const samples = byType.get(dt)!;
964     if (samples.length < 30) {
965       const rd = row.row_data as Record<string, unknown> | null;
966       if (rd) samples.push(rd);
967     }
968
969     // Collect batch IDs
970     const batchId = row.import_batch_id as string | null;
971     if (batchId) {
972       if (!batchIdsByType.has(dt)) batchIdsByType.set(dt, new Set());
973       batchIdsByType.get(dt)!.add(batchId);
974     }
975
976     // Extract semantic_roles from metadata
977     if (!rolesByType.has(dt)) {
978       const meta = row.metadata as Record<string, unknown> | null;
979       const rawRoles = meta?.semantic_roles as Record<string, unknown> | undefined;
980       if (rawRoles && Object.keys(rawRoles).length > 0) {
981         const normalized: Record<string, string> = {};
982         for (const [field, val] of Object.entries(rawRoles)) {
983           if (typeof val === 'string') {
984             normalized[field] = val;
985           } else if (val && typeof val === 'object' && 'role' in val) {
986             normalized[field] = String((val as Record<string, unknown>).role);
987           }
988         }
989         if (Object.keys(normalized).length > 0) {
990           rolesByType.set(dt, normalized);
991         }
992       }
993
994       // OB-162: Extract field_identities from metadata (Decision 111)
995       const fieldIds = meta?.field_identities as Record<string, { structuralType?: string; contextualIdentity?: string; confidence?: number }> | undefined;
996       if (fieldIds && Object.keys(fieldIds).length > 0) {
997         const identities: Record<string, FieldIdentity> = {};
998         for (const [colName, fi] of Object.entries(fieldIds)) {
999           identities[colName] = {
1000             structuralType: (fi.structuralType || 'unknown') as FieldIdentity['structuralType'],
1001             contextualIdentity: fi.contextualIdentity || 'unknown',
1002             confidence: typeof fi.confidence === 'number' ? fi.confidence : 0.5,
1003           };
1004         }
1005         fieldIdentitiesByType.set(dt, identities);
1006       }
1007     }
1008   }
1009
1010   // HF-228 — schema-coverage extension. The 30-row insertion-order sample
1011   // above can land entirely on rows of one row-data schema even when a
1012   // data_type carries rows from multiple imports with different column sets
1013   // (e.g., roster rows + quota rows both classified `entity`). Walk the
1014   // remaining rows in `allRows` and admit at most one extra row per unseen
1015   // column-key signature, capped at 50 samples per data_type. Korean Test:
1016   // discrimination is by column-key structural signature, not by column
1017   // name semantics or values.
1018   for (const [dt, samples] of Array.from(byType.entries())) {
1019     const sigOf = (rd: Record<string, unknown>) =>
1020       Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
1021     const seenSignatures = new Set(samples.map(rd => sigOf(rd)));
1022     for (const row of allRows) {
1023       if (samples.length >= 50) break;
1024       if ((row.data_type as string) !== dt) continue;
1025       const rd = row.row_data as Record<string, unknown> | null;
1026       if (!rd) continue;
1027       const sig = sigOf(rd);
1028       if (seenSignatures.has(sig)) continue;
1029       samples.push(rd);
1030       seenSignatures.add(sig);
1031     }
1032   }
1033
1034   for (const [dataType, samples] of Array.from(byType.entries())) {
1035     const roles = rolesByType.get(dataType) || {};
1036     const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');
1037     const fieldIdentities = fieldIdentitiesByType.get(dataType) || {};
1038     const batchIds = Array.from(batchIdsByType.get(dataType) || new Set<string>());
1039
1040     const cap: DataCapability = {
1041       dataType,
1042       rowCount: countByType.get(dataType) || 0,
1043       numericFields: [],
1044       categoricalFields: [],
1045       booleanFields: [],
1046       semanticRoles: roles,
1047       hasTargetData: !!targetFieldEntry,
1048       targetField: targetFieldEntry?.[0],
1049       fieldIdentities,
1050       batchIds,
1051       columnStats: {},
1052     };
1053
1054     if (samples.length === 0) {
1055       capabilities.push(cap);
1056       continue;
1057     }
1058
1059     const allKeys = new Set<string>();
1060     for (const sample of samples) {
1061       for (const key of Object.keys(sample)) {
1062         if (!key.startsWith('_')) allKeys.add(key);
1063       }
1064     }
1065
1066     for (const key of Array.from(allKeys)) {
1067       const values = samples.map(s => s[key]).filter(v => v !== null && v !== undefined);
1068       if (values.length === 0) continue;
1069
1070       const numericValues = values.filter(v => typeof v === 'number') as number[];
1071       const stringValues = values.filter(v => typeof v === 'string') as string[];
1072
1073       if (numericValues.length > values.length * 0.5) {
1074         const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
1075         if (avg > 100 && (avg < 43000 || avg > 48000)) {
1076           cap.numericFields.push({ field: key, avg, nonNullCount: numericValues.length });
1077         }
1078         // HF-111: Collect per-column value stats for boundary matching
1079         // Include ALL numeric columns (not just the filtered ones above)
1080         const minVal = Math.min(...numericValues);
1081         const maxVal = Math.max(...numericValues);
1082         cap.columnStats[key] = { min: minVal, max: maxVal, mean: avg, sampleCount: numericValues.length };
1083       }
1084
1085       // HF-111: Also parse numeric strings (e.g., "0.85", "265625")
1086       if (numericValues.length <= values.length * 0.5 && stringValues.length > 0) {
1087         const parsedNums: number[] = [];
1088         for (const sv of stringValues) {
1089           const p = parseFloat(sv.replace(/[,$\s]/g, ''));
1090           if (!isNaN(p)) parsedNums.push(p);
1091         }
1092         if (parsedNums.length > values.length * 0.5) {
1093           const avg = parsedNums.reduce((a, b) => a + b, 0) / parsedNums.length;
1094           cap.columnStats[key] = {
1095             min: Math.min(...parsedNums),
1096             max: Math.max(...parsedNums),
1097             mean: avg,
1098             sampleCount: parsedNums.length,
1099           };
1100         }
1101       }
1102
1103       if (stringValues.length > values.length * 0.5) {
1104         const distinctValues = Array.from(new Set(stringValues));
1105         if (distinctValues.length >= 2 && distinctValues.length <= 20) {
1106           if (distinctValues.length === 2) {
1107             const lower = distinctValues.map(v => v.toLowerCase());
1108             const isBoolLike = lower.some(v => ['yes', 'no', 'sí', 'si', 'true', 'false', 'qualified', 'not qualified'].includes(v));
1109             if (isBoolLike) {
1110               const trueVal = distinctValues.find(v => ['yes', 'sí', 'si', 'true', 'qualified'].includes(v.toLowerCase()));
1111               const falseVal = distinctValues.find(v => v !== trueVal);
1112               cap.booleanFields.push({
1113                 field: key,
1114                 trueValue: trueVal || distinctValues[0],
1115                 falseValue: falseVal || distinctValues[1],
1116               });
1117               continue;
1118             }
1119           }
1120           cap.categoricalFields.push({
1121             field: key,
1122             distinctValues,
1123             count: stringValues.length,
1124           });
1125         }
1126       }
1127     }
1128
1129     capabilities.push(cap);
1130   }
1131
1132   return capabilities;
1133 }
```

### 3.2 Runtime CRP probe output (verbatim from `npx tsx scripts/diag049-probe.ts` against tenant `e44bbcb1-2710-4880-8c7d-a1bd902720b7`)

Script source: `web/scripts/diag049-probe.ts` (committed as part of this DIAG). Replicates `inventoryData`'s 500-row fetch + grouping but uses a simpler categorical/numeric heuristic (string values with distinct count ≤ 20 → categorical; >30% numeric → numeric). Supersession filter not applied — this is a raw read of `committed_data` for the tenant.

```
data_type="transaction" (444 rows):
  categorical fields (6):
    order_type (2 values): ["New Sale","Cross-Sell"]
    product_name (9 values): ["Catheter Kit","Contrast Agent","CT Unit","Consumable Bundle","Imaging Plates","Surgical Robot","Maintenance Kit","Sterilization Pack","Bandage Supply"]
    customer_name (16 values): ["Clinic-653","Clinic-559","Clinic-216","Clinic-492","Hospital-381","Hospital-716","Clinic-163","Clinic-651","Hospital-204","Clinic-794","Clinic-856","Clinic-520","Hospital-925","Clinic-890","Clinic-583","Clinic-202"]
    sales_rep_name (8 values): ["Jason Wu","Tyler Morrison","Fatima Al-Rashid","Samuel Osei","Rachel Green","Maya Johnson","Brian Foster","Priya Sharma"]
    transaction_id (16 values): ["CN-0247","CN-0254","CN-0253","CN-0005","EQ-0001","XS-0002","CN-0008","CN-0013","EQ-0002","CN-0307","CN-0369","CN-0382","XS-0075","CN-0426","CN-0142","CN-0174"]
    product_category (2 values): ["Consumables","Capital Equipment"]
  numeric fields: date, quantity, unit_price, total_amount

data_type="entity" (32 rows):
  categorical fields (6):
    region (3 values): ["SE","NE",""]
    status (1 values): ["Active"]
    district (5 values): ["SE-GS","NE-NE","NE-MA","SE-CR",""]
    job_title (5 values): ["District Manager","Senior Rep","Rep","Sales Operations","Regional VP"]
    department (2 values): ["Sales","Sales Operations"]
    reports_to (8 values): ["Diana Reeves","James Whitfield","Sarah Okonkwo","Robert Vasquez","Elena Marchetti","CRP-6006","","Marcus Chen"]
  numeric fields: hire_date

data_type="target" (24 rows):
  categorical fields (2):
    plan (1 values): ["Consumables"]
    role (2 values): ["Rep","Senior Rep"]
  numeric fields: monthly_quota, effective_date
```

(Note: the probe's `distinctCount ≤ 20` ceiling matches the production code at `convergence-service.ts:1105`. The probe does NOT replicate the `>= 2` floor used in production (`convergence-service.ts:1105`: `if (distinctValues.length >= 2 && distinctValues.length <= 20)`); the `data_type="target"` `plan` field above (1 distinct value) would be rejected by production code. Similarly the probe does NOT replicate the `stringValues.length > values.length * 0.5` majority-string filter from `convergence-service.ts:1103`. Architect interprets relative to the production thresholds.)

---

## Phase 4 — generateAISemanticDerivations current state

### 4.1 `MetricContext` type, verbatim (`convergence-service.ts:42-57`)

```typescript
42 interface MetricContext {
43   name: string;          // Programmatic metric name (e.g., "period_equipment_revenue")
44   label: string;         // Human-readable label (e.g., "Period Equipment Revenue")
45   componentName: string; // Owning component name for additional context
46   operation: string;     // Calculation operation (e.g., "linear_function")
47   scope?: string;        // Scope level for scope_aggregate (e.g., "district")
48   semanticIntent?: string;             // HF-198 E5: AI plan-agent reasoning text (per metric_comprehension signal)
49   metricInputs?: Record<string, unknown> | null;  // HF-198 E5: input shape from plan-agent (per metric_comprehension signal)
50   // HF-226 Phase 2A — Carry Everything from the plan-agent signal (T1-E902).
51   // The full signal_value flows through so downstream prompt builders can
52   // surface any field the LLM emitted (filters, expectedMetrics, calculationMethod,
53   // free-form predicate vocabulary). semanticIntent and metricInputs above are
54   // retained for backward compatibility with existing extractions; new consumers
55   // read directly off signalContext.
56   signalContext?: Record<string, unknown> | null;
57 }
```

### 4.2 `generateAISemanticDerivations` function body, verbatim (`convergence-service.ts:2622-2868`)

```typescript
2622 async function generateAISemanticDerivations(
2623   metricContexts: MetricContext[],
2624   capabilities: DataCapability[],
2625   supabase: SupabaseClient,
2626   tenantId: string,
2627 ): Promise<{ derivations: MetricDerivationRule[]; gaps: Array<{ metric: string; reason: string; resolution: string }> }> {
2628   const derivations: MetricDerivationRule[] = [];
2629   const gaps: Array<{ metric: string; reason: string; resolution: string }> = [];
2630
2631   if (metricContexts.length === 0) return { derivations, gaps };
2632   const unresolvedMetrics = metricContexts.map(mc => mc.name);
2633
2634   // 1. Build column inventory for AI
2635   const columnDescriptions: string[] = [];
2636   for (const cap of capabilities) {
2637     columnDescriptions.push(`Data type: "${cap.dataType}" (${cap.rowCount} rows)`);
2638     for (const nf of cap.numericFields) {
2639       const stats = cap.columnStats[nf.field];
2640       columnDescriptions.push(`  - ${nf.field}: numeric (avg=${nf.avg.toFixed(2)}${stats ? `, min=${stats.min}, max=${stats.max}` : ''})`);
2641     }
2642     for (const cf of cap.categoricalFields) {
2643       columnDescriptions.push(`  - ${cf.field}: categorical (values: ${cf.distinctValues.join(', ')})`);
2644     }
2645     for (const bf of cap.booleanFields) {
2646       columnDescriptions.push(`  - ${bf.field}: boolean (true="${bf.trueValue}", false="${bf.falseValue}")`);
2647     }
2648   }
2649
2650   // 2. Get sample rows
2651   // HF-196 Phase 1E: filter out superseded batches per Rule 30.
2652   const { fetchSupersededBatchIds: fetchSupersededBatchIds2 } = await import('@/lib/sci/import-batch-supersession');
2653   const supersededIds3 = await fetchSupersededBatchIds2(supabase, tenantId);
2654   let q3 = supabase
2655     .from('committed_data')
2656     .select('row_data')
2657     .eq('tenant_id', tenantId)
2658     .not('row_data', 'is', null)
2659     .limit(3);
2660   if (supersededIds3.length > 0) q3 = q3.not('import_batch_id', 'in', `(${supersededIds3.join(',')})`);
2661   const { data: sampleRows } = await q3;
2662
2663   const sampleData = (sampleRows || []).map(r => r.row_data);
2664
2665   // 3. Build AI prompt — enriched with metric labels, component context (OB-191),
2666   // and HF-198 E5 plan-agent semantic intent from comprehension:plan_interpretation
2667   // signals (read before derive per AUD-004 v3 §2 E5).
2668   // Korean Test: No hardcoded field names. AI receives column metadata and sample values at runtime.
2669   const metricDescriptions = metricContexts.map(mc => {
2670     let desc = `- ${mc.name} (label: "${mc.label}", used in: ${mc.operation}, component: "${mc.componentName}")`;
2671     if (mc.scope) desc += `\n  NOTE: This metric should be aggregated at the ${mc.scope} scope level`;
2672     if (mc.semanticIntent) desc += `\n  PLAN-AGENT INTENT: ${mc.semanticIntent}`;
2673     if (mc.metricInputs && Object.keys(mc.metricInputs).length > 0) {
2674       try {
2675         desc += `\n  PLAN-AGENT INPUTS: ${JSON.stringify(mc.metricInputs).slice(0, 240)}`;
2676       } catch {}
2677     }
2678     // HF-226 Phase 2A: surface the full plan-agent signal_value (minus already-
2679     // emitted keys) so the AI sees any extension fields the LLM expressed —
2680     // calculationMethod, filters, expectedMetrics, free-form predicate
2681     // vocabulary, etc. Pass-4 already instructs the AI to identify categorical
2682     // subsets; richer context strengthens that determination.
2683     if (mc.signalContext) {
2684       const sc = mc.signalContext;
2685       const skip = new Set(['metric_label', 'metric_op', 'metric_inputs', 'semantic_intent', 'component_id', 'component_type', 'source_evidence']);
2706       const extras: Record<string, unknown> = {};
2687       for (const [k, v] of Object.entries(sc)) {
2688         if (skip.has(k)) continue;
2689         if (v == null) continue;
2690         extras[k] = v;
2691       }
2692       if (Object.keys(extras).length > 0) {
2693         try {
2694           desc += `\n  PLAN-AGENT FULL CONTEXT: ${JSON.stringify(extras).slice(0, 480)}`;
2695         } catch {}
2696       }
2697     }
2698     return desc;
2699   }).join('\n');
2700
2701   const userPrompt = `You are a data analyst bridging calculation plan metrics to available data columns.
2702
2703 You receive:
2704 1. Required metrics with semantic labels describing what each metric represents
2705 2. Available data columns with types, statistics, and categorical values
2706
2707 Your task: For each required metric, determine how to derive it from the available data.
2708
2709 IMPORTANT RULES:
2710 - Match the metric's semantic label to available data fields. If the label suggests a subset of a broader numeric field (e.g., "Equipment Revenue" from a general "total_amount"), identify the categorical field and value that filters to the correct subset.
2711 - Use the categorical field's distinct values to find exact filter matches. The filter value must be one of the listed distinct values.
2712 - For count metrics (e.g., "Deal Count", "Cross Sell Count"), use the "count" operation with appropriate filters.
2713 - For metrics with a scope note, the derivation defines how to compute the metric per entity — the platform handles scope aggregation separately.
2714
2715 Operations:
2716 - sum: SUM a numeric field, optionally filtered by a categorical field value
2717 - count: COUNT rows, optionally filtered by a categorical field value
2718 - ratio: Divide one derived metric by another
2719 - delta: Difference between two values
2720
2721 Respond with ONLY valid JSON, no markdown, no explanation:
2722 {
2723   "derivations": [
2724     {
2725       "metric": "the_metric_name",
2726       "operation": "sum",
2727       "source_field": "column_name_to_aggregate",
2728       "filters": [
2729         { "field": "column_name", "operator": "eq", "value": "filter_value" }
2730       ]
2731     }
2732   ],
2733   "gaps": [
2734     {
2735       "metric": "the_metric_name",
2736       "reason": "Why this metric cannot be derived",
2737       "resolution": "What data the user should import"
2738     }
2739   ]
2740 }
2741
2742 Required metrics:
2743 ${metricDescriptions}
2744
2745 Available data columns:
2746 ${columnDescriptions.join('\n')}
2747
2748 Data sample (first ${sampleData.length} rows):
2749 ${JSON.stringify(sampleData, null, 2)}
2750
2751 Generate derivation rules for each required metric. Use filters to narrow broad fields to specific subsets when the metric label implies a category.`;
2752
2753   // 4. Call AI
2754   try {
2755     const aiService = getAIService();
2756     const response = await aiService.execute({
2757       task: 'natural_language_query',
2758       input: { question: userPrompt, context: {} },
2759       options: { responseFormat: 'json', maxTokens: 4096, temperature: 0 },
2760     }, false);
2761
2762     // 5. Parse response — handle different response shapes
2763     let parsedResult: Record<string, unknown> = response.result as Record<string, unknown>;
2764     // If wrapped in natural_language_query response format, extract from answer
2765     if (parsedResult?.answer && typeof parsedResult.answer === 'string') {
2766       try {
2767         parsedResult = JSON.parse(parsedResult.answer);
2768       } catch {
2769         // answer might already be an object or unparseable
2770       }
2771     }
2772     // If the result itself has derivations, use it directly
2773     const aiDerivations = (parsedResult?.derivations as Array<Record<string, unknown>>) ?? [];
2774     const aiGaps = (parsedResult?.gaps as Array<Record<string, unknown>>) ?? [];
2775
2776     if (Array.isArray(aiDerivations)) {
2777       for (const d of aiDerivations) {
2778         const metric = String(d.metric || '');
2779         const operation = String(d.operation || 'sum');
2780         if (!metric || !unresolvedMetrics.includes(metric)) continue;
2781
2782         // Validate operation is a valid MetricDerivationRule operation
2783         const validOps = ['sum', 'count', 'ratio', 'delta'];
2784         if (!validOps.includes(operation)) continue;
2785
2786         // Find the data_type that contains the source_field
2787         let sourcePattern = '.*';
2788         for (const cap of capabilities) {
2789           const hasField = cap.numericFields.some(f => f.field === d.source_field) ||
2790             cap.categoricalFields.some(f => f.field === d.source_field) ||
2791             (Array.isArray(d.filters) && d.filters.some((df: Record<string, unknown>) =>
2792               cap.categoricalFields.some(f => f.field === df.field)
2793             ));
2794           if (hasField) {
2795             sourcePattern = cap.dataType;
2796             break;
2797           }
2798         }
2799
2800         const filters: MetricDerivationRule['filters'] = [];
2801         if (Array.isArray(d.filters)) {
2802           for (const f of d.filters as Array<Record<string, unknown>>) {
2803             if (f.field && f.value != null) {
2804               filters.push({
2805                 field: String(f.field),
2806                 operator: (String(f.operator || 'eq') as MetricDerivationRule['filters'][0]['operator']),
2807                 value: f.value as string | number | boolean,
2808               });
2809             }
2810           }
2811         }
2812
2813         // HF-226 Phase 2B — Carry Everything (T1-E902). Spread the AI's raw
2814         // derivation output first; overlay the validated typed fields. Any
2815         // additional fields the AI emitted (confidence, reasoning, scope, or
2816         // future schema extensions) land on the rule via the spread; the
2817         // engine's deterministic execution path reads only the typed fields
2818         // it knows. Future intelligence consumers (signals, observatory,
2819         // debugging) can read the carried context without an emitter change.
2820         derivations.push({
2821           ...d,
2822           metric,
2823           operation: operation as MetricDerivationRule['operation'],
2824           source_pattern: sourcePattern,
2825           source_field: d.source_field ? String(d.source_field) : undefined,
2826           filters,
2827         });
2828       }
2829     }
2830
2831     if (Array.isArray(aiGaps)) {
2832       for (const g of aiGaps) {
2833         gaps.push({
2834           metric: String(g.metric || ''),
2835           reason: String(g.reason || 'Not derivable from available data'),
2836           resolution: String(g.resolution || 'Import data containing this metric'),
2837         });
2838       }
2839     }
2840
2841     // 6. Check for metrics that AI didn't address
2842     const addressedMetrics = new Set([
2843       ...derivations.map(d => d.metric),
2844       ...gaps.map(g => g.metric),
2845     ]);
2846     for (const m of unresolvedMetrics) {
2847       if (!addressedMetrics.has(m)) {
2848         gaps.push({
2849           metric: m,
2850           reason: 'AI did not produce a derivation or gap for this metric',
2851           resolution: 'Configure metric derivation rules manually',
2852         });
2853       }
2854     }
2855   } catch (err) {
2856     console.error('[Convergence] OB-185 Pass 4 AI call failed:', err);
2857     // Non-blocking — return gaps for all unresolved metrics
2858     for (const m of unresolvedMetrics) {
2859       gaps.push({
2860         metric: m,
2861         reason: 'AI semantic derivation failed — manual configuration required',
2862         resolution: 'Configure metric derivation rules in plan settings',
2863       });
2864     }
2865   }
2866
2867   return { derivations, gaps };
2868 }
```

(Paste note: my line-numbering counted at 2706 in the inline copy above for what is line 2686 in the live file at the `extras` declaration; this is a paste-editor numbering glitch only. The original file at lines 2683-2697 is the `if (mc.signalContext)` block as shown. Production code is the live file; this diagnostic does not modify it.)

### 4.3 `metricContexts` construction — verbatim from `convergeBindings` (`convergence-service.ts:627-667`, already pasted in Phase 2.2)

`metricContexts` is built in `convergeBindings` and passed to `generateAISemanticDerivations` as the first parameter. Construction code in Phase 2.2 above, lines 627-667. Each `MetricContext` object carries `name`, `label`, `componentName`, `operation`, optional `scope`, optional `semanticIntent`, optional `metricInputs`, optional `signalContext`. No data-column references are added at this layer — the AI sees them via the second parameter (`capabilities`) which `generateAISemanticDerivations` formats into `columnDescriptions` at lines 2635-2648.

---

## Phase 5 — HF-228 and HF-234 diffs

### 5.1 HF-228 merge commit list (from `git log --all --oneline | grep -iE 'hf.?228'`)

```
eba2cfc4 Merge pull request #406 from CCAFRICA/hf-228-platform-data-aperture
55a040c7 HF-228: completion report -- append final build output
258a7b90 HF-228: completion report per Rules 25-28
df14075d HF-228 Phase 5: null safety in resolveSource
3b9981b9 HF-228 Phase 4: metric_derivations execution in production entity loop
be1e6ec3 HF-228 Phase 3: cross-data-type column discovery in generateAllComponentBindings
ca12978e HF-228 Phase 2: inventoryData schema-aware sampling
ff23c183 HF-228 Phase 1: SCI referential classification signal
3550d5de HF-228 Phase 0: diagnostic -- read current state
8e557460 HF-228 Phase 0: commit directive prompt (Rule 5)
```

### 5.2 HF-228 diff against parent, for `convergence-service.ts` only (`git diff eba2cfc4^1..eba2cfc4 -- web/src/lib/intelligence/convergence-service.ts | head -200`)

```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index d9469001..d0484ecc 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -997,6 +997,30 @@ async function inventoryData(
     }
   }

+  // HF-228 — schema-coverage extension. The 30-row insertion-order sample
+  // above can land entirely on rows of one row-data schema even when a
+  // data_type carries rows from multiple imports with different column sets
+  // (e.g., roster rows + quota rows both classified `entity`). Walk the
+  // remaining rows in `allRows` and admit at most one extra row per unseen
+  // column-key signature, capped at 50 samples per data_type. Korean Test:
+  // discrimination is by column-key structural signature, not by column
+  // name semantics or values.
+  for (const [dt, samples] of Array.from(byType.entries())) {
+    const sigOf = (rd: Record<string, unknown>) =>
+      Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
+    const seenSignatures = new Set(samples.map(rd => sigOf(rd)));
+    for (const row of allRows) {
+      if (samples.length >= 50) break;
+      if ((row.data_type as string) !== dt) continue;
+      const rd = row.row_data as Record<string, unknown> | null;
+      if (!rd) continue;
+      const sig = sigOf(rd);
+      if (seenSignatures.has(sig)) continue;
+      samples.push(rd);
+      seenSignatures.add(sig);
+    }
+  }
+
   for (const [dataType, samples] of Array.from(byType.entries())) {
     const roles = rolesByType.get(dataType) || {};
     const targetFieldEntry = Object.entries(roles).find(([, role]) => role === 'performance_target');
@@ -2241,6 +2265,41 @@ async function generateAllComponentBindings(
       aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
     }
   }
+
+  // HF-228 — cross-data-type column discovery. Pre-HF-228 `measureColumns`
+  // was built only from capabilities whose data_type appears in `matches`;
+  // unmatched capabilities contributed no columns and were invisible to
+  // resolveColumnMappingsViaAI. For plans that combine transaction-style
+  // measures with reference/target-style metrics from a different data_type
+  // (e.g., a per-entity quota living on `target` data alongside revenue on
+  // `transaction` data), the cross-source metric could not be resolved.
+  // The cross-source columns are tagged `contextualIdentity: 'cross_source_numeric'`
+  // with lower confidence (0.4) so the AI naturally prefers primary
+  // (matched-capability) columns for principal metrics and uses cross-source
+  // columns only for supplementary metrics. Categorical fields from
+  // unmatched capabilities also flow through for filter discovery.
+  // Korean Test: structural type classification + numeric-field discovery,
+  // no column-name matching.
+  const matchedDataTypes = new Set(matches.map(m => m.dataType));
+  for (const cap of capabilities) {
+    if (matchedDataTypes.has(cap.dataType)) continue;
+    for (const nf of cap.numericFields) {
+      if (!measureColumns.some(mc => mc.name === nf.field) && cap.columnStats[nf.field]) {
+        measureColumns.push({
+          name: nf.field,
+          fi: { structuralType: 'measure', contextualIdentity: 'cross_source_numeric', confidence: 0.4 },
+          stats: cap.columnStats[nf.field],
+          batchId: cap.batchIds[0] || '',
+        });
+      }
+    }
+    for (const cf of cap.categoricalFields || []) {
+      if (seenCategoricalFields.has(cf.field)) continue;
+      seenCategoricalFields.add(cf.field);
+      aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
+    }
+  }
+
   console.log('[Convergence] HF-112 Requesting AI column mapping');
   const aiMapping = await resolveColumnMappingsViaAI(
     components,
```

(Diff captured at default 3-line context; truncated by `head -200` as the directive specified.)

### 5.3 HF-234 merge commit list (from `git log --all --oneline | grep -iE 'hf.?234'`)

```
241c60af Merge pull request #412 from CCAFRICA/hf-234-convergence-separation-of-concerns
4c76f04a HF-234 Phase 4: completion report + CRP binding clear
5792e38f HF-234 Phase 3: convergence writes both bindings and derivations
36c0ac7d HF-234 Phase 2: Pass 4 fires for ALL metrics when categorical data exists
13727921 HF-234 Phase 1: remove categorical fields from Call 1 prompt
15c492df HF-234 Phase 0: diagnostic — convergence separation of concerns
```

### 5.4 HF-234 diff against parent, for `convergence-service.ts` only (`git diff 241c60af^1..241c60af -- web/src/lib/intelligence/convergence-service.ts | head -200`)

```diff
diff --git a/web/src/lib/intelligence/convergence-service.ts b/web/src/lib/intelligence/convergence-service.ts
index d0484ecc..7844d298 100644
--- a/web/src/lib/intelligence/convergence-service.ts
+++ b/web/src/lib/intelligence/convergence-service.ts
@@ -598,16 +598,26 @@ export async function convergeBindings(
   // 1-3 (generateDerivationsForMatch, removed above) had failed to resolve.
   // Removing that path means the `derivations` array entering this point
   // contains ONLY the targets-pair ratio derivations (from the actuals+target
-  // capability detection block). All remaining required metrics now flow
-  // through Pass 4 which carries the categorical-subset prompt and produces
-  // filter-populated rules — closing the filter-loss class identified in
-  // DIAG-046/047/AUD-009. The variable name `unresolvedForAI` is retained
-  // for backward git-blame readability; the set now spans "every required
-  // metric except those produced as a ratio above" rather than "unresolved
-  // by the deterministic match path".
+  // capability detection block).
+  //
+  // HF-234 — when capabilities carry categorical fields, ALL required metrics
+  // flow through Pass 4 regardless of whether earlier code added a derivation
+  // for them. Pass 4 is the surface where filter discovery happens, and any
+  // metric on data with categorical dimensions may need subsetting. Tenants
+  // without categorical data (e.g., Meridian — one metric per column) keep
+  // the prior gate so Pass 4 fires only for metrics not already resolved by
+  // the targets-pair ratio block.
+  //
+  // The variable name `unresolvedForAI` is retained for git-blame readability;
+  // its membership semantics depend on the categorical-data branch below.
+  const hasCategoricalData = capabilities.some(cap =>
+    (cap.categoricalFields?.length ?? 0) > 0,
+  );
   const allResolvedMetrics = new Set(derivations.map(d => d.metric));
   const allRequiredMetrics = Array.from(new Set(components.flatMap(c => c.expectedMetrics)));
-  const unresolvedForAI = allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));
+  const unresolvedForAI = hasCategoricalData
+    ? allRequiredMetrics
+    : allRequiredMetrics.filter(m => !allResolvedMetrics.has(m));

   if (unresolvedForAI.length > 0 && capabilities.length > 0) {
     // OB-191 / HF-198 E5: Build enriched metric context from calculationIntent
@@ -656,7 +666,7 @@ export async function convergeBindings(
       };
     });

-    console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} unresolved metrics — invoking AI semantic derivation`);
+    console.log(`[Convergence] OB-185 Pass 4: ${unresolvedForAI.length} metrics for AI semantic derivation (hasCategoricalData=${hasCategoricalData})`);
     for (const mc of metricContexts) {
       console.log(`[Convergence] Pass 4 metric: ${mc.name} (label: "${mc.label}", op: ${mc.operation}${mc.scope ? ', scope: ' + mc.scope : ''})`);
     }
@@ -1939,16 +1949,21 @@ export type ColumnMappingFilter = {
 };
 export type ColumnMappingValue = string | { column: string; filters?: ColumnMappingFilter[] };

-// One AI call: match plan metric field names to data column contextual identities
+// One AI call: match plan metric field names to data column contextual identities.
+//
+// HF-234 — separation of concerns: this call is the STRUCTURAL column-mapping
+// authority. It returns `{metric: column}` mappings only. Categorical-subset
+// filter discovery has moved to Pass 4 (generateAISemanticDerivations), which
+// produces metric_derivations rules that the engine applies AFTER role-bound
+// metric resolution. The prompt below no longer mentions categorical fields or
+// filter forms, so the LLM consistently returns the flat string shape that
+// `isValidColumnMapping` expects. Defensive object-form parsing in
+// `generateAllComponentBindings` is retained for backward compatibility.
 async function resolveColumnMappingsViaAI(
   components: PlanComponent[],
   allRequirements: Array<{ compIndex: number; compName: string; req: ComponentInputRequirement }>,
   measureColumns: Array<{ name: string; fi: FieldIdentity; stats: ColumnValueStats }>,
   metricComprehension: MetricComprehensionSignal[] = [], // HF-199 D2
-  // HF-227: Categorical fields with distinct values so the AI can identify
-  // categorical-subset opportunities at column-mapping time. Source comes from
-  // DataCapability.categoricalFields (Korean Test: runtime data, not code).
-  categoricalFields: Array<{ field: string; distinctValues: unknown[] }> = [],
 ): Promise<Record<string, ColumnMappingValue>> {
   const metricFields = allRequirements.map(r => r.req.metricField).filter(f => f !== 'unknown');
   const columnNames = measureColumns.map(c => c.name);
@@ -2001,24 +2016,14 @@ async function resolveColumnMappingsViaAI(
     `${i + 1}. "${c.name}" (${c.fi.contextualIdentity})`
   ).join('\n');

-  // HF-227: categorical-context block. When categorical fields are available
-  // they are listed with their distinct values so the AI can identify
-  // subsetting opportunities (e.g., a metric labelled as "revenue from a
-  // specific class" can be bound to a broader numeric column with a filter
-  // on the categorical class). Korean Test (E910): field names and values
-  // come from DataCapability at runtime, never from code literals.
-  const categoricalContext = categoricalFields.length > 0
-    ? `\n\nCATEGORICAL FIELDS (available for filtering):\n${
-        categoricalFields.map((cf, i) =>
-          `${i + 1}. "${cf.field}" — distinct values: ${JSON.stringify(cf.distinctValues.slice(0, 20))}`
-        ).join('\n')
-      }\n\nIf a metric label suggests a subset of a broader numeric field (e.g., a revenue metric that applies only to one product class, a sale count restricted to a specific transaction type), use a categorical field together with one of its distinct values as a filter. The filter value MUST be one of the listed distinct values. Use a plain string mapping when no filter is needed; use the object form when the metric requires categorical subsetting.`
-    : '';
-
   // HF-114 / HF-199 D2: User prompt now carries plan-agent semantic intent per metric
   // when comprehension:plan_interpretation signals are present (HF-198 E5 read).
   // System prompt is defined in SYSTEM_PROMPTS['convergence_mapping'] (anthropic-adapter.ts).
-  // HF-227: enriched output schema admits {column, filters} per mapping.
+  //
+  // HF-234 — categorical-context block REMOVED. Column mapping is structural;
+  // filter discovery belongs to Pass 4 (generateAISemanticDerivations) which
+  // produces metric_derivations rules consumed by the engine alongside these
+  // bindings. The prompt now asks for a single concern — pure column mapping.
   const userPrompt = `Match each metric field to the best data column. Each column used at most once.
 Plan-agent intent and inputs (when shown) are AUTHORITATIVE — bind columns that
 satisfy the stated intent over columns that merely share contextual labels.
@@ -2027,10 +2032,10 @@ METRIC FIELDS:
 ${metricList}

 DATA COLUMNS:
-${columnList}${categoricalContext}
+${columnList}

-EXAMPLE OUTPUT (plain string when no filter; object with filters when categorical subset applies):
-{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": {"column": "${columnNames[1] || 'Column_B'}", "filters": [{"field": "${categoricalFields[0]?.field || 'Category_Col'}", "operator": "eq", "value": ${JSON.stringify(categoricalFields[0]?.distinctValues?.[0] ?? 'Some_Category')}}]}}`;
+EXAMPLE OUTPUT (flat metric-to-column map):
+{"${metricFields[0] || 'metric_a'}": "${columnNames[0] || 'Column_A'}", "${metricFields[1] || 'metric_b'}": "${columnNames[1] || 'Column_B'}"}`;

   try {
     const aiService = getAIService();
@@ -2251,20 +2256,14 @@ async function generateAllComponentBindings(

   // HF-112 / HF-199 D2: AI-assisted column mapping (ONE call) with metric_comprehension
   // signals as authoritative semantic intent.
-  // HF-227: aggregate categorical fields across matched capabilities and pass
-  // them to the AI so it can identify categorical-subset opportunities
-  // (filters) at column-mapping time. Dedup by field name across capabilities.
-  const seenCategoricalFields = new Set<string>();
-  const aggregatedCategoricalFields: Array<{ field: string; distinctValues: unknown[] }> = [];
-  for (const match of matches) {
-    const cap = capabilities.find(c => c.dataType === match.dataType);
-    if (!cap) continue;
-    for (const cf of cap.categoricalFields || []) {
-      if (seenCategoricalFields.has(cf.field)) continue;
-      seenCategoricalFields.add(cf.field);
-      aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
-    }
-  }
+  //
+  // HF-234 — categorical-field aggregation REMOVED from this call site.
+  // Categorical-subset filter discovery has moved to Pass 4
+  // (generateAISemanticDerivations), which reads categoricalFields directly
+  // from the `capabilities` parameter and produces metric_derivations rules.
+  // The cross-data-type measure-column discovery below (HF-228) is preserved
+  // — it serves Call 1's structural column mapping for plans whose metrics
+  // span multiple capability data types.

   // HF-228 — cross-data-type column discovery. Pre-HF-228 `measureColumns`
   // was built only from capabilities whose data_type appears in `matches`;
@@ -2276,8 +2275,7 @@ async function generateAllComponentBindings(
   // The cross-source columns are tagged `contextualIdentity: 'cross_source_numeric'`
   // with lower confidence (0.4) so the AI naturally prefers primary
   // (matched-capability) columns for principal metrics and uses cross-source
-  // columns only for supplementary metrics. Categorical fields from
-  // unmatched capabilities also flow through for filter discovery.
+  // columns only for supplementary metrics.
   // Korean Test: structural type classification + numeric-field discovery,
   // no column-name matching.
   const matchedDataTypes = new Set(matches.map(m => m.dataType));
@@ -2293,11 +2291,6 @@ async function generateAllComponentBindings(
         });
       }
     }
-    for (const cf of cap.categoricalFields || []) {
-      if (seenCategoricalFields.has(cf.field)) continue;
-      seenCategoricalFields.add(cf.field);
-      aggregatedCategoricalFields.push({ field: cf.field, distinctValues: cf.distinctValues });
-    }
   }

   console.log('[Convergence] HF-112 Requesting AI column mapping');
@@ -2306,7 +2299,6 @@ async function generateAllComponentBindings(
     allRequirements,
     measureColumns,
     metricComprehension,
-    aggregatedCategoricalFields,
   );
   console.log(`[Convergence] HF-112 AI proposed ${Object.keys(aiMapping).length} mappings`);
```

(Diff captured at default 3-line context; truncated by `head -200` as the directive specified.)

