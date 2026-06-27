/**
 * OB-IGF-16 — server-only client for the VG (governance) Vigil dashboard API.
 *
 * One-directional: VP READS from VG; VP never writes to VG. The VG service token
 * is read from process.env here and is sent only in the server-side Authorization
 * header — it never reaches the browser (this module is imported only by the
 * server route handler, and the var has no NEXT_PUBLIC_ prefix). Mirrors the
 * external-fetch-with-secret pattern of src/lib/email/dispatch.ts.
 */

const VIGIL_URL = process.env.VIGIL_DASHBOARD_URL;
const VIGIL_TOKEN = process.env.VIGIL_DASHBOARD_TOKEN;

export type Trend = 'improving' | 'stable' | 'degrading';

export interface CapabilityDashRow {
  id: string;
  name: string;
  agent: string;
  lane: string;
  l_level: string | null;
  open_count: number;
  by_severity: Record<string, number>;
  source_types: string[];
  priority: number;
  trend: Trend;
  most_recent_signal: string | null;
  most_recent_reporter: string | null;
  most_recent_at: string | null;
}

export interface RecentSignal {
  id: string;
  description: string;
  capability_id: string | null;
  capability_name: string | null;
  severity: string | null;
  source_type: 'person' | 'continuity_agent';
  reporter: string | null;
  status: string;
  created_at: string;
}

export interface WatcherHealth {
  last_run_at: string | null;
  mode: string | null;
  checks_run: number;
  anomalies: number;
  passed: number;
  health: 'green' | 'amber' | 'red';
  next_scheduled_hint: string;
}

export interface VigilDashboard {
  generated_at: string;
  trend_window_hours: number;
  capabilities: CapabilityDashRow[];
  recent_signals: RecentSignal[];
  watcher: WatcherHealth;
}

export type VigilFetchResult =
  | { ok: true; data: VigilDashboard }
  | { ok: false; error: string; reason: 'not_configured' | 'unreachable' | 'upstream_error' };

const TIMEOUT_MS = Number(process.env.VIGIL_DASHBOARD_TIMEOUT_MS ?? 10000);

export async function fetchVigilDashboard(): Promise<VigilFetchResult> {
  if (!VIGIL_URL || !VIGIL_TOKEN) {
    return { ok: false, error: 'VIGIL_DASHBOARD_URL / VIGIL_DASHBOARD_TOKEN not configured', reason: 'not_configured' };
  }
  try {
    const res = await fetch(VIGIL_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${VIGIL_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return { ok: false, error: `governance service responded HTTP ${res.status}`, reason: 'upstream_error' };
    }
    const data = (await res.json()) as VigilDashboard;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed', reason: 'unreachable' };
  }
}
