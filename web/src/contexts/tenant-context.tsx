'use client';

/**
 * Tenant Context — Derives tenant from authenticated user's profile.
 *
 * No localStorage for tenant/role. The user's profile (from Supabase Auth)
 * provides tenant_id. Tenant config is loaded from JSON files or Supabase.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import type { TenantConfig, TenantSummary, TenantTerminology, Currency } from '@/types/tenant';
import { DEFAULT_TERMINOLOGY, formatTenantCurrency, formatTenantDate } from '@/types/tenant';

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

// Tenant config cache to avoid repeated imports
const tenantConfigCache: Record<string, TenantConfig> = {};

/**
 * Normalize tenant ID - strip leading/trailing underscores
 */
function normalizeTenantId(id: string): string {
  const normalized = id.replace(/^_+|_+$/g, '');
  if (normalized !== id) {
    console.warn(`[TenantContext] Normalized tenantId "${id}" -> "${normalized}"`);
  }
  return normalized;
}

async function loadTenantConfig(tenantId: string): Promise<TenantConfig> {
  const normalizedId = normalizeTenantId(tenantId);

  if (tenantConfigCache[normalizedId]) {
    return tenantConfigCache[normalizedId];
  }

  // Load tenant config from static JSON files
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
  const { user, isVLAdmin: isAdmin, isLoading: authLoading } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<TenantConfig | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenant = useCallback(async (tenantId: string): Promise<void> => {
    const normalizedId = normalizeTenantId(tenantId);
    try {
      const config = await loadTenantConfig(normalizedId);
      setCurrentTenant(config);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load tenant: ${normalizedId}`);
      setIsLoading(false);
      throw err;
    }
  }, []);

  // React to auth user changes — derive tenant from profile
  useEffect(() => {
    if (authLoading) return;

    const initializeTenant = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Load available tenants for VL Admin
        if (isAdmin) {
          try {
            const registry = await import('@/data/tenants/index.json');
            const staticTenants = (registry.tenants || []) as TenantSummary[];
            setAvailableTenants(staticTenants);
          } catch {
            console.warn('Failed to load tenant registry');
          }
        }

        // Derive tenant from authenticated user
        if (user && !isAdmin && 'tenantId' in user && user.tenantId) {
          await loadTenant(user.tenantId);
        } else if (isAdmin) {
          // VL Admin without selected tenant — check if we had one selected
          // Use sessionStorage for admin's tenant selection (survives refresh, not tabs)
          const selectedTenant = typeof window !== 'undefined'
            ? sessionStorage.getItem('vialuce_admin_tenant')
            : null;
          if (selectedTenant) {
            await loadTenant(selectedTenant);
          } else {
            setIsLoading(false);
          }
        } else {
          // Not authenticated or no tenant
          setIsLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize tenant');
        setIsLoading(false);
      }
    };

    initializeTenant();
  }, [user, isAdmin, authLoading, loadTenant]);

  const setTenant = useCallback(async (tenantId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await loadTenant(tenantId);
      // Store admin's tenant selection in sessionStorage
      if (isAdmin && typeof window !== 'undefined') {
        sessionStorage.setItem('vialuce_admin_tenant', tenantId);
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch tenant');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router, loadTenant, isAdmin]);

  const clearTenant = useCallback((): void => {
    setCurrentTenant(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vialuce_admin_tenant');
    }
    if (isAdmin) {
      router.push('/select-tenant');
    }
  }, [isAdmin, router]);

  const refreshTenant = useCallback(async (): Promise<void> => {
    if (currentTenant) {
      delete tenantConfigCache[currentTenant.id];
      await loadTenant(currentTenant.id);
    }
  }, [currentTenant, loadTenant]);

  return (
    <TenantContext.Provider value={{
      currentTenant,
      isLoading,
      error,
      isVLAdmin: isAdmin,
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
