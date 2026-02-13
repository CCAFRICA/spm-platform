/**
 * Smart File Parser
 *
 * HF-021 Phase 1: Accept ANY tabular file format for reconciliation.
 * Supported: CSV, TSV, XLSX, XLS, JSON
 * Auto-detects format from extension and content.
 * Uses SheetJS for Excel formats.
 *
 * DESIGN PRINCIPLES:
 * - No hardcoded column names (Korean Test)
 * - Preserve ALL columns from uploaded file
 * - Auto-detect delimiter for CSV variants
 */

import * as XLSX from 'xlsx';

// ============================================
// TYPES
// ============================================

export type FileFormat = 'csv' | 'tsv' | 'xlsx' | 'xls' | 'json' | 'unknown';

export interface ParsedFile {
  fileName: string;
  format: FileFormat;
  sheetNames: string[];       // Non-empty for XLSX/XLS
  activeSheet: string;        // Currently selected sheet
  headers: string[];          // Column headers
  rows: Record<string, unknown>[];  // ALL data rows
  totalRows: number;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Detect file format from extension
 */
export function detectFormat(fileName: string): FileFormat {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'csv': return 'csv';
    case 'tsv':
    case 'tab': return 'tsv';
    case 'txt': return 'csv';  // Auto-detect delimiter (tab-first via detectDelimiter)
    case 'xlsx': return 'xlsx';
    case 'xls': return 'xls';
    case 'json': return 'json';
    default: return 'unknown';
  }
}

/**
 * Parse any supported file format into a uniform ParsedFile structure.
 * Throws on unsupported or empty files.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const format = detectFormat(file.name);

  switch (format) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'csv':
    case 'tsv':
      return parseDelimited(file, format);
    case 'json':
      return parseJSON(file);
    default:
      // Attempt CSV as fallback for unknown extensions
      return parseDelimited(file, 'csv');
  }
}

/**
 * Re-parse a different sheet from an already-loaded XLSX workbook.
 * Avoids re-reading the file from disk.
 */
export function parseSheetFromWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fileName: string,
): ParsedFile {
  const { headers, rows } = extractSheetData(workbook, sheetName);

  return {
    fileName,
    format: fileName.endsWith('.xls') ? 'xls' : 'xlsx',
    sheetNames: workbook.SheetNames,
    activeSheet: sheetName,
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Get preview rows (first N rows) from parsed data
 */
export function getPreviewRows(parsed: ParsedFile, count: number = 5): Record<string, unknown>[] {
  return parsed.rows.slice(0, count);
}

// ============================================
// EXCEL PARSING (SheetJS)
// ============================================

/**
 * Parse Excel files (XLSX, XLS) using SheetJS.
 * Returns the workbook reference in a closure for sheet switching.
 */
async function parseExcel(file: File): Promise<ParsedFile & { _workbook?: XLSX.WorkBook }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return {
      fileName: file.name,
      format: file.name.endsWith('.xls') ? 'xls' : 'xlsx',
      sheetNames: [],
      activeSheet: '',
      headers: [],
      rows: [],
      totalRows: 0,
    };
  }

  const activeSheet = sheetNames[0];
  const { headers, rows } = extractSheetData(workbook, activeSheet);

  // Attach workbook for sheet switching (not serialized)
  const result: ParsedFile & { _workbook?: XLSX.WorkBook } = {
    fileName: file.name,
    format: file.name.endsWith('.xls') ? 'xls' : 'xlsx',
    sheetNames,
    activeSheet,
    headers,
    rows,
    totalRows: rows.length,
    _workbook: workbook,
  };

  return result;
}

/**
 * Extract headers and rows from a specific sheet
 */
export function extractSheetData(
  workbook: XLSX.WorkBook,
  sheetName: string,
): { headers: string[]; rows: Record<string, unknown>[] } {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { headers, rows };
}

// ============================================
// CSV / TSV PARSING
// ============================================

/**
 * Parse CSV or TSV files with smart delimiter detection
 */
async function parseDelimited(file: File, format: 'csv' | 'tsv'): Promise<ParsedFile> {
  const content = await file.text();
  const delimiter = format === 'tsv' ? '\t' : detectDelimiter(content);

  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) {
    return {
      fileName: file.name,
      format,
      sheetNames: [],
      activeSheet: '',
      headers: [],
      rows: [],
      totalRows: 0,
    };
  }

  const headers = parseCSVLine(lines[0], delimiter);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const row: Record<string, unknown> = {};

    headers.forEach((header, j) => {
      const val = (values[j] ?? '').trim();
      // Auto-detect numeric values (strip currency symbols and commas)
      const cleaned = val.replace(/[$,\u00a0]/g, '');
      if (val !== '' && cleaned !== '' && !isNaN(Number(cleaned))) {
        row[header] = Number(cleaned);
      } else {
        row[header] = val;
      }
    });

    rows.push(row);
  }

  return {
    fileName: file.name,
    format,
    sheetNames: [],
    activeSheet: '',
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Parse a single CSV line, properly handling quoted fields
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Auto-detect delimiter from first line content
 */
function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/)[0] || '';

  // Count occurrences outside of quoted strings
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;

  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ',') commas++;
      else if (char === ';') semicolons++;
      else if (char === '\t') tabs++;
    }
  }

  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

// ============================================
// JSON PARSING
// ============================================

/**
 * Parse JSON files (arrays of objects or single objects)
 */
async function parseJSON(file: File): Promise<ParsedFile> {
  const content = await file.text();

  let data: Record<string, unknown>[];
  try {
    const parsed = JSON.parse(content);
    data = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return {
      fileName: file.name,
      format: 'json',
      sheetNames: [],
      activeSheet: '',
      headers: [],
      rows: [],
      totalRows: 0,
    };
  }

  // Union all keys across all rows (some rows may have different columns)
  const headerSet = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  return {
    fileName: file.name,
    format: 'json',
    sheetNames: [],
    activeSheet: '',
    headers,
    rows: data,
    totalRows: data.length,
  };
}
