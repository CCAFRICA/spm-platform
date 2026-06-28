/**
 * OB-IGF-16 / OB-IGF-030 — server-only client for the VG Vigil API.
 * One-directional: VP reads + submits through VG's API; VP never writes VG's
 * governed substrate. The service token is server-side only (no NEXT_PUBLIC_).
 */

const VIGIL_URL = process.env.VIGIL_DASHBOARD_URL;          // .../api/vigil/dashboard
const VIGIL_TOKEN = process.env.VIGIL_DASHBOARD_TOKEN;
const TIMEOUT_MS = Number(process.env.VIGIL_DASHBOARD_TIMEOUT_MS ?? 10000);

function vgBase(): string | null {
  if (!VIGIL_URL) return null;
  return VIGIL_URL.replace(/\/api\/vigil\/dashboard\/?$/, ''); // origin of the VG app
}

export type Trend = 'improving' | 'stable' | 'degrading';
export interface WorkItem {
  id: string; mc_id?: string | null; title: string; description?: string | null;
  status: string; priority: string; capability_id?: string | null; capability_name?: string | null;
  category?: string | null; type: string; source_signals?: string[]; work_item_ref?: string | null;
  notes?: string | null; created_at?: string; updated_at?: string; resolved_at?: string | null;
}
export interface SignalRow {
  id: string; description: string; capability_id?: string | null; capability_name?: string | null;
  severity?: string | null; source_type: 'person' | 'continuity_agent'; reporter?: string | null;
  status: string; created_at: string;
}
export interface CapabilityRow {
  id: string; name: string; agent: string; agent_group: string; lane: string; l_level: string | null;
  when_complete: string | null;
  open_signal_count: number; by_severity: Record<string, number>; source_types: string[];
  priority: number; trend: Trend;
  most_recent_signal: string | null; most_recent_reporter: string | null; most_recent_at: string | null;
  open_work_count: number; work_by_status: Record<string, number>;
  r1_criteria_ids: string[]; work_items: WorkItem[]; signals: SignalRow[];
}
export interface R1Criterion { tier: string; id: string; title: string; status: string; status_label: string; detail: string }
export interface Watcher { last_run_at: string | null; mode: string | null; checks_run: number; anomalies: number; passed: number; health: 'green' | 'amber' | 'red'; next_scheduled_hint: string }
export interface VigilDashboard {
  generated_at: string; trend_window_hours: number;
  agents: { id: string; label: string }[];
  capabilities: CapabilityRow[]; recent_signals: SignalRow[]; recent_work_items: WorkItem[];
  r1_criteria: R1Criterion[]; watcher: Watcher;
}
export type VigilFetchResult =
  | { ok: true; data: VigilDashboard }
  | { ok: false; error: string; reason: 'not_configured' | 'unreachable' | 'upstream_error' };

export async function fetchVigilDashboard(): Promise<VigilFetchResult> {
  if (!VIGIL_URL || !VIGIL_TOKEN) return { ok: false, error: 'VIGIL_DASHBOARD_URL / VIGIL_DASHBOARD_TOKEN not configured', reason: 'not_configured' };
  try {
    const res = await fetch(VIGIL_URL, { headers: { Authorization: `Bearer ${VIGIL_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, error: `governance service HTTP ${res.status}`, reason: 'upstream_error' };
    return { ok: true, data: (await res.json()) as VigilDashboard };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed', reason: 'unreachable' };
  }
}

async function vgPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = vgBase();
  if (!base || !VIGIL_TOKEN) return { ok: false, status: 503, data: { error: 'not_configured' } };
  try {
    const res = await fetch(base + path, {
      method: 'POST', headers: { Authorization: `Bearer ${VIGIL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch (err) {
    return { ok: false, status: 502, data: { error: err instanceof Error ? err.message : 'fetch failed' } };
  }
}

/** Submit a person signal (the tab's submission form). */
export function submitSignal(description: string, reporter?: string) {
  return vgPost('/api/vigil/report', { description, reporter });
}
/** Promote a signal to a work item. */
export function promoteSignal(signalId: string) {
  return vgPost('/api/vigil/work-items/promote', { signal_id: signalId });
}
