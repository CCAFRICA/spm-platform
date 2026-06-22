'use client';

// OB-230 Objective 2B Panel 3 — the Event Timeline. The signature diagnostic instrument.
// Reverse-chronological platform_events for the user. Visual treatment is derived STRUCTURALLY from
// each event_type's prefix/suffix (Korean Test — never an enumerated literal list). Anomalies (rapid
// re-login, hydration timeout, mfa failure, permission denied, session churn) are highlighted, never
// hidden. Time gaps are shown. Renders incrementally (no DOM-dump) for 500+ events.

import React, { useMemo, useState } from 'react';
import type { TimelineEventDTO } from '@/lib/observability/api-types';
import { classifyEventType, humanizeEventType, KIND_ACCENT, SEVERITY_COLOR, eventKind } from '@/lib/observability/event-classification';
import { parseUserAgent } from '@/lib/observability/ua-parser';
import { C, Panel, Pill, absTime, hexToRgba, relativeTime } from './ui';

const RAPID_RELOGIN_MS = 2 * 60 * 1000;
const GAP_THRESHOLD_MS = 10 * 60 * 1000;
const CHUNK = 50;

interface Anomaly { reason: string; }

function computeAnomalies(events: TimelineEventDTO[]): Map<string, Anomaly> {
  const out = new Map<string, Anomaly>();
  // Per-event structural anomalies.
  for (const e of events) {
    const t = e.eventType;
    if (t === 'auth.shell.hydration_timeout') out.set(e.id, { reason: 'Hydration timed out — the app shell failed to load' });
    else if (t === 'auth.mfa.verify.failure') out.set(e.id, { reason: 'MFA verification failed' });
    else if (t === 'auth.permission.denied') out.set(e.id, { reason: 'Permission denied' });
    else if (t === 'platform.user.session_churn') out.set(e.id, { reason: 'Rapid session creation — user struggling to log in' });
    else if (t.startsWith('client.error')) out.set(e.id, { reason: 'Client-side error the user encountered' });
  }
  // Rapid re-login: ≥2 successful logins within 2 minutes → user was struggling.
  const logins = events.filter((e) => e.eventType === 'auth.login.success').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (let i = 1; i < logins.length; i++) {
    if (Date.parse(logins[i].createdAt) - Date.parse(logins[i - 1].createdAt) < RAPID_RELOGIN_MS) {
      out.set(logins[i].id, { reason: 'Rapid re-login (<2m apart) — user was struggling' });
      out.set(logins[i - 1].id, { reason: 'Rapid re-login (<2m apart) — user was struggling' });
    }
  }
  return out;
}

function payloadVal(p: Record<string, unknown>, key: string): string | null {
  const v = p?.[key];
  if (v == null) return null;
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null;
}

export function EventTimeline({ events }: { events: TimelineEventDTO[] }) {
  const [kindFilter, setKindFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(CHUNK);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const anomalies = useMemo(() => computeAnomalies(events), [events]);
  const kinds = useMemo(() => Array.from(new Set(events.map((e) => eventKind(e.eventType)))).sort(), [events]);

  const filtered = useMemo(
    () => (kindFilter ? events.filter((e) => eventKind(e.eventType) === kindFilter) : events),
    [events, kindFilter],
  );

  const shown = filtered.slice(0, visibleCount);
  const selectStyle: React.CSSProperties = { background: C.deep, color: C.ink2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12 };

  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ color: C.ink0, fontSize: 15, fontWeight: 600 }}>Event Timeline</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.ink4 }}>{filtered.length} event{filtered.length === 1 ? '' : 's'}</span>
          <select value={kindFilter} onChange={(e) => { setKindFilter(e.target.value); setVisibleCount(CHUNK); }} style={selectStyle}>
            <option value="">All types</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.ink4, fontSize: 13 }}>No events for this user.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((e, i) => {
            const cls = classifyEventType(e.eventType);
            const sev = SEVERITY_COLOR[cls.severity];
            const accent = KIND_ACCENT[cls.kind];
            const anomaly = anomalies.get(e.id);
            const ip = payloadVal(e.payload, 'ip');
            const ua = payloadVal(e.payload, 'user_agent');
            const pathname = payloadVal(e.payload, 'pathname');
            const errMsg = payloadVal(e.payload, 'error') || payloadVal(e.payload, 'message') || payloadVal(e.payload, 'reason');
            const device = ua ? parseUserAgent(ua).label : null;
            const isOpen = expanded.has(e.id);

            // gap to the previous (more-recent) shown event
            const prev = shown[i - 1];
            const gapMs = prev ? Date.parse(prev.createdAt) - Date.parse(e.createdAt) : 0;
            const showGap = gapMs >= GAP_THRESHOLD_MS;

            return (
              <React.Fragment key={e.id}>
                {showGap && (
                  <div style={{ paddingLeft: 28, color: C.ink4, fontSize: 11, padding: '4px 0 4px 28px', fontStyle: 'italic' }}>
                    ⋯ {relativeTime(e.createdAt).replace(' ago', '')} gap
                  </div>
                )}
                <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderLeft: `2px solid ${hexToRgba(accent, 0.4)}`, paddingLeft: 16, marginLeft: 6, background: anomaly ? hexToRgba(SEVERITY_COLOR.danger, 0.06) : 'transparent' }}>
                  <div style={{ width: 10, display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: sev, boxShadow: anomaly ? `0 0 0 3px ${hexToRgba(sev, 0.25)}` : 'none', flexShrink: 0 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: sev, fontWeight: 600, fontSize: 13 }}>{humanizeEventType(e.eventType)}</span>
                      <span style={{ color: C.ink4, fontSize: 11, fontFamily: 'var(--font-dm-mono), monospace' }}>{e.eventType}</span>
                      {anomaly && <Pill color={SEVERITY_COLOR.danger}>⚠ anomaly</Pill>}
                    </div>
                    <div style={{ color: C.ink4, fontSize: 11, marginTop: 2 }} title={absTime(e.createdAt)}>
                      {absTime(e.createdAt)} · {relativeTime(e.createdAt)}
                    </div>
                    {anomaly && <div style={{ color: SEVERITY_COLOR.danger, fontSize: 11, marginTop: 3 }}>{anomaly.reason}</div>}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: C.ink2 }}>
                      {device && <span title={ua ?? ''}>🖥 {device}</span>}
                      {ip && <span>🌐 {ip}</span>}
                      {pathname && <span style={{ fontFamily: 'var(--font-dm-mono), monospace' }}>↳ {pathname}</span>}
                      {errMsg && <span style={{ color: SEVERITY_COLOR.danger }}>✖ {errMsg.slice(0, 120)}</span>}
                    </div>
                    {Object.keys(e.payload || {}).length > 0 && (
                      <>
                        <button onClick={() => toggle(e.id)} style={{ marginTop: 6, background: 'transparent', border: 'none', color: C.indigo, fontSize: 11, cursor: 'pointer', padding: 0 }}>
                          {isOpen ? '▾ hide payload' : '▸ payload'}
                        </button>
                        {isOpen && (
                          <pre style={{ marginTop: 6, padding: 10, background: C.deep, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, color: C.ink2, overflowX: 'auto', maxHeight: 260, fontFamily: 'var(--font-dm-mono), monospace' }}>
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {visibleCount < filtered.length && (
        <button
          onClick={() => setVisibleCount((c) => c + CHUNK)}
          style={{ marginTop: 12, width: '100%', padding: '8px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.ink2, fontSize: 12, cursor: 'pointer' }}
        >
          Show {Math.min(CHUNK, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
        </button>
      )}
    </Panel>
  );
}
