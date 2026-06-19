/**
 * OB-220 — Temporal (wide-format) column binding.
 *
 * Some tenants store period data in WIDE format: one column per month (Enero_2025, Febrero_2025, …)
 * rather than one column + a period dimension. A single metric binding can't point at six columns,
 * so the LLM binding step abstains. This module lets a binding carry a `columnMap` (periodKey →
 * column) and resolve the right column for the calculation period at calc time.
 *
 * Detection is structural (a shared 4-digit year + a temporal token), not business-column matching —
 * Korean Test. The month vocabulary is a temporal-parsing utility (es/en/pt, matching supported
 * locales), the same class as a date parser, not a tenant/column literal. For an explicit binding
 * (authored in SQL), `resolveTemporalColumn` alone is used; the detector is the general auto-path.
 */

export interface TemporalColumnMap {
  type: 'temporal_map';
  /** periodKey ("YYYY-MM") → source column name. */
  columnMap: Record<string, string>;
  /** reduction to apply to the resolved column (a wide-format month is typically a snapshot). */
  reduction: string;
}

// Temporal vocabulary only (months), multilingual — not business/column names.
const MONTHS: Record<string, string> = {
  enero: '01', ene: '01', january: '01', jan: '01', janeiro: '01',
  febrero: '02', feb: '02', february: '02', fevereiro: '02', fev: '02',
  marzo: '03', mar: '03', march: '03', marco: '03',
  abril: '04', abr: '04', april: '04', apr: '04',
  mayo: '05', may: '05', maio: '05',
  junio: '06', jun: '06', june: '06', junho: '06',
  julio: '07', jul: '07', july: '07', julho: '07',
  agosto: '08', ago: '08', august: '08', aug: '08',
  septiembre: '09', setiembre: '09', sep: '09', sept: '09', september: '09', setembro: '09',
  octubre: '10', oct: '10', october: '10', outubro: '10', out: '10',
  noviembre: '11', nov: '11', november: '11', novembro: '11',
  diciembre: '12', dic: '12', december: '12', dec: '12', dezembro: '12', dez: '12',
};

/**
 * Detect a wide-format temporal column set among `columns`. Returns a temporal_map (≥2 period
 * columns) or null. Structural: each column must carry a 4-digit year AND a recognizable month
 * token (named or numeric).
 */
export function detectTemporalColumnMap(columns: string[], reduction = 'snapshot'): TemporalColumnMap | null {
  const columnMap: Record<string, string> = {};
  for (const col of columns) {
    const yearMatch = col.match(/(?:19|20)\d{2}/);
    if (!yearMatch) continue;
    const year = yearMatch[0];
    let month: string | undefined;
    // named month token
    for (const tk of col.toLowerCase().split(/[^a-záéíóúãâçó]+/i).filter(Boolean)) {
      if (MONTHS[tk]) { month = MONTHS[tk]; break; }
    }
    // numeric month token (1-12) that isn't the year
    if (!month) {
      for (const tk of col.split(/[^0-9]+/).filter(Boolean)) {
        if (tk !== year && Number(tk) >= 1 && Number(tk) <= 12) { month = String(Number(tk)).padStart(2, '0'); break; }
      }
    }
    if (month) columnMap[`${year}-${month}`] = col;
  }
  return Object.keys(columnMap).length >= 2 ? { type: 'temporal_map', columnMap, reduction } : null;
}

/** Resolve the source column for a period key ("YYYY-MM"). Null when the period isn't mapped (SR-34). */
export function resolveTemporalColumn(columnMap: Record<string, string>, periodKey: string): string | null {
  return columnMap[periodKey] ?? null;
}

/** Derive the "YYYY-MM" period key from a period's start_date (e.g. "2025-01-01" → "2025-01"). */
export function periodKeyFromStartDate(startDate: string | null | undefined): string | null {
  if (!startDate || startDate.length < 7) return null;
  return startDate.slice(0, 7);
}

/** Type guard: a binding entry carrying a temporal columnMap. */
export function isTemporalBinding(entry: unknown): entry is { columnMap: Record<string, string>; reduction?: string } {
  return !!entry && typeof entry === 'object'
    && !!(entry as { columnMap?: unknown }).columnMap
    && typeof (entry as { columnMap?: unknown }).columnMap === 'object';
}
