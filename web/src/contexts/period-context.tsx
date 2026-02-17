'use client';

/**
 * Period Context — Manages active period selection for all dashboard surfaces.
 *
 * On mount, queries the periods table and enriches each with lifecycle state
 * from calculation_batches. Auto-selects the most recent open period.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useTenant } from './tenant-context';
import { createClient } from '@/lib/supabase/client';
import type { PeriodInfo } from '@/components/design-system/PeriodRibbon';

interface PeriodContextValue {
  activePeriodKey: string;
  activePeriodId: string;
  availablePeriods: PeriodInfo[];
  setActivePeriod: (periodKey: string) => void;
  isLoading: boolean;
}

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

async function loadPeriods(tenantId: string): Promise<PeriodInfo[]> {
  const supabase = createClient();

  const { data: periods } = await supabase
    .from('periods')
    .select('id, period_key, period_type, start_date, end_date, status')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false });

  if (!periods || periods.length === 0) return [];

  const enriched = await Promise.all(
    periods.map(async (p) => {
      const { data: batch } = await supabase
        .from('calculation_batches')
        .select('lifecycle_state')
        .eq('tenant_id', tenantId)
        .eq('period_id', p.id)
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        periodId: p.id,
        periodKey: p.period_key,
        label: formatPeriodLabel(p.period_key, p.start_date),
        status: p.status,
        lifecycleState: batch?.lifecycle_state ?? null,
        startDate: p.start_date,
        endDate: p.end_date,
        needsAttention: false,
      };
    })
  );

  return enriched;
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

  const activePeriodId = useMemo(() => {
    const found = periods.find(p => p.periodKey === activeKey);
    return found?.periodId ?? '';
  }, [periods, activeKey]);

  const value = useMemo<PeriodContextValue>(() => ({
    activePeriodKey: activeKey,
    activePeriodId,
    availablePeriods: periods,
    setActivePeriod,
    isLoading,
  }), [activeKey, activePeriodId, periods, setActivePeriod, isLoading]);

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
