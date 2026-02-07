/**
 * Transform Pipeline Engine
 *
 * Executes ordered transformation steps with full logging.
 * Supports: normalization, enrichment, correction, conversion, deduplication, aggregation
 */

import type {
  RawRecord,
  TransformPipeline,
  TransformStep,
  TransformationLog,
  ValidationResult,
  RecordClassification,
} from './types';
import { runValidation } from './validation-engine';

export interface TransformResult {
  content: Record<string, unknown>;
  transformations: TransformationLog[];
  validationResults: ValidationResult[];
  classification: RecordClassification;
  confidenceScore: number;
  rulesApplied: string[];
}

// ============================================
// PIPELINE EXECUTION
// ============================================

/**
 * Run the full transformation pipeline on a raw record
 */
export async function runTransformPipeline(
  rawRecord: RawRecord,
  pipeline: TransformPipeline
): Promise<TransformResult> {
  let content = { ...rawRecord.rawContent };
  const transformations: TransformationLog[] = [];
  const rulesApplied: string[] = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  // Sort steps by order
  const sortedSteps = [...pipeline.steps]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  // Execute each step
  for (const step of sortedSteps) {
    const result = executeTransformStep(step, content);
    content = result.content;
    transformations.push(...result.transformations);
    rulesApplied.push(step.id);

    if (result.confidence !== undefined) {
      totalConfidence += result.confidence;
      confidenceCount++;
    }
  }

  // Run validation
  const validationResults = runValidation(content, rawRecord);

  // Classify the record based on transformations and validation
  const classification = classifyRecord(transformations, validationResults);

  // Calculate overall confidence
  const confidenceScore =
    confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 100;

  return {
    content,
    transformations,
    validationResults,
    classification,
    confidenceScore,
    rulesApplied,
  };
}

// ============================================
// STEP EXECUTION
// ============================================

interface StepResult {
  content: Record<string, unknown>;
  transformations: TransformationLog[];
  confidence?: number;
}

function executeTransformStep(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  switch (step.type) {
    case 'normalization':
      return executeNormalization(step, content);
    case 'correction':
      return executeCorrection(step, content);
    case 'conversion':
      return executeConversion(step, content);
    case 'enrichment':
      return executeEnrichment(step, content);
    case 'deduplication':
      return executeDeduplication(step, content);
    case 'aggregation':
      return executeAggregation(step, content);
    default:
      return { content, transformations: [] };
  }
}

// ============================================
// NORMALIZATION
// ============================================

function executeNormalization(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  const transformations: TransformationLog[] = [];
  const result = { ...content };
  const timestamp = new Date().toISOString();

  // Date normalization
  const dateFields = (step.config.dateFields as string[]) || ['date', 'orderDate', 'transactionDate', 'createdAt'];
  for (const field of dateFields) {
    if (result[field] !== undefined) {
      const original = result[field];
      const normalized = normalizeDateValue(original);
      if (normalized !== original) {
        result[field] = normalized;
        transformations.push({
          field,
          originalValue: original,
          transformedValue: normalized,
          transformationType: 'normalization',
          rule: `${step.id}:date_normalize`,
          confidence: 95,
          timestamp,
        });
      }
    }
  }

  // Whitespace cleanup
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      const cleaned = value.trim().replace(/\s+/g, ' ');
      if (cleaned !== value) {
        result[key] = cleaned;
        transformations.push({
          field: key,
          originalValue: value,
          transformedValue: cleaned,
          transformationType: 'normalization',
          rule: `${step.id}:whitespace_cleanup`,
          confidence: 100,
          timestamp,
        });
      }
    }
  }

  // Case normalization for specific fields
  const caseFields = (step.config.lowercaseFields as string[]) || ['email', 'status'];
  for (const field of caseFields) {
    if (typeof result[field] === 'string') {
      const original = result[field] as string;
      const normalized = original.toLowerCase();
      if (normalized !== original) {
        result[field] = normalized;
        transformations.push({
          field,
          originalValue: original,
          transformedValue: normalized,
          transformationType: 'normalization',
          rule: `${step.id}:case_normalize`,
          confidence: 100,
          timestamp,
        });
      }
    }
  }

  return {
    content: result,
    transformations,
    confidence: transformations.length > 0 ? 95 : 100,
  };
}

function normalizeDateValue(value: unknown): string | unknown {
  if (typeof value !== 'string') return value;

  // Try various date formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY or DD/MM/YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // MM-DD-YYYY or DD-MM-YYYY
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, // YYYY/MM/DD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD (ISO)
  ];

  for (const format of formats) {
    const match = value.match(format);
    if (match) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  // Try direct parse
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return value;
}

// ============================================
// CORRECTION
// ============================================

function executeCorrection(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  const transformations: TransformationLog[] = [];
  const result = { ...content };
  const timestamp = new Date().toISOString();

  // Currency value correction (remove symbols, handle decimals)
  const currencyFields = (step.config.currencyFields as string[]) || ['amount', 'value', 'total', 'commission'];
  for (const field of currencyFields) {
    if (result[field] !== undefined) {
      const original = result[field];
      const corrected = correctCurrencyValue(original);
      if (corrected !== original) {
        result[field] = corrected;
        transformations.push({
          field,
          originalValue: original,
          transformedValue: corrected,
          transformationType: 'correction',
          rule: `${step.id}:currency_correction`,
          confidence: 90,
          timestamp,
        });
      }
    }
  }

  // Null/empty to undefined
  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === '' || value === 'null' || value === 'NULL') {
      delete result[key];
      transformations.push({
        field: key,
        originalValue: value,
        transformedValue: undefined,
        transformationType: 'correction',
        rule: `${step.id}:null_cleanup`,
        confidence: 100,
        timestamp,
      });
    }
  }

  return {
    content: result,
    transformations,
    confidence: transformations.length > 0 ? 85 : 100,
  };
}

function correctCurrencyValue(value: unknown): number | unknown {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$€£¥₱,\s]/g, '');

  // Handle parentheses for negative numbers
  const isNegative = value.includes('(') && value.includes(')');
  const numericValue = parseFloat(cleaned.replace(/[()]/g, ''));

  if (!isNaN(numericValue)) {
    return isNegative ? -numericValue : numericValue;
  }

  return value;
}

// ============================================
// CONVERSION
// ============================================

function executeConversion(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  const transformations: TransformationLog[] = [];
  const result = { ...content };
  const timestamp = new Date().toISOString();

  // Type conversions
  const numberFields = (step.config.numberFields as string[]) || ['quantity', 'rate', 'percentage'];
  for (const field of numberFields) {
    if (result[field] !== undefined && typeof result[field] !== 'number') {
      const original = result[field];
      const parsed = parseFloat(String(original));
      if (!isNaN(parsed)) {
        result[field] = parsed;
        transformations.push({
          field,
          originalValue: original,
          transformedValue: parsed,
          transformationType: 'conversion',
          rule: `${step.id}:to_number`,
          confidence: 98,
          timestamp,
        });
      }
    }
  }

  const booleanFields = (step.config.booleanFields as string[]) || ['active', 'enabled', 'approved'];
  for (const field of booleanFields) {
    if (result[field] !== undefined && typeof result[field] !== 'boolean') {
      const original = result[field];
      const converted = convertToBoolean(original);
      if (converted !== null) {
        result[field] = converted;
        transformations.push({
          field,
          originalValue: original,
          transformedValue: converted,
          transformationType: 'conversion',
          rule: `${step.id}:to_boolean`,
          confidence: 95,
          timestamp,
        });
      }
    }
  }

  return {
    content: result,
    transformations,
    confidence: 100,
  };
}

function convertToBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (['true', 'yes', '1', 'y', 'si', 'sí'].includes(lower)) return true;
    if (['false', 'no', '0', 'n'].includes(lower)) return false;
  }
  return null;
}

// ============================================
// ENRICHMENT
// ============================================

function executeEnrichment(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  const transformations: TransformationLog[] = [];
  const result = { ...content };
  const timestamp = new Date().toISOString();

  // Add computed fields
  if (step.config.addTimestamp !== false) {
    result._processedAt = timestamp;
  }

  // Derive fiscal period from date
  const dateField = (step.config.dateField as string) || 'date';
  if (result[dateField] && !result.fiscalPeriod) {
    const date = new Date(String(result[dateField]));
    if (!isNaN(date.getTime())) {
      const fiscalPeriod = `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
      result.fiscalPeriod = fiscalPeriod;
      transformations.push({
        field: 'fiscalPeriod',
        originalValue: undefined,
        transformedValue: fiscalPeriod,
        transformationType: 'enrichment',
        rule: `${step.id}:derive_fiscal_period`,
        confidence: 100,
        timestamp,
      });
    }
  }

  // Currency detection
  const amountField = (step.config.amountField as string) || 'amount';
  if (result[amountField] && !result.currency) {
    // Default based on tenant context (would be passed in config)
    const defaultCurrency = (step.config.defaultCurrency as string) || 'USD';
    result.currency = defaultCurrency;
    transformations.push({
      field: 'currency',
      originalValue: undefined,
      transformedValue: defaultCurrency,
      transformationType: 'enrichment',
      rule: `${step.id}:default_currency`,
      confidence: 80,
      timestamp,
    });
  }

  return {
    content: result,
    transformations,
    confidence: 90,
  };
}

// ============================================
// DEDUPLICATION
// ============================================

function executeDeduplication(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  // For single record, just flag potential duplicate indicators
  const result = { ...content };
  const transformations: TransformationLog[] = [];

  // Mark duplicate detection fields
  const keyFields = (step.config.keyFields as string[]) || ['orderId', 'transactionId'];
  const dedupeKey = keyFields
    .map((f) => String(result[f] || ''))
    .filter((v) => v)
    .join('::');

  if (dedupeKey) {
    result._dedupeKey = dedupeKey;
  }

  return {
    content: result,
    transformations,
    confidence: 100,
  };
}

// ============================================
// AGGREGATION
// ============================================

function executeAggregation(
  step: TransformStep,
  content: Record<string, unknown>
): StepResult {
  // For single record, prepare aggregation fields
  const result = { ...content };

  // Mark aggregation group
  const groupFields = (step.config.groupBy as string[]) || ['repId', 'period'];
  const groupKey = groupFields
    .map((f) => String(result[f] || ''))
    .filter((v) => v)
    .join('::');

  if (groupKey) {
    result._aggregationGroup = groupKey;
  }

  return {
    content: result,
    transformations: [],
    confidence: 100,
  };
}

// ============================================
// CLASSIFICATION
// ============================================

function classifyRecord(
  transformations: TransformationLog[],
  validationResults: ValidationResult[]
): RecordClassification {
  // Check for critical validation failures
  const criticalFailures = validationResults.filter(
    (v) => v.status === 'fail' && (v.severity === 'critical' || v.severity === 'high')
  );

  if (criticalFailures.length > 0) {
    return 'rejected';
  }

  // Check for medium failures (quarantine)
  const mediumFailures = validationResults.filter(
    (v) => v.status === 'fail' && v.severity === 'medium'
  );

  if (mediumFailures.length > 0) {
    return 'quarantined';
  }

  // Check if any corrections were made
  const corrections = transformations.filter(
    (t) => t.transformationType === 'correction'
  );

  if (corrections.length > 0) {
    return 'auto_corrected';
  }

  return 'clean';
}

// ============================================
// DEFAULT PIPELINE
// ============================================

/**
 * Get the default transform pipeline
 */
export function getDefaultPipeline(): TransformPipeline {
  return {
    id: 'default-pipeline',
    name: 'Default Transform Pipeline',
    version: '1.0.0',
    steps: [
      {
        id: 'normalize',
        name: 'Normalize Data',
        type: 'normalization',
        config: {
          dateFields: ['date', 'orderDate', 'transactionDate', 'createdAt', 'updatedAt'],
          lowercaseFields: ['email', 'status'],
        },
        order: 1,
        enabled: true,
      },
      {
        id: 'correct',
        name: 'Correct Values',
        type: 'correction',
        config: {
          currencyFields: ['amount', 'value', 'total', 'commission', 'bonus'],
        },
        order: 2,
        enabled: true,
      },
      {
        id: 'convert',
        name: 'Convert Types',
        type: 'conversion',
        config: {
          numberFields: ['quantity', 'rate', 'percentage', 'units'],
          booleanFields: ['active', 'enabled', 'approved', 'processed'],
        },
        order: 3,
        enabled: true,
      },
      {
        id: 'enrich',
        name: 'Enrich Data',
        type: 'enrichment',
        config: {
          addTimestamp: true,
          dateField: 'date',
          amountField: 'amount',
          defaultCurrency: 'USD',
        },
        order: 4,
        enabled: true,
      },
      {
        id: 'dedupe',
        name: 'Detect Duplicates',
        type: 'deduplication',
        config: {
          keyFields: ['orderId', 'transactionId', 'externalId'],
        },
        order: 5,
        enabled: true,
      },
    ],
  };
}
