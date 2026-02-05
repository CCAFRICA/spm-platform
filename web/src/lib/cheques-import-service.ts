/**
 * Cheques Import Service - TSV file parsing and validation for RestaurantMX
 */

import type { Cheque } from '@/types/cheques';
import { CHEQUE_FIELDS } from '@/types/cheques';
import { importCheques } from './restaurant-service';

/**
 * Validation error for import
 */
export interface ImportValidationError {
  row: number;
  column: string;
  value: string;
  message: string;
  messageEs: string;
  severity: 'error' | 'warning';
}

/**
 * Preview of import data before committing
 */
export interface ImportPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportValidationError[];
  warnings: ImportValidationError[];
  sampleData: Partial<Cheque>[];
  detectedColumns: string[];
  missingColumns: string[];
}

/**
 * Result of import execution
 */
export interface ImportResult {
  success: boolean;
  fileName: string;
  totalRows: number;
  importedRows: number;
  errorRows: number;
  errors: ImportValidationError[];
  importedAt: string;
}

/**
 * Parse TSV content into headers and rows
 */
export function parseTSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split('\t').map(h => h.trim());
  const rows = lines.slice(1).map(line => line.split('\t').map(cell => cell.trim()));

  return { headers, rows };
}

/**
 * Parse a single row into a Cheque object
 */
function parseRowToCheque(row: string[], headers: string[]): Partial<Cheque> {
  const cheque: Partial<Cheque> = {};

  headers.forEach((header, index) => {
    const field = CHEQUE_FIELDS.find(f => f.key === header);
    if (!field || row[index] === undefined) return;

    const value = row[index];

    if (field.type === 'number' || field.type === 'boolean') {
      (cheque as Record<string, unknown>)[field.key] = parseInt(value, 10) || 0;
    } else if (field.type === 'currency') {
      (cheque as Record<string, unknown>)[field.key] = parseFloat(value) || 0;
    } else {
      (cheque as Record<string, unknown>)[field.key] = value;
    }
  });

  return cheque;
}

/**
 * Validate a single row
 */
function validateRow(
  row: string[],
  headers: string[],
  rowIndex: number
): ImportValidationError[] {
  const errors: ImportValidationError[] = [];

  headers.forEach((header, colIndex) => {
    const field = CHEQUE_FIELDS.find(f => f.key === header);
    if (!field) return;

    const value = row[colIndex] || '';

    // Check required fields
    if (field.required && !value) {
      errors.push({
        row: rowIndex + 1,
        column: field.key,
        value: '(empty)',
        message: `${field.label} is required`,
        messageEs: `${field.labelEs} es requerido`,
        severity: 'error',
      });
    }

    // Check numeric fields
    if (value && (field.type === 'number' || field.type === 'currency')) {
      if (isNaN(parseFloat(value))) {
        errors.push({
          row: rowIndex + 1,
          column: field.key,
          value,
          message: `${field.label} must be a number`,
          messageEs: `${field.labelEs} debe ser un número`,
          severity: 'error',
        });
      }
    }

    // Check boolean fields (should be 0 or 1)
    if (value && field.type === 'boolean') {
      const intVal = parseInt(value, 10);
      if (isNaN(intVal) || (intVal !== 0 && intVal !== 1)) {
        errors.push({
          row: rowIndex + 1,
          column: field.key,
          value,
          message: `${field.label} must be 0 or 1`,
          messageEs: `${field.labelEs} debe ser 0 o 1`,
          severity: 'error',
        });
      }
    }
  });

  return errors;
}

/**
 * Validate import data and return preview
 */
export function validateImportData(content: string, fileName: string): ImportPreview {
  const { headers, rows } = parseTSV(content);

  const errors: ImportValidationError[] = [];
  const warnings: ImportValidationError[] = [];
  const sampleData: Partial<Cheque>[] = [];
  let validRows = 0;
  let errorRows = 0;

  // Check for required columns
  const requiredFields = CHEQUE_FIELDS.filter(f => f.required);
  const missingColumns = requiredFields
    .filter(f => !headers.includes(f.key))
    .map(f => f.key);

  // Detect which columns are present
  const detectedColumns = headers.filter(h =>
    CHEQUE_FIELDS.some(f => f.key === h)
  );

  // If critical columns missing, add error
  if (missingColumns.length > 0) {
    missingColumns.forEach(col => {
      const field = CHEQUE_FIELDS.find(f => f.key === col);
      if (field) {
        errors.push({
          row: 0,
          column: col,
          value: '(missing)',
          message: `Missing required column: ${field.label}`,
          messageEs: `Columna requerida faltante: ${field.labelEs}`,
          severity: 'error',
        });
      }
    });
  }

  // Validate each row
  rows.forEach((row, rowIndex) => {
    const rowErrors = validateRow(row, headers, rowIndex);

    if (rowErrors.length > 0) {
      errorRows++;
      errors.push(...rowErrors);
    } else {
      validRows++;
      if (sampleData.length < 5) {
        sampleData.push(parseRowToCheque(row, headers));
      }
    }
  });

  // Limit errors returned to prevent huge payloads
  const limitedErrors = errors.slice(0, 50);
  const limitedWarnings = warnings.slice(0, 20);

  return {
    fileName,
    totalRows: rows.length,
    validRows,
    errorRows,
    errors: limitedErrors,
    warnings: limitedWarnings,
    sampleData,
    detectedColumns,
    missingColumns,
  };
}

/**
 * Execute the import after validation
 */
export async function executeImport(content: string, fileName: string): Promise<ImportResult> {
  const preview = validateImportData(content, fileName);

  // Don't import if there are critical errors
  if (preview.missingColumns.length > 0) {
    return {
      success: false,
      fileName,
      totalRows: preview.totalRows,
      importedRows: 0,
      errorRows: preview.totalRows,
      errors: preview.errors,
      importedAt: new Date().toISOString(),
    };
  }

  // If there are row-level errors, only import valid rows
  const { headers, rows } = parseTSV(content);

  const validCheques: Cheque[] = [];
  const rowErrors: ImportValidationError[] = [];

  rows.forEach((row, rowIndex) => {
    const errors = validateRow(row, headers, rowIndex);
    if (errors.length === 0) {
      const cheque = parseRowToCheque(row, headers);
      // Only add if we have the minimum required data
      if (cheque.numero_franquicia && cheque.numero_cheque !== undefined) {
        validCheques.push(cheque as Cheque);
      }
    } else {
      rowErrors.push(...errors);
    }
  });

  if (validCheques.length === 0) {
    return {
      success: false,
      fileName,
      totalRows: preview.totalRows,
      importedRows: 0,
      errorRows: preview.errorRows,
      errors: rowErrors.slice(0, 50),
      importedAt: new Date().toISOString(),
    };
  }

  // Import valid cheques
  await importCheques(validCheques);

  return {
    success: true,
    fileName,
    totalRows: preview.totalRows,
    importedRows: validCheques.length,
    errorRows: preview.errorRows,
    errors: rowErrors.slice(0, 50),
    importedAt: new Date().toISOString(),
  };
}

/**
 * Generate a template TSV header row
 */
export function generateTemplate(): string {
  return CHEQUE_FIELDS.map(f => f.key).join('\t');
}

/**
 * Generate sample data for testing
 */
export function generateSampleData(count: number = 10): string {
  const headers = generateTemplate();
  const rows: string[] = [];

  const franchises = ['MX-GDL-001', 'MX-GDL-002', 'MX-MTY-001', 'MX-MTY-002', 'MX-CDMX-001', 'MX-CDMX-002', 'MX-CDMX-003'];
  const meseroIds = [1001, 1002, 2001, 2002, 3001, 3002, 5001, 5002, 6001, 7001];

  for (let i = 0; i < count; i++) {
    const franquicia = franchises[i % franchises.length];
    const turnoId = (i % 3) + 1;
    const meseroId = meseroIds[i % meseroIds.length];
    const total = Math.round((200 + Math.random() * 800) * 100) / 100;
    const propina = Math.round(total * 0.15 * 100) / 100;
    const subtotal = Math.round(total / 1.16 * 100) / 100;
    const impuesto = Math.round((total - subtotal) * 100) / 100;
    const alimentos = Math.round(total * 0.7 * 100) / 100;
    const bebidas = Math.round(total * 0.3 * 100) / 100;

    const row = [
      franquicia,                    // numero_franquicia
      turnoId.toString(),            // turno_id
      (1000 + i).toString(),         // folio
      (5000 + i).toString(),         // numero_cheque
      '2024-12-15 12:30:00',         // fecha
      '2024-12-15 13:45:00',         // cierre
      (2 + (i % 4)).toString(),      // numero_de_personas
      meseroId.toString(),           // mesero_id
      '1',                           // pagado
      '0',                           // cancelado
      (5 + (i % 10)).toString(),     // total_articulos
      total.toFixed(2),              // total
      (total * 0.4).toFixed(2),      // efectivo
      (total * 0.6).toFixed(2),      // tarjeta
      propina.toFixed(2),            // propina
      '0',                           // descuento
      subtotal.toFixed(2),           // subtotal
      subtotal.toFixed(2),           // subtotal_con_descuento
      impuesto.toFixed(2),           // total_impuesto
      '0.00',                        // total_descuentos
      '0.00',                        // total_cortesias
      alimentos.toFixed(2),          // total_alimentos
      bebidas.toFixed(2),            // total_bebidas
    ];

    rows.push(row.join('\t'));
  }

  return [headers, ...rows].join('\n');
}
