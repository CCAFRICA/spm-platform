'use client';

import { useState, useEffect } from 'react';
import type {
  TenantBillingData,
  MeteringEvent,
} from '@/lib/data/platform-queries';
import { Loader2, Users, Calendar, Calculator, Activity, Zap } from 'lucide-react';

const DEFAULT_LIMITS = { entities: 100, batches: 50, users: 10 };

export function BillingUsageTab() {
  const [tenants, setTenants] = useState<TenantBillingData[]>([]);
  const [metering, setMetering] = useState<MeteringEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=billing')
      .then(res => {
        if (!res.ok) throw new Error(`Billing API: ${res.status}`);
        return res.json();
      })
      .then((result: { tenants: TenantBillingData[]; meteringEvents?: MeteringEvent[] }) => {
        if (!cancelled) {
          setTenants(result.tenants);
          setMetering(result.meteringEvents ?? []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[BillingUsageTab] Fetch failed:', err);
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const totalEntities = tenants.reduce((s, t) => s + t.entityCount, 0);
  const totalBatches = tenants.reduce((s, t) => s + t.batchCount, 0);
  const totalPeriods = tenants.reduce((s, t) => s + t.periodCount, 0);

  return (
    <div className="space-y-8">
      {/* Hero Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-violet-400" />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Entities (Billable)</span>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#ffffff' }}>{totalEntities.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-violet-400" />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Calculation Runs</span>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#ffffff' }}>{totalBatches.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-violet-400" />
            <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Periods Processed</span>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#ffffff' }}>{totalPeriods.toLocaleString()}</p>
        </div>
      </div>

      {/* Per-Tenant Subscription Cards */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
          Per-Tenant Usage
        </h3>
        <div className="space-y-4">
          {tenants.map(t => (
            <div key={t.tenantId} className="border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">{t.tenantName}</h4>
                {t.totalPayout > 0 && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    Total payout: {t.totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>

              {/* Usage Meters */}
              <div className="grid grid-cols-3 gap-4">
                <UsageMeter
                  label="Entities"
                  current={t.entityCount}
                  limit={DEFAULT_LIMITS.entities}
                />
                <UsageMeter
                  label="Calc Runs"
                  current={t.batchCount}
                  limit={DEFAULT_LIMITS.batches}
                />
                <UsageMeter
                  label="Users"
                  current={t.userCount}
                  limit={DEFAULT_LIMITS.users}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metering Events */}
      {metering.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
            Platform Metering Events
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {metering.map(m => (
              <div key={`${m.metricName}-${m.periodKey}`} className="px-3 py-3 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="text-[10px] text-zinc-500 truncate">{m.metricName.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-white">{m.eventCount}</p>
                <span className="text-[10px] text-zinc-600 tabular-nums">{m.periodKey}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue & Growth (replaces Recent Activity — OB-53 Phase 7) */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
          Revenue & Growth
        </h3>
        {metering.length > 0 ? (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '8px' }}>Metered Usage Trend</p>
              <div className="flex items-end gap-1" style={{ height: '48px' }}>
                {metering.slice(0, 8).map((m, i) => {
                  const maxVal = Math.max(...metering.map(x => x.eventCount), 1);
                  const heightPct = (m.eventCount / maxVal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max(heightPct, 4)}%`,
                          background: '#8b5cf6',
                          minHeight: '2px',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <p style={{ color: '#52525b', fontSize: '10px', marginTop: '4px' }}>
                Last {Math.min(metering.length, 8)} periods
              </p>
            </div>
            <div>
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '8px' }}>Tenant Growth</p>
              <p className="text-2xl font-bold" style={{ color: '#ffffff' }}>{tenants.length}</p>
              <p style={{ color: '#71717a', fontSize: '11px' }}>active tenants</p>
              <p style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
                {totalEntities} billable entities
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Activity className="h-8 w-8 mx-auto mb-2" style={{ color: '#3f3f46' }} />
            <p style={{ color: '#71717a', fontSize: '13px' }}>Enable billing metering to track revenue</p>
            <p style={{ color: '#52525b', fontSize: '11px', marginTop: '4px' }}>
              Usage events will appear once AI inference and platform operations are metered
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function UsageMeter({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = Math.min((current / limit) * 100, 100);
  const color = pct < 50 ? '#10B981' : pct < 80 ? '#F59E0B' : '#EF4444';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] text-zinc-500">{label}</span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{current}/{limit}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
