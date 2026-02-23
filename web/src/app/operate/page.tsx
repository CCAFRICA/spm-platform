'use client';

/**
 * Operate Cockpit — Admin lifecycle control center
 *
 * Shows: Period Ribbon, Lifecycle Stepper, Data Readiness,
 * Calculation summary, Results preview, Next action bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useLocale } from '@/contexts/locale-context';
import { useAuth } from '@/contexts/auth-context';
import { isVLAdmin } from '@/types/auth';
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
import { AssessmentPanel } from '@/components/design-system/AssessmentPanel';
import type { Json } from '@/lib/supabase/database.types';

interface CalcSummary {
  totalPayout: number;
  entityCount: number;
  componentCount: number;
  lastRunAt: string | null;
  attainmentDist: number[];
  topEntities: { name: string; value: number }[];
  bottomEntities: { name: string; value: number }[];
  componentBreakdown: Array<{ name: string; type: string; payout: number }>;
}

export default function OperateCockpitPage() {
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { symbol: currencySymbol, format: formatCurrency } = useCurrency();
  const { locale } = useLocale();
  const { user } = useAuth();
  const isSpanish = (user && isVLAdmin(user)) ? false : locale === 'es-MX';
  const tenantId = currentTenant?.id ?? '';

  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<DataReadiness>(defaultReadiness());
  const [calcSummary, setCalcSummary] = useState<CalcSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [ruleSetId, setRuleSetId] = useState<string | null>(null);
  const [ruleSetName, setRuleSetName] = useState<string | null>(null);
  const [zeroPayoutConfirm, setZeroPayoutConfirm] = useState<{ nextState: string } | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  const activePeriodId = periods.find(p => p.periodKey === activeKey)?.periodId ?? '';

  // Single batched load — no inline Supabase queries
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;

    async function load() {
      // OB-73 Mission 6 / F-39: Wrap in try/catch so "Loading periods..."
      // never gets stuck. If loadOperatePageData throws (RLS, empty tenant),
      // we fall through to the empty state instead of infinite spinner.
      let data;
      try {
        data = await loadOperatePageData(tenantId);
      } catch (err) {
        console.warn('[Operate] Failed to load page data:', err);
        return; // isLoading will be set to false in .finally()
      }
      if (cancelled) return;

      const enriched: PeriodInfo[] = data.periods.map(p => ({
        periodId: p.id,
        periodKey: p.canonical_key,
        label: formatLabel(p.start_date, isSpanish ? 'es-MX' : 'en-US'),
        status: p.status,
        lifecycleState: p.lifecycleState,
        startDate: p.start_date,
        endDate: p.end_date,
        needsAttention: false,
        entityCount: p.entityCount,
      }));

      setPeriods(enriched);
      const open = enriched.find(p => p.status === 'open') ?? enriched[0];
      if (open) setActiveKey(open.periodKey);

      // Rule set ID + name for calculation trigger
      setRuleSetId(data.ruleSetId);
      setRuleSetName(data.ruleSetName);
      setLastBatchId(data.lastBatchId);

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
          componentCount: data.componentBreakdown.length,
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
          componentBreakdown: data.componentBreakdown,
        });
      } else {
        setCalcSummary(null);
      }
    }

    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, isSpanish]);

  // Reload page data after calculation or transition
  const reloadData = useCallback(async () => {
    if (!tenantId) return;
    const data = await loadOperatePageData(tenantId);

    const enriched: PeriodInfo[] = data.periods.map(p => ({
      periodId: p.id,
      periodKey: p.canonical_key,
      label: formatLabel(p.start_date, isSpanish ? 'es-MX' : 'en-US'),
      status: p.status,
      lifecycleState: p.lifecycleState,
      startDate: p.start_date,
      endDate: p.end_date,
      needsAttention: false,
      entityCount: p.entityCount,
    }));

    setPeriods(enriched);
    setLifecycleState(data.lifecycleState);
    setRuleSetId(data.ruleSetId);
    setRuleSetName(data.ruleSetName);
    setLastBatchId(data.lastBatchId);

    if (data.outcomes.length > 0) {
      const sorted = [...data.outcomes].sort((a, b) => b.total_payout - a.total_payout);
      setCalcSummary({
        totalPayout: data.outcomes.reduce((s, o) => s + o.total_payout, 0),
        entityCount: data.outcomes.length,
        componentCount: data.componentBreakdown.length,
        lastRunAt: data.lastBatchCreatedAt,
        attainmentDist: data.outcomes.map(o => extractAttainment(o.attainment_summary as Json)),
        topEntities: sorted.slice(0, 5).map(o => ({
          name: data.entityNames.get(o.entity_id) ?? o.entity_id,
          value: o.total_payout,
        })),
        bottomEntities: sorted.slice(-5).reverse().map(o => ({
          name: data.entityNames.get(o.entity_id) ?? o.entity_id,
          value: o.total_payout,
        })),
        componentBreakdown: data.componentBreakdown,
      });
    } else {
      setCalcSummary(null);
    }
  }, [tenantId]);

  const handleAdvance = useCallback(async (nextState: string) => {
    if (!tenantId || !activePeriodId) return;
    setCalcError(null);

    // DRAFT → PREVIEW: Trigger calculation first
    if (nextState === 'PREVIEW' && (!lifecycleState || lifecycleState === 'DRAFT')) {
      if (!ruleSetId) {
        setCalcError(isSpanish ? 'No hay plan activo. Configura un rule set primero.' : 'No active plan. Configure a rule set first.');
        return;
      }

      setIsCalculating(true);
      try {
        const response = await fetch('/api/calculation/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, periodId: activePeriodId, ruleSetId }),
        });

        const result = await response.json();

        if (!response.ok) {
          setCalcError(result.error || (isSpanish ? 'Error al ejecutar calculo' : 'Calculation failed'));
          return;
        }

        // Calculation succeeded — reload page data to show results
        await reloadData();
      } catch (err) {
        setCalcError(isSpanish ? 'Error de red al ejecutar calculo' : 'Network error running calculation');
        console.error('[Operate] Calculation error:', err);
      } finally {
        setIsCalculating(false);
      }
      return;
    }

    // All other transitions: use lifecycle service
    const result = await transitionLifecycle(tenantId, activePeriodId, nextState as never);
    if (result.success) {
      setLifecycleState(nextState);
      setPeriods(prev => prev.map(p =>
        p.periodId === activePeriodId ? { ...p, lifecycleState: nextState } : p
      ));
    } else if (result.requiresConfirmation) {
      // OB-73 Mission 4 / F-63: All payouts are $0 — ask for confirmation
      setZeroPayoutConfirm({ nextState });
    } else if (result.error) {
      setCalcError(result.error);
    }
  }, [tenantId, activePeriodId, ruleSetId, lifecycleState, isSpanish, reloadData]);

  // OB-73 Mission 4 / F-63: Handle $0 payout confirmation override
  const handleZeroPayoutConfirm = useCallback(async () => {
    if (!zeroPayoutConfirm || !tenantId || !activePeriodId) return;
    setZeroPayoutConfirm(null);
    const result = await transitionLifecycle(tenantId, activePeriodId, zeroPayoutConfirm.nextState as never, { forceZeroPayout: true });
    if (result.success) {
      setLifecycleState(zeroPayoutConfirm.nextState);
      setPeriods(prev => prev.map(p =>
        p.periodId === activePeriodId ? { ...p, lifecycleState: zeroPayoutConfirm.nextState } : p
      ));
    } else if (result.error) {
      setCalcError(result.error);
    }
  }, [zeroPayoutConfirm, tenantId, activePeriodId]);

  const dashState = lifecycleState && isDashboardState(lifecycleState)
    ? lifecycleState
    : lifecycleState ? toDashboardState(lifecycleState) : 'DRAFT';

  const stateDisplay = LIFECYCLE_DISPLAY[dashState as keyof typeof LIFECYCLE_DISPLAY];

  if (!tenantId) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <p>{isSpanish ? 'Selecciona un tenant para acceder al centro de operaciones.' : 'Select a tenant to access the operations center.'}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-400">{isSpanish ? 'Cargando periodos...' : 'Loading periods...'}</p>
        </div>
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-2">
          {isSpanish ? 'No hay periodos configurados' : 'No periods configured'}
        </h3>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {isSpanish
            ? 'Crea tu primer periodo para comenzar a gestionar el ciclo de operaciones.'
            : 'Create your first period to start managing the operations lifecycle.'}
        </p>
        <button
          onClick={() => window.location.href = '/configure/periods'}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: '#7c3aed' }}
        >
          {isSpanish ? 'Configurar Periodos' : 'Configure Periods'}
        </button>
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
            <p className="text-sm text-zinc-400">{isSpanish ? 'Gestiona el ciclo de calculo para el periodo seleccionado' : 'Manage the calculation cycle for the selected period'}</p>
          </div>
          {lifecycleState && stateDisplay && (
            <StatusPill color={dashState === 'APPROVED' || dashState === 'POSTED' ? 'emerald' : dashState === 'PUBLISHED' ? 'indigo' : 'zinc'}>
              {isSpanish ? stateDisplay.labelEs : stateDisplay.label}
            </StatusPill>
          )}
        </div>

        {/* OB-85: Active Plan + Run Calculation */}
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">
                {isSpanish ? 'Plan Activo' : 'Active Plan'}
              </h4>
              {ruleSetName ? (
                <p className="text-sm font-medium text-zinc-200">{ruleSetName}</p>
              ) : (
                <p className="text-sm text-zinc-500">{isSpanish ? 'No hay plan activo' : 'No active plan'}</p>
              )}
              {activeKey && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {isSpanish ? 'Periodo' : 'Period'}: {periods.find(p => p.periodKey === activeKey)?.label ?? activeKey}
                </p>
              )}
            </div>
            <button
              onClick={() => handleAdvance('PREVIEW')}
              disabled={!activeKey || !ruleSetId || isCalculating}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: (!activeKey || !ruleSetId || isCalculating) ? '#3f3f46' : '#7c3aed',
                boxShadow: (!activeKey || !ruleSetId || isCalculating) ? 'none' : '0 0 20px rgba(124, 58, 237, 0.3)',
              }}
            >
              {isCalculating
                ? (isSpanish ? 'Calculando...' : 'Calculating...')
                : (isSpanish ? 'Ejecutar Calculo' : 'Run Calculation')}
            </button>
          </div>
        </div>

        {/* Lifecycle Stepper */}
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          {isCalculating ? (
            <div className="flex items-center gap-3 py-4">
              <div className="h-5 w-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-300">{isSpanish ? 'Ejecutando calculo...' : 'Running calculation...'}</span>
            </div>
          ) : (
            <LifecycleStepper
              currentState={dashState}
              onAdvance={handleAdvance}
              onGoBack={handleAdvance}
              canGoBack={true}
            />
          )}
          {calcError && (
            <div className="mt-3 px-3 py-2 rounded-lg text-sm text-red-300" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {calcError}
            </div>
          )}
          {/* OB-73 Mission 4 / F-63: Zero payout confirmation dialog */}
          {zeroPayoutConfirm && (
            <div className="mt-3 px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <p className="text-amber-300 font-medium mb-2">
                {isSpanish ? 'Todos los pagos son $0' : 'All entity payouts are $0'}
              </p>
              <p className="text-zinc-400 text-xs mb-3">
                {isSpanish
                  ? 'Todos los resultados de calculo muestran pago $0. ¿Deseas avanzar de todas formas?'
                  : 'All calculation results show $0 payout. Do you want to advance anyway?'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleZeroPayoutConfirm}
                  className="px-3 py-1.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: '#d97706' }}
                >
                  {isSpanish ? 'Si, avanzar' : 'Yes, advance'}
                </button>
                <button
                  onClick={() => setZeroPayoutConfirm(null)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  style={{ backgroundColor: 'rgba(39, 39, 42, 0.8)' }}
                >
                  {isSpanish ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
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
                    <p className="text-[11px] text-zinc-400">{isSpanish ? 'Pago Total' : 'Total Payout'}</p>
                    <p className="text-lg font-bold text-zinc-100">
                      {currencySymbol}<AnimatedNumber value={calcSummary.totalPayout} />
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">{isSpanish ? 'Entidades' : 'Entities'}</p>
                    <p className="text-lg font-bold text-zinc-100">{calcSummary.entityCount}</p>
                  </div>
                </div>

                {/* OB-85: Per-component breakdown */}
                {calcSummary.componentBreakdown.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{isSpanish ? 'Componentes' : 'Components'}</p>
                    {calcSummary.componentBreakdown.map((comp) => (
                      <div key={comp.name} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 truncate max-w-[60%]">{comp.name}</span>
                        <span className="text-zinc-200 tabular-nums font-medium">{formatCurrency(comp.payout)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {calcSummary.lastRunAt && (
                  <p className="text-[11px] text-zinc-600">
                    {isSpanish ? 'Ultimo calculo' : 'Last calculation'}: {new Date(calcSummary.lastRunAt).toLocaleString(isSpanish ? 'es-MX' : 'en-US')}
                  </p>
                )}

                {/* OB-85: Reconcile button */}
                <button
                  onClick={() => router.push(`/investigate/reconciliation${lastBatchId ? `?batchId=${lastBatchId}` : ''}`)}
                  className="w-full mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{ backgroundColor: '#059669', boxShadow: '0 0 12px rgba(5, 150, 105, 0.2)' }}
                >
                  {isSpanish ? 'Reconciliar' : 'Reconcile'} →
                </button>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">{isSpanish ? 'No hay resultados de calculo para este periodo.' : 'No calculation results for this period.'}</p>
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

        {/* OB-71: AI Governance Assessment — visible when calculation results exist */}
        {calcSummary && (
          <AssessmentPanel
            persona="admin"
            data={{
              totalPayout: calcSummary.totalPayout,
              entityCount: calcSummary.entityCount,
              avgPayout: calcSummary.entityCount > 0 ? calcSummary.totalPayout / calcSummary.entityCount : 0,
              lifecycleState: lifecycleState,
              lastRunAt: calcSummary.lastRunAt,
              topEntities: calcSummary.topEntities,
              bottomEntities: calcSummary.bottomEntities,
              attainmentDistribution: calcSummary.attainmentDist,
            }}
            locale={isSpanish ? 'es' : 'en'}
            accentColor="#7c3aed"
            tenantId={tenantId}
          />
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

function formatLabel(startDate: string, locale: string = 'es-MX'): string {
  try {
    const d = new Date(startDate);
    const month = d.toLocaleString(locale, { month: 'short' });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`;
  } catch {
    return startDate;
  }
}
