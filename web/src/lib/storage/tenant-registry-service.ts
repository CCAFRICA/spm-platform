/**
 * Tenant Registry Service
 *
 * Abstracts all tenant registry storage operations.
 * Provides async-compatible interface for future Supabase migration.
 */

import type { TenantSummary } from '@/types/tenant';

const STORAGE_KEYS = {
  TENANTS: 'vialuce_tenants',
  REGISTRY: 'vialuce_tenant_registry',
} as const;

// Static tenant IDs that cannot be deleted
export const STATIC_TENANT_IDS = ['retailco', 'restaurantmx', 'techcorp'] as const;

/**
 * Check if a tenant is dynamic (can be deleted)
 */
export function isDynamicTenant(tenantId: string): boolean {
  return !STATIC_TENANT_IDS.includes(tenantId as typeof STATIC_TENANT_IDS[number]);
}

/**
 * Get all tenants from registry
 */
export async function getTenants(): Promise<TenantSummary[]> {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEYS.TENANTS);
  if (stored) {
    try {
      return JSON.parse(stored) as TenantSummary[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Save tenants to registry
 */
export async function saveTenants(tenants: TenantSummary[]): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(tenants));
}

/**
 * Get dynamic tenants from registry
 */
export async function getDynamicTenants(): Promise<TenantSummary[]> {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEYS.REGISTRY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return (parsed.tenants || []) as TenantSummary[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Save dynamic tenant to registry
 */
export async function saveDynamicTenant(tenant: TenantSummary): Promise<void> {
  if (typeof window === 'undefined') return;

  const existing = await getDynamicTenants();
  const filtered = existing.filter(t => t.id !== tenant.id);
  const updated = [...filtered, tenant];

  localStorage.setItem(STORAGE_KEYS.REGISTRY, JSON.stringify({
    tenants: updated,
    lastUpdated: new Date().toISOString(),
  }));
}

/**
 * Remove tenant from registry and all associated data
 */
export async function removeTenant(tenantId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  // Remove from vialuce_tenants array
  const tenantsJson = localStorage.getItem(STORAGE_KEYS.TENANTS);
  if (tenantsJson) {
    const tenants = JSON.parse(tenantsJson);
    const filtered = tenants.filter((t: { id: string }) => t.id !== tenantId);
    localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(filtered));
  }

  // Remove from vialuce_tenant_registry
  const registryJson = localStorage.getItem(STORAGE_KEYS.REGISTRY);
  if (registryJson) {
    const registry = JSON.parse(registryJson);
    registry.tenants = (registry.tenants || []).filter((t: { id: string }) => t.id !== tenantId);
    registry.lastUpdated = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.REGISTRY, JSON.stringify(registry));
  }

  // Remove all tenant-specific data
  await removeTenantData(tenantId);
}

/**
 * Remove all data for a tenant
 */
export async function removeTenantData(tenantId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const prefixes = [
    `vialuce_tenant_data_${tenantId}_`,
    `spm_${tenantId}_`,
  ];

  // Collect keys to remove (can't modify localStorage while iterating)
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && prefixes.some(prefix => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }

  // Remove collected keys
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

/**
 * Merge static and dynamic tenants
 */
export async function getMergedTenants(staticTenants: TenantSummary[]): Promise<TenantSummary[]> {
  const dynamicTenants = await getDynamicTenants();
  const staticIds = new Set(staticTenants.map(t => t.id));

  return [
    ...staticTenants,
    ...dynamicTenants.filter(t => !staticIds.has(t.id)),
  ];
}
