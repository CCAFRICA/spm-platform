# E3.5b — HF-092_CLASSIFICATION_SIGNALS_SCHEMA_CORRECTION.md (verbatim with line numbers)

**File:** `HF-092_CLASSIFICATION_SIGNALS_SCHEMA_CORRECTION.md` (repo root)
**Total lines:** 488

```markdown
     1	# HF-092: CLASSIFICATION SIGNALS SCHEMA CORRECTION
     2	## Scale-Ready Schema for SCI Flywheel
     3	## Type: Hotfix — Corrective
     4	## Depends on: OB-160E (PR #186 — must be merged)
     5	## Priority: P0 — Blocks Phase F. Standing Rule 2 violation.
     6	## Root Cause: CC Failure Pattern 43 — JSONB blob instead of specification-defined columns
     7	
     8	---
     9	
    10	## AUTONOMY DIRECTIVE
    11	NEVER ask yes/no. NEVER say "shall I". Just act. Execute all phases sequentially. Commit after each phase. Push after each commit.
    12	
    13	---
    14	
    15	## READ FIRST
    16	
    17	Before reading further, open and read these files COMPLETELY:
    18	
    19	1. `CC_STANDING_ARCHITECTURE_RULES.md` — all rules apply. PAY SPECIAL ATTENTION to Section A Rule 2: Scale by Design, Not Retrofit.
    20	2. `SCHEMA_REFERENCE.md` — authoritative column reference
    21	3. `web/src/lib/sci/classification-signal-service.ts` — the file being corrected
    22	
    23	---
    24	
    25	## WHY THIS HF EXISTS
    26	
    27	OB-160E was given a prompt that specified dedicated top-level columns on the `classification_signals` table:
    28	
    29	```sql
    30	-- DEV PLAN v2 SPECIFICATION (the controlling document):
    31	classification_signals (
    32	  id, tenant_id,
    33	  source_file_name, sheet_name,
    34	  structural_fingerprint JSONB,
    35	  classification, confidence, decision_source,
    36	  classification_trace JSONB,
    37	  header_comprehension JSONB,
    38	  vocabulary_bindings JSONB,
    39	  agent_scores JSONB,
    40	  human_correction_from TEXT,
    41	  scope TEXT DEFAULT 'tenant',
    42	  created_at TIMESTAMPTZ
    43	)
    44	```
    45	
    46	CC instead stored all Phase E data inside the existing `signal_value` JSONB column under `signal_type: 'sci:classification_outcome_v2'`. This is a **Standing Rule 2 violation:**
    47	
    48	- **Dedicated columns are indexable.** `WHERE structural_fingerprint->>'numericFieldRatioBucket' = '50-75'` on an indexed JSONB column is O(log n). Scanning inside a nested `signal_value` JSONB blob is O(n).
    49	- **At 50 tenants × 100 imports × 3 sheets = 15,000 signals,** JSONB path scanning is noticeable. At enterprise scale (500 tenants × 1,000 imports), it's a redesign.
    50	- **Phases I, J, K query these columns heavily.** Cross-tenant flywheel (Phase I) queries `scope = 'foundational'` + `structural_fingerprint` across ALL tenants. Domain flywheel (Phase J) adds domain filtering. Synaptic density (Phase K) aggregates by fingerprint. All of these require indexed, top-level columns.
    51	
    52	**The specification defined the schema for a reason. CC deviated from it. This HF corrects the deviation.**
    53	
    54	---
    55	
    56	## PHASE 0: AUDIT CURRENT STATE
    57	
    58	Before writing any code, document exactly what OB-160E created:
    59	
    60	```bash
    61	# 1. What columns exist on classification_signals now?
    62	# Run in Supabase SQL Editor:
    63	# SELECT column_name, data_type FROM information_schema.columns 
    64	# WHERE table_name = 'classification_signals' ORDER BY ordinal_position;
    65	
    66	# 2. How does classification-signal-service.ts currently write signals?
    67	grep -n "signal_value\|signal_type\|sci:classification" \
    68	  web/src/lib/sci/classification-signal-service.ts
    69	
    70	# 3. How does lookupPriorSignals currently query?
    71	grep -A 15 "async function lookupPriorSignals" \
    72	  web/src/lib/sci/classification-signal-service.ts
    73	
    74	# 4. How does recallVocabularyBindings currently query?
    75	grep -A 15 "async function recallVocabularyBindings" \
    76	  web/src/lib/sci/classification-signal-service.ts
    77	
    78	# 5. How many signals exist in the table right now?
    79	# Run in Supabase SQL Editor:
    80	# SELECT count(*), signal_type FROM classification_signals GROUP BY signal_type;
    81	
    82	# 6. Are there existing OB-86 signals we need to preserve?
    83	# Run in Supabase SQL Editor:
    84	# SELECT DISTINCT signal_type FROM classification_signals;
    85	```
    86	
    87	Paste ALL output into a document. This establishes the baseline.
    88	
    89	**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 0: Audit current classification_signals schema and usage" && git push origin dev`
    90	
    91	---
    92	
    93	## PHASE 1: SCHEMA MIGRATION
    94	
    95	### 1A: Add Dedicated Columns
    96	
    97	Execute this migration in the **Supabase SQL Editor** — not as a file. Verify with a schema query afterward.
    98	
    99	```sql
   100	-- HF-092: Add dedicated columns to classification_signals
   101	-- Reason: Dev Plan v2 specification requires indexed, queryable columns.
   102	-- OB-160E incorrectly stored data in signal_value JSONB blob.
   103	
   104	-- Add columns (IF NOT EXISTS prevents failure if partially applied)
   105	ALTER TABLE classification_signals 
   106	  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
   107	  ADD COLUMN IF NOT EXISTS sheet_name TEXT,
   108	  ADD COLUMN IF NOT EXISTS structural_fingerprint JSONB,
   109	  ADD COLUMN IF NOT EXISTS classification TEXT,
   110	  ADD COLUMN IF NOT EXISTS confidence NUMERIC,
   111	  ADD COLUMN IF NOT EXISTS decision_source TEXT,
   112	  ADD COLUMN IF NOT EXISTS classification_trace JSONB,
   113	  ADD COLUMN IF NOT EXISTS header_comprehension JSONB,
   114	  ADD COLUMN IF NOT EXISTS vocabulary_bindings JSONB,
   115	  ADD COLUMN IF NOT EXISTS agent_scores JSONB,
   116	  ADD COLUMN IF NOT EXISTS human_correction_from TEXT,
   117	  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'tenant';
   118	
   119	-- Verify columns exist
   120	SELECT column_name, data_type, column_default
   121	FROM information_schema.columns 
   122	WHERE table_name = 'classification_signals' 
   123	ORDER BY ordinal_position;
   124	```
   125	
   126	### 1B: Create Indexes for Scale
   127	
   128	```sql
   129	-- Index for prior signal lookup: tenant + structural fingerprint matching
   130	-- This is the hot path — called on every import for every content unit
   131	CREATE INDEX IF NOT EXISTS idx_cs_tenant_scope 
   132	  ON classification_signals(tenant_id, scope);
   133	
   134	CREATE INDEX IF NOT EXISTS idx_cs_tenant_fingerprint 
   135	  ON classification_signals(tenant_id) 
   136	  WHERE scope = 'tenant';
   137	
   138	-- Index for vocabulary binding recall: tenant + most recent with bindings
   139	CREATE INDEX IF NOT EXISTS idx_cs_vocab_bindings 
   140	  ON classification_signals(tenant_id, created_at DESC) 
   141	  WHERE vocabulary_bindings IS NOT NULL;
   142	
   143	-- Index for cross-tenant flywheel (Phase I): foundational scope queries
   144	CREATE INDEX IF NOT EXISTS idx_cs_foundational 
   145	  ON classification_signals(scope, structural_fingerprint) 
   146	  WHERE scope = 'foundational';
   147	
   148	-- Index for domain flywheel (Phase J): domain-scoped queries
   149	-- (scope column will be used with domain tagging in Phase J)
   150	
   151	-- Verify indexes exist
   152	SELECT indexname, indexdef FROM pg_indexes 
   153	WHERE tablename = 'classification_signals';
   154	```
   155	
   156	### 1C: Migrate Existing Phase E Data (if any)
   157	
   158	If OB-160E wrote any signals into `signal_value` JSONB, migrate them to the dedicated columns:
   159	
   160	```sql
   161	-- Migrate Phase E signals from signal_value JSONB to dedicated columns
   162	-- Only migrate rows where the dedicated columns are still NULL
   163	UPDATE classification_signals
   164	SET
   165	  source_file_name = signal_value->>'source_file_name',
   166	  sheet_name = signal_value->>'sheet_name',
   167	  structural_fingerprint = (signal_value->'structural_fingerprint')::JSONB,
   168	  classification = signal_value->>'classification',
   169	  confidence = (signal_value->>'confidence')::NUMERIC,
   170	  decision_source = signal_value->>'decision_source',
   171	  classification_trace = (signal_value->'classification_trace')::JSONB,
   172	  header_comprehension = (signal_value->'header_comprehension')::JSONB,
   173	  vocabulary_bindings = (signal_value->'vocabulary_bindings')::JSONB,
   174	  agent_scores = (signal_value->'agent_scores')::JSONB,
   175	  human_correction_from = signal_value->>'human_correction_from',
   176	  scope = COALESCE(signal_value->>'scope', 'tenant')
   177	WHERE signal_type = 'sci:classification_outcome_v2'
   178	  AND classification IS NULL;
   179	
   180	-- Verify migration
   181	SELECT id, source_file_name, sheet_name, classification, confidence, decision_source, scope
   182	FROM classification_signals
   183	WHERE signal_type = 'sci:classification_outcome_v2';
   184	```
   185	
   186	### Proof Gates — Phase 1
   187	- PG-01: ALL dedicated columns exist on classification_signals (paste schema query result)
   188	- PG-02: Index `idx_cs_tenant_scope` exists (paste pg_indexes query)
   189	- PG-03: Index `idx_cs_tenant_fingerprint` exists
   190	- PG-04: Index `idx_cs_vocab_bindings` exists
   191	- PG-05: Index `idx_cs_foundational` exists
   192	- PG-06: Any existing Phase E signals migrated to dedicated columns (paste verification query)
   193	- PG-07: OB-86 signals (non-Phase-E) are UNTOUCHED (verify with count query)
   194	
   195	**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 1: Schema migration — dedicated columns + indexes for scale-ready signal storage" && git push origin dev`
   196	
   197	---
   198	
   199	## PHASE 2: UPDATE SIGNAL SERVICE TO USE DEDICATED COLUMNS
   200	
   201	### 2A: Update writeClassificationSignal
   202	
   203	Modify `web/src/lib/sci/classification-signal-service.ts` to write to dedicated columns instead of `signal_value` JSONB:
   204	
   205	```typescript
   206	// BEFORE (OB-160E — WRONG):
   207	// .insert({
   208	//   tenant_id: tenantId,
   209	//   signal_type: 'sci:classification_outcome_v2',
   210	//   signal_value: { structural_fingerprint, classification, ... },  // ← BLOB
   211	//   confidence: ...,
   212	// })
   213	
   214	// AFTER (HF-092 — CORRECT):
   215	// .insert({
   216	//   tenant_id: tenantId,
   217	//   signal_type: 'sci:classification_outcome_v2',  // keep for compatibility with OB-86 queries
   218	//   source_file_name: sourceFileName,               // ← DEDICATED COLUMN
   219	//   sheet_name: sheetName,                           // ← DEDICATED COLUMN
   220	//   structural_fingerprint: fingerprint,             // ← DEDICATED COLUMN (indexed)
   221	//   classification: classification,                  // ← DEDICATED COLUMN
   222	//   confidence: confidence,                          // ← DEDICATED COLUMN
   223	//   decision_source: decisionSource,                 // ← DEDICATED COLUMN
   224	//   classification_trace: classificationTrace,       // ← DEDICATED COLUMN
   225	//   header_comprehension: headerComprehension,       // ← DEDICATED COLUMN
   226	//   vocabulary_bindings: vocabularyBindings,          // ← DEDICATED COLUMN
   227	//   agent_scores: agentScores,                       // ← DEDICATED COLUMN
   228	//   human_correction_from: humanCorrectionFrom,      // ← DEDICATED COLUMN
   229	//   scope: 'tenant',                                 // ← DEDICATED COLUMN (indexed)
   230	// })
   231	```
   232	
   233	### 2B: Update lookupPriorSignals
   234	
   235	Query dedicated columns, not JSONB paths:
   236	
   237	```typescript
   238	// BEFORE (OB-160E — WRONG):
   239	// .select('id, signal_value')  // ← reading from JSONB blob
   240	// .filter on signal_value->>'structural_fingerprint'
   241	
   242	// AFTER (HF-092 — CORRECT):
   243	// .select('id, classification, confidence, decision_source, structural_fingerprint')
   244	// Direct column access — indexed, O(log n) lookup
   245	const { data, error } = await supabase
   246	  .from('classification_signals')
   247	  .select('id, classification, confidence, decision_source, structural_fingerprint')
   248	  .eq('tenant_id', tenantId)
   249	  .eq('scope', 'tenant')
   250	  .order('created_at', { ascending: false })
   251	  .limit(20);
   252	```
   253	
   254	### 2C: Update recallVocabularyBindings
   255	
   256	Query `vocabulary_bindings` column directly:
   257	
   258	```typescript
   259	// BEFORE (OB-160E — WRONG):
   260	// .select('signal_value')  // ← reading from JSONB blob
   261	// then extracting signal_value.vocabulary_bindings
   262	
   263	// AFTER (HF-092 — CORRECT):
   264	// .select('vocabulary_bindings')  // ← direct column access, indexed
   265	const { data, error } = await supabase
   266	  .from('classification_signals')
   267	  .select('vocabulary_bindings')
   268	  .eq('tenant_id', tenantId)
   269	  .not('vocabulary_bindings', 'is', null)
   270	  .order('created_at', { ascending: false })
   271	  .limit(5);
   272	```
   273	
   274	### 2D: Update Trace API Endpoint
   275	
   276	Update `web/src/app/api/import/sci/trace/route.ts` to query dedicated columns:
   277	
   278	```typescript
   279	// Select from dedicated columns, not signal_value JSONB
   280	const { data, error } = await supabase
   281	  .from('classification_signals')
   282	  .select(`
   283	    id, source_file_name, sheet_name,
   284	    classification, confidence, decision_source,
   285	    structural_fingerprint, classification_trace,
   286	    header_comprehension, vocabulary_bindings,
   287	    agent_scores, human_correction_from, scope,
   288	    created_at
   289	  `)
   290	  .eq('tenant_id', tenantId)
   291	  .order('created_at', { ascending: false })
   292	  .limit(limit);
   293	```
   294	
   295	### 2E: Verify No Remaining signal_value References for SCI Data
   296	
   297	```bash
   298	# After updates, grep for any remaining signal_value usage in SCI signal code
   299	grep -rn "signal_value" \
   300	  web/src/lib/sci/classification-signal-service.ts \
   301	  web/src/app/api/import/sci/trace/route.ts
   302	# Should return ZERO for SCI signal reads/writes
   303	# (signal_value may still exist for OB-86 non-SCI signals — that's fine)
   304	```
   305	
   306	### Proof Gates — Phase 2
   307	- PG-08: writeClassificationSignal writes to dedicated columns (paste the insert object)
   308	- PG-09: lookupPriorSignals queries dedicated columns, not signal_value (paste the select)
   309	- PG-10: recallVocabularyBindings queries vocabulary_bindings column directly (paste the select)
   310	- PG-11: Trace API queries dedicated columns (paste the select)
   311	- PG-12: ZERO signal_value references in classification-signal-service.ts for SCI signals
   312	- PG-13: ZERO signal_value references in trace/route.ts
   313	- PG-14: `npm run build` exits 0
   314	
   315	**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Phase 2: Signal service writes/reads dedicated columns — no JSONB blob" && git push origin dev`
   316	
   317	---
   318	
   319	## PHASE 3: BUILD + VERIFY + PR
   320	
   321	### 3A: Build Verification
   322	
   323	```bash
   324	kill dev server
   325	rm -rf .next
   326	npm run build   # must exit 0
   327	npm run dev
   328	# Confirm localhost:3000 responds
   329	```
   330	
   331	### 3B: Code Review Verification
   332	
   333	```bash
   334	# 1. Verify classification-signal-service.ts writes dedicated columns
   335	grep -n "source_file_name\|sheet_name\|structural_fingerprint\|classification_trace\|vocabulary_bindings\|decision_source\|human_correction_from\|scope" \
   336	  web/src/lib/sci/classification-signal-service.ts | head -20
   337	
   338	# 2. Verify NO signal_value usage for SCI data
   339	grep -n "signal_value" \
   340	  web/src/lib/sci/classification-signal-service.ts \
   341	  web/src/app/api/import/sci/trace/route.ts
   342	
   343	# 3. Verify lookupPriorSignals selects from columns
   344	grep -A 10 "lookupPriorSignals" \
   345	  web/src/lib/sci/classification-signal-service.ts | grep "select"
   346	
   347	# 4. Verify recallVocabularyBindings selects vocabulary_bindings column
   348	grep -A 10 "recallVocabularyBindings" \
   349	  web/src/lib/sci/classification-signal-service.ts | grep "select"
   350	
   351	# 5. Verify schema in Supabase (paste result)
   352	# SELECT column_name, data_type FROM information_schema.columns 
   353	# WHERE table_name = 'classification_signals' ORDER BY ordinal_position;
   354	
   355	# 6. Verify indexes in Supabase (paste result)
   356	# SELECT indexname FROM pg_indexes WHERE tablename = 'classification_signals';
   357	```
   358	
   359	### 3C: PR Creation
   360	
   361	```bash
   362	cd /Users/AndrewAfrica/spm-platform
   363	gh pr create --base main --head dev \
   364	  --title "HF-092: Classification Signals Schema Correction — dedicated columns for scale" \
   365	  --body "## Why This HF Exists
   366	
   367	OB-160E stored SCI classification signal data inside a generic signal_value JSONB blob 
   368	instead of the dedicated columns specified in the Dev Plan v2. This violates Standing Rule 2 
   369	(Scale by Design) because:
   370	
   371	- JSONB path queries are O(n) vs indexed column queries O(log n)
   372	- Phases I/J/K query structural_fingerprint and scope across ALL tenants
   373	- At 50+ tenants with hundreds of imports, JSONB scanning becomes a bottleneck
   374	
   375	## What Changed
   376	
   377	### 1. Schema Migration
   378	Added dedicated columns to classification_signals: source_file_name, sheet_name,
   379	structural_fingerprint, classification, confidence, decision_source, classification_trace,
   380	header_comprehension, vocabulary_bindings, agent_scores, human_correction_from, scope.
   381	
   382	### 2. Indexes for Scale
   383	- idx_cs_tenant_scope: tenant + scope (hot path for prior signal lookup)
   384	- idx_cs_tenant_fingerprint: tenant with scope='tenant' filter
   385	- idx_cs_vocab_bindings: tenant + created_at for vocabulary recall
   386	- idx_cs_foundational: scope + fingerprint for cross-tenant flywheel (Phase I)
   387	
   388	### 3. Service Updated
   389	writeClassificationSignal, lookupPriorSignals, recallVocabularyBindings all read/write
   390	dedicated columns instead of signal_value JSONB.
   391	
   392	### 4. Data Migration
   393	Any OB-160E signals in signal_value JSONB migrated to dedicated columns.
   394	OB-86 non-SCI signals untouched.
   395	
   396	## CC Failure Pattern 43
   397	JSONB blob instead of specification-defined columns. The controlling document (Dev Plan v2)
   398	specified the schema. The implementation deviated. This HF restores specification compliance.
   399	
   400	## Standing Rule 2 Compliance
   401	Every query now uses indexed columns. Scale test: works at 500 tenants × 1000 imports = 
   402	1.5M signals with O(log n) lookups."
   403	```
   404	
   405	### Proof Gates — Phase 3
   406	- PG-15: `npm run build` exits 0
   407	- PG-16: localhost:3000 responds
   408	- PG-17: Schema query shows ALL dedicated columns (paste result)
   409	- PG-18: Index query shows ALL 4 indexes (paste result)
   410	- PG-19: ZERO signal_value references for SCI data in classification-signal-service.ts
   411	- PG-20: ZERO signal_value references in trace/route.ts
   412	- PG-21: PR created with URL
   413	
   414	**Commit:** `cd /Users/AndrewAfrica/spm-platform && git add -A && git commit -m "HF-092 Complete: Classification signals schema correction — dedicated indexed columns" && git push origin dev`
   415	
   416	---
   417	
   418	## SCOPE BOUNDARIES
   419	
   420	### IN SCOPE
   421	- ALTER TABLE to add dedicated columns
   422	- CREATE INDEX for scale-ready queries
   423	- Migrate any existing signal_value data to dedicated columns
   424	- Update writeClassificationSignal to write dedicated columns
   425	- Update lookupPriorSignals to query dedicated columns
   426	- Update recallVocabularyBindings to query dedicated column
   427	- Update trace/route.ts to query dedicated columns
   428	- Preserve OB-86 non-SCI signals (don't touch signal_value for those)
   429	
   430	### OUT OF SCOPE — DO NOT TOUCH
   431	- Agent scoring logic
   432	- Analyze route flow
   433	- Execute route flow (except signal write call)
   434	- Header comprehension logic (only the data access path changes)
   435	- Tenant context
   436	- Content profile
   437	- Auth files
   438	- Calculation engine
   439	
   440	### CRITICAL CONSTRAINTS
   441	
   442	1. **OB-86 compatibility.** The `signal_type` and `signal_value` columns remain for OB-86's non-SCI signals (plan anomaly, field mapping, etc.). Phase E's SCI signals use the dedicated columns. Both coexist.
   443	2. **No data loss.** If OB-160E wrote signals into signal_value, they must be migrated to dedicated columns. Verify migration with a count query before and after.
   444	3. **Indexes designed for Phases I/J/K.** The `idx_cs_foundational` index prepares for cross-tenant flywheel queries even though Phase I is future. Building the index now costs nothing. Adding it later requires a table scan.
   445	
   446	---
   447	
   448	## COMPLETION REPORT ENFORCEMENT
   449	
   450	The completion report is created as a FILE, not terminal output.
   451	- File: `HF-092_COMPLETION_REPORT.md` in PROJECT ROOT
   452	- Created BEFORE final build verification
   453	
   454	### Completion Report Structure
   455	1. **Phase 0 audit results** — paste current schema, current signal_value usage, signal counts
   456	2. **Schema migration** — paste the SQL executed + verification query results
   457	3. **Index creation** — paste the SQL executed + pg_indexes verification
   458	4. **Data migration** — paste before/after signal counts
   459	5. **Service updates** — paste the new insert/select calls (dedicated columns)
   460	6. **signal_value grep** — paste proof of zero SCI signal_value references
   461	7. **Proof gates** — 21 gates, each PASS/FAIL with pasted evidence
   462	
   463	---
   464	
   465	## SECTION F QUICK CHECKLIST
   466	
   467	```
   468	Before submitting completion report, verify:
   469	□ CC_STANDING_ARCHITECTURE_RULES.md read?
   470	□ Current schema audited (Phase 0 output pasted)?
   471	□ All dedicated columns added to classification_signals?
   472	□ All 4 indexes created?
   473	□ Existing Phase E signals migrated to dedicated columns?
   474	□ OB-86 non-SCI signals untouched?
   475	□ writeClassificationSignal writes dedicated columns?
   476	□ lookupPriorSignals queries dedicated columns?
   477	□ recallVocabularyBindings queries vocabulary_bindings column?
   478	□ trace/route.ts queries dedicated columns?
   479	□ ZERO signal_value references for SCI data?
   480	□ npm run build exits 0?
   481	□ localhost:3000 responds?
   482	□ gh pr create executed?
   483	```
   484	
   485	---
   486	
   487	*ViaLuce.ai — The Way of Light*
   488	*HF-092: "The specification defined dedicated columns for a reason: they're indexable, queryable, and scale-ready. A JSONB blob is convenient today and a redesign tomorrow. We don't build for today."*
```
