'use client';

/**
 * OB-234 T2 — Intelligence · Explore (/insights/analytics). The user-controlled lens: pick a period,
 * pivot payout by a discovered dimension, watch the temporal trend, and drill to the entity detail
 * table — then export the current slice as CSV.
 *
 * End-State A purity: every calculation number reads the clean data layer
 * (getCalculatedPeriods / getPopulationTrend / getDimensions / aggregateByDimension / getEntityResults
 * via @/lib/insights + @/lib/drill-through). Zero committed_data, zero inline createClient() calc query,
 * zero raw re-aggregation. The legacy analytics-service mock generators and the inline drill-through
 * re-aggregation were removed.
 *
 * DS-003 composition (Diversity Minimum ≥3 types): HorizontalBar (ranked comparison — dimension
 * breakdown, referenceLine = average slice) + ThresholdArea (temporal monitoring — payout by period,
 * band = expected range) + SparkTrend (monitoring — average per entity) + EntityTable (detail on
 * demand, self-fetching, with OB-224 drill-through). Every viz carries a reference frame. Persona
 * density filters which depth renders. Export is a REAL client-side CSV action.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { BarChart3, Download, Layers, Target, TrendingUp, Users } from 'lucide-react';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { useAuth } from '@/contexts/auth-context'; // OB-246: scope-narrowed reads
import {
  getCalculatedPeriods,
  getPopulationTrend,
  getDimensions,
  aggregateByDimension,
  type PeriodSummary,
  type PopulationTrendPoint,
  type EnrichedDimension,
  type DimensionSlice,
} from '@/lib/insights';
import { getEntityResults, type EntityResult } from '@/lib/drill-through';
import { PeriodCards, EntityTable } from '@/components/insights';
import {
  PersonaAmbient,
  DensityGate,
  usePersonaTheme,
  HorizontalBar,
  ThresholdArea,
  SparkTrend,
  Panel,
  TEXT,
} from '@/components/insights/ds003';

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

export default function AnalyticsExplorePage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const { effectiveScope: scope } = useAuth(); // OB-246: member→own, manager→team, admin→all
  const theme = usePersonaTheme();

  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [rows, setRows] = useState<EntityResult[]>([]);
  const [trend, setTrend] = useState<PopulationTrendPoint[]>([]);
  const [dimensions, setDimensions] = useState<EnrichedDimension[]>([]);
  const [activeDimensionKey, setActiveDimensionKey] = useState('');
  const [slices, setSlices] = useState<DimensionSlice[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Periods (canonical getCalculatedPeriods, start_date DESC) + population trend (chronological ASC).
  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    Promise.all([getCalculatedPeriods(currentTenant.id, scope), getPopulationTrend(currentTenant.id, scope)])
      .then(([ps, tr]) => {
        if (cancelled) return;
        setPeriods(ps);
        setTrend(tr);
        setSelectedPeriodId(ps[0]?.period_id ?? '');
        setPeriodsLoaded(true);
        if (ps.length === 0) setIsLoading(false);
      })
      .catch((err) => { console.warn('[Explore] periods load failed:', err); setPeriodsLoaded(true); setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, scope]);

  // Selected-period outcomes + discovered dimensions (learning-loop enriched).
  useEffect(() => {
    if (!currentTenant || !selectedPeriodId) return;
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      getEntityResults(currentTenant.id, scope, { periodId: selectedPeriodId }),
      getDimensions(currentTenant.id, selectedPeriodId, scope),
    ])
      .then(([rs, dims]) => {
        if (cancelled) return;
        setRows(rs);
        setDimensions(dims);
        setActiveDimensionKey((prev) => (dims.some((d) => d.key === prev) ? prev : dims[0]?.key ?? ''));
        setIsLoading(false);
      })
      .catch((err) => { console.warn('[Explore] period data load failed:', err); if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId, scope]);

  // Dimension pivot → slices (aggregateByDimension; clean-path read).
  useEffect(() => {
    const dim = dimensions.find((d) => d.key === activeDimensionKey);
    if (!currentTenant || !selectedPeriodId || !dim) { setSlices([]); return; }
    let cancelled = false;
    aggregateByDimension(currentTenant.id, selectedPeriodId, dim, scope)
      .then((s) => { if (!cancelled) setSlices(s); })
      .catch((err) => { console.warn('[Explore] dimension aggregate failed:', err); if (!cancelled) setSlices([]); });
    return () => { cancelled = true; };
  }, [currentTenant, selectedPeriodId, activeDimensionKey, dimensions, scope]);

  const selectedIdx = useMemo(() => periods.findIndex((p) => p.period_id === selectedPeriodId), [periods, selectedPeriodId]);
  const selectedLabel = periods[selectedIdx]?.label ?? '';
  const activeDimension = useMemo(() => dimensions.find((d) => d.key === activeDimensionKey) ?? null, [dimensions, activeDimensionKey]);

  const periodStats = useMemo(() => {
    if (rows.length === 0) return null;
    const totalPayout = rows.reduce((s, r) => s + (r.totalPayout || 0), 0);
    return { totalPayout, avgPayout: totalPayout / rows.length, entityCount: rows.length };
  }, [rows]);

  // Average slice value — the reference frame for the dimension breakdown.
  const sliceAverage = useMemo(
    () => (slices.length ? slices.reduce((s, x) => s + x.total_payout, 0) / slices.length : 0),
    [slices],
  );

  // Payout-by-period series + an expected band (mean ± ~1σ) as the trend's reference frame.
  const trendSeries = useMemo(() => trend.map((p) => ({ label: p.label, value: p.total })), [trend]);
  const trendBand = useMemo(() => {
    if (trend.length < 2) return undefined;
    const vals = trend.map((p) => p.total);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const sd = Math.sqrt(variance);
    return { low: Math.max(0, mean - sd), high: mean + sd, label: 'Expected range' };
  }, [trend]);
  const avgSeries = useMemo(() => trend.map((p) => ({ label: p.label, value: p.avg })), [trend]);

  // Export the CURRENT slice (the active dimension pivot) as CSV — real client-side serialization.
  const handleExportSlice = () => {
    if (slices.length === 0) return;
    const dimLabel = activeDimension?.label ?? 'Dimension';
    const header = [dimLabel, 'Total Payout', 'Entities', 'Share %'];
    const lines = slices.map((s) =>
      [s.value, s.total_payout, s.entity_count, (s.percentage ?? 0).toFixed(1)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const safeDim = dimLabel.replace(/\s+/g, '-');
    const safePeriod = (selectedLabel || selectedPeriodId).replace(/\s+/g, '-');
    const filename = `explore-${safeDim}-${safePeriod}-${new Date().toISOString().split('T')[0]}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading shell (mirrors the reference surface).
  if (isLoading && !periodsLoaded) {
    return (
      <PersonaAmbient>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: theme.accent, borderTopColor: 'transparent' }} />
            <p className={TEXT.body}>Loading intelligence…</p>
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
          <h1 className={`text-2xl font-bold ${TEXT.headline}`}>No calculation data yet</h1>
          <p className={`mx-auto mt-2 max-w-md ${TEXT.body}`}>
            Explore appears once a compensation run completes — pivot payout by dimension, watch the
            trend, and drill into entity detail.
          </p>
          <Link href="/operate" className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: theme.accentSoft, color: theme.accent }}>
            <Target className="h-4 w-4" /> Go to Compensation
          </Link>
        </div>
      </PersonaAmbient>
    );
  }

  return (
    <PersonaAmbient>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-2xl font-bold ${TEXT.headline}`}>Explore</h1>
            <p className={`mt-1 text-sm ${TEXT.body}`}>
              Pivot, trend, and drill the period{periodStats ? ` · ${periodStats.entityCount} entities · ${selectedLabel}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportSlice}
            disabled={slices.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ borderColor: theme.accentBorder, color: theme.accent, backgroundColor: theme.accentSoft }}
          >
            <Download className="h-4 w-4" /> Export slice (CSV)
          </button>
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

        {isLoading || !periodStats ? (
          <Panel><div className={`py-16 text-center text-sm ${TEXT.muted}`}>{isLoading ? 'Loading period…' : 'No outcomes for this period.'}</div></Panel>
        ) : (
          <>
            {/* Supporting stat tiles — period scale at a glance. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Period Total" value={format(periodStats.totalPayout)} hint={selectedLabel} icon={Target} />
              <Stat label="Entities Paid" value={String(periodStats.entityCount)} hint="with outcomes this period" icon={Users} />
              <Stat label="Average Payout" value={format(periodStats.avgPayout)} hint="per entity" icon={TrendingUp} />
            </div>

            {/* DOMINANT: the user-controlled dimension pivot (ranked comparison, avg-slice reference). */}
            <Panel
              title="Dimension Breakdown"
              description={
                activeDimension?.characterization
                  ? `Pivot payout by a dimension · ${activeDimension.characterization}`
                  : 'Pivot the period payout by a discovered dimension'
              }
              action={
                dimensions.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4" style={{ color: theme.accent }} />
                    <select
                      value={activeDimensionKey}
                      onChange={(e) => setActiveDimensionKey(e.target.value)}
                      aria-label="Pivot dimension"
                      className="rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                    >
                      {dimensions.map((d) => (
                        <option key={d.key} value={d.key}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                ) : undefined
              }
            >
              {dimensions.length === 0 ? (
                <div className={`py-10 text-center text-sm ${TEXT.muted}`}>
                  This period&apos;s data carries no groupable dimension.
                </div>
              ) : (
                <HorizontalBar
                  items={slices.map((s) => ({ label: s.value, value: s.total_payout }))}
                  referenceLine={{ value: sliceAverage, label: 'Avg slice' }}
                  format={format}
                  maxRows={12}
                  emptyLabel="No slices for this dimension."
                />
              )}
            </Panel>

            {/* Temporal overview — payout by period with an expected band. Admin+manager depth. */}
            <DensityGate min="medium">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Panel title="Payout by Period" description="Total payout across calculated periods, vs the expected range">
                    {trendSeries.length >= 2 ? (
                      <ThresholdArea data={trendSeries} band={trendBand} format={format} height={240} />
                    ) : (
                      <div className={`py-12 text-center text-sm ${TEXT.muted}`}>At least two calculated periods are required to show a trend.</div>
                    )}
                  </Panel>
                </div>
                <Panel title="Average per Entity" description="Per-entity payout trend + velocity">
                  {avgSeries.length >= 2 ? (
                    <SparkTrend data={avgSeries} format={format} height={150} />
                  ) : (
                    <div className={`py-12 text-center text-sm ${TEXT.muted}`}>Needs two periods.</div>
                  )}
                </Panel>
              </div>
            </DensityGate>

            {/* Detail on demand — the self-fetching entity table with OB-224 drill-through + CSV export. */}
            <Panel title="Entity Detail" description="Search, sort, and drill into each entity's component breakdown">
              {currentTenant && selectedPeriodId ? (
                <EntityTable
                  tenantId={currentTenant.id}
                  periodId={selectedPeriodId}
                  periodLabel={selectedLabel}
                  showDrillThrough
                  showExport
                  scope={scope}
                />
              ) : (
                <div className={`py-12 text-center text-sm ${TEXT.muted}`}>No period selected.</div>
              )}
            </Panel>
          </>
        )}
      </div>
    </PersonaAmbient>
  );
}
