'use client';

/**
 * OB-234 T2 — Intelligence · Attainment (/insights/performance). Mirrors the reference surface
 * (/insights). End-State A: the ICM branch reads ONLY getCalculatedPeriods / getEntityResults /
 * getEntityTrajectory (calculation_results / entity_period_outcomes) — zero committed_data, zero raw
 * createClient calc query.
 *
 * Architect intent (Cognitive Fit Test = authority): attainment / target data does NOT exist for BCL,
 * and EntityResult carries NO attainment field → the Attainment summary is an HONEST EMPTY card
 * ("Targets not configured." + a REAL Configure link). The surface then pivots to what IS real:
 * payout STANDINGS vs the population reference.
 *
 * DS-003 composition (ICM branch): HorizontalBar (ranked standings) + DistributionPosition (population
 * ranking) + PrioritySortedList (hot/cold triage, splitView) + Sparkline (embedded pacing trend) =
 * 4 distinct component types (Diversity Minimum). Plus IntelligenceElement (DS-015, G2 provable) as the
 * dominant element. Every viz carries a reference frame. Persona density filters which elements render.
 *
 * PRESERVED: the Hospitality branch (currentTenant.industry === 'Hospitality' → executive restaurant
 * view) is kept intact; the DS-003 redesign is the NON-hospitality (ICM) branch only.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Trophy,
  Target,
  TrendingUp,
  Users,
  Building2,
  MapPin,
  CreditCard,
  Banknote,
  Utensils,
  Wine,
  AlertTriangle,
  BarChart3,
  Award,
} from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { getCheques, getFranquicias, getFinancialSummary, getSalesByFranquicia } from '@/lib/restaurant-service';
import { useAuth } from '@/contexts/auth-context'; // OB-246: scope-narrowed reads (ICM branch)
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import {
  getCalculatedPeriods,
  getEntityTrajectory,
  type PeriodSummary,
  type EntityTrajectory,
} from '@/lib/insights';
import { PeriodCards } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HorizontalBar,
  DistributionPosition,
  PrioritySortedList,
  Sparkline,
  IntelligenceElement,
  Panel,
  TEXT,
  SEMANTIC,
  type PriorityItem,
} from '@/components/insights/ds003';
import { Leaderboard } from '@/components/charts/leaderboard';
import type { Cheque, Franquicia } from '@/types/cheques';

interface ExecutiveData {
  totalRevenue: number;
  totalChecks: number;
  avgTicket: number;
  totalTips: number;
  totalTax: number;
  foodRevenue: number;
  beverageRevenue: number;
  foodPct: number;
  beveragePct: number;
  cashTotal: number;
  cardTotal: number;
  cashPct: number;
  cardPct: number;
  cancelledCount: number;
  regionStats: Array<{ region: string; sales: number; checkCount: number; color: string }>;
  topFranchises: Array<{ id: string; rank: number; name: string; value: number; subtitle?: string; change?: number }>;
  bottomFranchises: Array<{ id: string; rank: number; name: string; value: number; subtitle?: string; change?: number }>;
}

// Compact supporting stat tile (mirrors the reference Stat helper — carries data, not a DS-003 type).
function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof Users }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${TEXT.body}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TEXT.headline}`}>{value}</div>
      <div className={`text-xs ${TEXT.muted}`}>{hint}</div>
    </div>
  );
}

export default function InsightsPerformancePage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { effectiveScope: scope } = useAuth(); // OB-246: member→own, manager→team, admin→all (ICM branch only)
  const theme = usePersonaTheme();

  const isHospitality = currentTenant?.industry === 'Hospitality';
  const tenantId = currentTenant?.id ?? '';

  // ── Hospitality branch state (PRESERVED) ──
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── ICM / End-State A branch state ──
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [trajectories, setTrajectories] = useState<EntityTrajectory[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [icmLoading, setIcmLoading] = useState(true);

  useEffect(() => {
    if (isHospitality) {
      loadHospitalityData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality]);

  // ICM: calculated periods (canonical getCalculatedPeriods, start_date DESC).
  useEffect(() => {
    if (isHospitality || !tenantId) {
      setPeriodsLoaded(true);
      setIcmLoading(false);
      return;
    }
    let cancelled = false;
    getCalculatedPeriods(tenantId, scope)
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setPeriodsLoaded(true);
        if (ps.length === 0) setIcmLoading(false);
      })
      .catch((err) => { console.warn('[Attainment] periods load failed:', err); setPeriodsLoaded(true); setIcmLoading(false); });
    return () => { cancelled = true; };
  }, [isHospitality, tenantId, scope]);

  // ICM: selected-period entity outcomes + cross-period trajectory (for pacing sparklines).
  useEffect(() => {
    if (isHospitality || !tenantId || !selectedPeriodId) return;
    let cancelled = false;
    setIcmLoading(true);
    Promise.all([
      getEntityResults(tenantId, scope, { periodId: selectedPeriodId }),
      getEntityTrajectory(tenantId, undefined, scope),
    ])
      .then(([rs, tr]) => { if (cancelled) return; setRows(rs); setTrajectories(tr); setIcmLoading(false); })
      .catch((err) => { console.warn('[Attainment] period data load failed:', err); if (!cancelled) setIcmLoading(false); });
    return () => { cancelled = true; };
  }, [isHospitality, tenantId, selectedPeriodId, scope]);

  const selectedIdx = useMemo(() => periods.findIndex((p) => p.period_id === selectedPeriodId), [periods, selectedPeriodId]);

  const insights = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPayout = rows.reduce((s, r) => s + (r.totalPayout || 0), 0);
    const avgPayout = totalPayout / rows.length;
    const sorted = [...rows].sort((a, b) => (b.totalPayout || 0) - (a.totalPayout || 0));
    const prior = selectedIdx >= 0 ? periods[selectedIdx + 1] : undefined;
    const priorTotal = prior?.total_payout ?? null;
    const delta = priorTotal != null && priorTotal > 0 ? (totalPayout - priorTotal) / priorTotal : null;
    return {
      totalPayout,
      avgPayout,
      entityCount: rows.length,
      top: sorted[0] ?? null,
      sorted,
      values: rows.map((r) => r.totalPayout || 0),
      delta,
      priorLabel: prior?.label ?? null,
    };
  }, [rows, periods, selectedIdx]);

  // Hot / Cold: per-entity latest-vs-prior delta from the cross-period trajectory (≥2 periods).
  const hotCold = useMemo<PriorityItem[]>(() => {
    if (trajectories.length === 0) return [];
    const withDelta = trajectories.filter((t) => t.delta != null && t.periods.length >= 2);
    if (withDelta.length === 0) return [];
    const gaining = [...withDelta].filter((t) => (t.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 5);
    const declining = [...withDelta].filter((t) => (t.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5);
    const fmtDelta = (d: number) => `${d >= 0 ? '+' : ''}${format(d)}`;
    const items: PriorityItem[] = [];
    for (const t of gaining) {
      items.push({
        id: `gain-${t.entity_id}`,
        severity: 'opportunity',
        label: t.display_name,
        detail: 'vs prior period',
        value: fmtDelta(t.delta ?? 0),
        action: { label: 'View', href: `/investigate/trace/${t.entity_id}` },
      });
    }
    for (const t of declining) {
      items.push({
        id: `decl-${t.entity_id}`,
        severity: 'warning',
        label: t.display_name,
        detail: 'vs prior period',
        value: fmtDelta(t.delta ?? 0),
        action: { label: 'View', href: `/investigate/trace/${t.entity_id}` },
      });
    }
    return items;
  }, [trajectories, format]);

  // Pacing: top-N entities (by latest payout) each with their period series for an inline Sparkline.
  const pacing = useMemo(() => {
    if (trajectories.length === 0) return [];
    return [...trajectories]
      .filter((t) => t.periods.length >= 2)
      .sort((a, b) => (b.periods[b.periods.length - 1]?.total_payout ?? 0) - (a.periods[a.periods.length - 1]?.total_payout ?? 0))
      .slice(0, 8)
      .map((t) => ({
        id: t.entity_id,
        name: t.display_name,
        series: t.periods.map((p) => p.total_payout),
        latest: t.periods[t.periods.length - 1]?.total_payout ?? 0,
        delta: t.delta,
        direction: t.direction,
      }));
  }, [trajectories]);

  // ── Hospitality data loader (PRESERVED — unchanged from prior wiring) ──
  async function loadHospitalityData() {
    setIsLoading(true);
    try {
      const [cheques, franquicias, summary, salesByFranquicia] = await Promise.all([
        getCheques(),
        getFranquicias(),
        getFinancialSummary(),
        getSalesByFranquicia(),
      ]);

      const validCheques = cheques.filter((c: Cheque) => c.pagado === 1 && c.cancelado === 0);
      const cashTotal = validCheques.reduce((sum: number, c: Cheque) => sum + c.efectivo, 0);
      const cardTotal = validCheques.reduce((sum: number, c: Cheque) => sum + c.tarjeta, 0);
      const totalPayments = cashTotal + cardTotal;
      const cashPct = totalPayments > 0 ? (cashTotal / totalPayments) * 100 : 0;
      const cardPct = totalPayments > 0 ? (cardTotal / totalPayments) * 100 : 0;

      const regionColors: Record<string, string> = {
        West: '#6366f1',
        North: '#8b5cf6',
        Central: '#a855f7',
        South: '#d946ef',
        East: '#ec4899',
      };

      const regionMap = new Map<string, { sales: number; checkCount: number }>();
      franquicias.forEach((f: Franquicia) => {
        if (!regionMap.has(f.region)) {
          regionMap.set(f.region, { sales: 0, checkCount: 0 });
        }
      });

      salesByFranquicia.forEach((f) => {
        const region = f.franquicia.region;
        const current = regionMap.get(region) || { sales: 0, checkCount: 0 };
        regionMap.set(region, {
          sales: current.sales + f.totalSales,
          checkCount: current.checkCount + f.checkCount,
        });
      });

      const regionStats = Array.from(regionMap.entries())
        .map(([region, d]) => ({
          region,
          sales: d.sales,
          checkCount: d.checkCount,
          color: regionColors[region] || '#94a3b8',
        }))
        .sort((a, b) => b.sales - a.sales);

      const franchiseRankings = salesByFranquicia.map((f, i) => ({
        id: f.franquicia.numero_franquicia,
        rank: i + 1,
        name: f.franquicia.nombre,
        value: f.totalSales,
        subtitle: f.franquicia.ciudad,
        change: f.vsTarget,
      }));

      const topFranchises = franchiseRankings.slice(0, 5);
      const bottomFranchises = franchiseRankings.slice(-5).reverse().map((f, i) => ({
        ...f,
        rank: franchiseRankings.length - 4 + i,
      }));

      setData({
        totalRevenue: summary.totalRevenue,
        totalChecks: summary.totalTransactions,
        avgTicket: summary.avgTicket,
        totalTips: summary.totalTips,
        totalTax: summary.totalTax,
        foodRevenue: summary.foodRevenue,
        beverageRevenue: summary.beverageRevenue,
        foodPct: summary.foodPct,
        beveragePct: summary.beveragePct,
        cashTotal,
        cardTotal,
        cashPct,
        cardPct,
        cancelledCount: summary.cancelledCount,
        regionStats,
        topFranchises,
        bottomFranchises,
      });
    } catch (error) {
      console.error('Error loading executive data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ICM / End-State A branch — DS-003 redesign (Attainment vs population standings)
  // ──────────────────────────────────────────────────────────────────────────
  if (!isHospitality) {
    // Loading shell.
    if (icmLoading && !periodsLoaded) {
      return (
        <PersonaAmbient>
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
              <p className={TEXT.body}>Loading attainment…</p>
            </div>
          </div>
        </PersonaAmbient>
      );
    }

    // No calculated periods → honest onboarding.
    if (periodsLoaded && periods.length === 0) {
      return (
        <PersonaAmbient>
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <BarChart3 className="mx-auto mb-4 h-12 w-12" style={{ color: theme.accent }} />
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No attainment data yet</h1>
            <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
              Standings, pacing, and population position appear once a compensation run completes.
            </p>
            <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
              <Target className="h-4 w-4" /> Go to Compensation
            </Link>
          </div>
        </PersonaAmbient>
      );
    }

    const selectedLabel = periods[selectedIdx]?.label ?? '';

    return (
      <PersonaAmbient>
        <div className="space-y-6">
          <header>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Attainment</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>
              Standings vs the population reference{insights ? ` · ${insights.entityCount} entities · ${selectedLabel}` : ''}
            </p>
          </header>

          {periods.length > 0 && (
            <PeriodCards
              periods={periods}
              selectedPeriodId={selectedPeriodId}
              onPeriodChange={setSelectedPeriodId}
              accentColor={theme.accent}
              accentSoft={theme.accentSoft}
            />
          )}

          {icmLoading || !insights ? (
            <Panel><div className={`py-16 text-center text-sm ${TEXT.muted}`}>{icmLoading ? 'Loading period…' : 'No outcomes for this period.'}</div></Panel>
          ) : (
            <>
              {/* Dominant: HONEST-EMPTY attainment (IntelligenceElement / DS-015, G2 provable).
                  Attainment/target data does NOT exist (EntityResult has no attainment field) →
                  honest empty with a REAL Configure link; the surface pivots to payout standings. */}
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="lg:col-span-2">
                  <IntelligenceElement
                    value="Not configured"
                    label="Attainment vs Target"
                    icon={Target}
                    comparison="No targets set for this tenant"
                    comparisonTone="neutral"
                    context="Per-entity attainment % requires configured plan targets. None exist yet, so this surface ranks payout standings against the population reference instead of fabricating an attainment number."
                    impact="Set targets to unlock attainment %, target bands, and pacing-to-goal."
                    action={{ label: 'Configure targets', href: '/configure/plans' }}
                  />
                </div>
                <Stat label="Entities Paid" value={String(insights.entityCount)} hint="with outcomes this period" icon={Users} />
                <Stat label="Average Payout" value={format(insights.avgPayout)} hint="population reference" icon={Target} />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Stat label="Top Standing" value={insights.top ? format(insights.top.totalPayout || 0) : '—'} hint={insights.top?.displayName ?? '—'} icon={Award} />
                <Stat label="Period Total" value={format(insights.totalPayout)} hint={insights.delta == null ? 'no prior period' : `${insights.delta >= 0 ? '+' : ''}${(insights.delta * 100).toFixed(1)}% vs ${insights.priorLabel}`} icon={Trophy} />
                <Stat label="Population Spread" value={`${format(Math.min(...insights.values))} – ${format(Math.max(...insights.values))}`} hint="min – max payout" icon={BarChart3} />
              </div>

              {/* Standings + population shape */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Element 1 — ranked standings vs population average (HorizontalBar). */}
                <Panel title="Entity Standings" description="Ranked by total payout, vs the population average">
                  <HorizontalBar
                    items={insights.sorted.map((e) => ({ label: e.displayName || e.externalId, value: e.totalPayout || 0 }))}
                    referenceLine={{ value: insights.avgPayout, label: 'Population avg' }}
                    format={format}
                    maxRows={10}
                  />
                </Panel>

                {/* Element 2 — population ranking with quartiles + mean (DistributionPosition). */}
                <Panel title="Population Distribution" description="Where each entity stands — quartiles + mean reference">
                  <DistributionPosition data={insights.values} markers={{ quartiles: true, mean: true }} format={format} />
                </Panel>
              </div>

              {/* Element 3 — Hot / Cold triage (PrioritySortedList splitView). Admin+Manager depth. */}
              <DensityGate min="medium">
                <Panel title="Hot / Cold Entities" description="Largest movers vs the prior period">
                  <PrioritySortedList
                    items={hotCold}
                    splitView
                    emptyLabel={trajectories.length < 2 ? 'Movement needs at least two calculated periods.' : 'No notable movement this period.'}
                  />
                </Panel>
              </DensityGate>

              {/* Element 4 — Pacing sparklines (Sparkline per entity). Admin-only density. */}
              <DensityGate min="high">
                <Panel title="Pacing" description="Period-over-period trajectory for the top entities">
                  {pacing.length === 0 ? (
                    <div className={`py-8 text-center text-sm ${TEXT.muted}`}>
                      Pacing needs at least two calculated periods.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {pacing.map((p) => {
                        const tone = p.direction === 'up' ? SEMANTIC.green : p.direction === 'down' ? SEMANTIC.red : 'var(--vl-text-soft, #8A90A6)';
                        const arrow = p.direction === 'up' ? '▲' : p.direction === 'down' ? '▼' : '▪';
                        return (
                          <Link
                            key={p.id}
                            href={`/investigate/trace/${p.id}`}
                            className="flex items-center gap-4 py-2.5 transition-colors hover:bg-muted"
                          >
                            <div className="min-w-0 flex-1">
                              <div className={`truncate text-sm font-medium ${TEXT.headline}`}>{p.name}</div>
                              <div className={`text-xs ${TEXT.muted}`}>{format(p.latest)} latest</div>
                            </div>
                            <Sparkline data={p.series} color={tone} />
                            <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: tone }}>
                              {arrow} {p.delta == null ? '—' : `${p.delta >= 0 ? '+' : ''}${format(p.delta)}`}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              </DensityGate>
            </>
          )}
        </div>
      </PersonaAmbient>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hospitality / RestaurantMX Executive View (PRESERVED — unchanged)
  // ──────────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando datos ejecutivos...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No hay datos disponibles</p>
      </div>
    );
  }

  const productData = [
    { name: 'Alimentos', value: data.foodRevenue, color: '#3B82F6' },
    { name: 'Bebidas', value: data.beverageRevenue, color: '#10B981' },
  ];

  const paymentData = [
    { name: 'Efectivo', value: data.cashTotal, color: '#F59E0B' },
    { name: 'Tarjeta', value: data.cardTotal, color: '#8B5CF6' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Executive View - National
        </h1>
        <p className="text-muted-foreground">
          Performance summary across all franchises
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{format(data.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.totalChecks} cheques</p>
              </div>
              <TrendingUp className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Ticket</p>
                <p className="text-2xl font-bold">{format(data.avgTicket)}</p>
              </div>
              <Target className="h-10 w-10 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tips</p>
                <p className="text-2xl font-bold text-green-600">{format(data.totalTips)}</p>
              </div>
              <Trophy className="h-10 w-10 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxes</p>
                <p className="text-2xl font-bold">{format(data.totalTax)}</p>
              </div>
              <Users className="h-10 w-10 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regional Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Performance by Region
          </CardTitle>
          <CardDescription>Total sales by geographic region</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.regionStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => format(value)}
              />
              <YAxis type="category" dataKey="region" tickLine={false} axisLine={false} width={80} />
              <Tooltip
                formatter={(value: number) => [format(value), 'Sales']}
                contentStyle={{ backgroundColor: 'oklch(var(--background))', border: '1px solid oklch(var(--border))', borderRadius: '8px' }}
              />
              <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                {data.regionStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top and Bottom Franchises */}
      <div className="grid md:grid-cols-2 gap-6">
        <Leaderboard
          items={data.topFranchises}
          title="Top 5 Franchises"
          showChange={true}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Franchises Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.bottomFranchises.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-amber-100 text-amber-700">
                      {f.rank}
                    </span>
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.subtitle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-600">{format(f.value)}</span>
                    {f.change !== undefined && (
                      <p className={`text-xs ${f.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {f.change >= 0 ? '+' : ''}{f.change.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product and Payment Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Product Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Utensils className="h-5 w-5" />
              Product Breakdown
            </CardTitle>
            <CardDescription>Food vs Beverages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={productData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {productData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => format(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-blue-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Utensils className="h-4 w-4" /> Food
                    </p>
                    <p className="text-lg font-bold">{format(data.foodRevenue)}</p>
                    <p className="text-xs text-muted-foreground">{data.foodPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-green-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Wine className="h-4 w-4" /> Beverages
                    </p>
                    <p className="text-lg font-bold">{format(data.beverageRevenue)}</p>
                    <p className="text-xs text-muted-foreground">{data.beveragePct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </CardTitle>
            <CardDescription>Cash vs Card</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => format(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-amber-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Banknote className="h-4 w-4" /> Cash
                    </p>
                    <p className="text-lg font-bold">{format(data.cashTotal)}</p>
                    <p className="text-xs text-muted-foreground">{data.cashPct.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-purple-500" />
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Card
                    </p>
                    <p className="text-lg font-bold">{format(data.cardTotal)}</p>
                    <p className="text-xs text-muted-foreground">{data.cardPct.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancellations Alert */}
      {data.cancelledCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {data.cancelledCount} cancelled checks this period
                </p>
                <p className="text-sm text-amber-600">
                  Review cancellation policies and operational processes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
