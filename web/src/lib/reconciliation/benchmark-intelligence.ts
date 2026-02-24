/**
 * Benchmark Intelligence Service
 *
 * OB-87: Analyzes a parsed benchmark file to discover what's comparable
 * between the benchmark and VL calculation results.
 *
 * Core capabilities:
 * - AI-first column classification (Korean Test compliant)
 * - Period discovery + period matching against VL calculated periods
 * - Depth assessment (5 levels)
 * - Classification signal integration (OB-86)
 *
 * DESIGN PRINCIPLES:
 * - Zero hardcoded column names (Korean Test)
 * - AI-first, deterministic fallback, human authority (Three-Tier Resolution)
 * - Three minimum mappings: Entity ID + Total Payout + Period
 * - Carry everything: parse all columns, express contextually
 */

import type { ParsedFile } from './smart-file-parser';
import type { ColumnMapping, MappingResult } from './ai-column-mapper';
import { mapColumns } from './ai-column-mapper';
import {
  recordAIClassificationBatch,
} from '@/lib/intelligence/classification-signal-service';

// ============================================
// TYPES
// ============================================

export interface BenchmarkAnalysis {
  // Minimum mappings (3 required)
  entityIdColumn: ColumnMappingInfo | null;
  totalPayoutColumn: ColumnMappingInfo | null;
  periodColumns: ColumnMappingInfo[];

  // Discovered depth
  componentColumns: ColumnMappingInfo[];
  metricColumns: ColumnMappingInfo[];
  hierarchyColumns: ColumnMappingInfo[];

  // Period intelligence
  periodDiscovery: PeriodDiscovery;

  // Comparison depth assessment
  depthAssessment: DepthAssessment;

  // AI mapping result (for user override UI)
  mappingResult: MappingResult | null;

  // Raw data
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export interface ColumnMappingInfo {
  sourceColumn: string;
  semanticType: string;
  confidence: number;
  sampleValues: unknown[];
}

export interface PeriodDiscovery {
  hasPeriodData: boolean;
  periodColumns: string[];
  distinctPeriods: PeriodValue[];
  rowsPerPeriod: Record<string, number>;
}

export interface PeriodValue {
  month: number | null;
  year: number | null;
  label: string;
  rawValues: unknown[];
}

export interface DepthAssessment {
  levels: DepthLevel[];
  maxDepth: number;
}

export interface DepthLevel {
  level: number;
  name: string;
  nameEs: string;
  available: boolean;
  confidence: number;
  detail: string;
  detailEs: string;
}

export interface PeriodMatchResult {
  matched: { benchmarkPeriod: PeriodValue; vlPeriod: { id: string; label: string } }[];
  benchmarkOnly: PeriodValue[];
  vlOnly: { id: string; label: string }[];
}

export interface CalculationBatchContext {
  entityExternalIds: string[];
  components: string[];
  periodId: string;
  periodLabel: string;
  periodStartDate: string;
  periodEndDate: string;
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export async function analyzeBenchmark(
  parsedFile: ParsedFile,
  batchContext: CalculationBatchContext,
  tenantId: string,
  userId: string,
): Promise<BenchmarkAnalysis> {
  const { headers, rows } = parsedFile;
  const sampleRows = rows.slice(0, 5);

  // Step 1: AI Classification via existing ai-column-mapper
  // This already handles Korean Test, classification signals, etc.
  let mappingResult: MappingResult | null = null;
  try {
    mappingResult = await mapColumns(parsedFile, tenantId, userId);
  } catch (err) {
    console.warn('[BenchmarkIntelligence] AI mapping failed:', err);
  }

  // Step 2: Extract classified columns from AI mappings
  const aiMappings = mappingResult?.mappings ?? [];

  // Entity ID detection
  const entityIdMapping = aiMappings.find(m => m.mappedTo === 'entity_id');
  let entityIdColumn: ColumnMappingInfo | null = null;
  if (entityIdMapping) {
    entityIdColumn = {
      sourceColumn: entityIdMapping.sourceColumn,
      semanticType: 'entity_id',
      confidence: entityIdMapping.confidence,
      sampleValues: sampleRows.map(r => r[entityIdMapping.sourceColumn]),
    };
  }

  // If AI didn't find entity ID, try deterministic fallback (value overlap)
  if (!entityIdColumn) {
    const fallback = detectEntityIdByOverlap(headers, rows, batchContext.entityExternalIds);
    if (fallback) entityIdColumn = fallback;
  }

  // Total payout detection
  const totalMapping = aiMappings.find(m => m.mappedTo === 'total_amount');
  let totalPayoutColumn: ColumnMappingInfo | null = null;
  if (totalMapping) {
    totalPayoutColumn = {
      sourceColumn: totalMapping.sourceColumn,
      semanticType: 'total_payout',
      confidence: totalMapping.confidence,
      sampleValues: sampleRows.map(r => r[totalMapping.sourceColumn]),
    };
  }

  // If AI didn't find total, try deterministic fallback (largest numeric column)
  if (!totalPayoutColumn) {
    const fallback = detectTotalByNumeric(headers, rows, entityIdColumn?.sourceColumn);
    if (fallback) totalPayoutColumn = fallback;
  }

  // Step 3: Period detection — AI + deterministic
  const periodColumns = detectPeriodColumns(headers, rows, aiMappings);

  // Step 4: Period discovery
  const periodDiscovery = discoverPeriods(rows, periodColumns);

  // Step 5: Component detection
  const componentColumns = aiMappings
    .filter(m => m.mappedTo.startsWith('component:'))
    .map(m => ({
      sourceColumn: m.sourceColumn,
      semanticType: m.mappedTo,
      confidence: m.confidence,
      sampleValues: sampleRows.map(r => r[m.sourceColumn]),
    }));

  // Step 6: Metric/hierarchy detection (from unmapped numeric/string columns)
  const metricColumns: ColumnMappingInfo[] = [];
  const hierarchyColumns: ColumnMappingInfo[] = [];
  const usedColumns = new Set([
    entityIdColumn?.sourceColumn,
    totalPayoutColumn?.sourceColumn,
    ...periodColumns.map(p => p.sourceColumn),
    ...componentColumns.map(c => c.sourceColumn),
  ].filter(Boolean));

  for (const header of headers) {
    if (usedColumns.has(header)) continue;
    const values = sampleRows.map(r => r[header]);
    const numericCount = values.filter(v => typeof v === 'number' || !isNaN(Number(v))).length;

    if (numericCount >= 3) {
      // Check if values look like percentages (0-200 range or 0-2 range)
      const nums = values.map(Number).filter(n => !isNaN(n));
      const allPercentish = nums.every(n => (n >= 0 && n <= 200) || (n >= 0 && n <= 2));
      if (allPercentish && nums.some(n => n > 0)) {
        metricColumns.push({
          sourceColumn: header,
          semanticType: 'metric',
          confidence: 0.4,
          sampleValues: values,
        });
      }
    } else if (numericCount === 0 && values.some(v => typeof v === 'string' && (v as string).length > 0)) {
      // String column — could be hierarchy (store, team, region)
      const distinct = new Set(rows.slice(0, 50).map(r => String(r[header] ?? '')).filter(Boolean));
      if (distinct.size > 1 && distinct.size < rows.length * 0.5) {
        hierarchyColumns.push({
          sourceColumn: header,
          semanticType: 'hierarchy',
          confidence: 0.3,
          sampleValues: values,
        });
      }
    }
  }

  // Step 7: Record classification signals for period detection (OB-86)
  if (periodColumns.length > 0) {
    try {
      recordAIClassificationBatch(
        tenantId,
        'benchmark_period_detection',
        periodColumns.map(p => ({
          fieldName: p.sourceColumn,
          semanticType: p.semanticType,
          confidence: p.confidence,
        })),
        { fileName: parsedFile.fileName },
      );
    } catch {
      // fire-and-forget
    }
  }

  // Step 8: Build depth assessment
  const depthAssessment = buildDepthAssessment(
    entityIdColumn, totalPayoutColumn, periodColumns,
    componentColumns, metricColumns, rows.length,
    periodDiscovery,
  );

  return {
    entityIdColumn,
    totalPayoutColumn,
    periodColumns,
    componentColumns,
    metricColumns,
    hierarchyColumns,
    periodDiscovery,
    depthAssessment,
    mappingResult,
    headers,
    rowCount: rows.length,
    sampleRows,
  };
}

// ============================================
// PERIOD VALUE RESOLVER
// ============================================

/**
 * Resolve period values from raw column data.
 * Handles: numbers (1-12, 2020-2100), month names (any language via Intl),
 * date strings, ISO dates, patterns like "Q1 2024", "Jan-2024".
 *
 * Korean Test: uses Intl.DateTimeFormat for language-agnostic month name resolution.
 */
export function resolvePeriodValue(values: unknown[]): { month: number | null; year: number | null } {
  let month: number | null = null;
  let year: number | null = null;

  for (const val of values) {
    if (val == null) continue;
    const s = String(val).trim();
    if (!s) continue;

    // 1. Date object or ISO date string
    if (s.match(/^\d{4}-\d{2}(-\d{2})?/)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        month = month ?? (d.getMonth() + 1);
        year = year ?? d.getFullYear();
        continue;
      }
    }

    // 2. Pure number
    const num = Number(s);
    if (!isNaN(num) && Number.isInteger(num)) {
      if (num >= 1900 && num <= 2100) {
        year = year ?? num;
      } else if (num >= 1 && num <= 12) {
        month = month ?? num;
      }
      continue;
    }

    // 3. Pattern: "Q1 2024", "1T 2024"
    const quarterMatch = s.match(/[QqTt](\d)\s*(\d{4})/);
    if (quarterMatch) {
      const q = parseInt(quarterMatch[1]);
      month = month ?? ((q - 1) * 3 + 1); // Q1→1, Q2→4, Q3→7, Q4→10
      year = year ?? parseInt(quarterMatch[2]);
      continue;
    }

    // 4. Pattern: "Jan-2024", "January 2024", "2024-01", "01/2024"
    const monthYearMatch = s.match(/(\w+)[\/\-\s]+(\d{4})/) || s.match(/(\d{4})[\/\-\s]+(\d{1,2})/);
    if (monthYearMatch) {
      const [, part1, part2] = monthYearMatch;
      const p1Num = parseInt(part1);
      const p2Num = parseInt(part2);

      if (p1Num >= 1900 && p1Num <= 2100) {
        year = year ?? p1Num;
        if (p2Num >= 1 && p2Num <= 12) month = month ?? p2Num;
      } else if (p2Num >= 1900 && p2Num <= 2100) {
        year = year ?? p2Num;
        const resolvedMonth = resolveMonthName(part1);
        if (resolvedMonth) month = month ?? resolvedMonth;
        else if (p1Num >= 1 && p1Num <= 12) month = month ?? p1Num;
      }
      continue;
    }

    // 5. Month name alone (any language)
    const resolvedMonth = resolveMonthName(s);
    if (resolvedMonth) {
      month = month ?? resolvedMonth;
      continue;
    }

    // 6. Full date string parseable by Date
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
      month = month ?? (parsed.getMonth() + 1);
      year = year ?? parsed.getFullYear();
    }
  }

  return { month, year };
}

/**
 * Resolve a month name to a number (1-12).
 * Language-agnostic via Intl.DateTimeFormat.
 */
function resolveMonthName(text: string): number | null {
  const normalized = text.toLowerCase().trim();
  if (!normalized || normalized.length < 2) return null;

  // Build month name map for common locales
  const locales = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ko', 'ja', 'zh'];
  for (const locale of locales) {
    for (let m = 0; m < 12; m++) {
      const date = new Date(2024, m, 15);
      const long = date.toLocaleString(locale, { month: 'long' }).toLowerCase();
      const short = date.toLocaleString(locale, { month: 'short' }).toLowerCase().replace('.', '');
      if (normalized === long || normalized === short || long.startsWith(normalized) || normalized.startsWith(short)) {
        return m + 1;
      }
    }
  }
  return null;
}

// ============================================
// PERIOD MATCHING
// ============================================

export function matchPeriods(
  benchmarkPeriods: PeriodValue[],
  vlPeriods: { id: string; startDate: string; endDate: string; label: string }[],
): PeriodMatchResult {
  const matched: PeriodMatchResult['matched'] = [];
  const benchmarkOnly: PeriodValue[] = [];
  const vlMatched = new Set<string>();

  for (const bp of benchmarkPeriods) {
    let found = false;
    for (const vp of vlPeriods) {
      const vpDate = new Date(vp.startDate);
      const vpMonth = vpDate.getMonth() + 1;
      const vpYear = vpDate.getFullYear();

      // Match: month+year, or year-only if benchmark has no month
      const monthMatch = bp.month === null || bp.month === vpMonth;
      const yearMatch = bp.year === null || bp.year === vpYear;

      if (monthMatch && yearMatch && (bp.month !== null || bp.year !== null)) {
        matched.push({ benchmarkPeriod: bp, vlPeriod: { id: vp.id, label: vp.label } });
        vlMatched.add(vp.id);
        found = true;
        break;
      }
    }
    if (!found) {
      benchmarkOnly.push(bp);
    }
  }

  const vlOnly = vlPeriods
    .filter(vp => !vlMatched.has(vp.id))
    .map(vp => ({ id: vp.id, label: vp.label }));

  return { matched, benchmarkOnly, vlOnly };
}

// ============================================
// DETERMINISTIC FALLBACKS
// ============================================

function detectEntityIdByOverlap(
  headers: string[],
  rows: Record<string, unknown>[],
  knownExternalIds: string[],
): ColumnMappingInfo | null {
  if (knownExternalIds.length === 0) return null;
  const knownSet = new Set(knownExternalIds.map(id => normalizeId(id)));
  const sample = rows.slice(0, 50);

  let bestColumn: string | null = null;
  let bestOverlap = 0;

  for (const header of headers) {
    const values = sample.map(r => normalizeId(String(r[header] ?? '')));
    const overlap = values.filter(v => knownSet.has(v)).length;
    const rate = sample.length > 0 ? overlap / sample.length : 0;
    if (rate > bestOverlap && rate > 0.3) {
      bestOverlap = rate;
      bestColumn = header;
    }
  }

  if (bestColumn) {
    return {
      sourceColumn: bestColumn,
      semanticType: 'entity_id',
      confidence: Math.min(bestOverlap, 0.85),
      sampleValues: rows.slice(0, 5).map(r => r[bestColumn!]),
    };
  }
  return null;
}

function detectTotalByNumeric(
  headers: string[],
  rows: Record<string, unknown>[],
  entityIdColumn?: string,
): ColumnMappingInfo | null {
  const sample = rows.slice(0, 20);
  let bestColumn: string | null = null;
  let bestAvg = 0;

  for (const header of headers) {
    if (header === entityIdColumn) continue;
    const values = sample.map(r => Number(r[header])).filter(n => !isNaN(n));
    if (values.length < sample.length * 0.7) continue; // at least 70% numeric
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestColumn = header;
    }
  }

  if (bestColumn && bestAvg > 0) {
    return {
      sourceColumn: bestColumn,
      semanticType: 'total_payout',
      confidence: 0.6,
      sampleValues: rows.slice(0, 5).map(r => r[bestColumn!]),
    };
  }
  return null;
}

function detectPeriodColumns(
  headers: string[],
  rows: Record<string, unknown>[],
  aiMappings: ColumnMapping[],
): ColumnMappingInfo[] {
  const results: ColumnMappingInfo[] = [];
  const sample = rows.slice(0, 5);

  // Check AI mappings for period-related classifications
  for (const m of aiMappings) {
    if (m.mappedTo === 'period' || m.mappedTo === 'month' || m.mappedTo === 'year' || m.mappedTo === 'date') {
      results.push({
        sourceColumn: m.sourceColumn,
        semanticType: m.mappedTo,
        confidence: m.confidence,
        sampleValues: sample.map(r => r[m.sourceColumn]),
      });
    }
  }

  if (results.length > 0) return results;

  // Deterministic fallback: scan for columns with period-like values
  for (const header of headers) {
    const values = rows.slice(0, 30).map(r => r[header]);
    const resolved = resolvePeriodValue(values.slice(0, 1));

    // Check if this column has distinct period-like values
    const uniqueVals = new Set(values.map(v => String(v ?? '')).filter(Boolean));

    // Month column: 1-12 or month names, with few distinct values
    if (uniqueVals.size >= 1 && uniqueVals.size <= 12) {
      const allResolvable = Array.from(uniqueVals).every(v => {
        const r = resolvePeriodValue([v]);
        return r.month !== null || r.year !== null;
      });
      if (allResolvable && (resolved.month !== null || resolved.year !== null)) {
        // Determine type: if all values 1900-2100, it's year; if 1-12, it's month
        const nums = Array.from(uniqueVals).map(Number).filter(n => !isNaN(n));
        const isYear = nums.length > 0 && nums.every(n => n >= 1900 && n <= 2100);
        const isMonth = nums.length > 0 && nums.every(n => n >= 1 && n <= 12);

        results.push({
          sourceColumn: header,
          semanticType: isYear ? 'year' : isMonth ? 'month' : 'period',
          confidence: 0.7,
          sampleValues: sample.map(r => r[header]),
        });
      }
    }
  }

  return results;
}

// ============================================
// PERIOD DISCOVERY
// ============================================

function discoverPeriods(
  rows: Record<string, unknown>[],
  periodColumns: ColumnMappingInfo[],
): PeriodDiscovery {
  if (periodColumns.length === 0) {
    return {
      hasPeriodData: false,
      periodColumns: [],
      distinctPeriods: [],
      rowsPerPeriod: {},
    };
  }

  // Group rows by period key
  const periodKeys = new Map<string, { count: number; rawValues: unknown[]; month: number | null; year: number | null }>();

  for (const row of rows) {
    const periodValues = periodColumns.map(pc => row[pc.sourceColumn]);
    const resolved = resolvePeriodValue(periodValues);
    const key = `${resolved.year ?? '?'}-${resolved.month != null ? String(resolved.month).padStart(2, '0') : '??'}`;

    if (!periodKeys.has(key)) {
      periodKeys.set(key, { count: 0, rawValues: periodValues, month: resolved.month, year: resolved.year });
    }
    const entry = periodKeys.get(key)!;
    entry.count++;
  }

  const distinctPeriods: PeriodValue[] = [];
  const rowsPerPeriod: Record<string, number> = {};

  for (const [, data] of Array.from(periodKeys.entries())) {
    const label = formatPeriodLabel(data.month, data.year);
    distinctPeriods.push({
      month: data.month,
      year: data.year,
      label,
      rawValues: data.rawValues,
    });
    rowsPerPeriod[label] = data.count;
  }

  // Sort by year then month
  distinctPeriods.sort((a, b) => {
    if ((a.year ?? 0) !== (b.year ?? 0)) return (a.year ?? 0) - (b.year ?? 0);
    return (a.month ?? 0) - (b.month ?? 0);
  });

  return {
    hasPeriodData: true,
    periodColumns: periodColumns.map(pc => pc.sourceColumn),
    distinctPeriods,
    rowsPerPeriod,
  };
}

function formatPeriodLabel(month: number | null, year: number | null): string {
  if (month && year) {
    const date = new Date(year, month - 1, 15);
    const monthName = date.toLocaleString('en', { month: 'long' });
    return `${monthName} ${year}`;
  }
  if (year) return `${year}`;
  if (month) return `Month ${month}`;
  return 'Unknown';
}

// ============================================
// DEPTH ASSESSMENT
// ============================================

function buildDepthAssessment(
  entityIdColumn: ColumnMappingInfo | null,
  totalPayoutColumn: ColumnMappingInfo | null,
  periodColumns: ColumnMappingInfo[],
  componentColumns: ColumnMappingInfo[],
  metricColumns: ColumnMappingInfo[],
  rowCount: number,
  periodDiscovery: PeriodDiscovery,
): DepthAssessment {
  const levels: DepthLevel[] = [
    {
      level: 1,
      name: 'Entity Match',
      nameEs: 'Coincidencia de Entidad',
      available: entityIdColumn !== null,
      confidence: entityIdColumn?.confidence ?? 0,
      detail: entityIdColumn
        ? `"${entityIdColumn.sourceColumn}" (${rowCount} rows)`
        : 'Not detected',
      detailEs: entityIdColumn
        ? `"${entityIdColumn.sourceColumn}" (${rowCount} filas)`
        : 'No detectado',
    },
    {
      level: 2,
      name: 'Total Payout',
      nameEs: 'Pago Total',
      available: totalPayoutColumn !== null,
      confidence: totalPayoutColumn?.confidence ?? 0,
      detail: totalPayoutColumn
        ? `"${totalPayoutColumn.sourceColumn}" (${(totalPayoutColumn.confidence * 100).toFixed(0)}% confidence)`
        : 'Not detected',
      detailEs: totalPayoutColumn
        ? `"${totalPayoutColumn.sourceColumn}" (${(totalPayoutColumn.confidence * 100).toFixed(0)}% confianza)`
        : 'No detectado',
    },
    {
      level: 3,
      name: 'Period Filter',
      nameEs: 'Filtro de Periodo',
      available: periodColumns.length > 0,
      confidence: periodColumns.length > 0
        ? periodColumns.reduce((s, p) => s + p.confidence, 0) / periodColumns.length
        : 0,
      detail: periodColumns.length > 0
        ? `${periodColumns.map(p => `"${p.sourceColumn}"`).join(' + ')} (${periodDiscovery.distinctPeriods.length} periods found)`
        : 'Not detected',
      detailEs: periodColumns.length > 0
        ? `${periodColumns.map(p => `"${p.sourceColumn}"`).join(' + ')} (${periodDiscovery.distinctPeriods.length} periodos encontrados)`
        : 'No detectado',
    },
    {
      level: 4,
      name: 'Component Breakdown',
      nameEs: 'Desglose de Componentes',
      available: componentColumns.length > 0,
      confidence: componentColumns.length > 0
        ? componentColumns.reduce((s, c) => s + c.confidence, 0) / componentColumns.length
        : 0,
      detail: componentColumns.length > 0
        ? `${componentColumns.length} columns detected (${(componentColumns.reduce((s, c) => s + c.confidence, 0) / componentColumns.length * 100).toFixed(0)}% avg confidence)`
        : 'Not detected',
      detailEs: componentColumns.length > 0
        ? `${componentColumns.length} columnas detectadas (${(componentColumns.reduce((s, c) => s + c.confidence, 0) / componentColumns.length * 100).toFixed(0)}% confianza promedio)`
        : 'No detectado',
    },
    {
      level: 5,
      name: 'Attainment Data',
      nameEs: 'Datos de Cumplimiento',
      available: metricColumns.length > 0,
      confidence: metricColumns.length > 0
        ? metricColumns.reduce((s, m) => s + m.confidence, 0) / metricColumns.length
        : 0,
      detail: metricColumns.length > 0
        ? `${metricColumns.length} metric columns detected`
        : 'Not detected',
      detailEs: metricColumns.length > 0
        ? `${metricColumns.length} columnas de metricas detectadas`
        : 'No detectado',
    },
  ];

  const maxDepth = levels.filter(l => l.available).length > 0
    ? Math.max(...levels.filter(l => l.available).map(l => l.level))
    : 0;

  return { levels, maxDepth };
}

// ============================================
// PERIOD FILTER UTILITY
// ============================================

/**
 * Filter benchmark rows to only include rows matching the specified period(s).
 * Returns the filtered rows + count info.
 */
export function filterRowsByPeriod(
  rows: Record<string, unknown>[],
  periodColumns: ColumnMappingInfo[],
  targetPeriods: PeriodValue[],
): { filteredRows: Record<string, unknown>[]; originalCount: number; filteredCount: number } {
  if (periodColumns.length === 0 || targetPeriods.length === 0) {
    return { filteredRows: rows, originalCount: rows.length, filteredCount: rows.length };
  }

  const targetKeys = new Set(
    targetPeriods.map(tp => `${tp.year ?? '?'}-${tp.month != null ? String(tp.month).padStart(2, '0') : '??'}`)
  );

  const filteredRows = rows.filter(row => {
    const periodValues = periodColumns.map(pc => row[pc.sourceColumn]);
    const resolved = resolvePeriodValue(periodValues);
    const key = `${resolved.year ?? '?'}-${resolved.month != null ? String(resolved.month).padStart(2, '0') : '??'}`;
    return targetKeys.has(key);
  });

  return { filteredRows, originalCount: rows.length, filteredCount: filteredRows.length };
}

// ============================================
// UTILITY
// ============================================

function normalizeId(id: string): string {
  let normalized = String(id).trim();
  if (/^\d+$/.test(normalized)) {
    normalized = String(parseInt(normalized, 10));
  }
  return normalized.toLowerCase();
}
