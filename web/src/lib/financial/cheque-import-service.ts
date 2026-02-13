/**
 * Cheque Import Service
 *
 * Manages the import pipeline for POS cheque data with three-layer storage:
 * - Raw: Original parsed records (immutable)
 * - Transformed: Validated and normalized records
 * - Committed: Approved records for calculations
 */

import type { Cheque, ChequeImportResult, ChequeImportError } from './types';
import { parseChequeFile, type ChequeParseResult } from './cheque-parser';
import { getStorageKey } from './financial-constants';

// ============================================
// STORAGE TYPES
// ============================================

interface RawChequeRecord {
  id: string;
  batchId: string;
  cheque: Cheque;
  receivedAt: string;
}

interface TransformedChequeRecord {
  id: string;
  rawRecordId: string;
  batchId: string;
  cheque: Cheque;
  transformedAt: string;
  validation: {
    isValid: boolean;
    warnings: string[];
  };
}

interface CommittedChequeRecord {
  id: string;
  transformedRecordId: string;
  batchId: string;
  cheque: Cheque;
  committedAt: string;
  committedBy: string;
}

interface ImportBatch {
  id: string;
  tenantId: string;
  fileName: string;
  status: ChequeImportResult['status'];
  importedAt: string;
  importedBy: string;
  metadata: ChequeParseResult['metadata'];
  errors: ChequeImportError[];
}

// ============================================
// CHUNKED STORAGE HELPERS
// ============================================

const CHUNK_SIZE = 2000; // Items per chunk to stay within localStorage limits

function loadFromStorage<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    // Check for chunked storage first
    const meta = localStorage.getItem(`${key}_meta`);
    if (meta) {
      const { chunkCount } = JSON.parse(meta);
      const allItems: T[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunk = localStorage.getItem(`${key}_${i}`);
        if (chunk) {
          allItems.push(...JSON.parse(chunk));
        }
      }
      return allItems;
    }
    // Fall back to non-chunked for backward compatibility
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (data.length <= CHUNK_SIZE) {
      // Small dataset - store directly (clear any old chunks)
      clearChunks(key);
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      // Large dataset - chunk it
      // Remove non-chunked key if it exists
      localStorage.removeItem(key);
      const chunkCount = Math.ceil(data.length / CHUNK_SIZE);
      // Save metadata
      localStorage.setItem(`${key}_meta`, JSON.stringify({ chunkCount, totalItems: data.length }));
      // Save chunks
      for (let i = 0; i < chunkCount; i++) {
        const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        localStorage.setItem(`${key}_${i}`, JSON.stringify(chunk));
      }
    }
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

function clearChunks(key: string): void {
  try {
    const meta = localStorage.getItem(`${key}_meta`);
    if (meta) {
      const { chunkCount } = JSON.parse(meta);
      for (let i = 0; i < chunkCount; i++) {
        localStorage.removeItem(`${key}_${i}`);
      }
      localStorage.removeItem(`${key}_meta`);
    }
  } catch { /* ignore */ }
}

// ============================================
// IMPORT SERVICE CLASS
// ============================================

export class ChequeImportService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Import a cheque file
   */
  importFile(content: string, fileName: string, userId: string): ChequeImportResult {
    const batchId = `fin-batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Parse the file
    const parseResult = parseChequeFile(content, fileName);

    // Create raw records
    const rawRecords: RawChequeRecord[] = parseResult.cheques.map((cheque, index) => ({
      id: `raw-${batchId}-${index}`,
      batchId,
      cheque,
      receivedAt: new Date().toISOString(),
    }));

    // Transform and validate records
    const transformedRecords: TransformedChequeRecord[] = rawRecords.map(raw => ({
      id: `trans-${raw.id}`,
      rawRecordId: raw.id,
      batchId,
      cheque: raw.cheque,
      transformedAt: new Date().toISOString(),
      validation: this.validateCheque(raw.cheque),
    }));

    // Create batch record
    const batch: ImportBatch = {
      id: batchId,
      tenantId: this.tenantId,
      fileName,
      status: 'pending',
      importedAt: new Date().toISOString(),
      importedBy: userId,
      metadata: parseResult.metadata,
      errors: parseResult.errors,
    };

    // Save to raw layer
    const rawKey = getStorageKey('RAW', this.tenantId);
    const existingRaw = loadFromStorage<RawChequeRecord>(rawKey);
    saveToStorage(rawKey, [...existingRaw, ...rawRecords]);

    // Save to transformed layer
    const transKey = getStorageKey('TRANSFORMED', this.tenantId);
    const existingTrans = loadFromStorage<TransformedChequeRecord>(transKey);
    saveToStorage(transKey, [...existingTrans, ...transformedRecords]);

    // Save batch to imports
    const importsKey = getStorageKey('IMPORTS', this.tenantId);
    const existingImports = loadFromStorage<ImportBatch>(importsKey);
    saveToStorage(importsKey, [...existingImports, batch]);

    // Build result
    const result: ChequeImportResult = {
      batchId,
      fileName,
      tenantId: this.tenantId,
      importedAt: batch.importedAt,
      importedBy: userId,
      status: 'pending',
      totalRows: parseResult.metadata.totalRows,
      validRows: parseResult.metadata.validRows,
      errorRows: parseResult.metadata.errorRows,
      dateRange: parseResult.metadata.dateRange,
      locations: parseResult.metadata.locations,
      staff: parseResult.metadata.staff,
      shifts: parseResult.metadata.shifts,
      totalRevenue: parseResult.metadata.totalRevenue,
      currency: 'MXN',
      errors: parseResult.errors,
    };

    console.log(`[Financial Import] Imported ${rawRecords.length} cheques from ${fileName}`);

    return result;
  }

  /**
   * Validate a cheque record
   */
  private validateCheque(cheque: Cheque): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isValid = true;

    // Check for negative amounts
    if (cheque.total < 0) {
      warnings.push('Negative total amount');
      isValid = false;
    }

    // Check for mismatched payment totals
    const paymentSum = cheque.efectivo + cheque.tarjeta;
    if (cheque.pagado && Math.abs(paymentSum - cheque.total) > 0.01) {
      warnings.push(`Payment mismatch: ${paymentSum} vs total ${cheque.total}`);
    }

    // Check for cancelled but paid
    if (cheque.cancelado && cheque.pagado) {
      warnings.push('Cheque marked as both cancelled and paid');
    }

    // Check for zero guests but items sold
    if (cheque.numeroPersonas === 0 && cheque.totalArticulos > 0) {
      warnings.push('Zero guests but items sold');
    }

    return { isValid, warnings };
  }

  /**
   * Commit an import batch
   */
  commitImport(batchId: string, userId: string): boolean {
    // Get transformed records for batch
    const transKey = getStorageKey('TRANSFORMED', this.tenantId);
    const transformedRecords = loadFromStorage<TransformedChequeRecord>(transKey);
    const batchRecords = transformedRecords.filter(r => r.batchId === batchId);

    if (batchRecords.length === 0) {
      console.warn(`[Financial Import] No records found for batch ${batchId}`);
      return false;
    }

    // Create committed records
    const committedRecords: CommittedChequeRecord[] = batchRecords
      .filter(r => r.validation.isValid)
      .map(trans => ({
        id: `commit-${trans.id}`,
        transformedRecordId: trans.id,
        batchId,
        cheque: trans.cheque,
        committedAt: new Date().toISOString(),
        committedBy: userId,
      }));

    // Save to committed layer
    const commitKey = getStorageKey('COMMITTED', this.tenantId);
    const existingCommitted = loadFromStorage<CommittedChequeRecord>(commitKey);
    saveToStorage(commitKey, [...existingCommitted, ...committedRecords]);

    // Update batch status
    const importsKey = getStorageKey('IMPORTS', this.tenantId);
    const imports = loadFromStorage<ImportBatch>(importsKey);
    const batchIndex = imports.findIndex(b => b.id === batchId);
    if (batchIndex >= 0) {
      imports[batchIndex].status = 'committed';
      saveToStorage(importsKey, imports);
    }

    console.log(`[Financial Import] Committed ${committedRecords.length} cheques for batch ${batchId}`);

    return true;
  }

  /**
   * Get import history
   */
  getImportHistory(): ChequeImportResult[] {
    const importsKey = getStorageKey('IMPORTS', this.tenantId);
    const batches = loadFromStorage<ImportBatch>(importsKey);

    return batches.map(batch => ({
      batchId: batch.id,
      fileName: batch.fileName,
      tenantId: batch.tenantId,
      importedAt: batch.importedAt,
      importedBy: batch.importedBy,
      status: batch.status,
      totalRows: batch.metadata.totalRows,
      validRows: batch.metadata.validRows,
      errorRows: batch.metadata.errorRows,
      dateRange: batch.metadata.dateRange,
      locations: batch.metadata.locations,
      staff: batch.metadata.staff,
      shifts: batch.metadata.shifts,
      totalRevenue: batch.metadata.totalRevenue,
      currency: 'MXN',
      errors: batch.errors,
    }));
  }

  /**
   * Get committed cheques
   */
  getCheques(locationId?: string, period?: string): Cheque[] {
    const commitKey = getStorageKey('COMMITTED', this.tenantId);
    const committed = loadFromStorage<CommittedChequeRecord>(commitKey);

    let cheques = committed.map(c => c.cheque);

    // Filter by location
    if (locationId) {
      cheques = cheques.filter(c => c.numeroFranquicia === locationId);
    }

    // Filter by period (YYYY-MM format)
    if (period) {
      cheques = cheques.filter(c => c.fecha.startsWith(period));
    }

    return cheques;
  }

  /**
   * Get all committed cheques
   */
  getAllCheques(): Cheque[] {
    return this.getCheques();
  }

  /**
   * Get unique locations from committed data
   */
  getLocations(): string[] {
    const cheques = this.getAllCheques();
    const locations = new Set<string>();
    cheques.forEach(c => locations.add(c.numeroFranquicia));
    return Array.from(locations).sort();
  }

  /**
   * Get unique staff IDs from committed data
   */
  getStaffIds(): number[] {
    const cheques = this.getAllCheques();
    const staff = new Set<number>();
    cheques.forEach(c => staff.add(c.meseroId));
    return Array.from(staff).sort((a, b) => a - b);
  }

  /**
   * Clear all data for tenant (for testing)
   */
  clearAllData(): void {
    const keys = [
      getStorageKey('RAW', this.tenantId),
      getStorageKey('TRANSFORMED', this.tenantId),
      getStorageKey('COMMITTED', this.tenantId),
      getStorageKey('IMPORTS', this.tenantId),
    ];

    keys.forEach(key => {
      if (typeof window !== 'undefined') {
        // Clear chunked storage
        clearChunks(key);
        // Clear non-chunked storage
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * Get import service instance for tenant
 */
export function getImportService(tenantId: string): ChequeImportService {
  return new ChequeImportService(tenantId);
}
