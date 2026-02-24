'use client';

/**
 * SessionContext — Consolidated global data fetched ONCE per tenant selection.
 *
 * OB-93: Provides entity/period/batch/ruleset counts and metadata
 * that multiple pages need for badges, overview metrics, and navigation.
 * Fetches in a single batched Promise.all() — no duplicate queries.
 *
 * Sits BELOW TenantProvider (needs tenant ID) and ABOVE page-level providers.
 * Does NOT replace OperateContext (OB-92) — that's workspace-specific.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
  type ReactNode,
} from 'react';
import { useTenant } from './tenant-context';
import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface SessionCounts {
  entityCount: number;
  periodCount: number;
  batchCount: number;
  ruleSetCount: number;
  importBatchCount: number;
  signalCount: number;
}

interface SessionContextValue extends SessionCounts {
  isLoading: boolean;
  refreshCounts: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const DEFAULT_COUNTS: SessionCounts = {
  entityCount: 0,
  periodCount: 0,
  batchCount: 0,
  ruleSetCount: 0,
  importBatchCount: 0,
  signalCount: 0,
};

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export function SessionProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? '';

  const [counts, setCounts] = useState<SessionCounts>(DEFAULT_COUNTS);
  const [isLoading, setIsLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    if (!tenantId) {
      setCounts(DEFAULT_COUNTS);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();

      // All count queries batched in parallel — head:true means no row data transferred
      const [entityRes, periodRes, batchRes, ruleSetRes, importRes, signalRes] = await Promise.all([
        supabase.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('calculation_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('import_batches').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('classification_signals').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ]);

      setCounts({
        entityCount: entityRes.count ?? 0,
        periodCount: periodRes.count ?? 0,
        batchCount: batchRes.count ?? 0,
        ruleSetCount: ruleSetRes.count ?? 0,
        importBatchCount: importRes.count ?? 0,
        signalCount: signalRes.count ?? 0,
      });
    } catch (err) {
      console.warn('[SessionContext] Failed to load counts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const value = useMemo<SessionContextValue>(() => ({
    ...counts,
    isLoading,
    refreshCounts: loadCounts,
  }), [counts, isLoading, loadCounts]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
