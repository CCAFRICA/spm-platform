// OB-235 P-EXP — cross-tenant EXPRESSION-BINDING inheritance (the guarded layer; R2). HF-337 built the
// SAME-tenant read-back (recognize once, read forever). This is the (B)-layer cross-tenant flywheel: a
// FRESH tenant whose comprehension fingerprint matches an ESTABLISHED binding inherits it at cold-start —
// AS A DISCOUNTED, VERIFIED PRIOR, never an assertion.
//
// THE "RECOGNIZED, NOT RECONCILED" GUARD (load-bearing, R2). A binding is an LLM JUDGEMENT made for the
// DONOR tenant. Structural-fingerprint similarity is NOT semantic identity (HF-337's fingerprint hashes the
// field-NAME set; two tenants sharing a name set can still mean different things — the Korean-Test risk, and
// the plain different-dataset risk). So before adopting an inherited binding we VERIFY: does the inherited
// field's characterization IN THE RECEIVING TENANT actually satisfy the surface's purpose? PASS → use it as
// a ×0.6 discounted prior, skipping the cold LLM (the expression-layer Progressive-Performance win). FAIL →
// DISCARD the prior and fall through to the receiving tenant's OWN LLM recognition (its judgement overrides).
//
// NO REGISTRY (Korean Test). Inheritance keys STRICTLY on (structural_fingerprint_hash, surface_id) with
// tenant_id DROPPED (HF-337's cross-tenant index) — never an intent/role/property vocabulary. The verify is
// a language-agnostic lexical-overlap measure (token-set Jaccard ∪ char-trigram Jaccard) between two
// FREE-FORM texts — it carries NO fixed token list and NEVER substring-matches a domain dictionary (C3). It
// is CONSERVATIVE: low/zero overlap (incl. a cross-language pair the purpose cannot verify) → FAIL → the LLM
// runs, which is never wrong — only the performance win is forgone. A confidently-wrong inherited binding is
// the failure this prevents.

import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const INHERITANCE_DISCOUNT = 0.6; // DD-5 cold-start prior discount (Decision 64 v2 / OB-235 §1)
export const VERIFY_THRESHOLD = 0.12;    // min purpose↔characterization lexical overlap to adopt a prior

export interface InheritedField { field_name: string; display_label: string | null; confidence: number }

export interface InheritableBinding {
  donorTenantId: string;   // provenance/logging only — NEVER used as a match key (cross-tenant is name-blind)
  fingerprint: string;
  surfaceId: string;
  purposeText: string;
  resolvedFields: InheritedField[];
  confidence: number;
}

// ── language-agnostic text similarity (no fixed vocabulary; works on any script) ─────────────────────────
// Tokenize by splitting on ASCII separators only — every non-ASCII letter (Hangul, CJK, accented Latin, …)
// is preserved as token content, so the measure carries NO script/language assumption (Korean Test). We
// avoid \p{L}/u and for..of over Sets so the module compiles under the repo's default tsc target.
const SEPARATORS = /[^0-9a-z\u0080-\uffff]+/; // keep ascii alphanumerics + ALL non-ASCII chars; split the rest
function tokens(s: string): Set<string> {
  return new Set((s || '').toLowerCase().normalize('NFKC').split(SEPARATORS).filter((t) => t.length >= 2));
}
function trigrams(s: string): Set<string> {
  const t = (s || '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
  const g = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3));
  return g;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}
/** Structural lexical similarity ∈ [0,1] between two free-form texts: the max of word-token Jaccard and
 *  char-trigram Jaccard (trigrams catch morphological / word-order variation word-tokens miss). No fixed
 *  token list — language-agnostic (Korean Test). */
export function purposeCharacterizationSimilarity(a: string, b: string): number {
  return Math.max(jaccard(tokens(a), tokens(b)), jaccard(trigrams(a), trigrams(b)));
}

/**
 * Find a cross-tenant established binding for this comprehension fingerprint + surface, tenant_id DROPPED.
 * Excludes the receiving tenant's own rows; requires a non-empty resolved_fields (an actual recognition,
 * not a cached unresolved); picks the most-confident donor. Returns null when no cross-tenant prior exists.
 */
export async function findCrossTenantPrior(
  sb: SupabaseClient,
  receivingTenantId: string,
  fingerprint: string,
  surfaceId: string,
): Promise<InheritableBinding | null> {
  const { data } = await sb.from('surface_bindings')
    .select('tenant_id, structural_fingerprint_hash, surface_id, purpose_text, resolved_fields, confidence')
    .eq('structural_fingerprint_hash', fingerprint)
    .eq('surface_id', surfaceId)
    .neq('tenant_id', receivingTenantId)               // tenant_id DROPPED as a positive key; self excluded
    .order('confidence', { ascending: false });
  for (const row of (data ?? []) as any[]) {
    const fields = (row.resolved_fields ?? []) as InheritedField[];
    if (fields.length === 0) continue;                  // a cached unresolved is not inheritable
    return {
      donorTenantId: row.tenant_id,
      fingerprint: row.structural_fingerprint_hash,
      surfaceId: row.surface_id,
      purposeText: row.purpose_text ?? '',
      resolvedFields: fields,
      confidence: typeof row.confidence === 'number' ? row.confidence : 0,
    };
  }
  return null;
}

export interface VerificationOutcome {
  verified: boolean;
  score: number;                 // max purpose↔characterization similarity over the inherited fields
  field: string | null;          // the best-matching inherited field (present in receiving comprehension)
}

/**
 * VERIFY the inherited prior against the RECEIVING tenant's own comprehension (the load-bearing guard).
 * For each inherited resolved field that exists in the receiving comprehension, score the structural
 * similarity between the binding's purpose and the receiving tenant's characterization of that field; the
 * prior is verified iff the best score ≥ VERIFY_THRESHOLD. Fail → caller discards the prior and runs its
 * own LLM recognition.
 *
 * @param receivingComprehension field_name → the receiving tenant's combined free-form comprehension text.
 */
export function verifyInheritedBinding(
  prior: InheritableBinding,
  receivingComprehension: Map<string, string>,
): VerificationOutcome {
  let best = 0;
  let bestField: string | null = null;
  for (const f of prior.resolvedFields) {
    const charText = receivingComprehension.get(f.field_name);
    if (!charText) continue;                            // field not comprehended by the receiver — skip
    const s = purposeCharacterizationSimilarity(prior.purposeText, charText);
    if (s > best) { best = s; bestField = f.field_name; }
  }
  return { verified: best >= VERIFY_THRESHOLD, score: best, field: bestField };
}

/** Discount an inherited field's confidence to a cold-start prior (×0.6), clamped to [0,1] and rounded. */
export function discountConfidence(c: number): number {
  return Math.round(Math.max(0, Math.min(1, c * INHERITANCE_DISCOUNT)) * 10000) / 10000;
}
