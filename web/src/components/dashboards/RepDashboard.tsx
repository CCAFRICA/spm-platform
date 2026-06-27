'use client';

/**
 * RepDashboard — HF-346 rebuild around the DS-015 §5.3 Earnings Hero (Individual).
 *
 * The individual contributor's /perform surface. Five elements, hero dominant, everything else on
 * interaction (Performance Intelligence Research §4.1). Every element passes the DS-013 §7 test battery
 * (IAP Gate, Five Elements, Thermostat, Action Proximity, Reference Frame, Cognitive Fit).
 *
 *   1. EARNINGS HERO   — Value + Context + Comparison + Reference frame + Action + Impact (dominant)
 *   2. COMPONENT BREAKDOWN — $ per component, click a row → inline transaction drill-through (Action
 *                            Proximity: OB-224 ComponentCards = getEntityStatement, no navigation away)
 *   3. TRAJECTORY      — period-over-period sparkline + projection (MSP entity_period_outcomes)
 *   4. INTELLIGENCE    — ONE section: Focus / Trend / Action (Thermostat — what to DO)
 *   5. WHAT-IF         — inline, on demand (hidden until requested)
 *
 * All reads route through getRepDashboardData (MSP entity_period_outcomes) + ComponentCards
 * (getEntityStatement). Zero raw calculation_results on the render path (OB-237).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Receipt, Sparkles, Target, TrendingUp, Wallet,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { useLocale, isSpanishLocale } from '@/contexts/locale-context';
import { getRepDashboardData, type RepDashboardData } from '@/lib/data/persona-queries';
import { ComponentCards } from '@/components/drill-through';
import { Sparkline } from '@/components/design-system/Sparkline';
import { WhatIfSlider, type TierConfig } from '@/components/design-system/WhatIfSlider';

// Lifecycle state → a single payout-status word for an individual (DS-013 Thermostat — not a pipeline diagram).
function payoutStatus(state: string | null, es: boolean): { label: string; tone: 'review' | 'approved' | 'paid' } {
  const v = (state ?? '').toUpperCase();
  if (v.includes('PAID')) return { label: es ? 'Pagado' : 'Paid', tone: 'paid' };
  if (v.includes('APPROVED') || v.includes('OFFICIAL')) return { label: es ? 'Aprobado' : 'Approved', tone: 'approved' };
  return { label: es ? 'En Revisión' : 'In Review', tone: 'review' };
}

const STATUS_CLASS: Record<string, string> = {
  review: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  approved: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
};

// Tier ladder for the reference frame + what-if (only meaningful when attainment is assigned).
const TIER_LADDER: TierConfig[] = [
  { min: 0, max: 80, rate: 0.5, label: 'Base' },
  { min: 80, max: 120, rate: 1.0, label: 'Standard' },
  { min: 120, max: 250, rate: 1.5, label: 'Premium' },
];

export function RepDashboard() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { entityId } = usePersona();
  const { locale } = useLocale();
  const isEs = isSpanishLocale(locale);
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<RepDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWhatIf, setShowWhatIf] = useState(false);
  const componentsRef = useRef<HTMLDivElement>(null);
  const whatIfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getRepDashboardData(tenantId, entityId)
      .then(r => { if (!cancelled) { setData(r); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, entityId]);

  // ── derived (before early returns — hooks rule) ──
  const derived = useMemo(() => {
    if (!data) return null;
    const hist = data.history;
    const prior = hist.length >= 2 ? hist[hist.length - 2].payout : null;
    const deltaPct = prior && prior > 0 ? ((data.totalPayout - prior) / prior) * 100 : null;
    // projection: average period-over-period step over the trajectory
    let step = 0;
    if (hist.length >= 2) {
      const deltas = hist.slice(1).map((h, i) => h.payout - hist[i].payout);
      step = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    }
    const projection = hist.length >= 2 ? data.totalPayout + step : null;
    // focus = the smallest non-zero component (most growth headroom) — honest without per-component targets
    const ranked = [...data.components].filter(c => c.value > 0).sort((a, b) => a.value - b.value);
    const focus = ranked[0] ?? null;
    const top = [...data.components].sort((a, b) => b.value - a.value)[0] ?? null;
    // relative position as anonymized percentile (OB-246 — never "#1 of 85")
    const pct = data.totalEntities > 0 && data.rank > 0
      ? Math.round(((data.totalEntities - data.rank + 1) / data.totalEntities) * 100)
      : null;
    const hasTarget = data.attainment > 0;
    const tier = !hasTarget ? null : data.attainment >= 120 ? 'Premium' : data.attainment >= 80 ? 'Standard' : 'Base';
    return { prior, deltaPct, step, projection, focus, top, pct, hasTarget, tier };
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>;
  }
  if (!data || data.totalPayout === 0 || !derived) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-sm text-muted-foreground">{isEs ? 'No hay resultados para este periodo.' : 'No results for this period.'}</p>
        <p className="text-xs text-muted-foreground/70">{isEs ? 'Tus resultados aparecerán aquí cuando se ejecute el cálculo.' : 'Your earnings will appear here once the calculation runs.'}</p>
      </div>
    );
  }

  const status = payoutStatus(data.lifecycleState, isEs);
  const periodLabel = data.periodLabel || (isEs ? 'Periodo actual' : 'Current period');
  const scrollTo = (r: React.RefObject<HTMLElement>) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // scaled what-if tiers (only when a target exists)
  let whatIfTiers: TierConfig[] = TIER_LADDER;
  if (derived.hasTarget) {
    let rawPay = 0;
    for (const t of TIER_LADDER) { const a = Math.min(data.attainment, t.max) - t.min; if (a > 0) rawPay += a * t.rate; }
    const sf = rawPay > 0 ? data.totalPayout / rawPay : 1;
    whatIfTiers = TIER_LADDER.map(t => ({ ...t, rate: t.rate * sf }));
  }

  const Delta = ({ pct }: { pct: number | null }) => {
    if (pct == null) return <span className="text-muted-foreground">{isEs ? 'primer periodo' : 'first period'}</span>;
    const up = pct > 0, flat = Math.abs(pct) < 0.05;
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={`inline-flex items-center gap-0.5 font-medium ${flat ? 'text-muted-foreground' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        <Icon className="h-3.5 w-3.5" />{up ? '+' : ''}{pct.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── 1. EARNINGS HERO (dominant) ── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-4 w-4" /> {isEs ? 'Mi Compensación' : 'My Earnings'}
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLASS[status.tone]}`}>{status.label}</span>
        </div>
        {/* Value */}
        <div className="mt-1 text-5xl font-bold tabular-nums text-foreground">{format(data.totalPayout)}</div>
        {/* Context + Comparison */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{periodLabel}</span>
          <span aria-hidden>·</span>
          <Delta pct={derived.deltaPct} />
          {derived.prior != null && <span className="text-muted-foreground/70">{isEs ? 'vs periodo previo' : 'vs prior period'}</span>}
          <span aria-hidden>·</span>
          <span>{data.components.length} {isEs ? 'componentes' : 'components'}</span>
        </div>
        {/* Reference frame: attainment tier, or honest "target not assigned" */}
        <div className="mt-4">
          {derived.hasTarget ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{Math.round(data.attainment)}% {isEs ? 'cumplimiento' : 'attainment'} · {derived.tier}</span>
                <span className="text-muted-foreground">{isEs ? 'tope' : 'cap'} 120%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (data.attainment / 120) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{isEs ? 'Meta no asignada para esta entidad — se muestra el pago realizado.' : 'No target assigned for this entity — showing earned payout.'}</p>
          )}
        </div>
        {/* Impact: focus component */}
        {derived.focus && (
          <p className="mt-3 text-sm text-foreground">
            <Target className="mr-1 inline h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {isEs ? 'Mayor oportunidad de crecimiento: ' : 'Biggest growth opportunity: '}
            <span className="font-semibold">{derived.focus.name}</span> ({format(derived.focus.value)})
          </p>
        )}
        {/* Action */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => scrollTo(componentsRef)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            {isEs ? 'Ver Componentes' : 'View Components'} <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setShowWhatIf(true); setTimeout(() => scrollTo(whatIfRef), 50); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            {isEs ? 'Simular Escenario' : 'Simulate What-If'} <TrendingUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── 2. COMPONENT BREAKDOWN + inline transaction drill-through (OB-224 ComponentCards) ── */}
      <div ref={componentsRef} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="h-4 w-4 text-muted-foreground" /> {isEs ? 'Desglose por Componente' : 'Component Breakdown'}
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{isEs ? 'Haz clic en un componente para ver las transacciones que lo generaron.' : 'Click a component to see the transactions that produced it.'}</p>
        {data.entityId && data.periodId ? (
          <ComponentCards
            tenantId={tenantId}
            entityId={data.entityId}
            periodId={data.periodId}
            entityName={undefined}
            periodLabel={data.periodLabel}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{isEs ? 'Sin datos de componentes.' : 'No component data.'}</p>
        )}
      </div>

      {/* ── 3. TRAJECTORY ── */}
      {data.history.length >= 2 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-muted-foreground" /> {isEs ? 'Trayectoria' : 'Trajectory'}
          </div>
          <Sparkline data={data.history.map(h => h.payout)} width={240} height={48} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{data.history.map(h => format(h.payout)).join(' → ')}</span>
            <span className="font-medium text-foreground">
              {derived.step >= 0 ? '↗' : '↘'} {derived.step >= 0 ? '+' : ''}{format(Math.round(derived.step))}/{isEs ? 'periodo' : 'period'}
              {derived.projection != null && <> · {isEs ? 'próx.' : 'proj.'} {format(Math.round(derived.projection))}</>}
            </span>
          </div>
        </div>
      )}

      {/* ── 4. INTELLIGENCE — ONE section: Focus / Trend / Action ── */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-muted-foreground" /> {isEs ? 'Inteligencia' : 'Intelligence'}
        </div>
        {derived.focus && (
          <div className="flex gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{isEs ? 'Enfoque: ' : 'Focus: '}{derived.focus.name}</span>{' '}
              {isEs ? `tu componente con más margen de crecimiento (${format(derived.focus.value)} este periodo).` : `your component with the most growth headroom (${format(derived.focus.value)} this period).`}
            </p>
          </div>
        )}
        <div className="flex gap-3">
          {derived.deltaPct == null ? <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : derived.deltaPct >= 0 ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />}
          <p className="text-sm text-foreground">
            <span className="font-semibold">{isEs ? 'Tendencia: ' : 'Trend: '}</span>
            {derived.deltaPct == null
              ? (isEs ? 'primer periodo calculado — sin comparación aún.' : 'first calculated period — no comparison yet.')
              : (isEs ? `${derived.deltaPct >= 0 ? '+' : ''}${derived.deltaPct.toFixed(1)}% frente al periodo previo.` : `${derived.deltaPct >= 0 ? '+' : ''}${derived.deltaPct.toFixed(1)}% vs the prior period.`)}
            {derived.pct != null && <> {isEs ? `Posición: percentil ${derived.pct}.` : `Position: ${derived.pct}th percentile.`}</>}
          </p>
        </div>
        {derived.focus && (
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{isEs ? 'Acción: ' : 'Action: '}</span>
              {isEs ? `revisa tus transacciones de ${derived.focus.name}.` : `review your ${derived.focus.name} transactions.`}{' '}
              <a href={`/data/transactions`} className="font-medium text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400">{isEs ? 'Ir a Transacciones →' : 'Go to Transactions →'}</a>
            </p>
          </div>
        )}
      </div>

      {/* ── 5. WHAT-IF (inline, on demand) ── */}
      {showWhatIf && (
        <div ref={whatIfRef} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-muted-foreground" /> {isEs ? '¿Qué pasaría si…?' : 'What-If'}
          </div>
          {derived.hasTarget ? (
            <WhatIfSlider currentValue={data.attainment} currentPayout={data.totalPayout} tiers={whatIfTiers} formatCurrency={format} />
          ) : (
            <p className="text-sm text-muted-foreground">{isEs ? 'La simulación requiere una meta asignada para esta entidad.' : 'Simulation requires a target assignment for this entity.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
