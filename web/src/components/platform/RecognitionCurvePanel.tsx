'use client';

/**
 * OB-235 P8 — The Visible Recognition Curve (Prove Don't Describe). Renders, per tenant, the learning loop
 * made visible: execution-mode distribution + per-pattern synaptic density (calculation layer), comprehension
 * recall-skip rate + fingerprint count (comprehension layer), and the expression-binding cold-start
 * inheritance rate (expression layer) + the cross-tenant flywheel scope. Read-only; renders whatever
 * structural patterns exist (no fixed vocabulary — Korean Test).
 */

import { useEffect, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE_COLOR: Record<string, string> = {
  full_trace: '#f59e0b',   // amber — cold, full tracing
  light_trace: '#3b82f6',  // blue — warming
  silent: '#10b981',       // green — learned, fastest
};

const card: React.CSSProperties = { background: 'rgba(24,24,27,0.6)', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 8, padding: 16 };
const label: React.CSSProperties = { fontSize: 12, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 0.5 };
const big: React.CSSProperties = { fontSize: 28, fontWeight: 700, color: '#fafafa' };

function pct(n: number) { return `${Math.round(n * 100)}%`; }

export function RecognitionCurvePanel() {
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/observatory/recognition-curve').then((r) => r.json()).then((d) => setTenants(d.tenants ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tenantId) { setData(null); return; }
    setLoading(true);
    fetch(`/api/observatory/recognition-curve?tenantId=${tenantId}`).then((r) => r.json()).then((d) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [tenantId]);

  const dist = data?.calculation?.modeDistribution ?? { full_trace: 0, light_trace: 0, silent: 0 };
  const distTotal = (dist.full_trace ?? 0) + (dist.light_trace ?? 0) + (dist.silent ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fafafa', margin: 0 }}>Recognition Curve</h2>
        <span style={{ fontSize: 12, color: '#71717a' }}>non-amnesiac behaviour per tenant — density → mode shift → recall skips</span>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
          style={{ marginLeft: 'auto', background: 'rgba(24,24,27,0.8)', color: '#fafafa', border: '1px solid rgba(63,63,70,0.8)', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
          <option value="">Select a tenant…</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading && <div style={{ color: '#a1a1aa', fontSize: 13 }}>Loading…</div>}
      {!tenantId && !loading && <div style={{ ...card, color: '#71717a', fontSize: 13 }}>Select a tenant to view its recognition curve.</div>}

      {data && !loading && (
        <>
          {/* Headline metrics across the four layers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={card}>
              <div style={label}>Comprehension recall-skip</div>
              <div style={big}>{pct(data.comprehension.skipRate)}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>{data.comprehension.recallableFields}/{data.comprehension.totalFields} fields warm · {data.comprehension.fingerprints} fingerprints</div>
            </div>
            <div style={card}>
              <div style={label}>Calc patterns silent</div>
              <div style={big}>{distTotal > 0 ? pct((dist.silent ?? 0) / distTotal) : '—'}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>{dist.silent ?? 0}/{distTotal} patterns learned (silent)</div>
            </div>
            <div style={card}>
              <div style={label}>Binding inheritance</div>
              <div style={big}>{pct(data.expression.inheritanceRate)}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>{data.expression.inherited}/{data.expression.totalBindings} bindings cold-start inherited</div>
            </div>
            <div style={card}>
              <div style={label}>Flywheel scope</div>
              <div style={big}>{data.flywheel.foundationalPatterns}</div>
              <div style={{ fontSize: 12, color: '#a1a1aa' }}>foundational · {data.flywheel.domainPatterns} domain patterns</div>
            </div>
          </div>

          {/* Execution-mode distribution bar (the timing-progression proxy: more green = faster runs) */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 8 }}>Execution-mode distribution (cold amber → warming blue → learned green)</div>
            {distTotal === 0 ? <div style={{ color: '#71717a', fontSize: 13 }}>No density yet — tenant has not run.</div> : (
              <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }}>
                {(['full_trace', 'light_trace', 'silent'] as const).map((m) => (dist[m] ?? 0) > 0 && (
                  <div key={m} title={`${m}: ${dist[m]}`} style={{ width: `${((dist[m] ?? 0) / distTotal) * 100}%`, background: MODE_COLOR[m], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#000', fontWeight: 600 }}>
                    {dist[m]}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-pattern density progression */}
          <div style={card}>
            <div style={{ ...label, marginBottom: 8 }}>Per-pattern synaptic density ({data.calculation.patternCount} patterns)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {data.calculation.patterns.length === 0 && <div style={{ color: '#71717a', fontSize: 13 }}>No patterns yet.</div>}
              {data.calculation.patterns.map((p: any) => (
                <div key={p.signature} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 11, color: '#71717a', width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.signature}</code>
                  <div style={{ flex: 1, height: 14, background: 'rgba(63,63,70,0.4)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: pct(p.confidence), height: '100%', background: MODE_COLOR[p.executionMode] }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#a1a1aa', width: 44, textAlign: 'right' }}>{p.confidence.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
