# E5.5d — `web/src/lib/sci/sci-types.ts` (verbatim with line numbers)

**Total lines: 396**

```typescript
     1	// Synaptic Content Ingestion — Type Definitions
     2	// Decision 77 — OB-127
     3	// Zero domain vocabulary. Korean Test applies.
     4	
     5	// ============================================================
     6	// LAYER 1: CONTENT PROFILE
     7	// ============================================================
     8	
     9	export interface ContentProfile {
    10	  contentUnitId: string;
    11	  sourceFile: string;
    12	  tabName: string;
    13	  tabIndex: number;
    14	
    15	  structure: {
    16	    rowCount: number;
    17	    columnCount: number;
    18	    sparsity: number;               // 0-1, percentage of null/empty cells
    19	    headerQuality: 'clean' | 'auto_generated' | 'missing';
    20	    // OB-159: Structural ratios computed at profile time
    21	    numericFieldRatio: number;        // fraction of non-ID fields with numeric types (0-1)
    22	    categoricalFieldRatio: number;    // fraction of columns that are low-cardinality text (<20 distinct)
    23	    categoricalFieldCount: number;    // count of categorical text columns
    24	    identifierRepeatRatio: number;    // totalRowCount / uniqueIdentifierValues (1.0 = roster, >3.0 = transactional)
    25	  };
    26	
    27	  fields: FieldProfile[];
    28	
    29	  patterns: {
    30	    hasEntityIdentifier: boolean;
    31	    hasDateColumn: boolean;
    32	    hasTemporalColumns: boolean;      // OB-160A: type-agnostic temporal detection (raw values)
    33	    hasCurrencyColumns: number;       // count
    34	    hasPercentageValues: boolean;
    35	    hasDescriptiveLabels: boolean;
    36	    hasStructuralNameColumn: boolean; // OB-160A: identifier-relative cardinality name detection
    37	    rowCountCategory: 'reference' | 'moderate' | 'transactional';
    38	    // OB-160A: Volume pattern based on rows-per-entity
    39	    volumePattern: 'single' | 'few' | 'many' | 'unknown';
    40	    // single: ≤ 1.5 rows per entity (roster, one-time reference)
    41	    // few: 1.5 - 3.0 rows per entity (targets per period, quarterly data)
    42	    // many: > 3.0 rows per entity (monthly transactions, daily events)
    43	    // unknown: no identifier field detected
    44	  };
    45	
    46	  // OB-160A: Every structural determination emittable as signal
    47	  observations: ProfileObservation[];
    48	
    49	  // OB-160B: LLM header comprehension (populated after profile generation)
    50	  headerComprehension?: HeaderComprehension;
    51	}
    52	
    53	// OB-160A: Signal interface for flywheel emission
    54	export interface ProfileObservation {
    55	  columnName: string | null;          // null for sheet-level observations
    56	  observationType: string;            // 'type_classification', 'temporal_detection', 'name_detection', 'header_comprehension', etc.
    57	  observedValue: unknown;             // the determination
    58	  confidence: number;                 // how confident
    59	  alternativeInterpretations: Record<string, number>;  // other plausible types/interpretations with scores
    60	  structuralEvidence: string;         // why this determination was made
    61	}
    62	
    63	// ============================================================
    64	// OB-160B: HEADER COMPREHENSION (LLM contextual understanding)
    65	// ============================================================
    66	
    67	// Structural role of a column in its dataset
    68	export type ColumnRole =
    69	  | 'identifier'         // uniquely identifies an entity (employee ID, account number)
    70	  | 'name'               // human-readable name for an entity
    71	  | 'temporal'           // represents time (date, month, year, quarter)
    72	  | 'measure'            // numeric measurement or metric (revenue, count, percentage)
    73	  | 'attribute'          // categorical property (department, region, role, type)
    74	  | 'reference_key'      // lookup key for reference data (hub ID, location code)
    75	  | 'unknown'            // LLM couldn't determine
    76	  ;
    77	
    78	// ============================================================
    79	// OB-162: FIELD IDENTITY (Decision 111)
    80	// ============================================================
    81	
    82	// Field identity = what a column IS (stable, context-independent)
    83	// Stored in committed_data.metadata.field_identities
    84	export interface FieldIdentity {
    85	  structuralType: ColumnRole;         // what structural role this column plays
    86	  contextualIdentity: string;         // what kind of identifier/measure/etc (e.g., person_identifier, currency_amount)
    87	  confidence: number;                 // 0.0-1.0
    88	}
    89	
    90	// LLM interpretation of a single column header
    91	export interface HeaderInterpretation {
    92	  columnName: string;              // original header as customer wrote it
    93	  semanticMeaning: string;         // what it means: 'month_indicator', 'employee_identifier', etc.
    94	  dataExpectation: string;         // what values should look like: 'integer_1_to_12', 'unique_numeric_id'
    95	  columnRole: ColumnRole;          // structural role in the dataset
    96	  identifiesWhat?: string;         // HF-171: person, transaction, location, product, organization, account, other
    97	  confidence: number;              // LLM's confidence in this interpretation
    98	}
    99	
   100	// Result of LLM header comprehension for one sheet
   101	export interface HeaderComprehension {
   102	  interpretations: Map<string, HeaderInterpretation>;  // columnName -> interpretation
   103	  crossSheetInsights: string[];    // observations about relationships between sheets
   104	  llmCallDuration: number;         // milliseconds
   105	  llmModel: string;                // which model was used
   106	  fromVocabularyBinding: boolean;  // true if recalled from stored bindings (Phase E), false if fresh LLM call
   107	}
   108	
   109	// Metrics for every header comprehension call (LLM or binding)
   110	export interface HeaderComprehensionMetrics {
   111	  llmCalled: boolean;               // was LLM called, or were vocabulary bindings used?
   112	  llmCallDuration: number | null;   // milliseconds (null if not called)
   113	  llmModel: string | null;
   114	  columnsInterpreted: number;       // total columns across all sheets
   115	  columnsFromBindings: number;      // how many came from stored vocabulary bindings
   116	  columnsFromLLM: number;           // how many required fresh LLM interpretation
   117	  averageConfidence: number;        // mean confidence across all interpretations
   118	  crossSheetInsightCount: number;   // how many cross-sheet insights were generated
   119	  timestamp: string;                // ISO timestamp
   120	}
   121	
   122	// Vocabulary binding — stored header interpretation for flywheel recall
   123	export interface VocabularyBinding {
   124	  columnName: string;              // the header as the customer wrote it
   125	  interpretation: HeaderInterpretation;
   126	  structuralContext: {             // structural context at time of binding
   127	    sheetColumnCount: number;
   128	    sheetRowCountBucket: 'small' | 'medium' | 'large';
   129	    columnPosition: number;
   130	    dataType: string;              // Phase A type classification
   131	  };
   132	  confirmationSource: 'llm_initial' | 'user_confirmed' | 'user_corrected' | 'classification_success';
   133	  confirmationCount: number;
   134	  lastConfirmed: string;           // ISO timestamp
   135	}
   136	
   137	// Trace entry for Phase C ClassificationTrace integration
   138	export interface HeaderComprehensionTraceEntry {
   139	  metrics: HeaderComprehensionMetrics;
   140	  interpretations: Record<string, HeaderInterpretation>;  // per column
   141	  enhancements: string[];  // which profile fields were enhanced by comprehension
   142	}
   143	
   144	export interface FieldProfile {
   145	  fieldName: string;                  // original column header — customer vocabulary
   146	  fieldIndex: number;
   147	
   148	  dataType: 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'text' | 'boolean' | 'mixed';
   149	  nullRate: number;                   // 0-1
   150	  distinctCount: number;
   151	
   152	  distribution: {
   153	    min?: number;
   154	    max?: number;
   155	    mean?: number;
   156	    isSequential?: boolean;
   157	    categoricalValues?: string[];     // max 20 for low-cardinality text
   158	  };
   159	
   160	  nameSignals: {
   161	    containsId: boolean;
   162	    containsName: boolean;
   163	    containsTarget: boolean;
   164	    containsDate: boolean;
   165	    containsAmount: boolean;
   166	    containsRate: boolean;
   167	    // OB-158: Structural name detection (from values, not headers)
   168	    looksLikePersonName: boolean;
   169	  };
   170	}
   171	
   172	// ============================================================
   173	// LAYER 2: AGENTS
   174	// ============================================================
   175	
   176	export type AgentType = 'plan' | 'entity' | 'target' | 'transaction' | 'reference';
   177	
   178	export interface AgentScore {
   179	  agent: AgentType;
   180	  confidence: number;                 // 0-1
   181	  signals: AgentSignal[];             // what contributed to the score
   182	  reasoning: string;                  // human-readable explanation
   183	}
   184	
   185	export interface AgentSignal {
   186	  signal: string;                     // signal name
   187	  weight: number;                     // contribution to score (positive or negative)
   188	  evidence: string;                   // what in the Content Profile triggered this
   189	}
   190	
   191	// ============================================================
   192	// LAYER 3: CLAIMS
   193	// ============================================================
   194	
   195	export type ClaimType = 'FULL' | 'PARTIAL' | 'DERIVED';
   196	
   197	export interface ContentClaim {
   198	  contentUnitId: string;
   199	  agent: AgentType;
   200	  claimType: ClaimType;
   201	  confidence: number;
   202	  fields?: string[];                  // for PARTIAL claims
   203	  sharedFields?: string[];            // fields needed by multiple agents
   204	  semanticBindings: SemanticBinding[];
   205	  reasoning: string;
   206	}
   207	
   208	// ============================================================
   209	// LAYER 5: SEMANTIC BINDING
   210	// ============================================================
   211	
   212	export type SemanticRole =
   213	  | 'entity_identifier'       // links data to an entity
   214	  | 'entity_name'             // display name for an entity
   215	  | 'entity_attribute'        // categorical property of an entity
   216	  | 'entity_relationship'     // hierarchical link (manager, parent)
   217	  | 'entity_license'          // permission/product access
   218	  | 'performance_target'      // goal/quota/benchmark for an entity
   219	  | 'baseline_value'          // starting value for delta/growth calculations
   220	  | 'transaction_amount'      // monetary value of an individual event
   221	  | 'transaction_count'       // count of events
   222	  | 'transaction_date'        // when the event occurred
   223	  | 'transaction_identifier'  // unique ID for a transaction
   224	  | 'period_marker'           // temporal grouping reference
   225	  | 'category_code'           // product type, branch code, etc.
   226	  | 'rate_value'              // percentage or rate
   227	  | 'tier_boundary'           // threshold value in a tier structure
   228	  | 'payout_amount'           // reward/payment amount
   229	  | 'descriptive_label'       // text label or description
   230	  | 'unknown'                 // agent couldn't determine role
   231	  ;
   232	
   233	export interface SemanticBinding {
   234	  sourceField: string;                // customer vocabulary — immutable
   235	  platformType: string;               // platform internal type
   236	  semanticRole: SemanticRole;
   237	  displayLabel: string;               // what the UI shows (defaults to sourceField)
   238	  displayContext: string;             // generated explanation of purpose
   239	  claimedBy: AgentType;
   240	  confidence: number;
   241	}
   242	
   243	// ============================================================
   244	// LAYER 4: NEGOTIATION (OB-134)
   245	// ============================================================
   246	
   247	export interface FieldAffinity {
   248	  fieldName: string;
   249	  affinities: Record<AgentType, number>;  // 0-1 per agent
   250	  winner: AgentType;
   251	  isShared: boolean;                       // needed by multiple agents as join key
   252	}
   253	
   254	export interface NegotiationResult {
   255	  contentUnitId: string;
   256	  round1Scores: AgentScore[];
   257	  round2Scores: AgentScore[];
   258	  fieldAffinities: FieldAffinity[];
   259	  claims: ContentClaim[];                  // 1 for FULL, 2 for PARTIAL
   260	  isSplit: boolean;                        // true when PARTIAL claims generated
   261	  log: NegotiationLogEntry[];
   262	}
   263	
   264	export interface NegotiationLogEntry {
   265	  stage: 'round1' | 'absence_boost' | 'field_analysis' | 'split_decision' | 'round2';
   266	  agent?: AgentType;
   267	  message: string;
   268	  data?: Record<string, unknown>;
   269	}
   270	
   271	// ============================================================
   272	// PROPOSAL (API Response)
   273	// ============================================================
   274	
   275	export interface SCIProposal {
   276	  proposalId: string;
   277	  tenantId: string;
   278	  sourceFiles: string[];
   279	  contentUnits: ContentUnitProposal[];
   280	  processingOrder: string[];          // contentUnitIds in dependency order
   281	  overallConfidence: number;
   282	  requiresHumanReview: boolean;
   283	  timestamp: string;
   284	  // OB-160K: Classification density per content unit — execution mode visibility
   285	  density?: Record<string, {
   286	    confidence: number;
   287	    totalClassifications: number;
   288	    overrideRate: number;
   289	    executionMode: 'full_analysis' | 'light_analysis' | 'confident';
   290	  }>;
   291	}
   292	
   293	export interface ContentUnitProposal {
   294	  contentUnitId: string;
   295	  sourceFile: string;
   296	  tabName: string;
   297	  classification: AgentType;
   298	  confidence: number;
   299	  reasoning: string;
   300	  action: string;                     // human-readable action description
   301	  fieldBindings: SemanticBinding[];
   302	  allScores: AgentScore[];            // scores from all 4 agents for transparency
   303	  warnings: string[];
   304	  // OB-138: Structured intelligence — surfaces agent reasoning in the UI
   305	  observations: string[];             // what the agent noticed (structural facts)
   306	  verdictSummary: string;             // one-line explanation of the classification decision
   307	  whatChangesMyMind: string[];        // falsifiable conditions that would flip classification
   308	  // OB-133: Document metadata for PPTX/PDF/DOCX plan proposals
   309	  documentMetadata?: {
   310	    fileBase64: string;
   311	    mimeType: string;
   312	    extractionSummary?: Record<string, unknown>;
   313	  };
   314	  // OB-134: Negotiation metadata for PARTIAL claims
   315	  claimType?: ClaimType;              // FULL (default) or PARTIAL
   316	  ownedFields?: string[];             // field names this agent owns (PARTIAL only)
   317	  sharedFields?: string[];            // join key fields shared with partner (PARTIAL only)
   318	  partnerContentUnitId?: string;      // the other half of a PARTIAL split
   319	  negotiationLog?: NegotiationLogEntry[];
   320	  // OB-160E: Flywheel data — passed through to execute for signal write
   321	  structuralFingerprint?: Record<string, unknown>;
   322	  classificationTrace?: Record<string, unknown>;
   323	  vocabularyBindings?: Record<string, string>;
   324	  // OB-176: Recognition tier from DS-017 fingerprint flywheel
   325	  recognitionTier?: 1 | 2 | 3;
   326	}
   327	
   328	// ============================================================
   329	// EXECUTION (Processing confirmed proposals)
   330	// ============================================================
   331	
   332	export interface SCIExecutionRequest {
   333	  proposalId: string;
   334	  tenantId: string;
   335	  contentUnits: ContentUnitExecution[];
   336	  storagePath?: string; // HF-129: File storage path for plan document retrieval
   337	}
   338	
   339	export interface ContentUnitExecution {
   340	  contentUnitId: string;
   341	  confirmedClassification: AgentType; // may differ from proposal if user corrected
   342	  confirmedBindings: SemanticBinding[];
   343	  rawData: Record<string, unknown>[];  // the actual rows to process
   344	  // OB-133: Document metadata for plan interpretation pipeline
   345	  documentMetadata?: {
   346	    fileBase64: string;
   347	    mimeType: string;
   348	    extractionSummary?: Record<string, unknown>;
   349	  };
   350	  // OB-134: PARTIAL claim field filtering
   351	  claimType?: ClaimType;
   352	  ownedFields?: string[];             // fields this agent owns
   353	  sharedFields?: string[];            // join key fields shared with partner
   354	  // OB-135: Original prediction for signal outcome recording
   355	  originalClassification?: AgentType; // what the agent proposed (before user override)
   356	  originalConfidence?: number;        // agent's original confidence
   357	  // OB-160E: Flywheel data — passed from proposal for signal write
   358	  structuralFingerprint?: Record<string, unknown>;
   359	  classificationTrace?: Record<string, unknown>;
   360	  vocabularyBindings?: Record<string, string>;
   361	  sourceFile?: string;
   362	  tabName?: string;
   363	}
   364	
   365	export interface SCIExecutionResult {
   366	  proposalId: string;
   367	  results: ContentUnitResult[];
   368	  overallSuccess: boolean;
   369	  // OB-139: Post-execution summary for ImportReadyState
   370	  summary?: {
   371	    totalRowsCommitted: number;
   372	    sourceDateRange?: { min: string; max: string } | null;
   373	    planName?: string;
   374	  };
   375	  // OB-160G: Convergence report — matches + gaps for each rule_set
   376	  convergence?: {
   377	    ruleSetsProcessed: number;
   378	    totalDerivations: number;
   379	    reports: Array<{
   380	      ruleSetId: string;
   381	      ruleSetName: string;
   382	      derivations: number;
   383	      matches: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
   384	      gaps: Array<{ component: string; reason: string; resolution: string; referenceDataAvailable?: boolean }>;
   385	    }>;
   386	  };
   387	}
   388	
   389	export interface ContentUnitResult {
   390	  contentUnitId: string;
   391	  classification: AgentType;
   392	  success: boolean;
   393	  rowsProcessed: number;
   394	  pipeline: string;                   // which pipeline handled it
   395	  error?: string;
   396	}
```
