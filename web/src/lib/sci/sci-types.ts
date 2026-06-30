// Synaptic Content Ingestion — Type Definitions
// Decision 77 — OB-127
// Zero domain vocabulary. Korean Test applies.

// ============================================================
// LAYER 1: CONTENT PROFILE
// ============================================================

export interface ContentProfile {
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  tabIndex: number;

  structure: {
    rowCount: number;
    sampleRowCount?: number;        // D15.2: rows the profiling sample saw — the SAME basis distinctCount
                                    // used, so identifierRepeatRatio divides like-by-like (not full÷sample).
                                    // Optional: absent → the ratio falls back to rowCount (pre-fix basis).
    columnCount: number;
    sparsity: number;               // 0-1, percentage of null/empty cells
    headerQuality: 'clean' | 'auto_generated' | 'missing';
    // OB-159: Structural ratios computed at profile time
    numericFieldRatio: number;        // fraction of non-ID fields with numeric types (0-1)
    categoricalFieldRatio: number;    // fraction of columns that are low-cardinality text (<20 distinct)
    categoricalFieldCount: number;    // count of categorical text columns
    identifierRepeatRatio: number;    // totalRowCount / uniqueIdentifierValues (1.0 = roster, >3.0 = transactional)
  };

  fields: FieldProfile[];

  patterns: {
    hasEntityIdentifier: boolean;
    hasDateColumn: boolean;
    hasTemporalColumns: boolean;      // OB-160A: type-agnostic temporal detection (raw values)
    hasCurrencyColumns: number;       // count
    hasPercentageValues: boolean;
    hasDescriptiveLabels: boolean;
    hasStructuralNameColumn: boolean; // OB-160A: identifier-relative cardinality name detection
    rowCountCategory: 'reference' | 'moderate' | 'transactional';
    // OB-160A: Volume pattern based on rows-per-entity
    volumePattern: 'single' | 'few' | 'many' | 'unknown';
    // single: ≤ 1.5 rows per entity (roster, one-time reference)
    // few: 1.5 - 3.0 rows per entity (targets per period, quarterly data)
    // many: > 3.0 rows per entity (monthly transactions, daily events)
    // unknown: no identifier field detected
  };

  // OB-160A: Every structural determination emittable as signal
  observations: ProfileObservation[];

  // OB-160B: LLM header comprehension (populated after profile generation)
  headerComprehension?: HeaderComprehension;
}

// OB-160A: Signal interface for flywheel emission
export interface ProfileObservation {
  columnName: string | null;          // null for sheet-level observations
  observationType: string;            // 'type_classification', 'temporal_detection', 'name_detection', 'header_comprehension', etc.
  observedValue: unknown;             // the determination
  confidence: number;                 // how confident
  alternativeInterpretations: Record<string, number>;  // other plausible types/interpretations with scores
  structuralEvidence: string;         // why this determination was made
}

// ============================================================
// OB-160B: HEADER COMPREHENSION (LLM contextual understanding)
// ============================================================

// OB-231: the fixed ColumnRole enum is RETIRED (Decision 158 / AP-25 / Korean Test). The LLM
// characterizes each column FREELY in its own words; the construction layer reads the free-form
// fields directly. `data_nature` and `identifies` are LLM assessments, not selections from a list.

// Free-form column characterization (replaces ColumnRole + HeaderInterpretation's
// {semanticMeaning, columnRole, identifiesWhat}). No field is validated against an enumeration.
export interface ColumnCharacterization {
  characterization: string;   // free-form description of what the column IS (was semanticMeaning)
  identifies: string;         // free-form SCOPE the LLM assessed — e.g. entity, transaction, product, reference, nothing
  data_nature: string;        // free-form NATURE the LLM assessed — e.g. identifier, measure, temporal, categorical, name, computed
  relationships: string[];    // free-form observations about how this column relates to others
}

// ============================================================
// OB-162: FIELD IDENTITY (Decision 111)
// ============================================================

// Field identity = what a column IS (stable, context-independent)
// Stored in committed_data.metadata.field_identities
export interface FieldIdentity {
  structuralType: string;             // OB-231: free-form data-nature (was ColumnRole)
  contextualIdentity: string;         // what kind of identifier/measure/etc (e.g., person_identifier, currency_amount)
  confidence: number;                 // 0.0-1.0
}

// LLM interpretation of a single column header — OB-231: free-form characterization channels.
export interface HeaderInterpretation {
  columnName: string;              // original header as customer wrote it
  characterization: string;        // free-form meaning in the LLM's words (was semanticMeaning)
  dataExpectation: string;         // what values should look like: 'integer_1_to_12', 'unique_numeric_id'
  data_nature: string;             // free-form nature the LLM assessed (was columnRole)
  identifies: string;              // free-form scope the LLM assessed (subsumes the former identifiesWhat)
  relationships: string[];         // free-form cross-column observations
  confidence: number;              // LLM's confidence in this interpretation
}

// Result of LLM header comprehension for one sheet
export interface HeaderComprehension {
  interpretations: Map<string, HeaderInterpretation>;  // columnName -> interpretation
  crossSheetInsights: string[];    // observations about relationships between sheets
  llmCallDuration: number;         // milliseconds
  llmModel: string;                // which model was used
  fromVocabularyBinding: boolean;  // true if recalled from stored bindings (Phase E), false if fresh LLM call
}

// Metrics for every header comprehension call (LLM or binding)
// OB-203 Phase 1 (DI-4) — structural class of a comprehension-boundary failure.
// These are the call's actual structural outcomes, NOT a shape registry (Korean Test):
// parse_failure (unparseable response), timeout (the call exceeded its budget),
// schema_mismatch (response shape did not validate), unclassified_failure (anything else).
export type ComprehensionFailureClass =
  | 'parse_failure'
  | 'timeout'
  | 'schema_mismatch'
  | 'unclassified_failure';

export interface HeaderComprehensionMetrics {
  llmCalled: boolean;               // was LLM called, or were vocabulary bindings used?
  llmCallDuration: number | null;   // milliseconds (null if not called)
  llmModel: string | null;
  columnsInterpreted: number;       // total columns across all sheets
  columnsFromBindings: number;      // how many came from stored vocabulary bindings
  columnsFromLLM: number;           // how many required fresh LLM interpretation
  averageConfidence: number;        // mean confidence across all interpretations
  crossSheetInsightCount: number;   // how many cross-sheet insights were generated
  timestamp: string;                // ISO timestamp
  // OB-203 Phase 1 (DI-4): present iff the comprehension call failed (vs. simply
  // not called). The silent heuristic fallback is now a NAMED, durable outcome.
  failure?: { failureClass: ComprehensionFailureClass; durationMs: number } | null;
}

// Vocabulary binding — stored header interpretation for flywheel recall
export interface VocabularyBinding {
  columnName: string;              // the header as the customer wrote it
  interpretation: HeaderInterpretation;
  structuralContext: {             // structural context at time of binding
    sheetColumnCount: number;
    sheetRowCountBucket: 'small' | 'medium' | 'large';
    columnPosition: number;
    dataType: string;              // Phase A type classification
  };
  confirmationSource: 'llm_initial' | 'user_confirmed' | 'user_corrected' | 'classification_success';
  confirmationCount: number;
  lastConfirmed: string;           // ISO timestamp
}

// HF-254 Fix 3a (T1-E902): persisted vocabulary_bindings value. Legacy rows are a
// bare meaning string; later rows carry the full characterization so the lexical
// flywheel is a characterization-bearing prior, not a meaning-only cache. Persistence
// carries the full interpretation — nothing is narrowed. OB-231: free-form fields.
export type VocabularyBindingValue =
  | string
  | { characterization: string; data_nature: string; identifies: string; relationships: string[]; confidence: number };

// Trace entry for Phase C ClassificationTrace integration
export interface HeaderComprehensionTraceEntry {
  metrics: HeaderComprehensionMetrics;
  interpretations: Record<string, HeaderInterpretation>;  // per column
  enhancements: string[];  // which profile fields were enhanced by comprehension
}

export interface FieldProfile {
  fieldName: string;                  // original column header — customer vocabulary
  fieldIndex: number;

  dataType: 'integer' | 'decimal' | 'currency' | 'percentage' | 'date' | 'text' | 'boolean' | 'mixed';
  nullRate: number;                   // 0-1
  distinctCount: number;

  distribution: {
    min?: number;
    max?: number;
    mean?: number;
    isSequential?: boolean;
    categoricalValues?: string[];     // max 20 for low-cardinality text
  };

  nameSignals: {
    containsId: boolean;
    containsName: boolean;
    containsTarget: boolean;
    containsDate: boolean;
    containsAmount: boolean;
    containsRate: boolean;
    // OB-158: Structural name detection (from values, not headers)
    looksLikePersonName: boolean;
  };
}

// ============================================================
// LAYER 2: AGENTS
// ============================================================

export type AgentType = 'plan' | 'entity' | 'target' | 'transaction' | 'reference';

// HF-285-B: structural predicate over the closed AgentType vocabulary (Korean
// Test — no language literals). A sheet classified entity OR target is one whose
// `identifier` columnRole IS the entity identifier — exactly the classifications
// resolveEntityIdField (commit-content-unit) maps through findHcRole('identifier').
// Used by the identifier-role negotiation (agents.ts assignSemanticRole +
// negotiation.ts inferRoleForAgent) so an entity-classified identifier resolves
// to entity_identifier regardless of cardinality (DIAG-066 convergence).
export function isEntityIdentifierAgent(agent: AgentType): boolean {
  return agent === 'entity' || agent === 'target';
}

export interface AgentScore {
  agent: AgentType;
  confidence: number;                 // 0-1
  signals: AgentSignal[];             // what contributed to the score
  reasoning: string;                  // human-readable explanation
}

export interface AgentSignal {
  signal: string;                     // signal name
  weight: number;                     // contribution to score (positive or negative)
  evidence: string;                   // what in the Content Profile triggered this
}

// ============================================================
// LAYER 3: CLAIMS
// ============================================================

export type ClaimType = 'FULL' | 'PARTIAL' | 'DERIVED';

export interface ContentClaim {
  contentUnitId: string;
  agent: AgentType;
  claimType: ClaimType;
  confidence: number;
  fields?: string[];                  // for PARTIAL claims
  sharedFields?: string[];            // fields needed by multiple agents
  semanticBindings: SemanticBinding[];
  reasoning: string;
}

// ============================================================
// LAYER 5: SEMANTIC BINDING
// ============================================================

export type SemanticRole =
  | 'entity_identifier'       // links data to an entity
  | 'entity_name'             // display name for an entity
  | 'entity_attribute'        // categorical property of an entity
  | 'entity_relationship'     // hierarchical link (manager, parent)
  | 'entity_license'          // permission/product access
  | 'performance_target'      // goal/quota/benchmark for an entity
  | 'baseline_value'          // starting value for delta/growth calculations
  | 'transaction_amount'      // monetary value of an individual event
  | 'transaction_count'       // count of events
  | 'transaction_date'        // when the event occurred
  | 'transaction_identifier'  // unique ID for a transaction
  | 'period_marker'           // temporal grouping reference
  | 'category_code'           // product type, branch code, etc.
  | 'rate_value'              // percentage or rate
  | 'tier_boundary'           // threshold value in a tier structure
  | 'payout_amount'           // reward/payment amount
  | 'descriptive_label'       // text label or description
  | 'unknown'                 // agent couldn't determine role
  ;

export interface SemanticBinding {
  sourceField: string;                // customer vocabulary — immutable
  platformType: string;               // platform internal type
  semanticRole: SemanticRole;
  displayLabel: string;               // what the UI shows (defaults to sourceField)
  displayContext: string;             // generated explanation of purpose
  claimedBy: AgentType;
  confidence: number;
}

// ============================================================
// LAYER 4: NEGOTIATION (OB-134)
// ============================================================

export interface FieldAffinity {
  fieldName: string;
  affinities: Record<AgentType, number>;  // 0-1 per agent
  winner: AgentType;
  isShared: boolean;                       // needed by multiple agents as join key
}

export interface NegotiationResult {
  contentUnitId: string;
  round1Scores: AgentScore[];
  round2Scores: AgentScore[];
  fieldAffinities: FieldAffinity[];
  claims: ContentClaim[];                  // 1 for FULL, 2 for PARTIAL
  isSplit: boolean;                        // true when PARTIAL claims generated
  log: NegotiationLogEntry[];
}

export interface NegotiationLogEntry {
  stage: 'round1' | 'absence_boost' | 'field_analysis' | 'split_decision' | 'round2';
  agent?: AgentType;
  message: string;
  data?: Record<string, unknown>;
}

// ============================================================
// PROPOSAL (API Response)
// ============================================================

export interface SCIProposal {
  proposalId: string;
  // OB-203 Phase 3: comprehension-session identity (aliases proposalId). The import surface
  // polls GET /api/import/sci/session-state?importSessionId=… for live unit states. Distinct
  // from execute-side import_batch_id (HF-213).
  importSessionId?: string;
  tenantId: string;
  sourceFiles: string[];
  contentUnits: ContentUnitProposal[];
  processingOrder: string[];          // contentUnitIds in dependency order
  overallConfidence: number;
  requiresHumanReview: boolean;
  timestamp: string;
  // OB-160K: Classification density per content unit — execution mode visibility
  density?: Record<string, {
    confidence: number;
    totalClassifications: number;
    overrideRate: number;
    executionMode: 'full_analysis' | 'light_analysis' | 'confident';
  }>;
}

export interface ContentUnitProposal {
  contentUnitId: string;
  sourceFile: string;
  tabName: string;
  classification: AgentType;
  confidence: number;
  reasoning: string;
  action: string;                     // human-readable action description
  fieldBindings: SemanticBinding[];
  allScores: AgentScore[];            // scores from all 4 agents for transparency
  warnings: string[];
  // OB-138: Structured intelligence — surfaces agent reasoning in the UI
  observations: string[];             // what the agent noticed (structural facts)
  verdictSummary: string;             // one-line explanation of the classification decision
  whatChangesMyMind: string[];        // falsifiable conditions that would flip classification
  // OB-133: Document metadata for PPTX/PDF/DOCX plan proposals
  documentMetadata?: {
    // HF-258 (Q5): fileBase64 retired — dead at execute (unconsumed; AUD-0015/HALT-3).
    // Document content is referenced by storagePath and base64 is materialized server-side
    // from storage; no file bytes ride request bodies (AP-1). mimeType marker retained so
    // the proposal UI doc-plan flag (SCIProposal: !!unit.documentMetadata) still works.
    mimeType: string;
    extractionSummary?: Record<string, unknown>;
  };
  // OB-134: Negotiation metadata for PARTIAL claims
  claimType?: ClaimType;              // FULL (default) or PARTIAL
  ownedFields?: string[];             // field names this agent owns (PARTIAL only)
  sharedFields?: string[];            // join key fields shared with partner (PARTIAL only)
  partnerContentUnitId?: string;      // the other half of a PARTIAL split
  negotiationLog?: NegotiationLogEntry[];
  // OB-160E: Flywheel data — passed through to execute for signal write
  structuralFingerprint?: Record<string, unknown>;
  classificationTrace?: Record<string, unknown>;
  vocabularyBindings?: Record<string, VocabularyBindingValue>;  // HF-254: role-bearing or legacy string
  // OB-176: Recognition tier from DS-017 fingerprint flywheel
  recognitionTier?: 1 | 2 | 3;
  // OB-203 Phase 1 (DI-4): present iff this unit's comprehension failed. The unit
  // occupies the Phase 3 `failed_interpretation` state from day one — it is named in
  // the proposal, excluded from the comprehended presentation, and excluded from
  // confirm-all. Resolution actions (retry/manual/exclude) arrive in Phase 5.
  failedInterpretation?: { failureClass: ComprehensionFailureClass; durationMs: number | null };
  // OB-203 Phase 2 (8): per-sheet atom recognition provenance — fraction of atoms recognized from
  // prior signal, count of novel atoms comprehended, and whether the LLM was dispatched at all
  // (comprehension cost). Additive/optional (Phase 1 failedInterpretation pattern); rendered only
  // when present (legacy-shaped units show nothing).
  recognitionProvenance?: { recognizedFraction: number; novelCount: number; llmCalled: boolean };
}

// ============================================================
// EXECUTION (Processing confirmed proposals)
// ============================================================

export interface SCIExecutionRequest {
  proposalId: string;
  tenantId: string;
  contentUnits: ContentUnitExecution[];
  storagePath?: string; // HF-129: File storage path for plan document retrieval
}

export interface ContentUnitExecution {
  contentUnitId: string;
  confirmedClassification: AgentType; // may differ from proposal if user corrected
  confirmedBindings: SemanticBinding[];
  rawData: Record<string, unknown>[];  // the actual rows to process
  // OB-133: Document metadata for plan interpretation pipeline
  documentMetadata?: {
    // HF-258 (Q5): fileBase64 retired — dead at execute (unconsumed; AUD-0015/HALT-3).
    // Document content is referenced by storagePath and base64 is materialized server-side
    // from storage; no file bytes ride request bodies (AP-1). mimeType marker retained so
    // the proposal UI doc-plan flag (SCIProposal: !!unit.documentMetadata) still works.
    mimeType: string;
    extractionSummary?: Record<string, unknown>;
  };
  // OB-134: PARTIAL claim field filtering
  claimType?: ClaimType;
  ownedFields?: string[];             // fields this agent owns
  sharedFields?: string[];            // join key fields shared with partner
  // OB-135: Original prediction for signal outcome recording
  originalClassification?: AgentType; // what the agent proposed (before user override)
  originalConfidence?: number;        // agent's original confidence
  // OB-160E: Flywheel data — passed from proposal for signal write
  structuralFingerprint?: Record<string, unknown>;
  classificationTrace?: Record<string, unknown>;
  vocabularyBindings?: Record<string, VocabularyBindingValue>;  // HF-254: role-bearing or legacy string
  sourceFile?: string;
  tabName?: string;
}

export interface SCIExecutionResult {
  proposalId: string;
  results: ContentUnitResult[];
  overallSuccess: boolean;
  // OB-139: Post-execution summary for ImportReadyState
  summary?: {
    totalRowsCommitted: number;
    sourceDateRange?: { min: string; max: string } | null;
    planName?: string;
  };
  // OB-160G: Convergence report — matches + gaps for each rule_set
  convergence?: {
    ruleSetsProcessed: number;
    totalDerivations: number;
    reports: Array<{
      ruleSetId: string;
      ruleSetName: string;
      derivations: number;
      matches: Array<{ component: string; dataType: string; confidence: number; reason: string }>;
      gaps: Array<{ component: string; reason: string; resolution: string; referenceDataAvailable?: boolean }>;
    }>;
  };
  // HF-360 (Part A): when the import HANDED OFF its loads to the pg_cron worker, the enqueued job — the rows
  // are staged + loading (not in committed_data yet). The truthful surface polls load progress by session.
  pulseLoadJob?: { jobId: string; totalPulses: number; totalRows: number };
  // HF-360: staging succeeded but the hand-off ENQUEUE failed — the rows are staged but nothing will load
  // them. The client surfaces a failure (never a false "0 rows" success); recoverable by re-import.
  pulseLoadEnqueueFailed?: boolean;
}

export interface ContentUnitResult {
  contentUnitId: string;
  classification: AgentType;
  success: boolean;
  rowsProcessed: number;
  pipeline: string;                   // which pipeline handled it
  error?: string;
  /**
   * HF-248 Phase 3: per-component outcome surface for plan-interpretation
   * results. Populated only for `classification: 'plan'` results coming from
   * the per-component orchestrator. Carries the same shape persisted on
   * import_batches.error_summary.componentOutcomes so the UI can render
   * per-component status without an additional fetch.
   */
  componentOutcomes?: Array<{
    id: string;
    name: string;
    status: 'success' | 'failed';
    attempts: number;
    errClass?: string;
    errMessage?: string;
    httpStatus?: number;
    violations?: string;
    skippedFromPrior?: boolean;
    lastAttemptAt: string;
  }>;
  partialSuccess?: boolean;
  // HF-360 (Part A): when this unit STAGED its pulses for the hand-off worker (instead of loading inline),
  // the ordered staged pulses (index assigned at session scope). The session collects these across all
  // units into the one pulse_load_jobs manifest. `rowsProcessed` stays the LOADED count (0 at stage time —
  // the worker loads them); the truthful surface reads the job for load progress.
  stagedPulses?: Array<Omit<import('./pulse-load-types').PulseManifestEntry, 'index'>>;
}
