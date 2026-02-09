/**
 * Cheque Parser
 *
 * Parses tab-delimited POS cheque export files (cheques_YYYYMMDD.TXT).
 * Supports SoftRestaurant and ICG column name aliases.
 */

import type { Cheque, ChequeImportError } from './types';
import { CHEQUE_COLUMN_ALIASES } from './types';
import {
  CHEQUE_COLUMNS,
  CHEQUE_COLUMN_COUNT,
  VALIDATION_RULES,
} from './financial-constants';

// ============================================
// TYPES
// ============================================

export interface ChequeParseResult {
  cheques: Cheque[];
  errors: ChequeImportError[];
  metadata: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    dateRange: { start: string; end: string };
    locations: string[];
    staff: number[];
    shifts: number[];
    totalRevenue: number;
  };
}

// ============================================
// COLUMN NORMALIZATION
// ============================================

/**
 * Normalize a column name to the standard cheque field name
 */
function normalizeColumnName(column: string): keyof Cheque | null {
  const normalized = column.toLowerCase().trim().replace(/\s+/g, '_');

  // Check direct match with expected columns
  if (CHEQUE_COLUMNS.includes(normalized as typeof CHEQUE_COLUMNS[number])) {
    return CHEQUE_COLUMN_ALIASES[normalized] || null;
  }

  // Check aliases
  return CHEQUE_COLUMN_ALIASES[normalized] || null;
}

/**
 * Build column mapping from header row
 */
function buildColumnMapping(headers: string[]): Map<number, keyof Cheque> {
  const mapping = new Map<number, keyof Cheque>();

  headers.forEach((header, index) => {
    const normalizedField = normalizeColumnName(header);
    if (normalizedField) {
      mapping.set(index, normalizedField);
    }
  });

  return mapping;
}

// ============================================
// VALUE PARSING
// ============================================

/**
 * Parse a numeric value, returning 0 for invalid/empty
 */
function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  const parsed = parseFloat(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse a boolean value (0/1)
 */
function parseBoolean(value: string | undefined): boolean {
  if (!value || value.trim() === '') return false;
  return value.trim() === '1' || value.toLowerCase() === 'true';
}

/**
 * Parse a date value
 */
function parseDate(value: string | undefined): string {
  if (!value || value.trim() === '') return '';

  // Try to parse various date formats
  const trimmed = value.trim();

  // Already in ISO format or similar
  if (VALIDATION_RULES.DATE_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Try to parse as Date
  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Invalid date
  }

  return trimmed; // Return as-is if can't parse
}

// ============================================
// ROW PARSING
// ============================================

/**
 * Parse a single row into a Cheque object
 */
function parseRow(
  values: string[],
  columnMapping: Map<number, keyof Cheque>,
  rowNumber: number,
  errors: ChequeImportError[]
): Cheque | null {
  const cheque: Partial<Cheque> = {};
  let hasRequiredFields = true;

  // Map each value to its field
  values.forEach((value, index) => {
    const field = columnMapping.get(index);
    if (!field) return;

    switch (field) {
      // String fields
      case 'numeroFranquicia':
        cheque.numeroFranquicia = value.trim();
        break;

      // Integer fields
      case 'turnoId':
        cheque.turnoId = parseInt(value) || 0;
        if (!VALIDATION_RULES.VALID_SHIFTS.includes(cheque.turnoId)) {
          errors.push({
            row: rowNumber,
            column: 'turno_id',
            value,
            message: `Invalid shift value: ${value}. Expected 1, 2, or 3.`,
            severity: 'warning',
          });
        }
        break;
      case 'folio':
        cheque.folio = parseInt(value) || 0;
        break;
      case 'numeroCheque':
        cheque.numeroCheque = parseInt(value) || 0;
        break;
      case 'numeroPersonas':
        cheque.numeroPersonas = parseInt(value) || 0;
        break;
      case 'meseroId':
        cheque.meseroId = parseInt(value) || 0;
        break;
      case 'totalArticulos':
        cheque.totalArticulos = parseInt(value) || 0;
        break;

      // Boolean fields
      case 'pagado':
        cheque.pagado = parseBoolean(value);
        break;
      case 'cancelado':
        cheque.cancelado = parseBoolean(value);
        break;

      // Date fields
      case 'fecha':
        cheque.fecha = parseDate(value);
        break;
      case 'cierre':
        cheque.cierre = parseDate(value);
        break;

      // Numeric (currency) fields
      case 'total':
      case 'efectivo':
      case 'tarjeta':
      case 'propina':
      case 'descuento':
      case 'subtotal':
      case 'subtotalConDescuento':
      case 'totalImpuesto':
      case 'totalDescuentos':
      case 'totalCortesias':
      case 'totalAlimentos':
      case 'totalBebidas':
        const numValue = parseNumber(value);
        cheque[field] = Math.round(numValue * 100) / 100; // Round to 2 decimals
        break;
    }
  });

  // Validate required fields
  if (!cheque.numeroFranquicia) {
    errors.push({
      row: rowNumber,
      column: 'numero_franquicia',
      message: 'Missing location ID',
      severity: 'error',
    });
    hasRequiredFields = false;
  }

  if (!cheque.fecha) {
    errors.push({
      row: rowNumber,
      column: 'fecha',
      message: 'Missing date',
      severity: 'error',
    });
    hasRequiredFields = false;
  }

  // Validate non-negative amounts
  for (const field of VALIDATION_RULES.NON_NEGATIVE_FIELDS) {
    const value = cheque[field as keyof Cheque];
    if (typeof value === 'number' && value < 0) {
      errors.push({
        row: rowNumber,
        column: field,
        value: String(value),
        message: `Negative value for ${field}: ${value}`,
        severity: 'warning',
      });
    }
  }

  if (!hasRequiredFields) {
    return null;
  }

  // Fill in defaults for missing fields
  return {
    numeroFranquicia: cheque.numeroFranquicia || '',
    turnoId: cheque.turnoId || 1,
    folio: cheque.folio || 0,
    numeroCheque: cheque.numeroCheque || 0,
    fecha: cheque.fecha || '',
    cierre: cheque.cierre || cheque.fecha || '',
    numeroPersonas: cheque.numeroPersonas || 0,
    meseroId: cheque.meseroId || 0,
    pagado: cheque.pagado ?? false,
    cancelado: cheque.cancelado ?? false,
    totalArticulos: cheque.totalArticulos || 0,
    total: cheque.total || 0,
    efectivo: cheque.efectivo || 0,
    tarjeta: cheque.tarjeta || 0,
    propina: cheque.propina || 0,
    descuento: cheque.descuento || 0,
    subtotal: cheque.subtotal || 0,
    subtotalConDescuento: cheque.subtotalConDescuento || 0,
    totalImpuesto: cheque.totalImpuesto || 0,
    totalDescuentos: cheque.totalDescuentos || 0,
    totalCortesias: cheque.totalCortesias || 0,
    totalAlimentos: cheque.totalAlimentos || 0,
    totalBebidas: cheque.totalBebidas || 0,
  };
}

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse a cheque file (tab-delimited text)
 */
export function parseChequeFile(content: string, fileName: string): ChequeParseResult {
  const cheques: Cheque[] = [];
  const errors: ChequeImportError[] = [];

  // Split into lines
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length === 0) {
    errors.push({
      row: 0,
      message: 'Empty file',
      severity: 'error',
    });
    return {
      cheques: [],
      errors,
      metadata: {
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        dateRange: { start: '', end: '' },
        locations: [],
        staff: [],
        shifts: [],
        totalRevenue: 0,
      },
    };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = headerLine.split('\t').map(h => h.trim());

  // Validate column count
  if (headers.length < CHEQUE_COLUMN_COUNT) {
    errors.push({
      row: 1,
      message: `Expected ${CHEQUE_COLUMN_COUNT} columns, found ${headers.length}`,
      severity: 'warning',
    });
  }

  // Build column mapping
  const columnMapping = buildColumnMapping(headers);

  if (columnMapping.size === 0) {
    errors.push({
      row: 1,
      message: 'Could not map any columns. Check column names.',
      severity: 'error',
    });
    return {
      cheques: [],
      errors,
      metadata: {
        totalRows: lines.length - 1,
        validRows: 0,
        errorRows: lines.length - 1,
        dateRange: { start: '', end: '' },
        locations: [],
        staff: [],
        shifts: [],
        totalRevenue: 0,
      },
    };
  }

  // Parse data rows
  const locations = new Set<string>();
  const staff = new Set<number>();
  const shifts = new Set<number>();
  let minDate = '';
  let maxDate = '';
  let totalRevenue = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split('\t');
    const cheque = parseRow(values, columnMapping, i + 1, errors);

    if (cheque) {
      cheques.push(cheque);

      // Collect metadata
      locations.add(cheque.numeroFranquicia);
      staff.add(cheque.meseroId);
      shifts.add(cheque.turnoId);

      // Track date range
      if (cheque.fecha) {
        if (!minDate || cheque.fecha < minDate) minDate = cheque.fecha;
        if (!maxDate || cheque.fecha > maxDate) maxDate = cheque.fecha;
      }

      // Sum revenue (only paid, non-cancelled)
      if (cheque.pagado && !cheque.cancelado) {
        totalRevenue += cheque.total;
      }
    }
  }

  const totalRows = lines.length - 1; // Exclude header
  const validRows = cheques.length;
  const errorRows = totalRows - validRows;

  return {
    cheques,
    errors,
    metadata: {
      totalRows,
      validRows,
      errorRows,
      dateRange: { start: minDate, end: maxDate },
      locations: Array.from(locations).sort(),
      staff: Array.from(staff).sort((a, b) => a - b),
      shifts: Array.from(shifts).sort((a, b) => a - b),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    },
  };
}

/**
 * Parse multiple cheque files
 */
export function parseChequeFiles(
  files: Array<{ content: string; fileName: string }>
): ChequeParseResult {
  const allCheques: Cheque[] = [];
  const allErrors: ChequeImportError[] = [];

  const locations = new Set<string>();
  const staff = new Set<number>();
  const shifts = new Set<number>();
  let minDate = '';
  let maxDate = '';
  let totalRevenue = 0;
  let totalRows = 0;
  let validRows = 0;

  for (const file of files) {
    const result = parseChequeFile(file.content, file.fileName);

    allCheques.push(...result.cheques);
    allErrors.push(...result.errors.map(e => ({
      ...e,
      message: `[${file.fileName}] ${e.message}`,
    })));

    result.metadata.locations.forEach(l => locations.add(l));
    result.metadata.staff.forEach(s => staff.add(s));
    result.metadata.shifts.forEach(s => shifts.add(s));

    if (result.metadata.dateRange.start) {
      if (!minDate || result.metadata.dateRange.start < minDate) {
        minDate = result.metadata.dateRange.start;
      }
    }
    if (result.metadata.dateRange.end) {
      if (!maxDate || result.metadata.dateRange.end > maxDate) {
        maxDate = result.metadata.dateRange.end;
      }
    }

    totalRevenue += result.metadata.totalRevenue;
    totalRows += result.metadata.totalRows;
    validRows += result.metadata.validRows;
  }

  return {
    cheques: allCheques,
    errors: allErrors,
    metadata: {
      totalRows,
      validRows,
      errorRows: totalRows - validRows,
      dateRange: { start: minDate, end: maxDate },
      locations: Array.from(locations).sort(),
      staff: Array.from(staff).sort((a, b) => a - b),
      shifts: Array.from(shifts).sort((a, b) => a - b),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    },
  };
}
