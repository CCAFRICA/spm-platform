# E6.3 — All `.from('classification_signals').select(...)` Readers (consolidated, verbatim)

22 reader call sites across 16 files. Each entry: file:line context.

Files where the reader appears (from grep, omitting test files):

| # | File | Line(s) |
|---|---|---|
| 1 | `web/src/contexts/session-context.tsx` | 86 |
| 2 | `web/src/app/api/ingest/classification/route.ts` | 45 |
| 3 | `web/src/app/api/signals/route.ts` | 37, 127 |
| 4 | `web/src/app/api/platform/observatory/route.ts` | 223, 389, 717 |
| 5 | `web/src/app/api/import/sci/trace/route.ts` | 27 |
| 6 | `web/src/lib/intelligence/convergence-service.ts` | 231, 241, 775 |
| 7 | `web/src/lib/sci/contextual-reliability.ts` | 67 |
| 8 | `web/src/lib/intelligence/ai-metrics-service.ts` | 96 |
| 9 | `web/src/lib/sci/classification-signal-service.ts` | 124, 327, 517 |
| 10 | `web/src/lib/agents/agent-memory.ts` | 187 |
| 11 | `web/src/lib/ai/signal-reader.ts` | 53 |
| 12 | `web/src/lib/supabase/data-service.ts` | 414, 429 |
| 13 | `web/src/lib/data/platform-queries.ts` | 390 |
| 14 | `web/src/lib/data/persona-queries.ts` | 679 |

Total: **22 reader sites in 14 files** (after de-dup; one file may have multiple sites).

---

## Per-site verbatim context (±20 lines)


### session-context.tsx — `web/src/contexts/session-context.tsx:86` (lines 66–106)

```typescript
    66	
    67	  const loadCounts = useCallback(async () => {
    68	    if (!tenantId) {
    69	      setCounts(DEFAULT_COUNTS);
    70	      setLoadedForTenant('');
    71	      setQueryLoading(false);
    72	      return;
    73	    }
    74	
    75	    setQueryLoading(true);
    76	    try {
    77	      const supabase = createClient();
    78	
    79	      // All count queries batched in parallel — head:true means no row data transferred
    80	      const [entityRes, periodRes, batchRes, ruleSetRes, importRes, signalRes] = await Promise.all([
    81	        supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    82	        supabase.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    83	        supabase.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    84	        supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    85	        supabase.from('import_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    86	        supabase.from('classification_signals').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    87	      ]);
    88	
    89	      setCounts({
    90	        entityCount: entityRes.count ?? 0,
    91	        periodCount: periodRes.count ?? 0,
    92	        batchCount: batchRes.count ?? 0,
    93	        ruleSetCount: ruleSetRes.count ?? 0,
    94	        importBatchCount: importRes.count ?? 0,
    95	        signalCount: signalRes.count ?? 0,
    96	      });
    97	      setLoadedForTenant(tenantId);
    98	    } catch (err) {
    99	      console.warn('[SessionContext] Failed to load counts:', err);
   100	      setLoadedForTenant(tenantId); // Mark as loaded even on error to avoid infinite loading
   101	    } finally {
   102	      setQueryLoading(false);
   103	    }
   104	  }, [tenantId]);
   105	
   106	  useEffect(() => {
```

### ingest_classification — `web/src/app/api/ingest/classification/route.ts:45` (lines 25–65)

```typescript
    25	      .select('tenant_id')
    26	      .eq('auth_user_id', user.id)
    27	      .maybeSingle();
    28	
    29	    if (!profile?.tenant_id) {
    30	      return NextResponse.json({ error: 'No tenant assigned to user' }, { status: 403 });
    31	    }
    32	
    33	    const body = await request.json();
    34	    const { event_id, ai_prediction, ai_confidence, user_decision, was_corrected, calculation_run_id } = body;
    35	
    36	    if (!event_id || !ai_prediction || ai_confidence == null || !user_decision) {
    37	      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    38	    }
    39	
    40	    const supabase = await createServiceRoleClient();
    41	
    42	    const wasCorrected = was_corrected ?? (ai_prediction !== user_decision);
    43	
    44	    const { data, error } = await supabase
    45	      .from('classification_signals')
    46	      .insert({
    47	        tenant_id: profile.tenant_id,
    48	        signal_type: 'classification:outcome',
    49	        signal_value: {
    50	          event_id,
    51	          ai_prediction,
    52	          ai_confidence,
    53	          user_decision,
    54	          was_corrected: wasCorrected,
    55	        },
    56	        confidence: ai_confidence,
    57	        source: wasCorrected ? 'user_corrected' : 'user_confirmed',
    58	        decision_source: wasCorrected ? 'human_override' : 'human_confirmation',
    59	        context: {},
    60	        calculation_run_id: calculation_run_id ?? null,
    61	      })
    62	      .select('id')
    63	      .single();
    64	
    65	    if (error) {
```

### signals_route_l37 — `web/src/app/api/signals/route.ts:37` (lines 17–57)

```typescript
    17	import { createServerSupabaseClient } from '@/lib/supabase/server';
    18	
    19	export async function GET(request: NextRequest) {
    20	  try {
    21	    const { searchParams } = new URL(request.url);
    22	    const tenantId = searchParams.get('tenant_id');
    23	    const signalType = searchParams.get('signal_type');
    24	    const limitParam = searchParams.get('limit');
    25	    const limit = Math.min(parseInt(limitParam || '50', 10), 200);
    26	
    27	    if (!tenantId) {
    28	      return NextResponse.json(
    29	        { error: 'tenant_id query parameter is required' },
    30	        { status: 400 }
    31	      );
    32	    }
    33	
    34	    const supabase = await createServerSupabaseClient();
    35	
    36	    let query = supabase
    37	      .from('classification_signals')
    38	      .select('id, tenant_id, entity_id, signal_type, signal_value, confidence, source, context, created_at')
    39	      .eq('tenant_id', tenantId)
    40	      .order('created_at', { ascending: false })
    41	      .limit(limit);
    42	
    43	    if (signalType) {
    44	      query = query.eq('signal_type', signalType);
    45	    }
    46	
    47	    const { data, error } = await query;
    48	
    49	    if (error) {
    50	      console.error('[Signals API] Query failed:', error.message);
    51	      return NextResponse.json(
    52	        { error: error.message },
    53	        { status: 500 }
    54	      );
    55	    }
    56	
    57	    // Compute summary stats
```

### signals_route_l127 — `web/src/app/api/signals/route.ts:127` (lines 107–147)

```typescript
   107	        context: Record<string, unknown>;
   108	      }>;
   109	    };
   110	
   111	    if (!signals || !Array.isArray(signals) || signals.length === 0) {
   112	      return NextResponse.json({ error: 'signals array is required' }, { status: 400 });
   113	    }
   114	
   115	    const supabase = await createServerSupabaseClient();
   116	
   117	    const rows = signals.map(s => ({
   118	      tenant_id: s.tenant_id,
   119	      signal_type: s.signal_type,
   120	      signal_value: s.signal_value as unknown as undefined,
   121	      confidence: s.confidence,
   122	      source: s.source,
   123	      context: s.context as unknown as undefined,
   124	    }));
   125	
   126	    const { data, error } = await supabase
   127	      .from('classification_signals')
   128	      .insert(rows)
   129	      .select('id');
   130	
   131	    if (error) {
   132	      console.error('[Signals API] Insert failed:', error.message);
   133	      return NextResponse.json({ error: error.message }, { status: 500 });
   134	    }
   135	
   136	    return NextResponse.json({ success: true, count: data?.length || 0 });
   137	  } catch (error) {
   138	    console.error('[Signals API] POST exception:', error);
   139	    return NextResponse.json(
   140	      { error: error instanceof Error ? error.message : 'Unknown error' },
   141	      { status: 500 }
   142	    );
   143	  }
   144	}
```

### observatory_l223 — `web/src/app/api/platform/observatory/route.ts:223` (lines 203–243)

```typescript
   203	  const payoutByTenant = new Map<string, number>();
   204	  for (const o of allOutcomes) {
   205	    const latestPeriod = latestPeriodByTenant.get(o.tenant_id);
   206	    if (latestPeriod && o.period_id === latestPeriod.id) {
   207	      payoutByTenant.set(o.tenant_id, (payoutByTenant.get(o.tenant_id) ?? 0) + (o.total_payout || 0));
   208	    }
   209	  }
   210	
   211	  return { entityCounts, profileCounts, committedDataCounts, latestBatchByTenant, latestPeriodByTenant, payoutByTenant, allBatches };
   212	}
   213	
   214	async function fetchFleetOverview(
   215	  supabase: ServiceClient,
   216	  tenants: Array<{ id: string; settings: unknown; created_at: string }>,
   217	  stats: SharedTenantStats,
   218	): Promise<FleetOverview> {
   219	  // Global counts (not per-tenant) for overview metrics
   220	  const [entityRes, periodRes, signalsRes, dataRes] = await Promise.all([
   221	    supabase.from('entities').select('*', { count: 'exact', head: true }),
   222	    supabase.from('periods').select('*', { count: 'exact', head: true }).neq('status', 'closed'),
   223	    supabase.from('classification_signals').select('confidence').limit(1000),
   224	    supabase.from('committed_data').select('*', { count: 'exact', head: true }),
   225	  ]);
   226	
   227	  const signals = signalsRes.data ?? [];
   228	  const tenantCount = tenants.length;
   229	
   230	  // Active tenants: had a calculation in the last 30 days
   231	  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
   232	  const activeTenantIds = new Set<string>();
   233	  for (const b of stats.allBatches) {
   234	    if (new Date(b.created_at).getTime() > thirtyDaysAgo) {
   235	      activeTenantIds.add(b.tenant_id);
   236	    }
   237	  }
   238	
   239	  // MRR: sum tier prices across all tenants
   240	  let mrr = 0;
   241	  for (const t of tenants) {
   242	    const settings = (t.settings || {}) as Record<string, unknown>;
   243	    const billing = (settings.billing || {}) as Record<string, string>;
```

### observatory_l389 — `web/src/app/api/platform/observatory/route.ts:389` (lines 369–409)

```typescript
   369	      items.push({
   370	        tenantId: t.id,
   371	        tenantName: t.name,
   372	        message: `Lifecycle stalled at ${latest.lifecycle_state} for ${stalledDays}d`,
   373	        severity: stalledDays > 3 ? 'critical' : 'warning',
   374	        timestamp: latest.created_at,
   375	        action: { label: 'Resume', href: `/select-tenant` },
   376	      });
   377	    }
   378	  }
   379	
   380	  return items;
   381	}
   382	
   383	// ═══════════════════════════════════════════════
   384	// AI Intelligence Tab
   385	// ═══════════════════════════════════════════════
   386	
   387	async function fetchAIIntelligence(supabase: ServiceClient): Promise<AIIntelligenceData> {
   388	  const { data: signals, error } = await supabase
   389	    .from('classification_signals')
   390	    .select('id, tenant_id, signal_type, confidence, signal_value')
   391	    .limit(1000);
   392	
   393	  if (error) {
   394	    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: false };
   395	  }
   396	
   397	  const safeSignals = signals ?? [];
   398	  if (safeSignals.length === 0) {
   399	    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: true };
   400	  }
   401	
   402	  const byType: Record<string, { count: number; totalConf: number }> = {};
   403	  const byTenant: Record<string, { count: number; totalConf: number }> = {};
   404	  let totalConf = 0;
   405	  let confCount = 0;
   406	
   407	  for (const s of safeSignals) {
   408	    const conf = s.confidence ?? 0;
   409	    if (s.confidence != null) { totalConf += conf; confCount++; }
```

### observatory_l717 — `web/src/app/api/platform/observatory/route.ts:717` (lines 697–737)

```typescript
   697	      ruleSetCount,
   698	      dataCount,
   699	      batchCount,
   700	      latestLifecycleState: latestLifecycle,
   701	    };
   702	  });
   703	}
   704	
   705	// ═══════════════════════════════════════════════
   706	// Ingestion Tab
   707	// ═══════════════════════════════════════════════
   708	
   709	async function fetchIngestionMetrics(supabase: ServiceClient): Promise<IngestionMetricsData> {
   710	  // Bulk fetch ingestion events and classification signals in parallel
   711	  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   712	  const [eventsRes, signalsRes, tenantsRes] = await Promise.all([
   713	    supabase.from('ingestion_events')
   714	      .select('id, tenant_id, file_name, file_size_bytes, status, created_at')
   715	      .order('created_at', { ascending: false })
   716	      .limit(10000),
   717	    supabase.from('classification_signals')
   718	      .select('id, was_corrected')
   719	      .limit(10000),
   720	    supabase.from('tenants')
   721	      .select('id, name'),
   722	  ]);
   723	
   724	  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   725	  const events: any[] = eventsRes.data ?? [];
   726	  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   727	  const signals: any[] = signalsRes.data ?? [];
   728	  const tenantNameMap = new Map((tenantsRes.data ?? []).map(t => [t.id, t.name]));
   729	
   730	  // Aggregate totals
   731	  let committedCount = 0;
   732	  let quarantinedCount = 0;
   733	  let rejectedCount = 0;
   734	  let totalBytes = 0;
   735	
   736	  // Per-tenant aggregation
   737	  const byTenant: Record<string, {
```

### sci_trace_l27 — `web/src/app/api/import/sci/trace/route.ts:27` (lines 7–47)

```typescript
     7	import { NextRequest, NextResponse } from 'next/server';
     8	import { createClient } from '@supabase/supabase-js';
     9	
    10	export async function GET(req: NextRequest) {
    11	  try {
    12	    const { searchParams } = new URL(req.url);
    13	    const tenantId = searchParams.get('tenantId');
    14	    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100);
    15	    const sourceFile = searchParams.get('sourceFile');
    16	
    17	    if (!tenantId) {
    18	      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    19	    }
    20	
    21	    const supabase = createClient(
    22	      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    23	      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    24	    );
    25	
    26	    let query = supabase
    27	      .from('classification_signals')
    28	      .select(`
    29	        id, source_file_name, sheet_name,
    30	        classification, confidence, decision_source,
    31	        structural_fingerprint, classification_trace,
    32	        vocabulary_bindings, agent_scores,
    33	        human_correction_from, scope, created_at
    34	      `)
    35	      .eq('tenant_id', tenantId)
    36	      .eq('scope', 'tenant')
    37	      .order('created_at', { ascending: false })
    38	      .limit(limit);
    39	
    40	    if (sourceFile) {
    41	      query = query.eq('source_file_name', sourceFile);
    42	    }
    43	
    44	    const { data, error } = await query;
    45	
    46	    if (error) {
    47	      return NextResponse.json({ error: 'Query failed', details: error.message }, { status: 500 });
```

### convergence_l231 — `web/src/lib/intelligence/convergence-service.ts:231` (lines 211–251)

```typescript
   211	      gaps.push({
   212	        component: comp.name,
   213	        componentIndex: comp.index,
   214	        requiredMetrics: comp.expectedMetrics,
   215	        calculationOp: comp.calculationOp,
   216	        reason: 'No committed data found for this tenant',
   217	        resolution: `Import data for this plan's components`,
   218	      });
   219	    }
   220	    return { derivations, matchReport, signals, gaps, componentBindings, observations };
   221	  }
   222	
   223	  // OB-197 G11: signal-surface observation (DS-021 §7 — convergence observes,
   224	  // does not compute). Reads are gated on calculationRunId; outside a run the
   225	  // observations stay empty and matching proceeds unchanged.
   226	  if (calculationRunId) {
   227	    // OB-197 G11: within-run signal observation. Surface what has been observed
   228	    // earlier in THIS calculation run for this tenant. Per DS-021 §7, convergence
   229	    // uses this output for OBSERVATION (matches/gaps/opportunities) — NOT for scoring.
   230	    const { data: withinRunPriors } = await supabase
   231	      .from('classification_signals')
   232	      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
   233	      .eq('tenant_id', tenantId)
   234	      .eq('calculation_run_id', calculationRunId)
   235	      .order('created_at', { ascending: true });
   236	
   237	    // OB-197 G11: cross-run signal observation. Surface this tenant's signals from
   238	    // prior runs that match the current convergence context. Per DS-021 §7,
   239	    // observation only — not consumed by matching algorithm.
   240	    const { data: crossRunPriors } = await supabase
   241	      .from('classification_signals')
   242	      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
   243	      .eq('tenant_id', tenantId)
   244	      .in('signal_type', [
   245	        'classification:outcome',
   246	        'comprehension:plan_interpretation',
   247	        'comprehension:header_binding',
   248	        'classification:human_correction',
   249	        // HF-198 E3 / F-011 closure: declared reader for convergence:dual_path_concordance.
   250	        // Cross-run observation surface for dual-path agreement-rate trend.
   251	        'convergence:dual_path_concordance',
```

### convergence_l241 — `web/src/lib/intelligence/convergence-service.ts:241` (lines 221–261)

```typescript
   221	  }
   222	
   223	  // OB-197 G11: signal-surface observation (DS-021 §7 — convergence observes,
   224	  // does not compute). Reads are gated on calculationRunId; outside a run the
   225	  // observations stay empty and matching proceeds unchanged.
   226	  if (calculationRunId) {
   227	    // OB-197 G11: within-run signal observation. Surface what has been observed
   228	    // earlier in THIS calculation run for this tenant. Per DS-021 §7, convergence
   229	    // uses this output for OBSERVATION (matches/gaps/opportunities) — NOT for scoring.
   230	    const { data: withinRunPriors } = await supabase
   231	      .from('classification_signals')
   232	      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
   233	      .eq('tenant_id', tenantId)
   234	      .eq('calculation_run_id', calculationRunId)
   235	      .order('created_at', { ascending: true });
   236	
   237	    // OB-197 G11: cross-run signal observation. Surface this tenant's signals from
   238	    // prior runs that match the current convergence context. Per DS-021 §7,
   239	    // observation only — not consumed by matching algorithm.
   240	    const { data: crossRunPriors } = await supabase
   241	      .from('classification_signals')
   242	      .select('signal_type, signal_value, decision_source, classification, structural_fingerprint, agent_scores, confidence')
   243	      .eq('tenant_id', tenantId)
   244	      .in('signal_type', [
   245	        'classification:outcome',
   246	        'comprehension:plan_interpretation',
   247	        'comprehension:header_binding',
   248	        'classification:human_correction',
   249	        // HF-198 E3 / F-011 closure: declared reader for convergence:dual_path_concordance.
   250	        // Cross-run observation surface for dual-path agreement-rate trend.
   251	        'convergence:dual_path_concordance',
   252	      ])
   253	      .not('calculation_run_id', 'is', null)
   254	      .neq('calculation_run_id', calculationRunId)
   255	      .order('created_at', { ascending: false })
   256	      .limit(200);
   257	
   258	    observations.withinRun = (withinRunPriors ?? []) as ConvergenceSignalObservation[];
   259	    observations.crossRun = (crossRunPriors ?? []) as ConvergenceSignalObservation[];
   260	  }
   261	
```

### convergence_l775 — `web/src/lib/intelligence/convergence-service.ts:775` (lines 755–795)

```typescript
   755	//
   756	// Reads classification_signals scoped to (tenant_id, rule_set_id, signal_type
   757	// = 'comprehension:plan_interpretation') — the OB-198-aligned vocabulary for
   758	// plan-agent metric semantics. The legacy private-JSONB-key path that HF-191
   759	// introduced was eradicated by PR #342 cutover-revert; this read replaces it
   760	// as the operative signal-surface input per Decision 153 B-E4.
   761	//
   762	// Per Decision 153 B-E4: "atomic cutover to L2 Comprehension signals on
   763	// classification_signals. Signal surface as the operative path."
   764	//
   765	// Korean Test (IGF-T1-E910) compliance: signal_type is a stable governance string,
   766	// not a domain-name literal. tenant_id + rule_set_id are runtime parameters.
   767	// ──────────────────────────────────────────────
   768	
   769	async function loadMetricComprehensionSignals(
   770	  tenantId: string,
   771	  ruleSetId: string,
   772	  supabase: SupabaseClient,
   773	): Promise<MetricComprehensionSignal[]> {
   774	  const { data, error } = await supabase
   775	    .from('classification_signals')
   776	    .select('signal_value, confidence, rule_set_id')
   777	    .eq('tenant_id', tenantId)
   778	    .eq('rule_set_id', ruleSetId)
   779	    .eq('signal_type', 'comprehension:plan_interpretation')
   780	    .order('created_at', { ascending: false });
   781	
   782	  if (error) {
   783	    console.warn(`[Convergence] metric_comprehension signal read failed (non-blocking): ${error.message}`);
   784	    return [];
   785	  }
   786	  return (data ?? []) as MetricComprehensionSignal[];
   787	}
   788	
   789	// ──────────────────────────────────────────────
   790	// Step 2: Inventory Data Capabilities
   791	// OB-162: Enhanced with field identity extraction
   792	// ──────────────────────────────────────────────
   793	
   794	async function inventoryData(
   795	  tenantId: string,
```

### contextual_reliability_l67 — `web/src/lib/sci/contextual-reliability.ts:67` (lines 47–87)

```typescript
    47	
    48	let crlCache: CRLCache | null = null;
    49	
    50	/**
    51	 * Load classification_signals for a tenant (cached per session).
    52	 * Called once, reused for all CRL lookups in the same analyze request.
    53	 */
    54	async function loadSignalData(
    55	  tenantId: string,
    56	  supabaseUrl: string,
    57	  supabaseServiceKey: string,
    58	): Promise<SignalRow[]> {
    59	  if (crlCache && crlCache.tenantId === tenantId && crlCache.signalData !== null) {
    60	    return crlCache.signalData;
    61	  }
    62	
    63	  try {
    64	    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    65	
    66	    const { data, error } = await supabase
    67	      .from('classification_signals')
    68	      .select('classification, confidence, decision_source, structural_fingerprint, agent_scores, human_correction_from, source')
    69	      .eq('tenant_id', tenantId)
    70	      .order('created_at', { ascending: false })
    71	      .limit(200);
    72	
    73	    if (error || !data) {
    74	      crlCache = { tenantId, signalData: [] };
    75	      return [];
    76	    }
    77	
    78	    const rows = data as SignalRow[];
    79	    crlCache = { tenantId, signalData: rows };
    80	    return rows;
    81	  } catch {
    82	    crlCache = { tenantId, signalData: [] };
    83	    return [];
    84	  }
    85	}
    86	
    87	/**
```

### ai_metrics_l96 — `web/src/lib/intelligence/ai-metrics-service.ts:96` (lines 76–116)

```typescript
    76	}
    77	
    78	// ============================================
    79	// CLIENT
    80	// ============================================
    81	
    82	function getServiceClient() {
    83	  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    84	  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    85	  if (!url || !key) {
    86	    throw new Error('[AIMetricsService] Missing Supabase env vars');
    87	  }
    88	  return createClient(url, key, {
    89	    auth: { autoRefreshToken: false, persistSession: false },
    90	  });
    91	}
    92	
    93	async function fetchSignals(tenantId?: string, limit = 5000): Promise<RawSignal[]> {
    94	  const supabase = getServiceClient();
    95	  let query = supabase
    96	    .from('classification_signals')
    97	    .select('id, tenant_id, signal_type, confidence, source, created_at')
    98	    .order('created_at', { ascending: false })
    99	    .limit(limit);
   100	
   101	  if (tenantId) {
   102	    query = query.eq('tenant_id', tenantId);
   103	  }
   104	
   105	  const { data, error } = await query;
   106	  if (error) {
   107	    console.error('[AIMetricsService] fetchSignals error:', error.message);
   108	    return [];
   109	  }
   110	  return data ?? [];
   111	}
   112	
   113	// ============================================
   114	// SOURCE CLASSIFICATION
   115	// ============================================
   116	
```

### sci_classsig_l124 — `web/src/lib/sci/classification-signal-service.ts:124` (lines 104–144)

```typescript
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
```

### sci_classsig_l327 — `web/src/lib/sci/classification-signal-service.ts:327` (lines 307–347)

```typescript
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
```

### sci_classsig_l517 — `web/src/lib/sci/classification-signal-service.ts:517` (lines 497–537)

```typescript
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
```

### agent_memory_l187 — `web/src/lib/agents/agent-memory.ts:187` (lines 167–207)

```typescript
   167	      .select('pattern_signature, confidence_mean, learned_behaviors')
   168	      .eq('domain_id', domainId);
   169	
   170	    if (verticalHint) {
   171	      domainQuery = domainQuery.eq('vertical_hint', verticalHint);
   172	    }
   173	
   174	    const { data: domainRows } = await domainQuery;
   175	
   176	    for (const row of (domainRows ?? []) as Array<Record<string, unknown>>) {
   177	      priors.domainPriors.set(row.pattern_signature as string, {
   178	        confidence: (row.confidence_mean as number) ?? 0.5,
   179	        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
   180	          ? row.learned_behaviors as Record<string, unknown>
   181	          : {},
   182	      });
   183	    }
   184	
   185	    // 4. Load signal summary from classification_signals (aggregated)
   186	    const { data: signalRows } = await supabase
   187	      .from('classification_signals')
   188	      .select('signal_type, signal_value, confidence, created_at')
   189	      .eq('tenant_id', tenantId)
   190	      .order('created_at', { ascending: false })
   191	      .limit(500);
   192	
   193	    priors.signalHistory = aggregateSignals(signalRows ?? []);
   194	  } catch (err) {
   195	    console.error('[AgentMemory] loadPriorsForAgent error:', err);
   196	  }
   197	
   198	  return priors;
   199	}
   200	
   201	// ──────────────────────────────────────────────
   202	// Signal Aggregation (internal)
   203	// ──────────────────────────────────────────────
   204	
   205	function aggregateSignals(rows: Array<Record<string, unknown>>): SignalSummary {
   206	  const fieldMappingMap = new Map<string, { mappedField: string; confidence: number; occurrences: number }>();
   207	  const interpretationMap = new Map<string, { confidence: number; occurrences: number }>();
```

### signal_reader_l53 — `web/src/lib/ai/signal-reader.ts:53` (lines 33–73)

```typescript
    33	// ============================================
    34	// READ OPERATIONS
    35	// ============================================
    36	
    37	/**
    38	 * Retrieve training signals from Supabase classification_signals table.
    39	 * HF-161: Accepts Supabase credentials as arguments (no dynamic imports).
    40	 */
    41	export async function getTrainingSignals(
    42	  tenantId: string,
    43	  supabaseUrl: string,
    44	  supabaseServiceKey: string,
    45	  signalType?: string,
    46	  limit: number = 100,
    47	): Promise<SignalData[]> {
    48	  try {
    49	    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    50	      auth: { autoRefreshToken: false, persistSession: false },
    51	    });
    52	    let query = supabase
    53	      .from('classification_signals')
    54	      .select('*')
    55	      .eq('tenant_id', tenantId)
    56	      .order('created_at', { ascending: false })
    57	      .limit(limit);
    58	
    59	    if (signalType) {
    60	      query = query.eq('signal_type', signalType);
    61	    }
    62	
    63	    const { data, error } = await query;
    64	
    65	    if (error) {
    66	      console.error('[SignalReader] getTrainingSignals failed:', error.message, '| tenant:', tenantId);
    67	      return [];
    68	    }
    69	
    70	    return (data || []).map(row => ({
    71	      tenantId: row.tenant_id,
    72	      signalType: row.signal_type,
    73	      signalValue: (typeof row.signal_value === 'object' && row.signal_value !== null)
```

### data_service_l414 — `web/src/lib/supabase/data-service.ts:414` (lines 394–434)

```typescript
   394	    entityId?: string | null;
   395	    signalType: string;
   396	    signalValue: Json;
   397	    confidence?: number;
   398	    source?: string;
   399	    context?: Json;
   400	  }
   401	): Promise<void> {
   402	  requireTenantId(tenantId);
   403	  const supabase = createClient();
   404	  const insertRow: ClassificationSignalInsert = {
   405	    tenant_id: tenantId,
   406	    entity_id: signal.entityId || null,
   407	    signal_type: signal.signalType,
   408	    signal_value: signal.signalValue || ({} as Json),
   409	    confidence: signal.confidence ?? null,
   410	    source: signal.source || null,
   411	    context: signal.context || ({} as Json),
   412	  };
   413	  const { error } = await supabase
   414	    .from('classification_signals')
   415	    .insert(insertRow);
   416	  if (error) throw error;
   417	}
   418	
   419	/**
   420	 * Get classification signals for a tenant.
   421	 */
   422	export async function getClassificationSignals(
   423	  tenantId: string,
   424	  options?: { signalType?: string; entityId?: string; limit?: number }
   425	): Promise<Array<Database['public']['Tables']['classification_signals']['Row']>> {
   426	  requireTenantId(tenantId);
   427	  const supabase = createClient();
   428	  let query = supabase
   429	    .from('classification_signals')
   430	    .select('*')
   431	    .eq('tenant_id', tenantId)
   432	    .order('created_at', { ascending: false });
   433	  if (options?.signalType) query = query.eq('signal_type', options.signalType);
   434	  if (options?.entityId) query = query.eq('entity_id', options.entityId);
```

### data_service_l429 — `web/src/lib/supabase/data-service.ts:429` (lines 409–449)

```typescript
   409	    confidence: signal.confidence ?? null,
   410	    source: signal.source || null,
   411	    context: signal.context || ({} as Json),
   412	  };
   413	  const { error } = await supabase
   414	    .from('classification_signals')
   415	    .insert(insertRow);
   416	  if (error) throw error;
   417	}
   418	
   419	/**
   420	 * Get classification signals for a tenant.
   421	 */
   422	export async function getClassificationSignals(
   423	  tenantId: string,
   424	  options?: { signalType?: string; entityId?: string; limit?: number }
   425	): Promise<Array<Database['public']['Tables']['classification_signals']['Row']>> {
   426	  requireTenantId(tenantId);
   427	  const supabase = createClient();
   428	  let query = supabase
   429	    .from('classification_signals')
   430	    .select('*')
   431	    .eq('tenant_id', tenantId)
   432	    .order('created_at', { ascending: false });
   433	  if (options?.signalType) query = query.eq('signal_type', options.signalType);
   434	  if (options?.entityId) query = query.eq('entity_id', options.entityId);
   435	  if (options?.limit) query = query.limit(options.limit);
   436	  const { data, error } = await query;
   437	  if (error) throw error;
   438	  return (data || []) as Array<Database['public']['Tables']['classification_signals']['Row']>;
   439	}
   440	
   441	// ──────────────────────────────────────────────
   442	// Audit Logging
   443	// ──────────────────────────────────────────────
   444	
   445	/**
   446	 * Write an audit log entry.
   447	 */
   448	export async function writeAuditLog(
   449	  tenantId: string,
```

### platform_queries_l390 — `web/src/lib/data/platform-queries.ts:390` (lines 370–410)

```typescript
   370	        tenantName: t.name,
   371	        message: `Lifecycle stalled at ${latest.lifecycle_state} for ${Math.floor(batchAge / (24 * 60 * 60 * 1000))}d`,
   372	        severity: 'critical',
   373	        timestamp: latest.created_at,
   374	      });
   375	    }
   376	  }
   377	
   378	  return items;
   379	}
   380	
   381	// ──────────────────────────────────────────────
   382	// AI Intelligence
   383	// ──────────────────────────────────────────────
   384	
   385	export async function getAIIntelligenceData(): Promise<AIIntelligenceData> {
   386	  const supabase = createClient();
   387	
   388	  // Check if table has data
   389	  const { data: signals, error } = await supabase
   390	    .from('classification_signals')
   391	    .select('id, tenant_id, signal_type, confidence')
   392	    .limit(1000);
   393	
   394	  if (error) {
   395	    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: false };
   396	  }
   397	
   398	  const safeSignals = signals ?? [];
   399	  if (safeSignals.length === 0) {
   400	    return { totalSignals: 0, avgConfidence: 0, signalsByType: [], perTenant: [], tableExists: true };
   401	  }
   402	
   403	  // Aggregate by type
   404	  const byType: Record<string, { count: number; totalConf: number }> = {};
   405	  const byTenant: Record<string, { count: number; totalConf: number }> = {};
   406	  let totalConf = 0;
   407	  let confCount = 0;
   408	
   409	  for (const s of safeSignals) {
   410	    const conf = s.confidence ?? 0;
```

### persona_queries_l679 — `web/src/lib/data/persona-queries.ts:679` (lines 659–699)

```typescript
   659	        opportunity: `Critically below benchmark at ${attainment.toFixed(0)}%`,
   660	        severity: 'critical',
   661	        estimatedImpact: 0,
   662	        recommendedAction: 'Immediate performance review required',
   663	      });
   664	    }
   665	  }
   666	
   667	  return signals;
   668	}
   669	
   670	// ──────────────────────────────────────────────
   671	// AI Quality Metrics (OB-86)
   672	// ──────────────────────────────────────────────
   673	
   674	type SupabaseClient = ReturnType<typeof createClient>;
   675	
   676	async function fetchAIQualityMetrics(supabase: SupabaseClient, tenantId: string): Promise<AIQualityMetrics | undefined> {
   677	  try {
   678	    const { data: signals, error } = await supabase
   679	      .from('classification_signals')
   680	      .select('confidence, source, created_at')
   681	      .eq('tenant_id', tenantId)
   682	      .order('created_at', { ascending: false })
   683	      .limit(500);
   684	
   685	    if (error || !signals || signals.length === 0) return undefined;
   686	
   687	    let accepted = 0;
   688	    let actioned = 0;
   689	
   690	    for (const s of signals) {
   691	      const src = s.source ?? '';
   692	      if (src === 'user_confirmed' || (s.confidence != null && s.confidence >= 0.95)) {
   693	        accepted++;
   694	        actioned++;
   695	      } else if (src === 'user_corrected') {
   696	        actioned++;
   697	      } else if (s.confidence != null && s.confidence < 0.3) {
   698	        actioned++;
   699	      }
```
