'use client';

/**
 * Commission Statement Page — Entity-scoped payout + component breakdown
 *
 * OB-171: MC#1 (Individual Commission Statements)
 *
 * Five Elements:
 *   Value:      Total payout for entity in period
 *   Context:    Component breakdown with metric details
 *   Comparison: Lifecycle status, % of total per component
 *   Action:     Switch period, view entity picker (admin)
 *   Impact:     What advancing lifecycle produces
 *
 * Entity scoping:
 *   Admin: entity picker (all entities)
 *   Manager: team entities
 *   Rep: own entity only (via profile link or URL param)
 *
 * Domain-agnostic: component names from rule_sets, entity names from entities.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { createClient } from '@/lib/supabase/client';
import { Loader2, FileText, ChevronDown, User, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { computeVelocity, classifyTrend, type TrajectoryTrend } from '@/lib/intelligence/trajectory-service';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ComponentResult {
  componentId: string;
  componentName: string;
  componentType: string;
  payout: number;
  details: Record<string, unknown>;
}

interface StatementData {
  entity: {
    id: string;
    externalId: string;
    displayName: string;
    metadata: Record<string, unknown>;
  };
  period: {
    id: string;
    label: string;
    startDate: string;
  };
  totalPayout: number;
  components: ComponentResult[];
  lifecycleState: string;
  batchId: string;
}

interface EntityOption {
  id: string;
  externalId: string;
  displayName: string;
}

interface PeriodOption {
  id: string;
  label: string;
  startDate: string;
  hasBatch: boolean;
}

interface TransactionRow {
  dataType: string;
  sourceDate: string | null;
  rowData: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function StatementsPage() {
  const searchParams = useSearchParams();
  const { currentTenant } = useTenant();
  const { format: formatCurrency } = useCurrency();
  const tenantId = currentTenant?.id || '';

  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(searchParams.get('entityId'));
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(searchParams.get('periodId'));
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [entitySearch, setEntitySearch] = useState('');
  const [showTransactions, setShowTransactions] = useState(false);
  const [entityTrajectory, setEntityTrajectory] = useState<Array<{ periodLabel: string; totalPayout: number; components: Record<string, number> }> | null>(null);

  // Load entities and periods
  const loadOptions = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [entitiesRes, periodsRes, batchesRes] = await Promise.all([
      supabase
        .from('entities')
        .select('id, external_id, display_name')
        .eq('tenant_id', tenantId)
        .order('external_id'),
      supabase
        .from('periods')
        .select('id, label, start_date')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false }),
      supabase
        .from('calculation_batches')
        .select('period_id')
        .eq('tenant_id', tenantId),
    ]);

    const batchPeriods = new Set(batchesRes.data?.map(b => b.period_id) || []);

    setEntities(
      (entitiesRes.data || []).map(e => ({
        id: e.id,
        externalId: e.external_id || '',
        displayName: e.display_name,
      }))
    );

    setPeriods(
      (periodsRes.data || []).map(p => ({
        id: p.id,
        label: p.label,
        startDate: p.start_date,
        hasBatch: batchPeriods.has(p.id),
      }))
    );

    // Auto-select first entity if none specified
    if (!selectedEntityId && entitiesRes.data?.length) {
      setSelectedEntityId(entitiesRes.data[0].id);
    }
    // Auto-select most recent period with a batch
    if (!selectedPeriodId && periodsRes.data?.length) {
      const withBatch = (periodsRes.data || []).find(p => batchPeriods.has(p.id));
      if (withBatch) setSelectedPeriodId(withBatch.id);
    }

    setLoading(false);
  }, [tenantId, selectedEntityId, selectedPeriodId]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Load statement when entity or period changes
  const loadStatement = useCallback(async () => {
    if (!tenantId || !selectedEntityId || !selectedPeriodId) {
      setStatement(null);
      return;
    }

    const supabase = createClient();

    // Get latest batch for this period
    const { data: batches } = await supabase
      .from('calculation_batches')
      .select('id, lifecycle_state')
      .eq('tenant_id', tenantId)
      .eq('period_id', selectedPeriodId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!batches?.length) {
      setStatement(null);
      return;
    }

    const batch = batches[0];

    // Get calculation result for this entity in this batch
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout, components, metrics, attainment')
      .eq('batch_id', batch.id)
      .eq('entity_id', selectedEntityId)
      .limit(1);

    if (!results?.length) {
      setStatement(null);
      return;
    }

    const result = results[0];

    // Get entity details
    const { data: entity } = await supabase
      .from('entities')
      .select('id, external_id, display_name, metadata')
      .eq('id', selectedEntityId)
      .single();

    // Get period details
    const period = periods.find(p => p.id === selectedPeriodId);

    // Parse components
    const components = Array.isArray(result.components)
      ? (result.components as unknown as ComponentResult[])
      : [];

    setStatement({
      entity: {
        id: entity?.id || selectedEntityId,
        externalId: entity?.external_id || '',
        displayName: entity?.display_name || '',
        metadata: (entity?.metadata as Record<string, unknown>) || {},
      },
      period: {
        id: selectedPeriodId,
        label: period?.label || '',
        startDate: period?.startDate || '',
      },
      totalPayout: Number(result.total_payout),
      components,
      lifecycleState: batch.lifecycle_state,
      batchId: batch.id,
    });

    // Load source transactions
    const { data: txns } = await supabase
      .from('committed_data')
      .select('data_type, source_date, row_data')
      .eq('tenant_id', tenantId)
      .eq('entity_id', selectedEntityId)
      .order('source_date', { ascending: false })
      .limit(50);

    setTransactions(
      (txns || []).map(t => ({
        dataType: t.data_type,
        sourceDate: t.source_date,
        rowData: (t.row_data as Record<string, unknown>) || {},
      }))
    );

    // OB-172: Load entity trajectory (all periods for this entity)
    const { data: allBatches } = await supabase
      .from('calculation_batches')
      .select('id, period_id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    const latestPerPeriod = new Map<string, string>();
    for (const b of allBatches || []) {
      if (!latestPerPeriod.has(b.period_id)) latestPerPeriod.set(b.period_id, b.id);
    }

    if (latestPerPeriod.size >= 2) {
      const batchIds = Array.from(latestPerPeriod.values());
      const { data: allEntityResults } = await supabase
        .from('calculation_results')
        .select('batch_id, total_payout, components')
        .eq('entity_id', selectedEntityId)
        .in('batch_id', batchIds);

      if (allEntityResults && allEntityResults.length >= 2) {
        const periodLabels = new Map<string, { label: string; startDate: string }>();
        for (const p of periods) {
          periodLabels.set(p.id, { label: p.label, startDate: p.startDate });
        }

        const batchToPeriod = new Map<string, string>();
        Array.from(latestPerPeriod.entries()).forEach(([pid, bid]) => {
          batchToPeriod.set(bid, pid);
        });

        const trajData = allEntityResults.map(r => {
          const pid = batchToPeriod.get(r.batch_id) || '';
          const pInfo = periodLabels.get(pid);
          const comps: Record<string, number> = {};
          const components = Array.isArray(r.components) ? r.components as Array<{ componentName?: string; payout?: number }> : [];
          for (const c of components) {
            comps[c.componentName || 'unknown'] = Number(c.payout || 0);
          }
          return {
            periodLabel: pInfo?.label || '',
            startDate: pInfo?.startDate || '',
            totalPayout: Number(r.total_payout),
            components: comps,
          };
        }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

        setEntityTrajectory(trajData);
      } else {
        setEntityTrajectory(null);
      }
    } else {
      setEntityTrajectory(null);
    }
  }, [tenantId, selectedEntityId, selectedPeriodId, periods]);

  useEffect(() => { loadStatement(); }, [loadStatement]);

  // Filtered entities for picker
  const filteredEntities = useMemo(() => {
    if (!entitySearch) return entities;
    const q = entitySearch.toLowerCase();
    return entities.filter(
      e => e.displayName.toLowerCase().includes(q) || e.externalId.toLowerCase().includes(q)
    );
  }, [entities, entitySearch]);

  const selectedEntity = entities.find(e => e.id === selectedEntityId);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
        <span className="ml-2 text-sm text-zinc-500">Loading statement...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Commission Statement</h1>
            <p className="text-sm text-zinc-500">{currentTenant?.name || 'Select tenant'}</p>
          </div>
        </div>

        {/* Entity + Period selectors */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Entity selector */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowEntityPicker(!showEntityPicker)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-zinc-500" />
                {selectedEntity
                  ? `${selectedEntity.externalId} — ${selectedEntity.displayName}`
                  : 'Select entity...'}
              </div>
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            </button>

            {showEntityPicker && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl max-h-64 overflow-y-auto">
                <div className="p-2">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={entitySearch}
                    onChange={e => setEntitySearch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-200 border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                {filteredEntities.slice(0, 50).map(e => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setSelectedEntityId(e.id);
                      setShowEntityPicker(false);
                      setEntitySearch('');
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 transition-colors ${
                      e.id === selectedEntityId ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-300'
                    }`}
                  >
                    <span className="font-mono text-zinc-500">{e.externalId}</span>
                    <span className="ml-2">{e.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period selector */}
          <select
            value={selectedPeriodId || ''}
            onChange={e => setSelectedPeriodId(e.target.value)}
            className="px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id} disabled={!p.hasBatch}>
                {p.label}{!p.hasBatch ? ' (no results)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Statement content */}
        {!statement ? (
          <div className="text-center py-20">
            <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-300 mb-2">No Statement Available</h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              {!selectedEntityId
                ? 'Select an entity to view their commission statement.'
                : 'No calculation results found for this entity and period.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Total Payout Card */}
            <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 border-l-[3px] border-l-emerald-500 p-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-1">
                    Total Payout
                  </p>
                  <p className="text-4xl font-bold text-zinc-100 tracking-tight">
                    {formatCurrency(statement.totalPayout)}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">
                    {statement.entity.displayName} · {statement.entity.externalId}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                    statement.lifecycleState === 'POSTED' || statement.lifecycleState === 'APPROVED'
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : statement.lifecycleState === 'OFFICIAL' || statement.lifecycleState === 'PENDING_APPROVAL'
                        ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        : 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                  }`}>
                    {statement.lifecycleState}
                  </span>
                  <p className="text-xs text-zinc-500 mt-2">{statement.period.label}</p>
                </div>
              </div>
            </div>

            {/* Component Breakdown */}
            <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 p-5">
              <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-4">
                Component Breakdown
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 text-xs text-zinc-500 font-medium">Component</th>
                      <th className="text-right py-2 text-xs text-zinc-500 font-medium">Payout</th>
                      <th className="text-right py-2 text-xs text-zinc-500 font-medium">% of Total</th>
                      <th className="text-left py-2 pl-4 text-xs text-zinc-500 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.components.map((comp, i) => {
                      const pct = statement.totalPayout > 0
                        ? (comp.payout / statement.totalPayout * 100).toFixed(1)
                        : '0.0';
                      const detail = formatComponentDetail(comp);
                      return (
                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                          <td className="py-3 text-zinc-200">{comp.componentName}</td>
                          <td className="py-3 text-right font-mono text-zinc-200 tabular-nums">
                            {formatCurrency(comp.payout)}
                          </td>
                          <td className="py-3 text-right font-mono text-zinc-400 tabular-nums">
                            {pct}%
                          </td>
                          <td className="py-3 pl-4 text-xs text-zinc-500">{detail}</td>
                        </tr>
                      );
                    })}
                    {/* Total row */}
                    <tr className="font-semibold">
                      <td className="py-3 text-zinc-100">Total</td>
                      <td className="py-3 text-right font-mono text-zinc-100 tabular-nums">
                        {formatCurrency(statement.totalPayout)}
                      </td>
                      <td className="py-3 text-right font-mono text-zinc-300 tabular-nums">100%</td>
                      <td className="py-3 pl-4 text-xs text-zinc-500">
                        {statement.components.length} components
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* OB-172: Entity Trajectory */}
            {entityTrajectory && entityTrajectory.length >= 2 && (() => {
              const values = entityTrajectory.map(p => p.totalPayout);
              const vel = computeVelocity(values);
              const trend: TrajectoryTrend = classifyTrend(vel, null);
              const TrendIcon = trend === 'accelerating' ? TrendingUp : trend === 'decelerating' ? TrendingDown : Minus;
              const trendColor = trend === 'accelerating' ? 'text-emerald-400' : trend === 'decelerating' ? 'text-rose-400' : 'text-zinc-400';

              return (
                <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 p-5">
                  <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400 mb-3">
                    Your Trajectory
                  </p>
                  <div className="flex items-center gap-3 mb-3">
                    {entityTrajectory.map((p, i) => (
                      <span key={i} className="text-sm">
                        {i > 0 && <span className="text-zinc-600 mx-1">→</span>}
                        <span className="text-zinc-300">{p.periodLabel}:</span>{' '}
                        <span className="font-mono text-zinc-100">{formatCurrency(p.totalPayout)}</span>
                      </span>
                    ))}
                  </div>
                  {vel !== null && (
                    <div className="flex items-center gap-2">
                      <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                      <span className={`text-sm font-medium ${trendColor}`}>
                        {vel >= 0 ? '+' : ''}{formatCurrency(vel)}/period
                      </span>
                      <span className="text-xs text-zinc-500 ml-2">
                        Based on {entityTrajectory.length} periods
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Source Transactions */}
            {transactions.length > 0 && (
              <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 p-5">
                <button
                  onClick={() => setShowTransactions(!showTransactions)}
                  className="flex items-center justify-between w-full"
                >
                  <p className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
                    Source Data ({transactions.length} records)
                  </p>
                  <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${showTransactions ? 'rotate-180' : ''}`} />
                </button>

                {showTransactions && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800 max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className="bg-zinc-900">
                          <th className="px-3 py-2 text-left text-zinc-400">Type</th>
                          <th className="px-3 py-2 text-left text-zinc-400">Date</th>
                          <th className="px-3 py-2 text-left text-zinc-400">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((txn, i) => (
                          <tr key={i} className="border-t border-zinc-800">
                            <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{txn.dataType}</td>
                            <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{txn.sourceDate || '—'}</td>
                            <td className="px-3 py-2 text-zinc-500">
                              {formatRowData(txn.rowData)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatComponentDetail(comp: ComponentResult): string {
  const d = comp.details;
  if (!d) return '';

  switch (comp.componentType) {
    case 'matrix_lookup':
      return `Row: ${d.rowBand || '—'} (${Number(d.rowValue || 0).toFixed(1)}%), Col: ${d.colBand || '—'}`;
    case 'tier_lookup':
      return `${d.matchedTier || '—'} (${Number(d.metricValue || 0).toFixed(1)})`;
    case 'percentage':
      return `${d.baseAmount || 0} × ${d.rate || 0}`;
    case 'conditional_percentage':
      return d.gateSemantics ? `${d.matchedCondition || 'Qualified'}` : `${d.matchedCondition || '—'}`;
    default:
      if (d.source === 'calculationIntent' && d.operation === 'conditional_gate') {
        return d.payout ? 'Qualified' : 'Not qualified';
      }
      return '';
  }
}

function formatRowData(data: Record<string, unknown>): string {
  // Filter out internal fields and show key-value pairs
  const filtered = Object.entries(data)
    .filter(([k]) => !k.startsWith('_'))
    .slice(0, 6);

  return filtered.map(([k, v]) => `${k}: ${v}`).join(' · ');
}
