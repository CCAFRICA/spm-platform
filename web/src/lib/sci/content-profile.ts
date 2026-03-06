// Synaptic Content Ingestion — Content Profile Generator
// Decision 77 — OB-127, OB-159, OB-160A
// Purely structural observation — no interpretation, no AI.
// Zero domain vocabulary. Korean Test applies.
// Decision 103: Probabilistic type scoring (simultaneous plausibility)
// Decision 104: Temporal detection is type-agnostic (raw values)
// Decision 105: Cardinality relative to identifier column

import type { ContentProfile, FieldProfile, ProfileObservation } from './sci-types';

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

function headerContains(header: string, signals: string[]): boolean {
  const lower = header.toLowerCase();
  return signals.some(s => {
    const idx = lower.indexOf(s);
    if (idx === -1) return false;
    if (s.length <= 3) {
      const before = idx === 0 || /[^a-z0-9]/.test(lower[idx - 1]);
      const after = idx + s.length >= lower.length || /[^a-z0-9]/.test(lower[idx + s.length]);
      return before && after;
    }
    return true;
  });
}

// ============================================================
// PROBABILISTIC TYPE SCORING (Decision 103)
// All types scored simultaneously. No waterfall ordering bias.
// ============================================================

interface TypeClassification {
  dataType: FieldProfile['dataType'];
  confidence: number;
  allScores: Record<string, number>;
}

function classifyColumnType(
  values: unknown[],
  headerName: string,
): TypeClassification {
  const nonNull = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonNull.length === 0) return { dataType: 'text', confidence: 1.0, allScores: { text: 1.0 } };

  const scores: Record<string, number> = {
    boolean: scoreBooleanPlausibility(nonNull),
    integer: scoreIntegerPlausibility(nonNull),
    decimal: scoreDecimalPlausibility(nonNull),
    percentage: scorePercentagePlausibility(nonNull, headerName),
    currency: scoreCurrencyPlausibility(nonNull, headerName),
    date: scoreDatePlausibility(nonNull),
    text: scoreTextPlausibility(nonNull),
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return {
    dataType: sorted[0][0] as FieldProfile['dataType'],
    confidence: sorted[0][1],
    allScores: scores,
  };
}

const BOOLEAN_TRUE = new Set(['1', 'true', 'yes', 'si', 'sí']);
const BOOLEAN_FALSE = new Set(['0', 'false', 'no']);
const BOOLEAN_ALL = new Set(Array.from(BOOLEAN_TRUE).concat(Array.from(BOOLEAN_FALSE)));

function scoreBooleanPlausibility(nonNull: unknown[]): number {
  const strings = nonNull.map(v => String(v).toLowerCase().trim());
  const allBoolean = strings.every(s => BOOLEAN_ALL.has(s));
  if (!allBoolean) return 0;

  const hasTrueLike = strings.some(s => BOOLEAN_TRUE.has(s));
  const hasFalseLike = strings.some(s => BOOLEAN_FALSE.has(s));

  // CRITICAL: Must have BOTH true-like AND false-like values for high confidence
  if (hasTrueLike && hasFalseLike) return 0.95;
  // Only one side present (all 1s, all 0s): low score — probably constant integer
  return 0.20;
}

function scoreIntegerPlausibility(nonNull: unknown[]): number {
  let intCount = 0;
  for (const v of nonNull) {
    const n = Number(v);
    if (!isNaN(n) && String(v).trim() !== '' && Number.isInteger(n)) intCount++;
  }
  const ratio = intCount / nonNull.length;
  if (ratio < 0.80) return 0;

  let score = 0.80;
  // Boost if range > 1 (not just 0-1 binary)
  const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n) && Number.isInteger(n));
  if (nums.length > 0) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (max - min > 1) score += 0.10;
  }
  // Boost if distinctCount > 2 (not binary)
  const distinct = new Set(nums).size;
  if (distinct > 2) score += 0.05;

  return Math.min(1.0, score);
}

function scoreDecimalPlausibility(nonNull: unknown[]): number {
  let numCount = 0;
  let hasDecimal = false;
  for (const v of nonNull) {
    const n = Number(v);
    if (!isNaN(n) && String(v).trim() !== '') {
      numCount++;
      if (!Number.isInteger(n)) hasDecimal = true;
    }
  }
  if (numCount / nonNull.length < 0.80 || !hasDecimal) return 0;
  return 0.85;
}

function scorePercentagePlausibility(nonNull: unknown[], headerName: string): number {
  // Values with % sign
  const percentStrings = nonNull.filter(v => /^[<>≤≥]?\s*\d+(\.\d+)?\s*%$/.test(String(v).trim()));
  if (percentStrings.length / nonNull.length > 0.50) return 0.95;

  // Header contains rate signal
  if (headerContains(headerName, RATE_SIGNALS)) {
    const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
    if (nums.length / nonNull.length > 0.80) return 0.80;
  }

  // Values in [0, 1] range with decimals
  const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
  if (nums.length > 1 && nums.every(n => n >= 0 && n <= 1)) {
    const hasDecimal = nums.some(n => !Number.isInteger(n));
    if (hasDecimal) return 0.70;
  }

  return 0;
}

function scoreCurrencyPlausibility(nonNull: unknown[], headerName: string): number {
  const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n));
  if (nums.length / nonNull.length < 0.80) return 0;
  const hasDecimal = nums.some(n => !Number.isInteger(n));
  if (!hasDecimal) return 0;

  const twoDecimal = nonNull.filter(v => {
    const s = String(v);
    const dot = s.indexOf('.');
    return dot >= 0 && s.length - dot - 1 === 2;
  }).length;
  const magnitude = Math.max(...nums.map(Math.abs));

  if (headerContains(headerName, AMOUNT_SIGNALS)) return 0.85;
  if (twoDecimal / nums.length > 0.5 && magnitude > 100) return 0.80;
  return 0;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const EU_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
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

function scoreDatePlausibility(nonNull: unknown[]): number {
  let dateCount = 0;
  for (const v of nonNull) {
    if (v instanceof Date || isDateValue(v)) dateCount++;
  }
  const ratio = dateCount / nonNull.length;
  if (ratio > 0.80) return 0.95;
  if (ratio > 0.50) return 0.60;
  return 0;
}

function scoreTextPlausibility(nonNull: unknown[]): number {
  let textCount = 0;
  for (const v of nonNull) {
    const s = String(v).trim();
    if (s === '') continue;
    if (isNaN(Number(s))) textCount++;
  }
  if (textCount / nonNull.length > 0.50) return 0.70;
  return 0.10; // baseline fallback
}

// ============================================================
// STRUCTURAL IDENTIFIER DETECTION (Korean Test compliant)
// ============================================================

function detectStructuralIdentifier(field: FieldProfile, rowCount: number): boolean {
  if (field.distinctCount === 0 || rowCount === 0) return false;
  const uniquenessRatio = field.distinctCount / rowCount;
  if (uniquenessRatio < 0.70) return false;
  if (field.dataType === 'date' || field.dataType === 'boolean') return false;
  if (field.dataType === 'integer' && field.distribution.isSequential) return true;
  if (field.dataType === 'integer' && uniquenessRatio > 0.90) return true;
  if (field.dataType === 'text' && uniquenessRatio > 0.70 && !field.nameSignals.looksLikePersonName) return true;
  return false;
}

// ============================================================
// TEMPORAL COLUMN DETECTION (Decision 104)
// Type-agnostic: checks RAW NUMERIC VALUES regardless of dataType
// ============================================================

function detectTemporalColumns(
  fields: FieldProfile[],
  sampleRows: Record<string, unknown>[],
): { hasTemporalColumns: boolean; temporalColumnIndices: number[] } {
  const temporalIndices: number[] = [];
  let hasDateTypedColumn = false;
  let hasYearValues = false;
  let hasSmallRangeIntegers = false;

  for (const field of fields) {
    // Check 1: Column classified as date type
    if (field.dataType === 'date') {
      temporalIndices.push(field.fieldIndex);
      hasDateTypedColumn = true;
      continue;
    }

    // Check 2: RAW NUMERIC VALUES regardless of dataType
    const rawValues = sampleRows
      .map(row => row[field.fieldName])
      .filter(v => v !== null && v !== undefined)
      .map(v => Number(v))
      .filter(v => !isNaN(v) && Number.isInteger(v));

    if (rawValues.length < sampleRows.length * 0.5) continue;

    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const distinct = new Set(rawValues).size;

    // Year-range values: integers in [2000, 2040]
    if (min >= 2000 && max <= 2040 && distinct <= 10) {
      temporalIndices.push(field.fieldIndex);
      hasYearValues = true;
    }

    // Small-range integers: months (1-12) or quarters (1-4)
    if (min >= 1 && max <= 12 && distinct <= 12) {
      temporalIndices.push(field.fieldIndex);
      hasSmallRangeIntegers = true;
    }
  }

  return {
    hasTemporalColumns: hasDateTypedColumn || (hasYearValues && hasSmallRangeIntegers),
    temporalColumnIndices: Array.from(new Set(temporalIndices)),
  };
}

// ============================================================
// IDENTIFIER-RELATIVE CARDINALITY (Decision 105)
// ============================================================

function computeIdentifierRelativeCardinality(
  columnDistinctCount: number,
  identifierDistinctCount: number,
): number {
  if (identifierDistinctCount === 0) return 0;
  return columnDistinctCount / identifierDistinctCount;
}

// Detects structural name columns using identifier-relative cardinality
function detectStructuralNameColumn(
  fields: FieldProfile[],
  sampleRows: Record<string, unknown>[],
  identifierField: FieldProfile | null,
): string | null {
  if (!identifierField) return null;
  const idDistinct = identifierField.distinctCount;
  if (idDistinct === 0) return null;

  let bestCandidate: string | null = null;
  let bestScore = 0;

  for (const field of fields) {
    if (field === identifierField) continue;
    if (field.dataType !== 'text' && field.dataType !== 'mixed') continue;

    const values = sampleRows
      .map(r => String(r[field.fieldName] || ''))
      .filter(v => v.length > 0);
    if (values.length < 5) continue;

    // Cardinality relative to identifier
    const nameCardinality = computeIdentifierRelativeCardinality(field.distinctCount, idDistinct);
    if (nameCardinality < 0.50) continue; // fewer than half the entities → categorical

    let score = 0;

    // Non-numeric (names are not numbers)
    const nonNumericRatio = values.filter(v => isNaN(Number(v))).length / values.length;
    if (nonNumericRatio > 0.90) score += 3;
    else continue;

    // Multi-word (names have spaces)
    const spaceRatio = values.filter(v => v.includes(' ')).length / values.length;
    if (spaceRatio > 0.50) score += 3;

    // Average word count >= 1.8
    const avgWords = values.reduce((sum, v) => sum + v.split(/\s+/).length, 0) / values.length;
    if (avgWords >= 1.8) score += 2;

    // High cardinality relative to identifier (near 1:1)
    if (nameCardinality > 0.80) score += 2;

    // No digits in values (person names don't contain digits)
    const digitRatio = values.filter(v => /\d/.test(v)).length / values.length;
    if (digitRatio > 0.20) continue; // disqualify

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = field.fieldName;
    }
  }

  return bestScore >= 5 ? bestCandidate : null;
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
  totalRowCount?: number,
): ContentProfile {
  const contentUnitId = `${sourceFile}::${tabName}::${tabIndex}`;
  const rowCount = totalRowCount || rows.length;
  const columnCount = columns.length;
  const observations: ProfileObservation[] = [];

  // Sparsity
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

  // Build field profiles with probabilistic type scoring
  const fields: FieldProfile[] = columns.map((col, fieldIndex) => {
    const values = rows.map(r => r[col]);
    const nonNull = values.filter(v => v != null && String(v).trim() !== '');
    const classification = classifyColumnType(values, col);
    const dataType = classification.dataType;
    const nullRate = rows.length > 0 ? (rows.length - nonNull.length) / rows.length : 0;
    const distinctValues = new Set(nonNull.map(v => String(v)));
    const distinctCount = distinctValues.size;

    // Emit type classification observation
    const altInterp = { ...classification.allScores };
    delete altInterp[dataType];
    observations.push({
      columnName: col,
      observationType: 'type_classification',
      observedValue: dataType,
      confidence: classification.confidence,
      alternativeInterpretations: altInterp,
      structuralEvidence: `Winning type: ${dataType} at ${(classification.confidence * 100).toFixed(0)}%`,
    });

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

    // Also compute distribution for columns that are numerically parseable but typed differently
    // (needed for temporal detection on boolean-typed columns)
    if (!distribution.min && !distribution.max) {
      const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n) && Number.isInteger(n));
      if (nums.length > 0 && nums.length / nonNull.length > 0.80) {
        distribution.min = Math.min(...nums);
        distribution.max = Math.max(...nums);
        distribution.mean = nums.reduce((s, n) => s + n, 0) / nums.length;
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
        looksLikePersonName: false, // set below after identifier detection
      },
    };
  });

  // ── Structural Pattern Detection ──

  // Entity identifier
  const hasEntityIdentifier = fields.some(f =>
    detectStructuralIdentifier(f, rowCount) || f.nameSignals.containsId ||
    (f.dataType === 'integer' && f.distribution.isSequential)
  );

  // Identifier field for cardinality computations
  const idField = fields.find(f => detectStructuralIdentifier(f, rowCount)) ||
    fields.find(f => f.nameSignals.containsId);
  const idDistinct = idField?.distinctCount ?? 0;

  // Temporal detection (Decision 104: type-agnostic)
  const temporal = detectTemporalColumns(fields, rows);

  // Emit temporal observation
  if (temporal.hasTemporalColumns) {
    observations.push({
      columnName: null,
      observationType: 'temporal_detection',
      observedValue: true,
      confidence: 0.80,
      alternativeInterpretations: {},
      structuralEvidence: `Temporal columns at indices: ${temporal.temporalColumnIndices.join(', ')}`,
    });
  }

  const hasDateColumn = fields.some(f => f.dataType === 'date' || f.nameSignals.containsDate) || temporal.hasTemporalColumns;
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

  const identifierRepeatRatio = idField && idField.distinctCount > 0
    ? rowCount / idField.distinctCount
    : 0;

  // Numeric field ratio
  const nonIdFields = fields.filter(f => f !== idField);
  const numericTypes = ['integer', 'decimal', 'currency', 'percentage'] as const;
  const numericFieldCount = nonIdFields.filter(f =>
    (numericTypes as readonly string[]).includes(f.dataType)
  ).length;
  const numericFieldRatio = nonIdFields.length > 0
    ? numericFieldCount / nonIdFields.length
    : 0;

  // Categorical field ratio (Decision 105: identifier-relative cardinality)
  const categoricalFields = idDistinct > 0
    ? fields.filter(f => {
        if (f === idField) return false;
        if (f.dataType !== 'text' && f.dataType !== 'mixed') return false;
        const relCard = computeIdentifierRelativeCardinality(f.distinctCount, idDistinct);
        return relCard < 0.50;
      })
    : fields.filter(f =>
        f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 20
      );
  const categoricalFieldCount = categoricalFields.length;
  const categoricalFieldRatio = columnCount > 0
    ? categoricalFieldCount / columnCount
    : 0;

  // Structural name column (Decision 105: identifier-relative cardinality)
  const structuralNameField = detectStructuralNameColumn(fields, rows, idField ?? null);
  const hasStructuralNameColumn = structuralNameField !== null;

  // Update looksLikePersonName on the matching field
  if (structuralNameField) {
    const nameField = fields.find(f => f.fieldName === structuralNameField);
    if (nameField) {
      nameField.nameSignals.looksLikePersonName = true;
    }
    observations.push({
      columnName: structuralNameField,
      observationType: 'name_detection',
      observedValue: true,
      confidence: 0.85,
      alternativeInterpretations: {},
      structuralEvidence: `nameCardinality: ${idDistinct > 0 ? (fields.find(f => f.fieldName === structuralNameField)!.distinctCount / idDistinct).toFixed(2) : 'N/A'}, multi-word text, non-numeric`,
    });
  }

  // Volume pattern
  const volumePattern: ContentProfile['patterns']['volumePattern'] =
    identifierRepeatRatio === 0 ? 'unknown' :
    identifierRepeatRatio <= 1.5 ? 'single' :
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
      hasTemporalColumns: temporal.hasTemporalColumns,
      hasCurrencyColumns,
      hasPercentageValues,
      hasDescriptiveLabels,
      hasStructuralNameColumn,
      rowCountCategory,
      volumePattern,
    },
    observations,
  };
}
