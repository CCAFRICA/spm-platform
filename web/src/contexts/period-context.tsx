'use client';

/**
 * Period Context — Manages active period selection for all dashboard surfaces.
 *
 * On mount, queries the periods table and enriches each with lifecycle state
 * from calculation_batches. Auto-selects the most recent open period.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useTenant } from './tenant-context';
import type { PeriodInfo } from '@/components/design-system/PeriodRibbon';

interface PeriodContextValue {
  activePeriodKey: string;
  activePeriodId: string;
  activePeriodLabel: string;
  availablePeriods: PeriodInfo[];
  setActivePeriod: (periodKey: string) => void;
  isLoading: boolean;
}

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

async function loadPeriods(tenantId: string): Promise<PeriodInfo[]> {
  // Use API route (service role bypasses RLS) — OB-58 fix
  const res = await fetch(`/api/periods?tenant_id=${encodeURIComponent(tenantId)}`);
  if (!res.ok) {
    console.warn('[PeriodContext] API returned', res.status);
    return [];
  }
  const { periods, batches } = await res.json() as {
    periods: Array<{ id: string; canonical_key: string; label?: string; period_type: string; start_date: string; end_date: string; status: string }>;
    batches: Array<{ period_id: string; lifecycle_state: string; created_at: string }>;
  };

  if (!periods || periods.length === 0) return [];

  // Build map of latest batch lifecycle per period
  const latestBatchByPeriod = new Map<string, string>();
  for (const b of (batches ?? [])) {
    if (!latestBatchByPeriod.has(b.period_id)) {
      latestBatchByPeriod.set(b.period_id, b.lifecycle_state);
    }
  }

  return periods.map((p) => ({
    periodId: p.id,
    periodKey: p.canonical_key,
    label: p.label || formatPeriodLabel(p.canonical_key, p.start_date),
    status: p.status,
    lifecycleState: latestBatchByPeriod.get(p.id) ?? null,
    startDate: p.start_date,
    endDate: p.end_date,
    needsAttention: false,
  }));
}

function formatPeriodLabel(periodKey: string, startDate: string): string {
  try {
    const d = new Date(startDate);
    const month = d.toLocaleString('es-MX', { month: 'short' });
    const year = d.getFullYear();
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
  } catch {
    return periodKey;
  }
}

export function PeriodProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentTenant?.id) {
      setPeriods([]);
      setActiveKey('');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function init() {
      setIsLoading(true);
      try {
        const loaded = await loadPeriods(currentTenant!.id);
        if (cancelled) return;
        setPeriods(loaded);

        // Auto-select: most recent open period, or latest
        const open = loaded.find(p => p.status === 'open');
        const selected = open ?? loaded[0];
        if (selected) {
          setActiveKey(selected.periodKey);
        }
      } catch (err) {
        console.warn('[PeriodContext] Failed to load periods:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [currentTenant?.id]);

  const setActivePeriod = useCallback((periodKey: string) => {
    setActiveKey(periodKey);
  }, []);

  const activePeriod = useMemo(() => {
    return periods.find(p => p.periodKey === activeKey) ?? null;
  }, [periods, activeKey]);

  const activePeriodId = activePeriod?.periodId ?? '';
  const activePeriodLabel = activePeriod?.label ?? activeKey;

  const value = useMemo<PeriodContextValue>(() => ({
    activePeriodKey: activeKey,
    activePeriodId,
    activePeriodLabel,
    availablePeriods: periods,
    setActivePeriod,
    isLoading,
  }), [activeKey, activePeriodId, activePeriodLabel, periods, setActivePeriod, isLoading]);

  return (
    <PeriodContext.Provider value={value}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod(): PeriodContextValue {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error('usePeriod must be used within PeriodProvider');
  }
  return context;
}
