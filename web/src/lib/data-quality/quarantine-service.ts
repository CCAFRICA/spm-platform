/**
 * Quarantine Service
 *
 * Manages data quality quarantine items and their resolution.
 *
 * NOTE: localStorage removed (OB-43A). Returns in-memory defaults.
 */

import type {
  QuarantineItem,
  QuarantineStatus,
  QuarantineResolution,
  QuarantineStats,
  DataSource,
  ErrorType,
  Severity,
} from '@/types/data-quality';

// ============================================
// QUARANTINE CRUD
// ============================================

/**
 * Get all quarantine items for a tenant
 */
export function getQuarantineItems(tenantId: string): QuarantineItem[] {
  const defaults = getDefaultQuarantineItems();
  return defaults
    .filter((q) => q.tenantId === tenantId)
    .sort((a, b) => {
      // Sort by severity (critical first) then by date
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });
}

/**
 * Get pending quarantine items
 */
export function getPendingItems(tenantId: string): QuarantineItem[] {
  return getQuarantineItems(tenantId).filter((q) => q.status === 'pending');
}

/**
 * Get resolved quarantine items
 */
export function getResolvedItems(tenantId: string): QuarantineItem[] {
  return getQuarantineItems(tenantId).filter((q) => q.status !== 'pending');
}

/**
 * Get a single quarantine item by ID
 */
export function getQuarantineItem(itemId: string): QuarantineItem | null {
  const allItems = getAllItemsInternal();
  return allItems.find((q) => q.id === itemId) || null;
}

/**
 * Get quarantine items by status
 */
export function getItemsByStatus(
  tenantId: string,
  status: QuarantineStatus
): QuarantineItem[] {
  return getQuarantineItems(tenantId).filter((q) => q.status === status);
}

/**
 * Get quarantine items by severity
 */
export function getItemsBySeverity(tenantId: string, severity: Severity): QuarantineItem[] {
  return getQuarantineItems(tenantId).filter((q) => q.severity === severity);
}

/**
 * Get quarantine items by source
 */
export function getItemsBySource(tenantId: string, source: DataSource): QuarantineItem[] {
  return getQuarantineItems(tenantId).filter((q) => q.source === source);
}

// ============================================
// RESOLUTION
// ============================================

/**
 * Resolve a quarantine item
 */
export function resolveItem(
  itemId: string,
  resolution: QuarantineResolution,
  resolvedBy: string,
  resolvedByName: string
): QuarantineItem | null {
  const allItems = getAllItemsInternal();
  const index = allItems.findIndex((q) => q.id === itemId);

  if (index < 0) return null;

  const item = allItems[index];
  if (item.status !== 'pending') return null;

  const now = new Date().toISOString();

  const resolvedItem: QuarantineItem = {
    ...item,
    status:
      resolution.action === 'approve'
        ? 'approved'
        : resolution.action === 'correct'
          ? 'corrected'
          : 'rejected',
    resolvedAt: now,
    resolvedBy,
    resolvedByName,
    resolutionAction: resolution.action,
    resolutionNotes: resolution.notes || null,
    correctedData: resolution.correctedData,
  };

  // localStorage removed -- save is a no-op

  return resolvedItem;
}

/**
 * Bulk resolve multiple items
 */
export function bulkResolve(
  itemIds: string[],
  resolution: QuarantineResolution,
  resolvedBy: string,
  resolvedByName: string
): number {
  let count = 0;
  itemIds.forEach((id) => {
    const result = resolveItem(id, resolution, resolvedBy, resolvedByName);
    if (result) count++;
  });
  return count;
}

/**
 * Apply suggested fix to an item
 */
export function applySuggestedFix(
  itemId: string,
  resolvedBy: string,
  resolvedByName: string
): QuarantineItem | null {
  const item = getQuarantineItem(itemId);
  if (!item || !item.suggestedFix) return null;

  const correctedData = {
    ...item.recordData,
    [item.suggestedFix.field]: item.suggestedFix.suggestedValue,
  };

  return resolveItem(
    itemId,
    {
      action: 'correct',
      notes: `Applied suggested fix: ${item.suggestedFix.description}`,
      correctedData,
    },
    resolvedBy,
    resolvedByName
  );
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get quarantine statistics
 */
export function getQuarantineStats(tenantId: string): QuarantineStats {
  const items = getQuarantineItems(tenantId);
  const pending = items.filter((q) => q.status === 'pending');

  const bySeverity = {
    critical: pending.filter((q) => q.severity === 'critical').length,
    warning: pending.filter((q) => q.severity === 'warning').length,
    info: pending.filter((q) => q.severity === 'info').length,
  };

  const bySource: Record<DataSource, number> = {
    POS: 0,
    Inventory: 0,
    HR: 0,
    Manual: 0,
    Import: 0,
  };
  pending.forEach((q) => {
    bySource[q.source]++;
  });

  const byErrorType: Record<ErrorType, number> = {
    missing_field: 0,
    invalid_format: 0,
    duplicate: 0,
    anomaly: 0,
    business_rule: 0,
    referential: 0,
  };
  pending.forEach((q) => {
    byErrorType[q.errorType]++;
  });

  return {
    total: items.length,
    pending: pending.length,
    resolved: items.length - pending.length,
    bySeverity,
    bySource,
    byErrorType,
  };
}

// ============================================
// DEMO DATA
// ============================================

function getDefaultQuarantineItems(): QuarantineItem[] {
  return [];
}

// ============================================
// HELPERS
// ============================================

function getAllItemsInternal(): QuarantineItem[] {
  return getDefaultQuarantineItems();
}

/**
 * Initialize quarantine items (no-op, localStorage removed)
 */
export function initializeQuarantine(): void {
  // localStorage removed -- no-op
}

/**
 * Reset quarantine to default state (no-op, localStorage removed)
 */
export function resetQuarantine(): void {
  // localStorage removed -- no-op
}
