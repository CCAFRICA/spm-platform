'use client';

import { useState, useEffect } from 'react';
import type {
  TenantBillingData,
  RecentBatchActivity,
} from '@/lib/data/platform-queries';
import { Loader2, Users, Calendar, Calculator, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_LIMITS = { entities: 100, batches: 50, users: 10 };

export function BillingUsageTab() {
  const [tenants, setTenants] = useState<TenantBillingData[]>([]);
  const [activity, setActivity] = useState<RecentBatchActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/platform/observatory?tab=billing')
      .then(res => {
        if (!res.ok) throw new Error(`Billing API: ${res.status}`);
        return res.json();
      })
      .then((result: { tenants: TenantBillingData[]; recentActivity: RecentBatchActivity[] }) => {
        if (!cancelled) {
          setTenants(result.tenants);
          setActivity(result.recentActivity);
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
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Total Entities (Billable)</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{totalEntities.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Calculation Runs</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{totalBatches.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-violet-400" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Periods Processed</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{totalPeriods.toLocaleString()}</p>
        </div>
      </div>

      {/* Per-Tenant Subscription Cards */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
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

      {/* Recent Activity Feed */}
      {activity.length > 0 && (
        <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
          <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
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
