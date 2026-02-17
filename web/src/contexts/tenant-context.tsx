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
import { createClient } from '@/lib/supabase/client';
import type { TenantConfig, TenantSummary, TenantTerminology, Currency } from '@/types/tenant';
import { DEFAULT_TERMINOLOGY, DEFAULT_FEATURES, formatTenantCurrency, formatTenantDate } from '@/types/tenant';



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

  // Try static JSON first
  try {
    const config = await import(`@/data/tenants/${normalizedId}/config.json`);
    const tenantConfig = { ...(config.default || config), id: normalizedId };
    tenantConfigCache[normalizedId] = tenantConfig;
    return tenantConfig;
  } catch {
    // Static config not found — fall back to Supabase tenants table
  }

  // Try server-side API route (bypasses RLS via service role client)
  try {
    const res = await fetch(`/api/platform/tenant-config?id=${encodeURIComponent(normalizedId)}`);
    if (res.ok) {
      const data = await res.json();
      const tenantConfig: TenantConfig = {
        ...data,
        industry: data.industry || 'Retail',
        features: { ...DEFAULT_FEATURES, ...data.features },
        terminology: DEFAULT_TERMINOLOGY,
      };
      tenantConfigCache[tenantConfig.id] = tenantConfig;
      return tenantConfig;
    }
  } catch {
    // API route unavailable — fall through to direct Supabase
  }

  // Direct Supabase fallback: try by ID first, then by slug
  try {
    const supabase = createClient();
    let row: Record<string, unknown> | null = null;

    const { data: byId } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', normalizedId)
      .single();
    if (byId) row = byId as Record<string, unknown>;

    if (!row) {
      const { data: bySlug } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', normalizedId)
        .single();
      if (bySlug) row = bySlug as Record<string, unknown>;
    }

    if (row) {
      const settings = (row.settings || {}) as Record<string, unknown>;
      const features = (row.features || {}) as Record<string, boolean>;
      const tenantConfig: TenantConfig = {
        id: row.id as string,
        name: row.name as string,
        displayName: row.name as string,
        industry: 'Retail' as TenantConfig['industry'],
        country: (settings.country_code as string) || 'MX',
        currency: (row.currency as TenantConfig['currency']) || 'MXN',
        locale: (row.locale as TenantConfig['locale']) || 'es-MX',
        timezone: (settings.timezone as string) || 'America/Mexico_City',
        features: { ...DEFAULT_FEATURES, ...features },
        terminology: DEFAULT_TERMINOLOGY,
        createdAt: (row.created_at as string) || new Date().toISOString(),
        updatedAt: (row.updated_at as string) || new Date().toISOString(),
        status: 'active',
      };
      tenantConfigCache[tenantConfig.id] = tenantConfig;
      return tenantConfig;
    }
  } catch (err) {
    console.warn('[TenantContext] Supabase fallback failed:', err);
  }

  throw new Error(`Failed to load tenant config: ${normalizedId}`);
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isVLAdmin: isAdmin, isLoading: authLoading } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<TenantConfig | null>(null);
  // Available tenants loaded by select-tenant page from Supabase directly
  const availableTenants: TenantSummary[] = [];
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
        // VL Admin: tenant list loaded by select-tenant page from Supabase
        // No static registry needed here

        // Derive tenant from authenticated user
        if (user && !isAdmin && 'tenantId' in user && user.tenantId) {
          await loadTenant(user.tenantId);
        } else if (isAdmin) {
          // VL Admin without selected tenant — check sessionStorage then cookie
          let selectedTenant: string | null = null;
          if (typeof window !== 'undefined') {
            selectedTenant = sessionStorage.getItem('vialuce_admin_tenant');
            if (!selectedTenant) {
              const match = document.cookie.match(/vialuce-tenant-id=([^;]+)/);
              selectedTenant = match ? match[1] : null;
            }
          }
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
      // Store admin's tenant selection in sessionStorage + cookie
      if (isAdmin && typeof window !== 'undefined') {
        sessionStorage.setItem('vialuce_admin_tenant', tenantId);
        document.cookie = `vialuce-tenant-id=${tenantId}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
      }
      // Route to dashboard (/) — persona-driven landing page for all roles
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch tenant');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router, loadTenant, isAdmin, user]);

  const clearTenant = useCallback((): void => {
    setCurrentTenant(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vialuce_admin_tenant');
      document.cookie = 'vialuce-tenant-id=; path=/; max-age=0';
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
    MXN: 'MX$',
    EUR: '€',
    GBP: '£',
    CAD: 'CA$',
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
  const value = currentTenant.features[featureKey];
  return typeof value === 'boolean' ? value : !!value;
}
