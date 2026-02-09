/**
 * AI Service Types
 *
 * Provider-agnostic AI interface. Feature code imports from here.
 * Never imports from a specific provider.
 */

// === PROVIDER TYPES ===

export type AIProvider = 'anthropic' | 'openai' | 'azure_openai' | 'local';

export interface AIServiceConfig {
  provider: AIProvider;
  model: string;                    // e.g., 'claude-sonnet-4-20250514', 'gpt-4o'
  apiKey?: string;                  // From env var, never hardcoded
  baseUrl?: string;                 // For Azure OpenAI or local models
  maxTokens?: number;
  temperature?: number;
}

// === REQUEST/RESPONSE ===

export interface AIRequest {
  task: AITaskType;
  input: Record<string, unknown>;   // Task-specific input
  context?: Record<string, unknown>; // Optional context (tenant, module, etc.)
  options?: {
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
  };
}

export interface AIResponse {
  requestId: string;                // UUID for tracking
  task: AITaskType;
  result: Record<string, unknown>;  // Task-specific output
  confidence: number;               // 0-1 overall confidence
  provider: AIProvider;
  model: string;
  tokenUsage: { input: number; output: number };
  latencyMs: number;
  timestamp: string;
  signalId?: string;                // Training signal ID if captured
}

// === TASK TYPES ===

export type AITaskType =
  | 'file_classification'           // What type of file is this?
  | 'sheet_classification'          // What type of data is in this sheet?
  | 'field_mapping'                 // What platform field does this column map to?
  | 'plan_interpretation'           // Extract compensation rules from document
  | 'workbook_analysis'             // Analyze multi-sheet workbook structure
  | 'import_field_mapping'          // Suggest field mappings for import data
  | 'entity_extraction'             // Extract entities (people, places, orgs) from data
  | 'anomaly_detection'             // Flag outliers in financial/compensation data
  | 'recommendation'                // Generate actionable recommendation
  | 'natural_language_query';       // Answer question about platform data

// === TASK-SPECIFIC TYPES ===

export interface FileClassificationInput {
  fileName: string;
  contentPreview: string;
  metadata?: {
    fileSize?: number;
    mimeType?: string;
    columnCount?: number;
    rowCount?: number;
    headers?: string[];
    tenantModules?: string[];
  };
}

export interface FileClassificationResult {
  fileType: 'pos_cheque' | 'compensation_plan' | 'employee_roster' | 'transaction_data' | 'unknown';
  suggestedModule: string;
  parseStrategy: string;
  reasoning: string;
}

export interface SheetClassificationInput {
  sheetName: string;
  headers: string[];
  sampleRows: unknown[];
  planContext?: unknown;
}

export interface SheetClassificationResult {
  dataType: string;
  mappedEntity: string;
  suggestedMappings: Array<{
    sourceColumn: string;
    targetField: string;
    confidence: number;
  }>;
  reasoning: string;
}

export interface FieldMappingInput {
  columnName: string;
  sampleValues: unknown[];
  targetFields: string[];
  planComponents?: unknown[];
}

export interface FieldMappingResult {
  suggestedField: string;
  alternativeFields: string[];
  transformationNeeded: boolean;
  transformationHint?: string;
  reasoning: string;
}

export interface PlanInterpretationInput {
  content: string;
  format: string;
}

export interface PlanInterpretationResult {
  planName: string;
  effectiveDate: string;
  components: Array<{
    type: string;
    name: string;
    rules: unknown;
  }>;
  metrics: string[];
  tiers?: unknown[];
  rawExtraction: unknown;
}

export interface AnomalyDetectionInput {
  data: unknown[];
  metricName: string;
  context?: {
    expectedRange?: { min: number; max: number };
    historicalMean?: number;
    historicalStdDev?: number;
  };
}

export interface AnomalyDetectionResult {
  anomalies: Array<{
    index: number;
    value: unknown;
    severity: 'low' | 'medium' | 'high';
    type: string;
    explanation: string;
  }>;
  summary: {
    totalRecords: number;
    anomalyCount: number;
    anomalyRate: number;
  };
}

// === TRAINING SIGNAL ===
// Captured for every AI interaction

export interface TrainingSignal {
  signalId: string;
  requestId: string;                // Links to AIResponse
  task: AITaskType;
  tenantId: string;
  userId: string;
  timestamp: string;

  // What the AI produced
  aiOutput: Record<string, unknown>;
  aiConfidence: number;

  // What the user did with it
  userAction: 'accepted' | 'corrected' | 'rejected' | 'ignored' | 'pending';
  userCorrection?: Record<string, unknown>;

  // Outcome (filled later if available)
  outcome?: {
    wasCorrect: boolean;
    feedbackSource: 'user_explicit' | 'downstream_validation' | 'reconciliation';
  };

  // Context for learning
  metadata: Record<string, unknown>;
}

// === CONFIDENCE THRESHOLDS ===

export const AI_CONFIDENCE = {
  AUTO_APPLY: 0.90,     // >= 90%: apply automatically
  SUGGEST: 0.70,        // 70-89%: show suggestion, let user confirm
  ASK: 0.0,             // < 70%: show as option but do not pre-select
} as const;

// === PROVIDER ADAPTER INTERFACE ===

export interface AIProviderAdapter {
  execute(request: AIRequest): Promise<Omit<AIResponse, 'requestId' | 'provider' | 'model' | 'latencyMs' | 'timestamp' | 'signalId'>>;
}
