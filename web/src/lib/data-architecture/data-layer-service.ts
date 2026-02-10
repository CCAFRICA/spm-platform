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

  // AI-DRIVEN: Helper to find field value by semantic type
  const findFieldBySemantic = (row: Record<string, unknown>, semanticTypes: string[]): unknown => {
    if (!rosterSheetInfo?.fieldMappings) return undefined;
    for (const semantic of semanticTypes) {
      const mapping = rosterSheetInfo.fieldMappings.find(
        fm => fm.semanticType.toLowerCase() === semantic.toLowerCase()
      );
      if (mapping && row[mapping.sourceColumn] !== undefined) {
        return row[mapping.sourceColumn];
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

  for (const row of rosterRecords) {
    // AI-DRIVEN: Get employee ID using ONLY AI semantic mapping (NO HARDCODED FALLBACKS)
    const empId = getFieldValue(row, ['employeeId', 'employee_id']);
    if (!empId || empId.length < 3 || empId === 'undefined' || empId === 'null') continue;

    // Get period fields using AI semantic mapping
    const month = getFieldValue(row, ['period', 'month']);
    const year = getFieldValue(row, ['year']);
    const key = month || year ? `${empId}_${month}_${year}` : empId;

    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        employeeId: empId,
        // AI-DRIVEN: Extract identity fields using ONLY AI semantic mappings
        name: getFieldValue(row, ['name', 'employeeName', 'fullName']),
        role: getFieldValue(row, ['role', 'position', 'employeeType', 'jobTitle']),
        storeId: getFieldValue(row, ['storeId', 'locationId', 'store']),
        storeRange: getFieldValue(row, ['storeRange', 'category', 'storeCategory']),
        month,
        year,
        tenantId,
        batchId,
      });
    }
  }

  console.log(`[DataLayer] Unique employee records from roster: ${employeeMap.size}`);

  // AI-DRIVEN: If no roster records found, warn user - NO HARDCODED FALLBACKS
  if (employeeMap.size === 0) {
    console.warn('[DataLayer] NO EMPLOYEES FOUND - AI import context may be missing or roster sheet not identified.');
    console.warn('[DataLayer] Please re-import data with AI analysis to generate proper field mappings.');
    // Return early with empty result rather than using hardcoded column names
    return { employeeCount: 0, sizeKB: 0 };
  }

  // STEP 3: Build componentMetrics - AI-DRIVEN extraction of attainment/amount/goal per sheet
  // Key: employeeId -> sheetName -> { attainment, amount, goal }
  const empComponentMetrics = new Map<string, Map<string, { attainment?: number; amount?: number; goal?: number }>>();
  // Key: storeId -> sheetName -> { attainment, amount, goal }
  const storeComponentMetrics = new Map<string, Map<string, { attainment?: number; amount?: number; goal?: number }>>();

  // AI-DRIVEN: Helper to find semantic field in a sheet's AI mapping
  const getSheetFieldBySemantic = (sheetName: string, semanticTypes: string[]): string | null => {
    const sheetInfo = aiContext?.sheets.find(s => s.sheetName === sheetName || s.sheetName.toLowerCase() === sheetName.toLowerCase());
    if (!sheetInfo?.fieldMappings) return null;
    for (const semantic of semanticTypes) {
      const mapping = sheetInfo.fieldMappings.find(
        fm => fm.semanticType.toLowerCase() === semantic.toLowerCase()
      );
      if (mapping) return mapping.sourceColumn;
    }
    return null;
  };

  // AI-DRIVEN: Helper to check if sheet joins by storeId (vs employeeId)
  const isStoreJoinSheet = (sheetName: string): boolean => {
    const sheetInfo = aiContext?.sheets.find(s => s.sheetName === sheetName || s.sheetName.toLowerCase() === sheetName.toLowerCase());
    if (!sheetInfo?.fieldMappings) return false;
    // If sheet has storeId mapping but no employeeId mapping, it's store-level
    const hasStoreId = sheetInfo.fieldMappings.some(fm =>
      ['storeId', 'locationId', 'store'].includes(fm.semanticType.toLowerCase())
    );
    const hasEmployeeId = sheetInfo.fieldMappings.some(fm =>
      ['employeeId', 'employee_id'].includes(fm.semanticType.toLowerCase())
    );
    return hasStoreId && !hasEmployeeId;
  };

  for (const content of componentRecords) {
    const sheetName = String(content['_sheetName'] || 'unknown');

    // AI-DRIVEN: Get ID fields using ONLY AI mappings (NO HARDCODED FALLBACKS)
    const empIdField = getSheetFieldBySemantic(sheetName, ['employeeId', 'employee_id']);
    const storeIdField = getSheetFieldBySemantic(sheetName, ['storeId', 'locationId', 'store']);
    const attainmentField = getSheetFieldBySemantic(sheetName, ['attainment', 'achievement', 'performance']);
    const amountField = getSheetFieldBySemantic(sheetName, ['amount', 'value', 'actual', 'sales']);
    const goalField = getSheetFieldBySemantic(sheetName, ['goal', 'target', 'quota']);

    // Skip sheet if no AI mappings found
    if (!empIdField && !storeIdField) {
      console.warn(`[DataLayer] Sheet "${sheetName}" has no AI field mappings - skipping`);
      continue;
    }

    // Extract IDs using ONLY AI-mapped field names
    const empId = empIdField ? String(content[empIdField] || '').trim() : '';
    const storeId = storeIdField ? String(content[storeIdField] || '').trim() : '';

    // AI-DRIVEN: Extract only attainment/amount/goal using AI-mapped fields (SMART COMPRESSION)
    const attainment = attainmentField && content[attainmentField] !== undefined ? Number(content[attainmentField]) : undefined;
    const amount = amountField && content[amountField] !== undefined ? Number(content[amountField]) : undefined;
    const goal = goalField && content[goalField] !== undefined ? Number(content[goalField]) : undefined;

    // Also look for any numeric field that might be the key metric
    let primaryMetric: number | undefined;
    for (const [key, value] of Object.entries(content)) {
      if (key.startsWith('_')) continue;
      if (typeof value === 'number' && value > 0) {
        primaryMetric = value;
        break;
      }
    }

    const metrics = {
      attainment: attainment ?? (amount && goal && goal > 0 ? (amount / goal) * 100 : undefined),
      amount: amount ?? primaryMetric,
      goal
    };

    // Determine if this sheet joins by employee or store
    const isStoreLevel = isStoreJoinSheet(sheetName) || (!empId && storeId);

    // Aggregate by employee ID for employee-level sheets
    if (!isStoreLevel && empId && empId.length >= 3 && empId !== 'undefined') {
      if (!empComponentMetrics.has(empId)) {
        empComponentMetrics.set(empId, new Map());
      }
      const empSheets = empComponentMetrics.get(empId)!;
      const existing = empSheets.get(sheetName) || {};
      empSheets.set(sheetName, {
        attainment: metrics.attainment ?? existing.attainment,
        amount: (existing.amount || 0) + (metrics.amount || 0),
        goal: (existing.goal || 0) + (metrics.goal || 0)
      });
    }

    // Aggregate by store ID for store-level sheets
    if (storeId && storeId.length >= 1) {
      if (!storeComponentMetrics.has(storeId)) {
        storeComponentMetrics.set(storeId, new Map());
      }
      const storeSheets = storeComponentMetrics.get(storeId)!;
      const existing = storeSheets.get(sheetName) || {};
      storeSheets.set(sheetName, {
        attainment: metrics.attainment ?? existing.attainment,
        amount: (existing.amount || 0) + (metrics.amount || 0),
        goal: (existing.goal || 0) + (metrics.goal || 0)
      });
    }
  }

  console.log(`[DataLayer] Employee componentMetrics: ${empComponentMetrics.size} employees`);
  console.log(`[DataLayer] Store componentMetrics: ${storeComponentMetrics.size} stores`);

  // STEP 4: Build aggregated records with componentMetrics (SMART COMPRESSION)
  // Each employee gets: identity fields + componentMetrics (attainment/amount/goal per sheet)
  const aggregated: Record<string, unknown>[] = [];

  for (const [, emp] of Array.from(employeeMap.entries())) {
    const empId = String(emp.employeeId);
    const storeId = String(emp.storeId || '');

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

    // AI-DRIVEN: Build componentMetrics structure - COMPACT (only attainment/amount/goal per sheet)
    const componentMetrics: Record<string, { attainment?: number; amount?: number; goal?: number }> = {};

    // Add employee-level component metrics
    const empMetrics = empComponentMetrics.get(empId);
    if (empMetrics) {
      for (const [sheetName, metrics] of Array.from(empMetrics.entries())) {
        componentMetrics[sheetName] = { ...metrics };
      }
    }

    // Add store-level component metrics (for sheets that join by store)
    const storeMetrics = storeComponentMetrics.get(storeId);
    if (storeMetrics) {
      for (const [sheetName, metrics] of Array.from(storeMetrics.entries())) {
        // Only add if not already present from employee-level
        if (!componentMetrics[sheetName]) {
          componentMetrics[sheetName] = { ...metrics };
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
        const cm = reduced.componentMetrics as Record<string, { attainment?: number; amount?: number; goal?: number }>;
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
  }>
): { batchId: string; recordCount: number } {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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
