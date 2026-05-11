# E5.5a — `web/src/lib/sci/classification-signal-service.ts` (verbatim with line numbers)

**Total lines: 546**

```typescript
     1	// Classification Signal Service — SCI Spec Layer 6
     2	// HF-092 — Corrected to use dedicated columns (not signal_value JSONB blob)
     3	// Dev Plan v2 specification: indexed, queryable columns for scale.
     4	// Structural fingerprints use bucketed values (Korean Test: no field names)
     5	// Zero domain vocabulary. AP-31: presence-based only.
     6	
     7	import { createClient } from '@supabase/supabase-js';
     8	import type { ContentProfile } from './sci-types';
     9	import type { ClassificationTrace } from './synaptic-ingestion-state';
    10	
    11	// ============================================================
    12	// STRUCTURAL FINGERPRINT — Bucketed values for fuzzy matching
    13	// ============================================================
    14	
    15	export interface StructuralFingerprint {
    16	  columnCount: number;
    17	  numericFieldRatioBucket: string;      // '0-25' | '25-50' | '50-75' | '75-100'
    18	  categoricalFieldRatioBucket: string;
    19	  identifierRepeatBucket: string;       // '0-1' | '1-2' | '2-5' | '5-10' | '10+'
    20	  hasTemporalColumns: boolean;
    21	  hasIdentifier: boolean;
    22	  hasStructuralName: boolean;
    23	  rowCountBucket: string;               // 'small' | 'medium' | 'large' | 'enterprise'
    24	}
    25	
    26	export function computeStructuralFingerprint(profile: ContentProfile): StructuralFingerprint {
    27	  const bucketRatio = (r: number): string => {
    28	    if (r < 0.25) return '0-25';
    29	    if (r < 0.50) return '25-50';
    30	    if (r < 0.75) return '50-75';
    31	    return '75-100';
    32	  };
    33	
    34	  const bucketRepeat = (r: number): string => {
    35	    if (r <= 1) return '0-1';
    36	    if (r <= 2) return '1-2';
    37	    if (r <= 5) return '2-5';
    38	    if (r <= 10) return '5-10';
    39	    return '10+';
    40	  };
    41	
    42	  const bucketRows = (n: number): string => {
    43	    if (n < 50) return 'small';
    44	    if (n < 500) return 'medium';
    45	    if (n < 5000) return 'large';
    46	    return 'enterprise';
    47	  };
    48	
    49	  return {
    50	    columnCount: profile.structure.columnCount,
    51	    numericFieldRatioBucket: bucketRatio(profile.structure.numericFieldRatio),
    52	    categoricalFieldRatioBucket: bucketRatio(profile.structure.categoricalFieldRatio),
    53	    identifierRepeatBucket: bucketRepeat(profile.structure.identifierRepeatRatio),
    54	    hasTemporalColumns: profile.patterns.hasTemporalColumns,
    55	    hasIdentifier: profile.patterns.hasEntityIdentifier,
    56	    hasStructuralName: profile.patterns.hasStructuralNameColumn,
    57	    rowCountBucket: bucketRows(profile.structure.rowCount),
    58	  };
    59	}
    60	
    61	// ============================================================
    62	// OB-199 Phase 4 (DS-023 §5.1 coverage-trust closure):
    63	//
    64	// writeClassificationSignal function DELETED. The function was a parallel
    65	// write surface (dedicated-columns path) that bypassed the JSONB-path
    66	// signal-persistence.ts; its existence was the structural cause of AUD-001
    67	// F-002 ("dual write architecture") which survived two prior audit cycles
    68	// (AUD-001 marked P1; AUD-004 v3 omitted from closure map; AUD-006 §1.1
    69	// F-AUD-006-004 re-surfaced as P1).
    70	//
    71	// All 5 prior callers (api/import/sci/execute, api/import/sci/process-job,
    72	// api/import/sci/analyze, api/intelligence/converge :95 + :120) now call
    73	// `writeSignal` from `@/lib/intelligence/canonical-signal-writer` directly
    74	// with the canonical input shape that unifies the JSONB and dedicated-
    75	// columns insert payloads (DS-023 §5.1). The dedicated columns
    76	// (source_file_name, sheet_name, structural_fingerprint, classification,
    77	// decision_source, classification_trace, vocabulary_bindings, agent_scores,
    78	// human_correction_from, scope) are first-class fields on
    79	// `CanonicalSignalInput` and persist when the caller provides them.
    80	//
    81	// ClassificationSignalPayload TYPE preserved for any caller that still
    82	// constructs the shape internally (not deleted, just orphaned at this site).
    83	// ============================================================
    84	
    85	export interface ClassificationSignalPayload {
    86	  tenantId: string;
    87	  sourceFileName: string;
    88	  sheetName: string;
    89	  fingerprint: StructuralFingerprint;
    90	  classification: string;
    91	  confidence: number;
    92	  decisionSource: string;
    93	  classificationTrace: ClassificationTrace;
    94	  vocabularyBindings: Record<string, string> | null;
    95	  agentScores: Record<string, number>;
    96	  humanCorrectionFrom: string | null;
    97	  calculationRunId?: string;
    98	}
    99	
   100	// ============================================================
   101	// PRIOR SIGNAL LOOKUP — Called BEFORE scoring
   102	// Queries DEDICATED COLUMNS, not signal_value JSONB (HF-092)
   103	// ============================================================
   104	
   105	export interface PriorSignal {
   106	  classification: string;
   107	  confidence: number;
   108	  source: string;
   109	  fingerprintMatch: boolean;
   110	  signalId: string;
   111	}
   112	
   113	export async function lookupPriorSignals(
   114	  tenantId: string,
   115	  fingerprint: StructuralFingerprint,
   116	  supabaseUrl: string,
   117	  supabaseServiceKey: string,
   118	  domainId?: string,
   119	): Promise<PriorSignal[]> {
   120	  try {
   121	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   122	
   123	    const { data, error } = await supabase
   124	      .from('classification_signals')
   125	      .select('id, classification, confidence, decision_source, structural_fingerprint')
   126	      .eq('tenant_id', tenantId)
   127	      .eq('scope', 'tenant')
   128	      .order('created_at', { ascending: false })
   129	      .limit(20);
   130	
   131	    if (error || !data) {
   132	      console.error('[SCI Signal] Prior lookup failed:', error?.message);
   133	      return [];
   134	    }
   135	
   136	    const tenantPriors = data
   137	      .filter(row => {
   138	        const stored = row.structural_fingerprint as StructuralFingerprint | null;
   139	        return stored && matchesFingerprint(stored, fingerprint);
   140	      })
   141	      .map(row => ({
   142	        classification: row.classification as string,
   143	        confidence: row.confidence ?? 0,
   144	        source: (row.decision_source as string) ?? 'unknown',
   145	        fingerprintMatch: true,
   146	        signalId: row.id,
   147	      }));
   148	
   149	    if (tenantPriors.length > 0) {
   150	      return tenantPriors;
   151	    }
   152	
   153	    // OB-160J: Domain fallback — industry-specific structural patterns
   154	    if (domainId) {
   155	      const domainPriors = await lookupDomainPriors(fingerprint, domainId, supabaseUrl, supabaseServiceKey);
   156	      if (domainPriors.length > 0) return domainPriors;
   157	    }
   158	
   159	    // OB-160I: Foundational fallback — cross-tenant structural patterns
   160	    // Only queried when no tenant or domain priors exist (cold start)
   161	    return await lookupFoundationalPriors(fingerprint, supabaseUrl, supabaseServiceKey);
   162	  } catch (err) {
   163	    console.error('[SCI Signal] Prior lookup exception:', err);
   164	    return [];
   165	  }
   166	}
   167	
   168	/**
   169	 * OB-160I: Query foundational_patterns for cross-tenant structural priors.
   170	 * Returns PriorSignal[] with source='foundational' for lower boost (+0.05 vs +0.10).
   171	 * Only structural fingerprint + classification outcome — zero tenant-identifiable info.
   172	 */
   173	async function lookupFoundationalPriors(
   174	  fingerprint: StructuralFingerprint,
   175	  supabaseUrl: string,
   176	  supabaseServiceKey: string,
   177	): Promise<PriorSignal[]> {
   178	  try {
   179	    const sig = fingerprintToSignature(fingerprint);
   180	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   181	
   182	    const { data, error } = await supabase
   183	      .from('foundational_patterns')
   184	      .select('id, pattern_signature, confidence_mean, total_executions, learned_behaviors')
   185	      .eq('pattern_signature', sig)
   186	      .maybeSingle();
   187	
   188	    if (error || !data) return [];
   189	
   190	    const row = data as { id: string; pattern_signature: string; confidence_mean: number; total_executions: number; learned_behaviors: Record<string, unknown> | null };
   191	    if (row.total_executions < 3) return []; // Require minimum evidence
   192	
   193	    // Extract the most common classification from learned_behaviors
   194	    const behaviors = row.learned_behaviors ?? {};
   195	    const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
   196	    const entries = Object.entries(dist);
   197	    if (entries.length === 0) return [];
   198	
   199	    entries.sort((a, b) => b[1] - a[1]);
   200	    const [topClassification, topCount] = entries[0];
   201	    const total = entries.reduce((sum, [, c]) => sum + c, 0);
   202	    const accuracy = topCount / total;
   203	
   204	    // Only return if the pattern is consistently classified (>= 60% agreement)
   205	    if (accuracy < 0.60) return [];
   206	
   207	    return [{
   208	      classification: topClassification,
   209	      confidence: row.confidence_mean * accuracy,
   210	      source: 'foundational',
   211	      fingerprintMatch: true,
   212	      signalId: row.id,
   213	    }];
   214	  } catch {
   215	    return [];
   216	  }
   217	}
   218	
   219	/**
   220	 * OB-160J: Query domain_patterns for industry-specific structural priors.
   221	 * Returns PriorSignal[] with source='domain' for medium boost (+0.07).
   222	 * Sharper than foundational because domain-specific patterns have higher signal.
   223	 */
   224	async function lookupDomainPriors(
   225	  fingerprint: StructuralFingerprint,
   226	  domainId: string,
   227	  supabaseUrl: string,
   228	  supabaseServiceKey: string,
   229	): Promise<PriorSignal[]> {
   230	  try {
   231	    const sig = fingerprintToSignature(fingerprint);
   232	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   233	
   234	    const { data, error } = await supabase
   235	      .from('domain_patterns')
   236	      .select('id, pattern_signature, confidence_mean, total_executions, learned_behaviors')
   237	      .eq('pattern_signature', sig)
   238	      .eq('domain_id', domainId)
   239	      .maybeSingle();
   240	
   241	    if (error || !data) return [];
   242	
   243	    const row = data as { id: string; confidence_mean: number; total_executions: number; learned_behaviors: Record<string, unknown> | null };
   244	    if (row.total_executions < 3) return [];
   245	
   246	    const behaviors = row.learned_behaviors ?? {};
   247	    const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
   248	    const entries = Object.entries(dist);
   249	    if (entries.length === 0) return [];
   250	
   251	    entries.sort((a, b) => b[1] - a[1]);
   252	    const [topClassification, topCount] = entries[0];
   253	    const total = entries.reduce((sum, [, c]) => sum + c, 0);
   254	    const accuracy = topCount / total;
   255	
   256	    if (accuracy < 0.60) return [];
   257	
   258	    return [{
   259	      classification: topClassification,
   260	      confidence: row.confidence_mean * accuracy,
   261	      source: 'domain',
   262	      fingerprintMatch: true,
   263	      signalId: row.id,
   264	    }];
   265	  } catch {
   266	    return [];
   267	  }
   268	}
   269	
   270	function matchesFingerprint(
   271	  stored: StructuralFingerprint,
   272	  current: StructuralFingerprint,
   273	): boolean {
   274	  return (
   275	    stored.numericFieldRatioBucket === current.numericFieldRatioBucket &&
   276	    stored.categoricalFieldRatioBucket === current.categoricalFieldRatioBucket &&
   277	    stored.identifierRepeatBucket === current.identifierRepeatBucket &&
   278	    stored.hasTemporalColumns === current.hasTemporalColumns &&
   279	    stored.hasIdentifier === current.hasIdentifier &&
   280	    stored.rowCountBucket === current.rowCountBucket
   281	  );
   282	}
   283	
   284	// ============================================================
   285	// CLASSIFICATION DENSITY — Adaptive execution for SCI
   286	// OB-160K: "The system does less work as it gets smarter"
   287	// ============================================================
   288	
   289	export type SCIExecutionMode = 'full_analysis' | 'light_analysis' | 'confident';
   290	
   291	export interface ClassificationDensity {
   292	  fingerprint: StructuralFingerprint;
   293	  confidence: number;
   294	  totalClassifications: number;
   295	  lastOverrideRate: number;
   296	  executionMode: SCIExecutionMode;
   297	}
   298	
   299	/**
   300	 * OB-160K: Compute classification density for a structural fingerprint.
   301	 * Queries recent classification_signals for this tenant + fingerprint.
   302	 * Returns density with execution mode determination.
   303	 *
   304	 * Thresholds:
   305	 * - full_analysis:  confidence < 0.70 OR totalClassifications < 5 OR overrideRate > 0.20
   306	 * - light_analysis: confidence 0.70-0.90 AND totalClassifications >= 5 AND overrideRate <= 0.20
   307	 * - confident:      confidence > 0.90 AND totalClassifications >= 10 AND overrideRate <= 0.05
   308	 */
   309	export async function computeClassificationDensity(
   310	  tenantId: string,
   311	  fingerprint: StructuralFingerprint,
   312	  supabaseUrl: string,
   313	  supabaseServiceKey: string,
   314	): Promise<ClassificationDensity> {
   315	  const defaultDensity: ClassificationDensity = {
   316	    fingerprint,
   317	    confidence: 0,
   318	    totalClassifications: 0,
   319	    lastOverrideRate: 0,
   320	    executionMode: 'full_analysis',
   321	  };
   322	
   323	  try {
   324	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   325	
   326	    const { data, error } = await supabase
   327	      .from('classification_signals')
   328	      .select('id, classification, confidence, decision_source, structural_fingerprint')
   329	      .eq('tenant_id', tenantId)
   330	      .eq('scope', 'tenant')
   331	      .order('created_at', { ascending: false })
   332	      .limit(50);
   333	
   334	    if (error || !data) return defaultDensity;
   335	
   336	    // Filter to matching fingerprints
   337	    const matching = data.filter(row => {
   338	      const stored = row.structural_fingerprint as StructuralFingerprint | null;
   339	      return stored && matchesFingerprint(stored, fingerprint);
   340	    });
   341	
   342	    if (matching.length === 0) return defaultDensity;
   343	
   344	    // Compute metrics
   345	    const totalClassifications = matching.length;
   346	    const avgConfidence = matching.reduce((sum, r) => sum + ((r.confidence as number) ?? 0), 0) / totalClassifications;
   347	    const overrides = matching.filter(r => r.decision_source === 'human_override').length;
   348	    const overrideRate = overrides / totalClassifications;
   349	
   350	    // Determine execution mode
   351	    let executionMode: SCIExecutionMode = 'full_analysis';
   352	    if (avgConfidence > 0.90 && totalClassifications >= 10 && overrideRate <= 0.05) {
   353	      executionMode = 'confident';
   354	    } else if (avgConfidence >= 0.70 && totalClassifications >= 5 && overrideRate <= 0.20) {
   355	      executionMode = 'light_analysis';
   356	    }
   357	
   358	    return {
   359	      fingerprint,
   360	      confidence: avgConfidence,
   361	      totalClassifications,
   362	      lastOverrideRate: overrideRate,
   363	      executionMode,
   364	    };
   365	  } catch {
   366	    return defaultDensity;
   367	  }
   368	}
   369	
   370	// ============================================================
   371	// FOUNDATIONAL AGGREGATION — Cross-tenant anonymized patterns
   372	// OB-160I: Wire SCI classification signals to flywheel
   373	// ============================================================
   374	
   375	/**
   376	 * Hash a structural fingerprint into a deterministic pattern_signature string.
   377	 * Used as the key in foundational_patterns and domain_patterns tables.
   378	 */
   379	export function fingerprintToSignature(fp: StructuralFingerprint): string {
   380	  return `sci:${fp.columnCount}:${fp.numericFieldRatioBucket}:${fp.categoricalFieldRatioBucket}:${fp.identifierRepeatBucket}:${fp.hasTemporalColumns ? 1 : 0}:${fp.hasIdentifier ? 1 : 0}:${fp.hasStructuralName ? 1 : 0}:${fp.rowCountBucket}`;
   381	}
   382	
   383	/**
   384	 * Aggregate a classification signal into foundational_patterns.
   385	 * PRIVACY: Strips tenant_id, file names, sheet names.
   386	 * Retains ONLY: structural fingerprint signature + classification + confidence.
   387	 * Fire-and-forget — failure must never block signal write.
   388	 *
   389	 * OB-160I: Connects SCI classification pipeline to Flywheel 2.
   390	 */
   391	export async function aggregateToFoundational(
   392	  fingerprint: StructuralFingerprint,
   393	  classification: string,
   394	  confidence: number,
   395	  supabaseUrl: string,
   396	  supabaseServiceKey: string,
   397	): Promise<void> {
   398	  try {
   399	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   400	    const sig = fingerprintToSignature(fingerprint);
   401	
   402	    const { data: existing } = await supabase
   403	      .from('foundational_patterns')
   404	      .select('id, confidence_mean, total_executions, tenant_count, learned_behaviors')
   405	      .eq('pattern_signature', sig)
   406	      .maybeSingle();
   407	
   408	    if (existing) {
   409	      // EMA update (weight 0.1 = recent signal has 10% influence)
   410	      const newConfidence = existing.confidence_mean * 0.9 + confidence * 0.1;
   411	      const behaviors = (existing.learned_behaviors as Record<string, unknown>) ?? {};
   412	      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
   413	      dist[classification] = (dist[classification] ?? 0) + 1;
   414	
   415	      await supabase
   416	        .from('foundational_patterns')
   417	        .update({
   418	          confidence_mean: newConfidence,
   419	          total_executions: existing.total_executions + 1,
   420	          learned_behaviors: { ...behaviors, classification_distribution: dist },
   421	          updated_at: new Date().toISOString(),
   422	        })
   423	        .eq('id', existing.id);
   424	    } else {
   425	      await supabase
   426	        .from('foundational_patterns')
   427	        .insert({
   428	          pattern_signature: sig,
   429	          confidence_mean: confidence,
   430	          total_executions: 1,
   431	          tenant_count: 1,
   432	          anomaly_rate_mean: 0,
   433	          learned_behaviors: {
   434	            classification_distribution: { [classification]: 1 },
   435	          },
   436	        });
   437	    }
   438	  } catch {
   439	    // Fire-and-forget — aggregation failure must never block the signal pipeline
   440	  }
   441	}
   442	
   443	/**
   444	 * Aggregate a classification signal into domain_patterns.
   445	 * Same privacy guarantees as foundational. Additionally keyed by domainId.
   446	 * OB-160J: Connects SCI classification pipeline to Flywheel 3.
   447	 */
   448	export async function aggregateToDomain(
   449	  fingerprint: StructuralFingerprint,
   450	  classification: string,
   451	  confidence: number,
   452	  domainId: string,
   453	  supabaseUrl: string,
   454	  supabaseServiceKey: string,
   455	): Promise<void> {
   456	  if (!domainId) return; // No domain tag → skip domain aggregation
   457	
   458	  try {
   459	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   460	    const sig = fingerprintToSignature(fingerprint);
   461	
   462	    const { data: existing } = await supabase
   463	      .from('domain_patterns')
   464	      .select('id, confidence_mean, total_executions, tenant_count, learned_behaviors')
   465	      .eq('pattern_signature', sig)
   466	      .eq('domain_id', domainId)
   467	      .maybeSingle();
   468	
   469	    if (existing) {
   470	      const newConfidence = existing.confidence_mean * 0.9 + confidence * 0.1;
   471	      const behaviors = (existing.learned_behaviors as Record<string, unknown>) ?? {};
   472	      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
   473	      dist[classification] = (dist[classification] ?? 0) + 1;
   474	
   475	      await supabase
   476	        .from('domain_patterns')
   477	        .update({
   478	          confidence_mean: newConfidence,
   479	          total_executions: existing.total_executions + 1,
   480	          learned_behaviors: { ...behaviors, classification_distribution: dist },
   481	          updated_at: new Date().toISOString(),
   482	        })
   483	        .eq('id', existing.id);
   484	    } else {
   485	      await supabase
   486	        .from('domain_patterns')
   487	        .insert({
   488	          pattern_signature: sig,
   489	          domain_id: domainId,
   490	          confidence_mean: confidence,
   491	          total_executions: 1,
   492	          tenant_count: 1,
   493	          learned_behaviors: {
   494	            classification_distribution: { [classification]: 1 },
   495	          },
   496	        });
   497	    }
   498	  } catch {
   499	    // Fire-and-forget
   500	  }
   501	}
   502	
   503	// ============================================================
   504	// VOCABULARY BINDING RECALL — Queries DEDICATED COLUMN (HF-092)
   505	// ============================================================
   506	
   507	export async function recallVocabularyBindings(
   508	  tenantId: string,
   509	  columnHeaders: string[],
   510	  supabaseUrl: string,
   511	  supabaseServiceKey: string,
   512	): Promise<Map<string, string>> {
   513	  try {
   514	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
   515	
   516	    const { data, error } = await supabase
   517	      .from('classification_signals')
   518	      .select('vocabulary_bindings')
   519	      .eq('tenant_id', tenantId)
   520	      .not('vocabulary_bindings', 'is', null)
   521	      .order('created_at', { ascending: false })
   522	      .limit(5);
   523	
   524	    if (error || !data?.length) {
   525	      return new Map();
   526	    }
   527	
   528	    // Merge bindings from recent signals, most recent takes precedence
   529	    const bindings = new Map<string, string>();
   530	    for (const row of data.reverse()) {
   531	      const vb = row.vocabulary_bindings as Record<string, string> | null;
   532	      if (vb && typeof vb === 'object') {
   533	        for (const [header, meaning] of Object.entries(vb)) {
   534	          if (columnHeaders.includes(header)) {
   535	            bindings.set(header, meaning);
   536	          }
   537	        }
   538	      }
   539	    }
   540	
   541	    return bindings;
   542	  } catch (err) {
   543	    console.error('[SCI Signal] Vocabulary recall exception:', err);
   544	    return new Map();
   545	  }
   546	}
```
