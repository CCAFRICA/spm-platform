import { audit } from './audit-service';

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date' | 'currency';
  example?: string;
}

export const TRANSACTION_FIELDS: ImportField[] = [
  { key: 'orderId', label: 'Order ID', required: true, type: 'string', example: 'ORD-2024-00001' },
  { key: 'date', label: 'Date', required: true, type: 'date', example: '2024-01-15' },
  { key: 'customerName', label: 'Customer Name', required: true, type: 'string', example: 'Acme Corp' },
  { key: 'productName', label: 'Product Name', required: true, type: 'string', example: 'Enterprise Suite' },
  { key: 'salesRepName', label: 'Sales Rep', required: true, type: 'string', example: 'Sarah Chen' },
  { key: 'amount', label: 'Amount', required: true, type: 'currency', example: '50000' },
  { key: 'region', label: 'Region', required: false, type: 'string', example: 'West' },
  { key: 'status', label: 'Status', required: false, type: 'string', example: 'completed' },
];

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string | null;
}

export interface ValidationError {
  row: number;
  column: string;
  value: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  errors: ValidationError[];
  sampleData: Record<string, string>[];
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ValidationError[];
}

/**
 * Parse CSV content into rows
 */
export function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);

  return { headers, rows };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Auto-detect column mappings based on header names
 */
export function autoDetectMappings(
  headers: string[],
  targetFields: ImportField[]
): ColumnMapping[] {
  return headers.map((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try to find a matching field
    const match = targetFields.find((field) => {
      const fieldNormalized = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
      const keyNormalized = field.key.toLowerCase();

      return (
        normalized === fieldNormalized ||
        normalized === keyNormalized ||
        normalized.includes(fieldNormalized) ||
        fieldNormalized.includes(normalized)
      );
    });

    return {
      sourceColumn: header,
      targetField: match?.key || null,
    };
  });
}

/**
 * Validate import data
 */
export function validateImportData(
  rows: string[][],
  headers: string[],
  mappings: ColumnMapping[],
  targetFields: ImportField[]
): ImportPreview {
  const errors: ValidationError[] = [];
  const sampleData: Record<string, string>[] = [];

  // Check required fields are mapped
  const mappedFields = mappings
    .filter((m) => m.targetField)
    .map((m) => m.targetField!);

  for (const field of targetFields) {
    if (field.required && !mappedFields.includes(field.key)) {
      errors.push({
        row: 0,
        column: field.key,
        value: '',
        message: `Required field "${field.label}" is not mapped`,
        severity: 'error',
      });
    }
  }

  // Validate each row
  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;

  rows.forEach((row, rowIndex) => {
    let rowHasError = false;
    let rowHasWarning = false;
    const rowData: Record<string, string> = {};

    mappings.forEach((mapping, colIndex) => {
      if (!mapping.targetField) return;

      const value = row[colIndex] || '';
      const field = targetFields.find((f) => f.key === mapping.targetField);

      rowData[mapping.targetField] = value;

      if (field) {
        // Check required
        if (field.required && !value.trim()) {
          errors.push({
            row: rowIndex + 2, // +2 for header and 1-based
            column: field.label,
            value,
            message: `Required field "${field.label}" is empty`,
            severity: 'error',
          });
          rowHasError = true;
        }

        // Type validation
        if (value.trim()) {
          if (field.type === 'number' || field.type === 'currency') {
            const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
            if (isNaN(num)) {
              errors.push({
                row: rowIndex + 2,
                column: field.label,
                value,
                message: `Invalid number format for "${field.label}"`,
                severity: 'error',
              });
              rowHasError = true;
            }
          }

          if (field.type === 'date') {
            const date = new Date(value);
            if (isNaN(date.getTime())) {
              errors.push({
                row: rowIndex + 2,
                column: field.label,
                value,
                message: `Invalid date format for "${field.label}"`,
                severity: 'warning',
              });
              rowHasWarning = true;
            }
          }
        }
      }
    });

    if (rowHasError) {
      errorRows++;
    } else if (rowHasWarning) {
      warningRows++;
      validRows++;
    } else {
      validRows++;
    }

    // Collect sample data (first 5 rows)
    if (sampleData.length < 5) {
      sampleData.push(rowData);
    }
  });

  return {
    totalRows: rows.length,
    validRows,
    errorRows,
    warningRows,
    errors: errors.slice(0, 50), // Limit errors shown
    sampleData,
  };
}

/**
 * Execute the import
 */
export async function executeImport(
  rows: string[][],
  mappings: ColumnMapping[],
  targetFields: ImportField[]
): Promise<ImportResult> {
  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 1500));

  const errors: ValidationError[] = [];
  let imported = 0;
  let skipped = 0;

  rows.forEach((row) => {
    const rowData: Record<string, string> = {};
    let hasError = false;

    mappings.forEach((mapping, colIndex) => {
      if (mapping.targetField) {
        rowData[mapping.targetField] = row[colIndex] || '';
      }
    });

    // Check required fields
    for (const field of targetFields) {
      if (field.required && !rowData[field.key]?.trim()) {
        hasError = true;
        break;
      }
    }

    if (hasError) {
      skipped++;
    } else {
      imported++;
    }
  });

  // Log the import
  audit.log({
    action: 'create',
    entityType: 'transaction',
    metadata: {
      type: 'bulk_import',
      imported,
      skipped,
      total: rows.length,
    },
  });

  return {
    success: imported > 0,
    imported,
    skipped,
    errors,
  };
}

/**
 * Generate a sample CSV template
 */
export function generateTemplate(fields: ImportField[]): string {
  const headers = fields.map((f) => f.label);
  const examples = fields.map((f) => f.example || '');

  return [headers.join(','), examples.join(',')].join('\n');
}

/**
 * Download a string as a file
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
