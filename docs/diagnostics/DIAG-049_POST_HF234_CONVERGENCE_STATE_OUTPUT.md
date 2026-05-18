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

