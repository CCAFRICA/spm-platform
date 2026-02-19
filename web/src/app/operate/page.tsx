'use client';

/**
 * Operate Cockpit — Admin lifecycle control center
 *
 * Shows: Period Ribbon, Lifecycle Stepper, Data Readiness,
 * Calculation summary, Results preview, Next action bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { PeriodRibbon, type PeriodInfo } from '@/components/design-system/PeriodRibbon';
import { LifecycleStepper } from '@/components/design-system/LifecycleStepper';
import { DataReadinessPanel, type DataReadiness } from '@/components/design-system/DataReadinessPanel';
import { DistributionChart } from '@/components/design-system/DistributionChart';
import { BenchmarkBar } from '@/components/design-system/BenchmarkBar';
import { AnimatedNumber } from '@/components/design-system/AnimatedNumber';
import { StatusPill } from '@/components/design-system/StatusPill';
import {
  transitionLifecycle,
  toDashboardState,
  LIFECYCLE_DISPLAY,
  isDashboardState,
} from '@/lib/lifecycle/lifecycle-service';
import { extractAttainment } from '@/lib/data/persona-queries';
import { loadOperatePageData } from '@/lib/data/page-loaders';
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
  const { symbol: currencySymbol } = useCurrency();
  const { locale } = useLocale();
  const isSpanish = locale === 'es-MX';
  const tenantId = currentTenant?.id ?? '';

  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<DataReadiness>(defaultReadiness());
  const [calcSummary, setCalcSummary] = useState<CalcSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activePeriodId = periods.find(p => p.periodKey === activeKey)?.periodId ?? '';

  // Single batched load — no inline Supabase queries
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      const data = await loadOperatePageData(tenantId);
      if (cancelled) return;

      const enriched: PeriodInfo[] = data.periods.map(p => ({
        periodId: p.id,
        periodKey: p.canonical_key,
        label: formatLabel(p.start_date),
        status: p.status,
        lifecycleState: p.lifecycleState,
        startDate: p.start_date,
        endDate: p.end_date,
        needsAttention: false,
      }));

      setPeriods(enriched);
      const open = enriched.find(p => p.status === 'open') ?? enriched[0];
      if (open) setActiveKey(open.periodKey);

      // Lifecycle state
      setLifecycleState(data.lifecycleState);

      // Data readiness
      setReadiness({
        plan: data.hasActivePlan
          ? { status: 'ready', label: isSpanish ? 'Plan activo encontrado' : 'Active plan found' }
          : { status: 'missing', label: isSpanish ? 'No hay plan activo' : 'No active plan', detail: isSpanish ? 'Configura un rule set en estado activo' : 'Configure an active rule set' },
        data: data.lastImportStatus
          ? { status: data.lastImportStatus === 'completed' ? 'ready' : 'warning', label: isSpanish ? 'Datos importados' : 'Data imported', detail: `${isSpanish ? 'Ultimo import' : 'Last import'}: ${data.lastImportStatus}` }
          : { status: 'missing', label: isSpanish ? 'No hay datos importados' : 'No data imported', detail: isSpanish ? 'Importa datos de transacciones' : 'Import transaction data' },
        mapping: { status: 'ready', label: isSpanish ? 'Mapeo de entidades' : 'Entity mapping', detail: isSpanish ? 'Basado en entity_relationships' : 'Based on entity_relationships' },
        validation: data.lastBatchCreatedAt
          ? { status: 'ready', label: isSpanish ? 'Calculo ejecutado' : 'Calculation executed', detail: `${isSpanish ? 'Ultimo' : 'Last'}: ${new Date(data.lastBatchCreatedAt).toLocaleString(isSpanish ? 'es-MX' : 'en-US')}` }
          : { status: 'never', label: isSpanish ? 'Sin calculos previos' : 'No previous calculations', detail: isSpanish ? 'Ejecuta un calculo desde Vista Previa' : 'Run a calculation from Preview' },
      });

      // Calc summary from preloaded outcomes
      if (data.outcomes.length > 0) {
        const safeOutcomes = data.outcomes;
        const sorted = [...safeOutcomes].sort((a, b) => b.total_payout - a.total_payout);
        setCalcSummary({
          totalPayout: safeOutcomes.reduce((s, o) => s + o.total_payout, 0),
          entityCount: safeOutcomes.length,
          componentCount: 0,
          lastRunAt: data.lastBatchCreatedAt,
          attainmentDist: safeOutcomes.map(o => extractAttainment(o.attainment_summary as Json)),
          topEntities: sorted.slice(0, 5).map(o => ({
            name: data.entityNames.get(o.entity_id) ?? o.entity_id,
            value: o.total_payout,
          })),
          bottomEntities: sorted.slice(-5).reverse().map(o => ({
            name: data.entityNames.get(o.entity_id) ?? o.entity_id,
            value: o.total_payout,
          })),
        });
      } else {
        setCalcSummary(null);
      }
    }

    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, isSpanish]);

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
        <p>{isSpanish ? 'Selecciona un tenant para acceder al centro de operaciones.' : 'Select a tenant to access the operations center.'}</p>
      </div>
    );
  }

  if (isLoading && periods.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500">{isSpanish ? 'Cargando periodos...' : 'Loading periods...'}</p>
        </div>
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
            <h1 className="text-xl font-bold text-zinc-100">{isSpanish ? 'Centro de Operaciones' : 'Operations Center'}</h1>
            <p className="text-sm text-zinc-500">{isSpanish ? 'Gestiona el ciclo de calculo para el periodo seleccionado' : 'Manage the calculation cycle for the selected period'}</p>
          </div>
          {lifecycleState && stateDisplay && (
            <StatusPill color={dashState === 'APPROVED' || dashState === 'POSTED' ? 'emerald' : dashState === 'PUBLISHED' ? 'indigo' : 'zinc'}>
              {isSpanish ? stateDisplay.labelEs : stateDisplay.label}
            </StatusPill>
          )}
        </div>

        {/* Lifecycle Stepper */}
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
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
          <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <DataReadinessPanel readiness={readiness} />
          </div>

          {/* Right: Calculation Summary */}
          <div className="rounded-2xl space-y-3" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{isSpanish ? 'Resumen de Calculo' : 'Calculation Summary'}</h4>
            {calcSummary ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-zinc-500">{isSpanish ? 'Pago Total' : 'Total Payout'}</p>
                    <p className="text-lg font-bold text-zinc-100">
                      {currencySymbol}<AnimatedNumber value={calcSummary.totalPayout} />
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-500">{isSpanish ? 'Entidades' : 'Entities'}</p>
                    <p className="text-lg font-bold text-zinc-100">{calcSummary.entityCount}</p>
                  </div>
                </div>
                {calcSummary.lastRunAt && (
                  <p className="text-[11px] text-zinc-600">
                    {isSpanish ? 'Ultimo calculo' : 'Last calculation'}: {new Date(calcSummary.lastRunAt).toLocaleString(isSpanish ? 'es-MX' : 'en-US')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">{isSpanish ? 'No hay resultados de calculo para este periodo.' : 'No calculation results for this period.'}</p>
            )}
          </div>
        </div>

        {/* Results Preview */}
        {calcSummary && calcSummary.attainmentDist.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl space-y-3" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{isSpanish ? 'Distribucion de Logro' : 'Attainment Distribution'}</h4>
              <DistributionChart data={calcSummary.attainmentDist} benchmarkLine={100} />
            </div>
            <div className="rounded-2xl space-y-3" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{isSpanish ? 'Top 5 Entidades' : 'Top 5 Entities'}</h4>
              <div className="space-y-2">
                {calcSummary.topEntities.map((e) => (
                  <BenchmarkBar
                    key={e.name}
                    value={e.value}
                    benchmark={calcSummary.totalPayout / calcSummary.entityCount}
                    label={e.name}
                    rightLabel={<span className="text-emerald-400 tabular-nums">{currencySymbol}{e.value.toLocaleString()}</span>}
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
