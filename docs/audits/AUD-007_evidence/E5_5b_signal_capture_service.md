# E5.5b — `web/src/lib/sci/signal-capture-service.ts` (verbatim with line numbers)

**Total lines: 328**

```typescript
     1	// SCI Signal Capture Service — wraps signal-persistence.ts for SCI events
     2	// Decision 30 — "Classification Signal" not "Training Signal"
     3	// CRITICAL: Fire-and-forget. NEVER throws. Import NEVER fails due to signal capture.
     4	// Zero domain vocabulary. Korean Test applies.
     5	//
     6	// OB-197: signal_type emitted to DB uses prefix vocabulary (classification:* /
     7	// comprehension:* / convergence:* / cost:*). The original sci internal type is
     8	// preserved in signal_value.sci_internal_type so existing reads can post-filter.
     9	
    10	// OB-199 Phase 4: read surface migrated from signal-persistence.ts (deleted) to signal-reader.ts.
    11	import { getTrainingSignals } from '@/lib/ai/signal-reader';
    12	import { writeSignal, writeSignalBatch, CanonicalWriteError } from '@/lib/intelligence/canonical-signal-writer';
    13	import type { SCISignalCapture, SCISignal } from './sci-signal-types';
    14	
    15	// OB-197: Map sci internal signal type → prefix-vocabulary signal_type.
    16	// Many-to-one is intentional: classification:* groups outcome + outcome-confirmation;
    17	// comprehension:* groups field-binding evidence; etc.
    18	function toPrefixSignalType(sciInternalType: SCISignal['signalType']): string {
    19	  switch (sciInternalType) {
    20	    case 'content_classification':
    21	    case 'content_classification_outcome':
    22	      return 'classification:outcome';
    23	    case 'field_binding':
    24	    case 'field_binding_outcome':
    25	      return 'comprehension:header_binding';
    26	    case 'negotiation_round':
    27	      return 'comprehension:plan_interpretation';
    28	    case 'convergence_outcome':
    29	      return 'convergence:calculation_validation';
    30	    case 'cost_event':
    31	      return 'cost:event';
    32	  }
    33	}
    34	
    35	// ============================================================
    36	// WRITE OPERATIONS
    37	// ============================================================
    38	
    39	/**
    40	 * Capture a single SCI signal. Maps SCISignalCapture → SignalData for persistence.
    41	 * Returns signal_type on success, null on failure. NEVER throws.
    42	 */
    43	export async function captureSCISignal(
    44	  capture: SCISignalCapture,
    45	  calculationRunId?: string,
    46	): Promise<string | null> {
    47	  try {
    48	    const confidence = extractConfidence(capture.signal);
    49	    const sciInternal = capture.signal.signalType;
    50	    // OB-199 Phase 4: canonical writer (replaces persistSignal thin-wrap).
    51	    await writeSignal({
    52	      tenantId: capture.tenantId,
    53	      entityId: capture.entityId,
    54	      signalType: toPrefixSignalType(sciInternal),
    55	      signalValue: {
    56	        ...(capture.signal as unknown as Record<string, unknown>),
    57	        sci_internal_type: sciInternal,
    58	      },
    59	      confidence,
    60	      source: getSource(capture.signal),
    61	      context: { sciVersion: '1.0', capturedAt: new Date().toISOString() },
    62	      calculationRunId,
    63	    }, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    64	    return sciInternal;
    65	  } catch (err) {
    66	    if (err instanceof CanonicalWriteError) {
    67	      console.warn(`[SCISignalCapture] CanonicalWriteError (${err.cause}) signal_type='${err.signalType}': ${err.message}`);
    68	    } else {
    69	      console.warn('[SCISignalCapture] Exception (non-blocking):', err);
    70	    }
    71	    return null;
    72	  }
    73	}
    74	
    75	/**
    76	 * Batch capture SCI signals. Returns count of successfully written signals.
    77	 * NEVER throws.
    78	 */
    79	export async function captureSCISignalBatch(
    80	  captures: SCISignalCapture[],
    81	  calculationRunId?: string,
    82	): Promise<number> {
    83	  if (captures.length === 0) return 0;
    84	
    85	  try {
    86	    const signals = captures.map(c => {
    87	      const sciInternal = c.signal.signalType;
    88	      return {
    89	        tenantId: c.tenantId,
    90	        entityId: c.entityId,
    91	        signalType: toPrefixSignalType(sciInternal),
    92	        signalValue: {
    93	          ...(c.signal as unknown as Record<string, unknown>),
    94	          sci_internal_type: sciInternal,
    95	        } as Record<string, unknown>,
    96	        confidence: extractConfidence(c.signal),
    97	        source: getSource(c.signal),
    98	        context: { sciVersion: '1.0', capturedAt: new Date().toISOString() } as Record<string, unknown>,
    99	        calculationRunId,
   100	      };
   101	    });
   102	
   103	    // OB-199 Phase 4: canonical writer batch (replaces persistSignalBatch thin-wrap).
   104	    const result = await writeSignalBatch(signals, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
   105	    return result.count;
   106	  } catch (err) {
   107	    if (err instanceof CanonicalWriteError) {
   108	      console.warn(`[SCISignalCapture] Batch CanonicalWriteError (${err.cause}) signal_type='${err.signalType}': ${err.message}`);
   109	    } else {
   110	      console.warn('[SCISignalCapture] Batch exception (non-blocking):', err);
   111	    }
   112	    return 0;
   113	  }
   114	}
   115	
   116	// ============================================================
   117	// READ OPERATIONS
   118	// ============================================================
   119	
   120	/**
   121	 * Get SCI signals for a tenant, optionally filtered by signal type.
   122	 * Returns empty array on failure. NEVER throws.
   123	 *
   124	 * OB-197: filters by prefix signal_type at SQL, then by sci_internal_type
   125	 * (preserved in signal_value at write time) for final selection.
   126	 */
   127	export async function getSCISignals(
   128	  tenantId: string,
   129	  options?: { signalType?: SCISignal['signalType']; limit?: number }
   130	): Promise<Array<{ signalType: string; signalValue: Record<string, unknown>; confidence: number | undefined; createdAt?: string }>> {
   131	  try {
   132	    const prefixFilter = options?.signalType ? toPrefixSignalType(options.signalType) : undefined;
   133	    const raw = await getTrainingSignals(tenantId, process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, prefixFilter, options?.limit || 200);
   134	
   135	    return raw
   136	      .filter(r => {
   137	        const sciType = (r.signalValue as Record<string, unknown>)?.sci_internal_type;
   138	        if (typeof sciType !== 'string') return false;
   139	        if (options?.signalType && sciType !== options.signalType) return false;
   140	        return true;
   141	      })
   142	      .map(r => ({
   143	        signalType: (r.signalValue as Record<string, unknown>).sci_internal_type as string,
   144	        signalValue: r.signalValue,
   145	        confidence: r.confidence,
   146	      }));
   147	  } catch (err) {
   148	    console.warn('[SCISignalCapture] getSCISignals exception:', err);
   149	    return [];
   150	  }
   151	}
   152	
   153	/**
   154	 * Compute SCI classification accuracy from outcome signals.
   155	 * Returns null if no outcome signals exist (honest empty state).
   156	 */
   157	export async function computeSCIAccuracy(
   158	  tenantId: string
   159	): Promise<{ total: number; correct: number; accuracy: number; overrideRate: number } | null> {
   160	  try {
   161	    const outcomes = await getSCISignals(tenantId, { signalType: 'content_classification_outcome', limit: 1000 });
   162	
   163	    if (outcomes.length === 0) return null;
   164	
   165	    let correct = 0;
   166	    let overridden = 0;
   167	
   168	    for (const o of outcomes) {
   169	      const val = o.signalValue;
   170	      if (val.wasOverridden === true) {
   171	        overridden++;
   172	      } else {
   173	        correct++;
   174	      }
   175	    }
   176	
   177	    return {
   178	      total: outcomes.length,
   179	      correct,
   180	      accuracy: outcomes.length > 0 ? correct / outcomes.length : 0,
   181	      overrideRate: outcomes.length > 0 ? overridden / outcomes.length : 0,
   182	    };
   183	  } catch (err) {
   184	    console.warn('[SCISignalCapture] computeSCIAccuracy exception:', err);
   185	    return null;
   186	  }
   187	}
   188	
   189	/**
   190	 * Compute SCI flywheel trend — classification confidence over time.
   191	 * Returns null if < 2 data points.
   192	 */
   193	export async function computeSCIFlywheelTrend(
   194	  tenantId: string
   195	): Promise<Array<{ week: string; avgConfidence: number; signalCount: number; accuracy: number }> | null> {
   196	  try {
   197	    const classifications = await getSCISignals(tenantId, { signalType: 'content_classification', limit: 1000 });
   198	    const outcomes = await getSCISignals(tenantId, { signalType: 'content_classification_outcome', limit: 1000 });
   199	
   200	    if (classifications.length < 2) return null;
   201	
   202	    // Group by ISO week
   203	    const byWeek = new Map<string, { confSum: number; count: number; correct: number; outcomeCount: number }>();
   204	
   205	    for (const c of classifications) {
   206	      const capturedAt = (c.signalValue as Record<string, unknown>).capturedAt ||
   207	        ((c as Record<string, unknown>).createdAt);
   208	      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
   209	      if (!byWeek.has(week)) byWeek.set(week, { confSum: 0, count: 0, correct: 0, outcomeCount: 0 });
   210	      const w = byWeek.get(week)!;
   211	      w.count++;
   212	      w.confSum += (c.confidence || 0);
   213	    }
   214	
   215	    for (const o of outcomes) {
   216	      const capturedAt = (o.signalValue as Record<string, unknown>).capturedAt ||
   217	        ((o as Record<string, unknown>).createdAt);
   218	      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
   219	      if (!byWeek.has(week)) byWeek.set(week, { confSum: 0, count: 0, correct: 0, outcomeCount: 0 });
   220	      const w = byWeek.get(week)!;
   221	      w.outcomeCount++;
   222	      if (!(o.signalValue as Record<string, unknown>).wasOverridden) w.correct++;
   223	    }
   224	
   225	    const points = Array.from(byWeek.entries())
   226	      .filter(([week]) => week !== 'unknown')
   227	      .sort(([a], [b]) => a.localeCompare(b))
   228	      .map(([week, d]) => ({
   229	        week,
   230	        avgConfidence: d.count > 0 ? d.confSum / d.count : 0,
   231	        signalCount: d.count,
   232	        accuracy: d.outcomeCount > 0 ? d.correct / d.outcomeCount : 0,
   233	      }));
   234	
   235	    return points.length >= 2 ? points : null;
   236	  } catch (err) {
   237	    console.warn('[SCISignalCapture] computeSCIFlywheelTrend exception:', err);
   238	    return null;
   239	  }
   240	}
   241	
   242	/**
   243	 * Compute cost curve — AI API costs over time.
   244	 * Returns null if no cost events.
   245	 */
   246	export async function computeSCICostCurve(
   247	  tenantId: string
   248	): Promise<Array<{ week: string; totalCostUSD: number; apiCalls: number; avgTokens: number }> | null> {
   249	  try {
   250	    const costEvents = await getSCISignals(tenantId, { signalType: 'cost_event', limit: 1000 });
   251	
   252	    if (costEvents.length === 0) return null;
   253	
   254	    const byWeek = new Map<string, { cost: number; calls: number; tokens: number }>();
   255	
   256	    for (const e of costEvents) {
   257	      const val = e.signalValue;
   258	      const capturedAt = (val as Record<string, unknown>).capturedAt ||
   259	        ((e as Record<string, unknown>).createdAt);
   260	      const week = capturedAt ? getISOWeek(new Date(String(capturedAt))) : 'unknown';
   261	      if (!byWeek.has(week)) byWeek.set(week, { cost: 0, calls: 0, tokens: 0 });
   262	      const w = byWeek.get(week)!;
   263	      w.cost += (val.estimatedCostUSD as number) || 0;
   264	      w.calls++;
   265	      w.tokens += ((val.inputTokens as number) || 0) + ((val.outputTokens as number) || 0);
   266	    }
   267	
   268	    return Array.from(byWeek.entries())
   269	      .filter(([week]) => week !== 'unknown')
   270	      .sort(([a], [b]) => a.localeCompare(b))
   271	      .map(([week, d]) => ({
   272	        week,
   273	        totalCostUSD: Math.round(d.cost * 10000) / 10000,
   274	        apiCalls: d.calls,
   275	        avgTokens: d.calls > 0 ? Math.round(d.tokens / d.calls) : 0,
   276	      }));
   277	  } catch (err) {
   278	    console.warn('[SCISignalCapture] computeSCICostCurve exception:', err);
   279	    return null;
   280	  }
   281	}
   282	
   283	// ============================================================
   284	// HELPERS
   285	// ============================================================
   286	
   287	function extractConfidence(signal: SCISignal): number {
   288	  switch (signal.signalType) {
   289	    case 'content_classification':
   290	      return signal.winningConfidence;
   291	    case 'content_classification_outcome':
   292	      return signal.predictionConfidence;
   293	    case 'field_binding':
   294	      return signal.avgConfidence;
   295	    case 'field_binding_outcome':
   296	      return signal.predictionConfidence;
   297	    case 'negotiation_round':
   298	      return signal.round2TopConfidence;
   299	    case 'convergence_outcome':
   300	      return signal.matchRate;
   301	    case 'cost_event':
   302	      return 1.0; // cost events are factual, not predictive
   303	  }
   304	}
   305	
   306	function getSource(signal: SCISignal): string {
   307	  switch (signal.signalType) {
   308	    case 'content_classification':
   309	    case 'field_binding':
   310	    case 'negotiation_round':
   311	      return 'sci_agent';
   312	    case 'content_classification_outcome':
   313	    case 'field_binding_outcome':
   314	      return (signal as { wasOverridden?: boolean }).wasOverridden ? 'user_corrected' : 'user_confirmed';
   315	    case 'convergence_outcome':
   316	      return 'reconciliation';
   317	    case 'cost_event':
   318	      return 'system';
   319	  }
   320	}
   321	
   322	function getISOWeek(date: Date): string {
   323	  const d = new Date(date.getTime());
   324	  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
   325	  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
   326	  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
   327	  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
   328	}
```
