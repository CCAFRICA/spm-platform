/**
 * Data Layer Service
 *
 * Manages CRUD operations across Raw → Transformed → Committed layers.
 * Uses in-memory storage with localStorage persistence for demo.
 */

import type {
  RawRecord,
  TransformedRecord,
  CommittedRecord,
  ImportBatch,
  RecordLineage,
  TimeTravelSnapshot,
  RollbackResult,
  TransformPipeline,
  Checkpoint,
} from './types';
import { runTransformPipeline } from './transform-pipeline';
import {
  getSeededImportBatches,
  getSeededCheckpoints,
  isFoundationDataSeeded,
  seedFoundationDemoData,
} from '../demo/foundation-demo-data';

// Storage keys
const STORAGE_KEYS = {
  RAW: 'data_layer_raw',
  TRANSFORMED: 'data_layer_transformed',
  COMMITTED: 'data_layer_committed',
  BATCHES: 'data_layer_batches',
  CHECKPOINTS: 'data_layer_checkpoints',
} as const;

// In-memory cache
const memoryCache = {
  raw: new Map<string, RawRecord>(),
  transformed: new Map<string, TransformedRecord>(),
  committed: new Map<string, CommittedRecord>(),
  batches: new Map<string, ImportBatch>(),
  checkpoints: new Map<string, Checkpoint>(),
};

// ============================================
// INITIALIZATION
// ============================================

function loadFromStorage<T>(key: string): Map<string, T> {
  if (typeof window === 'undefined') return new Map();

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return new Map();
    const entries: [string, T][] = JSON.parse(stored);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToStorage<T>(key: string, map: Map<string, T>): void {
  if (typeof window === 'undefined') return;

  try {
    const entries = Array.from(map.entries());
    const serialized = JSON.stringify(entries);
    const sizeKB = Math.round(serialized.length / 1024);

    // OB-16B: Log storage size for diagnostics
    console.log(`[DataLayer] Saving ${key}: ${entries.length} entries, ${sizeKB} KB`);

    localStorage.setItem(key, serialized);

    // Verify write succeeded
    const verification = localStorage.getItem(key);
    if (!verification) {
      console.error(`[DataLayer] CRITICAL: Failed to persist ${key} - data may be lost!`);
    } else if (verification.length !== serialized.length) {
      console.error(`[DataLayer] WARNING: ${key} size mismatch - wrote ${serialized.length}, read ${verification.length}`);
    }
  } catch (error) {
    // Storage full or other error - THIS IS CRITICAL, DATA IS BEING LOST
    console.error(`[DataLayer] STORAGE ERROR for ${key}:`, error);
    console.error(`[DataLayer] ${map.size} records may have been lost due to storage limits`);

    // Try to determine storage usage
    try {
      let totalSize = 0;
      for (const k of Object.keys(localStorage)) {
        const item = localStorage.getItem(k);
        if (item) totalSize += item.length;
      }
      console.error(`[DataLayer] Current localStorage usage: ${Math.round(totalSize / 1024)} KB`);
    } catch {
      // Ignore errors in diagnostics
    }
  }
}

// ============================================
// OB-16C: CHUNKED STORAGE + AGGREGATION
// ============================================

const CHUNK_SIZE = 400 * 1024; // 400KB per chunk (safe margin under localStorage limits)

/**
 * Report current localStorage usage
 */
function reportStorageUsage(): void {
  if (typeof window === 'undefined') return;
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) totalSize += key.length + value.length;
    }
  }
  console.log(`[DataLayer] Current localStorage usage: ${Math.round(totalSize / 1024)} KB / ~5120 KB`);
}

/**
 * Clear all chunks for a base key
 */
function clearChunks(baseKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(baseKey);
  localStorage.removeItem(`${baseKey}_meta`);
  localStorage.removeItem(`${baseKey}_aggregated`);
  // Remove all chunks (up to 200)
  for (let i = 0; i < 200; i++) {
    const key = `${baseKey}_chunk_${i}`;
    if (localStorage.getItem(key) === null) break;
    localStorage.removeItem(key);
  }
}

/**
 * Save data to localStorage with chunking support
 */
function saveToStorageChunked<T>(baseKey: string, map: Map<string, T>): void {
  if (typeof window === 'undefined') return;

  try {
    clearChunks(baseKey);

    const entries = Array.from(map.entries());
    const serialized = JSON.stringify(entries);
    const totalSizeKB = Math.round(serialized.length / 1024);

    if (serialized.length <= CHUNK_SIZE) {
      // Small enough for single key
      localStorage.setItem(baseKey, serialized);
      localStorage.setItem(`${baseKey}_meta`, JSON.stringify({
        chunks: 0,
        total: entries.length,
        sizeKB: totalSizeKB,
        timestamp: Date.now()
      }));
      console.log(`[DataLayer] Saved ${baseKey}: ${entries.length} entries, ${totalSizeKB} KB (single key)`);
      return;
    }

    // Split into chunks
    const chunks: string[] = [];
    for (let i = 0; i < serialized.length; i += CHUNK_SIZE) {
      chunks.push(serialized.substring(i, i + CHUNK_SIZE));
    }

    // Check if total size would exceed localStorage limit (~4MB safe limit)
    if (totalSizeKB > 4000) {
      console.warn(`[DataLayer] ${baseKey} is ${totalSizeKB} KB - may exceed localStorage limit. Consider using aggregation.`);
    }

    // Write chunks
    for (let i = 0; i < chunks.length; i++) {
      try {
        localStorage.setItem(`${baseKey}_chunk_${i}`, chunks[i]);
      } catch (chunkError) {
        console.error(`[DataLayer] Chunk ${i}/${chunks.length} failed for ${baseKey}. Cleaning up.`);
        for (let j = 0; j <= i; j++) {
          localStorage.removeItem(`${baseKey}_chunk_${j}`);
        }
        throw chunkError;
      }
    }

    // Write metadata
    localStorage.setItem(`${baseKey}_meta`, JSON.stringify({
      chunks: chunks.length,
      total: entries.length,
      sizeKB: totalSizeKB,
      timestamp: Date.now()
    }));

    localStorage.removeItem(baseKey);
    console.log(`[DataLayer] Saved ${baseKey}: ${entries.length} entries, ${totalSizeKB} KB (${chunks.length} chunks)`);

  } catch (error) {
    console.error(`[DataLayer] STORAGE ERROR for ${baseKey}:`, error);
    console.error(`[DataLayer] ${map.size} records could not be persisted.`);
    reportStorageUsage();
  }
}

/**
 * Load data from localStorage with chunking support (backward compatible)
 */
function loadFromStorageChunked<T>(baseKey: string): Map<string, T> {
  if (typeof window === 'undefined') return new Map();

  try {
    const metaStr = localStorage.getItem(`${baseKey}_meta`);

    if (!metaStr) {
      // Try single-key format (backward compatible)
      const singleStr = localStorage.getItem(baseKey);
      if (singleStr) {
        const entries: [string, T][] = JSON.parse(singleStr);
        return new Map(entries);
      }
      return new Map();
    }

    const meta = JSON.parse(metaStr);

    if (meta.chunks === 0) {
      // Single-key storage
      const singleStr = localStorage.getItem(baseKey);
      if (singleStr) {
        const entries: [string, T][] = JSON.parse(singleStr);
        return new Map(entries);
      }
      return new Map();
    }

    // Reassemble chunks
    let serialized = '';
    for (let i = 0; i < meta.chunks; i++) {
      const chunk = localStorage.getItem(`${baseKey}_chunk_${i}`);
      if (!chunk) {
        console.error(`[DataLayer] Missing chunk ${i} for ${baseKey}. Data corrupted.`);
        return new Map();
      }
      serialized += chunk;
    }

    const entries: [string, T][] = JSON.parse(serialized);
    console.log(`[DataLayer] Loaded ${baseKey}: ${entries.length} entries from ${meta.chunks} chunks`);
    return new Map(entries);

  } catch (error) {
    console.error(`[DataLayer] Load error for ${baseKey}:`, error);
    return new Map();
  }
}

// ============================================
// OB-24 R9: UNICODE-SAFE FIELD LOOKUP
// ============================================

/**
 * Unicode-safe field lookup for record access
 * Handles NFC normalization and case-insensitive fallback
 * Required for fields like "Año" which may have different Unicode encodings
 */
function safeFieldLookup(record: Record<string, unknown>, fieldName: string): unknown {
  // Direct lookup first (fastest path)
  if (fieldName in record) return record[fieldName];

  // Normalized lookup (NFC normalization for Unicode consistency)
  const normalizedTarget = fieldName.normalize('NFC');
  for (const key of Object.keys(record)) {
    if (key.normalize('NFC') === normalizedTarget) return record[key];
  }

  // Case-insensitive fallback
  const lowerTarget = normalizedTarget.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.normalize('NFC').toLowerCase() === lowerTarget) return record[key];
  }

  return undefined;
}

// ============================================
// OB-24 R9: PERIOD VALUE RESOLVER
// ============================================

interface ResolvedPeriod {
  month: number | null;
  year: number | null;
}

/**
 * Multilingual month name map for period resolution
 * Covers English, Spanish, Portuguese, French, German, Italian
 */
const MONTH_NAMES: Record<string, number> = {
  // English
  'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
  'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
  // Spanish
  'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
  'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
  'ene': 1, 'abr': 4, 'ago': 8, 'dic': 12,
  // Portuguese
  'janeiro': 1, 'fevereiro': 2, 'marco': 3, 'março': 3, 'maio': 5, 'junho': 6,
  'julho': 7, 'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
  // French
  'janvier': 1, 'fevrier': 2, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
  'juillet': 7, 'aout': 8, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'decembre': 12, 'décembre': 12,
  // German (august same as English, juli same as July)
  'januar': 1, 'februar': 2, 'marz': 3, 'märz': 3, 'juni': 6,
  'oktober': 10, 'dezember': 12,
  // Italian
  'gennaio': 1, 'febbraio': 2, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'settembre': 9, 'ottobre': 10, 'dicembre': 12,
};

/**
 * Parse month from string value (month name or numeric)
 */
function parseMonthValue(value: string): number | null {
  const cleaned = value.trim().toLowerCase();

  // Try month name lookup
  if (MONTH_NAMES[cleaned]) return MONTH_NAMES[cleaned];

  // Try numeric
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;

  // Try CJK month pattern (1月, 2月, etc.)
  const cjkMatch = cleaned.match(/^(\d{1,2})月$/);
  if (cjkMatch) {
    const m = parseInt(cjkMatch[1], 10);
    if (m >= 1 && m <= 12) return m;
  }

  return null;
}

/**
 * Parse year from string value
 * IMPORTANT: Only accepts 4-digit years or 2-digit years > 12 to avoid overlap with months
 */
function parseYearValue(value: string): number | null {
  const cleaned = value.trim();

  // Try numeric (4-digit year)
  const num = parseInt(cleaned, 10);
  if (!isNaN(num) && num >= 1900 && num <= 2100) return num;

  // Try CJK year pattern (2024年)
  const cjkMatch = cleaned.match(/^(\d{4})年$/);
  if (cjkMatch) return parseInt(cjkMatch[1], 10);

  // Try 2-digit year (24 -> 2024) but ONLY for values > 12 to avoid month overlap
  // Values 1-12 should be treated as months, not years like 2001-2012
  if (!isNaN(num) && num >= 13 && num <= 99) {
    return num < 50 ? 2000 + num : 1900 + num;
  }

  return null;
}

/**
 * Classify a value as month, year, or unknown based on its numeric range
 * Uses parseMonthValue and parseYearValue for comprehensive pattern handling
 */
function classifyPeriodValue(value: unknown): { type: 'month' | 'year' | 'unknown'; value: number | null } {
  if (value === null || value === undefined) return { type: 'unknown', value: null };

  const str = String(value).trim();
  if (!str) return { type: 'unknown', value: null };

  // Check for year patterns first (including CJK like 2024年)
  const yearFromPattern = parseYearValue(str);
  if (yearFromPattern !== null && yearFromPattern >= 1900) {
    return { type: 'year', value: yearFromPattern };
  }

  // Check for month name (including CJK like 1月)
  const monthFromName = parseMonthValue(str);
  if (monthFromName !== null) {
    return { type: 'month', value: monthFromName };
  }

  // Try as plain number
  const num = parseFloat(str);
  if (isNaN(num)) return { type: 'unknown', value: null };

  // Classify by range
  if (num >= 1900 && num <= 2100) return { type: 'year', value: Math.floor(num) };
  if (num >= 1 && num <= 12) return { type: 'month', value: Math.floor(num) };

  return { type: 'unknown', value: null };
}

/**
 * Resolve period from a record using multiple strategies
 * Handles: Date objects, ISO strings, separate month/year fields, combined strings, month names
 */
function resolvePeriodFromRecord(
  record: Record<string, unknown>,
  periodFields: string[],
  dateFields: string[]
): ResolvedPeriod {
  let month: number | null = null;
  let year: number | null = null;

  const allFields = [...periodFields, ...dateFields];

  // Strategy 1: Date objects or ISO date strings
  for (const fieldName of allFields) {
    const value = safeFieldLookup(record, fieldName);
    if (value === null || value === undefined) continue;

    // Check for Date object
    if (value instanceof Date && !isNaN(value.getTime())) {
      return { month: value.getMonth() + 1, year: value.getFullYear() };
    }

    // Check for ISO date string (2024-01-31, 2024-01-31T00:00:00Z)
    const str = String(value).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return { month: parseInt(isoMatch[2], 10), year: parseInt(isoMatch[1], 10) };
    }
  }

  // Strategy 2: Multiple period fields - classify by value range
  if (periodFields.length >= 2) {
    const classifications: Array<{ field: string; type: 'month' | 'year' | 'unknown'; value: number | null }> = [];

    for (const fieldName of periodFields) {
      const rawValue = safeFieldLookup(record, fieldName);
      const classification = classifyPeriodValue(rawValue);
      classifications.push({ field: fieldName, ...classification });
    }

    // Extract month and year from classifications
    const monthClass = classifications.find(c => c.type === 'month');
    const yearClass = classifications.find(c => c.type === 'year');

    if (monthClass && monthClass.value !== null) month = monthClass.value;
    if (yearClass && yearClass.value !== null) year = yearClass.value;

    // If we found both, return
    if (month !== null && year !== null) {
      return { month, year };
    }

    // If we have two values that both look like months (1-12), use field name heuristic
    const monthCandidates = classifications.filter(c => c.type === 'month');
    if (monthCandidates.length >= 2 && year === null) {
      // Look for year-like field names
      const yearKeywords = ['year', 'año', 'ano', 'jahr', 'annee', 'année', '年', '년'];
      for (const candidate of monthCandidates) {
        const fieldLower = candidate.field.toLowerCase().normalize('NFC');
        if (yearKeywords.some(kw => fieldLower.includes(kw))) {
          // This field is actually a year despite its numeric value
          year = candidate.value;
          // Use the other month candidate
          const otherMonth = monthCandidates.find(c => c.field !== candidate.field);
          if (otherMonth && otherMonth.value !== null) month = otherMonth.value;
          break;
        }
      }
    }

    if (month !== null || year !== null) {
      return { month, year };
    }
  }

  // Strategy 3: Single period field with combined value
  for (const fieldName of periodFields) {
    const value = safeFieldLookup(record, fieldName);
    if (value === null || value === undefined) continue;

    const str = String(value).trim();

    // Try "Month Year" format (January 2024, Enero 2024)
    const monthYearMatch = str.match(/^([a-zA-ZáéíóúñüÀ-ÿ]+)\s+(\d{4})$/i);
    if (monthYearMatch) {
      const parsedMonth = parseMonthValue(monthYearMatch[1]);
      const parsedYear = parseInt(monthYearMatch[2], 10);
      if (parsedMonth !== null && parsedYear >= 1900 && parsedYear <= 2100) {
        return { month: parsedMonth, year: parsedYear };
      }
    }

    // Try "Year-Month" format (2024-01)
    const yearMonthMatch = str.match(/^(\d{4})-(\d{1,2})$/);
    if (yearMonthMatch) {
      const parsedYear = parseInt(yearMonthMatch[1], 10);
      const parsedMonth = parseInt(yearMonthMatch[2], 10);
      if (parsedMonth >= 1 && parsedMonth <= 12 && parsedYear >= 1900) {
        return { month: parsedMonth, year: parsedYear };
      }
    }

    // Try MM/DD/YYYY or DD/MM/YYYY format
    const slashMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (slashMatch) {
      const parsedYear = parseInt(slashMatch[3], 10);
      // Assume first number is month (US format) if <= 12
      const first = parseInt(slashMatch[1], 10);
      if (first >= 1 && first <= 12) {
        return { month: first, year: parsedYear };
      }
    }

    // Try quarter format (Q1 2024)
    const quarterMatch = str.match(/^Q([1-4])\s+(\d{4})$/i);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1], 10);
      const parsedYear = parseInt(quarterMatch[2], 10);
      // Map quarter to first month of quarter
      return { month: (quarter - 1) * 3 + 1, year: parsedYear };
    }
  }

  // Strategy 4: Single value classification (if only one period field)
  if (periodFields.length === 1) {
    const value = safeFieldLookup(record, periodFields[0]);
    const classification = classifyPeriodValue(value);
    if (classification.type === 'month') month = classification.value;
    if (classification.type === 'year') year = classification.value;
  }

  // Strategy 5: Try date fields as fallback
  for (const fieldName of dateFields) {
    const value = safeFieldLookup(record, fieldName);
    if (value === null || value === undefined) continue;

    const str = String(value).trim();

    // Try various date formats
    const datePatterns = [
      /^(\d{4})-(\d{1,2})-(\d{1,2})/, // ISO
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/, // US/EU
    ];

    for (const pattern of datePatterns) {
      const match = str.match(pattern);
      if (match) {
        if (pattern.source.startsWith('^(\\d{4})')) {
          // ISO format: year first
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10);
        } else {
          // US/EU format: year last
          year = parseInt(match[3], 10);
          month = parseInt(match[1], 10);
          if (month > 12) month = parseInt(match[2], 10); // Try second position
        }
        if (month >= 1 && month <= 12 && year >= 1900) {
          return { month, year };
        }
      }
    }
  }

  // Strategy 6: No period determinable
  return { month, year };
}

/**
 * Get all field names for a semantic type from sheet info
 */
function getAllFieldsForSemantic(
  sheetInfo: { fieldMappings?: Array<{ sourceColumn: string; semanticType: string }> } | undefined,
  semanticType: string
): string[] {
  if (!sheetInfo?.fieldMappings) return [];
  return sheetInfo.fieldMappings
    .filter(fm => fm.semanticType?.toLowerCase() === semanticType.toLowerCase())
    .map(fm => fm.sourceColumn);
}

// ============================================
// OB-24 R9: SHEET TOPOLOGY CLASSIFICATION
// ============================================

/**
 * Sheet topology types derived from AI semantic mappings
 * - roster: Has employeeId, represents employee master data
 * - employee_component: Has employeeId, performance data joined by employee
 * - store_component: Has storeId but NO employeeId, needs join through roster's storeId
 */
type SheetTopology = 'roster' | 'employee_component' | 'store_component';

interface ClassifiedSheet {
  sheetName: string;
  topology: SheetTopology;
  joinField: 'employeeId' | 'storeId';
  hasEmployeeId: boolean;
  hasStoreId: boolean;
  hasPeriod: boolean;
}

/**
 * OB-24 R9: Classify sheets by topology using AI semantic mappings
 * Derives join type from semantic types: employeeId presence → employee join, storeId only → store join
 */
function classifySheets(
  aiContext: { sheets: Array<{ sheetName?: string; name?: string; classification?: string; fieldMappings?: Array<{ semanticType: string }> }> } | null
): Map<string, ClassifiedSheet> {
  const result = new Map<string, ClassifiedSheet>();

  if (!aiContext?.sheets) return result;

  for (const sheet of aiContext.sheets) {
    const sheetName = sheet.sheetName || sheet.name || '';
    if (!sheetName) continue;

    const mappings = sheet.fieldMappings || [];
    const hasEmployeeId = mappings.some(fm => fm.semanticType?.toLowerCase() === 'employeeid');
    const hasStoreId = mappings.some(fm => fm.semanticType?.toLowerCase() === 'storeid');
    const hasPeriod = mappings.some(fm => ['period', 'date', 'month'].includes(fm.semanticType?.toLowerCase() || ''));

    // Determine topology from AI classification + semantic types
    let topology: SheetTopology;
    let joinField: 'employeeId' | 'storeId';

    if (sheet.classification === 'roster') {
      topology = 'roster';
      joinField = 'employeeId';
    } else if (hasEmployeeId) {
      topology = 'employee_component';
      joinField = 'employeeId';
    } else if (hasStoreId) {
      topology = 'store_component';
      joinField = 'storeId';
    } else {
      // No join field - skip this sheet
      continue;
    }

    result.set(sheetName, {
      sheetName,
      topology,
      joinField,
      hasEmployeeId,
      hasStoreId,
      hasPeriod,
    });
  }

  // HF-017: Enhanced topology logging with summary counts
  const topologyCounts = { roster: 0, employee_component: 0, store_component: 0 };
  const storeComponentSheets: string[] = [];
  for (const [name, info] of Array.from(result.entries())) {
    topologyCounts[info.topology]++;
    if (info.topology === 'store_component') {
      storeComponentSheets.push(name);
    }
  }

  console.log(`[Topology] Classified ${result.size} sheets: ${topologyCounts.roster} roster, ${topologyCounts.employee_component} employee_component, ${topologyCounts.store_component} store_component`);
  if (storeComponentSheets.length > 0) {
    console.log(`[Topology] Store sheets: ${storeComponentSheets.join(', ')}`);
  }
  for (const [name, info] of Array.from(result.entries())) {
    console.log(`[Topology]   - ${name}: ${info.topology} (join by ${info.joinField})`);
  }

  return result;
}

/**
 * Store aggregated employee data for calculation (reduces 119K records to ~2K employees)
 * AI-DRIVEN APPROACH: Uses AI import context for field resolution, builds componentMetrics
 */
function storeAggregatedData(
  tenantId: string,
  batchId: string,
  records: Array<{ content: Record<string, unknown> }>
): { employeeCount: number; sizeKB: number } {
  if (typeof window === 'undefined') return { employeeCount: 0, sizeKB: 0 };

  // AI-DRIVEN: Load AI import context for field mappings
  const aiContext = loadImportContext(tenantId);
  console.log(`[DataLayer] AI Import Context: ${aiContext ? 'LOADED' : 'NOT FOUND'}`);
  if (aiContext) {
    console.log(`[DataLayer] AI Context: roster=${aiContext.rosterSheet}, ${aiContext.sheets.length} sheets`);
  }

  // OB-24 R9: Classify sheets by topology for proper join strategy
  const sheetTopology = classifySheets(aiContext);

  console.log(`[DataLayer] AI-driven aggregation from ${records.length} committed records...`);

  // STEP 1: Separate records by sheet type using AI classification
  const rosterRecords: Record<string, unknown>[] = [];
  const componentRecords: Record<string, unknown>[] = [];

  // AI-DRIVEN: Get roster sheet name from AI context (NO HARDCODED FALLBACKS)
  const rosterSheetName = aiContext?.rosterSheet?.toLowerCase() || null;
  const rosterSheetInfo = aiContext?.sheets.find(s => s.classification === 'roster');

  if (!aiContext) {
    console.warn('[DataLayer] NO AI IMPORT CONTEXT - cannot identify roster sheet. Re-import data to generate mappings.');
  }

  for (const record of records) {
    const content = record.content;
    const sheetName = String(content._sheetName || '');
    const sheetNameLower = sheetName.toLowerCase();

    // AI-DRIVEN: Use AI classification to identify roster vs component sheets
    // NO FALLBACK: If AI context is missing, we cannot reliably identify roster
    const sheetInfo = aiContext?.sheets.find(s => s.sheetName.toLowerCase() === sheetNameLower);
    const isRoster = sheetInfo?.classification === 'roster' ||
      (rosterSheetName && (sheetNameLower === rosterSheetName || sheetNameLower.includes(rosterSheetName)));

    if (isRoster) {
      rosterRecords.push(content);
    } else {
      componentRecords.push(content);
    }
  }

  console.log(`[DataLayer] Roster records: ${rosterRecords.length}, Component records: ${componentRecords.length}`);
  console.log(`[DataLayer] Roster sheet identification: ${rosterSheetName || 'FALLBACK (no AI context)'}`);

  // STEP 2: Build employee map from ROSTER using AI field mappings
  const employeeMap = new Map<string, Record<string, unknown>>();

  // AI-DRIVEN: Helper to find field value by semantic type (uses safeFieldLookup for Unicode safety)
  const findFieldBySemantic = (row: Record<string, unknown>, semanticTypes: string[]): unknown => {
    if (!rosterSheetInfo?.fieldMappings) return undefined;
    for (const semantic of semanticTypes) {
      const mapping = rosterSheetInfo.fieldMappings.find(
        fm => fm.semanticType.toLowerCase() === semantic.toLowerCase()
      );
      if (mapping) {
        const value = safeFieldLookup(row, mapping.sourceColumn);
        if (value !== undefined) return value;
      }
    }
    return undefined;
  };

  // AI-DRIVEN: Helper to find field value using ONLY AI semantic mappings (NO HARDCODED FALLBACKS)
  const getFieldValue = (row: Record<string, unknown>, semanticTypes: string[]): string => {
    // Only use AI semantic mapping - no hardcoded column names
    const aiValue = findFieldBySemantic(row, semanticTypes);
    if (aiValue !== undefined && aiValue !== null && String(aiValue).trim()) {
      return String(aiValue).trim();
    }
    // No fallback - return empty string
    return '';
  };

  // OB-28: Helper to find field value with multilingual pattern fallback for roster fields
  const getFieldValueWithFallback = (row: Record<string, unknown>, semanticTypes: string[], fallbackPatterns: RegExp[]): string => {
    // AI semantic mapping first
    const aiValue = findFieldBySemantic(row, semanticTypes);
    if (aiValue !== undefined && aiValue !== null && String(aiValue).trim()) {
      return String(aiValue).trim();
    }
    // Multilingual pattern fallback (consistent with component sheet ID extraction)
    for (const key of Object.keys(row)) {
      if (key.startsWith('_')) continue;
      for (const pattern of fallbackPatterns) {
        if (pattern.test(key)) {
          const value = row[key];
          if (value !== undefined && value !== null && String(value).trim()) {
            return String(value).trim();
          }
        }
      }
    }
    return '';
  };

  // OB-24 R9: Get all period and date fields from roster for period resolution
  const rosterPeriodFields = getAllFieldsForSemantic(rosterSheetInfo, 'period');
  const rosterDateFields = getAllFieldsForSemantic(rosterSheetInfo, 'date');

  for (const row of rosterRecords) {
    // AI-DRIVEN: Get employee ID using ONLY AI semantic mapping (NO HARDCODED FALLBACKS)
    const empId = getFieldValue(row, ['employeeId', 'employee_id']);
    if (!empId || empId.length < 3 || empId === 'undefined' || empId === 'null') continue;

    // OB-24 R9: Use resolvePeriodFromRecord for multi-field period extraction
    const resolvedPeriod = resolvePeriodFromRecord(row, rosterPeriodFields, rosterDateFields);
    const monthKey = resolvedPeriod.month !== null ? String(resolvedPeriod.month) : '';
    const yearKey = resolvedPeriod.year !== null ? String(resolvedPeriod.year) : '';
    const key = monthKey || yearKey ? `${empId}_${monthKey}_${yearKey}` : empId;

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: empId,
        // AI-DRIVEN: Extract identity fields using ONLY AI semantic mappings
        name: getFieldValue(row, ['name', 'employeeName', 'fullName']),
        role: getFieldValue(row, ['role', 'position', 'employeeType', 'jobTitle']),
        // OB-28: Use fallback patterns for storeId (consistent with component sheet extraction)
        storeId: getFieldValueWithFallback(row, ['storeId', 'locationId', 'store'], [
          /tienda/i, /store/i, /sucursal/i, /location/i, /ubicacion/i
        ]),
        storeRange: getFieldValue(row, ['storeRange', 'category', 'storeCategory']),
        // OB-24 R9: Store resolved period as numbers for consistent type handling
        month: resolvedPeriod.month,
        year: resolvedPeriod.year,
        tenantId,
        batchId,
      });
    }
  }

  console.log(`[DataLayer] Unique employee records from roster: ${employeeMap.size}`);

  // OB-28: Diagnostic logging for roster storeId extraction
  if (employeeMap.size > 0) {
    const sampleEmps = Array.from(employeeMap.values()).slice(0, 3);
    const storeIdCount = Array.from(employeeMap.values()).filter(e => e.storeId && String(e.storeId).trim()).length;
    console.log(`[DataLayer] OB-28 Roster storeId: ${storeIdCount}/${employeeMap.size} employees have storeId`);
    if (storeIdCount < employeeMap.size / 2) {
      console.warn(`[DataLayer] OB-28 WARNING: Less than half of employees have storeId. Store attribution may fail.`);
      console.log(`[DataLayer] OB-28 Sample employees: ${sampleEmps.map(e => `${e.employeeId}:storeId="${e.storeId || 'EMPTY'}"`).join(', ')}`);
    }
  }

  // AI-DRIVEN: If no roster records found, warn user - NO HARDCODED FALLBACKS
  if (employeeMap.size === 0) {
    console.warn('[DataLayer] NO EMPLOYEES FOUND - AI import context may be missing or roster sheet not identified.');
    console.warn('[DataLayer] Please re-import data with AI analysis to generate proper field mappings.');
    // Return early with empty result rather than using hardcoded column names
    return { employeeCount: 0, sizeKB: 0 };
  }

  // STEP 3: Build componentMetrics - AI-DRIVEN extraction of attainment/amount/goal per sheet
  // OB-24 R8: Added attainmentSource to track 'source' vs 'computed' attainment
  // OB-27B: Extended with Carry Everything - preserves ALL numeric fields
  // Key: employeeId -> sheetName -> { attainment, attainmentSource, amount, goal, _rawFields }
  const empComponentMetrics = new Map<string, Map<string, MergedMetrics>>();
  // Key: storeId -> sheetName -> { attainment, attainmentSource, amount, goal, _rawFields }
  const storeComponentMetrics = new Map<string, Map<string, MergedMetrics>>();

  // AI-DRIVEN: Helper to find column by semantic type from AI Import Context
  // OB-24 R4: Simplified to use ONLY the AI's semantic types (not column names)
  // AI outputs exactly: employeeId|storeId|date|period|amount|goal|attainment|quantity|role
  const getSheetFieldBySemantic = (sheetName: string, semanticType: string): string | null => {
    if (!aiContext?.sheets) return null;

    // OB-24 R5: Handle BOTH array and object formats for sheets
    let sheetInfo: { sheetName?: string; fieldMappings?: Array<{ sourceColumn: string; semanticType: string }> } | undefined;

    if (Array.isArray(aiContext.sheets)) {
      // Array format: [{ sheetName: "...", fieldMappings: [...] }, ...]
      sheetInfo = aiContext.sheets.find(s => {
        // Handle both sheetName and name properties (AI analysis uses 'name', stored context uses 'sheetName')
        const sheet = s as { sheetName?: string; name?: string; fieldMappings?: Array<{ sourceColumn: string; semanticType: string }> };
        const ctxName = (sheet.sheetName || sheet.name || '').trim();
        const recName = sheetName.trim();
        return ctxName === recName || ctxName.toLowerCase() === recName.toLowerCase();
      });
    } else if (typeof aiContext.sheets === 'object') {
      // Object format: { "SheetName": { fieldMappings: [...] }, ... }
      const keys = Object.keys(aiContext.sheets);
      const matchingKey = keys.find(k =>
        k.trim() === sheetName.trim() || k.trim().toLowerCase() === sheetName.trim().toLowerCase()
      );
      if (matchingKey) {
        sheetInfo = (aiContext.sheets as Record<string, typeof sheetInfo>)[matchingKey];
      }
    }

    if (!sheetInfo?.fieldMappings || sheetInfo.fieldMappings.length === 0) return null;

    // Find mapping by exact semantic type match (case-insensitive)
    const mapping = sheetInfo.fieldMappings.find(
      fm => fm.semanticType?.toLowerCase() === semanticType.toLowerCase()
    );

    return mapping?.sourceColumn || null;
  };

  // OB-24 R9: isStoreJoinSheet removed - replaced by classifySheets() and sheetTopology lookup

  // OB-24 R9: Get roster's join field names for join-field-preference
  // When a component sheet has multiple fields mapped as employeeId/storeId,
  // prefer the field whose name matches the roster's field
  const rosterEmpIdField = rosterSheetInfo?.fieldMappings?.find(
    fm => fm.semanticType?.toLowerCase() === 'employeeid'
  )?.sourceColumn || null;
  const rosterStoreIdField = rosterSheetInfo?.fieldMappings?.find(
    fm => fm.semanticType?.toLowerCase() === 'storeid'
  )?.sourceColumn || null;

  // OB-24 R9: Get join field with preference for roster's field name
  // When multiple fields map to same semantic type, prefer the one matching roster
  const getJoinFieldWithPreference = (sheetName: string, semanticType: string, rosterFieldName: string | null): string | null => {
    if (!aiContext?.sheets) return null;

    let sheetInfo: { sheetName?: string; fieldMappings?: Array<{ sourceColumn: string; semanticType: string }> } | undefined;

    if (Array.isArray(aiContext.sheets)) {
      sheetInfo = aiContext.sheets.find(s => {
        const sheet = s as { sheetName?: string; name?: string };
        const ctxName = (sheet.sheetName || sheet.name || '').trim();
        return ctxName === sheetName.trim() || ctxName.toLowerCase() === sheetName.trim().toLowerCase();
      });
    } else if (typeof aiContext.sheets === 'object') {
      const keys = Object.keys(aiContext.sheets);
      const matchingKey = keys.find(k =>
        k.trim() === sheetName.trim() || k.trim().toLowerCase() === sheetName.trim().toLowerCase()
      );
      if (matchingKey) {
        sheetInfo = (aiContext.sheets as Record<string, typeof sheetInfo>)[matchingKey];
      }
    }

    if (!sheetInfo?.fieldMappings || sheetInfo.fieldMappings.length === 0) return null;

    // Find ALL mappings for this semantic type
    const candidates = sheetInfo.fieldMappings.filter(
      fm => fm.semanticType?.toLowerCase() === semanticType.toLowerCase()
    );

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].sourceColumn;

    // Multiple candidates: prefer the one matching roster's field name
    if (rosterFieldName) {
      const preferred = candidates.find(c => c.sourceColumn === rosterFieldName);
      if (preferred) return preferred.sourceColumn;
    }

    // Fallback to first candidate
    return candidates[0].sourceColumn;
  };

  // OB-24 R6: Normalize employee ID for consistent Map keys
  // Handles: leading zeros, decimal notation (96568046.0), whitespace
  const normalizeEmpId = (id: string): string => {
    const trimmed = id.trim();
    // If it looks like a number (possibly with decimal), parse and re-stringify
    const num = parseFloat(trimmed);
    if (!isNaN(num) && isFinite(num)) {
      return String(Math.floor(num)); // Remove decimal part
    }
    return trimmed;
  };

  // OB-28: Normalize store ID for consistent Map keys
  // Handles: decimal notation (123.0), whitespace, common prefixes
  const normalizeStoreId = (id: string): string => {
    const trimmed = id.trim();
    // If it looks like a number (possibly with decimal), parse and re-stringify
    const num = parseFloat(trimmed);
    if (!isNaN(num) && isFinite(num)) {
      return String(Math.floor(num)); // Remove decimal part
    }
    return trimmed;
  };

  // OB-24 R8: Semantic Resolution Hierarchy for attainment/amount/goal
  // Resolves metrics from any combination of present/absent columns
  // OB-27B: Extended to preserve ALL numeric fields (Carry Everything principle)
  interface ResolvedMetrics {
    attainment: number | undefined;
    attainmentSource: 'source' | 'computed' | 'candidate' | undefined;
    amount: number | undefined;
    goal: number | undefined;
    // OB-27B: Candidate attainment when AI didn't classify but field looks like attainment
    _candidateAttainment?: number;
    _candidateAttainmentField?: string;
    // OB-27B: Preserve ALL numeric fields for calculation-time resolution
    _rawFields?: Record<string, number>;
  }

  // Parse numeric value from various formats (number, string, percentage string)
  const parseNumeric = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return isNaN(value) ? undefined : value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[,%]/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? undefined : num;
    }
    return undefined;
  };

  // Normalize attainment to percentage format
  // Ratio detection: values between 0 and 5 are likely ratios (0.82 = 82%)
  const normalizeAttainment = (value: number | undefined): number | undefined => {
    if (value === undefined || value === null || isNaN(value)) return undefined;
    if (value < 0) return undefined;
    // Ratio detection: if value > 0 AND value <= 5.0, it's likely a ratio
    if (value > 0 && value <= 5.0) return value * 100;
    // Already a percentage (or zero)
    return value;
  };

  // OB-27B: Patterns that indicate an attainment/percentage field (multilingual)
  const ATTAINMENT_FIELD_PATTERNS = [
    /cumplimiento/i, /attainment/i, /achievement/i, /completion/i,
    /rate/i, /ratio/i, /percent/i, /porcentaje/i, /pct/i, /%/,
    /logro/i, /alcance/i, /rendimiento/i
  ];

  // OB-27B: Patterns for amount fields (multilingual)
  const AMOUNT_FIELD_PATTERNS = [
    /monto/i, /amount/i, /total/i, /sum/i, /sales/i, /venta/i,
    /revenue/i, /ingreso/i, /valor/i, /value/i, /importe/i
  ];

  // OB-27B: Patterns for goal fields (multilingual)
  const GOAL_FIELD_PATTERNS = [
    /meta/i, /goal/i, /target/i, /objetivo/i, /quota/i, /cuota/i,
    /budget/i, /presupuesto/i
  ];

  // Resolve metrics using semantic resolution hierarchy (uses safeFieldLookup for Unicode safety)
  // OB-27B: Extended with Carry Everything principle - preserve ALL numeric fields
  const resolveMetrics = (
    record: Record<string, unknown>,
    attainmentField: string | null,
    amountField: string | null,
    goalField: string | null
  ): ResolvedMetrics => {
    // 1. Resolve amount (AI-mapped amount or quantity) - using safeFieldLookup
    let amount = amountField ? parseNumeric(safeFieldLookup(record, amountField)) : undefined;

    // 2. Resolve goal - using safeFieldLookup
    let goal = goalField ? parseNumeric(safeFieldLookup(record, goalField)) : undefined;

    // 3. Resolve attainment using hierarchy
    let attainment: number | undefined;
    let attainmentSource: 'source' | 'computed' | 'candidate' | undefined;
    let candidateAttainment: number | undefined;
    let candidateAttainmentField: string | undefined;

    const rawAttainment = attainmentField ? safeFieldLookup(record, attainmentField) : undefined;
    if (attainmentField && rawAttainment !== undefined && rawAttainment !== null && rawAttainment !== '') {
      // Case 1: AI-mapped attainment column exists - use source value
      attainment = normalizeAttainment(parseNumeric(rawAttainment));
      attainmentSource = attainment !== undefined ? 'source' : undefined;
    }

    // OB-27B: CARRY EVERYTHING - Scan ALL numeric fields and preserve them
    // Also detect candidate attainment/amount/goal when AI didn't classify
    const rawFields: Record<string, number> = {};

    for (const [fieldName, value] of Object.entries(record)) {
      // Skip internal fields
      if (fieldName.startsWith('_')) continue;

      const numValue = parseNumeric(value);
      if (numValue === undefined) continue;

      // Preserve ALL numeric fields with their original names
      rawFields[fieldName] = numValue;

      // OB-27B: Detect candidate attainment if AI didn't classify one
      if (attainment === undefined && !candidateAttainment) {
        const isAttainmentField = ATTAINMENT_FIELD_PATTERNS.some(p => p.test(fieldName));
        // Also consider: values in 0-200 range are likely percentages
        const looksLikePercentage = numValue >= 0 && numValue <= 200;

        if (isAttainmentField && looksLikePercentage) {
          candidateAttainment = normalizeAttainment(numValue);
          candidateAttainmentField = fieldName;
        }
      }

      // OB-27B: Detect candidate amount if AI didn't classify one
      if (amount === undefined) {
        const isAmountField = AMOUNT_FIELD_PATTERNS.some(p => p.test(fieldName));
        // Amount fields typically have larger values
        if (isAmountField && numValue > 100) {
          amount = numValue;
        }
      }

      // OB-27B: Detect candidate goal if AI didn't classify one
      if (goal === undefined) {
        const isGoalField = GOAL_FIELD_PATTERNS.some(p => p.test(fieldName));
        if (isGoalField && numValue > 0) {
          goal = numValue;
        }
      }
    }

    // OB-27B: Use candidate attainment if AI didn't map one
    if (attainment === undefined && candidateAttainment !== undefined) {
      attainment = candidateAttainment;
      attainmentSource = 'candidate';
    }

    // Case 2: No attainment found, but amount and goal available - compute
    if (attainment === undefined && amount !== undefined && goal !== undefined && goal > 0) {
      attainment = (amount / goal) * 100;
      attainmentSource = 'computed';
    }

    return {
      attainment,
      attainmentSource,
      amount,
      goal,
      _candidateAttainment: candidateAttainment,
      _candidateAttainmentField: candidateAttainmentField,
      _rawFields: Object.keys(rawFields).length > 0 ? rawFields : undefined,
    };
  };

  // Merge metrics for multiple records per employee per sheet
  // Sums amounts and goals, then recomputes attainment (weighted average)
  // OB-27B: Extended to preserve ALL raw fields
  interface MergedMetrics {
    attainment: number | undefined;
    attainmentSource: 'source' | 'computed' | 'candidate' | undefined;
    amount: number | undefined;
    goal: number | undefined;
    // OB-27B: Carry Everything - preserve raw fields and candidate detection
    _candidateAttainment?: number;
    _candidateAttainmentField?: string;
    _rawFields?: Record<string, number>;
  }

  const mergeMetrics = (existing: MergedMetrics | undefined, newMetrics: ResolvedMetrics): MergedMetrics => {
    const merged: MergedMetrics = {
      attainment: undefined,
      attainmentSource: existing?.attainmentSource || newMetrics.attainmentSource,
      amount: (existing?.amount || 0) + (newMetrics.amount || 0),
      goal: (existing?.goal || 0) + (newMetrics.goal || 0),
      // OB-27B: Preserve candidate attainment info
      _candidateAttainment: existing?._candidateAttainment ?? newMetrics._candidateAttainment,
      _candidateAttainmentField: existing?._candidateAttainmentField ?? newMetrics._candidateAttainmentField,
    };

    // OB-27B: Merge raw fields (sum numeric values)
    if (newMetrics._rawFields || existing?._rawFields) {
      merged._rawFields = { ...existing?._rawFields };
      if (newMetrics._rawFields) {
        for (const [field, value] of Object.entries(newMetrics._rawFields)) {
          merged._rawFields[field] = (merged._rawFields[field] || 0) + value;
        }
      }
    }

    // Priority for attainment: source > candidate > computed
    // If we have source attainment, use first non-undefined source value
    if (newMetrics.attainmentSource === 'source' && newMetrics.attainment !== undefined) {
      merged.attainment = newMetrics.attainment;
      merged.attainmentSource = 'source';
    } else if (existing?.attainmentSource === 'source' && existing?.attainment !== undefined) {
      merged.attainment = existing.attainment;
      merged.attainmentSource = 'source';
    } else if (newMetrics.attainmentSource === 'candidate' && newMetrics.attainment !== undefined) {
      merged.attainment = newMetrics.attainment;
      merged.attainmentSource = 'candidate';
    } else if (existing?.attainmentSource === 'candidate' && existing?.attainment !== undefined) {
      merged.attainment = existing.attainment;
      merged.attainmentSource = 'candidate';
    } else if (merged.goal && merged.goal > 0) {
      // Recompute attainment from summed amounts/goals (weighted average)
      merged.attainment = ((merged.amount || 0) / merged.goal) * 100;
      merged.attainmentSource = 'computed';
    }

    return merged;
  };

  for (const content of componentRecords) {
    const sheetName = String(content['_sheetName'] || 'unknown');

    // OB-24 R4: Use ONLY the AI's actual semantic types
    // AI outputs exactly: employeeId|storeId|date|period|amount|goal|attainment|quantity|role
    // OB-24 R9: Use join-field-preference for employeeId/storeId to match roster's field names
    const empIdField = getJoinFieldWithPreference(sheetName, 'employeeId', rosterEmpIdField);
    const storeIdField = getJoinFieldWithPreference(sheetName, 'storeId', rosterStoreIdField);
    const attainmentField = getSheetFieldBySemantic(sheetName, 'attainment');
    // OB-24 R7: Use quantity as fallback for amount (both represent actual values)
    const amountField = getSheetFieldBySemantic(sheetName, 'amount') || getSheetFieldBySemantic(sheetName, 'quantity');
    const goalField = getSheetFieldBySemantic(sheetName, 'goal');
    // OB-24 R9: Get ALL period and date fields for multi-field period resolution
    const sheetInfo = aiContext?.sheets.find(s => {
      const sheet = s as { sheetName?: string; name?: string };
      return ((sheet.sheetName || sheet.name || '').toLowerCase() === sheetName.toLowerCase());
    });
    const componentPeriodFields = getAllFieldsForSemantic(sheetInfo, 'period');
    const componentDateFields = getAllFieldsForSemantic(sheetInfo, 'date');

    // OB-24 R8: Fallback for ID fields only (structural, not semantic)
    // Metrics use AI-first approach via resolveMetrics()
    const findIdFieldByPattern = (patterns: RegExp[]): string | null => {
      for (const key of Object.keys(content)) {
        if (key.startsWith('_')) continue;
        for (const pattern of patterns) {
          if (pattern.test(key)) return key;
        }
      }
      return null;
    };

    // ID fields: AI mapping first, then structural pattern fallback
    // OB-28: Added vendedor pattern for alternate employee ID fields (common in Spanish retail)
    const effectiveEmpIdField = empIdField || findIdFieldByPattern([
      /llave/i, /clave/i, /id.*emp/i, /num.*emp/i, /empleado/i, /vendedor/i
    ]);
    const effectiveStoreIdField = storeIdField || findIdFieldByPattern([
      /tienda/i, /store/i, /sucursal/i
    ]);

    // Skip sheet if no ID field found
    if (!effectiveEmpIdField && !effectiveStoreIdField) {
      console.warn(`[DataLayer] Sheet "${sheetName}" has no ID field - skipping`);
      continue;
    }

    // Extract IDs using safeFieldLookup for Unicode safety
    // OB-28: Use normalizeStoreId for consistent storeId matching
    const empId = effectiveEmpIdField ? normalizeEmpId(String(safeFieldLookup(content, effectiveEmpIdField) || '')) : '';
    const storeId = effectiveStoreIdField ? normalizeStoreId(String(safeFieldLookup(content, effectiveStoreIdField) || '')) : '';

    // OB-24 R9: Use resolvePeriodFromRecord for multi-field period extraction
    const componentPeriod = resolvePeriodFromRecord(content, componentPeriodFields, componentDateFields);
    const recordMonth = componentPeriod.month !== null ? String(componentPeriod.month) : '';
    const recordYear = componentPeriod.year !== null ? String(componentPeriod.year) : '';

    // Build period-aware key for aggregation (matches roster's emp_month_year key structure)
    const empPeriodKey = recordMonth || recordYear
      ? `${empId}_${recordMonth}_${recordYear}`
      : empId;
    const storePeriodKey = recordMonth || recordYear
      ? `${storeId}_${recordMonth}_${recordYear}`
      : storeId;

    // OB-24 R8: Use semantic resolution hierarchy for metrics
    // AI-first: no pattern fallbacks for attainment/amount/goal
    const resolvedMetrics = resolveMetrics(
      content as Record<string, unknown>,
      attainmentField,  // AI-mapped attainment field (or null)
      amountField,      // AI-mapped amount/quantity field (or null)
      goalField         // AI-mapped goal field (or null)
    );

    // OB-24 R9: Determine topology using classifySheets result
    const topology = sheetTopology.get(sheetName);
    const isStoreLevel = topology?.topology === 'store_component' || (!empId && storeId);

    // OB-24 R9: Aggregate by period-aware keys to match roster structure
    // Aggregate by employee ID + period for employee-level sheets
    if (!isStoreLevel && empId && empId.length >= 3 && empId !== 'undefined') {
      if (!empComponentMetrics.has(empPeriodKey)) {
        empComponentMetrics.set(empPeriodKey, new Map());
      }
      const empSheets = empComponentMetrics.get(empPeriodKey)!;
      const existing = empSheets.get(sheetName) as MergedMetrics | undefined;
      empSheets.set(sheetName, mergeMetrics(existing, resolvedMetrics));
    }

    // HF-017: Aggregate by store ID + period ONLY for store_component sheets
    // Bug fix: Previously added ANY record with storeId, now uses topology classification
    if (isStoreLevel && storeId && storeId.length >= 1) {
      if (!storeComponentMetrics.has(storePeriodKey)) {
        storeComponentMetrics.set(storePeriodKey, new Map());
      }
      const storeSheets = storeComponentMetrics.get(storePeriodKey)!;
      const existing = storeSheets.get(sheetName) as MergedMetrics | undefined;
      storeSheets.set(sheetName, mergeMetrics(existing, resolvedMetrics));

      // HF-017: Also index by storeId-only key for period-agnostic lookup
      // This ensures employees with periods can find store data without periods
      if (storePeriodKey !== storeId) {
        if (!storeComponentMetrics.has(storeId)) {
          storeComponentMetrics.set(storeId, new Map());
        }
        const storeOnlySheets = storeComponentMetrics.get(storeId)!;
        const existingOnly = storeOnlySheets.get(sheetName) as MergedMetrics | undefined;
        storeOnlySheets.set(sheetName, mergeMetrics(existingOnly, resolvedMetrics));
      }
    }
  }

  console.log(`[DataLayer] Employee componentMetrics: ${empComponentMetrics.size} employees`);
  console.log(`[DataLayer] Store componentMetrics: ${storeComponentMetrics.size} store keys`);

  // HF-017: Enhanced store index diagnostic logging
  if (storeComponentMetrics.size > 0) {
    // Collect all unique sheets across all store entries
    const allStoreSheets = new Set<string>();
    let totalStoreRecords = 0;
    for (const [, sheetMap] of Array.from(storeComponentMetrics.entries())) {
      for (const sheetName of Array.from(sheetMap.keys())) {
        allStoreSheets.add(sheetName);
        totalStoreRecords++;
      }
    }

    const sampleStoreKeys = Array.from(storeComponentMetrics.keys()).slice(0, 5);
    console.log(`[Store Index] Built store index: ${storeComponentMetrics.size} keys, ${totalStoreRecords} records across ${allStoreSheets.size} sheets`);
    console.log(`[Store Index] Key sample: ${sampleStoreKeys.join(', ')}`);
    console.log(`[Store Index] Sheets in index: ${Array.from(allStoreSheets).join(', ')}`);

    // Verify all sheets in index are store_component
    for (const sheetName of Array.from(allStoreSheets)) {
      const topo = sheetTopology.get(sheetName);
      if (topo?.topology !== 'store_component') {
        console.warn(`[Store Index] WARNING: Sheet "${sheetName}" in store index but topology is ${topo?.topology || 'NOT FOUND'}`);
      }
    }
  } else {
    console.warn(`[Store Index] WARNING: No store component data indexed. Store attribution will fail.`);
  }

  // STEP 4: Build aggregated records with componentMetrics (SMART COMPRESSION)
  // Each employee gets: identity fields + componentMetrics (attainment/amount/goal per sheet)
  const aggregated: Record<string, unknown>[] = [];

  // HF-017: Track store attribution for diagnostics
  let storeAttributionAttempts = 0;
  let storeAttributionSuccess = 0;
  let storeAttributionFiltered = 0;
  let firstStoreLookupLogged = false;

  for (const [, emp] of Array.from(employeeMap.entries())) {
    // OB-24 R6: Use normalized empId for consistent Map key lookup
    // OB-28: Use normalized storeId for consistent store attribution
    const empId = normalizeEmpId(String(emp.employeeId));
    const storeId = normalizeStoreId(String(emp.storeId || ''));
    const month = String(emp.month || '');
    const year = String(emp.year || '');

    // OB-24 R9: Build period-aware keys matching the component aggregation key format
    const empPeriodKey = month || year ? `${empId}_${month}_${year}` : empId;
    const storePeriodKey = month || year ? `${storeId}_${month}_${year}` : storeId;

    // Start with identity fields only
    const enriched: Record<string, unknown> = {
      employeeId: emp.employeeId,
      name: emp.name,
      role: emp.role,
      storeId: emp.storeId,
      storeRange: emp.storeRange,
      month: emp.month,
      year: emp.year,
      tenantId,
      batchId,
    };

    // AI-DRIVEN: Build componentMetrics structure - includes attainmentSource for audit trail
    // OB-27B: Extended to preserve ALL numeric fields (Carry Everything principle)
    const componentMetrics: Record<string, {
      attainment?: number;
      attainmentSource?: 'source' | 'computed' | 'candidate';
      amount?: number;
      goal?: number;
      _candidateAttainment?: number;
      _candidateAttainmentField?: string;
      _rawFields?: Record<string, number>;
    }> = {};

    // OB-24 R9: Add employee-level component metrics using period-aware key
    const empMetrics = empComponentMetrics.get(empPeriodKey);
    if (empMetrics) {
      for (const [sheetName, metrics] of Array.from(empMetrics.entries())) {
        componentMetrics[sheetName] = { ...metrics };
      }
    }

    // OB-24 R9: Add store-level component metrics ONLY for sheets classified as store_component
    // This is topology-aware: only join store data to employee if the sheet is store-level
    // Use period-aware key for proper period isolation
    // OB-28: Added fallback to non-period key for period-less store attribution
    let storeMetrics = storeComponentMetrics.get(storePeriodKey);

    // OB-28: Fallback to non-period key if period-aware key not found
    let usedFallbackKey = false;
    if (!storeMetrics && storePeriodKey !== storeId && storeId) {
      storeMetrics = storeComponentMetrics.get(storeId);
      usedFallbackKey = !!storeMetrics;
    }

    // HF-017: Log first store lookup for debugging
    if (!firstStoreLookupLogged && storeId) {
      const keyUsed = usedFallbackKey ? storeId : storePeriodKey;
      const found = !!storeMetrics;
      console.log(`[Store Join] Sample lookup: employee ${empId} (storeId=${storeId}), key="${keyUsed}", found=${found}`);
      if (storeMetrics) {
        console.log(`[Store Join]   Sheets in match: ${Array.from(storeMetrics.keys()).join(', ')}`);
      }
      firstStoreLookupLogged = true;
    }

    if (storeMetrics) {
      storeAttributionAttempts++;
      for (const [sheetName, metrics] of Array.from(storeMetrics.entries())) {
        const topology = sheetTopology.get(sheetName);
        // Only add store metrics if sheet is classified as store_component
        // AND not already present from employee-level
        if (topology?.topology === 'store_component' && !componentMetrics[sheetName]) {
          componentMetrics[sheetName] = { ...metrics };
          storeAttributionSuccess++;
        } else if (componentMetrics[sheetName]) {
          // Already present from employee-level - expected
        } else {
          // Filtered due to topology
          storeAttributionFiltered++;
        }
      }
    }

    if (Object.keys(componentMetrics).length > 0) {
      enriched.componentMetrics = componentMetrics;
      enriched._hasData = true;
    }

    aggregated.push(enriched);
  }

  console.log(`[DataLayer] Final aggregated records: ${aggregated.length}`);

  // HF-017: Enhanced store join logging
  const employeesWithStoreId = Array.from(employeeMap.values()).filter(e => e.storeId && String(e.storeId).trim()).length;
  const employeesWithNoStoreMatch = employeesWithStoreId - storeAttributionAttempts;
  console.log(`[Store Join] Attribution result: ${storeAttributionSuccess} sheets joined to employees`);
  console.log(`[Store Join] ${storeAttributionAttempts}/${employeesWithStoreId} employees found matching store data`);
  if (employeesWithNoStoreMatch > 0) {
    console.warn(`[Store Join] ${employeesWithNoStoreMatch} employees had storeId but no matching store data in index`);
  }
  if (storeAttributionFiltered > 0) {
    console.log(`[Store Join] ${storeAttributionFiltered} sheet entries filtered (non-store_component topology)`);
  }

  // STEP 5: Store to localStorage (componentMetrics structure is already compact)
  const serialized = JSON.stringify(aggregated);
  const sizeKB = Math.round(serialized.length / 1024);
  console.log(`[DataLayer] Aggregated payload: ${sizeKB} KB (${aggregated.length} records)`);

  // Log sample of first employee's componentMetrics for verification
  if (aggregated.length > 0 && aggregated[0].componentMetrics) {
    console.log(`[DataLayer] Sample componentMetrics:`, JSON.stringify(aggregated[0].componentMetrics).substring(0, 300));
  }

  // ComponentMetrics structure is compact (3 fields per sheet), should fit easily
  // If still too large (>4MB), reduce precision
  let dataToStore = serialized;
  let finalSizeKB = sizeKB;

  if (sizeKB > 4000) {
    console.warn(`[DataLayer] Payload ${sizeKB} KB exceeds 4MB, reducing precision...`);
    const reduced = aggregated.map(emp => {
      const reduced = { ...emp };
      if (reduced.componentMetrics) {
        const cm = reduced.componentMetrics as Record<string, MergedMetrics>;
        for (const sheetName of Object.keys(cm)) {
          if (cm[sheetName].attainment !== undefined) {
            cm[sheetName].attainment = Math.round(cm[sheetName].attainment! * 100) / 100;
          }
          if (cm[sheetName].amount !== undefined) {
            cm[sheetName].amount = Math.round(cm[sheetName].amount!);
          }
          if (cm[sheetName].goal !== undefined) {
            cm[sheetName].goal = Math.round(cm[sheetName].goal!);
          }
          // OB-27B: Also reduce precision on raw fields
          if (cm[sheetName]._rawFields) {
            for (const field of Object.keys(cm[sheetName]._rawFields!)) {
              cm[sheetName]._rawFields![field] = Math.round(cm[sheetName]._rawFields![field] * 100) / 100;
            }
          }
        }
      }
      return reduced;
    });
    dataToStore = JSON.stringify(reduced);
    finalSizeKB = Math.round(dataToStore.length / 1024);
    console.log(`[DataLayer] Reduced payload: ${finalSizeKB} KB`);
  }

  try {
    const storageKey = `${STORAGE_KEYS.COMMITTED}_aggregated_${tenantId}`;
    localStorage.setItem(storageKey, dataToStore);
    localStorage.setItem(`${storageKey}_meta`, JSON.stringify({
      tenantId, batchId, sourceRecords: records.length,
      employees: aggregated.length, sizeKB: finalSizeKB,
      hasComponentMetrics: true,
      timestamp: Date.now()
    }));

    // Verify storage succeeded
    const verify = localStorage.getItem(storageKey);
    if (verify && verify.length > 0) {
      console.log(`[DataLayer] SUCCESS: Stored ${aggregated.length} employees, ${finalSizeKB} KB`);
      reportStorageUsage();
    } else {
      console.error(`[DataLayer] FAILED: Verification failed - key not found after write`);
    }

    return { employeeCount: aggregated.length, sizeKB: finalSizeKB };
  } catch (error) {
    console.error('[DataLayer] FAILED to store aggregated data:', error);
    reportStorageUsage();
    return { employeeCount: 0, sizeKB: 0 };
  }
}

/**
 * Load aggregated employee data for a tenant
 */
export function loadAggregatedData(tenantId: string): Array<Record<string, unknown>> {
  if (typeof window === 'undefined') return [];

  const storageKey = `${STORAGE_KEYS.COMMITTED}_aggregated_${tenantId}`;
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    console.log(`[DataLayer] No aggregated data found for tenant ${tenantId}`);
    return [];
  }

  try {
    const aggregated = JSON.parse(stored);
    console.log(`[DataLayer] Loaded ${aggregated.length} aggregated employees for tenant ${tenantId}`);
    return aggregated;
  } catch (error) {
    console.error('[DataLayer] Failed to parse aggregated data:', error);
    return [];
  }
}

/**
 * OB-16C: Cleanup stale data from localStorage
 */
export function cleanupStaleData(currentTenantId: string): void {
  if (typeof window === 'undefined') return;

  console.log(`[DataLayer] Running stale data cleanup for tenant: ${currentTenantId}`);

  let removedKeys = 0;
  let freedBytes = 0;
  const keysToRemove: string[] = [];

  // Collect keys to process
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) allKeys.push(key);
  }

  for (const key of allKeys) {
    const value = localStorage.getItem(key);
    if (!value) continue;

    // Remove chunk orphans (chunks without metadata)
    if (key.includes('_chunk_')) {
      const baseKey = key.replace(/_chunk_\d+$/, '');
      if (!localStorage.getItem(`${baseKey}_meta`)) {
        keysToRemove.push(key);
        continue;
      }
    }

    // Clean old tenant data from batches
    if (key === STORAGE_KEYS.BATCHES || key.includes('data_layer_batches')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((item: [string, { tenantId?: string }]) => {
            const itemTenant = item[1]?.tenantId || '';
            return itemTenant === currentTenantId || itemTenant === '';
          });
          if (filtered.length < parsed.length) {
            console.log(`[DataLayer] Cleaned ${key}: ${parsed.length} -> ${filtered.length} batches`);
            freedBytes += value.length - JSON.stringify(filtered).length;
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      } catch {
        // Not parseable, skip
      }
    }

    // Remove aggregated data for other tenants
    if (key.includes('_aggregated_') && !key.includes(currentTenantId)) {
      keysToRemove.push(key);
      keysToRemove.push(`${key}_meta`);
    }
  }

  // Remove identified keys
  for (const key of keysToRemove) {
    const size = localStorage.getItem(key)?.length || 0;
    localStorage.removeItem(key);
    removedKeys++;
    freedBytes += size;
  }

  console.log(`[DataLayer] Cleanup complete: removed ${removedKeys} keys, freed ~${Math.round(freedBytes / 1024)} KB`);
  reportStorageUsage();
}

export function initializeDataLayer(): void {
  memoryCache.raw = loadFromStorage<RawRecord>(STORAGE_KEYS.RAW);
  memoryCache.transformed = loadFromStorage<TransformedRecord>(STORAGE_KEYS.TRANSFORMED);
  // OB-16C: Use chunked loading for potentially large committed data
  memoryCache.committed = loadFromStorageChunked<CommittedRecord>(STORAGE_KEYS.COMMITTED);
  memoryCache.batches = loadFromStorage<ImportBatch>(STORAGE_KEYS.BATCHES);
  memoryCache.checkpoints = loadFromStorage<Checkpoint>(STORAGE_KEYS.CHECKPOINTS);

  // Seed foundation demo data if not already present
  if (!isFoundationDataSeeded()) {
    seedFoundationDemoData();
  }

  // Load seeded batches into memory cache
  if (memoryCache.batches.size === 0) {
    const seededBatches = getSeededImportBatches();
    seededBatches.forEach((batch) => {
      memoryCache.batches.set(batch.id, batch);
    });
  }

  // Load seeded checkpoints into memory cache
  if (memoryCache.checkpoints.size === 0) {
    const seededCheckpoints = getSeededCheckpoints();
    seededCheckpoints.forEach((checkpoint) => {
      memoryCache.checkpoints.set(checkpoint.id, checkpoint);
    });
  }
}

function persistAll(): void {
  // Use regular storage for small datasets
  saveToStorage(STORAGE_KEYS.RAW, memoryCache.raw);
  saveToStorage(STORAGE_KEYS.TRANSFORMED, memoryCache.transformed);
  saveToStorage(STORAGE_KEYS.BATCHES, memoryCache.batches);
  saveToStorage(STORAGE_KEYS.CHECKPOINTS, memoryCache.checkpoints);

  // OB-16C: Use chunked storage for potentially large committed data
  saveToStorageChunked(STORAGE_KEYS.COMMITTED, memoryCache.committed);
}

// ============================================
// RAW LAYER OPERATIONS
// ============================================

/**
 * Generate SHA-256-like checksum for content verification
 */
function generateChecksum(content: Record<string, unknown>): string {
  const str = JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Store immutable raw records from an import batch
 */
export function createRawRecords(
  batch: ImportBatch,
  records: Omit<RawRecord, 'id' | 'checksum'>[]
): RawRecord[] {
  const rawRecords: RawRecord[] = records.map((record, index) => ({
    ...record,
    id: `raw-${batch.id}-${index}`,
    checksum: generateChecksum(record.rawContent),
  }));

  rawRecords.forEach((record) => {
    memoryCache.raw.set(record.id, record);
  });

  memoryCache.batches.set(batch.id, batch);
  persistAll();

  return rawRecords;
}

/**
 * Get raw record by ID
 */
export function getRawRecord(id: string): RawRecord | null {
  return memoryCache.raw.get(id) || null;
}

/**
 * Get all raw records for a batch
 */
export function getRawRecordsByBatch(batchId: string): RawRecord[] {
  return Array.from(memoryCache.raw.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

// ============================================
// TRANSFORMED LAYER OPERATIONS
// ============================================

/**
 * Run transformation pipeline on raw records, create transformed records with full lineage
 */
export async function transformRecords(
  batchId: string,
  pipeline: TransformPipeline,
  userId: string = 'system'
): Promise<TransformedRecord[]> {
  const rawRecords = getRawRecordsByBatch(batchId);
  const transformedRecords: TransformedRecord[] = [];

  for (const rawRecord of rawRecords) {
    const result = await runTransformPipeline(rawRecord, pipeline);

    const transformedRecord: TransformedRecord = {
      id: `trans-${rawRecord.id}`,
      rawRecordId: rawRecord.id,
      importBatchId: batchId,
      transformedAt: new Date().toISOString(),
      transformedBy: userId,
      content: result.content,
      transformations: result.transformations,
      validationResults: result.validationResults,
      classification: result.classification,
      confidenceScore: result.confidenceScore,
      lineage: {
        rawChecksum: rawRecord.checksum,
        transformPipelineVersion: pipeline.version,
        rulesApplied: result.rulesApplied,
      },
    };

    memoryCache.transformed.set(transformedRecord.id, transformedRecord);
    transformedRecords.push(transformedRecord);
  }

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    const summary = calculateBatchSummary(transformedRecords);
    batch.summary = summary;
    batch.status = 'awaiting_approval';
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();
  return transformedRecords;
}

/**
 * Get transformed record by ID
 */
export function getTransformedRecord(id: string): TransformedRecord | null {
  return memoryCache.transformed.get(id) || null;
}

/**
 * Get all transformed records for a batch
 */
export function getTransformedRecordsByBatch(batchId: string): TransformedRecord[] {
  return Array.from(memoryCache.transformed.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

function calculateBatchSummary(records: TransformedRecord[]): ImportBatch['summary'] {
  const clean = records.filter((r) => r.classification === 'clean').length;
  const autoCorrected = records.filter((r) => r.classification === 'auto_corrected').length;
  const quarantined = records.filter((r) => r.classification === 'quarantined').length;
  const rejected = records.filter((r) => r.classification === 'rejected').length;

  const qualityScore = Math.round(
    ((clean + autoCorrected * 0.8) / records.length) * 100
  );

  return {
    totalRecords: records.length,
    cleanRecords: clean,
    autoCorrectedRecords: autoCorrected,
    quarantinedRecords: quarantined,
    rejectedRecords: rejected,
    dataQualityScore: qualityScore,
    anomalyFlags: [],
  };
}

// ============================================
// COMMITTED LAYER OPERATIONS
// ============================================

/**
 * Commit approved records (all or selective by IDs)
 */
export function commitRecords(
  batchId: string,
  approvalId: string,
  userId: string,
  recordIds?: string[]
): CommittedRecord[] {
  const transformedRecords = getTransformedRecordsByBatch(batchId);
  const toCommit = recordIds
    ? transformedRecords.filter((r) => recordIds.includes(r.id))
    : transformedRecords.filter(
        (r) => r.classification === 'clean' || r.classification === 'auto_corrected'
      );

  const committedRecords: CommittedRecord[] = toCommit.map((transformed) => ({
    id: `commit-${transformed.id}`,
    transformedRecordId: transformed.id,
    rawRecordId: transformed.rawRecordId,
    importBatchId: batchId,
    committedAt: new Date().toISOString(),
    committedBy: userId,
    approvalId,
    content: transformed.content,
    status: 'active' as const,
  }));

  committedRecords.forEach((record) => {
    memoryCache.committed.set(record.id, record);
  });

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    const allTransformed = getTransformedRecordsByBatch(batchId);
    const committableCount = allTransformed.filter(
      (r) => r.classification === 'clean' || r.classification === 'auto_corrected'
    ).length;

    if (committedRecords.length === committableCount) {
      batch.status = 'approved';
    } else if (committedRecords.length > 0) {
      batch.status = 'partially_approved';
    }
    batch.approvalId = approvalId;
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();
  return committedRecords;
}

/**
 * Get committed record by ID
 */
export function getCommittedRecord(id: string): CommittedRecord | null {
  return memoryCache.committed.get(id) || null;
}

/**
 * Get all committed records for a batch
 */
export function getCommittedRecordsByBatch(batchId: string): CommittedRecord[] {
  return Array.from(memoryCache.committed.values()).filter(
    (record) => record.importBatchId === batchId
  );
}

/**
 * Get all active committed records for a tenant
 */
export function getActiveCommittedRecords(tenantId: string): CommittedRecord[] {
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  return Array.from(memoryCache.committed.values()).filter(
    (record) =>
      tenantBatchIds.includes(record.importBatchId) && record.status === 'active'
  );
}

// ============================================
// LINEAGE & TIME TRAVEL
// ============================================

/**
 * Get full provenance chain for a committed record
 */
export function getRecordLineage(committedRecordId: string): RecordLineage | null {
  const committed = memoryCache.committed.get(committedRecordId);
  if (!committed) return null;

  const transformed = memoryCache.transformed.get(committed.transformedRecordId);
  if (!transformed) return null;

  const raw = memoryCache.raw.get(transformed.rawRecordId);
  if (!raw) return null;

  return { raw, transformed, committed };
}

/**
 * View record state at any point in time
 */
export function getTimeTravelView(
  recordId: string,
  timestamp: string
): TimeTravelSnapshot | null {
  const targetTime = new Date(timestamp).getTime();

  // Check committed first
  const committed = Array.from(memoryCache.committed.values()).find(
    (r) =>
      (r.id === recordId || r.rawRecordId === recordId) &&
      new Date(r.committedAt).getTime() <= targetTime
  );

  if (committed) {
    return {
      recordId: committed.id,
      timestamp,
      layer: 'committed',
      content: committed.content,
      status: committed.status,
    };
  }

  // Check transformed
  const transformed = Array.from(memoryCache.transformed.values()).find(
    (r) =>
      (r.id === recordId || r.rawRecordId === recordId) &&
      new Date(r.transformedAt).getTime() <= targetTime
  );

  if (transformed) {
    return {
      recordId: transformed.id,
      timestamp,
      layer: 'transformed',
      content: transformed.content,
      status: transformed.classification,
    };
  }

  // Fall back to raw
  const raw = memoryCache.raw.get(recordId);
  if (raw && new Date(raw.receivedAt).getTime() <= targetTime) {
    return {
      recordId: raw.id,
      timestamp,
      layer: 'raw',
      content: raw.rawContent,
      status: 'received',
    };
  }

  return null;
}

// ============================================
// ROLLBACK OPERATIONS
// ============================================

/**
 * Roll back committed records for a batch
 */
export function rollbackBatch(
  batchId: string,
  reason: string,
  userId: string
): RollbackResult {
  const committedRecords = getCommittedRecordsByBatch(batchId);

  if (committedRecords.length === 0) {
    return {
      success: false,
      batchId,
      recordsAffected: 0,
      cascadeAffected: [],
      rollbackTimestamp: new Date().toISOString(),
      message: 'No committed records found for this batch',
    };
  }

  // Mark all committed records as rolled back
  const rollbackTimestamp = new Date().toISOString();
  committedRecords.forEach((record) => {
    record.status = 'rolled_back';
    record.rollbackInfo = {
      rolledBackAt: rollbackTimestamp,
      rolledBackBy: userId,
      reason,
      cascadeAffected: [],
    };
    memoryCache.committed.set(record.id, record);
  });

  // Update batch status
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    batch.status = 'rolled_back';
    memoryCache.batches.set(batchId, batch);
  }

  persistAll();

  return {
    success: true,
    batchId,
    recordsAffected: committedRecords.length,
    cascadeAffected: [], // Would be populated by cascade analyzer
    rollbackTimestamp,
    message: `Successfully rolled back ${committedRecords.length} records`,
  };
}

// ============================================
// CHECKPOINT OPERATIONS
// ============================================

/**
 * Create a named checkpoint for rollback
 */
export function createCheckpoint(
  tenantId: string,
  name: string,
  description: string,
  userId: string
): Checkpoint {
  const tenantBatches = Array.from(memoryCache.batches.values()).filter(
    (b) => b.tenantId === tenantId
  );

  const checkpoint: Checkpoint = {
    id: `checkpoint-${Date.now()}`,
    tenantId,
    name,
    description,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    snapshotData: {
      batchIds: tenantBatches.map((b) => b.id),
      recordCounts: {
        raw: Array.from(memoryCache.raw.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
        transformed: Array.from(memoryCache.transformed.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
        committed: Array.from(memoryCache.committed.values()).filter((r) =>
          tenantBatches.some((b) => b.id === r.importBatchId)
        ).length,
      },
    },
  };

  memoryCache.checkpoints.set(checkpoint.id, checkpoint);
  persistAll();

  return checkpoint;
}

/**
 * Get checkpoints for a tenant
 */
export function getCheckpoints(tenantId: string): Checkpoint[] {
  return Array.from(memoryCache.checkpoints.values())
    .filter((c) => c.tenantId === tenantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Get import batch by ID
 */
export function getImportBatch(id: string): ImportBatch | null {
  return memoryCache.batches.get(id) || null;
}

/**
 * Get all import batches for a tenant
 */
export function getImportBatches(tenantId: string): ImportBatch[] {
  return Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
}

/**
 * Update batch status
 */
export function updateBatchStatus(
  batchId: string,
  status: ImportBatch['status'],
  approvalId?: string
): void {
  const batch = memoryCache.batches.get(batchId);
  if (batch) {
    batch.status = status;
    if (approvalId) batch.approvalId = approvalId;
    memoryCache.batches.set(batchId, batch);
    persistAll();
  }
}

// ============================================
// TENANT RESET
// ============================================

/**
 * Reset all data for a tenant
 */
export function resetTenantData(tenantId: string): void {
  // Get all batch IDs for this tenant
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  // Remove raw records
  Array.from(memoryCache.raw.keys()).forEach((key) => {
    const record = memoryCache.raw.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.raw.delete(key);
    }
  });

  // Remove transformed records
  Array.from(memoryCache.transformed.keys()).forEach((key) => {
    const record = memoryCache.transformed.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.transformed.delete(key);
    }
  });

  // Remove committed records
  Array.from(memoryCache.committed.keys()).forEach((key) => {
    const record = memoryCache.committed.get(key);
    if (record && tenantBatchIds.includes(record.importBatchId)) {
      memoryCache.committed.delete(key);
    }
  });

  // Remove batches
  tenantBatchIds.forEach((id) => memoryCache.batches.delete(id));

  // Remove checkpoints
  Array.from(memoryCache.checkpoints.keys()).forEach((key) => {
    const checkpoint = memoryCache.checkpoints.get(key);
    if (checkpoint && checkpoint.tenantId === tenantId) {
      memoryCache.checkpoints.delete(key);
    }
  });

  persistAll();
}

// ============================================
// STATISTICS
// ============================================

export function getDataLayerStats(tenantId: string): {
  raw: number;
  transformed: number;
  committed: number;
  batches: number;
  checkpoints: number;
} {
  const tenantBatchIds = Array.from(memoryCache.batches.values())
    .filter((b) => b.tenantId === tenantId)
    .map((b) => b.id);

  return {
    raw: Array.from(memoryCache.raw.values()).filter((r) =>
      tenantBatchIds.includes(r.importBatchId)
    ).length,
    transformed: Array.from(memoryCache.transformed.values()).filter((r) =>
      tenantBatchIds.includes(r.importBatchId)
    ).length,
    committed: Array.from(memoryCache.committed.values()).filter(
      (r) => tenantBatchIds.includes(r.importBatchId) && r.status === 'active'
    ).length,
    batches: tenantBatchIds.length,
    checkpoints: Array.from(memoryCache.checkpoints.values()).filter(
      (c) => c.tenantId === tenantId
    ).length,
  };
}

// ============================================
// DIRECT COMMIT FOR UI IMPORTS
// ============================================

/**
 * Directly commit import data from the UI without going through the full pipeline.
 * Used by the enhanced import page when user clicks "Approve Import".
 *
 * This bypasses raw/transformed stages but still stores data in the format
 * that extractEmployeesFromCommittedData() expects.
 */
export function directCommitImportData(
  tenantId: string,
  userId: string,
  fileName: string,
  sheetData: Array<{
    sheetName: string;
    rows: Record<string, unknown>[];
    mappings?: Record<string, string>; // sourceColumn -> targetField
  }>,
  providedBatchId?: string  // OB-24 FIX: Allow caller to provide batchId for import context ordering
): { batchId: string; recordCount: number } {
  const batchId = providedBatchId || `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create the import batch
  const batch: ImportBatch = {
    id: batchId,
    tenantId,
    sourceSystem: 'excel-import',
    sourceFormat: 'xlsx',
    fileName,
    importedAt: new Date().toISOString(),
    importedBy: userId,
    status: 'approved',
    summary: {
      totalRecords: 0,
      cleanRecords: 0,
      autoCorrectedRecords: 0,
      quarantinedRecords: 0,
      rejectedRecords: 0,
      dataQualityScore: 100,
      anomalyFlags: [],
    },
  };

  let totalRecords = 0;

  // Process each sheet's data
  for (const sheet of sheetData) {
    for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
      const row = sheet.rows[rowIndex];
      const recordId = `commit-${batchId}-${sheet.sheetName}-${rowIndex}`;

      // Apply field mappings if provided
      let content = { ...row };
      if (sheet.mappings) {
        const mappedContent: Record<string, unknown> = {};
        for (const [sourceCol, value] of Object.entries(row)) {
          const targetField = sheet.mappings[sourceCol];
          if (targetField && targetField !== 'ignore') {
            // Store both original and mapped field for flexibility
            mappedContent[targetField] = value;
          }
          // Always keep original field too
          mappedContent[sourceCol] = value;
        }
        content = mappedContent;
      }

      // Add sheet metadata
      content._sheetName = sheet.sheetName;
      content._rowIndex = rowIndex;

      const committedRecord: CommittedRecord = {
        id: recordId,
        transformedRecordId: `trans-${recordId}`,
        rawRecordId: `raw-${recordId}`,
        importBatchId: batchId,
        committedAt: new Date().toISOString(),
        committedBy: userId,
        content,
        status: 'active',
      };

      memoryCache.committed.set(recordId, committedRecord);
      totalRecords++;
    }
  }

  // Update batch summary
  batch.summary.totalRecords = totalRecords;
  batch.summary.cleanRecords = totalRecords;
  memoryCache.batches.set(batchId, batch);

  // OB-16B: Log what we're about to persist
  console.log(`[DataLayer] About to persist:`);
  console.log(`[DataLayer]   - Committed records in memory: ${memoryCache.committed.size}`);
  console.log(`[DataLayer]   - Batches in memory: ${memoryCache.batches.size}`);

  // Persist to localStorage
  persistAll();

  // OB-16B: Verify persistence
  const committedMeta = localStorage.getItem(`${STORAGE_KEYS.COMMITTED}_meta`);
  const batchesVerify = localStorage.getItem(STORAGE_KEYS.BATCHES);
  console.log(`[DataLayer] Post-persist verification:`);
  if (committedMeta) {
    const meta = JSON.parse(committedMeta);
    console.log(`[DataLayer]   - Committed: ${meta.total} records, ${meta.sizeKB} KB, ${meta.chunks || 0} chunks`);
  } else {
    const committedVerify = localStorage.getItem(STORAGE_KEYS.COMMITTED);
    console.log(`[DataLayer]   - Committed in localStorage: ${committedVerify ? 'YES' : 'NO'} (${committedVerify ? Math.round(committedVerify.length / 1024) : 0} KB)`);
  }
  console.log(`[DataLayer]   - Batches in localStorage: ${batchesVerify ? 'YES' : 'NO'}`);

  // OB-16C HOTFIX: Free localStorage space before aggregation
  // Raw and Transformed data are intermediate pipeline stages - not needed after commit
  try {
    const freedRaw = memoryCache.raw.size;
    const freedTransformed = memoryCache.transformed.size;
    const freedCheckpoints = memoryCache.checkpoints.size;

    // Clear from localStorage
    localStorage.removeItem(STORAGE_KEYS.RAW);
    localStorage.removeItem(STORAGE_KEYS.TRANSFORMED);
    localStorage.removeItem(STORAGE_KEYS.CHECKPOINTS);

    // Clear any chunks
    clearChunks(STORAGE_KEYS.RAW);
    clearChunks(STORAGE_KEYS.TRANSFORMED);
    clearChunks(STORAGE_KEYS.CHECKPOINTS);

    // Clear memory cache
    memoryCache.raw.clear();
    memoryCache.transformed.clear();
    memoryCache.checkpoints.clear();

    console.log(`[DataLayer] Freed localStorage: cleared ${freedRaw} raw + ${freedTransformed} transformed + ${freedCheckpoints} checkpoints`);
    reportStorageUsage();
  } catch (cleanupErr) {
    console.warn('[DataLayer] Failed to clear raw/transformed:', cleanupErr);
  }

  // NUCLEAR CLEANUP: Remove ALL data_layer keys except batches and current aggregated
  // This removes any orphaned chunks from failed saveToStorageChunked attempts
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('data_layer_') &&
          !key.startsWith('data_layer_batches') &&
          !key.includes('_aggregated_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    if (keysToRemove.length > 0) {
      console.log(`[DataLayer] Nuclear cleanup removed ${keysToRemove.length} stale keys: ${keysToRemove.slice(0, 5).join(', ')}${keysToRemove.length > 5 ? '...' : ''}`);
      reportStorageUsage();
    }
  } catch (nuclearErr) {
    console.warn('[DataLayer] Nuclear cleanup failed:', nuclearErr);
  }

  // OB-16C HOTFIX: Store aggregated data for calculation engine
  // This runs INDEPENDENTLY of committed data persistence
  // Even if committed data exceeds localStorage quota, aggregated data (~50KB) will persist
  try {
    console.log(`[DataLayer] Preparing aggregation from memoryCache.committed (${memoryCache.committed.size} total records)...`);
    const allCommittedRecords = Array.from(memoryCache.committed.values())
      .filter(r => r.importBatchId === batchId);
    console.log(`[DataLayer]   - Records matching batchId '${batchId}': ${allCommittedRecords.length}`);

    if (allCommittedRecords.length > 0) {
      const aggregateResult = storeAggregatedData(tenantId, batchId, allCommittedRecords);
      console.log(`[DataLayer] ✅ Aggregated: ${aggregateResult.employeeCount} employees, ${aggregateResult.sizeKB} KB`);

      // Verify the aggregated data was written
      const verifyKey = `${STORAGE_KEYS.COMMITTED}_aggregated_${tenantId}`;
      const verifyData = localStorage.getItem(verifyKey);
      console.log(`[DataLayer]   - Verification: ${verifyKey} = ${verifyData ? `${Math.round(verifyData.length / 1024)} KB` : 'NOT FOUND'}`);
    } else {
      console.warn(`[DataLayer] ⚠ No committed records in memory for batch ${batchId} - cannot aggregate`);
      console.log(`[DataLayer]   - All batch IDs in memory: ${Array.from(new Set(Array.from(memoryCache.committed.values()).map(r => r.importBatchId))).join(', ')}`);
    }
  } catch (aggError) {
    console.error('[DataLayer] ❌ Aggregation failed:', aggError);
  }

  console.log(`[DataLayer] Committed ${totalRecords} records from ${sheetData.length} sheets for tenant ${tenantId}`);

  return { batchId, recordCount: totalRecords };
}

/**
 * Store field mappings for a tenant/batch
 */
export function storeFieldMappings(
  tenantId: string,
  batchId: string,
  mappings: Array<{
    sheetName: string;
    mappings: Record<string, string>;
  }>
): void {
  const key = `field_mappings_${tenantId}`;
  const existing = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem(key) || '{}')
    : {};

  existing[batchId] = {
    timestamp: new Date().toISOString(),
    mappings,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(existing));
  }
}

/**
 * AI Import Context - stores the AI's analysis decisions for use by calculation engine
 */
export interface AIImportContext {
  tenantId: string;
  batchId: string;
  timestamp: string;
  rosterSheet: string | null;
  rosterEmployeeIdColumn: string | null;
  sheets: Array<{
    sheetName: string;
    classification: string; // roster | component_data | reference | etc
    matchedComponent: string | null;
    matchedComponentConfidence: number;
    fieldMappings: Array<{
      sourceColumn: string;
      semanticType: string; // employeeId | storeId | amount | goal | attainment | period | etc
      confidence: number;
    }>;
  }>;
}

/**
 * Store AI import context for calculation engine
 */
export function storeImportContext(context: AIImportContext): void {
  if (typeof window === 'undefined') return;

  const key = `ai_import_context_${context.tenantId}`;
  localStorage.setItem(key, JSON.stringify(context));
  console.log(`[DataLayer] Stored AI import context: ${context.sheets.length} sheets, roster=${context.rosterSheet}`);
}

/**
 * Load AI import context for a tenant
 */
export function loadImportContext(tenantId: string): AIImportContext | null {
  if (typeof window === 'undefined') return null;

  const key = `ai_import_context_${tenantId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Get stored field mappings for a tenant
 */
export function getFieldMappings(tenantId: string, batchId?: string): Record<string, string> | null {
  if (typeof window === 'undefined') return null;

  const key = `field_mappings_${tenantId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    if (batchId) {
      return parsed[batchId]?.mappings || null;
    }
    // Return most recent batch's mappings
    const batches = Object.entries(parsed).sort((a, b) =>
      new Date((b[1] as { timestamp: string }).timestamp).getTime() -
      new Date((a[1] as { timestamp: string }).timestamp).getTime()
    );
    return batches[0] ? (batches[0][1] as { mappings: Record<string, string> }).mappings : null;
  } catch {
    return null;
  }
}

// Initialize on module load
if (typeof window !== 'undefined') {
  initializeDataLayer();
}
