'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/tenant-context';
import type {
  FleetOverview,
  TenantFleetCard,
  OperationsQueueItem,
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

/* ──── STYLES ──── */
const LABEL_STYLE: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '13px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

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

    fetch('/api/platform/observatory')
      .then(res => {
        if (!res.ok) throw new Error(`Observatory API: ${res.status}`);
        return res.json();
      })
      .then((data: { overview: FleetOverview; tenantCards: TenantFleetCard[]; queue: OperationsQueueItem[] }) => {
        if (!cancelled) {
          setOverview(data.overview);
          setTenantCards(data.tenantCards);
          setQueue(data.queue);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[ObservatoryTab] Failed to fetch data:', err);
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
      {/* Tab heading */}
      <div>
        <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }}>Fleet Observatory</h2>
        <p style={{ color: '#94A3B8', fontSize: '14px' }}>Real-time monitoring of tenant fleet, operations, and health</p>
      </div>

      {/* Hero Metrics */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={Building2} label="Active Tenants" value={overview.activeTenantCount} subtitle={`${overview.tenantCount} total`} />
          <MetricCard icon={Users} label="Total Entities" value={overview.totalEntities} />
          <MetricCard icon={Calculator} label="Calculation Runs" value={overview.totalBatches} />
          <MetricCard icon={Calendar} label="Active Periods" value={overview.activePeriodsCount} />
        </div>
      )}

      {/* Operations Queue */}
      <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Operations Queue</h3>
        {queue.length === 0 ? (
          <div className="flex items-center gap-2 py-3" style={{ color: '#34d399', fontSize: '14px' }}>
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
                <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500 }}>{item.tenantName}</span>
                <span style={{ color: '#94A3B8', fontSize: '14px', flex: 1 }}>{item.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tenant Fleet Cards */}
      <div>
        <h3 style={{ ...LABEL_STYLE, marginBottom: '16px' }}>Tenant Fleet ({tenantCards.length})</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {tenantCards.map(tenant => (
            <button
              key={tenant.id}
              onClick={() => handleSelectTenant(tenant.id)}
              className="text-left rounded-2xl hover:border-violet-500/40 transition-all group"
              style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 700 }} className="group-hover:text-violet-300 transition-colors">
                    {tenant.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tenant.industry && (
                      <span style={{ color: '#94A3B8', fontSize: '13px' }}>{tenant.industry}</span>
                    )}
                    {tenant.country && (
                      <span style={{ color: '#64748B', fontSize: '13px' }}>{tenant.country}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.latestLifecycleState && (
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
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
                  <p style={{ color: '#94A3B8', fontSize: '13px' }}>Entities</p>
                  <p style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tenant.entityCount}</p>
                </div>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '13px' }}>Users</p>
                  <p style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{tenant.userCount}</p>
                </div>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '13px' }}>Period</p>
                  <p style={{ color: '#CBD5E1', fontSize: '13px' }} className="truncate">{tenant.latestPeriodLabel || '—'}</p>
                </div>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '13px' }}>Payout</p>
                  <p style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {tenant.latestBatchPayout > 0
                      ? `${(tenant.latestBatchPayout / 1000).toFixed(0)}k`
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-3" style={{ color: '#64748B', fontSize: '13px' }}>
                Last activity: {new Date(tenant.lastActivity).toLocaleDateString()}
              </div>
            </button>
          ))}

          {/* Create New Tenant */}
          <button
            onClick={() => router.push('/admin/tenants/new')}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group min-h-[160px]"
            style={{ background: 'rgba(24, 24, 27, 0.4)', border: '1px dashed rgba(63, 63, 70, 0.6)', padding: '32px' }}
          >
            <PlusCircle className="h-8 w-8 text-zinc-600 group-hover:text-violet-400 transition-colors" />
            <div className="text-center">
              <p style={{ color: '#94A3B8', fontSize: '14px', fontWeight: 500 }} className="group-hover:text-violet-300 transition-colors">Create New Tenant</p>
              <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Provision a new customer environment</p>
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
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-violet-400" />
        <span style={LABEL_STYLE}>{label}</span>
      </div>
      <p style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</p>
      {subtitle && <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>{subtitle}</p>}
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
