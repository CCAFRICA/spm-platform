/**
 * HF-373 Phase B (D2) — variant selection from the entity's materialized,
 * model-recognized attributes (Decision 158: the model recognized the role at
 * import; deterministic equality selects here).
 *
 * The HF-119 row-value token scavenger this replaces tokenized committed row
 * string values (including _sheetName and external-ID fragments), and its
 * discriminant logic structurally starved any variant whose name nests inside
 * another's ("Ejecutivo" is a token-subset of "Ejecutivo Senior", so that
 * variant's discriminant set was EMPTY — 72/85 entities excluded on 2026-07-02).
 *
 * Selection contract: a variant is selected when a resolved attribute VALUE
 * equals the variant's identity (variantName / variantId / description) under
 * accent- and case-insensitive FULL-STRING equality. Equality — never token
 * subsets, never prose scans (Korean Test: normalization is script-neutral;
 * identity strings come from the recognized plan structure, not a developer
 * list). No match, or an ambiguous match, is a loud named exception the caller
 * surfaces (C2) — never a silent default.
 */

export interface VariantIdentitySource {
  variantName?: unknown;
  variantId?: unknown;
  description?: unknown;
}

export type VariantSelection =
  | { kind: 'selected'; index: number; attrIdentities: string[] }
  | { kind: 'no_match'; matchedIndices: number[]; attrIdentities: string[] }
  | { kind: 'ambiguous'; matchedIndices: number[]; attrIdentities: string[] };

/** Accent- and case-insensitive full-string normalization (script-neutral). */
export function normalizeIdentity(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** One normalized identity set per variant, from its recognized plan identity. */
export function buildVariantIdentitySets(variants: VariantIdentitySource[]): Array<Set<string>> {
  return variants.map(v => {
    const idents = new Set<string>();
    for (const raw of [v.variantName, v.variantId, v.description]) {
      if (typeof raw === 'string' && raw.trim().length > 0) idents.add(normalizeIdentity(raw));
    }
    return idents;
  });
}

/**
 * Resolve an entity's materialized attributes as-of a date: temporal_attributes
 * (latest effective_from ≤ asOf, not expired), with the metadata.role backstop.
 * This is the exact resolution the calc route materializes into
 * period_entity_state.resolved_attributes.
 */
export function resolveMaterializedAttributes(
  temporalAttributes: Array<{ key: string; value: unknown; effective_from: string; effective_to: string | null }> | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  asOfDate: string,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const attrs = temporalAttributes ?? [];
  const sorted = [...attrs].sort((a, b) => (b.effective_from || '').localeCompare(a.effective_from || ''));
  for (const attr of sorted) {
    if (attr.key in resolved) continue;
    if (attr.effective_from && attr.effective_from > asOfDate) continue;
    if (attr.effective_to && attr.effective_to < asOfDate) continue;
    resolved[attr.key] = attr.value;
  }
  const meta = metadata ?? {};
  if (meta.role && !resolved['role']) resolved['role'] = meta.role;
  return resolved;
}

/** Select the variant whose identity a resolved attribute value equals. */
export function selectVariantByRecognizedAttributes(
  variantIdentitySets: Array<Set<string>>,
  resolvedAttrs: Record<string, unknown>,
): VariantSelection {
  const attrIdentities = Object.values(resolvedAttrs)
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(normalizeIdentity);
  const matchedIndices: number[] = [];
  for (let vi = 0; vi < variantIdentitySets.length; vi++) {
    if (attrIdentities.some(a => variantIdentitySets[vi].has(a))) matchedIndices.push(vi);
  }
  if (matchedIndices.length === 1) return { kind: 'selected', index: matchedIndices[0], attrIdentities };
  if (matchedIndices.length === 0) return { kind: 'no_match', matchedIndices, attrIdentities };
  return { kind: 'ambiguous', matchedIndices, attrIdentities };
}
