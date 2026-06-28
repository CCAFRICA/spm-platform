// OB-250 — The PRISM capability predicate + key (I1: single source of truth).
//
// `prism_enabled` is a per-tenant CAPABILITY flag (off by default) living in the existing
// tenants.features JSONB bag — the same mechanism the licensable Finance agent uses (I4: no
// parallel store). EVERYTHING PRISM-facing derives from the ONE predicate below: the Data-Operations
// workspace gate, the server deep-link gate (middleware), the PRISM API routes, the import-source
// shelf, and the scanner mode. There is no inline `if (features.prism_enabled)` anywhere else.
//
// The flag is wholly DETERMINISTIC (I8 / Decision 158): nothing here involves LLM inference. It
// encodes neither permission nor price (a future billing layer may READ it; it is not a billing or
// permission object).

import type { TenantFeatures } from '@/types/tenant';

/**
 * THE canonical key for the per-tenant PRISM capability flag. Defined ONCE and consumed by:
 * TenantFeatures, DEFAULT_FEATURES, the workspace `featureFlag` binding, `isPrismEnabled`, the
 * platform toggle write, and the middleware feature gate — so a typo fails to compile rather than
 * silently defaulting the flag off forever.
 */
export const PRISM_FEATURE_KEY = 'prism_enabled' as const;

type FeatureBag = Partial<TenantFeatures> | Record<string, unknown> | null | undefined;

/**
 * The single authoritative read (I1): is PRISM enabled for a tenant, given its features bag?
 * Absent key → false (off by default, I9 — no DDL needed; the default-merge + this `=== true`
 * make it fail-closed). Pure + deterministic (I8).
 */
export function isPrismEnabled(features: FeatureBag): boolean {
  if (!features) return false;
  return (features as Record<string, unknown>)[PRISM_FEATURE_KEY] === true;
}

// =============================================================================
// §1.7 NESTING — the finer controls that only have meaning when PRISM is on.
// Established here (typed + read); proven with the scanner mode. The scanner reads this ONLY when
// isPrismEnabled is true; default 'enforce' = byte-identical current fail-closed behavior.
// =============================================================================

export type PrismScanMode = 'enforce' | 'interim';

/** Read the nested scanner mode from tenants.settings.prism.mode. Default 'enforce' (today's
 *  behavior). Meaningful only when isPrismEnabled — the caller establishes that precondition. */
export function getPrismScanMode(settings: Record<string, unknown> | null | undefined): PrismScanMode {
  const prism = (settings?.['prism'] ?? {}) as Record<string, unknown>;
  return prism['mode'] === 'interim' ? 'interim' : 'enforce';
}
