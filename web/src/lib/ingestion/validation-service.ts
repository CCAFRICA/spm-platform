/**
 * Validation Service — DS-005 structural validation (8 checks).
 *
 * Runs after file parsing but before committing data.
 * Critical findings trigger quarantine; warnings are advisory.
 *
 * 8 Structural Checks:
 * 1. Header presence — file must have identifiable column headers
 * 2. Minimum row count — at least 1 data row after headers
 * 3. Consistent column count — all rows must have same number of columns
 * 4. Required field coverage — key fields must not be entirely empty
 * 5. Duplicate detection — flag duplicate rows based on key columns
 * 6. Date format consistency — dates should be parseable
 * 7. Numeric field validity — numeric columns should contain numbers
 * 8. Encoding check — detect non-UTF8 or corrupted characters
 */

// ── Types ──

export type CheckSeverity = 'critical' | 'warning' | 'info';
export type CheckResult = 'pass' | 'fail' | 'warn';

export interface ValidationCheck {
  id: string;
  name: string;
  description: string;
  severity: CheckSeverity;
  result: CheckResult;
  message: string;
  details?: string[];
}

export interface ValidationReport {
  checks: ValidationCheck[];
  overallResult: 'pass' | 'quarantine' | 'warn';
  criticalFailures: number;
  warnings: number;
  timestamp: string;
}

// ── Validation Engine ──

/**
 * Run all 8 structural validation checks on parsed tabular data.
 *
 * @param headers - Column header names
 * @param rows - 2D array of string values
 * @param keyColumns - Indices of columns used for dedup (optional)
 */
export function runStructuralValidation(
  headers: string[],
  rows: string[][],
  keyColumns?: number[]
): ValidationReport {
  const checks: ValidationCheck[] = [
    checkHeaderPresence(headers),
    checkMinimumRowCount(rows),
    checkConsistentColumnCount(headers, rows),
    checkRequiredFieldCoverage(headers, rows),
    checkDuplicateRows(rows, keyColumns),
    checkDateFormatConsistency(headers, rows),
    checkNumericFieldValidity(headers, rows),
    checkEncodingIntegrity(headers, rows),
  ];

  const criticalFailures = checks.filter(c => c.severity === 'critical' && c.result === 'fail').length;
  const warnings = checks.filter(c => c.result === 'warn' || (c.severity === 'warning' && c.result === 'fail')).length;

  let overallResult: ValidationReport['overallResult'];
  if (criticalFailures > 0) overallResult = 'quarantine';
  else if (warnings > 0) overallResult = 'warn';
  else overallResult = 'pass';

  return {
    checks,
    overallResult,
    criticalFailures,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ── Individual Checks ──

function checkHeaderPresence(headers: string[]): ValidationCheck {
  const nonEmpty = headers.filter(h => h.trim().length > 0);
  if (nonEmpty.length === 0) {
    return {
      id: 'header-presence',
      name: 'Header Presence',
      description: 'File must have identifiable column headers',
      severity: 'critical',
      result: 'fail',
      message: 'No column headers detected',
    };
  }
  return {
    id: 'header-presence',
    name: 'Header Presence',
    description: 'File must have identifiable column headers',
    severity: 'critical',
    result: 'pass',
    message: `${nonEmpty.length} headers detected`,
  };
}

function checkMinimumRowCount(rows: string[][]): ValidationCheck {
  if (rows.length === 0) {
    return {
      id: 'min-row-count',
      name: 'Minimum Row Count',
      description: 'At least 1 data row required after headers',
      severity: 'critical',
      result: 'fail',
      message: 'No data rows found',
    };
  }
  return {
    id: 'min-row-count',
    name: 'Minimum Row Count',
    description: 'At least 1 data row required after headers',
    severity: 'critical',
    result: 'pass',
    message: `${rows.length} data rows found`,
  };
}

function checkConsistentColumnCount(headers: string[], rows: string[][]): ValidationCheck {
  const expectedCols = headers.length;
  const inconsistent = rows.filter(r => r.length !== expectedCols);

  if (inconsistent.length > 0) {
    const pct = ((inconsistent.length / rows.length) * 100).toFixed(1);
    if (inconsistent.length > rows.length * 0.1) {
      return {
        id: 'consistent-columns',
        name: 'Consistent Column Count',
        description: 'All rows should have the same number of columns',
        severity: 'critical',
        result: 'fail',
        message: `${inconsistent.length} rows (${pct}%) have inconsistent column count`,
        details: [`Expected ${expectedCols} columns per row`],
      };
    }
    return {
      id: 'consistent-columns',
      name: 'Consistent Column Count',
      description: 'All rows should have the same number of columns',
      severity: 'warning',
      result: 'warn',
      message: `${inconsistent.length} rows (${pct}%) have inconsistent column count`,
    };
  }

  return {
    id: 'consistent-columns',
    name: 'Consistent Column Count',
    description: 'All rows should have the same number of columns',
    severity: 'warning',
    result: 'pass',
    message: `All ${rows.length} rows have ${expectedCols} columns`,
  };
}

function checkRequiredFieldCoverage(headers: string[], rows: string[][]): ValidationCheck {
  if (rows.length === 0) {
    return {
      id: 'required-coverage',
      name: 'Required Field Coverage',
      description: 'Key fields must not be entirely empty',
      severity: 'warning',
      result: 'pass',
      message: 'No rows to check',
    };
  }

  const emptyColumns: string[] = [];
  for (let col = 0; col < headers.length; col++) {
    const allEmpty = rows.every(r => !r[col] || r[col].trim() === '');
    if (allEmpty) {
      emptyColumns.push(headers[col] || `Column ${col + 1}`);
    }
  }

  if (emptyColumns.length > headers.length * 0.5) {
    return {
      id: 'required-coverage',
      name: 'Required Field Coverage',
      description: 'Key fields must not be entirely empty',
      severity: 'critical',
      result: 'fail',
      message: `${emptyColumns.length}/${headers.length} columns are entirely empty`,
      details: emptyColumns.slice(0, 10),
    };
  }

  if (emptyColumns.length > 0) {
    return {
      id: 'required-coverage',
      name: 'Required Field Coverage',
      description: 'Key fields must not be entirely empty',
      severity: 'warning',
      result: 'warn',
      message: `${emptyColumns.length} column(s) are entirely empty`,
      details: emptyColumns,
    };
  }

  return {
    id: 'required-coverage',
    name: 'Required Field Coverage',
    description: 'Key fields must not be entirely empty',
    severity: 'warning',
    result: 'pass',
    message: 'All columns have data',
  };
}

function checkDuplicateRows(rows: string[][], keyColumns?: number[]): ValidationCheck {
  if (rows.length === 0) {
    return {
      id: 'duplicate-detection',
      name: 'Duplicate Detection',
      description: 'Flag duplicate rows based on key columns',
      severity: 'warning',
      result: 'pass',
      message: 'No rows to check',
    };
  }

  const seen = new Set<string>();
  let dupeCount = 0;

  for (const row of rows) {
    const key = keyColumns
      ? keyColumns.map(i => row[i] || '').join('|')
      : row.join('|');

    if (seen.has(key)) {
      dupeCount++;
    } else {
      seen.add(key);
    }
  }

  if (dupeCount > 0) {
    const pct = ((dupeCount / rows.length) * 100).toFixed(1);
    return {
      id: 'duplicate-detection',
      name: 'Duplicate Detection',
      description: 'Flag duplicate rows based on key columns',
      severity: 'warning',
      result: 'warn',
      message: `${dupeCount} duplicate rows detected (${pct}%)`,
    };
  }

  return {
    id: 'duplicate-detection',
    name: 'Duplicate Detection',
    description: 'Flag duplicate rows based on key columns',
    severity: 'warning',
    result: 'pass',
    message: 'No duplicates detected',
  };
}

function checkDateFormatConsistency(headers: string[], rows: string[][]): ValidationCheck {
  // Heuristic: look for columns with "date", "fecha", "period" in the name
  const dateColIndices: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes('date') || h.includes('fecha') || h.includes('period') || h.includes('time')) {
      dateColIndices.push(i);
    }
  }

  if (dateColIndices.length === 0 || rows.length === 0) {
    return {
      id: 'date-consistency',
      name: 'Date Format Consistency',
      description: 'Date columns should contain parseable dates',
      severity: 'warning',
      result: 'pass',
      message: dateColIndices.length === 0 ? 'No date columns detected' : 'No rows to check',
    };
  }

  let unparseable = 0;
  let total = 0;

  for (const row of rows) {
    for (const colIdx of dateColIndices) {
      const val = row[colIdx]?.trim();
      if (!val) continue;
      total++;
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        // Try numeric (Excel serial date)
        const num = Number(val);
        if (isNaN(num) || num < 365 || num > 100000) {
          unparseable++;
        }
      }
    }
  }

  if (total === 0) {
    return {
      id: 'date-consistency',
      name: 'Date Format Consistency',
      description: 'Date columns should contain parseable dates',
      severity: 'warning',
      result: 'pass',
      message: 'No date values to check',
    };
  }

  if (unparseable > total * 0.2) {
    return {
      id: 'date-consistency',
      name: 'Date Format Consistency',
      description: 'Date columns should contain parseable dates',
      severity: 'warning',
      result: 'warn',
      message: `${unparseable}/${total} date values are not parseable`,
    };
  }

  return {
    id: 'date-consistency',
    name: 'Date Format Consistency',
    description: 'Date columns should contain parseable dates',
    severity: 'warning',
    result: 'pass',
    message: `${total - unparseable}/${total} date values parseable`,
  };
}

function checkNumericFieldValidity(headers: string[], rows: string[][]): ValidationCheck {
  // Heuristic: columns with "amount", "monto", "count", "qty", "price", "total"
  const numColIndices: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes('amount') || h.includes('monto') || h.includes('count') ||
        h.includes('qty') || h.includes('price') || h.includes('total') ||
        h.includes('quantity') || h.includes('revenue') || h.includes('ingreso')) {
      numColIndices.push(i);
    }
  }

  if (numColIndices.length === 0 || rows.length === 0) {
    return {
      id: 'numeric-validity',
      name: 'Numeric Field Validity',
      description: 'Numeric columns should contain numbers',
      severity: 'warning',
      result: 'pass',
      message: numColIndices.length === 0 ? 'No numeric columns detected' : 'No rows to check',
    };
  }

  let nonNumeric = 0;
  let total = 0;

  for (const row of rows) {
    for (const colIdx of numColIndices) {
      const val = row[colIdx]?.trim();
      if (!val) continue;
      total++;
      // Strip currency symbols and commas
      const cleaned = val.replace(/[$,€£¥MX\s]/g, '');
      if (cleaned && isNaN(Number(cleaned))) {
        nonNumeric++;
      }
    }
  }

  if (total === 0) {
    return {
      id: 'numeric-validity',
      name: 'Numeric Field Validity',
      description: 'Numeric columns should contain numbers',
      severity: 'warning',
      result: 'pass',
      message: 'No numeric values to check',
    };
  }

  if (nonNumeric > total * 0.1) {
    return {
      id: 'numeric-validity',
      name: 'Numeric Field Validity',
      description: 'Numeric columns should contain numbers',
      severity: 'warning',
      result: 'warn',
      message: `${nonNumeric}/${total} numeric values are not parseable`,
    };
  }

  return {
    id: 'numeric-validity',
    name: 'Numeric Field Validity',
    description: 'Numeric columns should contain numbers',
    severity: 'warning',
    result: 'pass',
    message: `${total - nonNumeric}/${total} numeric values valid`,
  };
}

function checkEncodingIntegrity(headers: string[], rows: string[][]): ValidationCheck {
  // Check for common encoding issues: replacement character, null bytes
  const replacementChar = '\uFFFD';
  let corrupted = 0;
  let checked = 0;

  const allStrings = [...headers];
  for (const row of rows.slice(0, 100)) { // Check first 100 rows for performance
    allStrings.push(...row);
  }

  for (const s of allStrings) {
    if (!s) continue;
    checked++;
    if (s.includes(replacementChar) || s.includes('\x00')) {
      corrupted++;
    }
  }

  if (corrupted > 0) {
    return {
      id: 'encoding-integrity',
      name: 'Encoding Integrity',
      description: 'Detect non-UTF8 or corrupted characters',
      severity: 'warning',
      result: 'warn',
      message: `${corrupted} values contain corrupted/replacement characters`,
    };
  }

  return {
    id: 'encoding-integrity',
    name: 'Encoding Integrity',
    description: 'Detect non-UTF8 or corrupted characters',
    severity: 'warning',
    result: 'pass',
    message: `${checked} values checked, no encoding issues`,
  };
}

/**
 * Determine if a validation report should trigger quarantine.
 */
export function shouldQuarantine(report: ValidationReport): boolean {
  return report.overallResult === 'quarantine';
}
