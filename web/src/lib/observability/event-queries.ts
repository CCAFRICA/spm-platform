/**
 * OB-230 — Event aggregation helpers (pure; no I/O).
 *
 * HALT-1: auth.sessions is not accessible, so "active sessions" (Panel 2) are INFERRED from the
 * user's platform_events stream. This is heuristic by construction and labeled as such in the UI.
 */

import type { TimelineEventDTO, InferredSessionDTO } from './api-types';

const SESSION_IDLE_GAP_MS = 30 * 60 * 1000; // mirrors middleware idle limit — a gap > 30m starts a new session
const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000; // mirrors middleware absolute limit — "active" only within 8h

function pstr(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = payload?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Group a user's events into inferred sessions. A session begins on `auth.login.success`, on the
 * first event, or after an idle gap; it ends on `auth.logout` / `auth.session.expired.*`. Returns
 * most-recent-first.
 */
export function inferSessions(events: TimelineEventDTO[]): InferredSessionDTO[] {
  const chron = [...events].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const sessions: InferredSessionDTO[] = [];
  let lastTs = 0;

  for (const e of chron) {
    const ts = Date.parse(e.createdAt);
    if (!Number.isFinite(ts)) continue;
    const isLogin = e.eventType === 'auth.login.success';
    const current = sessions[sessions.length - 1];
    const gap = current ? ts - lastTs : Infinity;

    if (!current || isLogin || gap > SESSION_IDLE_GAP_MS) {
      sessions.push({
        startedAt: e.createdAt,
        lastSeenAt: e.createdAt,
        endedAt: null,
        active: false,
        ip: pstr(e.payload, 'ip'),
        userAgent: pstr(e.payload, 'user_agent'),
        eventCount: 1,
        mfaStepUp: e.eventType === 'auth.mfa.verify.success',
      });
    } else {
      current.lastSeenAt = e.createdAt;
      current.eventCount += 1;
      if (!current.ip) current.ip = pstr(e.payload, 'ip');
      if (!current.userAgent) current.userAgent = pstr(e.payload, 'user_agent');
      if (e.eventType === 'auth.mfa.verify.success') current.mfaStepUp = true;
    }

    const tail = sessions[sessions.length - 1];
    if (e.eventType === 'auth.logout' || e.eventType.startsWith('auth.session.expired')) {
      tail.endedAt = e.createdAt;
    }
    lastTs = ts;
  }

  const now = Date.now();
  for (const s of sessions) {
    s.active = !s.endedAt && now - Date.parse(s.lastSeenAt) < SESSION_ABSOLUTE_MS;
  }
  return sessions.reverse();
}

export interface UserEventSummary {
  lastEventType: string | null;
  lastEventAt: string | null;
  loginFailures24h: number;
  sessionExpiries24h: number;
  hydrationTimeouts24h: number;
  sessionChurn24h: number;
  permissionDenied24h: number;
  lastUserAgent: string | null;
}

/** Aggregate one actor's last-24h events (events expected DESC). Structural matching, not enumerated. */
export function summarizeEvents(events: TimelineEventDTO[]): UserEventSummary {
  const out: UserEventSummary = {
    lastEventType: events[0]?.eventType ?? null,
    lastEventAt: events[0]?.createdAt ?? null,
    loginFailures24h: 0,
    sessionExpiries24h: 0,
    hydrationTimeouts24h: 0,
    sessionChurn24h: 0,
    permissionDenied24h: 0,
    lastUserAgent: null,
  };
  for (const e of events) {
    const t = e.eventType;
    if (t === 'auth.login.failure') out.loginFailures24h += 1;
    if (t.startsWith('auth.session.expired')) out.sessionExpiries24h += 1;
    if (t === 'auth.shell.hydration_timeout') out.hydrationTimeouts24h += 1;
    if (t === 'platform.user.session_churn') out.sessionChurn24h += 1;
    if (t === 'auth.permission.denied') out.permissionDenied24h += 1;
    if (!out.lastUserAgent) out.lastUserAgent = pstr(e.payload, 'user_agent');
  }
  return out;
}
