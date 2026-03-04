// OB-152 Decision 92: Structural source_date extraction
// KOREAN TEST: Zero field-name matching in any language.
// Three strategies in priority order:
// 1. Content Profile date column hint (structural, from value analysis)
// 2. AI semantic role (from SCI classification)
// 3. Structural scan (plausible date in any column value)

/**
 * Extract a source_date from a row of data using structural heuristics.
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function extractSourceDate(
  rowData: Record<string, unknown>,
  dateColumnHint: string | null,
  semanticRoles: Record<string, string> | null,
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

  // Strategy 3: Structural scan (plausible date in any column value)
  for (const value of Object.values(rowData)) {
    if (value == null) continue;
    // Skip internal metadata keys
    if (typeof value === 'object' && value !== null) continue;
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
  bindings: Array<{ sourceField: string; semanticRole: string }>,
): string | null {
  const temporalRoles = new Set([
    'transaction_date', 'period_marker', 'event_timestamp', 'date',
  ]);
  for (const b of bindings) {
    if (temporalRoles.has(b.semanticRole)) {
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
