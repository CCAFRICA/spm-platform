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
    // clean = human-readable headers
    // auto_generated = __EMPTY pattern (SheetJS default)
    // missing = no discernible header row
  };

  fields: FieldProfile[];

  patterns: {
    hasEntityIdentifier: boolean;
    hasDateColumn: boolean;
    hasCurrencyColumns: number;       // count
    hasPercentageValues: boolean;
    hasDescriptiveLabels: boolean;
    rowCountCategory: 'reference' | 'moderate' | 'transactional';
    // reference: < 50 rows
    // moderate: 50-500 rows
    // transactional: 500+ rows
  };
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
  };
}

// ============================================================
// LAYER 2: AGENTS
// ============================================================

export type AgentType = 'plan' | 'entity' | 'target' | 'transaction';

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
}

export interface ContentUnitResult {
  contentUnitId: string;
  classification: AgentType;
  success: boolean;
  rowsProcessed: number;
  pipeline: string;                   // which pipeline handled it
  error?: string;
}
