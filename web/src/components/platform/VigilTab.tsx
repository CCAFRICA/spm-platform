'use client';

/**
 * VigilTab (R2) — OB-IGF-030. The living capability surface: all 35 capabilities
 * grouped by agent, each with status + signals + work items + when-complete;
 * a submission form, an R1 gate panel, signal-to-work-item promotion, and feeds.
 * All data is live from the VG API (via VP server proxies). No static documents.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ArrowUp, ArrowDown, Minus, Radar, ChevronRight, ChevronDown, Send } from 'lucide-react';
import type { VigilDashboard, CapabilityRow, WorkItem, SignalRow, Trend } from '@/lib/vigil/dashboard-client';

const card = { background: 'var(--strag-panel)', border: '1px solid var(--strag-s8)', borderRadius: '12px', padding: '18px' } as const;
const SEV = { broken: '#EF4444', degraded: '#FBBF24', cosmetic: '#94a3b8', enhancement: '#7B7FD4' } as const;
const HEALTH = { green: '#10B981', amber: '#FBBF24', red: '#EF4444' } as const;
// status color coding: green proven · blue built · amber partial · violet designed · grey concept
const LV = { l4: '#10B981', l3: '#3B82F6', l2: '#FBBF24', l1: '#7B7FD4', l0: '#64748b' } as Record<string, string>;
const WI_STATUS = { complete: '#10B981', in_progress: '#3B82F6', partial: '#FBBF24', designed: '#7B7FD4', not_built: '#64748b', bug: '#EF4444', blocked: '#F97316' } as Record<string, string>;

function relTime(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
function Chip({ text, color }: { text: string; color: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '11px', fontSize: '11px', fontWeight: 600, color, background: `${color}1a`, border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>{text}</span>;
}
function TrendI({ t }: { t: Trend }) {
  const m = t === 'degrading' ? ['#EF4444', ArrowUp, 'degrading'] : t === 'improving' ? ['#10B981', ArrowDown, 'improving'] : ['#64748b', Minus, 'stable'];
  const Icon = m[1] as typeof ArrowUp;
  return <span style={{ color: m[0] as string, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12 }}><Icon style={{ width: 12, height: 12 }} />{m[2] as string}</span>;
}

export function VigilTab() {
  const [data, setData] = useState<VigilDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [r1Filter, setR1Filter] = useState<string | null>(null);
  const [submitText, setSubmitText] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/platform/vigil');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.available === false) { setError(`${j.reason}${j.error ? ` — ${j.error}` : ''}`); setData(null); }
      else { setData(j as VigilDashboard); setError(null); }
    } catch (e) { setError(e instanceof Error ? e.message : 'load failed'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!submitText.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/platform/vigil/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: submitText }) });
      const j = await r.json();
      setToast(r.ok ? (j.confirmation ?? 'Signal filed.') : `Failed: ${j.error ?? r.status}`);
      if (r.ok) { setSubmitText(''); await load(); }
    } catch { setToast('Submission failed — governance service unreachable.'); }
    finally { setBusy(false); setTimeout(() => setToast(null), 6000); }
  }
  async function promote(signalId: string) {
    if (busy) return; setBusy(true);
    try {
      const r = await fetch('/api/platform/vigil/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signal_id: signalId }) });
      const j = await r.json();
      setToast(r.ok ? `Promoted to work item: "${(j.work_item?.title ?? '').slice(0, 40)}"` : `Promote failed: ${j.error ?? r.status}`);
      if (r.ok) await load();
    } catch { setToast('Promote failed.'); }
    finally { setBusy(false); setTimeout(() => setToast(null), 6000); }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><Loader2 style={{ width: 24, height: 24, color: '#7B7FD4', animation: 'spin 1s linear infinite' }} /></div>;
  if (error || !data) return <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, color: '#FBBF24' }}><AlertTriangle style={{ width: 18, height: 18 }} /><span>Vigil data unavailable — governance service not responding ({error ?? 'unknown'}).</span></div>;

  const { capabilities, recent_signals, recent_work_items, r1_criteria, watcher, agents } = data;
  const filterIds = r1Filter ? new Set(capabilities.filter(c => c.r1_criteria_ids.includes(r1Filter)).map(c => c.id)) : null;
  const visible = filterIds ? capabilities.filter(c => filterIds.has(c.id)) : capabilities;

  return (
    <div style={{ fontSize: 14, color: 'var(--strag-s2)', lineHeight: 1.5 }}>
      {/* header + submission + watcher */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ flex: '2 1 360px' }}>
          <h2 style={{ color: 'var(--strag-s0)', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radar style={{ width: 18, height: 18, color: '#7B7FD4' }} /> Vigil — Capability Surface
          </h2>
          <p style={{ color: 'var(--strag-s4)', fontSize: 14, margin: '4px 0 12px' }}>Every capability, signal, and work item — live from VG. The living replacement for the static board, Mission Control, and the registry.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={submitText} onChange={e => setSubmitText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Report something you saw — plain language. Vigil categorizes it." disabled={busy}
              style={{ flex: 1, background: 'var(--strag-deep)', border: '1px solid var(--strag-s8)', borderRadius: 8, padding: '10px 12px', color: 'var(--strag-s1)', fontSize: 13 }} />
            <button onClick={submit} disabled={busy || !submitText.trim()}
              style={{ background: '#7B7FD4', color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: busy || !submitText.trim() ? 0.6 : 1 }}>
              <Send style={{ width: 14, height: 14 }} /> File
            </button>
          </div>
          {toast && <p style={{ color: 'var(--strag-s3)', fontSize: 12, margin: '8px 0 0' }}>{toast}</p>}
        </div>
        <div style={{ ...card, padding: '14px 18px', minWidth: 220, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: HEALTH[watcher.health], display: 'inline-block' }} />
            <span style={{ color: 'var(--strag-s0)', fontWeight: 700, fontSize: 13 }}>Continuity Agent</span>
          </div>
          <p style={{ color: 'var(--strag-s4)', fontSize: 12, margin: '8px 0 0' }}>last run {relTime(watcher.last_run_at)}{watcher.mode ? ` · ${watcher.mode}` : ''} · {watcher.passed}/{watcher.checks_run} passed</p>
          <p style={{ color: 'var(--strag-s5)', fontSize: 11, margin: '4px 0 0' }}>{watcher.next_scheduled_hint}</p>
        </div>
      </div>

      {/* R1 gate panel */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ color: 'var(--strag-s0)', fontSize: 14, fontWeight: 700, margin: 0 }}>R1 Exit Criteria</h3>
          {r1Filter && <button onClick={() => setR1Filter(null)} style={{ background: 'none', border: '1px solid var(--strag-s7)', borderRadius: 6, color: 'var(--strag-s3)', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}>clear filter ({r1Filter})</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {r1_criteria.map(c => {
            const col = c.status === 'pass' ? '#10B981' : c.status === 'partial' ? '#FBBF24' : c.status === 'blocked' ? '#EF4444' : c.status === 'deferred' ? '#64748b' : '#3B82F6';
            const sel = r1Filter === c.id;
            return <button key={c.id} title={`${c.title} — ${c.detail}`} onClick={() => setR1Filter(sel ? null : c.id)}
              style={{ background: sel ? `${col}33` : `${col}14`, border: `1px solid ${col}${sel ? 'aa' : '44'}`, borderRadius: 8, padding: '4px 9px', cursor: 'pointer', color: col, fontSize: 11, fontWeight: 600 }}>
              {c.id} · {c.status}
            </button>;
          })}
        </div>
      </div>

      {/* capability grid grouped by agent */}
      {agents.map(group => {
        const caps = visible.filter(c => c.agent_group === group.label);
        if (caps.length === 0) return null;
        const collapsed = collapsedGroups[group.id];
        return (
          <div key={group.id} style={{ marginBottom: 16 }}>
            <button onClick={() => setCollapsedGroups(g => ({ ...g, [group.id]: !collapsed }))}
              style={{ background: 'none', border: 'none', color: 'var(--strag-s0)', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              {collapsed ? <ChevronRight style={{ width: 16, height: 16 }} /> : <ChevronDown style={{ width: 16, height: 16 }} />} {group.label} <span style={{ color: 'var(--strag-s5)', fontWeight: 400, fontSize: 13 }}>({caps.length})</span>
            </button>
            {!collapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 8 }}>
                {caps.map(c => <CapabilityCard key={c.id} c={c} expanded={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} onPromote={promote} busy={busy} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* feeds */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 24 }}>
        <Feed title="Recent signals">{recent_signals.slice(0, 20).map(s => <SignalRowView key={s.id} s={s} onPromote={promote} busy={busy} />)}</Feed>
        <Feed title="Recent work items">{recent_work_items.slice(0, 20).map(w => <WorkItemRow key={w.id} w={w} />)}</Feed>
      </div>
      <p style={{ color: 'var(--strag-s5)', fontSize: 11, marginTop: 16 }}>VG governance · generated {relTime(data.generated_at)} · {capabilities.length} capabilities · live, self-updating</p>
    </div>
  );
}

function CapabilityCard({ c, expanded, onToggle, onPromote, busy }: { c: CapabilityRow; expanded: boolean; onToggle: () => void; onPromote: (id: string) => void; busy: boolean }) {
  const lvCol = LV[(c.l_level ?? 'l0').toLowerCase()] ?? '#64748b';
  return (
    <div style={card}>
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ color: 'var(--strag-s0)', fontWeight: 700, fontSize: 14 }}>{c.name}</span>
        <Chip text={(c.l_level ?? 'L?').toUpperCase()} color={lvCol} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--strag-s2)' }}>{c.open_signal_count} sig</span>
        <span style={{ color: 'var(--strag-s2)' }}>{c.open_work_count} work</span>
        {Object.entries(c.by_severity).map(([s, n]) => <span key={s} style={{ color: SEV[s as keyof typeof SEV] ?? '#64748b' }}>{n} {s}</span>)}
        <TrendI t={c.trend} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--strag-s5)' }}>
        <span>{c.lane}</span>{c.priority > 0 && <span>· priority {c.priority}</span>}<span style={{ marginLeft: 'auto' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--strag-s8)', paddingTop: 10 }}>
          {c.when_complete && <p style={{ color: 'var(--strag-s4)', fontSize: 12, margin: '0 0 10px', fontStyle: 'italic' }}><strong style={{ color: 'var(--strag-s3)' }}>When complete: </strong>{c.when_complete}</p>}
          {c.signals.length > 0 && <div style={{ marginBottom: 10 }}>
            <p style={{ color: 'var(--strag-s3)', fontSize: 11, fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' }}>Signals</p>
            {c.signals.slice(0, 8).map(s => <SignalRowView key={s.id} s={s} onPromote={onPromote} busy={busy} compact />)}
          </div>}
          {c.work_items.length > 0 && <div>
            <p style={{ color: 'var(--strag-s3)', fontSize: 11, fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' }}>Work items ({c.work_items.length})</p>
            {c.work_items.slice(0, 12).map(w => <WorkItemRow key={w.id} w={w} compact />)}
          </div>}
          {c.signals.length === 0 && c.work_items.length === 0 && <p style={{ color: 'var(--strag-s5)', fontSize: 12, margin: 0 }}>No open signals or work items.</p>}
        </div>
      )}
    </div>
  );
}

function SignalRowView({ s, onPromote, busy, compact }: { s: SignalRow; onPromote: (id: string) => void; busy: boolean; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: compact ? '5px 0' : '9px 0', borderTop: compact ? 'none' : '1px solid var(--strag-s8)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--strag-s1)', fontWeight: 600, fontSize: 12 }}>{s.reporter ?? (s.source_type === 'continuity_agent' ? 'Vigil Scout' : 'anon')}</span>
          <span style={{ color: 'var(--strag-s5)', fontSize: 11 }}>{relTime(s.created_at)}</span>
          {s.severity && <Chip text={s.severity} color={SEV[s.severity as keyof typeof SEV] ?? '#64748b'} />}
          {!compact && s.capability_name && <span style={{ color: 'var(--strag-s4)', fontSize: 11 }}>· {s.capability_name}</span>}
        </div>
        <p style={{ color: 'var(--strag-s3)', fontSize: 12, margin: '3px 0 0' }}>{s.description.slice(0, 140)}</p>
      </div>
      {s.status === 'open' && <button onClick={() => onPromote(s.id)} disabled={busy} title="Promote to work item"
        style={{ background: 'none', border: '1px solid var(--strag-s7)', borderRadius: 6, color: 'var(--strag-s3)', fontSize: 10, padding: '2px 7px', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap', alignSelf: 'center' }}>→ work item</button>}
    </div>
  );
}

function WorkItemRow({ w, compact }: { w: WorkItem; compact?: boolean }) {
  const col = WI_STATUS[w.status] ?? '#64748b';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: compact ? '5px 0' : '9px 0', borderTop: compact ? 'none' : '1px solid var(--strag-s8)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Chip text={w.status} color={col} />
          <span style={{ color: 'var(--strag-s5)', fontSize: 10, fontWeight: 700 }}>{w.priority.toUpperCase()}</span>
          <span style={{ color: 'var(--strag-s5)', fontSize: 10 }}>{w.type}</span>
          {w.work_item_ref && <span style={{ color: '#7B7FD4', fontSize: 10 }}>{w.work_item_ref}</span>}
          {!compact && w.capability_name && <span style={{ color: 'var(--strag-s4)', fontSize: 11 }}>· {w.capability_name}</span>}
        </div>
        <p style={{ color: 'var(--strag-s2)', fontSize: 12, margin: '3px 0 0' }}>{w.title.slice(0, 110)}</p>
      </div>
    </div>
  );
}

function Feed({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={card}><h3 style={{ color: 'var(--strag-s0)', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>{children}</div>;
}
