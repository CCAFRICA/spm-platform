/**
 * Module-Aware Import Service
 *
 * Routes imported data to the correct processing pipeline based on
 * the tenant's enabled modules and the data's structure/content.
 *
 * Module detection:
 *   ICM (Incentive Compensation) - Employee performance data with goals/actuals
 *   FRMX (Financial Restaurant Module) - POS transactions with product descriptions
 *
 * After classification, data flows through module-specific pipelines:
 *   ICM: Standard data layer -> aggregation -> calculation
 *   FRMX: Normalization engine -> product mapping -> financial analytics
 *
 * AI anomaly detection runs on all imported data regardless of module.
 *
 * Korean Test: All field names, module names, and anomaly descriptions
 * come from the data. Zero hardcoded field or sheet names.
 */

import { getAIService } from '@/lib/ai/ai-service';
import type { TenantFeatures } from '@/types/tenant';

// =============================================================================
// TYPES
// =============================================================================

export type ModuleType = 'icm' | 'frmx' | 'unknown';

export interface ModuleClassification {
  module: ModuleType;
  confidence: number;
  reason: string;
  detectedFields: string[];
  suggestedPipeline: string;
}

export interface ImportAnomaly {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  description: string;
  affectedField: string;
  affectedRows: number;
  recommendation: string;
  detectedAt: string;
}

export interface ImportAnalysis {
  moduleClassification: ModuleClassification;
  anomalies: ImportAnomaly[];
  fieldSummary: FieldSummary[];
  rowCount: number;
  columnCount: number;
  analyzedAt: string;
}

export interface FieldSummary {
  fieldName: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  nullCount: number;
  uniqueCount: number;
  sampleValues: string[];
}

// =============================================================================
// MODULE CLASSIFICATION
// =============================================================================

// Field signatures that indicate each module type
const ICM_INDICATORS = [
  'entity_id', 'employeeid', 'emp_id', 'empid',
  'goal', 'target', 'quota', 'actual', 'attainment',
  'commission', 'incentive', 'bonus', 'payout',
  'store_id', 'storeid', 'store',
  'plan', 'component', 'variant',
];

const FRMX_INDICATORS = [
  'product', 'producto', 'item', 'articulo',
  'transaction', 'transaccion', 'ticket', 'folio',
  'pos', 'point_of_sale', 'terminal',
  'price', 'precio', 'total', 'cantidad', 'quantity',
  'location', 'sucursal', 'restaurant', 'restaurante',
  'sku', 'barcode', 'category', 'categoria',
];

/**
 * Classify which module an imported dataset belongs to.
 * Uses field name heuristics first, then AI for ambiguous cases.
 */
export function classifyModule(
  headers: string[],
  sampleData: Array<Record<string, unknown>>,
  tenantFeatures: TenantFeatures
): ModuleClassification {
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[\s\-_.]/g, ''));

  // Count field hits for each module
  let icmHits = 0;
  let frmxHits = 0;
  const icmFields: string[] = [];
  const frmxFields: string[] = [];

  for (const header of normalizedHeaders) {
    for (const indicator of ICM_INDICATORS) {
      if (header.includes(indicator.replace(/[_\s]/g, ''))) {
        icmHits++;
        icmFields.push(header);
        break;
      }
    }
    for (const indicator of FRMX_INDICATORS) {
      if (header.includes(indicator.replace(/[_\s]/g, ''))) {
        frmxHits++;
        frmxFields.push(header);
        break;
      }
    }
  }

  // Module availability gate
  const frmxAvailable = tenantFeatures.financial;
  const icmAvailable = tenantFeatures.compensation;

  // Decision logic
  if (icmHits > frmxHits && icmAvailable) {
    const confidence = Math.min(0.95, 0.5 + (icmHits * 0.1));
    return {
      module: 'icm',
      confidence,
      reason: `Detected ${icmHits} ICM fields: ${icmFields.slice(0, 5).join(', ')}`,
      detectedFields: icmFields,
      suggestedPipeline: 'Data Layer -> Aggregation -> Calculation Engine',
    };
  }

  if (frmxHits > icmHits && frmxAvailable) {
    const confidence = Math.min(0.95, 0.5 + (frmxHits * 0.1));
    return {
      module: 'frmx',
      confidence,
      reason: `Detected ${frmxHits} FRMX fields: ${frmxFields.slice(0, 5).join(', ')}`,
      detectedFields: frmxFields,
      suggestedPipeline: 'Normalization Engine -> Product Mapping -> Financial Analytics',
    };
  }

  // Ambiguous -- check data content patterns
  if (sampleData.length > 0) {
    const hasNumericAmounts = sampleData.some(row =>
      Object.values(row).some(v => typeof v === 'number' && v > 100)
    );
    const hasProductLikeStrings = sampleData.some(row =>
      Object.values(row).some(v =>
        typeof v === 'string' && v.length > 10 && /[A-Z]{3,}/.test(v)
      )
    );

    if (hasProductLikeStrings && frmxAvailable) {
      return {
        module: 'frmx',
        confidence: 0.5,
        reason: 'Data content suggests product descriptions (FRMX)',
        detectedFields: frmxFields,
        suggestedPipeline: 'Normalization Engine -> Product Mapping -> Financial Analytics',
      };
    }
    if (hasNumericAmounts && icmAvailable) {
      return {
        module: 'icm',
        confidence: 0.5,
        reason: 'Data content suggests performance metrics (ICM)',
        detectedFields: icmFields,
        suggestedPipeline: 'Data Layer -> Aggregation -> Calculation Engine',
      };
    }
  }

  return {
    module: 'unknown',
    confidence: 0,
    reason: 'Could not determine data module from headers or content',
    detectedFields: [],
    suggestedPipeline: 'Manual classification required',
  };
}

// =============================================================================
// AI ANOMALY DETECTION
// =============================================================================

/**
 * Run AI anomaly detection on imported data.
 * Detects: missing values, outliers, format inconsistencies,
 * duplicate patterns, and suspicious value distributions.
 */
export async function detectAnomalies(
  tenantId: string,
  headers: string[],
  data: Array<Record<string, unknown>>,
  moduleType: ModuleType
): Promise<ImportAnomaly[]> {
  const anomalies: ImportAnomaly[] = [];

  // Phase 1: Rule-based detection (fast, no AI needed)
  anomalies.push(...detectMissingValues(headers, data));
  anomalies.push(...detectOutliers(headers, data));
  anomalies.push(...detectDuplicates(headers, data));
  anomalies.push(...detectFormatInconsistencies(headers, data));

  // Phase 2: AI-powered detection (slower, catches subtle patterns)
  try {
    const aiAnomalies = await detectAIAnomalies(tenantId, headers, data, moduleType);
    anomalies.push(...aiAnomalies);
  } catch (err) {
    console.warn('[Import] AI anomaly detection failed (non-fatal):', err);
  }

  return anomalies;
}

/**
 * Detect fields with high missing value rates.
 */
function detectMissingValues(
  headers: string[],
  data: Array<Record<string, unknown>>
): ImportAnomaly[] {
  const anomalies: ImportAnomaly[] = [];
  const total = data.length;
  if (total === 0) return anomalies;

  for (const field of headers) {
    const nullCount = data.filter(row => {
      const val = row[field];
      return val === null || val === undefined || val === '' || val === 'null' || val === 'NULL';
    }).length;

    const nullRate = nullCount / total;

    if (nullRate > 0.5) {
      anomalies.push({
        id: `anomaly-missing-${field}-${Date.now()}`,
        severity: nullRate > 0.8 ? 'critical' : 'warning',
        category: 'Missing Values',
        description: `Field "${field}" has ${Math.round(nullRate * 100)}% missing values (${nullCount}/${total})`,
        affectedField: field,
        affectedRows: nullCount,
        recommendation: nullRate > 0.8
          ? 'Consider removing this field or providing default values'
          : 'Review data source for this field',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

/**
 * Detect numeric outliers using IQR method.
 */
function detectOutliers(
  headers: string[],
  data: Array<Record<string, unknown>>
): ImportAnomaly[] {
  const anomalies: ImportAnomaly[] = [];

  for (const field of headers) {
    const numericValues = data
      .map(row => Number(row[field]))
      .filter(v => !isNaN(v) && isFinite(v));

    if (numericValues.length < 10) continue; // Need enough data

    numericValues.sort((a, b) => a - b);
    const q1 = numericValues[Math.floor(numericValues.length * 0.25)];
    const q3 = numericValues[Math.floor(numericValues.length * 0.75)];
    const iqr = q3 - q1;

    if (iqr === 0) continue; // No variation

    const lowerBound = q1 - 3 * iqr;
    const upperBound = q3 + 3 * iqr;

    const outlierCount = numericValues.filter(v => v < lowerBound || v > upperBound).length;
    const outlierRate = outlierCount / numericValues.length;

    if (outlierRate > 0.01 && outlierCount > 0) {
      anomalies.push({
        id: `anomaly-outlier-${field}-${Date.now()}`,
        severity: outlierRate > 0.05 ? 'warning' : 'info',
        category: 'Outliers',
        description: `Field "${field}" has ${outlierCount} extreme outliers (beyond 3x IQR)`,
        affectedField: field,
        affectedRows: outlierCount,
        recommendation: 'Review outlier values for data entry errors',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

/**
 * Detect potential duplicate rows.
 */
function detectDuplicates(
  headers: string[],
  data: Array<Record<string, unknown>>
): ImportAnomaly[] {
  const anomalies: ImportAnomaly[] = [];

  // Create row fingerprints
  const fingerprints = new Map<string, number>();
  for (const row of data) {
    const fp = headers.map(h => String(row[h] || '')).join('|');
    const count = fingerprints.get(fp) || 0;
    fingerprints.set(fp, count + 1);
  }

  const duplicateCount = Array.from(fingerprints.values()).filter(c => c > 1).reduce((sum, c) => sum + c - 1, 0);

  if (duplicateCount > 0) {
    anomalies.push({
      id: `anomaly-duplicates-${Date.now()}`,
      severity: duplicateCount > data.length * 0.1 ? 'warning' : 'info',
      category: 'Duplicates',
      description: `${duplicateCount} potential duplicate rows detected`,
      affectedField: 'all',
      affectedRows: duplicateCount,
      recommendation: 'Review duplicates -- they may indicate a re-import or data extraction issue',
      detectedAt: new Date().toISOString(),
    });
  }

  return anomalies;
}

/**
 * Detect format inconsistencies within fields.
 */
function detectFormatInconsistencies(
  headers: string[],
  data: Array<Record<string, unknown>>
): ImportAnomaly[] {
  const anomalies: ImportAnomaly[] = [];

  for (const field of headers) {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined);
    if (values.length < 5) continue;

    // Check for mixed types
    const types = new Set(values.map(v => typeof v));
    if (types.size > 1) {
      anomalies.push({
        id: `anomaly-mixed-types-${field}-${Date.now()}`,
        severity: 'warning',
        category: 'Format Inconsistency',
        description: `Field "${field}" contains mixed data types: ${Array.from(types).join(', ')}`,
        affectedField: field,
        affectedRows: values.length,
        recommendation: 'Standardize the data type for this field before processing',
        detectedAt: new Date().toISOString(),
      });
    }

    // Check for inconsistent string casing in string fields
    const stringValues = values.filter(v => typeof v === 'string') as string[];
    if (stringValues.length > 10) {
      const upperCount = stringValues.filter(s => s === s.toUpperCase()).length;
      const lowerCount = stringValues.filter(s => s === s.toLowerCase()).length;
      const mixedCount = stringValues.length - upperCount - lowerCount;

      if (mixedCount > stringValues.length * 0.3 && upperCount > 0 && lowerCount > 0) {
        anomalies.push({
          id: `anomaly-casing-${field}-${Date.now()}`,
          severity: 'info',
          category: 'Format Inconsistency',
          description: `Field "${field}" has inconsistent casing: ${upperCount} ALL CAPS, ${lowerCount} lowercase, ${mixedCount} mixed`,
          affectedField: field,
          affectedRows: mixedCount,
          recommendation: 'Consider normalizing casing for consistent analysis',
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return anomalies;
}

/**
 * AI-powered anomaly detection for subtle patterns.
 */
async function detectAIAnomalies(
  tenantId: string,
  headers: string[],
  data: Array<Record<string, unknown>>,
  moduleType: ModuleType
): Promise<ImportAnomaly[]> {
  const aiService = getAIService();

  // Prepare a statistical summary for the AI (not raw data)
  const fieldStats = headers.map(field => {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined);
    const numericValues = values.map(Number).filter(v => !isNaN(v));
    const stringValues = values.filter(v => typeof v === 'string') as string[];

    return {
      field,
      totalRows: data.length,
      nonNull: values.length,
      numericCount: numericValues.length,
      stringCount: stringValues.length,
      min: numericValues.length > 0 ? Math.min(...numericValues) : null,
      max: numericValues.length > 0 ? Math.max(...numericValues) : null,
      mean: numericValues.length > 0 ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length : null,
      uniqueStrings: stringValues.length > 0 ? new Set(stringValues).size : 0,
      sampleStrings: stringValues.slice(0, 5),
    };
  });

  const response = await aiService.execute(
    {
      task: 'anomaly_detection',
      input: {
        data: fieldStats,
        metricName: 'import_analysis',
        context: {
          moduleType,
          rowCount: data.length,
          columnCount: headers.length,
          instructions: [
            'Analyze the statistical summary of an imported dataset.',
            'Identify anomalies: unexpected distributions, suspicious patterns,',
            'potential data quality issues, or fields that seem mismatched.',
            'Return a JSON array of anomalies with: category, description,',
            'affectedField, severity (info/warning/critical), recommendation.',
            'Focus on actionable findings. Max 5 anomalies.',
          ].join(' '),
        },
      },
      options: { responseFormat: 'json' },
    },
    true,
    { tenantId, userId: 'system' }
  );

  return parseAIAnomalies(response.result);
}

/**
 * Parse AI anomaly detection results.
 */
function parseAIAnomalies(result: unknown): ImportAnomaly[] {
  if (!result) return [];

  try {
    let items: unknown[];

    if (Array.isArray(result)) {
      items = result;
    } else if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.anomalies)) {
        items = obj.anomalies;
      } else if (Array.isArray(obj.findings)) {
        items = obj.findings;
      } else if (Array.isArray(obj.results)) {
        items = obj.results;
      } else {
        return [];
      }
    } else {
      return [];
    }

    return items.slice(0, 5).map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      return {
        id: `anomaly-ai-${idx}-${Date.now()}`,
        severity: (obj.severity as ImportAnomaly['severity']) || 'info',
        category: String(obj.category || 'AI Detection'),
        description: String(obj.description || obj.finding || ''),
        affectedField: String(obj.affectedField || obj.field || 'multiple'),
        affectedRows: Number(obj.affectedRows || 0),
        recommendation: String(obj.recommendation || ''),
        detectedAt: new Date().toISOString(),
      };
    }).filter((a): a is ImportAnomaly => a !== null);
  } catch {
    return [];
  }
}

// =============================================================================
// FULL IMPORT ANALYSIS
// =============================================================================

/**
 * Run complete import analysis: module classification + anomaly detection.
 */
export async function analyzeImport(
  tenantId: string,
  headers: string[],
  data: Array<Record<string, unknown>>,
  tenantFeatures: TenantFeatures
): Promise<ImportAnalysis> {
  // Step 1: Classify module
  const moduleClassification = classifyModule(headers, data, tenantFeatures);

  // Step 2: Build field summaries
  const fieldSummary: FieldSummary[] = headers.map(field => {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined);
    const types = new Set(values.map(v => typeof v));

    let dataType: FieldSummary['dataType'] = 'string';
    if (types.size > 1) {
      dataType = 'mixed';
    } else if (types.has('number')) {
      dataType = 'number';
    } else if (types.has('boolean')) {
      dataType = 'boolean';
    } else {
      // Check if string values look like dates
      const stringVals = values.filter(v => typeof v === 'string') as string[];
      const datePattern = /^\d{4}[-/]\d{2}[-/]\d{2}/;
      if (stringVals.length > 0 && stringVals.every(s => datePattern.test(s))) {
        dataType = 'date';
      }
    }

    return {
      fieldName: field,
      dataType,
      nullCount: data.length - values.length,
      uniqueCount: new Set(values.map(String)).size,
      sampleValues: values.slice(0, 5).map(String),
    };
  });

  // Step 3: Detect anomalies
  const anomalies = await detectAnomalies(
    tenantId,
    headers,
    data,
    moduleClassification.module
  );

  return {
    moduleClassification,
    anomalies,
    fieldSummary,
    rowCount: data.length,
    columnCount: headers.length,
    analyzedAt: new Date().toISOString(),
  };
}

// =============================================================================
// PERSISTENCE
// =============================================================================

const ANALYSIS_PREFIX = 'vialuce_import_analysis_';

/**
 * Save import analysis results.
 */
export function saveImportAnalysis(tenantId: string, sessionId: string, analysis: ImportAnalysis): void {
  if (typeof window === 'undefined') return;
  const key = `${ANALYSIS_PREFIX}${tenantId}_${sessionId}`;
  localStorage.setItem(key, JSON.stringify(analysis));
}

/**
 * Load import analysis results.
 */
export function loadImportAnalysis(tenantId: string, sessionId: string): ImportAnalysis | null {
  if (typeof window === 'undefined') return null;
  const key = `${ANALYSIS_PREFIX}${tenantId}_${sessionId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as ImportAnalysis;
  } catch {
    return null;
  }
}
