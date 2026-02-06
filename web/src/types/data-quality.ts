/**
 * Data Quality Types - Entity B SPM Platform
 *
 * Types for the data quality management system including
 * quarantine, quality scoring, and anomaly detection.
 */

export type DataSource = 'POS' | 'Inventory' | 'HR' | 'Manual' | 'Import';
export type RecordType = 'transaction' | 'employee' | 'product' | 'store' | 'goal';
export type ErrorType =
  | 'missing_field'
  | 'invalid_format'
  | 'duplicate'
  | 'anomaly'
  | 'business_rule'
  | 'referential';
export type Severity = 'critical' | 'warning' | 'info';
export type QuarantineStatus = 'pending' | 'approved' | 'corrected' | 'rejected' | 'auto_resolved';

export interface SuggestedFix {
  description: string;
  descriptionEs: string;
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  confidence: 'high' | 'medium' | 'low';
}

export interface QuarantineItem {
  id: string;
  tenantId: string;
  source: DataSource;
  recordType: RecordType;
  recordId: string;
  recordData: Record<string, unknown>;
  errorType: ErrorType;
  errorField?: string;
  errorMessage: string;
  errorMessageEs: string;
  errorDetails: string;
  errorDetailsEs: string;
  severity: Severity;
  suggestedFix: SuggestedFix | null;
  status: QuarantineStatus;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionAction: 'approve' | 'correct' | 'reject' | null;
  resolutionNotes: string | null;
  correctedData?: Record<string, unknown>;
}

export interface QualityDimension {
  name: string;
  nameEs: string;
  score: number;
  description: string;
  descriptionEs: string;
}

export interface QualityIssue {
  issue: string;
  issueEs: string;
  impact: number;
  count: number;
  severity: Severity;
}

export interface QualityTrendPoint {
  date: string;
  score: number;
}

export interface QualityScore {
  overall: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  dimensions: {
    completeness: QualityDimension;
    accuracy: QualityDimension;
    timeliness: QualityDimension;
    consistency: QualityDimension;
    validity: QualityDimension;
  };
  trend: QualityTrendPoint[];
  impactingIssues: QualityIssue[];
  lastUpdated: string;
}

export interface DataSourceHealth {
  source: DataSource;
  sourceName: string;
  sourceNameEs: string;
  status: 'healthy' | 'warning' | 'error';
  lastSync: string;
  nextSync: string;
  recordCount: number;
  errorCount: number;
  errorRate: number;
}

export interface QuarantineStats {
  total: number;
  pending: number;
  resolved: number;
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  bySource: Record<DataSource, number>;
  byErrorType: Record<ErrorType, number>;
}

// Resolution action
export interface QuarantineResolution {
  action: 'approve' | 'correct' | 'reject';
  notes?: string;
  correctedData?: Record<string, unknown>;
}

// Severity colors
export const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; border: string }> = {
  critical: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
  },
  warning: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-300 dark:border-amber-700',
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-300 dark:border-blue-700',
  },
};

// Status colors
export const STATUS_COLORS: Record<QuarantineStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  corrected: { bg: 'bg-blue-100', text: 'text-blue-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  auto_resolved: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

// Error type labels
export const ERROR_TYPE_LABELS: Record<ErrorType, { name: string; nameEs: string }> = {
  missing_field: { name: 'Missing Field', nameEs: 'Campo Faltante' },
  invalid_format: { name: 'Invalid Format', nameEs: 'Formato Inválido' },
  duplicate: { name: 'Duplicate Record', nameEs: 'Registro Duplicado' },
  anomaly: { name: 'Anomaly Detected', nameEs: 'Anomalía Detectada' },
  business_rule: { name: 'Business Rule Violation', nameEs: 'Violación de Regla' },
  referential: { name: 'Referential Integrity', nameEs: 'Integridad Referencial' },
};

// Source labels
export const SOURCE_LABELS: Record<DataSource, { name: string; nameEs: string }> = {
  POS: { name: 'Point of Sale', nameEs: 'Punto de Venta' },
  Inventory: { name: 'Inventory', nameEs: 'Inventario' },
  HR: { name: 'Human Resources', nameEs: 'Recursos Humanos' },
  Manual: { name: 'Manual Entry', nameEs: 'Entrada Manual' },
  Import: { name: 'Data Import', nameEs: 'Importación' },
};
