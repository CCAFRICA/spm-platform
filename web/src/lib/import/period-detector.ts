/**
 * Period Detector — Extracts time periods from parsed sheet data using field mappings.
 *
 * HF-053: Scans ALL sheets for columns mapped to period-related target fields
 * (year, month, date, period) and extracts unique time periods.
 *
 * DOES NOT hardcode any column names — uses field mappings exclusively.
 * Works for ANY language, ANY column naming convention.
 */

export interface DetectedPeriod {
  year: number;
  month: number;
  label: string;          // e.g., "January 2024"
  canonicalKey: string;   // e.g., "2024-01"
  startDate: string;      // e.g., "2024-01-01"
  endDate: string;        // e.g., "2024-01-31"
  recordCount: number;    // how many rows belong to this period
  sheetsPresent: string[]; // which sheets contain data for this period
}

export interface PeriodDetectionResult {
  periods: DetectedPeriod[];
  frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown';
  confidence: number;     // 0-100, based on coverage and consistency
  method: string;         // how periods were detected
}

interface SheetInput {
  name: string;
  rows: Record<string, unknown>[];
  mappings: Array<{ sourceColumn: string; targetField: string | null }>;
  classification?: string; // OB-107: sheet classification from AI analysis
}

/**
 * Detect periods from parsed sheet data and field mappings.
 * Uses ZERO hardcoded column names — reads from field mappings exclusively.
 */
export function detectPeriods(sheets: SheetInput[]): PeriodDetectionResult {
  const periodMap = new Map<string, DetectedPeriod>();
  let method = '';

  for (const sheet of sheets) {
    if (!sheet.rows || sheet.rows.length === 0) continue;

    // OB-107: Skip roster/personnel sheets — their dates are entity attributes
    // (e.g., HireDate), not performance period boundaries
    if (sheet.classification === 'roster' || sheet.classification === 'unrelated') continue;

    // Find columns mapped to period-related targets
    const yearMapping = sheet.mappings.find(
      m => m.targetField === 'year' || m.targetField === 'period_year'
    );
    const monthMapping = sheet.mappings.find(
      m => m.targetField === 'month' || m.targetField === 'period_month'
    );
    const dateMapping = sheet.mappings.find(
      m => m.targetField === 'date' || m.targetField === 'period' || m.targetField === 'period_date'
    );

    if (yearMapping && monthMapping) {
      // Strategy 1: Separate year + month columns
      method = method || 'year_month_columns';
      for (const row of sheet.rows) {
        const year = parseInt(String(row[yearMapping.sourceColumn]), 10);
        const month = parseInt(String(row[monthMapping.sourceColumn]), 10);
        if (year && month && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
          addPeriod(periodMap, year, month, sheet.name);
        }
      }
    } else if (dateMapping) {
      // Strategy 2: Single date/period column — extract year/month
      method = method || 'date_column';
      for (const row of sheet.rows) {
        const dateVal = row[dateMapping.sourceColumn];
        const parsed = parseDate(dateVal);
        if (parsed) {
          addPeriod(periodMap, parsed.year, parsed.month, sheet.name);
        }
      }
    }
    // If no period mappings exist for this sheet, skip it (roster sheets, etc.)
  }

  const periods = Array.from(periodMap.values()).sort(
    (a, b) => a.canonicalKey.localeCompare(b.canonicalKey)
  );

  // Calculate confidence based on coverage
  const totalRows = sheets.reduce((sum, s) => sum + (s.rows?.length || 0), 0);
  const periodRows = periods.reduce((sum, p) => sum + p.recordCount, 0);
  const coverage = totalRows > 0 ? (periodRows / totalRows) * 100 : 0;

  // Determine frequency
  let frequency: PeriodDetectionResult['frequency'] = 'unknown';
  if (periods.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < periods.length; i++) {
      const monthDiff = (periods[i].year - periods[i - 1].year) * 12 +
                         (periods[i].month - periods[i - 1].month);
      gaps.push(monthDiff);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap <= 1.5) frequency = 'monthly';
    else if (avgGap <= 4) frequency = 'quarterly';
    else if (avgGap <= 13) frequency = 'annual';
  } else if (periods.length === 1) {
    frequency = 'monthly';
  }

  return {
    periods,
    frequency,
    confidence: Math.round(Math.min(coverage, 100)),
    method: method || 'none',
  };
}

function addPeriod(
  map: Map<string, DetectedPeriod>,
  year: number,
  month: number,
  sheetName: string
): void {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (!map.has(key)) {
    map.set(key, {
      year,
      month,
      label: `${getMonthName(month)} ${year}`,
      canonicalKey: key,
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: getLastDayOfMonth(year, month),
      recordCount: 0,
      sheetsPresent: [],
    });
  }
  const period = map.get(key)!;
  period.recordCount++;
  if (!period.sheetsPresent.includes(sheetName)) {
    period.sheetsPresent.push(sheetName);
  }
}

function getMonthName(month: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names[month - 1] || 'Unknown';
}

function getLastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function parseDate(value: unknown): { year: number; month: number } | null {
  if (value == null) return null;

  // Handle Excel serial dates
  if (typeof value === 'number' && value > 25000 && value < 100000) {
    const date = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
    }
  }

  // Handle numeric year (e.g., column with just year value — combine with month=1)
  if (typeof value === 'number' && value >= 2000 && value <= 2100) {
    return { year: value, month: 1 };
  }

  // Handle string dates
  const str = String(value);
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() >= 2000) {
    return { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1 };
  }

  return null;
}
