// OB-232 Enforcement Point 1 — UI interaction signal capture on the CANONICAL signal surface.
// Routes interactions to classification_signals (DS-027 DI-6 / DS-021 G7: no private telemetry table).
// KOREAN TEST: signal_type is a STRUCTURAL interaction class (ui.selection/dwell/drill/dismissal); the
// context carries structural references (surface id, entity_id, metric key) — never a domain string.

import type { SupabaseClient } from '@supabase/supabase-js';

export const UI_SIGNAL_TYPES = ['selection', 'dwell', 'drill', 'dismissal'] as const;
export type UiSignalType = (typeof UI_SIGNAL_TYPES)[number];

export interface UiSignalParams {
  tenantId: string;            // classification_signals.tenant_id is NOT NULL — UI signals are tenant-scoped
  signalType: UiSignalType;
  surface: string;             // structural surface id, e.g. 'financial.network', 'users.console'
  entityId?: string | null;    // what was acted upon
  metricKey?: string | null;   // which metric (from data), when relevant
  sessionId?: string | null;
  actorId?: string | null;
}

export async function recordUiSignal(sb: SupabaseClient, p: UiSignalParams): Promise<boolean> {
  if (!p.tenantId) return false;
  try {
    const { error } = await sb.from('classification_signals').insert({
      tenant_id: p.tenantId,
      entity_id: p.entityId ?? null,
      signal_type: `ui.${p.signalType}`, // ui.* namespace on the canonical surface
      signal_value: { interaction: p.signalType, metricKey: p.metricKey ?? null },
      source: 'ui',
      context: { surface: p.surface, sessionId: p.sessionId ?? null, actorId: p.actorId ?? null },
    });
    if (error) { console.warn('[OB-232] ui signal write failed:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[OB-232] ui signal threw:', e instanceof Error ? e.message : e);
    return false;
  }
}
