# E1.1 — Canonical Signal Writer Full Source (verbatim with line numbers)

**File:** `web/src/lib/intelligence/canonical-signal-writer.ts`
**Total lines:** 460
**Captured at:** AUD-007 execution, branch HEAD

```typescript
     1	/**
     2	 * Canonical Signal Writer — OB-199 Phase 3 (DS-023 §5.1, §5.2, §5.3, §5.5)
     3	 *
     4	 * The singular entry point for every write to `classification_signals`. All
     5	 * pre-existing writers (`persistSignal`, `persistSignalBatch`,
     6	 * `writeClassificationSignal`, and the four direct `.from('classification_signals').insert(...)`
     7	 * bypass sites surfaced in AUD-006 §1.2) migrate to call `writeSignal` /
     8	 * `writeSignalBatch` per DS-023 §5.1.
     9	 *
    10	 * Substrate enforcement at the boundary:
    11	 *
    12	 *   §5.2 — Structural contract enforcement (Decision 30 v2 inclusive [0.0, 1.0])
    13	 *   §5.3 — Identifier derivation from the registry (Decision 154/155, AUD-004 v3 E1+E2+E3)
    14	 *   §5.4 — Producer-side normalization (OB-199 Phase 1 at anthropic-adapter.ts)
    15	 *   §5.5 — No writer-side clamp (HF-214 Phase 2 A clamp removed)
    16	 *
    17	 * §5.2 validation outcomes (CHANGE 2 in DS-022 v2 + architect resolution 2026-05-11):
    18	 *
    19	 *   in_range          → confidence persists as asserted (Decision 30 v2: 0.0–1.0 inclusive)
    20	 *   out_of_range      → row persists with confidence:null + observability:write_failure signal
    21	 *   missing_required  → row persists with confidence:null + observability:write_failure signal
    22	 *   missing_optional  → row persists with confidence:null; no observability signal
    23	 *
    24	 * T1-E902 (Carry Everything): row always persists when the signal_type is
    25	 * registered; the confidence field carries the validation outcome (the value,
    26	 * or null when the value would violate the contract).
    27	 *
    28	 * T1-E907 (Fix Logic, Not Data): out-of-range and missing-required outcomes
    29	 * emit an observability:write_failure signal so the producer-side defect is
    30	 * structurally observable. The fix lives at the producer; the writer surfaces.
    31	 *
    32	 * Decision 154/155: unregistered signal_type fails at the boundary with
    33	 * structured error (CanonicalWriteError, cause='unregistered_signal_type').
    34	 * No soft-warn at this layer; the registry is the canonical declaration surface
    35	 * and unregistered writes are contract violations, not informational events.
    36	 */
    37	
    38	import { createClient, type SupabaseClient } from '@supabase/supabase-js';
    39	import type { Json } from '@/lib/supabase/database.types';
    40	import { isRegistered, lookup, all as allRegistered } from './signal-registry';
    41	
    42	// ============================================
    43	// TYPES
    44	// ============================================
    45	
    46	/**
    47	 * Public input type for canonical writes. Accepts the union of fields the
    48	 * pre-OB-199 dual-architecture inserts wrote:
    49	 *   - JSONB path (signal-persistence.ts): tenant_id, entity_id, signal_type,
    50	 *     signal_value, confidence, source, context, calculation_run_id, rule_set_id
    51	 *   - Dedicated-columns path (sci/classification-signal-service.ts): adds
    52	 *     source_file_name, sheet_name, structural_fingerprint, classification,
    53	 *     decision_source, classification_trace, vocabulary_bindings, agent_scores,
    54	 *     human_correction_from, scope
    55	 *
    56	 * Per DS-023 §5.1, the canonical writer's insert shape includes both as nullable
    57	 * fields. Callers from either pre-canonical path migrate to the same type.
    58	 */
    59	export interface CanonicalSignalInput {
    60	  tenantId: string;
    61	  signalType: string;
    62	  // JSONB-path fields (from signal-persistence.ts)
    63	  signalValue?: Record<string, unknown>;
    64	  confidence?: number | null;
    65	  source?: string;
    66	  entityId?: string | null;
    67	  context?: Record<string, unknown>;
    68	  calculationRunId?: string | null;
    69	  ruleSetId?: string | null;
    70	  // Dedicated-column fields (from sci/classification-signal-service.ts;
    71	  // collapse per AUD-001 F-002 closure)
    72	  sourceFileName?: string | null;
    73	  sheetName?: string | null;
    74	  structuralFingerprint?: Record<string, unknown> | null;
    75	  classification?: string | null;
    76	  decisionSource?: string | null;
    77	  classificationTrace?: Record<string, unknown> | null;
    78	  vocabularyBindings?: Record<string, unknown> | null;
    79	  agentScores?: Record<string, unknown> | null;
    80	  humanCorrectionFrom?: string | null;
    81	  scope?: string | null;
    82	}
    83	
    84	export type CanonicalWriteFailureCause =
    85	  | 'unregistered_signal_type'
    86	  | 'database_unreachable'
    87	  | 'insert_failed';
    88	
    89	/**
    90	 * Typed error class thrown by the canonical writer per DS-023 §5.2:
    91	 *
    92	 *   - `unregistered_signal_type` — signal_type is not in the registry
    93	 *     (Decision 154/155 violation); thrown synchronously at validation
    94	 *   - `database_unreachable` — Supabase client throws (network, auth, etc.);
    95	 *     thrown after retry policy (currently no retry)
    96	 *   - `insert_failed` — Postgres returns an error on insert (schema mismatch,
    97	 *     constraint violation other than confidence-range, etc.)
    98	 *
    99	 * Callers handle this explicitly. Fire-and-forget patterns (`void writeSignal(...)`)
   100	 * are an architectural anti-pattern per AUD-001 F-003.
   101	 */
   102	export class CanonicalWriteError extends Error {
   103	  constructor(
   104	    public readonly cause: CanonicalWriteFailureCause,
   105	    public readonly signalType: string,
   106	    message: string,
   107	  ) {
   108	    super(message);
   109	    this.name = 'CanonicalWriteError';
   110	  }
   111	}
   112	
   113	export interface WriteResult {
   114	  success: boolean;
   115	  observabilitySignalEmitted: boolean;
   116	  error?: string;
   117	}
   118	
   119	export interface BatchWriteResult {
   120	  success: boolean;
   121	  count: number;
   122	  observabilitySignalsEmitted: number;
   123	  error?: string;
   124	}
   125	
   126	// ============================================
   127	// VALIDATION (DS-023 §5.2)
   128	// ============================================
   129	
   130	type ValidationOutcome =
   131	  | { kind: 'in_range'; confidence: number }
   132	  | { kind: 'out_of_range'; original: unknown }
   133	  | { kind: 'missing_required' }
   134	  | { kind: 'missing_optional' };
   135	
   136	/**
   137	 * Per-signal Decision 30 v2 validation.
   138	 *
   139	 * Decision 30 v2: confidence ∈ [0.0, 1.0] inclusive bound (per IRA Q3 disposition).
   140	 * 1.0 is admissible (no longer the 0.9999 exclusive clamp boundary HF-214 Phase 2
   141	 * established). Out-of-range = confidence is a number outside [0, 1] OR NaN/Infinity.
   142	 *
   143	 * `confidence_required` per signal_type is read from the registry (Phase 2 schema).
   144	 * When absent (registry returned no declaration), the caller has already failed
   145	 * upstream via assertRegistered; this function asserts the precondition.
   146	 */
   147	function validateSignal(signal: CanonicalSignalInput): ValidationOutcome {
   148	  const decl = lookup(signal.signalType);
   149	  if (!decl) {
   150	    throw new CanonicalWriteError(
   151	      'unregistered_signal_type',
   152	      signal.signalType,
   153	      `[CanonicalWriter] signal_type '${signal.signalType}' is not registered. ` +
   154	      `Per Decision 154/155 + AUD-004 v3 E1/E2, every signal_type must declare ` +
   155	      `at least one reader before write. Available identifiers: ${allRegistered().map(d => d.identifier).join(', ')}`,
   156	    );
   157	  }
   158	  const conf = signal.confidence;
   159	  const confRequired = decl.confidence_required;
   160	
   161	  if (conf === null || conf === undefined) {
   162	    return confRequired ? { kind: 'missing_required' } : { kind: 'missing_optional' };
   163	  }
   164	  if (typeof conf === 'number' && Number.isFinite(conf) && conf >= 0.0 && conf <= 1.0) {
   165	    return { kind: 'in_range', confidence: conf };
   166	  }
   167	  // numeric NaN/Infinity or any value outside [0, 1] (typed as number but out
   168	  // of range) → out_of_range. Also catches non-numeric values that slipped
   169	  // past the TypeScript optional-number annotation.
   170	  return { kind: 'out_of_range', original: conf };
   171	}
   172	
   173	// ============================================
   174	// ROW CONSTRUCTION
   175	// ============================================
   176	
   177	/**
   178	 * Build the canonical `classification_signals` insert row from a
   179	 * CanonicalSignalInput. Per DS-023 §5.1 the row shape unifies the JSONB-path
   180	 * and dedicated-column-path schemas; missing fields persist as null per
   181	 * Postgres column-default semantics.
   182	 *
   183	 * @param confidenceToPersist — the validated confidence value, or null when
   184	 *   the §5.2 outcome rejects the producer's assertion (out_of_range,
   185	 *   missing_required) or when no confidence was provided (missing_optional)
   186	 */
   187	function buildInsertRow(signal: CanonicalSignalInput, confidenceToPersist: number | null): Record<string, unknown> {
   188	  return {
   189	    tenant_id: signal.tenantId,
   190	    entity_id: signal.entityId ?? null,
   191	    signal_type: signal.signalType,
   192	    signal_value: (signal.signalValue ?? {}) as Json,
   193	    confidence: confidenceToPersist,
   194	    source: signal.source ?? 'ai_prediction',
   195	    context: (signal.context ?? {}) as Json,
   196	    calculation_run_id: signal.calculationRunId ?? null,
   197	    rule_set_id: signal.ruleSetId ?? null,
   198	    // Dedicated columns (AUD-001 F-002 collapse; nullable when not provided)
   199	    source_file_name: signal.sourceFileName ?? null,
   200	    sheet_name: signal.sheetName ?? null,
   201	    structural_fingerprint: (signal.structuralFingerprint ?? null) as Json | null,
   202	    classification: signal.classification ?? null,
   203	    decision_source: signal.decisionSource ?? null,
   204	    classification_trace: (signal.classificationTrace ?? null) as Json | null,
   205	    vocabulary_bindings: (signal.vocabularyBindings ?? null) as Json | null,
   206	    agent_scores: (signal.agentScores ?? null) as Json | null,
   207	    human_correction_from: signal.humanCorrectionFrom ?? null,
   208	    scope: signal.scope ?? null,
   209	  };
   210	}
   211	
   212	/**
   213	 * Construct the observability:write_failure signal that accompanies an
   214	 * out_of_range or missing_required outcome. Per DS-023 §5.2 the signal carries:
   215	 *
   216	 *   - offending_field: 'confidence' (the only field §5.2 currently validates)
   217	 *   - expected_range: '[0.0, 1.0]' (Decision 30 v2 inclusive)
   218	 *   - actual_value: the producer's asserted value (string-coerced for NaN/Infinity
   219	 *     since JSON-stringify produces nulls for those; we want them observable)
   220	 *   - outcome_kind: 'out_of_range' | 'missing_required'
   221	 *   - source_signal_type: the signal_type that triggered the failure
   222	 *
   223	 * The observability signal itself is `confidence_required: false` per registry
   224	 * (registered in Phase 2); it never re-triggers validation.
   225	 */
   226	function buildObservabilitySignal(
   227	  originalSignal: CanonicalSignalInput,
   228	  outcome: Exclude<ValidationOutcome, { kind: 'in_range' } | { kind: 'missing_optional' }>,
   229	): CanonicalSignalInput {
   230	  const actualValueObservable = outcome.kind === 'out_of_range'
   231	    ? (typeof outcome.original === 'number' && !Number.isFinite(outcome.original)
   232	        ? String(outcome.original) // 'NaN' | 'Infinity' | '-Infinity'
   233	        : outcome.original)
   234	    : null;
   235	  return {
   236	    tenantId: originalSignal.tenantId,
   237	    signalType: 'observability:write_failure',
   238	    signalValue: {
   239	      offending_field: 'confidence',
   240	      expected_range: '[0.0, 1.0]',
   241	      actual_value: actualValueObservable as unknown,
   242	      outcome_kind: outcome.kind,
   243	      source_signal_type: originalSignal.signalType,
   244	      source_entity_id: originalSignal.entityId ?? null,
   245	      source_rule_set_id: originalSignal.ruleSetId ?? null,
   246	      source_calculation_run_id: originalSignal.calculationRunId ?? null,
   247	    },
   248	    confidence: null, // observability:write_failure is confidence_required:false
   249	    source: 'system',
   250	    calculationRunId: originalSignal.calculationRunId ?? null,
   251	    ruleSetId: originalSignal.ruleSetId ?? null,
   252	    context: { producing_module: 'canonical-signal-writer' },
   253	  };
   254	}
   255	
   256	// ============================================
   257	// PUBLIC API
   258	// ============================================
   259	
   260	/**
   261	 * Write a single signal through the canonical entry point per DS-023 §5.1.
   262	 *
   263	 * Throws CanonicalWriteError when:
   264	 *   - signal_type is unregistered (cause='unregistered_signal_type')
   265	 *   - the database insert fails (cause='insert_failed' or 'database_unreachable')
   266	 *
   267	 * Returns WriteResult on a contract-failure outcome (out_of_range,
   268	 * missing_required) where the row persists but the producer should be made aware:
   269	 *   - success=true, observabilitySignalEmitted=true
   270	 *
   271	 * In-range and missing-optional outcomes return success=true,
   272	 * observabilitySignalEmitted=false.
   273	 */
   274	export async function writeSignal(
   275	  signal: CanonicalSignalInput,
   276	  supabaseUrl: string,
   277	  supabaseServiceKey: string,
   278	): Promise<WriteResult> {
   279	  if (!isRegistered(signal.signalType)) {
   280	    throw new CanonicalWriteError(
   281	      'unregistered_signal_type',
   282	      signal.signalType,
   283	      `[CanonicalWriter] writeSignal: signal_type '${signal.signalType}' not registered. ` +
   284	      `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
   285	      `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
   286	    );
   287	  }
   288	  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
   289	    auth: { autoRefreshToken: false, persistSession: false },
   290	  });
   291	  return writeSignalWithClient(signal, supabase);
   292	}
   293	
   294	/**
   295	 * Internal/testable variant of writeSignal that accepts a Supabase client
   296	 * directly. Exported for unit tests; production callers use `writeSignal`.
   297	 */
   298	export async function writeSignalWithClient(
   299	  signal: CanonicalSignalInput,
   300	  supabase: SupabaseClient,
   301	): Promise<WriteResult> {
   302	  const outcome = validateSignal(signal);
   303	  const confidenceToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
   304	  const row = buildInsertRow(signal, confidenceToPersist);
   305	
   306	  try {
   307	    const { error } = await supabase.from('classification_signals').insert(row);
   308	    if (error) {
   309	      throw new CanonicalWriteError(
   310	        'insert_failed',
   311	        signal.signalType,
   312	        `[CanonicalWriter] insert failed for signal_type='${signal.signalType}' tenant='${signal.tenantId}': ${error.message}`,
   313	      );
   314	    }
   315	  } catch (err) {
   316	    if (err instanceof CanonicalWriteError) throw err;
   317	    throw new CanonicalWriteError(
   318	      'database_unreachable',
   319	      signal.signalType,
   320	      `[CanonicalWriter] database unreachable for signal_type='${signal.signalType}' tenant='${signal.tenantId}': ${err instanceof Error ? err.message : String(err)}`,
   321	    );
   322	  }
   323	
   324	  // Emit observability signal for contract-failure outcomes (out_of_range, missing_required)
   325	  if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
   326	    const obs = buildObservabilitySignal(signal, outcome);
   327	    const obsRow = buildInsertRow(obs, null);
   328	    try {
   329	      const { error: obsError } = await supabase.from('classification_signals').insert(obsRow);
   330	      if (obsError) {
   331	        // Per DS-023 §5.2: observability emission failure does NOT swallow
   332	        // the original row's persistence outcome. Surface via stderr so the
   333	        // failure is observable, but the original write succeeded.
   334	        console.error(
   335	          `[CanonicalWriter] observability:write_failure emission failed (original row persisted) ` +
   336	          `for source_signal_type='${signal.signalType}': ${obsError.message}`,
   337	        );
   338	        return { success: true, observabilitySignalEmitted: false };
   339	      }
   340	    } catch (err) {
   341	      console.error(
   342	        `[CanonicalWriter] observability:write_failure emission threw (original row persisted) ` +
   343	        `for source_signal_type='${signal.signalType}': ${err instanceof Error ? err.message : String(err)}`,
   344	      );
   345	      return { success: true, observabilitySignalEmitted: false };
   346	    }
   347	    return { success: true, observabilitySignalEmitted: true };
   348	  }
   349	
   350	  return { success: true, observabilitySignalEmitted: false };
   351	}
   352	
   353	/**
   354	 * Write a batch of signals through the canonical entry point per DS-023 §5.1.
   355	 *
   356	 * Behavior:
   357	 *   - Unregistered signal_type in the batch → CanonicalWriteError on the first
   358	 *     such signal (the entire batch fails atomically; resolve registration
   359	 *     upstream and retry)
   360	 *   - Per-row validation produces an outcome; rows persist together in one
   361	 *     batch insert with confidence:null where the outcome rejects the producer
   362	 *   - Observability signals emit in a single follow-up batch insert (one round-
   363	 *     trip), efficient for the common case of zero or few rejections in a batch
   364	 *   - Observability batch failure does NOT swallow the original batch outcome
   365	 */
   366	export async function writeSignalBatch(
   367	  signals: CanonicalSignalInput[],
   368	  supabaseUrl: string,
   369	  supabaseServiceKey: string,
   370	): Promise<BatchWriteResult> {
   371	  if (signals.length === 0) return { success: true, count: 0, observabilitySignalsEmitted: 0 };
   372	
   373	  // Pre-validate every signal_type is registered (Decision 154/155 + AUD-004 v3 E1/E2).
   374	  // Atomic: if any signal in the batch is unregistered, no writes occur.
   375	  for (const s of signals) {
   376	    if (!isRegistered(s.signalType)) {
   377	      throw new CanonicalWriteError(
   378	        'unregistered_signal_type',
   379	        s.signalType,
   380	        `[CanonicalWriter] writeSignalBatch: signal_type '${s.signalType}' not registered. ` +
   381	        `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
   382	        `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
   383	      );
   384	    }
   385	  }
   386	  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
   387	    auth: { autoRefreshToken: false, persistSession: false },
   388	  });
   389	  return writeSignalBatchWithClient(signals, supabase);
   390	}
   391	
   392	/**
   393	 * Internal/testable variant of writeSignalBatch. Exported for unit tests.
   394	 */
   395	export async function writeSignalBatchWithClient(
   396	  signals: CanonicalSignalInput[],
   397	  supabase: SupabaseClient,
   398	): Promise<BatchWriteResult> {
   399	  if (signals.length === 0) return { success: true, count: 0, observabilitySignalsEmitted: 0 };
   400	
   401	  // Validate each signal; build insert rows + collect observability signals
   402	  const outcomes = signals.map(validateSignal);
   403	  const rows = signals.map((s, i) => {
   404	    const outcome = outcomes[i];
   405	    const confToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
   406	    return buildInsertRow(s, confToPersist);
   407	  });
   408	  const observabilitySignals: CanonicalSignalInput[] = [];
   409	  for (let i = 0; i < signals.length; i++) {
   410	    const outcome = outcomes[i];
   411	    if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
   412	      observabilitySignals.push(buildObservabilitySignal(signals[i], outcome));
   413	    }
   414	  }
   415	
   416	  // Primary insert
   417	  try {
   418	    const { error } = await supabase.from('classification_signals').insert(rows);
   419	    if (error) {
   420	      throw new CanonicalWriteError(
   421	        'insert_failed',
   422	        signals[0]?.signalType ?? '<empty-batch>',
   423	        `[CanonicalWriter] batch insert failed (count=${signals.length}): ${error.message}`,
   424	      );
   425	    }
   426	  } catch (err) {
   427	    if (err instanceof CanonicalWriteError) throw err;
   428	    throw new CanonicalWriteError(
   429	      'database_unreachable',
   430	      signals[0]?.signalType ?? '<empty-batch>',
   431	      `[CanonicalWriter] database unreachable on batch (count=${signals.length}): ${err instanceof Error ? err.message : String(err)}`,
   432	    );
   433	  }
   434	
   435	  // Observability emission (one round-trip for the whole batch)
   436	  let observabilityEmitted = 0;
   437	  if (observabilitySignals.length > 0) {
   438	    const obsRows = observabilitySignals.map(s => buildInsertRow(s, null));
   439	    try {
   440	      const { error: obsError } = await supabase.from('classification_signals').insert(obsRows);
   441	      if (obsError) {
   442	        console.error(
   443	          `[CanonicalWriter] batch observability emission failed (originals persisted; count=${observabilitySignals.length}): ${obsError.message}`,
   444	        );
   445	      } else {
   446	        observabilityEmitted = observabilitySignals.length;
   447	      }
   448	    } catch (err) {
   449	      console.error(
   450	        `[CanonicalWriter] batch observability emission threw (originals persisted; count=${observabilitySignals.length}): ${err instanceof Error ? err.message : String(err)}`,
   451	      );
   452	    }
   453	  }
   454	
   455	  return {
   456	    success: true,
   457	    count: signals.length,
   458	    observabilitySignalsEmitted: observabilityEmitted,
   459	  };
   460	}
```
