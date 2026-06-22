/**
 * OB-230 — Structural event classification (Korean Test / AP-25).
 *
 * The event timeline renders WHATEVER event_type values exist in platform_events. Visual treatment
 * (color, icon kind) is derived from the event_type's STRUCTURE — its prefix and outcome suffix —
 * never from an enumerated registry of known literals. A new event_type added by a future HF appears
 * with correct treatment automatically, with zero UI code changes.
 */

export type EventKind =
  | 'auth'
  | 'identity'
  | 'tenant'
  | 'admin'
  | 'client'
  | 'navigation'
  | 'data'
  | 'plan'
  | 'calculation'
  | 'lifecycle'
  | 'user'
  | 'billing'
  | 'agent'
  | 'other';

export type EventSeverity = 'ok' | 'info' | 'warn' | 'danger';

export interface EventClassification {
  kind: EventKind;
  severity: EventSeverity;
}

const KNOWN_KINDS: EventKind[] = [
  'auth', 'identity', 'tenant', 'admin', 'client', 'navigation',
  'data', 'plan', 'calculation', 'lifecycle', 'user', 'billing', 'agent',
];

/** First dot-delimited segment → kind. Unknown prefixes fall to 'other' (still rendered). */
export function eventKind(eventType: string): EventKind {
  const prefix = (eventType.split('.')[0] || '').toLowerCase();
  return (KNOWN_KINDS as string[]).includes(prefix) ? (prefix as EventKind) : 'other';
}

/**
 * Severity from the outcome suffix/segments — structural, not enumerated.
 * - failure / denied / error / timeout / expired / churn / load_failed → danger
 * - reset / loop_break / bookkeeping_reset / ban → warn
 * - success / verify.success / enabled / confirmed → ok
 * - everything else → info
 */
export function eventSeverity(eventType: string): EventSeverity {
  const t = eventType.toLowerCase();
  const has = (needle: string) => t.includes(needle);

  if (has('failure') || has('denied') || has('.error') || has('error.') ||
      has('timeout') || has('expired') || has('churn') || has('load_failed') ||
      has('zero_rows') || has('duplicate_rows') || has('session_absent') || has('query_error')) {
    return 'danger';
  }
  if (has('reset') || has('loop_break') || has('.ban') || has('cleared') || has('anomaly') || has('outlier')) {
    return 'warn';
  }
  if (has('success') || has('.enabled') || has('confirmed') || has('completed') || has('.entered') || has('unban')) {
    return 'ok';
  }
  return 'info';
}

export function classifyEventType(eventType: string): EventClassification {
  return { kind: eventKind(eventType), severity: eventSeverity(eventType) };
}

/** Color tokens for the Observatory --strag- vocabulary. Severity drives color; kind drives accent. */
export const SEVERITY_COLOR: Record<EventSeverity, string> = {
  ok: '#10B981',
  info: '#60A5FA',
  warn: '#F59E0B',
  danger: '#EF4444',
};

export const KIND_ACCENT: Record<EventKind, string> = {
  auth: '#60A5FA',
  identity: '#60A5FA',
  tenant: '#A78BFA',
  navigation: '#A78BFA',
  admin: '#E8A838',
  client: '#EF4444',
  data: '#7B7FD4',
  plan: '#7B7FD4',
  calculation: '#7B7FD4',
  lifecycle: '#10B981',
  user: '#7B7FD4',
  billing: '#10B981',
  agent: '#A78BFA',
  other: '#94a3b8',
};

/** Human-readable label from a dotted event_type: 'auth.login.success' → 'Login success'. */
export function humanizeEventType(eventType: string): string {
  const segs = eventType.split('.');
  const rest = segs.slice(1).join(' ').replace(/[._]/g, ' ').trim();
  const text = rest || eventType.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
