/**
 * Tenant Registry Service
 *
 * Abstracts all tenant registry storage operations.
 * Provides async-compatible interface for future Supabase migration.
 * localStorage removed -- all operations return empty defaults.
 */

import type { TenantSummary } from '@/types/tenant';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  return [];
}

/**
 * Save tenants to registry
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveTenants(tenants: TenantSummary[]): Promise<void> {
  // No-op: localStorage removed
}

/**
 * Get dynamic tenants from registry
 */
export async function getDynamicTenants(): Promise<TenantSummary[]> {
  return [];
}

/**
 * Save dynamic tenant to registry
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveDynamicTenant(tenant: TenantSummary): Promise<void> {
  // No-op: localStorage removed
}

/**
 * Remove tenant from registry and all associated data
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function removeTenant(tenantId: string): Promise<void> {
  // No-op: localStorage removed
}

/**
 * Remove all data for a tenant
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function removeTenantData(tenantId: string): Promise<void> {
  // No-op: localStorage removed
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
