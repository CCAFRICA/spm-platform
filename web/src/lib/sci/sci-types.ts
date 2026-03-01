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
