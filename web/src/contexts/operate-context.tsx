'use client';

/**
 * OperateContext — Shared state for the Operate workspace.
 *
 * OB-92: Holds user's current Plan × Period × Batch selections.
 * Persists in sessionStorage so selections survive page navigation.
 * Cascading: Plan → Period → Batch (changing plan resets period and batch).
 *
 * All Operate pages consume this context instead of fetching independently.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
  type ReactNode,
} from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { createClient } from '@/lib/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PlanOption {
  id: string;
  name: string;
  status: string;
}

interface PeriodOption {
  id: string;
  label: string;
  canonicalKey: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface BatchOption {
  id: string;
  periodId: string;
  ruleSetId: string | null;
  lifecycleState: string;
  entityCount: number;
  totalPayout: number;
  createdAt: string;
}

interface OperateContextValue {
  // Available options
  plans: PlanOption[];
  periods: PeriodOption[];
  batches: BatchOption[];

  // Current selections
  selectedPlanId: string | null;
  selectedPlan: PlanOption | null;
  selectedPeriodId: string | null;
  selectedPeriod: PeriodOption | null;
  selectedBatchId: string | null;
  selectedBatch: BatchOption | null;

  // Actions
  selectPlan: (planId: string) => void;
  selectPeriod: (periodId: string) => void;
  selectBatch: (batchId: string) => void;
  refreshBatches: () => Promise<void>;

  // Loading
  isLoading: boolean;
}

const OperateContext = createContext<OperateContextValue | undefined>(undefined);

// ──────────────────────────────────────────────
// SessionStorage keys
// ──────────────────────────────────────────────

const SK_PLAN = 'vl_operate_plan';
const SK_PERIOD = 'vl_operate_period';
const SK_BATCH = 'vl_operate_batch';

function ssGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(key);
}

function ssSet(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  if (value) sessionStorage.setItem(key, value);
  else sessionStorage.removeItem(key);
}

// ──────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────

export function OperateProvider({ children }: { children: ReactNode }) {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? '';

  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() => ssGet(SK_PLAN));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(() => ssGet(SK_PERIOD));
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(() => ssGet(SK_BATCH));
  const [isLoading, setIsLoading] = useState(true);

  // ── Load plans and periods on tenant change ──
  useEffect(() => {
    if (!tenantId) {
      setPlans([]);
      setPeriods([]);
      setBatches([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const supabase = createClient();

      // Parallel: plans + periods
      const [plansRes, periodsRes] = await Promise.all([
        supabase
          .from('rule_sets')
          .select('id, name, status')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('periods')
          .select('id, label, canonical_key, start_date, end_date, status')
          .eq('tenant_id', tenantId)
          .order('start_date', { ascending: false }),
      ]);

      if (cancelled) return;

      const loadedPlans: PlanOption[] = (plansRes.data ?? []).map(p => ({
        id: p.id,
        name: p.name ?? 'Unnamed Plan',
        status: p.status ?? 'draft',
      }));

      const loadedPeriods: PeriodOption[] = (periodsRes.data ?? []).map(p => ({
        id: p.id,
        label: p.label ?? p.canonical_key ?? 'Unknown',
        canonicalKey: p.canonical_key ?? '',
        startDate: p.start_date ?? '',
        endDate: p.end_date ?? '',
        status: p.status ?? 'open',
      }));

      setPlans(loadedPlans);
      setPeriods(loadedPeriods);

      // Auto-select: prefer sessionStorage, then first active plan
      const storedPlan = ssGet(SK_PLAN);
      const validStoredPlan = loadedPlans.find(p => p.id === storedPlan);
      if (!validStoredPlan) {
        const activePlan = loadedPlans.find(p => p.status === 'active') ?? loadedPlans[0];
        if (activePlan) {
          setSelectedPlanId(activePlan.id);
          ssSet(SK_PLAN, activePlan.id);
        }
      }

      // Auto-select period: prefer sessionStorage, then most recent
      const storedPeriod = ssGet(SK_PERIOD);
      const validStoredPeriod = loadedPeriods.find(p => p.id === storedPeriod);
      if (!validStoredPeriod && loadedPeriods.length > 0) {
        setSelectedPeriodId(loadedPeriods[0].id);
        ssSet(SK_PERIOD, loadedPeriods[0].id);
      }

      setIsLoading(false);
    }

    load().catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // ── Load batches when plan or period changes ──
  const loadBatches = useCallback(async () => {
    if (!tenantId || !selectedPeriodId) {
      setBatches([]);
      return;
    }

    const supabase = createClient();
    let query = supabase
      .from('calculation_batches')
      .select('id, period_id, rule_set_id, lifecycle_state, entity_count, summary, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_id', selectedPeriodId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (selectedPlanId) {
      query = query.eq('rule_set_id', selectedPlanId);
    }

    const { data } = await query;

    const loadedBatches: BatchOption[] = (data ?? []).map(b => {
      // Extract total_payout from summary JSONB
      const summary = b.summary as Record<string, unknown> | null;
      const totalPayout = typeof summary?.total_payout === 'number'
        ? summary.total_payout
        : 0;

      return {
        id: b.id,
        periodId: b.period_id ?? '',
        ruleSetId: b.rule_set_id,
        lifecycleState: b.lifecycle_state ?? 'DRAFT',
        entityCount: b.entity_count ?? 0,
        totalPayout,
        createdAt: b.created_at ?? '',
      };
    });

    setBatches(loadedBatches);

    // Auto-select batch: prefer sessionStorage, then most recent
    const storedBatch = ssGet(SK_BATCH);
    const validStoredBatch = loadedBatches.find(b => b.id === storedBatch);
    if (validStoredBatch) {
      setSelectedBatchId(validStoredBatch.id);
    } else if (loadedBatches.length > 0) {
      setSelectedBatchId(loadedBatches[0].id);
      ssSet(SK_BATCH, loadedBatches[0].id);
    } else {
      setSelectedBatchId(null);
      ssSet(SK_BATCH, null);
    }
  }, [tenantId, selectedPlanId, selectedPeriodId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // ── Actions ──

  const selectPlan = useCallback((planId: string) => {
    setSelectedPlanId(planId);
    ssSet(SK_PLAN, planId);
    // Cascade: reset period and batch
    setSelectedPeriodId(null);
    ssSet(SK_PERIOD, null);
    setSelectedBatchId(null);
    ssSet(SK_BATCH, null);
    setBatches([]);
    // Auto-select first period
    if (periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
      ssSet(SK_PERIOD, periods[0].id);
    }
  }, [periods]);

  const selectPeriod = useCallback((periodId: string) => {
    setSelectedPeriodId(periodId);
    ssSet(SK_PERIOD, periodId);
    // Cascade: reset batch
    setSelectedBatchId(null);
    ssSet(SK_BATCH, null);
  }, []);

  const selectBatch = useCallback((batchId: string) => {
    setSelectedBatchId(batchId);
    ssSet(SK_BATCH, batchId);
  }, []);

  // ── Derived values ──

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  );

  const selectedPeriod = useMemo(
    () => periods.find(p => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );

  const selectedBatch = useMemo(
    () => batches.find(b => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId]
  );

  const value = useMemo<OperateContextValue>(() => ({
    plans,
    periods,
    batches,
    selectedPlanId,
    selectedPlan,
    selectedPeriodId,
    selectedPeriod,
    selectedBatchId,
    selectedBatch,
    selectPlan,
    selectPeriod,
    selectBatch,
    refreshBatches: loadBatches,
    isLoading,
  }), [
    plans, periods, batches,
    selectedPlanId, selectedPlan,
    selectedPeriodId, selectedPeriod,
    selectedBatchId, selectedBatch,
    selectPlan, selectPeriod, selectBatch,
    loadBatches, isLoading,
  ]);

  return (
    <OperateContext.Provider value={value}>
      {children}
    </OperateContext.Provider>
  );
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useOperate(): OperateContextValue {
  const ctx = useContext(OperateContext);
  if (!ctx) {
    throw new Error('useOperate must be used within OperateProvider');
  }
  return ctx;
}
