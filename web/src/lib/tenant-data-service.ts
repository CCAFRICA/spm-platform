/**
 * Tenant Data Service - Handles data isolation per tenant
 */

import type { TenantConfig } from '@/types/tenant';

const TENANT_DATA_PREFIX = 'entityb_tenant_';

/**
 * Get the localStorage key for tenant-specific data
 */
function getStorageKey(tenantId: string, dataType: string): string {
  return `${TENANT_DATA_PREFIX}${tenantId}_${dataType}`;
}

/**
 * Load data for a specific tenant
 * First checks localStorage for runtime modifications, then falls back to static JSON
 */
export async function loadTenantData<T>(
  tenantId: string,
  dataType: string,
  defaultValue: T
): Promise<T> {
  // Try localStorage first (for runtime modifications)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(getStorageKey(tenantId, dataType));
    if (stored) {
      try {
        return JSON.parse(stored) as T;
      } catch {
        // Fall through to static JSON
      }
    }
  }

  // Fall back to static JSON files
  try {
    const module = await import(`@/data/tenants/${tenantId}/${dataType}.json`);
    return (module.default || module) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Save data for a specific tenant (to localStorage)
 */
export function saveTenantData<T>(tenantId: string, dataType: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(tenantId, dataType), JSON.stringify(data));
}

/**
 * Clear data for a specific tenant
 * If dataType is provided, only clears that specific data type
 * Otherwise clears all data for the tenant
 */
export function clearTenantData(tenantId: string, dataType?: string): void {
  if (typeof window === 'undefined') return;

  if (dataType) {
    localStorage.removeItem(getStorageKey(tenantId, dataType));
  } else {
    // Clear all data for this tenant
    const prefix = `${TENANT_DATA_PREFIX}${tenantId}_`;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  }
}

/**
 * Load tenant configuration
 */
export async function loadTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  try {
    const module = await import(`@/data/tenants/${tenantId}/config.json`);
    return (module.default || module) as TenantConfig;
  } catch {
    return null;
  }
}

/**
 * Get all data types stored for a tenant
 */
export function getTenantDataTypes(tenantId: string): string[] {
  if (typeof window === 'undefined') return [];

  const prefix = `${TENANT_DATA_PREFIX}${tenantId}_`;
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

/**
 * Copy data from one tenant to another (useful for tenant cloning)
 */
export async function copyTenantData(
  sourceTenantId: string,
  targetTenantId: string,
  dataTypes: string[]
): Promise<void> {
  for (const dataType of dataTypes) {
    const data = await loadTenantData(sourceTenantId, dataType, null);
    if (data !== null) {
      saveTenantData(targetTenantId, dataType, data);
    }
  }
}

/**
 * Export all tenant data as a single object
 */
export async function exportTenantData(tenantId: string): Promise<Record<string, unknown>> {
  const dataTypes = getTenantDataTypes(tenantId);
  const result: Record<string, unknown> = {};

  for (const dataType of dataTypes) {
    result[dataType] = await loadTenantData(tenantId, dataType, null);
  }

  return result;
}

/**
 * Import data for a tenant from an object
 */
export function importTenantData(
  tenantId: string,
  data: Record<string, unknown>,
  overwrite: boolean = false
): void {
  for (const [dataType, value] of Object.entries(data)) {
    if (overwrite || !localStorage.getItem(getStorageKey(tenantId, dataType))) {
      saveTenantData(tenantId, dataType, value);
    }
  }
}
