'use client';

import { useState, useEffect } from 'react';
import type {
  TenantBillingData,
  RecentBatchActivity,
  MeteringEvent,
} from '@/lib/data/platform-queries';
import { Loader2, Users, Calendar, Calculator, Activity, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_LIMITS = { entities: 100, batches: 50, users: 10 };

export function BillingUsageTab() {
  const [tenants, setTenants] = useState<TenantBillingData[]>([]);
  const [activity, setActivity] = useState<RecentBatchActivity[]>([]);
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
      .then((result: { tenants: TenantBillingData[]; recentActivity: RecentBatchActivity[]; meteringEvents?: MeteringEvent[] }) => {
        if (!cancelled) {
          setTenants(result.tenants);
          setActivity(result.recentActivity);
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

      {/* Recent Activity Feed */}
      {activity.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
            Recent Activity
          </h3>
          <div className="space-y-2">
            {activity.map(a => (
              <div key={a.batchId} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/30">
                <Activity className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-400">
                  {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-sm text-white font-medium">{a.tenantName}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full border',
                  a.lifecycleState === 'POSTED' || a.lifecycleState === 'PAID' ? 'border-emerald-500/40 text-emerald-400' : 'border-zinc-700 text-zinc-400'
                )}>
                  {a.lifecycleState}
                </span>
                <span className="text-xs text-zinc-500 tabular-nums ml-auto">{a.entityCount} entities</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
