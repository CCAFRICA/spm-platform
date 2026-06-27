'use client';

/**
 * RepDashboard — HF-346 rebuild around the DS-015 §5.3 Earnings Hero (Individual).
 *
 * The individual contributor's /perform surface. Four elements, hero dominant, drill-through on
 * interaction (Performance Intelligence Research §4.1). Every element passes the DS-013 §7 test battery
 * (IAP Gate, Five Elements, Thermostat, Action Proximity, Reference Frame, Cognitive Fit) on REAL data —
 * no fabricated reference frames.
 *
 *   1. EARNINGS HERO   — Value + Context + Comparison + Reference frame + Action + Impact (dominant)
 *   2. COMPONENT BREAKDOWN — $ per component, click a row → inline transaction drill-through (Action
 *                            Proximity: OB-224 ComponentCards = getEntityStatement, no navigation away)
 *   3. TRAJECTORY      — period-over-period sparkline + projection (MSP entity_period_outcomes)
 *   4. INTELLIGENCE    — ONE section: Focus / Trend / Action (Thermostat — what to DO)
 *
 * A what-if simulator is intentionally NOT shipped: an honest simulation needs the rep's real plan tier
 * structure, which is not on the MSP serving path (only the realized attainment + payout are). A fabricated
 * tier ladder fails the DS-013 Reference-Frame test (EECI: an element passes on real data or is removed) —
 * see HF-346 completion report Residual. The reference frame here uses ONLY the real attainment toward 100%.
 *
 * All reads route through getRepDashboardData (MSP entity_period_outcomes) + ComponentCards
 * (getEntityStatement). Zero raw calculation_results on the aggregate render path (OB-237).
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

export function RepDashboard() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { entityId } = usePersona();
  const { locale } = useLocale();
  const isEs = isSpanishLocale(locale);
  const tenantId = currentTenant?.id ?? '';

  const [data, setData] = useState<RepDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const componentsRef = useRef<HTMLDivElement>(null);

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
    // prior = the period immediately BEFORE the current one. Match the current period by label (history is
    // chronologically sorted by start_date in getRepDashboardData); fall back to the penultimate entry. This
    // keeps the hero delta and the trajectory consistent even if the current period is not the last entry.
    const curIdx = data.periodLabel ? hist.findIndex(h => h.period === data.periodLabel) : -1;
    const priorIdx = curIdx > 0 ? curIdx - 1 : hist.length >= 2 ? hist.length - 2 : -1;
    const prior = priorIdx >= 0 ? hist[priorIdx].payout : null;
    const deltaPct = prior && prior > 0 ? ((data.totalPayout - prior) / prior) * 100 : null;
    // projection: average period-over-period step over the trajectory
    let step = 0;
    if (hist.length >= 2) {
      const deltas = hist.slice(1).map((h, i) => h.payout - hist[i].payout);
      step = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    }
    const projection = hist.length >= 2 ? data.totalPayout + step : null;
    // concentration: the largest component + its share of total — a TRUE, orienting fact (no fabricated
    // per-component targets; "smallest = growth headroom" was a speculative heuristic and was removed).
    const ranked = [...data.components].filter(c => c.value > 0).sort((a, b) => b.value - a.value);
    const top = ranked[0] ?? null;
    const topShare = top && data.totalPayout > 0 ? Math.round((top.value / data.totalPayout) * 100) : null;
    // relative position as anonymized percentile (OB-246 — never "#1 of 85")
    const pct = data.totalEntities > 0 && data.rank > 0
      ? Math.round(((data.totalEntities - data.rank + 1) / data.totalEntities) * 100)
      : null;
    const hasTarget = data.attainment > 0;
    return { prior, deltaPct, step, projection, top, topShare, pct, hasTarget };
  }, [data]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>;
  }
  // Empty state = NO calculated outcome for this entity/period (periodId null). A real $0 net payout
  // (e.g. fully clawed back) IS a result and must render — gate on the absence of an outcome, not on $0.
  if (!data || data.periodId == null || !derived) {
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
        {/* Reference frame: REAL attainment toward the 100% target, or an honest "target not assigned". */}
        <div className="mt-4">
          {derived.hasTarget ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{Math.round(data.attainment)}% {isEs ? 'de cumplimiento de meta' : 'of target attainment'}</span>
                <span className="text-muted-foreground">{isEs ? 'meta 100%' : 'target 100%'}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${data.attainment >= 100 ? 'bg-emerald-500' : 'bg-emerald-500/70'}`} style={{ width: `${Math.min(100, data.attainment)}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{isEs ? 'Meta no asignada para esta entidad — se muestra el pago realizado.' : 'No target assigned for this entity — showing earned payout.'}</p>
          )}
        </div>
        {/* Impact: the largest component + its share (a true, orienting fact) */}
        {derived.top && (
          <p className="mt-3 text-sm text-foreground">
            <Target className="mr-1 inline h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {isEs ? 'Mayor componente: ' : 'Largest component: '}
            <span className="font-semibold">{derived.top.name}</span> ({format(derived.top.value)}{derived.topShare != null && <>{' · '}{derived.topShare}% {isEs ? 'de tu pago' : 'of your payout'}</>})
          </p>
        )}
        {/* Action */}
        <div className="mt-4">
          <button onClick={() => scrollTo(componentsRef)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            {isEs ? 'Ver Componentes' : 'View Components'} <ChevronDown className="h-3.5 w-3.5" />
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

      {/* ── 3. TRAJECTORY (context: where the rep is trending) ── */}
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
        {derived.top && (
          <div className="flex gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{isEs ? 'Enfoque: ' : 'Focus: '}{derived.top.name}</span>{' '}
              {isEs
                ? `es tu mayor componente${derived.topShare != null ? ` (${derived.topShare}% de tu pago)` : ''} — ${format(derived.top.value)} este periodo.`
                : `is your largest component${derived.topShare != null ? ` (${derived.topShare}% of your payout)` : ''} — ${format(derived.top.value)} this period.`}
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
        {derived.top && (
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-foreground">
              <span className="font-semibold">{isEs ? 'Acción: ' : 'Action: '}</span>
              {isEs ? `abre ${derived.top.name} para ver las transacciones que lo generaron.` : `open ${derived.top.name} to see the transactions behind it.`}{' '}
              {/* Action Proximity (DS-013 §4.3): scroll to the inline Component Breakdown drill-through —
                  NOT a navigation to /data/transactions (which a member/rep cannot access — OB-246 view.team_results). */}
              <button onClick={() => componentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="font-medium text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400">{isEs ? 'Ver Componentes ↓' : 'View Components ↓'}</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
