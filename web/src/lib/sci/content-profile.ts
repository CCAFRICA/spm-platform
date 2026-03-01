// Synaptic Content Ingestion — Content Profile Generator
// Decision 77 — OB-127
// Purely structural observation — no interpretation, no AI.
// Zero domain vocabulary. Korean Test applies.

import type { ContentProfile, FieldProfile } from './sci-types';

// ============================================================
// NAME SIGNAL PATTERNS (multilingual, case-insensitive)
// ============================================================

const ID_SIGNALS = ['id', 'no', 'number', 'code', 'código', 'codigo', '번호', 'num', 'identifier'];
const NAME_SIGNALS = ['name', 'nombre', '이름', 'display', 'label'];
const TARGET_SIGNALS = ['target', 'goal', 'quota', 'meta', 'objetivo', '목표', 'benchmark'];
const DATE_SIGNALS = ['date', 'period', 'month', 'year', 'fecha', '날짜', 'time', 'day'];
const AMOUNT_SIGNALS = ['amount', 'total', 'balance', 'monto', 'sum', '금액', 'value', 'price'];
const RATE_SIGNALS = ['rate', '%', 'percentage', 'tasa', '비율', 'percent', 'ratio'];

function headerContains(header: string, signals: string[]): boolean {
  const lower = header.toLowerCase();
  return signals.some(s => lower.includes(s));
}

// ============================================================
// FIELD TYPE DETECTION
// ============================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const EU_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

// Additional date patterns: "Jan 2024", "January 2024", "2024-Q1", "Mar-24"
const MONTH_YEAR_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-/]?\d{2,4}$/i;
const YEAR_MONTH_RE = /^\d{4}[\s\-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*$/i;
const YEAR_QUARTER_RE = /^\d{4}[\s\-]?Q[1-4]$/i;

function isDateValue(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Date) return true;
  const s = String(v).trim();
  if (!s) return false;
  // Explicit date patterns only — Date.parse is too lenient
  if (ISO_DATE_RE.test(s) || US_DATE_RE.test(s) || EU_DATE_RE.test(s)) return true;
  if (MONTH_YEAR_RE.test(s) || YEAR_MONTH_RE.test(s) || YEAR_QUARTER_RE.test(s)) return true;
  return false;
}

function isBooleanValue(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).toLowerCase().trim();
  return ['true', 'false', 'yes', 'no', 'si', 'sí', '0', '1'].includes(s);
}

function isPercentageString(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  // "60%", "< 60%", "> 100%", "60.5%"
  return /^[<>≤≥]?\s*\d+(\.\d+)?\s*%$/.test(s);
}

function detectFieldType(
  values: unknown[],
  headerName: string
): FieldProfile['dataType'] {
  const nonNull = values.filter(v => v != null && String(v).trim() !== '');
  if (nonNull.length === 0) return 'text';

  let integers = 0, decimals = 0, dates = 0, booleans = 0, texts = 0, percentStrings = 0;

  for (const v of nonNull) {
    if (isBooleanValue(v)) { booleans++; continue; }
    if (isPercentageString(v)) { percentStrings++; continue; }
    if (isDateValue(v)) { dates++; continue; }
    const n = Number(v);
    if (!isNaN(n) && String(v).trim() !== '') {
      if (Number.isInteger(n)) integers++;
      else decimals++;
      continue;
    }
    texts++;
  }

  const total = nonNull.length;
  const numericCount = integers + decimals;

  // Majority rules with 80% threshold
  if (booleans / total > 0.8) return 'boolean';
  if (dates / total > 0.8) return 'date';
  if (percentStrings / total > 0.5) return 'percentage';
  if (texts / total > 0.8) return 'text';

  if (numericCount / total > 0.8) {
    // Distinguish currency, percentage, integer, decimal
    if (headerContains(headerName, RATE_SIGNALS)) return 'percentage';

    const numVals = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
    const allPercentRange = numVals.every(n => n >= 0 && n <= 1);
    if (allPercentRange && numVals.length > 1) return 'percentage';

    if (decimals > 0) {
      // Check for 2 decimal places → currency heuristic
      const twoDecimal = nonNull.filter(v => {
        const s = String(v);
        const dot = s.indexOf('.');
        return dot >= 0 && s.length - dot - 1 === 2;
      }).length;
      const magnitude = Math.max(...numVals.map(Math.abs));
      if ((twoDecimal / numericCount > 0.5 && magnitude > 100) || headerContains(headerName, AMOUNT_SIGNALS)) {
        return 'currency';
      }
      return 'decimal';
    }

    return 'integer';
  }

  return 'mixed';
}

// ============================================================
// CONTENT PROFILE GENERATOR
// ============================================================

export function generateContentProfile(
  tabName: string,
  tabIndex: number,
  sourceFile: string,
  columns: string[],
  rows: Record<string, unknown>[]
): ContentProfile {
  const contentUnitId = `${sourceFile}::${tabName}::${tabIndex}`;
  const rowCount = rows.length;
  const columnCount = columns.length;

  // Sparsity: percentage of null/empty cells
  let nullCells = 0;
  const totalCells = rowCount * columnCount;
  for (const row of rows) {
    for (const col of columns) {
      const v = row[col];
      if (v == null || String(v).trim() === '') nullCells++;
    }
  }
  const sparsity = totalCells > 0 ? nullCells / totalCells : 0;

  // Header quality
  const hasAutoGenerated = columns.some(c => c.includes('__EMPTY'));
  const allNumericHeaders = columns.length > 0 && columns.every(c => !isNaN(Number(c)));
  const headerQuality: ContentProfile['structure']['headerQuality'] =
    hasAutoGenerated ? 'auto_generated' :
    allNumericHeaders ? 'missing' :
    'clean';

  // Build field profiles
  const fields: FieldProfile[] = columns.map((col, fieldIndex) => {
    const values = rows.map(r => r[col]);
    const nonNull = values.filter(v => v != null && String(v).trim() !== '');
    const dataType = detectFieldType(values, col);
    const nullRate = rows.length > 0 ? (rows.length - nonNull.length) / rows.length : 0;
    const distinctValues = new Set(nonNull.map(v => String(v)));
    const distinctCount = distinctValues.size;

    // Distribution for numeric fields
    const distribution: FieldProfile['distribution'] = {};
    if (['integer', 'decimal', 'currency', 'percentage'].includes(dataType)) {
      const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
      if (nums.length > 0) {
        distribution.min = Math.min(...nums);
        distribution.max = Math.max(...nums);
        distribution.mean = nums.reduce((s, n) => s + n, 0) / nums.length;
        // Sequential check: sorted unique integers with no gaps
        if (dataType === 'integer') {
          const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
          distribution.isSequential = sorted.length > 1 &&
            sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
        }
      }
    }

    // Categorical values for low-cardinality text
    if (dataType === 'text' && distinctCount <= 20 && distinctCount > 0) {
      distribution.categoricalValues = Array.from(distinctValues).slice(0, 20);
    }

    return {
      fieldName: col,
      fieldIndex,
      dataType,
      nullRate,
      distinctCount,
      distribution,
      nameSignals: {
        containsId: headerContains(col, ID_SIGNALS),
        containsName: headerContains(col, NAME_SIGNALS),
        containsTarget: headerContains(col, TARGET_SIGNALS),
        containsDate: headerContains(col, DATE_SIGNALS),
        containsAmount: headerContains(col, AMOUNT_SIGNALS),
        containsRate: headerContains(col, RATE_SIGNALS),
      },
    };
  });

  // Pattern detection
  const hasEntityIdentifier = fields.some(f =>
    f.nameSignals.containsId || (f.dataType === 'integer' && f.distribution.isSequential)
  );
  const hasDateColumn = fields.some(f => f.dataType === 'date' || f.nameSignals.containsDate);
  const hasCurrencyColumns = fields.filter(f => f.dataType === 'currency' || (f.nameSignals.containsAmount && ['decimal', 'integer', 'currency'].includes(f.dataType))).length;
  const hasPercentageValues = fields.some(f => f.dataType === 'percentage' || f.nameSignals.containsRate);
  const hasDescriptiveLabels = fields.some(f =>
    f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 10 &&
    !f.nameSignals.containsName && !f.nameSignals.containsId
  );
  const rowCountCategory: ContentProfile['patterns']['rowCountCategory'] =
    rowCount < 50 ? 'reference' :
    rowCount <= 500 ? 'moderate' :
    'transactional';

  return {
    contentUnitId,
    sourceFile,
    tabName,
    tabIndex,
    structure: { rowCount, columnCount, sparsity, headerQuality },
    fields,
    patterns: {
      hasEntityIdentifier,
      hasDateColumn,
      hasCurrencyColumns,
      hasPercentageValues,
      hasDescriptiveLabels,
      rowCountCategory,
    },
  };
}
