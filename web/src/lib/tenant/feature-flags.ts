/**
 * OB-252 — Canonical tenant feature-entitlement read (the single deterministic predicate).
 *
 * The entitlement resolution path (Decision 158 / I2) is PURE deterministic code: a tenant
 * feature is either entitled or not, computed by a boolean read of `tenants.features` with a
 * fallback to DEFAULT_FEATURES. ZERO LLM, ZERO async, ZERO heuristics.
 *
 * Why a fallback to DEFAULT_FEATURES (the default-on/off SSOT): core agents (Intelligence,
 * Compensation) are entitled-by-default (DEFAULT_FEATURES.performance / .compensation = true), so
 * adding their workspace featureFlag MUST NOT hide them from existing tenants whose `features`
 * JSONB has no explicit key. Licensable agents (Finance, PRISM) are default-OFF. This helper makes
 * the default uniform whether the caller pre-merged DEFAULT_FEATURES (client tenant-context) or
 * passes the raw, unmerged `tenants.features` row (server / middleware).
 *
 * Korean Test: keys are structural feature identifiers from the typed TenantFeatures contract,
 * never language/domain string-matching.
 */

import { DEFAULT_FEATURES } from '@/types/tenant';

const DEFAULTS = DEFAULT_FEATURES as unknown as Record<string, boolean | undefined>;

/**
 * Is the given tenant feature entitled?
 * Explicit boolean in `features` wins; otherwise the DEFAULT_FEATURES value; otherwise false
 * (fail-closed for any unknown key).
 */
export function isFeatureEnabled(
  features: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  const explicit = features?.[key];
  if (typeof explicit === 'boolean') return explicit;
  return DEFAULTS[key] === true;
}

/** The default entitlement for a feature key when a tenant has no explicit value (DEFAULT_FEATURES). */
export function isEntitledByDefault(key: string): boolean {
  return DEFAULTS[key] === true;
}
