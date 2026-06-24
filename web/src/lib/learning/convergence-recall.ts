// OB-235 P7 — convergence as a signal CONSUMER (TMR-C93: "convergence writes but never reads"). Before
// convergence makes its independent LLM binding call (recognizeBindingsViaAI), it RECALLS prior Level-2
// comprehension for the candidate columns from the CANONICAL surface:
//   - comprehension_artifacts — the per-field comprehension OB-233 generates every import (the Level-2
//     comprehension CONTENT: characterization / data_nature / identifies / aggregation_behavior).
//   - classification_signals (signal_type='comprehension_correction') — human corrections recorded on the
//     canonical write surface (OB-233 §Obj9-5). A correction OVERLAYS the original characterization.
// The recalled comprehension enriches each candidate's identity the binding LLM reads, so the LLM consults
// learned comprehension instead of re-deriving field meaning with its own independent call (write→recall,
// the pattern the SCI pipeline already demonstrates). This is the read-path; the live import-route wiring
// is P9.
//
// KOREAN TEST: recall keys on the column NAME (a structural reference) — never a field-name dictionary or a
// permitted-value set. The comprehension text is passed THROUGH to the LLM verbatim (any language); we do
// NOT regex English behavior-cues onto it (that would gate non-English comprehension). NO REGISTRY — no
// allowed-value gate anywhere; absence of comprehension is a graceful empty map, never an error.

import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PriorComprehension {
  column: string;
  characterization: string;
  dataNature: string | null;
  identifies: string | null;
  aggregationBehavior: string | null;
  correction: string | null;   // a human comprehension_correction from the canonical surface, if any
}

/** Recall prior Level-2 comprehension for a set of candidate columns from the canonical surface. Returns a
 *  map keyed by column name. Columns with no comprehension are simply absent (graceful — never an error). */
export async function recallComprehensionForColumns(
  sb: SupabaseClient,
  tenantId: string,
  columnNames: string[],
): Promise<Map<string, PriorComprehension>> {
  const out = new Map<string, PriorComprehension>();
  const names = Array.from(new Set(columnNames.filter((n) => typeof n === 'string' && n.trim())));
  if (!tenantId || names.length === 0) return out;

  // (1) the comprehension CONTENT (comprehension_artifacts) — the OB-233 Level-2 comprehension store.
  const { data: arts } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, data_nature, identifies, aggregation_behavior')
    .eq('tenant_id', tenantId).in('field_name', names);
  for (const r of (arts ?? []) as any[]) {
    out.set(r.field_name, {
      column: r.field_name,
      characterization: r.characterization,
      dataNature: r.data_nature ?? null,
      identifies: r.identifies ?? null,
      aggregationBehavior: r.aggregation_behavior ?? null,
      correction: null,
    });
  }

  // (2) human corrections on the CANONICAL surface (classification_signals). Each correction overlays the
  // characterization for its field — the read-path that closes the comprehension→convergence loop. Latest
  // correction wins (corrections accumulate; the most recent is operative).
  const { data: sigs } = await sb.from('classification_signals')
    .select('signal_value, created_at')
    .eq('tenant_id', tenantId).eq('signal_type', 'comprehension_correction')
    .order('created_at', { ascending: true });
  for (const s of (sigs ?? []) as any[]) {
    const sv = (s.signal_value ?? {}) as Record<string, unknown>;
    const field = typeof sv.field_name === 'string' ? sv.field_name : null;
    const correction = typeof sv.correction === 'string' ? sv.correction : null;
    if (!field || !correction || !names.includes(field)) continue;
    const existing = out.get(field);
    if (existing) existing.correction = correction;
    else out.set(field, { column: field, characterization: correction, dataNature: null, identifies: null, aggregationBehavior: null, correction });
  }

  return out;
}

/** Build the candidate-identity line the binding LLM reads, ENRICHED with recalled comprehension. Pure +
 *  exported so the consumption is unit-provable without the LLM. When no prior comprehension exists the line
 *  is byte-identical to the un-enriched form (cold == pre-P7 behaviour). The comprehension text is appended
 *  verbatim (Korean Test — we never interpret it here; the LLM does). */
export function enrichCandidateIdentity(
  base: string,                       // the existing `"col" (type=…, identity=…) [range]` line
  prior: PriorComprehension | undefined,
): string {
  if (!prior) return base;
  const parts: string[] = [];
  if (prior.characterization) parts.push(`learned: ${prior.characterization}`);
  if (prior.aggregationBehavior) parts.push(`aggregation: ${prior.aggregationBehavior}`);
  if (prior.correction) parts.push(`human correction: ${prior.correction}`);
  return parts.length ? `${base}\n        (${parts.join('; ')})` : base;
}
