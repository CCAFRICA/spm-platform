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

// Structural role of a column in its dataset
export type ColumnRole =
  | 'identifier'         // uniquely identifies an entity (employee ID, account number)
  | 'name'               // human-readable name for an entity
  | 'temporal'           // represents time (date, month, year, quarter)
  | 'measure'            // numeric measurement or metric (revenue, count, percentage)
  | 'attribute'          // categorical property (department, region, role, type)
  | 'reference_key'      // lookup key for reference data (hub ID, location code)
  | 'unknown'            // LLM couldn't determine
  ;

// LLM interpretation of a single column header
export interface HeaderInterpretation {
  columnName: string;              // original header as customer wrote it
  semanticMeaning: string;         // what it means: 'month_indicator', 'employee_identifier', etc.
  dataExpectation: string;         // what values should look like: 'integer_1_to_12', 'unique_numeric_id'
  columnRole: ColumnRole;          // structural role in the dataset
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
  tenantId: string;
  sourceFiles: string[];
  contentUnits: ContentUnitProposal[];
  processingOrder: string[];          // contentUnitIds in dependency order
  overallConfidence: number;
  requiresHumanReview: boolean;
  timestamp: string;
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
    fileBase64: string;
    mimeType: string;
    extractionSummary?: Record<string, unknown>;
  };
  // OB-134: Negotiation metadata for PARTIAL claims
  claimType?: ClaimType;              // FULL (default) or PARTIAL
  ownedFields?: string[];             // field names this agent owns (PARTIAL only)
  sharedFields?: string[];            // join key fields shared with partner (PARTIAL only)
  partnerContentUnitId?: string;      // the other half of a PARTIAL split
  negotiationLog?: NegotiationLogEntry[];
}

// ============================================================
// EXECUTION (Processing confirmed proposals)
// ============================================================

export interface SCIExecutionRequest {
  proposalId: string;
  tenantId: string;
  contentUnits: ContentUnitExecution[];
}

export interface ContentUnitExecution {
  contentUnitId: string;
  confirmedClassification: AgentType; // may differ from proposal if user corrected
  confirmedBindings: SemanticBinding[];
  rawData: Record<string, unknown>[];  // the actual rows to process
  // OB-133: Document metadata for plan interpretation pipeline
  documentMetadata?: {
    fileBase64: string;
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
}

export interface ContentUnitResult {
  contentUnitId: string;
  classification: AgentType;
  success: boolean;
  rowsProcessed: number;
  pipeline: string;                   // which pipeline handled it
  error?: string;
}
