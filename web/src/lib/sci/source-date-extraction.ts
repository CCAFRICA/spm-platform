// OB-152 Decision 92: Structural source_date extraction
// OB-157: Period marker composition + restricted Strategy 3
// KOREAN TEST: Zero field-name matching in any language.
// Four strategies in priority order:
// 1. Content Profile date column hint (structural, from value analysis)
// 2. AI semantic role (from SCI classification)
// 3. Period marker composition (year + month columns → YYYY-MM-01)
// 4. Structural scan (plausible date in string/Date columns only — NOT numeric)

/**
 * Extract a source_date from a row of data using structural heuristics.
 * Returns ISO date string (YYYY-MM-DD) or null.
 *
 * OB-157: Added periodMarkerHint for year+month column composition.
 */
export function extractSourceDate(
  rowData: Record<string, unknown>,
  dateColumnHint: string | null,
  semanticRoles: Record<string, string> | null,
  periodMarkerHint?: { yearColumn: string; monthColumn: string } | null,
): string | null {
  // Strategy 1: Content Profile identified date column
  if (dateColumnHint && rowData[dateColumnHint] != null) {
    const parsed = parseAnyDateValue(rowData[dateColumnHint]);
    if (parsed) return parsed;
  }

  // Strategy 2: Semantic role tagged as temporal
  if (semanticRoles) {
    const temporalRoles = new Set([
      'date', 'transaction_date', 'event_date', 'cutoff_date', 'period_marker',
    ]);
    for (const [field, role] of Object.entries(semanticRoles)) {
      if (temporalRoles.has(role) && rowData[field] != null) {
        const parsed = parseAnyDateValue(rowData[field]);
        if (parsed) return parsed;
      }
    }
  }

  // Strategy 3: Period marker composition (OB-157)
  // Compose year + month columns into YYYY-MM-01 date
  if (periodMarkerHint) {
    const yearVal = rowData[periodMarkerHint.yearColumn];
    const monthVal = rowData[periodMarkerHint.monthColumn];
    if (yearVal != null && monthVal != null) {
      const year = Number(yearVal);
      const month = Number(monthVal);
      if (year >= 2000 && year <= 2030 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-01`;
      }
    }
  }

  // Strategy 4: Structural scan — string/Date values only (OB-157: skip numbers)
  // Numbers are too ambiguous (financial values, IDs, quantities can look like serial dates)
  for (const value of Object.values(rowData)) {
    if (value == null) continue;
    if (typeof value === 'number') continue; // OB-157: skip numeric values
    if (typeof value === 'object' && !(value instanceof Date)) continue;
    const parsed = parseAnyDateValue(value);
    if (parsed) {
      const y = new Date(parsed).getFullYear();
      if (y >= 2000 && y <= 2030) return parsed;
    }
  }

  return null;
}

/**
 * Parse any value into an ISO date string (YYYY-MM-DD).
 * Handles Date objects, ISO strings, and Excel serial dates.
 */
export function parseAnyDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2030) {
      return d.toISOString().split('T')[0];
    }
    return null;
  }

  if (typeof value === 'number') {
    // Excel serial date range: 2000-01-01 (36526) to 2030-01-01 (47483)
    if (value >= 36526 && value <= 47483) {
      // Excel epoch: Jan 0, 1900 (with Lotus 1-2-3 bug: Feb 29, 1900 counted)
      const d = new Date(new Date(1899, 11, 30).getTime() + value * 86400000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
    return null;
  }

  return null;
}

/**
 * Identify the best date column hint from semantic bindings.
 * Returns the field name of the first temporal field, or null.
 */
export function findDateColumnFromBindings(
  bindings: Array<{ sourceField: string; semanticRole: string; platformType?: string }>,
): string | null {
  // OB-183: Comprehensive temporal role matching
  const temporalRoles = new Set([
    'transaction_date', 'period_marker', 'event_timestamp', 'date',
    'event_date', 'cutoff_date', 'temporal', 'timestamp',
  ]);
  for (const b of bindings) {
    if (temporalRoles.has(b.semanticRole)) {
      return b.sourceField;
    }
  }
  // OB-183: Fallback — if any binding has platformType 'date', use it
  // This catches cases where the AI identifies the column type as date
  // but assigns a non-standard semanticRole
  for (const b of bindings) {
    if (b.platformType === 'date') {
      return b.sourceField;
    }
  }
  return null;
}

/**
 * Build a semantic roles map from confirmed bindings for extractSourceDate.
 */
export function buildSemanticRolesMap(
  bindings: Array<{ sourceField: string; semanticRole: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const b of bindings) {
    map[b.sourceField] = b.semanticRole;
  }
  return map;
}

/**
 * OB-157: Detect period marker columns (year + month) from row data.
 * Korean Test: Uses VALUE PATTERNS only — zero field name matching.
 *
 * Scans a sample of rows to find:
 * - A column where all non-null values are integers in 2000-2030 (year)
 * - A column where all non-null values are integers in 1-12 (month)
 *
 * Returns the column names or null if no clear pair is found.
 */
export function detectPeriodMarkerColumns(
  rows: Record<string, unknown>[],
): { yearColumn: string; monthColumn: string } | null {
  if (rows.length === 0) return null;

  // Sample up to 100 rows for detection
  const sample = rows.slice(0, 100);
  const columns = Object.keys(sample[0]);

  const yearCandidates: string[] = [];
  const monthCandidates: string[] = [];

  for (const col of columns) {
    let allYear = true;
    let allMonth = true;
    let nonNullCount = 0;

    for (const row of sample) {
      const val = row[col];
      if (val == null || val === '') continue;
      const num = Number(val);
      if (isNaN(num) || !Number.isInteger(num)) {
        allYear = false;
        allMonth = false;
        break;
      }
      nonNullCount++;
      if (num < 2000 || num > 2030) allYear = false;
      if (num < 1 || num > 12) allMonth = false;
    }

    // Require at least 5 non-null values for confidence
    if (nonNullCount < 5) continue;

    if (allYear) yearCandidates.push(col);
    // Month candidates must NOT also be year candidates (1-12 is subset of 2000-2030? No, it's not)
    if (allMonth) monthCandidates.push(col);
  }

  // Need exactly one year column and at least one month column
  if (yearCandidates.length !== 1 || monthCandidates.length === 0) return null;

  // Pick the first month candidate that isn't the year column
  const monthCol = monthCandidates.find(c => c !== yearCandidates[0]);
  if (!monthCol) return null;

  return { yearColumn: yearCandidates[0], monthColumn: monthCol };
}
