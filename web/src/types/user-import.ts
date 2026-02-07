/**
 * User Import Types
 *
 * Types for the Federated Employee Identity system and hierarchy auto-detection.
 */

// ============================================
// FEDERATED EMPLOYEE IDENTITY
// ============================================

/**
 * Source system that provides employee data
 */
export interface IdentitySource {
  id: string;
  name: string;
  type: 'hris' | 'payroll' | 'crm' | 'pos' | 'manual' | 'sso';
  priority: number; // Lower = higher priority for conflict resolution
  lastSync?: string; // ISO timestamp
  recordCount?: number;
}

/**
 * An identity link connects a federated identity to a source system
 */
export interface IdentityLink {
  sourceId: string;
  externalId: string; // ID in the source system
  confidence: number; // 0-100
  linkMethod: 'exact_match' | 'fuzzy_match' | 'manual' | 'inferred';
  linkedAt: string;
  linkedBy?: string;
  validFrom?: string;
  validTo?: string;
}

/**
 * Federated Employee Identity - the canonical representation of an employee
 * across all source systems
 */
export interface FederatedIdentity {
  id: string;
  tenantId: string;

  // Canonical employee data (resolved from sources)
  canonicalData: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    employeeNumber?: string;
    department?: string;
    title?: string;
    location?: string;
    hireDate?: string;
    terminationDate?: string;
    status: 'active' | 'inactive' | 'pending' | 'terminated';
  };

  // Links to source systems
  identityLinks: IdentityLink[];

  // Hierarchy relationships
  hierarchy: {
    managerId?: string; // FederatedIdentity ID
    directReports: string[]; // FederatedIdentity IDs
    teamId?: string;
    level?: number; // Org level (1 = CEO, 2 = VP, etc.)
  };

  // Confidence in the identity resolution
  identityConfidence: number; // 0-100
  hierarchyConfidence: number; // 0-100

  // Audit
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ============================================
// HIERARCHY AUTO-DETECTION
// ============================================

/**
 * Detection signals used to infer hierarchy
 */
export type HierarchySignal =
  | 'explicit_manager_id' // Source data has explicit manager reference
  | 'title_pattern' // Job title suggests level (VP, Director, Manager, etc.)
  | 'department_structure' // Department naming suggests hierarchy
  | 'email_domain_pattern' // Email pattern suggests reporting structure
  | 'location_rollup' // Location hierarchy suggests reporting
  | 'transaction_approval' // Approval patterns reveal hierarchy
  | 'compensation_tier'; // Compensation levels suggest hierarchy

/**
 * A single detection signal observation
 */
export interface SignalObservation {
  signal: HierarchySignal;
  sourceId: string;
  observedValue: string;
  inferredRelationship?: {
    type: 'reports_to' | 'manages' | 'peer_of';
    targetEmployeeId: string;
    confidence: number;
  };
  confidence: number;
  timestamp: string;
}

/**
 * Result of hierarchy auto-detection for an employee
 */
export interface HierarchyDetectionResult {
  employeeId: string;
  detectedSignals: SignalObservation[];
  inferredManager?: {
    employeeId: string;
    confidence: number;
    supportingSignals: HierarchySignal[];
  };
  inferredLevel?: {
    level: number;
    confidence: number;
    supportingSignals: HierarchySignal[];
  };
  conflicts: HierarchyConflict[];
  overallConfidence: number;
  requiresManualReview: boolean;
}

/**
 * Conflict between hierarchy signals
 */
export interface HierarchyConflict {
  type: 'manager_mismatch' | 'circular_reference' | 'level_inconsistency' | 'inversion_detected';
  employeeIds: string[];
  signals: HierarchySignal[];
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedResolution?: string;
}

/**
 * Relationship inversion - when two sources disagree about who reports to whom
 */
export interface RelationshipInversion {
  employeeA: string;
  employeeB: string;
  sourceASaysAReportsToB: boolean;
  sourceBSaysBReportsToA: boolean;
  sourceA: string;
  sourceB: string;
  detectedAt: string;
  resolvedAt?: string;
  resolution?: {
    correctManagerId: string;
    resolvedBy: string;
    notes?: string;
  };
}

// ============================================
// IMPORT BATCH TYPES
// ============================================

/**
 * Import batch - a set of records being imported together
 */
export interface ImportBatch {
  id: string;
  tenantId: string;
  sourceId: string;
  status: 'pending' | 'validating' | 'processing' | 'completed' | 'failed' | 'rolled_back';

  // Counts
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  skippedRecords: number;

  // Hierarchy detection summary
  hierarchyDetection?: {
    employeesWithDetectedManagers: number;
    employeesRequiringReview: number;
    inversionsDetected: number;
    averageConfidence: number;
  };

  // Timing
  startedAt?: string;
  completedAt?: string;
  estimatedCompletion?: string;

  // Audit
  createdBy: string;
  createdAt: string;
}

/**
 * Parsed employee data fields
 */
export interface ParsedEmployeeData {
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeNumber?: string;
  managerId?: string;
  managerEmail?: string;
  managerName?: string;
  department?: string;
  title?: string;
  location?: string;
  hireDate?: string;
  terminationDate?: string;
}

/**
 * Individual record in an import batch
 */
export interface ImportRecord {
  id: string;
  batchId: string;
  rowNumber: number;
  status: 'pending' | 'processing' | 'matched' | 'created' | 'updated' | 'skipped' | 'failed';

  // Raw data from source
  rawData: Record<string, unknown>;

  // Parsed and validated data
  parsedData?: ParsedEmployeeData;

  // Identity resolution result
  identityMatch?: {
    federatedIdentityId?: string;
    matchType: 'exact' | 'fuzzy' | 'created' | 'ambiguous';
    confidence: number;
    candidateMatches?: Array<{
      federatedIdentityId: string;
      confidence: number;
      matchReasons: string[];
    }>;
  };

  // Hierarchy detection for this record
  hierarchyDetection?: HierarchyDetectionResult;

  // Validation
  validationErrors: ValidationError[];
  validationWarnings: ValidationWarning[];

  // Timing
  processedAt?: string;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  messageEs?: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  messageEs?: string;
}

// ============================================
// FIELD MAPPING
// ============================================

/**
 * Mapping between source columns and canonical fields
 */
export interface FieldMapping {
  sourceColumn: string;
  targetField: keyof ParsedEmployeeData;
  transformations?: FieldTransformation[];
  required?: boolean;
}

export type FieldTransformation =
  | { type: 'trim' }
  | { type: 'lowercase' }
  | { type: 'uppercase' }
  | { type: 'date_parse'; format: string }
  | { type: 'regex_extract'; pattern: string; group?: number }
  | { type: 'lookup'; lookupTable: string; sourceField: string; targetField: string }
  | { type: 'default'; value: string };

/**
 * Column from source file
 */
export interface SourceColumn {
  name: string;
  sampleValues: string[];
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'unknown';
  nullCount: number;
  uniqueCount: number;
  suggestedMapping?: keyof ParsedEmployeeData;
  mappingConfidence?: number;
}

// ============================================
// IMPORT WIZARD STATE
// ============================================

export type ImportWizardStep =
  | 'upload'
  | 'mapping'
  | 'validation'
  | 'hierarchy_review'
  | 'preview'
  | 'processing'
  | 'complete';

export interface ImportWizardState {
  step: ImportWizardStep;
  sourceId: string;
  batchId?: string;

  // Upload step
  file?: File;
  fileType?: 'csv' | 'xlsx' | 'json';
  delimiter?: string;
  hasHeaderRow?: boolean;

  // Mapping step
  sourceColumns: SourceColumn[];
  fieldMappings: FieldMapping[];
  autoMappedFields: number;
  manualMappedFields: number;

  // Validation step
  validationSummary?: {
    totalRecords: number;
    validRecords: number;
    recordsWithErrors: number;
    recordsWithWarnings: number;
    commonErrors: Array<{ code: string; count: number; message: string }>;
  };

  // Hierarchy review step
  hierarchyReviewSummary?: {
    totalEmployees: number;
    autoDetectedManagers: number;
    requiresReview: number;
    inversionsDetected: number;
    averageConfidence: number;
  };

  // Processing
  progress?: {
    current: number;
    total: number;
    stage: string;
    stageEs?: string;
  };
}
