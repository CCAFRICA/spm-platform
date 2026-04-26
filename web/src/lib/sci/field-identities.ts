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

import type { SemanticBinding, ColumnRole, FieldIdentity } from '@/lib/sci/sci-types';

// HF-110: Build field_identities from confirmedBindings when HC trace is unavailable (DS-009 1.3)
// Maps SemanticRole → ColumnRole + contextualIdentity — guaranteed write, never null
export function buildFieldIdentitiesFromBindings(
  bindings: SemanticBinding[],
): Record<string, FieldIdentity> {
  const ROLE_MAP: Record<string, { structuralType: ColumnRole; contextualIdentity: string }> = {
    entity_identifier: { structuralType: 'identifier', contextualIdentity: 'person_identifier' },
    entity_name: { structuralType: 'name', contextualIdentity: 'person_name' },
    entity_attribute: { structuralType: 'attribute', contextualIdentity: 'entity_attribute' },
    entity_relationship: { structuralType: 'attribute', contextualIdentity: 'entity_relationship' },
    entity_license: { structuralType: 'attribute', contextualIdentity: 'entity_license' },
    performance_target: { structuralType: 'measure', contextualIdentity: 'performance_target' },
    baseline_value: { structuralType: 'measure', contextualIdentity: 'baseline_value' },
    transaction_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    transaction_count: { structuralType: 'measure', contextualIdentity: 'count' },
    transaction_date: { structuralType: 'temporal', contextualIdentity: 'date' },
    transaction_identifier: { structuralType: 'identifier', contextualIdentity: 'transaction_identifier' },
    period_marker: { structuralType: 'temporal', contextualIdentity: 'period' },
    category_code: { structuralType: 'attribute', contextualIdentity: 'category' },
    rate_value: { structuralType: 'measure', contextualIdentity: 'percentage' },
    tier_boundary: { structuralType: 'measure', contextualIdentity: 'threshold' },
    payout_amount: { structuralType: 'measure', contextualIdentity: 'currency_amount' },
    descriptive_label: { structuralType: 'attribute', contextualIdentity: 'label' },
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
