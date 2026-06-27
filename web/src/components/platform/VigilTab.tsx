'use client';

/**
 * VigilTab — OB-IGF-16: the first cross-product data flow. Renders live VG
 * governance intelligence (capability status, signals, watcher health) inside
 * the VP Platform Observatory. Reads GET /api/platform/vigil (VP server proxies
 * to the VG Vigil API with a server-side token). Read-only.
 */

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ArrowUp, ArrowDown, Minus, Radar } from 'lucide-react';

type Trend = 'improving' | 'stable' | 'degrading';

interface CapabilityRow {
  id: string; name: string; agent: string; lane: string; l_level: string | null;
  open_count: number; by_severity: Record<string, number>; source_types: string[];
  priority: number; trend: Trend;
  most_recent_signal: string | null; most_recent_reporter: string | null; most_recent_at: string | null;
}
interface RecentSignal {
  id: string; description: string; capability_name: string | null; severity: string | null;
  source_type: 'person' | 'continuity_agent'; reporter: string | null; status: string; created_at: string;
}
interface Watcher {
  last_run_at: string | null; mode: string | null; checks_run: number; anomalies: number; passed: number;
  health: 'green' | 'amber' | 'red'; next_scheduled_hint: string;
}
interface Dashboard {
  available: true; generated_at: string; trend_window_hours: number;
  capabilities: CapabilityRow[]; recent_signals: RecentSignal[]; watcher: Watcher;
}
interface Unavailable { available: false; reason: string; error: string }
type ApiResult = Dashboard | Unavailable;

const card = {
  background: 'var(--strag-panel)',
  border: '1px solid var(--strag-s8)',
  borderRadius: '12px',
  padding: '20px',
} as const;

const SEVERITY_COLOR: Record<string, string> = { broken: '#EF4444', degraded: '#FBBF24', cosmetic: '#94a3b8', enhancement: '#7B7FD4' };
const HEALTH_COLOR: Record<string, string> = { green: '#10B981', amber: '#FBBF24', red: '#EF4444' };

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SeverityChip({ severity }: { severity: string | null }) {
  const c = SEVERITY_COLOR[severity ?? ''] ?? '#64748b';
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      color: c, background: `${c}1a`, border: `1px solid ${c}55` }}>
      {severity ?? 'unknown'}
    </span>
  );
}

function LLevelChip({ l }: { l: string | null }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
      color: 'var(--strag-s2)', background: 'var(--strag-s8)', border: '1px solid var(--strag-s7)' }}>
      {l ?? 'L?'}
    </span>
  );
}

function TrendIndicator({ trend }: { trend: Trend }) {
  if (trend === 'degrading') return <span style={{ color: '#EF4444', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px' }}><ArrowUp style={{ width: 13, height: 13 }} /> degrading</span>;
  if (trend === 'improving') return <span style={{ color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px' }}><ArrowDown style={{ width: 13, height: 13 }} /> improving</span>;
  return <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px' }}><Minus style={{ width: 13, height: 13 }} /> stable</span>;
}

export function VigilTab() {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/platform/vigil')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ApiResult) => { setResult(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 style={{ width: '24px', height: '24px', color: '#7B7FD4', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  // Network error OR governance service unreachable → clear message, never a blank tab.
  if (error || !result || result.available === false) {
    const detail = error ?? (result && result.available === false ? `${result.reason}${result.error ? ` — ${result.error}` : ''}` : 'unknown');
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', color: '#FBBF24' }}>
        <AlertTriangle style={{ width: '18px', height: '18px', flexShrink: 0 }} />
        <span>Vigil data unavailable — governance service not responding ({detail}).</span>
      </div>
    );
  }

  const { capabilities, recent_signals, watcher } = result;
  const withSignals = capabilities.filter((c) => c.open_count > 0);

  return (
    <div style={{ fontSize: '14px', color: 'var(--strag-s2)', lineHeight: '1.5' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'var(--strag-s0)', fontSize: '18px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radar style={{ width: 18, height: 18, color: '#7B7FD4' }} /> Vigil — Capability Signal Loop
          </h2>
          <p style={{ color: 'var(--strag-s4)', fontSize: '14px', marginTop: '4px' }}>
            Live capability status, signals from people and the watcher, and watcher health — from the VG governance substrate.
          </p>
        </div>
        {/* Watcher health panel */}
        <div style={{ ...card, padding: '14px 18px', minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: HEALTH_COLOR[watcher.health], display: 'inline-block' }} />
            <span style={{ color: 'var(--strag-s0)', fontWeight: 700, fontSize: '13px' }}>Continuity Agent</span>
            <span style={{ color: 'var(--strag-s4)', fontSize: '12px' }}>({watcher.health})</span>
          </div>
          <p style={{ color: 'var(--strag-s4)', fontSize: '12px', margin: '8px 0 0' }}>
            last run {relTime(watcher.last_run_at)}{watcher.mode ? ` · ${watcher.mode}` : ''} · {watcher.passed}/{watcher.checks_run} passed
          </p>
          <p style={{ color: 'var(--strag-s5)', fontSize: '11px', margin: '4px 0 0' }}>{watcher.next_scheduled_hint}</p>
        </div>
      </div>

      {/* Capability grid */}
      <h3 style={{ color: 'var(--strag-s0)', fontSize: '15px', fontWeight: 700, margin: '0 0 12px' }}>
        Capabilities ({withSignals.length} with open signals · {capabilities.length} total)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {(withSignals.length > 0 ? withSignals : capabilities.slice(0, 6)).map((c) => (
          <div key={c.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--strag-s0)', fontWeight: 700, fontSize: '14px' }}>{c.name}</span>
              <LLevelChip l={c.l_level} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--strag-s2)', fontSize: '13px' }}>{c.open_count} signal{c.open_count === 1 ? '' : 's'}</span>
              {Object.entries(c.by_severity).map(([sev, n]) => (
                <span key={sev} style={{ fontSize: '12px', color: SEVERITY_COLOR[sev] ?? '#64748b' }}>{n} {sev}</span>
              ))}
              <TrendIndicator trend={c.trend} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--strag-s5)' }}>
              <span>{c.lane}</span>
              {c.priority > 0 && <span>· priority {c.priority}</span>}
              {c.source_types.length > 0 && <span>· {c.source_types.join('+')}</span>}
            </div>
            {c.most_recent_signal && (
              <p style={{ color: 'var(--strag-s4)', fontSize: '12px', margin: '10px 0 0', borderTop: '1px solid var(--strag-s8)', paddingTop: '8px' }}>
                {c.most_recent_reporter ? <strong style={{ color: 'var(--strag-s3)' }}>{c.most_recent_reporter}: </strong> : null}
                {c.most_recent_signal.slice(0, 120)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Signal feed */}
      <h3 style={{ color: 'var(--strag-s0)', fontSize: '15px', fontWeight: 700, margin: '0 0 12px' }}>Signal feed</h3>
      <div style={card}>
        {recent_signals.length === 0 ? (
          <p style={{ color: 'var(--strag-s4)', fontSize: '13px', margin: 0 }}>No signals filed yet.</p>
        ) : (
          recent_signals.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--strag-s8)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--strag-s1)', fontWeight: 600, fontSize: '13px' }}>
                    {s.reporter ?? (s.source_type === 'continuity_agent' ? 'Vigil Scout' : 'anonymous')}
                  </span>
                  <span style={{ color: 'var(--strag-s5)', fontSize: '12px' }}>{relTime(s.created_at)}</span>
                  <SeverityChip severity={s.severity} />
                  {s.capability_name && <span style={{ color: 'var(--strag-s4)', fontSize: '12px' }}>· {s.capability_name}</span>}
                </div>
                <p style={{ color: 'var(--strag-s3)', fontSize: '13px', margin: '4px 0 0' }}>{s.description.slice(0, 160)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <p style={{ color: 'var(--strag-s5)', fontSize: '11px', marginTop: '16px' }}>
        VG governance · generated {relTime(result.generated_at)} · read-only (VP consumes VG)
      </p>
    </div>
  );
}
