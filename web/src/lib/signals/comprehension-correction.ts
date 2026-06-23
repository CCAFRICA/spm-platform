// OB-233 (DS-030) Obj 9 item 5 — comprehension-correction signal capture on the CANONICAL signal
// surface (classification_signals; DS-027 DI-6 / DS-021 G7: no private telemetry table). When a human
// says "this characterization is wrong" about a comprehended field, that judgement is recorded as a
// FREE-FORM signal carrying only tenant_id + field_name + the correction text. signal_value is
// OPEN-VOCABULARY (AP-26 / C0): the correction is whatever the human wrote — it is NEVER validated
// against a fixed list, and no set-membership check rejects it. KOREAN TEST: zero domain vocabulary;
// the signal carries structural references (field name + free-form correction), never a domain string.
//
// SCOPE: capture only. Acting on the signal (re-comprehension, re-binding) is Out of Scope — this is
// the write path. Modelled exactly on web/src/lib/signals/ui-signal.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ComprehensionCorrectionParams {
  tenantId: string;            // classification_signals.tenant_id is NOT NULL — corrections are tenant-scoped
  fieldName: string;           // the source field whose characterization is being corrected (structural)
  correction: string;          // free-form human correction text (open-vocabulary)
  actorId?: string | null;     // who made the correction
}

export async function recordComprehensionCorrection(
  sb: SupabaseClient,
  p: ComprehensionCorrectionParams,
): Promise<boolean> {
  // structural-property check only (non-empty) — NO set-membership gate (open-vocabulary)
  if (!p.tenantId || !p.fieldName?.trim() || !p.correction?.trim()) return false;
  try {
    const { error } = await sb.from('classification_signals').insert({
      tenant_id: p.tenantId,
      entity_id: null,
      signal_type: 'comprehension_correction',
      signal_value: { field_name: p.fieldName, correction: p.correction },
      source: 'comprehension-correction',
      context: { actorId: p.actorId ?? null },
    });
    if (error) { console.warn('[OB-233] comprehension correction write failed:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[OB-233] comprehension correction threw:', e instanceof Error ? e.message : e);
    return false;
  }
}
