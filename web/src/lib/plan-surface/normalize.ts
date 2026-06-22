/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — normalizeComponents: the Korean-Test core (D154, AUD-009).
 *
 * Handles all three observed `rule_sets.components` dialects via a shape guard,
 * carrying EVERY variant, EVERY component, and EVERY config field through. Sets
 * `isKnownType` by membership in KNOWN_RENDERER_TYPES but NEVER drops an unknown
 * type — unknowns flow to the GenericComponentRenderer. No enumerated whitelist
 * gates inclusion; no hardcoded field-name dictionary.
 *
 * Dialects (Phase 1 + OB-227):
 *   1. MIR:   { variants: [ { components: [...] } ] }              (bare variants)
 *   2. alt:   { configuration: { variants: [ { components: [...] } ] } }
 *   3. BCL:   [ ...components ]   OR   { components: [...] }        (array / flat)
 */
import { KNOWN_RENDERER_TYPES, type CanonicalComponent, type PlanVariant } from './types';
import { collectFieldRefs, findScopeMeasure } from './binding-extract';

type Bag = Record<string, any>;
const isObj = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v);

/** Resolve the variant list from any dialect. Returns null only if no recognizable
 *  variant/component shape exists at all (caller flags shapeUnrecognized; still renders). */
export function resolveVariantList(componentsJson: unknown): { variants: Bag[]; recognized: boolean } {
  if (isObj(componentsJson)) {
    if (Array.isArray(componentsJson.configuration?.variants)) return { variants: componentsJson.configuration.variants, recognized: true };
    if (Array.isArray(componentsJson.variants)) return { variants: componentsJson.variants, recognized: true };
    // flat: { components: [...] } → single default variant
    if (Array.isArray(componentsJson.components)) return { variants: [{ variantId: 'default', variantName: 'Default', components: componentsJson.components }], recognized: true };
    // last resort: an object whose values look like components — carry as one variant
    return { variants: [{ variantId: 'default', variantName: 'Default', components: Object.values(componentsJson).filter(isObj) }], recognized: false };
  }
  if (Array.isArray(componentsJson)) {
    // BCL array dialect: components are the array directly
    return { variants: [{ variantId: 'default', variantName: 'Default', components: componentsJson }], recognized: true };
  }
  return { variants: [], recognized: false };
}

function pick<T = unknown>(o: Bag, keys: string[], fallback?: T): T | undefined {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k] as T;
  return fallback;
}

/** Build a CanonicalComponent, carrying everything through. */
export function normalizeComponent(raw: Bag, index: number): CanonicalComponent {
  const componentType = String(pick<string>(raw, ['componentType', 'type', 'component_type'], 'unknown'));
  const name = String(pick<string>(raw, ['name', 'componentName', 'label'], `Component ${index + 1}`));
  const id = String(pick<string>(raw, ['id', 'componentId', 'component_id'], `${componentType}-${index}`));
  const metadata = (isObj(raw.metadata) ? raw.metadata : undefined) as Record<string, unknown> | undefined;
  const calculationIntent = pick(raw, ['calculationIntent', 'intent']) ?? (metadata as Bag)?.intent;
  const compositionalIntent = (metadata as Bag)?.compositional_intent ?? (raw as Bag).compositional_intent;

  // binding: explicit typed config bindings if present, else implicit prime-DAG field refs
  const fieldRefs = collectFieldRefs(calculationIntent);
  const scopeMeasure = findScopeMeasure(calculationIntent);
  // primary measure column: scope-aggregate field > first aggregate field > first reference > scope boundary
  const aggRef = fieldRefs.find((r) => r.via.startsWith('aggregate'));
  const plainRef = fieldRefs.find((r) => r.via === 'reference');
  const primaryColumn = scopeMeasure ?? aggRef?.field ?? plainRef?.field ?? fieldRefs[0]?.field ?? null;
  const matchReason = primaryColumn ? (Object.keys(metadata ?? {}).length && fieldRefs.length ? 'prime-dag-field-reference' : 'prime-dag-field-reference') : 'unbound';

  const confidence = typeof raw.confidence === 'number' ? raw.confidence
    : typeof (metadata as Bag)?.confidence === 'number' ? (metadata as Bag).confidence
    : undefined;

  return {
    id,
    name,
    componentType,
    config: {
      tierConfig: pick(raw, ['tierConfig', 'tier_config']),
      matrixConfig: pick(raw, ['matrixConfig', 'matrix_config']),
      percentageConfig: pick(raw, ['percentageConfig', 'percentage_config']),
      conditionalConfig: pick(raw, ['conditionalConfig', 'conditional_config']),
      compositionalIntent,
      raw,
    },
    binding: { column: primaryColumn, matchReason, fieldRefs },
    confidence,
    calculationIntent,
    isKnownType: KNOWN_RENDERER_TYPES.has(componentType),
    description: pick<string>(raw, ['description']) ?? null,
    measurementLevel: pick<string>(raw, ['measurementLevel', 'measurement_level']) ?? null,
    metadata,
  };
}

/** Normalize the full components JSONB into variants (the Korean-Test core). */
export function normalizeComponents(componentsJson: unknown): { variants: PlanVariant[]; recognized: boolean } {
  const { variants: rawVariants, recognized } = resolveVariantList(componentsJson);
  const variants: PlanVariant[] = rawVariants.map((v, vi) => {
    const rawComps: Bag[] = Array.isArray(v?.components) ? v.components
      : Array.isArray(v?.componentList) ? v.componentList
      : [];
    return {
      variantId: String(pick<string>(v, ['variantId', 'id'], `variant-${vi}`)),
      variantName: String(pick<string>(v, ['variantName', 'name'], rawVariants.length > 1 ? `Variant ${vi + 1}` : 'Default')),
      description: pick<string>(v, ['description']) ?? null,
      eligibilityCriteria: pick(v, ['eligibilityCriteria', 'eligibility_criteria']),
      components: rawComps.map((c, ci) => normalizeComponent(c, ci)),
    };
  });
  return { variants, recognized };
}
