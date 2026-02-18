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

/* ──── STYLES ──── */
const LABEL_STYLE: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '13px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

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
      <div className="text-center py-20" style={{ color: '#94A3B8', fontSize: '14px' }}>
        Failed to load ingestion metrics
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 style={{ color: '#E2E8F0', fontSize: '18px', fontWeight: 600 }} className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-violet-400" />
          Data Ingestion Pipeline
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '14px', marginTop: '4px' }}>
          Ingestion metrics across all tenants
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Database} label="Total Events" value={data.totalEvents.toLocaleString()} subtitle={formatBytes(data.totalBytesIngested)} color="violet" />
        <MetricCard icon={CheckCircle} label="Committed" value={data.committedCount.toLocaleString()} subtitle={data.totalEvents > 0 ? pct(data.committedCount / data.totalEvents) : '—'} color="emerald" />
        <MetricCard icon={Shield} label="Validation Pass Rate" value={pct(data.avgValidationPassRate)} subtitle={`${data.quarantinedCount} quarantined`} color="amber" />
        <MetricCard icon={Brain} label="Classification Accuracy" value={pct(data.classificationAccuracy)} subtitle="AI correct vs corrected" color="blue" />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard icon={CheckCircle} label="Committed" count={data.committedCount} total={data.totalEvents} color="emerald" />
        <StatusCard icon={AlertTriangle} label="Quarantined" count={data.quarantinedCount} total={data.totalEvents} color="amber" />
        <StatusCard icon={XCircle} label="Rejected" count={data.rejectedCount} total={data.totalEvents} color="red" />
      </div>

      {/* Per-Tenant Breakdown */}
      {data.perTenant.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '12px' }}>Per-Tenant Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #27272a' }}>
                  <th style={{ ...LABEL_STYLE, textAlign: 'left', padding: '0 16px 8px 0' }}>Tenant</th>
                  <th style={{ ...LABEL_STYLE, textAlign: 'right', padding: '0 16px 8px 0' }}>Events</th>
                  <th style={{ ...LABEL_STYLE, textAlign: 'right', padding: '0 16px 8px 0' }}>Committed</th>
                  <th style={{ ...LABEL_STYLE, textAlign: 'right', padding: '0 16px 8px 0' }}>Quarantined</th>
                  <th style={{ ...LABEL_STYLE, textAlign: 'right', padding: '0 16px 8px 0' }}>Rejected</th>
                  <th style={{ ...LABEL_STYLE, textAlign: 'right', padding: '0 0 8px 0' }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {data.perTenant.map(t => (
                  <tr key={t.tenantId} style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.4)' }}>
                    <td style={{ color: '#E2E8F0', fontWeight: 500, padding: '10px 16px 10px 0' }}>{t.tenantName}</td>
                    <td style={{ color: '#94A3B8', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.totalEvents}</td>
                    <td style={{ color: '#34d399', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.committed}</td>
                    <td style={{ color: '#fbbf24', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.quarantined}</td>
                    <td style={{ color: '#f87171', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.rejected}</td>
                    <td style={{ color: '#94A3B8', textAlign: 'right', padding: '10px 0', fontVariantNumeric: 'tabular-nums' }}>{formatBytes(t.bytesIngested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Events Feed */}
      {data.recentEvents.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '12px' }}>Recent Ingestion Events</h3>
          <div className="space-y-1.5">
            {data.recentEvents.map(e => {
              const statusColor = e.status === 'committed' ? '#34d399'
                : e.status === 'quarantined' ? '#fbbf24'
                : e.status === 'rejected' ? '#f87171'
                : '#94A3B8';
              const statusBg = e.status === 'committed' ? 'rgba(16, 185, 129, 0.15)'
                : e.status === 'quarantined' ? 'rgba(245, 158, 11, 0.15)'
                : e.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(63, 63, 70, 0.3)';
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3"
                  style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(39, 39, 42, 0.4)', background: 'rgba(24, 24, 27, 0.4)' }}
                >
                  {e.status === 'committed' && <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#34d399' }} />}
                  {e.status === 'quarantined' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: '#fbbf24' }} />}
                  {e.status === 'rejected' && <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#f87171' }} />}
                  {!['committed', 'quarantined', 'rejected'].includes(e.status) && (
                    <Upload className="h-3.5 w-3.5 shrink-0" style={{ color: '#94A3B8' }} />
                  )}
                  <span style={{ color: '#E2E8F0', fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.fileName || 'Unknown file'}
                  </span>
                  <span style={{ color: '#64748B', fontSize: '13px', flexShrink: 0 }}>{e.tenantName}</span>
                  <span style={{ color: statusColor, background: statusBg, fontSize: '12px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500, flexShrink: 0 }}>
                    {e.status}
                  </span>
                  <span style={{ color: '#64748B', fontSize: '13px', flexShrink: 0 }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.totalEvents === 0 && (
        <div className="text-center py-12 rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)' }}>
          <Upload className="h-10 w-10 mx-auto mb-3" style={{ color: '#64748B' }} />
          <p style={{ color: '#94A3B8', fontSize: '14px', fontWeight: 500 }}>No ingestion events yet</p>
          <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
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
        <span style={LABEL_STYLE}>{label}</span>
      </div>
      <div style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94A3B8', fontSize: '13px', marginTop: '2px' }}>{subtitle}</div>
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
          <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 500 }}>{label}</span>
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
      <div style={{ color: '#64748B', fontSize: '13px', marginTop: '6px' }}>
        {pctValue.toFixed(1)}% of {total.toLocaleString()} total
      </div>
    </div>
  );
}
