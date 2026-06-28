'use client';

/**
 * VigilTab (R2) — OB-IGF-030. The living capability surface: all 35 capabilities
 * grouped by agent, each with status + signals + work items + when-complete;
 * a submission form, an R1 gate panel, signal-to-work-item promotion, and feeds.
 * All data is live from the VG API (via VP server proxies). No static documents.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ArrowUp, ArrowDown, Minus, Radar, ChevronRight, ChevronDown, Send, CheckCircle2, Clock, Settings2 } from 'lucide-react';
import type { VigilDashboard, CapabilityRow, WorkItem, SignalRow, Trend } from '@/lib/vigil/dashboard-client';

const WI_STATUSES = ['not_built', 'in_progress', 'partial', 'complete', 'bug', 'designed', 'blocked'];
const WI_PRIORITIES = ['p0', 'p1', 'p2', 'p3'];
type WorkItemUpdater = (id: string, patch: { status?: string; priority?: string; resolution_note?: string; verified?: boolean }, label: string) => void;

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

type PostResult = { ok: boolean; status: number; data: Record<string, unknown> | null; error: string };
/**
 * POST JSON and parse the response defensively. GAP-B root cause: the old path did
 * `await res.json()` directly, so any NON-JSON response — a 3xx redirect to an HTML
 * auth/tenant/MFA page (fetch follows it by default), or an upstream error page —
 * threw, and a bare catch reported a misleading "governance service unreachable".
 * The click looked like it did nothing. Here: block auto-following redirects
 * (`redirect: 'manual'`), read as text, JSON-parse guardedly, and surface the real
 * status + reason so success and failure are both unambiguous.
 */
async function postJson(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<PostResult> {
  try {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { ok: false, status: res.status || 0, data: null, error: 'session/tenant expired — reload the page and sign in again' };
    }
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try { data = text ? (JSON.parse(text) as Record<string, unknown>) : null; } catch { /* non-JSON (HTML error page) */ }
    if (!res.ok) {
      const e = (data?.error ?? data?.message) as string | undefined;
      return { ok: false, status: res.status, data, error: e ?? `request failed (HTTP ${res.status})` };
    }
    if (data == null) return { ok: false, status: res.status, data: null, error: 'unexpected non-JSON response from the server' };
    return { ok: true, status: res.status, data, error: '' };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? `network error: ${e.message}` : 'network error' };
  }
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
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

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
    setBusy(true); setNotice(null);
    const res = await postJson('/api/platform/vigil/report', { description: submitText });
    if (res.ok) {
      setNotice({ kind: 'ok', msg: (res.data?.confirmation as string | undefined) ?? 'Signal filed.' });
      setSubmitText('');
      await load();
    } else {
      setNotice({ kind: 'err', msg: res.error });
    }
    setBusy(false);
  }
  async function promote(signalId: string) {
    if (busy) return;
    setBusy(true); setNotice(null);
    const res = await postJson('/api/platform/vigil/promote', { signal_id: signalId });
    if (res.ok) {
      const wi = res.data?.work_item as { title?: string } | undefined;
      setNotice({ kind: 'ok', msg: `Promoted to work item: "${(wi?.title ?? '').slice(0, 48)}"` });
      await load();
    } else {
      setNotice({ kind: 'err', msg: `Promote failed — ${res.error}` });
    }
    setBusy(false);
  }
  // HF-IGF-017 Gap C — work-item lifecycle (status / priority / verified / note).
  async function updateWI(id: string, patch: { status?: string; priority?: string; resolution_note?: string; verified?: boolean }, label: string) {
    if (busy) return;
    setBusy(true); setNotice(null);
    const res = await postJson(`/api/platform/vigil/work-items/${id}`, patch, 'PATCH');
    if (res.ok) {
      setNotice({ kind: 'ok', msg: `Work item ${label}.` });
      await load();
    } else {
      setNotice({ kind: 'err', msg: `Update failed — ${res.error}` });
    }
    setBusy(false);
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
            <button type="button" onClick={submit} disabled={busy || !submitText.trim()}
              style={{ background: '#7B7FD4', color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 600, fontSize: 13, cursor: busy || !submitText.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: busy || !submitText.trim() ? 0.6 : 1 }}>
              {busy ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 14, height: 14 }} />} File
            </button>
          </div>
          {notice && <p style={{ color: notice.kind === 'ok' ? '#10B981' : '#EF4444', fontSize: 12, margin: '8px 0 0', fontWeight: 600 }}>{notice.kind === 'ok' ? '✓ ' : '✕ '}{notice.msg}</p>}
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

      {/* GAP D — summary visualizations (above the grid, from existing dashboard data) */}
      <SummaryStrip capabilities={capabilities} agents={agents} />

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
                {caps.map(c => <CapabilityCard key={c.id} c={c} expanded={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} onPromote={promote} onUpdate={updateWI} busy={busy} />)}
              </div>
            )}
          </div>
        );
      })}

      {/* feeds */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 24 }}>
        <Feed title="Recent signals">{recent_signals.slice(0, 20).map(s => <SignalRowView key={s.id} s={s} onPromote={promote} busy={busy} />)}</Feed>
        <Feed title="Recent work items">{recent_work_items.slice(0, 20).map(w => <WorkItemRow key={w.id} w={w} onUpdate={updateWI} busy={busy} />)}</Feed>
      </div>
      <p style={{ color: 'var(--strag-s5)', fontSize: 11, marginTop: 16 }}>VG governance · generated {relTime(data.generated_at)} · {capabilities.length} capabilities · live, self-updating</p>
    </div>
  );
}

function CapabilityCard({ c, expanded, onToggle, onPromote, onUpdate, busy }: { c: CapabilityRow; expanded: boolean; onToggle: () => void; onPromote: (id: string) => void; onUpdate: WorkItemUpdater; busy: boolean }) {
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
            {c.work_items.slice(0, 12).map(w => <WorkItemRow key={w.id} w={w} onUpdate={onUpdate} busy={busy} compact />)}
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

const selStyle = { background: 'var(--strag-deep)', border: '1px solid var(--strag-s7)', borderRadius: 6, color: 'var(--strag-s1)', fontSize: 11, padding: '3px 6px' } as const;

function WorkItemRow({ w, onUpdate, busy, compact }: { w: WorkItem; onUpdate: WorkItemUpdater; busy: boolean; compact?: boolean }) {
  const [manage, setManage] = useState(false);
  const [note, setNote] = useState(w.resolution_note ?? '');
  const col = WI_STATUS[w.status] ?? '#64748b';
  const verified = !!w.resolved_at;                                  // SR-44: architect-verified & closed
  const awaiting = w.status === 'complete' && !verified;             // code shipped, awaiting verification

  return (
    <div style={{ padding: compact ? '6px 0' : '9px 0', borderTop: compact ? '1px solid var(--strag-s9, #1c2433)' : '1px solid var(--strag-s8)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Chip text={w.status} color={col} />
            <span style={{ color: 'var(--strag-s5)', fontSize: 10, fontWeight: 700 }}>{w.priority.toUpperCase()}</span>
            <span style={{ color: 'var(--strag-s5)', fontSize: 10 }}>{w.type}</span>
            {w.work_item_ref && <span style={{ color: '#7B7FD4', fontSize: 10 }}>{w.work_item_ref}</span>}
            {verified && <span title={`verified${w.resolved_at ? ' ' + relTime(w.resolved_at) : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#10B981', fontSize: 10, fontWeight: 700 }}><CheckCircle2 style={{ width: 11, height: 11 }} />verified</span>}
            {awaiting && <span title="code shipped — awaiting architect verification (SR-44)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#FBBF24', fontSize: 10, fontWeight: 700 }}><Clock style={{ width: 11, height: 11 }} />awaiting verification</span>}
            {!compact && w.capability_name && <span style={{ color: 'var(--strag-s4)', fontSize: 11 }}>· {w.capability_name}</span>}
          </div>
          <p style={{ color: 'var(--strag-s2)', fontSize: 12, margin: '3px 0 0' }}>{w.title.slice(0, 110)}</p>
          {verified && w.resolution_note && <p style={{ color: 'var(--strag-s5)', fontSize: 11, margin: '2px 0 0', fontStyle: 'italic' }}>↳ {w.resolution_note}</p>}
        </div>
        <button type="button" onClick={() => setManage(m => !m)} title="manage work item"
          style={{ background: 'none', border: '1px solid var(--strag-s7)', borderRadius: 6, color: manage ? '#7B7FD4' : 'var(--strag-s4)', cursor: 'pointer', padding: '2px 6px', alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center' }}>
          <Settings2 style={{ width: 12, height: 12 }} />
        </button>
      </div>
      {manage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, padding: '8px', background: 'var(--strag-deep)', borderRadius: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--strag-s5)' }}>status
            <select value={w.status} disabled={busy} onChange={e => onUpdate(w.id, { status: e.target.value }, `status → ${e.target.value}`)} style={{ ...selStyle, marginLeft: 4 }}>
              {WI_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 10, color: 'var(--strag-s5)' }}>priority
            <select value={w.priority} disabled={busy} onChange={e => onUpdate(w.id, { priority: e.target.value }, `priority → ${e.target.value}`)} style={{ ...selStyle, marginLeft: 4 }}>
              {WI_PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </label>
          <input value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="resolution note (e.g. HF-341 merged, verified on prod)"
            style={{ flex: '1 1 220px', minWidth: 160, background: 'var(--strag-panel)', border: '1px solid var(--strag-s7)', borderRadius: 6, color: 'var(--strag-s1)', fontSize: 11, padding: '4px 7px' }} />
          {!verified
            ? <button type="button" disabled={busy} onClick={() => onUpdate(w.id, { verified: true, resolution_note: note || undefined }, 'verified ✓ (SR-44)')}
                style={{ background: '#10B981', color: '#04121b', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 style={{ width: 12, height: 12 }} />Mark verified</button>
            : <button type="button" disabled={busy} onClick={() => onUpdate(w.id, { verified: false }, 'verification cleared')}
                style={{ background: 'none', color: '#FBBF24', border: '1px solid #FBBF2455', borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: busy ? 'default' : 'pointer' }}>Unverify</button>}
        </div>
      )}
    </div>
  );
}

function Feed({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={card}><h3 style={{ color: 'var(--strag-s0)', fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>{title}</h3>{children}</div>;
}

// ── GAP D — summary visualizations (compact, above the grid, from existing data) ──
const LV_ORDER = ['l4', 'l3', 'l2', 'l1', 'l0'];
const LV_LABEL: Record<string, string> = { l4: 'Proven', l3: 'Built', l2: 'Partial', l1: 'Designed', l0: 'Concept' };
const h3s = { color: 'var(--strag-s0)', fontSize: 13, fontWeight: 700, margin: '0 0 10px' } as const;
function lvKey(l: string | null): string { const k = (l ?? 'l0').toLowerCase(); return LV[k] ? k : 'l0'; }

function StackBar({ counts, total, height = 8 }: { counts: Record<string, number>; total: number; height?: number }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: 4, overflow: 'hidden', background: 'var(--strag-deep)' }}>
      {LV_ORDER.map(k => counts[k] ? <div key={k} title={`${LV_LABEL[k]}: ${counts[k]}`} style={{ width: `${(counts[k] / total) * 100}%`, background: LV[k] }} /> : null)}
    </div>
  );
}

function SummaryStrip({ capabilities, agents }: { capabilities: CapabilityRow[]; agents: { id: string; label: string }[] }) {
  const dist: Record<string, number> = {};
  const trend: Record<string, number> = { degrading: 0, stable: 0, improving: 0 };
  let totalSig = 0;
  for (const c of capabilities) {
    dist[lvKey(c.l_level)] = (dist[lvKey(c.l_level)] ?? 0) + 1;
    totalSig += c.open_signal_count;
    trend[c.trend] = (trend[c.trend] ?? 0) + 1;
  }
  const totalCaps = capabilities.length || 1;
  const hot = [...capabilities].filter(c => c.open_signal_count > 0).sort((a, b) => b.open_signal_count - a.open_signal_count).slice(0, 6);
  const maxHot = hot[0]?.open_signal_count ?? 1;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
      {/* 1 — per-agent health */}
      <div style={card}>
        <h3 style={h3s}>Agent health</h3>
        {agents.map(a => {
          const caps = capabilities.filter(c => c.agent_group === a.label);
          const counts: Record<string, number> = {};
          let sig = 0, broken = 0;
          for (const c of caps) { counts[lvKey(c.l_level)] = (counts[lvKey(c.l_level)] ?? 0) + 1; sig += c.open_signal_count; broken += c.by_severity.broken ?? 0; }
          const health = broken > 0 ? '#EF4444' : sig > 0 ? '#FBBF24' : '#10B981';
          return (
            <div key={a.id} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--strag-s2)' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: health }} />{a.label}</span>
                <span style={{ color: 'var(--strag-s5)' }}>{caps.length} caps · {sig} sig</span>
              </div>
              <StackBar counts={counts} total={caps.length || 1} />
            </div>
          );
        })}
      </div>

      {/* 2 — signal hotspots */}
      <div style={card}>
        <h3 style={h3s}>Signal hotspots</h3>
        {hot.length === 0
          ? <p style={{ color: 'var(--strag-s5)', fontSize: 12, margin: 0 }}>No open signals — quiet across all capabilities.</p>
          : hot.map(c => (
            <div key={c.id} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8 }}>
                <span style={{ color: 'var(--strag-s2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: 'var(--strag-s4)' }}>{c.open_signal_count}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--strag-deep)', marginTop: 2 }}>
                <div style={{ width: `${(c.open_signal_count / maxHot) * 100}%`, height: '100%', borderRadius: 3, background: c.by_severity.broken ? '#EF4444' : '#FBBF24' }} />
              </div>
            </div>
          ))}
      </div>

      {/* 3 — status distribution */}
      <div style={card}>
        <h3 style={h3s}>Status distribution</h3>
        <StackBar counts={dist} total={totalCaps} height={16} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {LV_ORDER.map(k => <span key={k} style={{ fontSize: 10, color: 'var(--strag-s4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LV[k] }} />{LV_LABEL[k]} {dist[k] ?? 0}</span>)}
        </div>
      </div>

      {/* 4 — trend summary */}
      <div style={card}>
        <h3 style={h3s}>Trend</h3>
        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 4 }}>
          {([['degrading', '#EF4444'], ['stable', '#64748b'], ['improving', '#10B981']] as const).map(([k, col]) => (
            <div key={k}><div style={{ fontSize: 22, fontWeight: 700, color: col }}>{trend[k] ?? 0}</div><div style={{ fontSize: 10, color: 'var(--strag-s5)' }}>{k}</div></div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--strag-s5)', margin: '10px 0 0', textAlign: 'center' }}>{totalSig} open signals across {capabilities.length} capabilities</p>
      </div>
    </div>
  );
}
