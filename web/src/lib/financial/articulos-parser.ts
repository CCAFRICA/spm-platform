/**
 * Articulos Parser
 *
 * Parses tab-delimited POS item-level export files (articulos_YYYYMMDD.TXT).
 * 12-column format: each row is one line item within a cheque.
 * Supports SoftRestaurant and ICG column name aliases.
 *
 * Key field: DESCRIPCION -- the raw product description that feeds
 * into the normalization engine for product name standardization.
 */

import type { Articulo, ChequeImportError } from './types';
import { ARTICULO_COLUMN_ALIASES } from './types';
import { ARTICULO_COLUMNS, ARTICULO_COLUMN_COUNT } from './financial-constants';

// =============================================================================
// TYPES
// =============================================================================

export interface ArticuloParseResult {
  articulos: Articulo[];
  errors: ChequeImportError[];
  metadata: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    dateRange: { start: string; end: string };
    locations: string[];
    cheques: number[];
    uniqueProducts: number;
    uniqueGroups: string[];
    totalImporte: number;
  };
}

// =============================================================================
// COLUMN NORMALIZATION
// =============================================================================

function normalizeColumnName(column: string): keyof Articulo | null {
  const normalized = column.toLowerCase().trim().replace(/\s+/g, '_');

  if (ARTICULO_COLUMNS.includes(normalized as (typeof ARTICULO_COLUMNS)[number])) {
    return ARTICULO_COLUMN_ALIASES[normalized] || null;
  }

  return ARTICULO_COLUMN_ALIASES[normalized] || null;
}

function buildColumnMapping(headers: string[]): Map<number, keyof Articulo> {
  const mapping = new Map<number, keyof Articulo>();

  headers.forEach((header, index) => {
    const normalizedField = normalizeColumnName(header);
    if (normalizedField) {
      mapping.set(index, normalizedField);
    }
  });

  return mapping;
}

// =============================================================================
// VALUE PARSING
// =============================================================================

function parseNumber(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  const parsed = parseFloat(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

function parseDate(value: string | undefined): string {
  if (!value || value.trim() === '') return '';
  const trimmed = value.trim();

  // Already ISO or standard date
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed;
  }

  try {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Invalid date
  }

  return trimmed;
}

// =============================================================================
// ROW PARSING
// =============================================================================

function parseRow(
  values: string[],
  columnMapping: Map<number, keyof Articulo>,
  rowNumber: number,
  errors: ChequeImportError[]
): Articulo | null {
  const articulo: Partial<Articulo> = {};
  let hasRequiredFields = true;

  values.forEach((value, index) => {
    const field = columnMapping.get(index);
    if (!field) return;

    switch (field) {
      // String fields
      case 'numeroFranquicia':
        articulo.numeroFranquicia = value.trim();
        break;
      case 'descripcion':
        articulo.descripcion = value.trim();
        break;
      case 'grupo':
        articulo.grupo = value.trim();
        break;

      // Date fields
      case 'fecha':
        articulo.fecha = parseDate(value);
        break;

      // Integer fields
      case 'numeroCheque':
        articulo.numeroCheque = parseInt(value) || 0;
        break;
      case 'folioArticulo':
        articulo.folioArticulo = parseInt(value) || 0;
        break;
      case 'meseroId':
        articulo.meseroId = parseInt(value) || 0;
        break;
      case 'articuloId':
        articulo.articuloId = parseInt(value) || 0;
        break;

      // Numeric (currency/quantity) fields
      case 'cantidad':
        articulo.cantidad = parseNumber(value);
        break;
      case 'precioUnitario':
        articulo.precioUnitario = Math.round(parseNumber(value) * 100) / 100;
        break;
      case 'importe':
        articulo.importe = Math.round(parseNumber(value) * 100) / 100;
        break;
      case 'descuento':
        articulo.descuento = Math.round(parseNumber(value) * 100) / 100;
        break;
    }
  });

  // Validate required fields
  if (!articulo.numeroFranquicia) {
    errors.push({
      row: rowNumber,
      column: 'numero_franquicia',
      message: 'Missing location ID',
      severity: 'error',
    });
    hasRequiredFields = false;
  }

  if (!articulo.descripcion) {
    errors.push({
      row: rowNumber,
      column: 'descripcion',
      message: 'Missing product description',
      severity: 'error',
    });
    hasRequiredFields = false;
  }

  // Validate amounts
  if (articulo.importe !== undefined && articulo.importe < 0) {
    errors.push({
      row: rowNumber,
      column: 'importe',
      value: String(articulo.importe),
      message: `Negative line total: ${articulo.importe}`,
      severity: 'warning',
    });
  }

  if (!hasRequiredFields) {
    return null;
  }

  return {
    numeroFranquicia: articulo.numeroFranquicia || '',
    numeroCheque: articulo.numeroCheque || 0,
    folioArticulo: articulo.folioArticulo || 0,
    fecha: articulo.fecha || '',
    meseroId: articulo.meseroId || 0,
    articuloId: articulo.articuloId || 0,
    descripcion: articulo.descripcion || '',
    grupo: articulo.grupo || '',
    cantidad: articulo.cantidad || 0,
    precioUnitario: articulo.precioUnitario || 0,
    importe: articulo.importe || 0,
    descuento: articulo.descuento || 0,
  };
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parse an articulos file (tab-delimited text, 12 columns)
 */
export function parseArticulosFile(content: string, fileName: string): ArticuloParseResult {
  const articulos: Articulo[] = [];
  const errors: ChequeImportError[] = [];

  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length === 0) {
    errors.push({
      row: 0,
      message: `Empty file: ${fileName}`,
      severity: 'error',
    });
    return {
      articulos: [],
      errors,
      metadata: {
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        dateRange: { start: '', end: '' },
        locations: [],
        cheques: [],
        uniqueProducts: 0,
        uniqueGroups: [],
        totalImporte: 0,
      },
    };
  }

  // Parse header row
  const headers = lines[0].split('\t').map(h => h.trim());

  if (headers.length < ARTICULO_COLUMN_COUNT) {
    errors.push({
      row: 1,
      message: `Expected ${ARTICULO_COLUMN_COUNT} columns, found ${headers.length}`,
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
      articulos: [],
      errors,
      metadata: {
        totalRows: lines.length - 1,
        validRows: 0,
        errorRows: lines.length - 1,
        dateRange: { start: '', end: '' },
        locations: [],
        cheques: [],
        uniqueProducts: 0,
        uniqueGroups: [],
        totalImporte: 0,
      },
    };
  }

  // Parse data rows
  const locations = new Set<string>();
  const cheques = new Set<number>();
  const products = new Set<string>();
  const groups = new Set<string>();
  let minDate = '';
  let maxDate = '';
  let totalImporte = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split('\t');
    const articulo = parseRow(values, columnMapping, i + 1, errors);

    if (articulo) {
      articulos.push(articulo);

      locations.add(articulo.numeroFranquicia);
      cheques.add(articulo.numeroCheque);
      if (articulo.descripcion) products.add(articulo.descripcion.toLowerCase());
      if (articulo.grupo) groups.add(articulo.grupo);

      if (articulo.fecha) {
        if (!minDate || articulo.fecha < minDate) minDate = articulo.fecha;
        if (!maxDate || articulo.fecha > maxDate) maxDate = articulo.fecha;
      }

      totalImporte += articulo.importe;
    }
  }

  return {
    articulos,
    errors,
    metadata: {
      totalRows: lines.length - 1,
      validRows: articulos.length,
      errorRows: (lines.length - 1) - articulos.length,
      dateRange: { start: minDate, end: maxDate },
      locations: Array.from(locations).sort(),
      cheques: Array.from(cheques).sort((a, b) => a - b),
      uniqueProducts: products.size,
      uniqueGroups: Array.from(groups).sort(),
      totalImporte: Math.round(totalImporte * 100) / 100,
    },
  };
}

/**
 * Convert articulos to TSV format for export/transport
 */
export function articulosToTSV(articulos: Articulo[]): string {
  const headers = [
    'NUMERO_FRANQUICIA',
    'NUMERO_CHEQUE',
    'FOLIO_ARTICULO',
    'FECHA',
    'MESERO_ID',
    'ARTICULO_ID',
    'DESCRIPCION',
    'GRUPO',
    'CANTIDAD',
    'PRECIO_UNITARIO',
    'IMPORTE',
    'DESCUENTO',
  ];

  const rows = articulos.map((a) =>
    [
      a.numeroFranquicia,
      a.numeroCheque,
      a.folioArticulo,
      a.fecha,
      a.meseroId,
      a.articuloId,
      a.descripcion,
      a.grupo,
      a.cantidad,
      a.precioUnitario.toFixed(2),
      a.importe.toFixed(2),
      a.descuento.toFixed(2),
    ].join('\t')
  );

  return [headers.join('\t'), ...rows].join('\n');
}

/**
 * Extract unique raw product descriptions from articulos.
 * These feed into the normalization engine.
 */
export function extractRawDescriptions(articulos: Articulo[]): string[] {
  const descriptions = new Set<string>();
  for (const a of articulos) {
    if (a.descripcion) descriptions.add(a.descripcion);
  }
  return Array.from(descriptions).sort();
}

/**
 * Group articulos by cheque number for reconciliation with cheque data.
 */
export function groupByCheque(articulos: Articulo[]): Map<number, Articulo[]> {
  const groups = new Map<number, Articulo[]>();
  for (const a of articulos) {
    const existing = groups.get(a.numeroCheque);
    if (existing) {
      existing.push(a);
    } else {
      groups.set(a.numeroCheque, [a]);
    }
  }
  return groups;
}
