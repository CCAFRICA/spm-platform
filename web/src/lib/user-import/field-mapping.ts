/**
 * Field Auto-Mapping
 *
 * Automatically maps source columns to canonical fields using pattern matching
 * and sample value analysis.
 */

import type { SourceColumn, FieldMapping, ParsedEmployeeData } from '@/types/user-import';

// ============================================
// COLUMN NAME PATTERNS
// ============================================

type CanonicalField = keyof ParsedEmployeeData;

interface ColumnPattern {
  field: CanonicalField;
  patterns: RegExp[];
  priority: number;
}

const COLUMN_PATTERNS: ColumnPattern[] = [
  {
    field: 'firstName',
    patterns: [
      /^first[_\s-]?name$/i,
      /^fname$/i,
      /^given[_\s-]?name$/i,
      /^nombre$/i,
      /^primer[_\s-]?nombre$/i,
    ],
    priority: 1,
  },
  {
    field: 'lastName',
    patterns: [
      /^last[_\s-]?name$/i,
      /^lname$/i,
      /^sur[_\s-]?name$/i,
      /^family[_\s-]?name$/i,
      /^apellido$/i,
      /^apellido[_\s-]?paterno$/i,
    ],
    priority: 1,
  },
  {
    field: 'email',
    patterns: [
      /^e?mail$/i,
      /^email[_\s-]?address$/i,
      /^work[_\s-]?email$/i,
      /^correo$/i,
      /^correo[_\s-]?electr[oó]nico$/i,
    ],
    priority: 1,
  },
  {
    field: 'employeeNumber',
    patterns: [
      /^emp(loyee)?[_\s-]?(id|num(ber)?|no|#)?$/i,
      /^badge$/i,
      /^id$/i,
      /^staff[_\s-]?id$/i,
      /^worker[_\s-]?id$/i,
      /^n[úu]mero[_\s-]?empleado$/i,
    ],
    priority: 1,
  },
  {
    field: 'managerId',
    patterns: [
      /^manager[_\s-]?(id|num|no|#)?$/i,
      /^supervisor[_\s-]?(id)?$/i,
      /^reports[_\s-]?to[_\s-]?(id)?$/i,
      /^boss[_\s-]?(id)?$/i,
      /^jefe[_\s-]?(id)?$/i,
    ],
    priority: 1,
  },
  {
    field: 'managerEmail',
    patterns: [
      /^manager[_\s-]?email$/i,
      /^supervisor[_\s-]?email$/i,
      /^reports[_\s-]?to[_\s-]?email$/i,
    ],
    priority: 1,
  },
  {
    field: 'managerName',
    patterns: [
      /^manager[_\s-]?name$/i,
      /^supervisor[_\s-]?name$/i,
      /^reports[_\s-]?to$/i,
      /^boss$/i,
      /^nombre[_\s-]?jefe$/i,
    ],
    priority: 1,
  },
  {
    field: 'department',
    patterns: [
      /^dep(art)?t?(ment)?$/i,
      /^division$/i,
      /^team$/i,
      /^group$/i,
      /^unit$/i,
      /^departamento$/i,
      /^[aá]rea$/i,
    ],
    priority: 1,
  },
  {
    field: 'title',
    patterns: [
      /^(job[_\s-]?)?title$/i,
      /^position$/i,
      /^role$/i,
      /^job[_\s-]?name$/i,
      /^puesto$/i,
      /^cargo$/i,
      /^t[ií]tulo$/i,
    ],
    priority: 1,
  },
  {
    field: 'location',
    patterns: [
      /^location$/i,
      /^office$/i,
      /^site$/i,
      /^branch$/i,
      /^store$/i,
      /^work[_\s-]?location$/i,
      /^ubicaci[oó]n$/i,
      /^sucursal$/i,
    ],
    priority: 1,
  },
  {
    field: 'hireDate',
    patterns: [
      /^hire[_\s-]?date$/i,
      /^start[_\s-]?date$/i,
      /^join[_\s-]?date$/i,
      /^employment[_\s-]?date$/i,
      /^date[_\s-]?hired$/i,
      /^fecha[_\s-]?(de[_\s-]?)?ingreso$/i,
      /^fecha[_\s-]?contrataci[oó]n$/i,
    ],
    priority: 1,
  },
  {
    field: 'terminationDate',
    patterns: [
      /^term(ination)?[_\s-]?date$/i,
      /^end[_\s-]?date$/i,
      /^exit[_\s-]?date$/i,
      /^leave[_\s-]?date$/i,
      /^separation[_\s-]?date$/i,
      /^fecha[_\s-]?(de[_\s-]?)?baja$/i,
      /^fecha[_\s-]?terminaci[oó]n$/i,
    ],
    priority: 1,
  },
];

// ============================================
// VALUE PATTERN DETECTION
// ============================================

/**
 * Detect data type from sample values
 */
export function detectDataType(values: string[]): SourceColumn['dataType'] {
  if (values.length === 0) return 'unknown';

  const nonEmpty = values.filter((v) => v && v.trim());
  if (nonEmpty.length === 0) return 'unknown';

  // Check if all values are dates
  const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
  if (nonEmpty.every((v) => datePattern.test(v) || !isNaN(Date.parse(v)))) {
    return 'date';
  }

  // Check if all values are numbers
  if (nonEmpty.every((v) => !isNaN(Number(v.replace(/[,$]/g, ''))))) {
    return 'number';
  }

  // Check if all values are booleans
  const boolPattern = /^(true|false|yes|no|1|0|si|sí)$/i;
  if (nonEmpty.every((v) => boolPattern.test(v))) {
    return 'boolean';
  }

  return 'string';
}

/**
 * Detect if values look like emails
 */
function looksLikeEmail(values: string[]): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const nonEmpty = values.filter((v) => v && v.trim());
  return nonEmpty.length > 0 && nonEmpty.filter((v) => emailPattern.test(v)).length >= nonEmpty.length * 0.8;
}

/**
 * Detect if values look like employee numbers
 */
function looksLikeEmployeeNumber(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v && v.trim());
  if (nonEmpty.length === 0) return false;

  // Check for common patterns: pure numbers, alphanumeric with prefix
  const patterns = [
    /^\d{3,10}$/, // Pure numeric
    /^[A-Z]{1,3}\d{3,10}$/i, // Letter prefix + numbers
    /^EMP\d+$/i, // EMP prefix
  ];

  return patterns.some((p) => nonEmpty.filter((v) => p.test(v)).length >= nonEmpty.length * 0.8);
}

/**
 * Detect if values look like names
 */
function looksLikeName(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v && v.trim());
  if (nonEmpty.length === 0) return false;

  // Names are typically 2-30 chars, contain only letters/spaces/hyphens
  const namePattern = /^[A-Za-zÀ-ÿ\s\-'.]{2,30}$/;
  return nonEmpty.filter((v) => namePattern.test(v)).length >= nonEmpty.length * 0.7;
}

/**
 * Detect if values look like dates
 */
function looksLikeDate(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v && v.trim());
  if (nonEmpty.length === 0) return false;

  const datePatterns = [
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/, // MM/DD/YYYY or DD/MM/YYYY
    /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/, // YYYY-MM-DD
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/, // Month DD, YYYY
  ];

  return nonEmpty.filter((v) => datePatterns.some((p) => p.test(v)) || !isNaN(Date.parse(v))).length >= nonEmpty.length * 0.7;
}

// ============================================
// AUTO-MAPPING ENGINE
// ============================================

/**
 * Analyze source columns and suggest mappings
 */
export function analyzeColumns(
  headers: string[],
  sampleData: Record<string, string>[]
): SourceColumn[] {
  return headers.map((header) => {
    const sampleValues = sampleData.map((row) => row[header] || '').slice(0, 100);
    const nonNullValues = sampleValues.filter((v) => v && v.trim());

    const column: SourceColumn = {
      name: header,
      sampleValues: sampleValues.slice(0, 5),
      dataType: detectDataType(sampleValues),
      nullCount: sampleValues.length - nonNullValues.length,
      uniqueCount: new Set(nonNullValues).size,
    };

    // Try to suggest mapping
    const suggestion = suggestMapping(header, sampleValues);
    if (suggestion) {
      column.suggestedMapping = suggestion.field;
      column.mappingConfidence = suggestion.confidence;
    }

    return column;
  });
}

/**
 * Suggest a field mapping for a column
 */
function suggestMapping(
  columnName: string,
  sampleValues: string[]
): { field: CanonicalField; confidence: number } | null {
  // First, try matching column name against patterns
  for (const { field, patterns, priority } of COLUMN_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(columnName)) {
        return { field, confidence: 0.9 * priority };
      }
    }
  }

  // Fall back to value-based detection
  const nonEmpty = sampleValues.filter((v) => v && v.trim());

  if (looksLikeEmail(nonEmpty)) {
    // Check if it's regular email or manager email
    if (/manager|supervisor|boss|jefe/i.test(columnName)) {
      return { field: 'managerEmail', confidence: 0.85 };
    }
    return { field: 'email', confidence: 0.8 };
  }

  if (looksLikeEmployeeNumber(nonEmpty)) {
    if (/manager|supervisor|boss|jefe/i.test(columnName)) {
      return { field: 'managerId', confidence: 0.75 };
    }
    return { field: 'employeeNumber', confidence: 0.7 };
  }

  if (looksLikeDate(nonEmpty)) {
    // Try to distinguish hire vs termination
    if (/term|end|exit|baja/i.test(columnName)) {
      return { field: 'terminationDate', confidence: 0.7 };
    }
    if (/hire|start|join|ingreso|contrat/i.test(columnName)) {
      return { field: 'hireDate', confidence: 0.7 };
    }
    return { field: 'hireDate', confidence: 0.5 };
  }

  if (looksLikeName(nonEmpty)) {
    // Try to distinguish first vs last name
    if (/first|given|nombre(?!.*apellido)/i.test(columnName)) {
      return { field: 'firstName', confidence: 0.7 };
    }
    if (/last|sur|family|apellido/i.test(columnName)) {
      return { field: 'lastName', confidence: 0.7 };
    }
    if (/manager|supervisor|boss|jefe/i.test(columnName)) {
      return { field: 'managerName', confidence: 0.7 };
    }
  }

  return null;
}

/**
 * Generate field mappings from analyzed columns
 */
export function generateFieldMappings(columns: SourceColumn[]): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const usedFields = new Set<CanonicalField>();

  // Sort by confidence descending to prioritize better matches
  const sortedColumns = [...columns]
    .filter((c) => c.suggestedMapping && c.mappingConfidence)
    .sort((a, b) => (b.mappingConfidence || 0) - (a.mappingConfidence || 0));

  for (const column of sortedColumns) {
    if (!column.suggestedMapping) continue;

    // Don't map the same field twice
    if (usedFields.has(column.suggestedMapping)) continue;

    mappings.push({
      sourceColumn: column.name,
      targetField: column.suggestedMapping,
      required: ['firstName', 'lastName'].includes(column.suggestedMapping),
    });

    usedFields.add(column.suggestedMapping);
  }

  return mappings;
}

// ============================================
// DATA TRANSFORMATION
// ============================================

/**
 * Parse a date string in various formats
 */
export function parseDate(value: string): string | undefined {
  if (!value || !value.trim()) return undefined;

  // Try ISO format first
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) {
    return isoDate.toISOString().split('T')[0];
  }

  // Try MM/DD/YYYY
  const mdyMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const year = y.length === 2 ? (Number(y) > 50 ? `19${y}` : `20${y}`) : y;
    const date = new Date(Number(year), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  // Try YYYY-MM-DD
  const ymdMatch = value.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  return undefined;
}

/**
 * Apply transformations to a value
 */
export function applyTransformations(
  value: string,
  transformations: NonNullable<FieldMapping['transformations']>
): string {
  let result = value;

  for (const transform of transformations) {
    switch (transform.type) {
      case 'trim':
        result = result.trim();
        break;
      case 'lowercase':
        result = result.toLowerCase();
        break;
      case 'uppercase':
        result = result.toUpperCase();
        break;
      case 'date_parse':
        result = parseDate(result) || result;
        break;
      case 'regex_extract':
        const match = result.match(new RegExp(transform.pattern));
        if (match) {
          result = match[transform.group || 0] || result;
        }
        break;
      case 'default':
        if (!result || !result.trim()) {
          result = transform.value;
        }
        break;
    }
  }

  return result;
}

/**
 * Parse raw data using field mappings
 */
export function parseRawData(
  rawData: Record<string, unknown>,
  mappings: FieldMapping[]
): ParsedEmployeeData {
  const parsed: ParsedEmployeeData = {};

  for (const mapping of mappings) {
    const rawValue = rawData[mapping.sourceColumn];
    if (rawValue === undefined || rawValue === null) continue;

    let value = String(rawValue);

    // Apply transformations
    if (mapping.transformations) {
      value = applyTransformations(value, mapping.transformations);
    } else {
      // Default: trim
      value = value.trim();
    }

    if (!value) continue;

    // Handle date fields
    if (mapping.targetField === 'hireDate' || mapping.targetField === 'terminationDate') {
      const dateValue = parseDate(value);
      if (dateValue) {
        parsed[mapping.targetField] = dateValue;
      }
    } else {
      parsed[mapping.targetField] = value;
    }
  }

  return parsed;
}
