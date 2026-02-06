/**
 * Bulk Operations Service
 *
 * Handles batch processing with progress tracking.
 */

import type {
  BulkOperation,
  BulkOperationType,
  BulkOperationResult,
  BulkOperationError,
} from '@/types/bulk-operations';

const OPERATIONS_STORAGE_KEY = 'bulk_operations';

// ============================================
// OPERATION MANAGEMENT
// ============================================

/**
 * Get all bulk operations
 */
export function getBulkOperations(): BulkOperation[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(OPERATIONS_STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get operation by ID
 */
export function getBulkOperation(operationId: string): BulkOperation | null {
  const operations = getBulkOperations();
  return operations.find((op) => op.id === operationId) || null;
}

/**
 * Get recent operations
 */
export function getRecentOperations(limit: number = 10): BulkOperation[] {
  return getBulkOperations()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * Create a new bulk operation
 */
export function createBulkOperation(
  type: BulkOperationType,
  targetType: BulkOperation['targetType'],
  targetIds: string[],
  createdBy: string,
  options?: Record<string, unknown>
): BulkOperation {
  const operation: BulkOperation = {
    id: `bulk-${Date.now()}`,
    type,
    status: 'pending',
    targetType,
    targetIds,
    totalItems: targetIds.length,
    processedItems: 0,
    successCount: 0,
    failureCount: 0,
    errors: [],
    createdBy,
    createdAt: new Date().toISOString(),
    options,
  };

  const operations = getBulkOperations();
  operations.push(operation);
  saveOperations(operations);

  return operation;
}

/**
 * Execute a bulk operation with progress callbacks
 */
export async function executeBulkOperation(
  operationId: string,
  processor: (itemId: string, index: number) => Promise<{ success: boolean; error?: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<BulkOperationResult> {
  const operation = getBulkOperation(operationId);
  if (!operation) {
    return {
      operationId,
      success: false,
      message: 'Operation not found',
      messageEs: 'Operación no encontrada',
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };
  }

  // Update status to processing
  updateOperation(operationId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
  });

  const errors: BulkOperationError[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < operation.targetIds.length; i++) {
    const itemId = operation.targetIds[i];

    try {
      const result = await processor(itemId, i);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        errors.push({
          itemId,
          error: result.error || 'Unknown error',
          errorEs: result.error || 'Error desconocido',
        });
      }
    } catch (err) {
      failureCount++;
      errors.push({
        itemId,
        error: err instanceof Error ? err.message : 'Processing error',
        errorEs: err instanceof Error ? err.message : 'Error de procesamiento',
      });
    }

    // Update progress
    const processed = i + 1;
    updateOperation(operationId, {
      processedItems: processed,
      successCount,
      failureCount,
      errors,
    });

    onProgress?.(processed, operation.totalItems);

    // Small delay to prevent UI freezing
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Mark as completed
  const finalStatus = failureCount === 0 ? 'completed' : failureCount === operation.totalItems ? 'failed' : 'completed';
  updateOperation(operationId, {
    status: finalStatus,
    completedAt: new Date().toISOString(),
  });

  return {
    operationId,
    success: failureCount === 0,
    message: failureCount === 0
      ? `Successfully processed ${successCount} items`
      : `Processed ${successCount} items with ${failureCount} failures`,
    messageEs: failureCount === 0
      ? `${successCount} elementos procesados exitosamente`
      : `${successCount} elementos procesados con ${failureCount} errores`,
    processed: operation.totalItems,
    succeeded: successCount,
    failed: failureCount,
    errors,
  };
}

/**
 * Cancel a bulk operation
 */
export function cancelBulkOperation(operationId: string): boolean {
  const operation = getBulkOperation(operationId);
  if (!operation || operation.status !== 'processing') {
    return false;
  }

  updateOperation(operationId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
  });

  return true;
}

/**
 * Delete a bulk operation record
 */
export function deleteBulkOperation(operationId: string): boolean {
  const operations = getBulkOperations();
  const filtered = operations.filter((op) => op.id !== operationId);

  if (filtered.length === operations.length) return false;

  saveOperations(filtered);
  return true;
}

/**
 * Clear completed operations
 */
export function clearCompletedOperations(): number {
  const operations = getBulkOperations();
  const active = operations.filter(
    (op) => op.status === 'pending' || op.status === 'processing'
  );

  const cleared = operations.length - active.length;
  saveOperations(active);

  return cleared;
}

// ============================================
// BULK ACTION PROCESSORS
// ============================================

/**
 * Bulk approve processor
 */
export function createApproveProcessor() {
  return async (itemId: string): Promise<{ success: boolean; error?: string }> => {
    void itemId; // Parameter used by processor interface
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    // 95% success rate for demo
    if (Math.random() > 0.05) {
      return { success: true };
    }
    return { success: false, error: 'Approval failed - item locked' };
  };
}

/**
 * Bulk export processor
 */
export function createExportProcessor(
  getData: (itemId: string) => Record<string, unknown> | null
) {
  const exportedData: Record<string, unknown>[] = [];

  return {
    processor: async (itemId: string): Promise<{ success: boolean; error?: string }> => {
      const data = getData(itemId);
      if (data) {
        exportedData.push(data);
        return { success: true };
      }
      return { success: false, error: 'Item not found' };
    },
    getExportedData: () => exportedData,
  };
}

/**
 * Bulk status update processor
 */
export function createStatusUpdateProcessor(
  newStatus: string,
  updateFn: (itemId: string, status: string) => boolean
) {
  return async (itemId: string): Promise<{ success: boolean; error?: string }> => {
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (updateFn(itemId, newStatus)) {
      return { success: true };
    }
    return { success: false, error: 'Update failed' };
  };
}

// ============================================
// HELPERS
// ============================================

function updateOperation(
  operationId: string,
  updates: Partial<BulkOperation>
): void {
  const operations = getBulkOperations();
  const index = operations.findIndex((op) => op.id === operationId);

  if (index >= 0) {
    operations[index] = { ...operations[index], ...updates };
    saveOperations(operations);
  }
}

function saveOperations(operations: BulkOperation[]): void {
  if (typeof window !== 'undefined') {
    // Keep only last 50 operations
    const trimmed = operations.slice(-50);
    localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(trimmed));
  }
}

/**
 * Get operation statistics
 */
export function getOperationStats(): {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
} {
  const operations = getBulkOperations();

  return {
    total: operations.length,
    pending: operations.filter((op) => op.status === 'pending').length,
    processing: operations.filter((op) => op.status === 'processing').length,
    completed: operations.filter((op) => op.status === 'completed').length,
    failed: operations.filter((op) => op.status === 'failed').length,
  };
}
