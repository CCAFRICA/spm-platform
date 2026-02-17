'use client';

/**
 * Operate Cockpit — Admin lifecycle control center
 *
 * Shows: Period Ribbon, Lifecycle Stepper, Data Readiness,
 * Calculation summary, Results preview, Next action bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/contexts/tenant-context';
import { createClient } from '@/lib/supabase/client';
import { PeriodRibbon, type PeriodInfo } from '@/components/design-system/PeriodRibbon';
import { LifecycleStepper } from '@/components/design-system/LifecycleStepper';
import { DataReadinessPanel, type DataReadiness } from '@/components/design-system/DataReadinessPanel';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { StatusPill } from '@/components/design-system/StatusPill';
import {
  getCurrentLifecycleState,
  transitionLifecycle,
  toDashboardState,
  LIFECYCLE_DISPLAY,
  isDashboardState,
} from '@/lib/lifecycle/lifecycle-service';
import { extractAttainment } from '@/lib/data/persona-queries';
import type { Json } from '@/lib/supabase/database.types';

interface CalcSummary {
  totalPayout: number;
  entityCount: number;
  componentCount: number;
  lastRunAt: string | null;
  attainmentDist: number[];
  topEntities: { name: string; value: number }[];
  bottomEntities: { name: string; value: number }[];
}

export default function OperateCockpitPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id ?? '';

  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<DataReadiness>(defaultReadiness());
  const [calcSummary, setCalcSummary] = useState<CalcSummary | null>(null);
  const [, setIsLoading] = useState(true);

  const activePeriodId = periods.find(p => p.periodKey === activeKey)?.periodId ?? '';

  // Load periods
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from('periods')
        .select('id, period_key, start_date, end_date, status')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false });

      if (cancelled || !data) return;

      const enriched: PeriodInfo[] = await Promise.all(
        data.map(async (p) => {
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
            label: formatLabel(p.start_date),
            status: p.status,
            lifecycleState: batch?.lifecycle_state ?? null,
            startDate: p.start_date,
            endDate: p.end_date,
            needsAttention: false,
          };
        })
      );

      if (!cancelled) {
        setPeriods(enriched);
        const open = enriched.find(p => p.status === 'open') ?? enriched[0];
        if (open) setActiveKey(open.periodKey);
      }
    }
    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // Load lifecycle state + calc summary when period changes
  useEffect(() => {
    if (!tenantId || !activePeriodId) return;
    let cancelled = false;

    async function loadData() {
      const supabase = createClient();

      // Lifecycle state
      const state = await getCurrentLifecycleState(tenantId, activePeriodId);
      if (!cancelled) setLifecycleState(state);

      // Data readiness
      const [planData, importData, batchData] = await Promise.all([
        supabase.from('rule_sets').select('id').eq('tenant_id', tenantId).eq('status', 'active').limit(1).maybeSingle(),
        supabase.from('import_batches').select('id, status').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('calculation_batches').select('id, created_at').eq('tenant_id', tenantId).eq('period_id', activePeriodId).is('superseded_by', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (!cancelled) {
        setReadiness({
          plan: planData.data
            ? { status: 'ready', label: 'Plan activo encontrado' }
            : { status: 'missing', label: 'No hay plan activo', detail: 'Configura un rule set en estado activo' },
          data: importData.data
            ? { status: importData.data.status === 'completed' ? 'ready' : 'warning', label: 'Datos importados', detail: `Ultimo import: ${importData.data.status}` }
            : { status: 'missing', label: 'No hay datos importados', detail: 'Importa datos de transacciones' },
          mapping: { status: 'ready', label: 'Mapeo de entidades', detail: 'Basado en entity_relationships' },
          validation: batchData.data
            ? { status: 'ready', label: 'Calculo ejecutado', detail: `Ultimo: ${new Date(batchData.data.created_at).toLocaleString('es-MX')}` }
            : { status: 'never', label: 'Sin calculos previos', detail: 'Ejecuta un calculo desde Vista Previa' },
        });
      }

      // Calc summary
      if (batchData.data) {
        const { data: outcomes } = await supabase
          .from('entity_period_outcomes')
          .select('entity_id, total_payout, attainment_summary')
          .eq('tenant_id', tenantId)
          .eq('period_id', activePeriodId);

        const { data: entities } = await supabase
          .from('entities')
          .select('id, display_name')
          .eq('tenant_id', tenantId);

        const entityNames = new Map((entities ?? []).map(e => [e.id, e.display_name]));
        const safeOutcomes = outcomes ?? [];
        const sorted = [...safeOutcomes].sort((a, b) => b.total_payout - a.total_payout);

        if (!cancelled) {
          setCalcSummary({
            totalPayout: safeOutcomes.reduce((s, o) => s + o.total_payout, 0),
            entityCount: safeOutcomes.length,
            componentCount: 0,
            lastRunAt: batchData.data.created_at,
            attainmentDist: safeOutcomes.map(o => extractAttainment(o.attainment_summary as Json)),
            topEntities: sorted.slice(0, 5).map(o => ({
              name: entityNames.get(o.entity_id) ?? o.entity_id,
              value: o.total_payout,
            })),
            bottomEntities: sorted.slice(-5).reverse().map(o => ({
              name: entityNames.get(o.entity_id) ?? o.entity_id,
              value: o.total_payout,
            })),
          });
        }
      } else if (!cancelled) {
        setCalcSummary(null);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [tenantId, activePeriodId]);

  const handleAdvance = useCallback(async (nextState: string) => {
    if (!tenantId || !activePeriodId) return;
    const result = await transitionLifecycle(tenantId, activePeriodId, nextState as never);
    if (result.success) {
      setLifecycleState(nextState);
      setPeriods(prev => prev.map(p =>
        p.periodId === activePeriodId ? { ...p, lifecycleState: nextState } : p
      ));
    }
  }, [tenantId, activePeriodId]);

  const dashState = lifecycleState && isDashboardState(lifecycleState)
    ? lifecycleState
    : lifecycleState ? toDashboardState(lifecycleState) : 'DRAFT';

  const stateDisplay = LIFECYCLE_DISPLAY[dashState as keyof typeof LIFECYCLE_DISPLAY];

  if (!tenantId) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>Selecciona un tenant para acceder al centro de operaciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Period Ribbon */}
      <PeriodRibbon periods={periods} activeKey={activeKey} onSelect={setActiveKey} />

      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Centro de Operaciones</h1>
            <p className="text-sm text-zinc-500">Gestiona el ciclo de calculo para el periodo seleccionado</p>
          </div>
          {lifecycleState && stateDisplay && (
            <StatusPill color={dashState === 'APPROVED' || dashState === 'POSTED' ? 'emerald' : dashState === 'PUBLISHED' ? 'indigo' : 'zinc'}>
              {stateDisplay.labelEs}
            </StatusPill>
          )}
        </div>

        {/* Lifecycle Stepper */}
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
          <LifecycleStepper
            currentState={dashState}
            onAdvance={handleAdvance}
            onGoBack={handleAdvance}
            canGoBack={true}
          />
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Data Readiness */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
            <DataReadinessPanel readiness={readiness} />
          </div>

          {/* Right: Calculation Summary */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Resumen de Calculo</h4>
            {calcSummary ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-zinc-500">Pago Total</p>
                    <p className="text-lg font-bold text-zinc-100">
                      $<AnimatedNumber value={calcSummary.totalPayout} />
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">Entidades</p>
                    <p className="text-lg font-bold text-zinc-100">{calcSummary.entityCount}</p>
                  </div>
                </div>
                {calcSummary.lastRunAt && (
                  <p className="text-[11px] text-zinc-600">
                    Ultimo calculo: {new Date(calcSummary.lastRunAt).toLocaleString('es-MX')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No hay resultados de calculo para este periodo.</p>
            )}
          </div>
        </div>

        {/* Results Preview */}
        {calcSummary && calcSummary.attainmentDist.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Distribucion de Logro</h4>
              <DistributionChart data={calcSummary.attainmentDist} benchmarkLine={100} />
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Top 5 Entidades</h4>
              <div className="space-y-2">
                {calcSummary.topEntities.map((e) => (
                  <BenchmarkBar
                    key={e.name}
                    value={e.value}
                    benchmark={calcSummary.totalPayout / calcSummary.entityCount}
                    label={e.name}
                    rightLabel={<span className="text-emerald-400 tabular-nums">${e.value.toLocaleString()}</span>}
                    color="#10b981"
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultReadiness(): DataReadiness {
  return {
    plan: { status: 'missing', label: 'Cargando...' },
    data: { status: 'missing', label: 'Cargando...' },
    mapping: { status: 'missing', label: 'Cargando...' },
    validation: { status: 'never', label: 'Cargando...' },
  };
}

function formatLabel(startDate: string): string {
  try {
    const d = new Date(startDate);
    const month = d.toLocaleString('es-MX', { month: 'short' });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`;
  } catch {
    return startDate;
  }
}
