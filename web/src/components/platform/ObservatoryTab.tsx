'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import {
  getFleetOverview,
  getTenantFleetCards,
  getOperationsQueue,
  type FleetOverview,
  type TenantFleetCard,
  type OperationsQueueItem,
} from '@/lib/data/platform-queries';
import {
  Building2,
  Users,
  Calculator,
  Calendar,
  AlertTriangle,
  Info,
  AlertCircle,
  ChevronRight,
  Loader2,
  CheckCircle,
  PlusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ObservatoryTab() {
  const router = useRouter();
  const { setTenant } = useTenant();
  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [tenantCards, setTenantCards] = useState<TenantFleetCard[]>([]);
  const [queue, setQueue] = useState<OperationsQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingTenant, setSelectingTenant] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getFleetOverview(),
      getTenantFleetCards(),
      getOperationsQueue(),
    ]).then(([ov, cards, q]) => {
      if (!cancelled) {
        setOverview(ov);
        setTenantCards(cards);
        setQueue(q);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const handleSelectTenant = async (tenantId: string) => {
    setSelectingTenant(tenantId);
    try {
      await setTenant(tenantId);
    } catch {
      setSelectingTenant(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Metrics */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={Building2}
            label="Active Tenants"
            value={overview.activeTenantCount}
            subtitle={`${overview.tenantCount} total`}
          />
          <MetricCard
            icon={Users}
            label="Total Entities"
            value={overview.totalEntities}
          />
          <MetricCard
            icon={Calculator}
            label="Calculation Runs"
            value={overview.totalBatches}
          />
          <MetricCard
            icon={Calendar}
            label="Active Periods"
            value={overview.activePeriodsCount}
          />
        </div>
      )}

      {/* Operations Queue */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
          Operations Queue
        </h3>
        {queue.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            All tenants healthy — no items require attention
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((item, i) => (
              <div
                key={`${item.tenantId}-${i}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
                  item.severity === 'critical' && 'border-red-500/30 bg-red-500/5',
                  item.severity === 'warning' && 'border-amber-500/30 bg-amber-500/5',
                  item.severity === 'info' && 'border-zinc-700 bg-zinc-800/30',
                )}
              >
                {item.severity === 'critical' && <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
                {item.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                {item.severity === 'info' && <Info className="h-4 w-4 text-zinc-400 shrink-0" />}
                <span className="text-sm text-white font-medium">{item.tenantName}</span>
                <span className="text-xs text-zinc-400 flex-1">{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tenant Fleet Cards */}
      <div>
        <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-4">
          Tenant Fleet ({tenantCards.length})
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {tenantCards.map(tenant => (
            <button
              key={tenant.id}
              onClick={() => handleSelectTenant(tenant.id)}
              className="text-left bg-[#0F172A] border border-[#1E293B] rounded-xl p-5 hover:border-violet-500/40 hover:bg-[#0F172A]/80 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors">
                    {tenant.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tenant.industry && (
                      <span className="text-[10px] text-zinc-500">{tenant.industry}</span>
                    )}
                    {tenant.country && (
                      <span className="text-[10px] text-zinc-600">{tenant.country}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.latestLifecycleState && (
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border',
                      lifecycleColor(tenant.latestLifecycleState)
                    )}>
                      {tenant.latestLifecycleState}
                    </span>
                  )}
                  {selectingTenant === tenant.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-zinc-500">Entities</p>
                  <p className="text-sm font-bold text-white tabular-nums">{tenant.entityCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Users</p>
                  <p className="text-sm font-bold text-white tabular-nums">{tenant.userCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Period</p>
                  <p className="text-xs text-zinc-300 truncate">{tenant.latestPeriodLabel || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Payout</p>
                  <p className="text-sm font-bold text-white tabular-nums">
                    {tenant.latestBatchPayout > 0
                      ? `$${(tenant.latestBatchPayout / 1000).toFixed(0)}k`
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-3 text-[10px] text-zinc-600">
                Last activity: {new Date(tenant.lastActivity).toLocaleDateString()}
              </div>
            </button>
          ))}

          {/* Create New Tenant */}
          <button
            onClick={() => router.push('/admin/tenants/new')}
            className="flex flex-col items-center justify-center gap-3 bg-[#0F172A] border border-dashed border-zinc-700 rounded-xl p-8 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group min-h-[160px]"
          >
            <PlusCircle className="h-8 w-8 text-zinc-600 group-hover:text-violet-400 transition-colors" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-400 group-hover:text-violet-300 transition-colors">Create New Tenant</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">Provision a new customer environment</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-violet-400" />
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value.toLocaleString()}</p>
      {subtitle && <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function lifecycleColor(state: string): string {
  switch (state) {
    case 'POSTED':
    case 'CLOSED':
    case 'PAID':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'APPROVED':
    case 'OFFICIAL':
      return 'border-blue-500/40 bg-blue-500/10 text-blue-400';
    case 'PREVIEW':
    case 'DRAFT':
      return 'border-zinc-600 bg-zinc-800/50 text-zinc-400';
    case 'REJECTED':
      return 'border-red-500/40 bg-red-500/10 text-red-400';
    default:
      return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
  }
}
