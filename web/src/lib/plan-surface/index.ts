/**
 * OB-228 — Living Plan Surface data layer (DS-029 Slice 1+2). Mirrors the
 * lib/insights/ pattern: deterministic reads above the substrate, no AI calls
 * (recognition vs construction, Decision 158). Korean-Test normalizer carries
 * every component through; confidence is a hint, never a gate (Carry Everything).
 */
export * from './types';
export { resolvePersona, personaFromIdentity } from './persona';
export { getPlanStructure, getVisiblePlans, buildPlanStructure } from './structure';
export { normalizeComponents, normalizeComponent, resolveVariantList } from './normalize';
export { getComponentDistribution } from './distribution';
export { getBaselineOutcomes } from './baseline';
export { analyzeComponent } from './prime-dag-view';
export { collectFieldRefs, findScope, findScopeMeasure } from './binding-extract';
