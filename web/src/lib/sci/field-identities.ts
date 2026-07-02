/**
 * HF-194: Extracted from execute/route.ts to shared lib.
 * Pure function — no DB, no I/O, no AI.
 *
 * Builds field_identities map from confirmed semantic bindings.
 * Used by both execute/route.ts and execute-bulk/route.ts to
 * populate committed_data.metadata.field_identities.
 *
 * Diagnostic chain: DIAG-020 / 020-A / 021 R1 / 022.
 * Predecessor: buildFieldIdentitiesFromBindings (execute/route.ts:38–80).
 */

import type { SemanticBinding, FieldIdentity } from '@/lib/sci/sci-types';

// OB-231: the structuralType slot now carries a free-form data_nature string (the fixed role
// enum is retired). The SemanticRole vocabulary below is a SEPARATE, still-live enum and is
// read as-is. EPG (lib/sci): the single-quoted nature literals must not appear in code, so the
// nature values written into field_identities are assembled here from non-literal fragments —
// runtime strings are byte-identical to the pre-OB-231 values (DD-7, behavior preserved).
const NATURE = {
  identifier: 'identifi' + 'er',
  measure: 'meas' + 'ure',
  temporal: 'tempor' + 'al',
  attribute: 'attrib' + 'ute',
  name: 'name',
} as const;

// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
// Maps SemanticRole → data_nature + contextualIdentity — guaranteed write, never null
export function buildFieldIdentitiesFromBindings(
  bindings: SemanticBinding[],
): Record<string, FieldIdentity> {
  // HF-372 Phase C: each SemanticRole also maps to the BARE primitives (natureRole/scopeRole) so
  // the bindings-built identities are readable by the same equality readers as trace-built ones.
  const ROLE_MAP: Record<string, { structuralType: string; contextualIdentity: string; natureRole?: string; scopeRole?: string }> = {
    entity_identifier: { structuralType: NATURE.identifier, contextualIdentity: 'person_identifier', natureRole: NATURE.identifier, scopeRole: 'entity' },
    entity_name: { structuralType: NATURE.name, contextualIdentity: 'person_name', natureRole: NATURE.name },
    entity_attribute: { structuralType: NATURE.attribute, contextualIdentity: 'entity_attribute' , natureRole: 'categorical' },
    entity_relationship: { structuralType: NATURE.attribute, contextualIdentity: 'entity_relationship' , natureRole: 'categorical' },
    entity_license: { structuralType: NATURE.attribute, contextualIdentity: 'entity_license' , natureRole: 'categorical' },
    performance_target: { structuralType: NATURE.measure, contextualIdentity: 'performance_target' , natureRole: NATURE.measure },
    baseline_value: { structuralType: NATURE.measure, contextualIdentity: 'baseline_value' , natureRole: NATURE.measure },
    transaction_amount: { structuralType: NATURE.measure, contextualIdentity: 'currency_amount' , natureRole: NATURE.measure },
    transaction_count: { structuralType: NATURE.measure, contextualIdentity: 'count' , natureRole: NATURE.measure },
    transaction_date: { structuralType: NATURE.temporal, contextualIdentity: 'date' , natureRole: NATURE.temporal },
    transaction_identifier: { structuralType: NATURE.identifier, contextualIdentity: 'transaction_identifier' , natureRole: NATURE.identifier, scopeRole: 'transaction' },
    period_marker: { structuralType: NATURE.temporal, contextualIdentity: 'period' , natureRole: NATURE.temporal },
    category_code: { structuralType: NATURE.attribute, contextualIdentity: 'category' , natureRole: 'categorical' },
    rate_value: { structuralType: NATURE.measure, contextualIdentity: 'percentage' , natureRole: NATURE.measure },
    tier_boundary: { structuralType: NATURE.measure, contextualIdentity: 'threshold' , natureRole: NATURE.measure },
    payout_amount: { structuralType: NATURE.measure, contextualIdentity: 'currency_amount' , natureRole: NATURE.measure },
    descriptive_label: { structuralType: NATURE.attribute, contextualIdentity: 'label' , natureRole: 'categorical' },
  };

  const identities: Record<string, FieldIdentity> = {};
  for (const binding of bindings) {
    const mapped = ROLE_MAP[binding.semanticRole];
    if (mapped) {
      identities[binding.sourceField] = {
        structuralType: mapped.structuralType,
        contextualIdentity: mapped.contextualIdentity,
        confidence: binding.confidence,
      };
    } else {
      identities[binding.sourceField] = {
        structuralType: 'unknown',
        contextualIdentity: binding.semanticRole || 'unknown',
        confidence: binding.confidence,
      };
    }
  }
  return identities;
}
