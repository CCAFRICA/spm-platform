/**
 * Quarantine Service
 *
 * Manages data quality quarantine items and their resolution.
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

const STORAGE_KEY = 'retailco_quarantine';

// ============================================
// QUARANTINE CRUD
// ============================================

/**
 * Get all quarantine items for a tenant
 */
export function getQuarantineItems(tenantId: string): QuarantineItem[] {
  if (typeof window === 'undefined') return getDefaultQuarantineItems();

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultQuarantineItems();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults.filter((q) => q.tenantId === tenantId);
  }

  try {
    const items: QuarantineItem[] = JSON.parse(stored);
    return items
      .filter((q) => q.tenantId === tenantId)
      .sort((a, b) => {
        // Sort by severity (critical first) then by date
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
      });
  } catch {
    return [];
  }
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

  allItems[index] = resolvedItem;

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allItems));
  }

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

function hoursAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function getDefaultQuarantineItems(): QuarantineItem[] {
  return [
    {
      id: 'q-001',
      tenantId: 'retailco',
      source: 'POS',
      recordType: 'transaction',
      recordId: 'TXN-MISSING-001',
      recordData: { amount: 450, date: '2025-01-20', product: 'Lentes Premium' },
      errorType: 'missing_field',
      errorField: 'store_id',
      errorMessage: 'Transaction missing store identifier',
      errorMessageEs: 'Transacción sin identificador de tienda',
      errorDetails:
        '3 transactions from Store 105 are missing the store_id field',
      errorDetailsEs:
        '3 transacciones de Tienda 105 sin store_id asignado',
      severity: 'critical',
      suggestedFix: {
        description: 'Assign store_id based on POS terminal',
        descriptionEs: 'Asignar store_id basado en terminal POS',
        field: 'store_id',
        currentValue: null,
        suggestedValue: '105',
        confidence: 'high',
      },
      status: 'pending',
      detectedAt: hoursAgo(8),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionAction: null,
      resolutionNotes: null,
    },
    {
      id: 'q-002',
      tenantId: 'retailco',
      source: 'POS',
      recordType: 'transaction',
      recordId: 'TXN-2025-0201',
      recordData: { amount: 320, date: '2025-01-22', store_id: '101' },
      errorType: 'duplicate',
      errorMessage: 'Duplicate transaction detected',
      errorMessageEs: 'Transacción duplicada detectada',
      errorDetails:
        'TXN-2025-0201 appears 2 times with same amount and date',
      errorDetailsEs:
        'TXN-2025-0201 aparece 2 veces con mismo monto y fecha',
      severity: 'warning',
      suggestedFix: {
        description: 'Reject duplicate record',
        descriptionEs: 'Rechazar registro duplicado',
        field: 'status',
        currentValue: 'active',
        suggestedValue: 'rejected',
        confidence: 'high',
      },
      status: 'pending',
      detectedAt: hoursAgo(6),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionAction: null,
      resolutionNotes: null,
    },
    {
      id: 'q-003',
      tenantId: 'retailco',
      source: 'POS',
      recordType: 'transaction',
      recordId: 'TXN-2025-0215',
      recordData: {
        amount: 15000,
        date: '2025-01-23',
        store_id: '103',
        employee_id: 'emp-012',
      },
      errorType: 'anomaly',
      errorMessage: 'Unusually high amount detected',
      errorMessageEs: 'Monto inusualmente alto detectado',
      errorDetails:
        '$15,000 transaction when average is $500. Possible corporate sale or error.',
      errorDetailsEs:
        'Transacción de $15,000 cuando el promedio es $500. Posible venta corporativa o error.',
      severity: 'warning',
      suggestedFix: {
        description: 'Verify with store - possible legitimate corporate sale',
        descriptionEs:
          'Verificar con tienda - posible venta corporativa legítima',
        field: 'verified',
        currentValue: false,
        suggestedValue: true,
        confidence: 'medium',
      },
      status: 'pending',
      detectedAt: hoursAgo(4),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionAction: null,
      resolutionNotes: null,
    },
    {
      id: 'q-004',
      tenantId: 'retailco',
      source: 'POS',
      recordType: 'transaction',
      recordId: 'TXN-2025-0220',
      recordData: { amount: 275, date: '2025-02-30', store_id: '102' },
      errorType: 'invalid_format',
      errorField: 'date',
      errorMessage: 'Invalid date format',
      errorMessageEs: 'Fecha inválida',
      errorDetails:
        '2025-02-30 is not a valid date (February only has 28 days)',
      errorDetailsEs:
        '2025-02-30 no es una fecha válida (febrero solo tiene 28 días)',
      severity: 'warning',
      suggestedFix: {
        description: 'Correct to last valid date of month',
        descriptionEs: 'Corregir a última fecha válida del mes',
        field: 'date',
        currentValue: '2025-02-30',
        suggestedValue: '2025-02-28',
        confidence: 'high',
      },
      status: 'pending',
      detectedAt: hoursAgo(3),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionAction: null,
      resolutionNotes: null,
    },
    {
      id: 'q-005',
      tenantId: 'retailco',
      source: 'HR',
      recordType: 'employee',
      recordId: 'emp-new-001',
      recordData: {
        name: 'Juan Pérez',
        email: 'juan.perez@retailco.com',
        hire_date: '2025-01-15',
      },
      errorType: 'missing_field',
      errorField: 'certification_status',
      errorMessage: 'Employee missing certification status',
      errorMessageEs: 'Empleado sin estatus de certificación',
      errorDetails:
        'New employee added without certification status (optometrist)',
      errorDetailsEs:
        'Nuevo empleado agregado sin indicar si es optometrista certificado',
      severity: 'info',
      suggestedFix: {
        description: 'Confirm certification status with HR',
        descriptionEs: 'Confirmar estatus de certificación con HR',
        field: 'certification_status',
        currentValue: null,
        suggestedValue: 'pending_verification',
        confidence: 'low',
      },
      status: 'pending',
      detectedAt: hoursAgo(2),
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionAction: null,
      resolutionNotes: null,
    },
  ];
}

// ============================================
// HELPERS
// ============================================

function getAllItemsInternal(): QuarantineItem[] {
  if (typeof window === 'undefined') return getDefaultQuarantineItems();

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const defaults = getDefaultQuarantineItems();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return getDefaultQuarantineItems();
  }
}

/**
 * Initialize quarantine items
 */
export function initializeQuarantine(): void {
  if (typeof window === 'undefined') return;

  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) {
    const defaults = getDefaultQuarantineItems();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  }
}

/**
 * Reset quarantine to default state
 */
export function resetQuarantine(): void {
  if (typeof window === 'undefined') return;

  const defaults = getDefaultQuarantineItems();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
}
