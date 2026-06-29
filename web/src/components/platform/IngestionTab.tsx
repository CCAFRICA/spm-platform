'use client';

/**
 * Ingestion Tab — Observatory DS-005 ingestion metrics.
 *
 * Shows: files received, records committed, classification accuracy,
 * quarantine rate, per-tenant breakdown, and recent event feed.
 */

import { useState, useEffect, useCallback } from 'react';
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
  Clock,
  Ban,
} from 'lucide-react';
import type { IngestionMetricsData, ProcessingJobOps } from '@/lib/data/platform-queries';

/* ──── STYLES ──── */
const LABEL_STYLE: React.CSSProperties = {
  color: 'var(--strag-s4)',
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
  // HF-356 (RC4/I9): the per-job cancel-in-flight id (for the button spinner) + any cancel error.
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/observatory?tab=ingestion');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('[IngestionTab] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // HF-356 (RC4/I9) — THE KILL SWITCH. Cancel a runaway async-ingestion job, then refresh the queue.
  const cancelJob = useCallback(async (jobId: string) => {
    setCancelError(null);
    setCancellingId(jobId);
    try {
      const res = await fetch('/api/platform/observatory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel-job', jobId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        setCancelError(e.error || `Cancel failed (HTTP ${res.status}).`);
      } else {
        const { cancelled } = await res.json() as { cancelled: boolean };
        if (!cancelled) setCancelError('That job had already finished — nothing to cancel.');
      }
      await load(); // reflect the new state either way
    } catch {
      setCancelError('Cancel could not reach the server.');
    } finally {
      setCancellingId(null);
    }
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20" style={{ color: 'var(--strag-s4)', fontSize: '14px' }}>
        Failed to load ingestion metrics
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 style={{ color: 'var(--strag-s2)', fontSize: '18px', fontWeight: 600 }} className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-violet-400" />
          Data Ingestion Pipeline
        </h2>
        <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
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

      {/* HF-356 (RC4/I9): Async Worker Queue + kill switch — operator visibility into running imports. */}
      <WorkerQueuePanel
        jobs={data.processingJobs}
        cancellingId={cancellingId}
        cancelError={cancelError}
        onCancel={cancelJob}
        onRefresh={load}
      />

      {/* Per-Tenant Breakdown */}
      {data.perTenant.length > 0 && (
        <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
          <h3 style={{ ...LABEL_STYLE, marginBottom: '12px' }}>Per-Tenant Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--strag-z8)' }}>
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
                    <td style={{ color: 'var(--strag-s2)', fontWeight: 500, padding: '10px 16px 10px 0' }}>{t.tenantName}</td>
                    <td style={{ color: 'var(--strag-s4)', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.totalEvents}</td>
                    <td style={{ color: '#34d399', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.committed}</td>
                    <td style={{ color: '#fbbf24', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.quarantined}</td>
                    <td style={{ color: '#f87171', textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.rejected}</td>
                    <td style={{ color: 'var(--strag-s4)', textAlign: 'right', padding: '10px 0', fontVariantNumeric: 'tabular-nums' }}>{formatBytes(t.bytesIngested)}</td>
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
                : 'var(--strag-s4)';
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
                    <Upload className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--strag-s4)' }} />
                  )}
                  <span style={{ color: 'var(--strag-s2)', fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.fileName || 'Unknown file'}
                  </span>
                  <span style={{ color: 'var(--strag-s4)', fontSize: '13px', flexShrink: 0 }}>{e.tenantName}</span>
                  <span style={{ color: statusColor, background: statusBg, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500, flexShrink: 0 }}>
                    {e.status}
                  </span>
                  <span style={{ color: 'var(--strag-s4)', fontSize: '13px', flexShrink: 0 }}>
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
          <Upload className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--strag-s4)' }} />
          <p style={{ color: 'var(--strag-s4)', fontSize: '14px', fontWeight: 500 }}>No ingestion events yet</p>
          <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
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
      <div style={{ color: 'var(--strag-s0)', fontSize: '28px', fontWeight: 700 }}>{value}</div>
      <div style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '2px' }}>{subtitle}</div>
    </div>
  );
}

// HF-356 (RC4/I9) — Async Worker Queue panel + kill switch. Cross-tenant visibility into the
// processing_jobs the cron/worker advance, with a per-active-job Cancel (platform-admin only). A runaway
// import — the 86K incident — is now both VISIBLE here and stoppable, instead of silent and unkillable.
const JOB_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending:     { color: '#a1a1aa', bg: 'rgba(63, 63, 70, 0.3)' },
  classifying: { color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' },
  classified:  { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' },
  committing:  { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)' },
  committed:   { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' },
  failed:      { color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' },
};

function WorkerQueuePanel({ jobs, cancellingId, cancelError, onCancel, onRefresh }: {
  jobs: ProcessingJobOps[];
  cancellingId: string | null;
  cancelError: string | null;
  onCancel: (jobId: string) => void;
  onRefresh: () => void;
}) {
  const activeCount = jobs.filter(j => j.isActive).length;
  return (
    <div className="rounded-2xl" style={{ background: 'rgba(24, 24, 27, 0.8)', border: '1px solid rgba(39, 39, 42, 0.6)', padding: '20px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
        <h3 style={{ ...LABEL_STYLE, margin: 0 }} className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-violet-400" />
          Async Worker Queue
          <span style={{ color: 'var(--strag-s4)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            · {activeCount} active / {jobs.length} recent
          </span>
        </h3>
        <button
          onClick={onRefresh}
          style={{ color: 'var(--strag-s4)', fontSize: '13px', background: 'none', border: '1px solid rgba(63,63,70,0.5)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {cancelError && (
        <div role="status" style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', marginBottom: '12px' }}>
          {cancelError}
        </div>
      )}

      {jobs.length === 0 ? (
        <p style={{ color: 'var(--strag-s4)', fontSize: '14px' }}>No worker jobs in the recent window.</p>
      ) : (
        <div className="space-y-1.5">
          {jobs.map(j => {
            const s = JOB_STATUS_STYLE[j.status] ?? JOB_STATUS_STYLE.pending;
            const isCancelling = cancellingId === j.id;
            return (
              <div
                key={j.id}
                className="flex items-center gap-3"
                style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(39, 39, 42, 0.4)', background: 'rgba(24, 24, 27, 0.4)' }}
              >
                <span style={{ color: 'var(--strag-s2)', fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.fileName || 'Unknown file'}
                </span>
                <span style={{ color: 'var(--strag-s4)', fontSize: '13px', flexShrink: 0 }}>{j.tenantName}</span>
                {j.retryCount > 0 && (
                  <span style={{ color: 'var(--strag-s4)', fontSize: '12px', flexShrink: 0 }} title="retry count">↺ {j.retryCount}</span>
                )}
                <span style={{ color: s.color, background: s.bg, fontSize: '13px', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, flexShrink: 0 }}>
                  {j.status}
                </span>
                <span style={{ color: 'var(--strag-s4)', fontSize: '12px', flexShrink: 0, minWidth: '150px', textAlign: 'right' }}>
                  {new Date(j.startedAt ?? j.createdAt).toLocaleString()}
                </span>
                {j.isActive ? (
                  <button
                    onClick={() => onCancel(j.id)}
                    disabled={isCancelling}
                    title="Mark this job failed and stop the cron from re-dispatching or requeuing it"
                    className="flex items-center gap-1.5"
                    style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', padding: '4px 10px', fontSize: '13px', fontWeight: 500, cursor: isCancelling ? 'default' : 'pointer', opacity: isCancelling ? 0.6 : 1, flexShrink: 0 }}
                  >
                    {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                    {isCancelling ? 'Cancelling…' : 'Cancel'}
                  </button>
                ) : (
                  <span style={{ width: '84px', flexShrink: 0 }} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p style={{ color: 'var(--strag-s4)', fontSize: '12px', marginTop: '12px' }}>
        Cancel marks the job failed and pushes it past the retry ceiling so the dispatcher never requeues or
        reclaims it. A worker already executing finishes its current Lambda (serverless can&apos;t be force-aborted),
        but it is never re-dispatched.
      </p>
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
          <span style={{ color: 'var(--strag-s2)', fontSize: '14px', fontWeight: 500 }}>{label}</span>
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
      <div style={{ color: 'var(--strag-s4)', fontSize: '13px', marginTop: '6px' }}>
        {pctValue.toFixed(1)}% of {total.toLocaleString()} total
      </div>
    </div>
  );
}
