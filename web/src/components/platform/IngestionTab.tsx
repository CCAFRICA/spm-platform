'use client';

/**
 * Ingestion Tab — fleet import overview (HF-372 Phase D rewrite).
 *
 * TRUTHFUL, single-source: everything renders from processing_jobs (+ import_batches rollups) —
 * the records the SCI pipeline actually writes. The prior tab aggregated `ingestion_events`
 * (never written by SCI): dead 0.0% KPIs, a "No ingestion events yet" panel contradicting the
 * populated queue below it, 'classified' styled green like 'committed' (it is a HUMAN gate, not
 * done), and a stuck 'classified' job was unkillable. All removed/fixed here.
 *
 * Vialuce light theme: white cards, indigo #2D2F8F, gold #E8A838, neutral grays.
 */

import { useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, Ban, RefreshCw } from 'lucide-react';
import type { IngestionMetricsData, ProcessingJobOps } from '@/lib/data/platform-queries';

const VL = {
  indigo: '#2D2F8F',
  gold: '#E8A838',
  text: '#1F2937',
  muted: '#6B7280',
  soft: '#9CA3AF',
  line: '#E5E7EB',
  card: '#FFFFFF',
  green: '#067647',
  greenBg: 'rgba(6, 118, 71, 0.08)',
  red: '#B42318',
  redBg: 'rgba(180, 35, 24, 0.08)',
  amber: '#B54708',
  amberBg: 'rgba(232, 168, 56, 0.14)',
  blue: '#175CD3',
  blueBg: 'rgba(23, 92, 211, 0.08)',
  grayBg: 'rgba(107, 114, 128, 0.08)',
};

const CARD: React.CSSProperties = {
  background: VL.card,
  border: `1px solid ${VL.line}`,
  borderRadius: '12px',
  padding: '20px',
};

const LABEL: React.CSSProperties = {
  color: VL.muted,
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

// Truthful status rendering: 'classified' is AWAITING CONFIRMATION (a human gate), never green.
const JOB_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'queued',                 color: VL.muted, bg: VL.grayBg },
  classifying: { label: 'classifying',            color: VL.blue,  bg: VL.blueBg },
  classified:  { label: 'awaiting confirmation',  color: VL.amber, bg: VL.amberBg },
  confirming:  { label: 'awaiting confirmation',  color: VL.amber, bg: VL.amberBg },
  committing:  { label: 'committing',             color: VL.blue,  bg: VL.blueBg },
  committed:   { label: 'committed',              color: VL.green, bg: VL.greenBg },
  finalized:   { label: 'completed',              color: VL.green, bg: VL.greenBg },
  failed:      { label: 'failed',                 color: VL.red,   bg: VL.redBg },
};

const PHASE_LABEL: Record<string, string> = {
  queued: 'queued', classifying: 'classifying', awaiting_confirmation: 'awaiting confirmation',
  interpreting_plan: 'interpreting plan', committing: 'committing rows', loading: 'loading staged rows',
  finalizing: 'finalizing', completed: 'completed', failed: 'failed', cancelled: 'cancelled',
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function IngestionTab() {
  const [data, setData] = useState<IngestionMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
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
      await load();
    } catch {
      setCancelError('Cancel could not reach the server.');
    } finally {
      setCancellingId(null);
    }
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: VL.indigo }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20" style={{ color: VL.muted, fontSize: '14px' }}>
        Failed to load import metrics
      </div>
    );
  }

  const { jobStats } = data;

  return (
    <div className="space-y-6" style={{ color: VL.text }}>
      {/* Header */}
      <div>
        <h2 style={{ color: VL.text, fontSize: '18px', fontWeight: 600 }} className="flex items-center gap-2">
          <Upload className="h-5 w-5" style={{ color: VL.indigo }} />
          Import Pipeline
        </h2>
        <p style={{ color: VL.muted, fontSize: '14px', marginTop: '4px' }}>
          Import jobs across all tenants — from the durable job record (processing_jobs)
        </p>
      </div>

      {/* KPI cards — real numbers from the records the pipeline writes */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Jobs (24h)" value={jobStats.total24h.toLocaleString()} color={VL.indigo} />
        <Kpi label="In flight" value={jobStats.inFlight.toLocaleString()} color={VL.blue} />
        <Kpi label="Awaiting confirmation" value={jobStats.awaitingConfirmation.toLocaleString()} color={VL.amber} />
        <Kpi label="Completed (24h)" value={jobStats.completed24h.toLocaleString()} color={VL.green} />
        <Kpi label="Failed (24h)" value={jobStats.failed24h.toLocaleString()} color={jobStats.failed24h > 0 ? VL.red : VL.muted} />
        <Kpi label="Stuck" value={jobStats.stuck.toLocaleString()} color={jobStats.stuck > 0 ? VL.red : VL.muted} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Kpi label="Rows committed (24h)" value={data.rowsCommitted24h.toLocaleString()} color={VL.indigo} />
        <Kpi label="Classification accuracy" value={pct(data.classificationAccuracy)} color={VL.indigo} sub="signals not corrected by a human" />
      </div>

      {/* Job queue + kill switch */}
      <JobQueuePanel
        jobs={data.processingJobs}
        cancellingId={cancellingId}
        cancelError={cancelError}
        onCancel={cancelJob}
        onRefresh={load}
      />

      {/* Per-tenant rollup (24h) */}
      {data.perTenant.length > 0 && (
        <div style={CARD}>
          <h3 style={{ ...LABEL, marginBottom: '12px' }}>By tenant (24h)</h3>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${VL.line}` }}>
                  <th style={{ ...LABEL, textAlign: 'left', padding: '0 16px 8px 0' }}>Tenant</th>
                  <th style={{ ...LABEL, textAlign: 'right', padding: '0 16px 8px 0' }}>Jobs</th>
                  <th style={{ ...LABEL, textAlign: 'right', padding: '0 16px 8px 0' }}>Completed</th>
                  <th style={{ ...LABEL, textAlign: 'right', padding: '0 16px 8px 0' }}>Failed</th>
                  <th style={{ ...LABEL, textAlign: 'right', padding: '0 0 8px 0' }}>Rows committed</th>
                </tr>
              </thead>
              <tbody>
                {data.perTenant.map(t => (
                  <tr key={t.tenantId} style={{ borderBottom: `1px solid ${VL.line}` }}>
                    <td style={{ color: VL.text, fontWeight: 500, padding: '10px 16px 10px 0' }}>{t.tenantName}</td>
                    <td style={{ color: VL.muted, textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.jobs24h}</td>
                    <td style={{ color: VL.green, textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.completed24h}</td>
                    <td style={{ color: t.failed24h > 0 ? VL.red : VL.muted, textAlign: 'right', padding: '10px 16px 10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.failed24h}</td>
                    <td style={{ color: VL.muted, textAlign: 'right', padding: '10px 0', fontVariantNumeric: 'tabular-nums' }}>{t.rowsCommitted24h.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ ...CARD, padding: '14px 16px' }}>
      <div style={LABEL}>{label}</div>
      <div style={{ color, fontSize: '24px', fontWeight: 700, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ color: VL.soft, fontSize: '12px', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function JobQueuePanel({ jobs, cancellingId, cancelError, onCancel, onRefresh }: {
  jobs: ProcessingJobOps[];
  cancellingId: string | null;
  cancelError: string | null;
  onCancel: (jobId: string) => void;
  onRefresh: () => void;
}) {
  const cancellableCount = jobs.filter(j => j.cancellable).length;
  return (
    <div style={CARD}>
      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
        <h3 style={{ ...LABEL, margin: 0 }}>
          Import jobs
          <span style={{ color: VL.soft, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {' '}· {cancellableCount} cancellable / {jobs.length} recent
          </span>
        </h3>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5"
          style={{ color: VL.muted, fontSize: '13px', background: 'none', border: `1px solid ${VL.line}`, borderRadius: '8px', padding: '4px 10px', cursor: 'pointer' }}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {cancelError && (
        <div role="status" style={{ color: VL.red, background: VL.redBg, border: `1px solid ${VL.red}33`, borderRadius: '8px', padding: '8px 12px', fontSize: '13px', marginBottom: '12px' }}>
          {cancelError}
        </div>
      )}

      {jobs.length === 0 ? (
        <p style={{ color: VL.muted, fontSize: '14px' }}>No import jobs yet.</p>
      ) : (
        <div className="space-y-1.5">
          {jobs.map(j => {
            const s = JOB_STATUS_STYLE[j.status] ?? JOB_STATUS_STYLE.pending;
            const isCancelling = cancellingId === j.id;
            const phaseLabel = j.phase ? (PHASE_LABEL[j.phase] ?? j.phase) : null;
            return (
              <div
                key={j.id}
                className="flex items-center gap-3"
                style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${VL.line}` }}
              >
                <span style={{ color: VL.text, fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.errorDetail ?? undefined}>
                  {j.fileName || 'Unknown file'}
                </span>
                <span style={{ color: VL.muted, fontSize: '13px', flexShrink: 0 }}>{j.tenantName}</span>
                {j.retryCount > 0 && j.retryCount < 99 && (
                  <span style={{ color: VL.soft, fontSize: '12px', flexShrink: 0 }} title="retry count">↺ {j.retryCount}</span>
                )}
                <span style={{ color: s.color, background: s.bg, fontSize: '12px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, flexShrink: 0 }}>
                  {s.label}
                </span>
                {phaseLabel && !['completed', 'failed'].includes(j.phase ?? '') && (
                  <span style={{ color: VL.indigo, fontSize: '12px', flexShrink: 0 }} title="live phase (metadata.phase)">
                    {phaseLabel}
                  </span>
                )}
                <span style={{ color: VL.soft, fontSize: '12px', flexShrink: 0, minWidth: '140px', textAlign: 'right' }}>
                  {new Date(j.completedAt ?? j.startedAt ?? j.createdAt).toLocaleString()}
                </span>
                {j.cancellable ? (
                  <button
                    onClick={() => onCancel(j.id)}
                    disabled={isCancelling}
                    title="Mark this job failed and stop the dispatcher from re-dispatching or requeuing it"
                    className="flex items-center gap-1.5"
                    style={{ color: VL.red, background: VL.redBg, border: `1px solid ${VL.red}55`, borderRadius: '8px', padding: '4px 10px', fontSize: '13px', fontWeight: 500, cursor: isCancelling ? 'default' : 'pointer', opacity: isCancelling ? 0.6 : 1, flexShrink: 0 }}
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
      <p style={{ color: VL.soft, fontSize: '12px', marginTop: '12px' }}>
        Cancel marks the job failed and pushes it past the retry ceiling so the dispatcher never requeues or
        reclaims it. A worker already executing finishes its current invocation (serverless can&apos;t be
        force-aborted), but it is never re-dispatched, and a finished commit keeps its truthful state.
      </p>
    </div>
  );
}
