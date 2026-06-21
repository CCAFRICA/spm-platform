'use client';

/**
 * OB-226 — Unified Lifecycle Cockpit (Vialuce).
 *
 * ONE command center for the Calculation workspace: lifecycle position + the next action.
 * Renders under useIsVialuce on /operate; consolidates the old /operate (status), /operate/lifecycle
 * (actions), and /operate/calculate (run) into a single design-spec page. Reuses the proven
 * loadOperatePageData loader + the design-system primitives (PeriodRibbon / LifecycleStepper /
 * DataReadinessPanel / DistributionChart / BenchmarkBar / AnimatedNumber) and the lifecycle-service
 * transition logic. The GOLD CTA (.btn-gold) is the most prominent element — Import / Run Calculation
 * / Start Reconciliation by lifecycle phase. Korean Test: all labels via i18n locale.
 *
 * Lifecycle position is derived from data presence (results exist => calculated) since some tenants
 * (e.g. BCL) have calculation_results without a populated calculation_batches.lifecycle_state.
 */
import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
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
  isDashboardState,
  getNextAction,
  LIFECYCLE_DISPLAY,
  type DashboardLifecycleState,
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
  componentBreakdown: Array<{ name: string; type: string; payout: number }>;
}

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
}

export function LifecycleCockpit() {
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
  const [ruleSetId, setRuleSetId] = useState<string | null>(null);
  const [ruleSetName, setRuleSetName] = useState<string | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const activePeriodId = periods.find(p => p.periodKey === activeKey)?.periodId ?? '';

  const applyData = useCallback((data: Awaited<ReturnType<typeof loadOperatePageData>>) => {
    const enriched: PeriodInfo[] = data.periods.map(p => ({
      periodId: p.id,
      periodKey: p.canonical_key,
      // OB-227 Fix A: prefer the canonical DB label (matches /configure/periods). The formatLabel
      // fallback parses a date-only string TZ-safely; without 'T00:00:00' it was read as UTC midnight
      // and rendered one month early in negative-offset zones (e.g. "Oct 2025" → "Sep 2025" in CDMX).
      label: p.label || formatLabel(p.start_date, isSpanish ? 'es-MX' : 'en-US'),
      status: p.status,
      lifecycleState: p.lifecycleState,
      startDate: p.start_date,
      endDate: p.end_date,
      needsAttention: false,
      entityCount: p.entityCount,
    }));
    setPeriods(enriched);
    if (data.activePeriodKey) setActiveKey(data.activePeriodKey);
    else { const open = enriched.find(p => p.status === 'open') ?? enriched[0]; if (open) setActiveKey(open.periodKey); }
    setRuleSetId(data.ruleSetId);
    setRuleSetName(data.ruleSetName);
    setLastBatchId(data.lastBatchId);
    setLifecycleState(data.lifecycleState);
    setReadiness({
      plan: data.hasActivePlan
        ? { status: 'ready', label: isSpanish ? 'Plan activo encontrado' : 'Active plan found' }
        : { status: 'missing', label: isSpanish ? 'No hay plan activo' : 'No active plan', detail: isSpanish ? 'Configura un rule set en estado activo' : 'Configure an active rule set' },
      data: data.lastImportStatus
        ? { status: data.lastImportStatus === 'completed' ? 'ready' : 'warning', label: isSpanish ? 'Datos importados' : 'Data imported', detail: `${isSpanish ? 'Ultimo import' : 'Last import'}: ${data.lastImportStatus}` }
        : { status: 'missing', label: isSpanish ? 'No hay datos importados' : 'No data imported', detail: isSpanish ? 'Importa datos de transacciones' : 'Import transaction data' },
      mapping: { status: 'ready', label: isSpanish ? 'Mapeo de entidades' : 'Entity mapping', detail: isSpanish ? 'Basado en datos comprometidos' : 'Based on committed data' },
      validation: data.lastBatchCreatedAt
        ? { status: 'ready', label: isSpanish ? 'Calculo ejecutado' : 'Calculation executed', detail: `${isSpanish ? 'Ultimo' : 'Last'}: ${new Date(data.lastBatchCreatedAt).toLocaleString(isSpanish ? 'es-MX' : 'en-US')}` }
        : { status: 'never', label: isSpanish ? 'Sin calculos previos' : 'No previous calculations', detail: isSpanish ? 'Ejecuta un calculo' : 'Run a calculation' },
    });
    if (data.outcomes.length > 0) {
      const sorted = [...data.outcomes].sort((a, b) => b.total_payout - a.total_payout);
      setCalcSummary({
        totalPayout: data.outcomes.reduce((s, o) => s + o.total_payout, 0),
        entityCount: data.outcomes.length,
        componentCount: data.componentBreakdown.length,
        lastRunAt: data.lastBatchCreatedAt,
        attainmentDist: data.outcomes.map(o => extractAttainment(o.attainment_summary as Json)),
        topEntities: sorted.slice(0, 5).map(o => ({ name: data.entityNames.get(o.entity_id) ?? o.entity_id, value: o.total_payout })),
        componentBreakdown: data.componentBreakdown,
      });
    } else setCalcSummary(null);
  }, [isSpanish]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    loadOperatePageData(tenantId)
      .then(d => { if (!cancelled) applyData(d); })
      .catch(err => console.warn('[Cockpit] load failed:', err))
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, applyData]);

  const reloadData = useCallback(async (periodKeyOverride?: string) => {
    if (!tenantId) return;
    const data = await loadOperatePageData(tenantId, periodKeyOverride);
    applyData(data);
    if (periodKeyOverride) setActiveKey(periodKeyOverride);
  }, [tenantId, applyData]);

  const handlePeriodSelect = useCallback((newKey: string) => {
    if (newKey === activeKey) return;
    setActiveKey(newKey);
    reloadData(newKey);
  }, [activeKey, reloadData]);

  const runCalculation = useCallback(async () => {
    if (!tenantId || !activePeriodId || !ruleSetId) return;
    setCalcError(null);
    setIsCalculating(true);
    try {
      const res = await fetch('/api/calculation/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, periodId: activePeriodId, ruleSetId }),
      });
      const result = await res.json();
      if (!res.ok) { setCalcError(result.error || (isSpanish ? 'Error al ejecutar calculo' : 'Calculation failed')); return; }
      await reloadData(activeKey);
    } catch {
      setCalcError(isSpanish ? 'Error de red al ejecutar calculo' : 'Network error running calculation');
    } finally { setIsCalculating(false); }
  }, [tenantId, activePeriodId, ruleSetId, activeKey, isSpanish, reloadData]);

  const advance = useCallback(async (nextState: string) => {
    if (!tenantId || !activePeriodId) return;
    const result = await transitionLifecycle(tenantId, activePeriodId, nextState as never);
    if (result.success) {
      setLifecycleState(nextState);
      setPeriods(prev => prev.map(p => p.periodId === activePeriodId ? { ...p, lifecycleState: nextState } : p));
    } else if (result.error) setCalcError(result.error);
  }, [tenantId, activePeriodId]);

  const dashState = lifecycleState && isDashboardState(lifecycleState) ? lifecycleState
    : lifecycleState ? toDashboardState(lifecycleState) : 'DRAFT';
  const stateDisplay = LIFECYCLE_DISPLAY[dashState as keyof typeof LIFECYCLE_DISPLAY];

  // GOLD CTA — the most prominent element. Primary action for the current lifecycle phase.
  function primaryAction(): PrimaryAction | null {
    if (readiness.plan.status === 'missing')
      return { label: isSpanish ? 'Configurar Plan' : 'Configure Plan', onClick: () => router.push('/configure/plans'), disabled: false };
    if (readiness.data.status === 'missing')
      return { label: isSpanish ? 'Importar Datos' : 'Import Data', onClick: () => router.push('/operate/import'), disabled: false };
    if (!calcSummary || dashState === 'DRAFT')
      return { label: isSpanish ? 'Ejecutar Calculo' : 'Run Calculation', onClick: runCalculation, disabled: !ruleSetId || isCalculating, busy: isCalculating };
    if (dashState === 'PREVIEW' || dashState === 'RECONCILE')
      return { label: isSpanish ? 'Iniciar Reconciliacion' : 'Start Reconciliation', onClick: () => router.push(`/operate/reconciliation${lastBatchId ? `?batchId=${lastBatchId}` : ''}`), disabled: false };
    const next = getNextAction(dashState as DashboardLifecycleState);
    if (next) return { label: next.label, onClick: () => advance(next.nextState), disabled: false };
    return null;
  }
  const cta = primaryAction();
  const avgPayout = calcSummary && calcSummary.entityCount > 0 ? calcSummary.totalPayout / calcSummary.entityCount : 0;

  if (!tenantId) {
    return <div className="page"><div className="empty"><b>{isSpanish ? 'Selecciona un tenant' : 'Select a tenant'}</b></div></div>;
  }
  if (isLoading) {
    return <div className="page"><p className="mut" style={{ padding: 40, textAlign: 'center', color: 'var(--vl-text-soft)' }}>{isSpanish ? 'Cargando...' : 'Loading...'}</p></div>;
  }
  if (periods.length === 0) {
    return (
      <div className="page">
        <div className="empty">
          <div className="ic">📋</div>
          <b>{isSpanish ? 'No hay periodos configurados' : 'No periods configured'}</b>
          <p>{isSpanish ? 'Crea tu primer periodo para gestionar el ciclo de operaciones.' : 'Create your first period to manage the operations lifecycle.'}</p>
          <button className="btn-pri" onClick={() => router.push('/configure/periods')}>{isSpanish ? 'Configurar Periodos' : 'Configure Periods'}</button>
        </div>
      </div>
    );
  }

  const activePeriodLabel = periods.find(p => p.periodKey === activeKey)?.label ?? activeKey;

  return (
    <div className="space-y-0">
      <PeriodRibbon periods={periods} activeKey={activeKey} onSelect={handlePeriodSelect} isSpanish={isSpanish} />

      <div className="page space-y-6">
        {/* Header */}
        <div className="phead">
          <div>
            <h1>{isSpanish ? 'Centro de Ciclo de Vida' : 'Lifecycle Cockpit'}</h1>
            <div className="sub">{ruleSetName ?? (isSpanish ? 'No hay plan activo' : 'No active plan')} · {activePeriodLabel}</div>
          </div>
          <div className="pactions">
            {stateDisplay && (
              <StatusPill color={dashState === 'APPROVED' || dashState === 'POSTED' ? 'emerald' : dashState === 'PUBLISHED' ? 'indigo' : 'zinc'}>
                {isSpanish ? stateDisplay.labelEs : stateDisplay.label}
              </StatusPill>
            )}
          </div>
        </div>

        {/* GOLD CTA hero — the most prominent element */}
        {cta && (
          <div className="card" style={{ borderLeft: '3px solid var(--vl-cta-signal)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: 0 }}>{isSpanish ? 'Siguiente accion' : 'Next action'}</p>
              <p style={{ fontSize: 15, fontWeight: 'var(--vl-fw-med)' as unknown as number, color: 'var(--vl-text)', margin: '4px 0 0' }}>{cta.label}</p>
            </div>
            <button className="btn-gold" onClick={cta.onClick} disabled={cta.disabled} style={{ minWidth: 180 }}>
              {cta.busy ? (isSpanish ? 'Calculando...' : 'Calculating...') : cta.label}
            </button>
          </div>
        )}
        {calcError && <div className="card" style={{ borderLeft: '3px solid var(--vl-danger)', color: 'var(--vl-danger)', fontSize: 13 }}>{calcError}</div>}

        {/* KPI row (calculated) */}
        {calcSummary && (
          <div className="kpis">
            <div className="kpi" style={{ '--accent': 'var(--vl-kpi-accent)' } as CSSProperties}>
              <div className="kpi-label">{isSpanish ? 'Pago Total' : 'Total Payout'}</div>
              <div className="kpi-val">{currencySymbol}<AnimatedNumber value={calcSummary.totalPayout} /></div>
            </div>
            <div className="kpi"><div className="kpi-label">{isSpanish ? 'Entidades' : 'Entities'}</div><div className="kpi-val">{calcSummary.entityCount}</div></div>
            <div className="kpi"><div className="kpi-label">{isSpanish ? 'Pago Promedio' : 'Avg Payout'}</div><div className="kpi-val">{formatCurrency(avgPayout)}</div></div>
            <div className="kpi"><div className="kpi-label">{isSpanish ? 'Componentes' : 'Components'}</div><div className="kpi-val">{calcSummary.componentCount}</div></div>
          </div>
        )}

        {/* Lifecycle Stepper — full-width */}
        <div className="card">
          {isCalculating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <div style={{ height: 18, width: 18, border: '2px solid var(--vialuce-indigo)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, color: 'var(--vl-text-muted)' }}>{isSpanish ? 'Ejecutando calculo...' : 'Running calculation...'}</span>
            </div>
          ) : (
            <LifecycleStepper currentState={dashState} onAdvance={advance} onGoBack={advance} canGoBack />
          )}
        </div>

        {/* Two-column: Data Readiness | Calculation Summary */}
        <div className="grid2">
          <div className="card"><DataReadinessPanel readiness={readiness} /></div>
          <div className="card">
            <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10.5, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>{isSpanish ? 'Resumen de Calculo' : 'Calculation Summary'}</p>
            {calcSummary ? (
              <div className="space-y-3">
                {calcSummary.componentBreakdown.length > 0 && (
                  <table className="tbl">
                    <tbody>
                      {calcSummary.componentBreakdown.map(c => (
                        <tr key={c.name}><td className="name">{c.name}</td><td className="num">{formatCurrency(c.payout)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {calcSummary.lastRunAt && <p style={{ fontSize: 11, color: 'var(--vl-text-soft)', marginTop: 8 }}>{isSpanish ? 'Ultimo calculo' : 'Last calculation'}: {new Date(calcSummary.lastRunAt).toLocaleString(isSpanish ? 'es-MX' : 'en-US')}</p>}
                <button className="btn-pri" style={{ width: '100%', marginTop: 8 }} onClick={() => router.push(`/operate/results`)}>{isSpanish ? 'Ver Tabla de Resultados' : 'View Results Table'} →</button>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--vl-text-soft)' }}>{isSpanish ? 'No hay resultados de calculo para este periodo. Usa la accion dorada arriba.' : 'No calculation results for this period. Use the gold action above.'}</p>
            )}
          </div>
        </div>

        {/* Results Preview */}
        {calcSummary && calcSummary.attainmentDist.length > 0 && (
          <div className="grid2">
            <div className="card">
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10.5, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>{isSpanish ? 'Distribucion de Logro' : 'Attainment Distribution'}</p>
              <DistributionChart data={calcSummary.attainmentDist} benchmarkLine={100} />
            </div>
            <div className="card">
              <p style={{ fontFamily: 'var(--vl-font-mono)', fontSize: 10.5, letterSpacing: '.8px', textTransform: 'uppercase', color: 'var(--vl-text-soft)', margin: '0 0 12px' }}>{isSpanish ? 'Top 5 Entidades' : 'Top 5 Entities'}</p>
              <div className="space-y-2">
                {calcSummary.topEntities.map(e => (
                  <BenchmarkBar key={e.name} value={e.value} benchmark={avgPayout} label={e.name}
                    rightLabel={<span style={{ color: 'var(--vl-success)', fontFamily: 'var(--vl-font-mono)' }}>{formatCurrency(e.value)}</span>} color="var(--vl-success)" />
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
    plan: { status: 'missing', label: '...' }, data: { status: 'missing', label: '...' },
    mapping: { status: 'missing', label: '...' }, validation: { status: 'never', label: '...' },
  };
}
function formatLabel(startDate: string, locale: string = 'es-MX'): string {
  try {
    // OB-227 Fix A: 'T00:00:00' forces local-time parse of a date-only string. Without it,
    // new Date("2025-10-01") is UTC midnight → renders the prior month in negative-offset zones.
    const d = new Date(`${startDate}T00:00:00`);
    const month = d.toLocaleString(locale, { month: 'short' });
    return `${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`;
  } catch { return startDate; }
}
