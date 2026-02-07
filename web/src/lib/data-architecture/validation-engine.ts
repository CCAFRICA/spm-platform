/**
 * Validation Engine
 *
 * Three-layer validation:
 * 1. Type checking - Required fields, data types, format validation
 * 2. Business rules - Cross-field logic, referential integrity, range checks
 * 3. Anomaly detection - Statistical outliers, volume comparison, pattern deviation
 */

import type { RawRecord, ValidationResult, ValidationLayer, ValidationSeverity } from './types';

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Run all validation layers on transformed content
 */
export function runValidation(
  content: Record<string, unknown>,
  rawRecord?: RawRecord
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Layer 1: Type checking
  results.push(...runTypeValidation(content));

  // Layer 2: Business rules
  results.push(...runBusinessRuleValidation(content));

  // Layer 3: Anomaly detection
  results.push(...runAnomalyDetection(content, rawRecord));

  return results;
}

// ============================================
// TYPE CHECKING (Layer 1)
// ============================================

interface FieldSchema {
  field: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'email' | 'currency';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

const DEFAULT_SCHEMA: FieldSchema[] = [
  { field: 'repId', type: 'string', required: true },
  { field: 'amount', type: 'currency', required: true },
  { field: 'date', type: 'date', required: true },
  { field: 'orderId', type: 'string' },
  { field: 'email', type: 'email' },
  { field: 'quantity', type: 'number' },
  { field: 'status', type: 'string' },
];

function runTypeValidation(content: Record<string, unknown>): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const schema of DEFAULT_SCHEMA) {
    const value = content[schema.field];

    // Required check
    if (schema.required && (value === undefined || value === null || value === '')) {
      results.push({
        field: schema.field,
        layer: 'type_check',
        status: 'fail',
        message: `Required field '${schema.field}' is missing`,
        severity: 'high',
        rule: 'required_field',
      });
      continue;
    }

    // Skip if not present and not required
    if (value === undefined || value === null) continue;

    // Type-specific validation
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          results.push({
            field: schema.field,
            layer: 'type_check',
            status: 'fail',
            message: `Field '${schema.field}' must be a string`,
            severity: 'medium',
            rule: 'type_string',
          });
        } else {
          if (schema.minLength && value.length < schema.minLength) {
            results.push({
              field: schema.field,
              layer: 'type_check',
              status: 'warning',
              message: `Field '${schema.field}' is shorter than minimum length ${schema.minLength}`,
              severity: 'low',
              rule: 'min_length',
            });
          }
          if (schema.maxLength && value.length > schema.maxLength) {
            results.push({
              field: schema.field,
              layer: 'type_check',
              status: 'warning',
              message: `Field '${schema.field}' exceeds maximum length ${schema.maxLength}`,
              severity: 'low',
              rule: 'max_length',
            });
          }
        }
        break;

      case 'number':
      case 'currency':
        if (typeof value !== 'number' || isNaN(value)) {
          results.push({
            field: schema.field,
            layer: 'type_check',
            status: 'fail',
            message: `Field '${schema.field}' must be a valid number`,
            severity: 'medium',
            rule: 'type_number',
          });
        }
        break;

      case 'date':
        if (!isValidDate(value)) {
          results.push({
            field: schema.field,
            layer: 'type_check',
            status: 'fail',
            message: `Field '${schema.field}' must be a valid date`,
            severity: 'medium',
            rule: 'type_date',
          });
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          results.push({
            field: schema.field,
            layer: 'type_check',
            status: 'fail',
            message: `Field '${schema.field}' must be a boolean`,
            severity: 'low',
            rule: 'type_boolean',
          });
        }
        break;

      case 'email':
        if (!isValidEmail(String(value))) {
          results.push({
            field: schema.field,
            layer: 'type_check',
            status: 'warning',
            message: `Field '${schema.field}' does not appear to be a valid email`,
            severity: 'low',
            rule: 'format_email',
          });
        }
        break;
    }
  }

  return results;
}

function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'string') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  return false;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ============================================
// BUSINESS RULES (Layer 2)
// ============================================

interface BusinessRule {
  id: string;
  name: string;
  validate: (content: Record<string, unknown>) => ValidationResult | null;
}

const BUSINESS_RULES: BusinessRule[] = [
  {
    id: 'positive_amount',
    name: 'Amount Must Be Positive',
    validate: (content) => {
      const amount = content.amount;
      if (typeof amount === 'number' && amount < 0) {
        return {
          field: 'amount',
          layer: 'business_rule',
          status: 'warning',
          message: 'Amount is negative - verify this is intentional (refund/adjustment)',
          severity: 'medium',
          rule: 'positive_amount',
        };
      }
      return null;
    },
  },
  {
    id: 'reasonable_amount',
    name: 'Amount Within Reasonable Range',
    validate: (content) => {
      const amount = content.amount;
      if (typeof amount === 'number') {
        if (amount > 1000000) {
          return {
            field: 'amount',
            layer: 'business_rule',
            status: 'warning',
            message: `Amount ($${amount.toLocaleString()}) exceeds $1M threshold - requires review`,
            severity: 'high',
            rule: 'reasonable_amount',
          };
        }
        if (amount > 0 && amount < 1) {
          return {
            field: 'amount',
            layer: 'business_rule',
            status: 'warning',
            message: 'Amount is less than $1 - verify this is correct',
            severity: 'low',
            rule: 'reasonable_amount',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'date_not_future',
    name: 'Date Cannot Be In Future',
    validate: (content) => {
      const date = content.date;
      if (date) {
        const dateValue = new Date(String(date));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (dateValue > tomorrow) {
          return {
            field: 'date',
            layer: 'business_rule',
            status: 'fail',
            message: 'Transaction date cannot be in the future',
            severity: 'high',
            rule: 'date_not_future',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'date_not_ancient',
    name: 'Date Not Too Old',
    validate: (content) => {
      const date = content.date;
      if (date) {
        const dateValue = new Date(String(date));
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        if (dateValue < twoYearsAgo) {
          return {
            field: 'date',
            layer: 'business_rule',
            status: 'warning',
            message: 'Transaction date is more than 2 years old - verify this is correct',
            severity: 'medium',
            rule: 'date_not_ancient',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'quantity_positive',
    name: 'Quantity Must Be Positive',
    validate: (content) => {
      const quantity = content.quantity;
      if (typeof quantity === 'number' && quantity <= 0) {
        return {
          field: 'quantity',
          layer: 'business_rule',
          status: 'warning',
          message: 'Quantity is zero or negative - verify this is intentional',
          severity: 'low',
          rule: 'quantity_positive',
        };
      }
      return null;
    },
  },
  {
    id: 'commission_rate_range',
    name: 'Commission Rate In Valid Range',
    validate: (content) => {
      const rate = content.commissionRate || content.rate;
      if (typeof rate === 'number') {
        if (rate < 0 || rate > 100) {
          return {
            field: 'commissionRate',
            layer: 'business_rule',
            status: 'fail',
            message: 'Commission rate must be between 0% and 100%',
            severity: 'high',
            rule: 'commission_rate_range',
          };
        }
        if (rate > 50) {
          return {
            field: 'commissionRate',
            layer: 'business_rule',
            status: 'warning',
            message: `Commission rate (${rate}%) is unusually high - verify this is correct`,
            severity: 'medium',
            rule: 'commission_rate_range',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'rep_exists',
    name: 'Rep ID Exists',
    validate: (content) => {
      const repId = content.repId;
      // In a real implementation, this would check against the personnel database
      // For demo, we just check format
      if (repId && typeof repId === 'string' && repId.length < 2) {
        return {
          field: 'repId',
          layer: 'business_rule',
          status: 'warning',
          message: 'Rep ID format appears invalid - verify against personnel records',
          severity: 'medium',
          rule: 'rep_exists',
        };
      }
      return null;
    },
  },
];

function runBusinessRuleValidation(content: Record<string, unknown>): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const rule of BUSINESS_RULES) {
    const result = rule.validate(content);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

// ============================================
// ANOMALY DETECTION (Layer 3)
// ============================================

// Historical statistics (would be loaded from actual data in production)
const HISTORICAL_STATS = {
  amount: {
    mean: 2500,
    stdDev: 3000,
    min: 10,
    max: 100000,
    median: 1200,
  },
  quantity: {
    mean: 5,
    stdDev: 10,
    min: 1,
    max: 1000,
    median: 3,
  },
};

function runAnomalyDetection(
  content: Record<string, unknown>,
  rawRecord?: RawRecord
): ValidationResult[] {
  void rawRecord; // Reserved for future historical comparison
  const results: ValidationResult[] = [];

  // Amount outlier detection
  if (typeof content.amount === 'number') {
    const amount = content.amount;
    const stats = HISTORICAL_STATS.amount;

    // Z-score check
    const zScore = Math.abs((amount - stats.mean) / stats.stdDev);
    if (zScore > 3) {
      results.push({
        field: 'amount',
        layer: 'anomaly_detection',
        status: 'warning',
        message: `Amount ($${amount.toLocaleString()}) is a statistical outlier (${zScore.toFixed(1)} standard deviations from mean)`,
        severity: zScore > 4 ? 'high' : 'medium',
        rule: 'statistical_outlier',
      });
    }

    // Percentile check
    if (amount > stats.max * 0.9) {
      results.push({
        field: 'amount',
        layer: 'anomaly_detection',
        status: 'warning',
        message: `Amount is in the top 10% of historical values`,
        severity: 'info',
        rule: 'high_percentile',
      });
    }
  }

  // Quantity outlier detection
  if (typeof content.quantity === 'number') {
    const quantity = content.quantity;
    const stats = HISTORICAL_STATS.quantity;

    const zScore = Math.abs((quantity - stats.mean) / stats.stdDev);
    if (zScore > 3) {
      results.push({
        field: 'quantity',
        layer: 'anomaly_detection',
        status: 'warning',
        message: `Quantity (${quantity}) is unusually ${quantity > stats.mean ? 'high' : 'low'}`,
        severity: 'low',
        rule: 'statistical_outlier',
      });
    }
  }

  // Pattern detection: round numbers
  if (typeof content.amount === 'number') {
    const amount = content.amount;
    if (amount >= 1000 && amount % 1000 === 0) {
      results.push({
        field: 'amount',
        layer: 'anomaly_detection',
        status: 'pass',
        message: 'Amount is a round number - this is common for contracts/packages',
        severity: 'info',
        rule: 'pattern_round_number',
      });
    }
  }

  // Weekend transaction detection
  if (content.date) {
    const date = new Date(String(content.date));
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      results.push({
        field: 'date',
        layer: 'anomaly_detection',
        status: 'warning',
        message: 'Transaction occurred on a weekend - verify if this is expected',
        severity: 'info',
        rule: 'weekend_transaction',
      });
    }
  }

  return results;
}

// ============================================
// VALIDATION SUMMARY
// ============================================

export interface ValidationSummary {
  totalChecks: number;
  passed: number;
  warnings: number;
  failed: number;
  byLayer: Record<ValidationLayer, { passed: number; warnings: number; failed: number }>;
  bySeverity: Record<ValidationSeverity, number>;
  criticalIssues: ValidationResult[];
}

export function summarizeValidation(results: ValidationResult[]): ValidationSummary {
  const summary: ValidationSummary = {
    totalChecks: results.length,
    passed: 0,
    warnings: 0,
    failed: 0,
    byLayer: {
      type_check: { passed: 0, warnings: 0, failed: 0 },
      business_rule: { passed: 0, warnings: 0, failed: 0 },
      anomaly_detection: { passed: 0, warnings: 0, failed: 0 },
    },
    bySeverity: {
      info: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    criticalIssues: [],
  };

  for (const result of results) {
    // Overall counts
    if (result.status === 'pass') {
      summary.passed++;
      summary.byLayer[result.layer].passed++;
    } else if (result.status === 'warning') {
      summary.warnings++;
      summary.byLayer[result.layer].warnings++;
    } else {
      summary.failed++;
      summary.byLayer[result.layer].failed++;
    }

    // Severity counts
    summary.bySeverity[result.severity]++;

    // Critical issues
    if (result.severity === 'critical' || result.severity === 'high') {
      summary.criticalIssues.push(result);
    }
  }

  return summary;
}

// ============================================
// CUSTOM VALIDATION RULES
// ============================================

export interface CustomValidationRule {
  id: string;
  tenantId: string;
  name: string;
  field: string;
  layer: ValidationLayer;
  condition: {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'regex';
    value: unknown;
  };
  severity: ValidationSeverity;
  message: string;
  active: boolean;
}

const customRules: CustomValidationRule[] = [];

export function addCustomRule(rule: CustomValidationRule): void {
  customRules.push(rule);
}

export function removeCustomRule(ruleId: string): void {
  const index = customRules.findIndex((r) => r.id === ruleId);
  if (index >= 0) {
    customRules.splice(index, 1);
  }
}

export function getCustomRules(tenantId: string): CustomValidationRule[] {
  return customRules.filter((r) => r.tenantId === tenantId);
}

export function runCustomValidation(
  content: Record<string, unknown>,
  tenantId: string
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const tenantRules = getCustomRules(tenantId).filter((r) => r.active);

  for (const rule of tenantRules) {
    const value = content[rule.field];
    let passed = false;

    switch (rule.condition.operator) {
      case 'eq':
        passed = value === rule.condition.value;
        break;
      case 'ne':
        passed = value !== rule.condition.value;
        break;
      case 'gt':
        passed = typeof value === 'number' && value > (rule.condition.value as number);
        break;
      case 'gte':
        passed = typeof value === 'number' && value >= (rule.condition.value as number);
        break;
      case 'lt':
        passed = typeof value === 'number' && value < (rule.condition.value as number);
        break;
      case 'lte':
        passed = typeof value === 'number' && value <= (rule.condition.value as number);
        break;
      case 'in':
        passed = Array.isArray(rule.condition.value) && rule.condition.value.includes(value);
        break;
      case 'regex':
        passed = new RegExp(String(rule.condition.value)).test(String(value));
        break;
    }

    if (!passed) {
      results.push({
        field: rule.field,
        layer: rule.layer,
        status: rule.severity === 'critical' || rule.severity === 'high' ? 'fail' : 'warning',
        message: rule.message,
        severity: rule.severity,
        rule: rule.id,
      });
    }
  }

  return results;
}
