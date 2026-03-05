// Synaptic Content Ingestion — Content Profile Generator
// Decision 77 — OB-127, OB-159 Unified Scoring Overhaul
// Purely structural observation — no interpretation, no AI.
// Zero domain vocabulary. Korean Test applies.

import type { ContentProfile, FieldProfile } from './sci-types';

// ============================================================
// NAME SIGNAL PATTERNS (multilingual, case-insensitive)
// Used for OBSERVATION TEXT and SEMANTIC BINDING only — NOT for scoring.
// ============================================================

const ID_SIGNALS = ['id', 'no', 'number', 'code', 'código', 'codigo', '번호', 'num', 'identifier'];
const NAME_SIGNALS = ['name', 'nombre', '이름', 'display', 'label'];
const TARGET_SIGNALS = ['target', 'goal', 'quota', 'meta', 'objetivo', '목표', 'benchmark'];
const DATE_SIGNALS = ['date', 'period', 'month', 'year', 'fecha', '날짜', 'time', 'day'];
const AMOUNT_SIGNALS = ['amount', 'total', 'balance', 'monto', 'sum', '금액', 'value', 'price'];
const RATE_SIGNALS = ['rate', '%', 'percentage', 'tasa', '비율', 'percent', 'ratio'];

// OB-158: Structural person name detection (from values, not headers)
// Korean Test: identifies person-name-like columns by value structure alone
function detectPersonNameColumn(values: unknown[], distinctCount: number): boolean {
  const nonNull = values.filter(v => v != null && String(v).trim() !== '').map(v => String(v).trim());
  if (nonNull.length < 5) return false;

  // At least 50% of values contain a space (multi-word names)
  const multiWord = nonNull.filter(v => v.includes(' ')).length;
  if (multiWord / nonNull.length < 0.50) return false;

  // At least 3 distinct values (eliminates constants, but allows transaction-style repeats)
  if (distinctCount < 3) return false;

  // Average word count >= 1.8 (person names are typically 2-3 words)
  const totalWords = nonNull.reduce((sum, v) => sum + v.split(/\s+/).length, 0);
  if (totalWords / nonNull.length < 1.8) return false;

  // Not numeric-looking
  const numericLooking = nonNull.filter(v => !isNaN(Number(v.replace(/[\s,]/g, '')))).length;
  if (numericLooking / nonNull.length > 0.20) return false;

  return true;
}

function headerContains(header: string, signals: string[]): boolean {
  const lower = header.toLowerCase();
  return signals.some(s => {
    const idx = lower.indexOf(s);
    if (idx === -1) return false;
    // OB-158: Short signals (≤3 chars) require word boundaries to avoid false positives
    if (s.length <= 3) {
      const before = idx === 0 || /[^a-z0-9]/.test(lower[idx - 1]);
      const after = idx + s.length >= lower.length || /[^a-z0-9]/.test(lower[idx + s.length]);
      return before && after;
    }
    return true;
  });
}

// ============================================================
// STRUCTURAL IDENTIFIER DETECTION (Korean Test compliant)
// ============================================================
// Detects identifier columns by VALUE PATTERNS, not field names.
// A column is an identifier if it has high uniqueness and short, code-like values.

function detectStructuralIdentifier(field: FieldProfile, rowCount: number): boolean {
  if (field.distinctCount === 0 || rowCount === 0) return false;
  const uniquenessRatio = field.distinctCount / rowCount;
  // High uniqueness (>70% distinct values relative to row count)
  if (uniquenessRatio < 0.70) return false;
  // Must not be a date or boolean
  if (field.dataType === 'date' || field.dataType === 'boolean') return false;
  // Sequential integers or text codes with short values
  if (field.dataType === 'integer' && field.distribution.isSequential) return true;
  // Non-text numeric with high uniqueness
  if (field.dataType === 'integer' && uniquenessRatio > 0.90) return true;
  // Text codes: high uniqueness + not person names
  if (field.dataType === 'text' && uniquenessRatio > 0.70 && !field.nameSignals.looksLikePersonName) return true;
  return false;
}

// ============================================================
// FIELD TYPE DETECTION
// ============================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const EU_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

// Additional date patterns: "Jan 2024", "January 2024", "2024-Q1", "Mar-24"
// OB-158: Added Spanish month prefixes (Ene, Abr) for multilingual date detection
const MONTH_PREFIXES = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr';
const MONTH_YEAR_RE = new RegExp(`^(${MONTH_PREFIXES})\\w*[\\s\\-/]?\\d{2,4}$`, 'i');
const YEAR_MONTH_RE = new RegExp(`^\\d{4}[\\s\\-/](${MONTH_PREFIXES})\\w*$`, 'i');
const YEAR_QUARTER_RE = /^\d{4}[\s\-]?Q[1-4]$/i;

function isDateValue(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Date) return true;
  const s = String(v).trim();
  if (!s) return false;
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

  if (booleans / total > 0.8) return 'boolean';
  if (dates / total > 0.8) return 'date';
  if (percentStrings / total > 0.5) return 'percentage';
  if (texts / total > 0.8) return 'text';

  if (numericCount / total > 0.8) {
    if (headerContains(headerName, RATE_SIGNALS)) return 'percentage';

    const numVals = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
    const allPercentRange = numVals.every(n => n >= 0 && n <= 1);
    if (allPercentRange && numVals.length > 1) return 'percentage';

    if (decimals > 0) {
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
  rows: Record<string, unknown>[],
  // HF-091: totalRowCount from sheet metadata
  totalRowCount?: number,
): ContentProfile {
  const contentUnitId = `${sourceFile}::${tabName}::${tabIndex}`;
  const rowCount = totalRowCount || rows.length;
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

    // OB-158: Structural person name detection
    const isPersonName = dataType === 'text'
      && !headerContains(col, ID_SIGNALS)
      && detectPersonNameColumn(values, distinctCount);

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
        looksLikePersonName: isPersonName,
      },
    };
  });

  // ── Structural Pattern Detection ──

  // Entity identifier: structural detection first, fallback to nameSignals for observation text
  const hasEntityIdentifier = fields.some(f =>
    detectStructuralIdentifier(f, rowCount) || f.nameSignals.containsId ||
    (f.dataType === 'integer' && f.distribution.isSequential)
  );

  // HF-091: Detect period marker columns (year + month integers) as temporal data
  const hasYearColumn = fields.some(f =>
    f.dataType === 'integer' && f.distribution.min != null &&
    f.distribution.min >= 2000 && f.distribution.max != null && f.distribution.max <= 2040
  );
  const hasMonthColumn = fields.some(f =>
    f.dataType === 'integer' && f.distribution.min != null &&
    f.distribution.min >= 1 && f.distribution.max != null && f.distribution.max <= 12 &&
    f.distinctCount <= 12
  );
  const hasPeriodMarkers = hasYearColumn && hasMonthColumn;

  const hasDateColumn = fields.some(f => f.dataType === 'date' || f.nameSignals.containsDate) || hasPeriodMarkers;
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

  // OB-159: Structural ratios (moved to structure)
  // Identifier field: prefer structural detection, fallback to nameSignals
  const idField = fields.find(f => detectStructuralIdentifier(f, rowCount)) ||
    fields.find(f => f.nameSignals.containsId);

  const identifierRepeatRatio = idField && idField.distinctCount > 0
    ? rowCount / idField.distinctCount
    : 0;

  // Numeric field ratio: fraction of non-ID fields with numeric types
  const nonIdFields = fields.filter(f => f !== idField);
  const numericTypes = ['integer', 'decimal', 'currency', 'percentage'] as const;
  const numericFieldCount = nonIdFields.filter(f =>
    (numericTypes as readonly string[]).includes(f.dataType)
  ).length;
  const numericFieldRatio = nonIdFields.length > 0
    ? numericFieldCount / nonIdFields.length
    : 0;

  // Categorical field ratio: fraction of columns that are low-cardinality text
  const categoricalFields = fields.filter(f =>
    f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 20
  );
  const categoricalFieldCount = categoricalFields.length;
  const categoricalFieldRatio = columnCount > 0
    ? categoricalFieldCount / columnCount
    : 0;

  // OB-158: Structural name column
  const hasStructuralNameColumn = fields.some(f => f.nameSignals.looksLikePersonName);

  // OB-159: Volume pattern based on rows-per-entity
  const volumePattern: ContentProfile['patterns']['volumePattern'] =
    identifierRepeatRatio === 0 ? 'unknown' :
    identifierRepeatRatio <= 1.3 ? 'single' :
    identifierRepeatRatio <= 3.0 ? 'few' :
    'many';

  return {
    contentUnitId,
    sourceFile,
    tabName,
    tabIndex,
    structure: {
      rowCount,
      columnCount,
      sparsity,
      headerQuality,
      numericFieldRatio,
      categoricalFieldRatio,
      categoricalFieldCount,
      identifierRepeatRatio,
    },
    fields,
    patterns: {
      hasEntityIdentifier,
      hasDateColumn,
      hasPeriodMarkers,
      hasCurrencyColumns,
      hasPercentageValues,
      hasDescriptiveLabels,
      hasStructuralNameColumn,
      rowCountCategory,
      volumePattern,
    },
  };
}
