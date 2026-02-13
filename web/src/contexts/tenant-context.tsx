'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { TenantConfig, TenantSummary, TenantTerminology, Currency } from '@/types/tenant';
import { DEFAULT_TERMINOLOGY, formatTenantCurrency, formatTenantDate } from '@/types/tenant';
import { cleanupStaleData } from '@/lib/data-architecture/data-layer-service';

interface TenantContextState {
  currentTenant: TenantConfig | null;
  isLoading: boolean;
  error: string | null;
  isVLAdmin: boolean;
  availableTenants: TenantSummary[];
  setTenant: (tenantId: string) => Promise<void>;
  clearTenant: () => void;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextState | undefined>(undefined);

const STORAGE_KEY_TENANT = 'entityb_current_tenant';
const STORAGE_KEY_USER_ROLE = 'entityb_user_role';

// Storage keys for dynamic tenants (matches provisioning-engine.ts)
const DYNAMIC_TENANTS_KEY = 'vialuce_tenants';
const DYNAMIC_REGISTRY_KEY = 'vialuce_tenant_registry';

// Tenant config cache to avoid repeated imports
const tenantConfigCache: Record<string, TenantConfig> = {};

/**
 * OB-16A: Normalize tenant ID - strip leading/trailing underscores
 * This is the SINGLE SOURCE of normalization for all tenant IDs.
 * Fixes data mismatch where tenant was created with trailing underscore.
 */
function normalizeTenantId(id: string): string {
  const normalized = id.replace(/^_+|_+$/g, '');
  if (normalized !== id) {
    console.warn(`[TenantContext] Normalized tenantId "${id}" -> "${normalized}"`);
  }
  return normalized;
}

/**
 * Load dynamic tenants from localStorage (created via provisioning wizard)
 */
function loadDynamicTenants(): TenantConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DYNAMIC_TENANTS_KEY);
    if (stored) {
      const tenants = JSON.parse(stored) as TenantConfig[];
      // OB-16A: Normalize all tenant IDs on load
      return tenants.map(t => ({ ...t, id: normalizeTenantId(t.id) }));
    }
  } catch (e) {
    console.warn('Failed to load dynamic tenants:', e);
  }
  return [];
}

/**
 * Load dynamic tenant registry summaries from localStorage
 */
function loadDynamicTenantSummaries(): TenantSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DYNAMIC_REGISTRY_KEY);
    if (stored) {
      const registry = JSON.parse(stored);
      const summaries = (registry.tenants || []) as TenantSummary[];
      // OB-16A: Normalize all tenant IDs on load
      return summaries.map(t => ({ ...t, id: normalizeTenantId(t.id) }));
    }
  } catch (e) {
    console.warn('Failed to load dynamic tenant registry:', e);
  }
  return [];
}

async function loadTenantConfig(tenantId: string): Promise<TenantConfig> {
  // OB-16A: Normalize tenant ID before any lookup
  const normalizedId = normalizeTenantId(tenantId);

  if (tenantConfigCache[normalizedId]) {
    return tenantConfigCache[normalizedId];
  }

  // First, check localStorage for dynamically provisioned tenants
  const dynamicTenants = loadDynamicTenants();
  const dynamicTenant = dynamicTenants.find(t => t.id === normalizedId);
  if (dynamicTenant) {
    tenantConfigCache[normalizedId] = dynamicTenant;
    return dynamicTenant;
  }

  // Fall back to static tenant config files
  try {
    const config = await import(`@/data/tenants/${normalizedId}/config.json`);
    const tenantConfig = { ...(config.default || config), id: normalizedId };
    tenantConfigCache[normalizedId] = tenantConfig;
    return tenantConfig;
  } catch {
    throw new Error(`Failed to load tenant config: ${normalizedId}`);
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [currentTenant, setCurrentTenant] = useState<TenantConfig | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVLAdmin, setIsVLAdmin] = useState(false);

  const loadTenant = useCallback(async (tenantId: string): Promise<void> => {
    // OB-16A: Normalize tenant ID at the entry point
    const normalizedId = normalizeTenantId(tenantId);
    try {
      const config = await loadTenantConfig(normalizedId);
      setCurrentTenant(config);
      if (typeof window !== 'undefined') {
        // Store the normalized ID to prevent dirty values from persisting
        localStorage.setItem(STORAGE_KEY_TENANT, normalizedId);

        // OB-16C: Clean up stale data from other tenants to free localStorage space
        try {
          cleanupStaleData(normalizedId);
        } catch (cleanupErr) {
          console.warn('[TenantContext] Stale data cleanup failed:', cleanupErr);
        }
      }
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load tenant: ${normalizedId}`);
      setIsLoading(false);
      throw err;
    }
  }, []);

  useEffect(() => {
    const initializeTenant = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check if user is VL Admin
        const userRole = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER_ROLE) : null;
        const isAdmin = userRole === 'vl_admin';
        setIsVLAdmin(isAdmin);

        // Load available tenants for VL Admin (both static and dynamic)
        if (isAdmin) {
          try {
            // Load static tenants from registry file
            const registry = await import('@/data/tenants/index.json');
            const staticTenants = (registry.tenants || []) as TenantSummary[];

            // Load dynamic tenants from localStorage
            const dynamicTenants = loadDynamicTenantSummaries();

            // Merge, with dynamic tenants taking precedence for duplicates
            const staticIds = new Set(staticTenants.map(t => t.id));
            const mergedTenants = [
              ...staticTenants,
              ...dynamicTenants.filter(t => !staticIds.has(t.id)),
            ];

            setAvailableTenants(mergedTenants);
          } catch {
            console.warn('Failed to load tenant registry');
            // Still try to load dynamic tenants if static fails
            const dynamicTenants = loadDynamicTenantSummaries();
            if (dynamicTenants.length > 0) {
              setAvailableTenants(dynamicTenants);
            }
          }
        }

        // Check for stored tenant
        const storedTenantId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TENANT) : null;

        if (storedTenantId) {
          await loadTenant(storedTenantId);
        } else if (isAdmin) {
          // VL Admin without selected tenant - will redirect in component
          setIsLoading(false);
        } else {
          // Default tenant for regular users
          await loadTenant('techcorp');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize tenant');
        setIsLoading(false);
      }
    };

    initializeTenant();
  }, [loadTenant]);

  const setTenant = useCallback(async (tenantId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await loadTenant(tenantId);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch tenant');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router, loadTenant]);

  const clearTenant = useCallback((): void => {
    setCurrentTenant(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_TENANT);
    }
    if (isVLAdmin) {
      router.push('/select-tenant');
    }
  }, [isVLAdmin, router]);

  const refreshTenant = useCallback(async (): Promise<void> => {
    if (currentTenant) {
      // Clear cache to force reload
      delete tenantConfigCache[currentTenant.id];
      await loadTenant(currentTenant.id);
    }
  }, [currentTenant, loadTenant]);

  return (
    <TenantContext.Provider value={{
      currentTenant,
      isLoading,
      error,
      isVLAdmin,
      availableTenants,
      setTenant,
      clearTenant,
      refreshTenant,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextState {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}

export function useTerminology(): TenantTerminology {
  const { currentTenant } = useTenant();
  return currentTenant?.terminology || DEFAULT_TERMINOLOGY;
}

export function useTerm(key: keyof TenantTerminology, plural: boolean = false): string {
  const terminology = useTerminology();
  if (plural) {
    const pluralKey = `${key}Plural` as keyof TenantTerminology;
    if (pluralKey in terminology) {
      return terminology[pluralKey];
    }
  }
  return terminology[key] || key;
}

export function useCurrency() {
  const { currentTenant } = useTenant();
  const currency = currentTenant?.currency || 'USD';
  const locale = currentTenant?.locale || 'en-US';

  const symbols: Record<Currency, string> = {
    USD: '$',
    MXN: '$',
    EUR: '€',
    GBP: '£',
    CAD: '$',
  };

  return {
    format: (amount: number) => formatTenantCurrency(amount, currency, locale),
    currency,
    symbol: symbols[currency],
    locale,
  };
}

export function useTenantDate() {
  const { currentTenant } = useTenant();
  const locale = currentTenant?.locale || 'en-US';

  return {
    format: (date: string | Date) => formatTenantDate(date, locale),
    locale,
  };
}

export function useFeature(featureKey: keyof TenantConfig['features']): boolean {
  const { currentTenant } = useTenant();
  if (!currentTenant?.features) return false;
  return currentTenant.features[featureKey] ?? false;
}

// Storage key exports for use in auth context
export { STORAGE_KEY_TENANT, STORAGE_KEY_USER_ROLE };
