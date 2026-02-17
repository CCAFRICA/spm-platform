'use client';

/**
 * Ingestion Tab — Observatory DS-005 ingestion metrics.
 *
 * Shows: files received, records committed, classification accuracy,
 * quarantine rate, per-tenant breakdown, and recent event feed.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  Brain,
  Shield,
  Loader2,
} from 'lucide-react';
import type { IngestionMetricsData } from '@/lib/data/platform-queries';

// ── Helpers ──

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ── Component ──

export function IngestionTab() {
  const [data, setData] = useState<IngestionMetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/platform/observatory?tab=ingestion');
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error('[IngestionTab] fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-zinc-500">
        Failed to load ingestion metrics
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Upload className="h-5 w-5 text-violet-400" />
          Data Ingestion Pipeline
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          DS-005 ingestion metrics across all tenants
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Database}
          label="Total Events"
          value={data.totalEvents.toLocaleString()}
          subtitle={formatBytes(data.totalBytesIngested)}
          color="violet"
        />
        <MetricCard
          icon={CheckCircle}
          label="Committed"
          value={data.committedCount.toLocaleString()}
          subtitle={data.totalEvents > 0 ? pct(data.committedCount / data.totalEvents) : '—'}
          color="emerald"
        />
        <MetricCard
          icon={Shield}
          label="Validation Pass Rate"
          value={pct(data.avgValidationPassRate)}
          subtitle={`${data.quarantinedCount} quarantined`}
          color="amber"
        />
        <MetricCard
          icon={Brain}
          label="Classification Accuracy"
          value={pct(data.classificationAccuracy)}
          subtitle="AI correct vs corrected"
          color="blue"
        />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          icon={CheckCircle}
          label="Committed"
          count={data.committedCount}
          total={data.totalEvents}
          color="emerald"
        />
        <StatusCard
          icon={AlertTriangle}
          label="Quarantined"
          count={data.quarantinedCount}
          total={data.totalEvents}
          color="amber"
        />
        <StatusCard
          icon={XCircle}
          label="Rejected"
          count={data.rejectedCount}
          total={data.totalEvents}
          color="red"
        />
      </div>

      {/* Per-Tenant Breakdown */}
      {data.perTenant.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Per-Tenant Breakdown</h3>
          <div className="rounded-lg border border-[#1E293B] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0F172A] text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left px-4 py-2.5 font-medium">Tenant</th>
                  <th className="text-right px-4 py-2.5 font-medium">Events</th>
                  <th className="text-right px-4 py-2.5 font-medium">Committed</th>
                  <th className="text-right px-4 py-2.5 font-medium">Quarantined</th>
                  <th className="text-right px-4 py-2.5 font-medium">Rejected</th>
                  <th className="text-right px-4 py-2.5 font-medium">Data Volume</th>
                </tr>
              </thead>
              <tbody>
                {data.perTenant.map(t => (
                  <tr key={t.tenantId} className="border-t border-[#1E293B] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-zinc-200 font-medium">{t.tenantName}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">{t.totalEvents}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-400">{t.committed}</td>
                    <td className="px-4 py-2.5 text-right text-amber-400">{t.quarantined}</td>
                    <td className="px-4 py-2.5 text-right text-red-400">{t.rejected}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">{formatBytes(t.bytesIngested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Events Feed */}
      {data.recentEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Recent Ingestion Events</h3>
          <div className="space-y-1.5">
            {data.recentEvents.map(e => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0F172A] border border-[#1E293B]"
              >
                {e.status === 'committed' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                {e.status === 'quarantined' && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                {e.status === 'rejected' && <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                {!['committed', 'quarantined', 'rejected'].includes(e.status) && (
                  <Upload className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                )}
                <span className="text-xs text-zinc-300 truncate flex-1">
                  {e.fileName || 'Unknown file'}
                </span>
                <span className="text-[10px] text-zinc-500 shrink-0">{e.tenantName}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                  e.status === 'committed' && 'bg-emerald-900/30 text-emerald-400',
                  e.status === 'quarantined' && 'bg-amber-900/30 text-amber-400',
                  e.status === 'rejected' && 'bg-red-900/30 text-red-400',
                  !['committed', 'quarantined', 'rejected'].includes(e.status) && 'bg-zinc-800 text-zinc-400',
                )}>
                  {e.status}
                </span>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.totalEvents === 0 && (
        <div className="text-center py-12 rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <Upload className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">No ingestion events yet</p>
          <p className="text-xs text-zinc-600 mt-1">
            Files will appear here once tenants start importing data
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function MetricCard({ icon: Icon, label, value, subtitle, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle: string;
  color: 'violet' | 'emerald' | 'amber' | 'blue';
}) {
  const colorMap = {
    violet: 'text-violet-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
  };

  return (
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('h-4 w-4', colorMap[color])} />
        <span style={{ color: '#71717a', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: '#ffffff' }}>{value}</div>
      <div style={{ color: '#71717a', fontSize: '12px', marginTop: '2px' }}>{subtitle}</div>
    </div>
  );
}

function StatusCard({ icon: Icon, label, count, total, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  color: 'emerald' | 'amber' | 'red';
}) {
  const pctValue = total > 0 ? (count / total) * 100 : 0;
  const colorMap = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-400', bar: 'bg-emerald-900/30' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-400', bar: 'bg-amber-900/30' },
    red: { text: 'text-red-400', bg: 'bg-red-400', bar: 'bg-red-900/30' },
  };

  return (
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '16px' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', colorMap[color].text)} />
          <span className="text-xs font-medium" style={{ color: '#d4d4d8' }}>{label}</span>
        </div>
        <span className={cn('text-sm font-bold', colorMap[color].text)}>
          {count.toLocaleString()}
        </span>
      </div>
      <div className={cn('h-1.5 rounded-full', colorMap[color].bar)}>
        <div
          className={cn('h-full rounded-full transition-all', colorMap[color].bg)}
          style={{ width: `${Math.min(pctValue, 100)}%` }}
        />
      </div>
      <div style={{ color: '#52525b', fontSize: '10px', marginTop: '6px' }}>
        {pctValue.toFixed(1)}% of {total.toLocaleString()} total
      </div>
    </div>
  );
}
