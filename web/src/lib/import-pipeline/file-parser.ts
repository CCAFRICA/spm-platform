/**
 * File Parser
 *
 * Multi-format parser for import files.
 * Supports CSV, TSV, JSON, PPTX with format auto-detection.
 */

import { parsePPTX, isPPTXFile, type SlideContent } from './pptx-parser';

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
  format: 'csv' | 'tsv' | 'json' | 'pptx' | 'unknown';
  rowCount: number;
  metadata: {
    fileName?: string;
    fileSize?: number;
    encoding?: string;
    detectedDelimiter?: string;
  };
  /** Slide content when parsing PPTX files */
  slides?: SlideContent[];
}

export interface ParseOptions {
  delimiter?: string;
  hasHeaders?: boolean;
  trimValues?: boolean;
  skipEmptyRows?: boolean;
  maxRows?: number;
}

const DEFAULT_OPTIONS: ParseOptions = {
  hasHeaders: true,
  trimValues: true,
  skipEmptyRows: true,
};

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse a file and return uniform data structure
 */
export async function parseFile(
  file: File,
  options: ParseOptions = {}
): Promise<ParsedFile> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Check for PPTX files first (binary format)
  if (isPPTXFile(file)) {
    const pptxResult = await parsePPTX(file, mergedOptions);
    return {
      ...pptxResult,
      format: 'pptx',
    };
  }

  const content = await readFileContent(file);
  const format = detectFormat(file.name, content);

  let result: ParsedFile;

  switch (format) {
    case 'csv':
      result = parseCSV(content, mergedOptions);
      break;
    case 'tsv':
      result = parseTSV(content, mergedOptions);
      break;
    case 'json':
      result = parseJSON(content);
      break;
    default:
      // Try to auto-detect delimiter
      result = parseDelimited(content, mergedOptions);
  }

  result.metadata.fileName = file.name;
  result.metadata.fileSize = file.size;

  return result;
}

/**
 * Parse raw content string
 */
export function parseContent(
  content: string,
  format: 'csv' | 'tsv' | 'json',
  options: ParseOptions = {}
): ParsedFile {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  switch (format) {
    case 'csv':
      return parseCSV(content, mergedOptions);
    case 'tsv':
      return parseTSV(content, mergedOptions);
    case 'json':
      return parseJSON(content);
    default:
      return parseDelimited(content, mergedOptions);
  }
}

// ============================================
// FORMAT DETECTION
// ============================================

/**
 * Detect file format from extension and content
 */
function detectFormat(
  fileName: string,
  content: string
): 'csv' | 'tsv' | 'json' | 'unknown' {
  const extension = fileName.split('.').pop()?.toLowerCase();

  // Check extension first
  if (extension === 'csv') return 'csv';
  if (extension === 'tsv') return 'tsv';
  if (extension === 'json') return 'json';

  // Try content inspection
  const trimmed = content.trim();

  // JSON detection
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // Delimiter detection
  const firstLine = trimmed.split('\n')[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  if (tabCount > commaCount && tabCount > 0) return 'tsv';
  if (commaCount > 0) return 'csv';

  return 'unknown';
}

// ============================================
// CSV PARSER
// ============================================

function parseCSV(content: string, options: ParseOptions): ParsedFile {
  return parseDelimited(content, { ...options, delimiter: ',' });
}

// ============================================
// TSV PARSER
// ============================================

function parseTSV(content: string, options: ParseOptions): ParsedFile {
  return parseDelimited(content, { ...options, delimiter: '\t' });
}

// ============================================
// DELIMITED PARSER
// ============================================

function parseDelimited(content: string, options: ParseOptions): ParsedFile {
  const delimiter = options.delimiter || detectDelimiter(content);
  const lines = content.split(/\r?\n/);

  let headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  let startIndex = 0;

  if (options.hasHeaders && lines.length > 0) {
    headers = parseDelimitedLine(lines[0], delimiter, options.trimValues);
    startIndex = 1;
  }

  // If no headers, generate column names
  if (headers.length === 0 && lines.length > 0) {
    const firstRow = parseDelimitedLine(lines[0], delimiter, options.trimValues);
    headers = firstRow.map((_, index) => `Column${index + 1}`);
  }

  const maxRows = options.maxRows || Infinity;

  for (let i = startIndex; i < lines.length && rows.length < maxRows; i++) {
    const line = lines[i];

    if (options.skipEmptyRows && !line.trim()) {
      continue;
    }

    const values = parseDelimitedLine(line, delimiter, options.trimValues);
    const row: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? null;
    });

    rows.push(row);
  }

  return {
    headers,
    rows,
    format: delimiter === ',' ? 'csv' : delimiter === '\t' ? 'tsv' : 'csv',
    rowCount: rows.length,
    metadata: {
      detectedDelimiter: delimiter,
    },
  };
}

function parseDelimitedLine(
  line: string,
  delimiter: string,
  trim?: boolean
): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = false;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(trim ? current.trim() : current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(trim ? current.trim() : current);
  return result;
}

function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0];

  const delimiters = [',', '\t', ';', '|'];
  let maxCount = 0;
  let detected = ',';

  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }

  return detected;
}

// ============================================
// JSON PARSER
// ============================================

function parseJSON(content: string): ParsedFile {
  const trimmed = content.trim();
  let data: unknown;

  try {
    data = JSON.parse(trimmed);
  } catch {
    return {
      headers: [],
      rows: [],
      format: 'json',
      rowCount: 0,
      metadata: {},
    };
  }

  // Handle array of objects
  if (Array.isArray(data)) {
    const rows = data.filter((item) => typeof item === 'object' && item !== null) as Record<
      string,
      unknown
    >[];

    // Extract headers from first object
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      headers,
      rows,
      format: 'json',
      rowCount: rows.length,
      metadata: {},
    };
  }

  // Handle single object
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Check if it has a data/records array
    if (Array.isArray(obj.data)) {
      return parseJSON(JSON.stringify(obj.data));
    }
    if (Array.isArray(obj.records)) {
      return parseJSON(JSON.stringify(obj.records));
    }
    if (Array.isArray(obj.items)) {
      return parseJSON(JSON.stringify(obj.items));
    }

    // Wrap single object as array
    return {
      headers: Object.keys(obj),
      rows: [obj],
      format: 'json',
      rowCount: 1,
      metadata: {},
    };
  }

  return {
    headers: [],
    rows: [],
    format: 'json',
    rowCount: 0,
    metadata: {},
  };
}

// ============================================
// HELPERS
// ============================================

async function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Validate parsed file has expected structure
 */
export function validateParsedFile(
  parsed: ParsedFile,
  requiredHeaders?: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (parsed.headers.length === 0) {
    errors.push('No headers found in file');
  }

  if (parsed.rowCount === 0) {
    errors.push('No data rows found in file');
  }

  if (requiredHeaders) {
    const missing = requiredHeaders.filter((h) => !parsed.headers.includes(h));
    if (missing.length > 0) {
      errors.push(`Missing required headers: ${missing.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a preview of the parsed data
 */
export function getPreview(
  parsed: ParsedFile,
  maxRows: number = 5
): Record<string, unknown>[] {
  return parsed.rows.slice(0, maxRows);
}
