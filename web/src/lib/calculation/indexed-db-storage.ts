/**
 * OB-30-1: IndexedDB Storage for Calculation Results
 *
 * localStorage has ~5-10MB limit which is insufficient for 719 employee results.
 * IndexedDB provides 50MB+ storage, making it suitable for large calculation outputs.
 */

import type { CalculationResult } from '@/types/compensation-plan';

const DB_NAME = 'vialuce_calculations';
const DB_VERSION = 1;
const STORE_NAME = 'results';
const INDEX_STORE = 'run_index';

interface RunIndex {
  runId: string;
  tenantId: string;
  totalResults: number;
  totalPayout: number;
  savedAt: string;
}

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store for results (keyed by composite: runId + employeeId)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: ['runId', 'employeeId'] });
        store.createIndex('runId', 'runId', { unique: false });
        store.createIndex('employeeId', 'employeeId', { unique: false });
      }

      // Create object store for run index
      if (!db.objectStoreNames.contains(INDEX_STORE)) {
        db.createObjectStore(INDEX_STORE, { keyPath: 'runId' });
      }

      console.log('[IndexedDB] Database schema created/upgraded');
    };
  });
}

/**
 * Save calculation results to IndexedDB
 * Returns true if successful, false otherwise
 */
export async function saveResultsToIndexedDB(
  runId: string,
  tenantId: string,
  results: CalculationResult[],
  totalPayout: number
): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME, INDEX_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const indexStore = tx.objectStore(INDEX_STORE);

    // Clear old results for this run first
    const clearRequest = store.index('runId').openCursor(IDBKeyRange.only(runId));
    await new Promise<void>((resolve, reject) => {
      clearRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });

    // Add all results
    let savedCount = 0;
    for (const result of results) {
      const record = { ...result, runId };
      await new Promise<void>((resolve, reject) => {
        const addRequest = store.put(record);
        addRequest.onsuccess = () => {
          savedCount++;
          resolve();
        };
        addRequest.onerror = () => {
          console.error(`[IndexedDB] Failed to save result for ${result.employeeId}:`, addRequest.error);
          reject(addRequest.error);
        };
      });
    }

    // Save run index
    const runIndex: RunIndex = {
      runId,
      tenantId,
      totalResults: savedCount,
      totalPayout,
      savedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const indexRequest = indexStore.put(runIndex);
      indexRequest.onsuccess = () => resolve();
      indexRequest.onerror = () => reject(indexRequest.error);
    });

    // Wait for transaction to complete
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
    console.log(`[IndexedDB] Saved ${savedCount} results for run ${runId}`);

    // Also save a pointer in localStorage for the browser script to find
    localStorage.setItem('vialuce_calculations_index', JSON.stringify({
      chunkCount: 0, // Not using chunks anymore
      totalResults: savedCount,
      savedAt: runIndex.savedAt,
      tenantId,
      runId,
      storageType: 'indexeddb', // Signal to browser script
    }));

    return true;
  } catch (error) {
    console.error('[IndexedDB] Failed to save results:', error);
    return false;
  }
}

/**
 * Load calculation results from IndexedDB
 */
export async function loadResultsFromIndexedDB(runId: string): Promise<CalculationResult[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('runId');

    const results: CalculationResult[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(runId));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          // Remove the runId we added for storage
          const { runId: _runId, ...result } = cursor.value;
          void _runId; // Silence unused variable warning
          results.push(result as CalculationResult);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    db.close();
    return results;
  } catch (error) {
    console.error('[IndexedDB] Failed to load results:', error);
    return [];
  }
}

/**
 * Get the latest run index
 */
export async function getLatestRunFromIndexedDB(tenantId: string): Promise<RunIndex | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(INDEX_STORE, 'readonly');
    const store = tx.objectStore(INDEX_STORE);

    const runs: RunIndex[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (cursor.value.tenantId === tenantId) {
            runs.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Return most recent
    runs.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    return runs[0] || null;
  } catch (error) {
    console.error('[IndexedDB] Failed to get latest run:', error);
    return null;
  }
}

/**
 * Delete old runs to free space (keep only last N runs per tenant)
 */
export async function cleanupOldRuns(tenantId: string, keepCount: number = 3): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME, INDEX_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const indexStore = tx.objectStore(INDEX_STORE);

    // Get all runs for tenant
    const runs: RunIndex[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = indexStore.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (cursor.value.tenantId === tenantId) {
            runs.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    // Sort by date, keep newest N
    runs.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    const runsToDelete = runs.slice(keepCount);

    let deletedCount = 0;
    for (const run of runsToDelete) {
      // Delete results for this run
      const resultsIndex = store.index('runId');
      await new Promise<void>((resolve, reject) => {
        const request = resultsIndex.openCursor(IDBKeyRange.only(run.runId));
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });

      // Delete run index
      await new Promise<void>((resolve, reject) => {
        const request = indexStore.delete(run.runId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      deletedCount++;
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();

    if (deletedCount > 0) {
      console.log(`[IndexedDB] Cleaned up ${deletedCount} old runs`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[IndexedDB] Failed to cleanup old runs:', error);
    return 0;
  }
}
