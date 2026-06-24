// OB-233 (DS-030 §4.4) EP-1 — UI interaction signal capture on the CANONICAL signal surface.
// Routes interactions to classification_signals (DS-027 DI-6 / DS-021 G7: no private telemetry table).
// signal_type is OPEN-VOCABULARY (AP-26 / C0): the caller composes a FREE-FORM structural
// characterization of whatever interaction occurred. It is NEVER validated against a fixed list, and
// no set-membership check rejects a signal — a brand-new kind of interaction flows with no code
// change. The 'ui.' prefix is a writer-authored namespace, not a registry. KOREAN TEST: the context
// carries structural references (surface id, entity_id, metric key) — never a domain string.

import type { SupabaseClient } from '@supabase/supabase-js';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer'; // OB-235 P1: one canonical surface

export interface UiSignalParams {
  tenantId: string;            // classification_signals.tenant_id is NOT NULL — UI signals are tenant-scoped
  signalType: string;          // free-form structural interaction characterization (open-vocabulary)
  surface: string;             // structural surface id, e.g. 'financial.network', 'users.console'
  entityId?: string | null;    // what was acted upon
  metricKey?: string | null;   // which metric (from data), when relevant
  sessionId?: string | null;
  actorId?: string | null;
}

export async function recordUiSignal(sb: SupabaseClient, p: UiSignalParams): Promise<boolean> {
  if (!p.tenantId || !p.signalType?.trim()) return false; // structural-property check only (non-empty)
  try {
    await writeSignalWithClient({
      tenantId: p.tenantId,
      entityId: p.entityId ?? null,
      signalType: `ui.${p.signalType}`, // ui.* namespace on the one canonical surface (open-vocabulary)
      signalValue: { interaction: p.signalType, metricKey: p.metricKey ?? null },
      source: 'ui',
      context: { surface: p.surface, sessionId: p.sessionId ?? null, actorId: p.actorId ?? null },
    }, sb);
    return true;
  } catch (e) {
    console.warn('[OB-233] ui signal threw:', e instanceof Error ? e.message : e);
    return false;
  }
}
