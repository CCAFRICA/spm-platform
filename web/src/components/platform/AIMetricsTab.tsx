'use client';

/**
 * AIMetricsTab — OB-215 Agent C: Observatory AI metrics + cost panel.
 *
 * Reads GET /api/platform/ai-metrics (totals all-time + last-30-days, and breakdowns
 * by task / model / tenant from ai_call_metrics). Replaces the stale Haiku cost basis
 * (AUD-018 File A) with real per-model cost (MODEL_PRICING). Renders a clear
 * "not provisioned" state before the architect applies the HALT-MIG migration.
 */

import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface Totals { calls: number; tokensIn: number; tokensOut: number; costUSD: number }
interface Group { key: string; calls: number; tokensIn: number; tokensOut: number; costUSD: number }
interface MetricsData {
  tableReady: boolean;
  reason?: string;
  capped?: boolean;
  rowCap?: number;
  totals?: { allTime: Totals; last30Days: Totals };
  byTask?: Group[];
  byModel?: Group[];
  byTenant?: Group[];
}

const card = {
  background: 'var(--strag-panel)',
  border: '1px solid var(--strag-s8)',
  borderRadius: '12px',
  padding: '24px',
} as const;

const fmtUSD = (n: number) => `$${(n ?? 0).toFixed(4)}`;
const fmtInt = (n: number) => (n ?? 0).toLocaleString();

function TotalCard({ label, t }: { label: string; t: Totals }) {
  return (
    <div style={{ ...card, flex: 1 }}>
      <p style={{ color: 'var(--strag-s4)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{label}</p>
      <p style={{ color: 'var(--strag-s0)', fontSize: '28px', fontWeight: 800, margin: '8px 0 4px' }}>{fmtUSD(t.costUSD)}</p>
      <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: 0 }}>
        {fmtInt(t.calls)} calls · {fmtInt(t.tokensIn + t.tokensOut)} tokens
      </p>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <div style={{ ...card, marginBottom: '16px' }}>
      <h3 style={{ color: 'var(--strag-s0)', fontSize: '15px', fontWeight: 700, margin: '0 0 12px' }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: 0 }}>No calls recorded yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ color: 'var(--strag-s4)', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Key</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Calls</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Tokens</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderTop: '1px solid var(--strag-s8)' }}>
                <td style={{ padding: '6px 8px' }}><code style={{ color: 'var(--strag-s1)' }}>{r.key}</code></td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--strag-s2)' }}>{fmtInt(r.calls)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--strag-s2)' }}>{fmtInt(r.tokensIn + r.tokensOut)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399' }}>{fmtUSD(r.costUSD)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AIMetricsTab() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/ai-metrics')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: MetricsData) => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (error) return <div style={{ padding: '24px', color: '#EF4444', fontSize: '14px' }}>Failed to load AI metrics: {error}</div>;
  if (!data) return null;

  return (
    <div style={{ fontSize: '14px', color: 'var(--strag-s2)', lineHeight: '1.5' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: 'var(--strag-s0)', fontSize: '18px', fontWeight: 700, margin: 0 }}>AI Metrics &amp; Cost</h2>
        <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
          Per-call usage and real per-model cost across every AI surface (ai_call_metrics × MODEL_PRICING).
        </p>
      </div>

      {!data.tableReady ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', color: '#FBBF24' }}>
          <AlertTriangle style={{ width: '18px', height: '18px' }} />
          <span>Metrics table not yet provisioned — {data.reason || 'apply the OB-215 ai_call_metrics migration (HALT-MIG).'}</span>
        </div>
      ) : (
        <>
          {data.capped && (
            <p style={{ color: '#FBBF24', fontSize: '12px', margin: '0 0 12px' }}>
              Showing the most recent {fmtInt(data.rowCap || 0)} calls (window capped — older calls excluded from totals).
            </p>
          )}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            {data.totals && <TotalCard label="All-time (window)" t={data.totals.allTime} />}
            {data.totals && <TotalCard label="Last 30 days" t={data.totals.last30Days} />}
          </div>
          <BreakdownTable title="By task" rows={data.byTask || []} />
          <BreakdownTable title="By model" rows={data.byModel || []} />
          <BreakdownTable title="By tenant" rows={data.byTenant || []} />
        </>
      )}
    </div>
  );
}
