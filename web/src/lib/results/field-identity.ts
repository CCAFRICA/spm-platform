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

export interface FieldBinding {
  column: string;
  contextualIdentity?: string;
  structuralType?: string;
  /** The engine applies these to the operand BEFORE the ratio. The persisted top-level metrics JSONB is
   *  the RAW unscaled/unfiltered aggregate — so a client-side recompute is only valid when both are absent. */
  scaleFactor?: number;
  hasFilters?: boolean;
}

/** Build the canonical DAG-field → persisted-column map from rule_sets.input_bindings.convergence_bindings.
 *  Note: this is a GLOBAL first-wins map across components (the convergence bindings are component-scoped);
 *  for distinct per-component field names (the common case, incl. BCL) this is exact. Collisions are a
 *  documented limitation (per-component scoping is a refinement). */
export function buildFieldBindingMap(inputBindings: unknown): Map<string, FieldBinding> {
  const out = new Map<string, FieldBinding>();
  const cb = (inputBindings as { convergence_bindings?: unknown } | null)?.convergence_bindings;
  if (!cb || typeof cb !== 'object') return out;
  for (const comp of Object.values(cb as Record<string, unknown>)) {
    if (!comp || typeof comp !== 'object') continue;
    for (const [dagField, b] of Object.entries(comp as Record<string, unknown>)) {
      const binding = b as { column?: unknown; scale_factor?: unknown; filters?: unknown; field_identity?: { contextualIdentity?: unknown; structuralType?: unknown } } | null;
      const column = binding?.column;
      if (typeof column === 'string' && !out.has(dagField)) {
        out.set(dagField, {
          column,
          contextualIdentity: typeof binding?.field_identity?.contextualIdentity === 'string' ? binding.field_identity.contextualIdentity : undefined,
          structuralType: typeof binding?.field_identity?.structuralType === 'string' ? binding.field_identity.structuralType : undefined,
          scaleFactor: typeof binding?.scale_factor === 'number' ? binding.scale_factor : undefined,
          hasFilters: Array.isArray(binding?.filters) && (binding.filters as unknown[]).length > 0,
        });
      }
    }
  }
  return out;
}

/** True when the persisted raw aggregate equals the engine's operand — i.e. no scale_factor and no filters. */
function isRawSafe(b: FieldBinding | undefined): boolean {
  if (!b) return false;
  if (b.scaleFactor != null && b.scaleFactor !== 1) return false; // engine scales; raw metric does not
  if (b.hasFilters) return false;                                 // engine filters rows; raw metric is unfiltered
  return true;
}

/**
 * Compute a regime-3 component's attainment (actual ÷ target, as a 0–100 percentage) for one entity,
 * resolving the {actual, target} DAG field identities to persisted metric columns via the canonical
 * binding. NO name-matching: the field→column resolution is the engine's own canonical declaration.
 *
 * SAFETY (adversarial-review fix): the persisted top-level `metrics` JSONB is the RAW unscaled/unfiltered
 * aggregate. The engine applies each binding's `scale_factor` and `filters` to the operand before the
 * ratio. So we only recompute (and render a number) when BOTH operands are raw-safe; otherwise we return
 * null and the surface shows "target-driven" without a number it cannot compute correctly here — never a
 * wrong figure. (General per-component attainment persistence is the OB-207 R2 engine residual.)
 */
export function resolveAttainmentPct(
  attainmentFields: { actual: string; target: string },
  bindingMap: Map<string, FieldBinding>,
  metrics: Record<string, unknown>,
): number | null {
  const aBind = bindingMap.get(attainmentFields.actual);
  const tBind = bindingMap.get(attainmentFields.target);
  if (!aBind?.column || !tBind?.column) return null;
  if (!isRawSafe(aBind) || !isRawSafe(tBind)) return null; // engine applied scale/filters we cannot replicate
  const actual = metrics[aBind.column];
  const target = metrics[tBind.column];
  if (typeof actual === 'number' && typeof target === 'number' && Number.isFinite(actual) && Number.isFinite(target) && target > 0) {
    return (actual / target) * 100;
  }
  return null;
}
