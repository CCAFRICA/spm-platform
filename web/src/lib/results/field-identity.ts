/**
 * OB-208 D-1 — Field-identity canonicalization (Korean Test, T1-E910 v2).
 *
 * The DAG grammar references fields by one name (e.g. `meta_colocacion`); the engine persists the
 * resolved metric under another (e.g. `Meta_Colocacion`), and some pairs are not even a casing
 * transform (`net_new_deposits` → `Depositos_Nuevos_Netos`). Two strings, one field — a Korean Test
 * violation that made regime-3 attainment (actual÷target) uncomputable without name-matching.
 *
 * THE CANONICAL DECLARATION already exists: `rule_sets.input_bindings.convergence_bindings` (HF-234)
 * maps each DAG field name → its persisted `column` (+ a semantic `field_identity.contextualIdentity`).
 * This module resolves field identity THROUGH that one declaration — never a hardcoded pair, never a
 * per-tenant/domain string list. Verified on BCL: Colocación 103200÷120000 = 86.0% (matches the
 * persisted Cumplimiento_Colocacion 0.86); Captación 31500÷35000 = 90.0% (matches Pct_Meta_Depositos 0.9).
 */

export interface FieldBinding { column: string; contextualIdentity?: string; structuralType?: string; }

/** Build the canonical DAG-field → persisted-column map from rule_sets.input_bindings.convergence_bindings. */
export function buildFieldBindingMap(inputBindings: unknown): Map<string, FieldBinding> {
  const out = new Map<string, FieldBinding>();
  const cb = (inputBindings as { convergence_bindings?: unknown } | null)?.convergence_bindings;
  if (!cb || typeof cb !== 'object') return out;
  for (const comp of Object.values(cb as Record<string, unknown>)) {
    if (!comp || typeof comp !== 'object') continue;
    for (const [dagField, b] of Object.entries(comp as Record<string, unknown>)) {
      const binding = b as { column?: unknown; field_identity?: { contextualIdentity?: unknown; structuralType?: unknown } } | null;
      const column = binding?.column;
      if (typeof column === 'string' && !out.has(dagField)) {
        out.set(dagField, {
          column,
          contextualIdentity: typeof binding?.field_identity?.contextualIdentity === 'string' ? binding.field_identity.contextualIdentity : undefined,
          structuralType: typeof binding?.field_identity?.structuralType === 'string' ? binding.field_identity.structuralType : undefined,
        });
      }
    }
  }
  return out;
}

/**
 * Compute a regime-3 component's attainment (actual ÷ target, as a 0–100 percentage) for one entity,
 * resolving the {actual, target} DAG field identities to persisted metric columns via the canonical
 * binding. Returns null when either field is unbound or the metric values are missing/zero-target.
 * NO name-matching: the field→column resolution is the engine's own canonical declaration.
 */
export function resolveAttainmentPct(
  attainmentFields: { actual: string; target: string },
  bindingMap: Map<string, FieldBinding>,
  metrics: Record<string, unknown>,
): number | null {
  const actualCol = bindingMap.get(attainmentFields.actual)?.column;
  const targetCol = bindingMap.get(attainmentFields.target)?.column;
  if (!actualCol || !targetCol) return null;
  const actual = metrics[actualCol];
  const target = metrics[targetCol];
  if (typeof actual === 'number' && typeof target === 'number' && target !== 0) {
    return (actual / target) * 100;
  }
  return null;
}
