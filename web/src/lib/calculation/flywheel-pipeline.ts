/**
 * Flywheel Pipeline — Three-scope learning infrastructure
 *
 * Flywheel 1 (Tenant): synaptic_density — already exists (OB-78)
 * Flywheel 2 (Foundational): foundational_patterns — cross-tenant structural aggregation
 * Flywheel 3 (Domain): domain_patterns — vertical expertise accumulation
 *
 * PRIVACY FIREWALL:
 * - No tenant_id stored in cross-tenant tables
 * - No entity data crosses the boundary
 * - Only: pattern_signature, confidence, execution count, anomaly rate, structural behaviors
 *
 * ZERO domain language. Korean Test applies.
 */

import type { PatternDensity } from './synaptic-types';

// ──────────────────────────────────────────────
// Input Types
// ──────────────────────────────────────────────

export interface FlywheelAggregationInput {
  tenantId: string;
  domainId: string;
  verticalHint?: string;
  densityUpdates: Array<{
    patternSignature: string;
    confidence: number;
    executionCount: number;
    anomalyRate: number;
    learnedBehaviors: Record<string, unknown>;
  }>;
}

// ──────────────────────────────────────────────
// Row Shapes (from Supabase tables)
// ──────────────────────────────────────────────

interface FoundationalPatternRow {
  id: string;
  pattern_signature: string;
  confidence_mean: number;
  confidence_variance: number;
  total_executions: number;
  tenant_count: number;
  anomaly_rate_mean: number;
  learned_behaviors: Record<string, unknown> | null;
}

interface DomainPatternRow {
  id: string;
  pattern_signature: string;
  domain_id: string;
  vertical_hint: string | null;
  confidence_mean: number;
  total_executions: number;
  tenant_count: number;
  learned_behaviors: Record<string, unknown> | null;
}

// ──────────────────────────────────────────────
// Client Resolution
// ──────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[FlywheelPipeline] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ──────────────────────────────────────────────
// EMA Helper — Exponential Moving Average
// ──────────────────────────────────────────────

function ema(existing: number, newValue: number, weight: number = 0.1): number {
  return existing * (1 - weight) + newValue * weight;
}

// ──────────────────────────────────────────────
// OB-235 P5 — structural learned_behaviors merge (gap 2)
// ──────────────────────────────────────────────

/**
 * Merge accumulated cross-tenant learned_behaviors with this run's, so the learner-core reads the
 * accumulated STRUCTURAL behaviors (they were previously written on INSERT only and dropped on UPDATE).
 * Shallow structural merge, new observation wins per key. PRIVACY FIREWALL: learnedBehaviors carry only
 * structural keys (Korean Test — synaptic-types.PatternDensity.learnedBehaviors); this never introduces a
 * tenant_id / entity_id / raw value, and we defensively drop any such key if one ever appears.
 */
// tenant_count is a permitted structural aggregate (directive §3.5); the firewall bars tenant_IDENTITY only.
const TENANT_IDENTIFYING_KEYS = /tenant_id|entity_id|source_file|display_name|raw_value/i;
export function mergeStructuralBehaviors(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const src of [existing, incoming]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of Object.keys(src)) {
      if (TENANT_IDENTIFYING_KEYS.test(k)) continue; // firewall: never carry a tenant-identifying key
      out[k] = (src as Record<string, unknown>)[k];
    }
  }
  return out;
}

// ──────────────────────────────────────────────
// Flywheel 2: Foundational Aggregation
// ──────────────────────────────────────────────

/**
 * Aggregate density updates into foundational_patterns.
 * PRIVACY: tenantId is used ONLY for tenant_count tracking.
 * It is NOT stored in the foundational_patterns row.
 */
export async function aggregateFoundational(input: FlywheelAggregationInput): Promise<void> {
  if (input.densityUpdates.length === 0) return;

  try {
    const supabase = await getClient();

    for (const update of input.densityUpdates) {
      // Read existing
      const { data: existing } = await supabase
        .from('foundational_patterns')
        .select('*')
        .eq('pattern_signature', update.patternSignature)
        .maybeSingle();

      const row = existing as FoundationalPatternRow | null;

      if (row) {
        // Update with EMA
        const newConfidence = ema(row.confidence_mean, update.confidence);
        const newAnomalyRate = ema(row.anomaly_rate_mean, update.anomalyRate);
        // OB-235 P5 gap 1 — running confidence_variance (directive §3.5 "confidence_mean/variance"). The
        // column existed (migration 016) but was never written. EMA estimate of the squared deviation from
        // the prior cross-tenant mean — a structural spread, no tenant identity.
        const newVariance = ema(row.confidence_variance ?? 0, Math.pow(update.confidence - row.confidence_mean, 2));
        // OB-235 P5 gap 2 — learned_behaviors was written only on INSERT and DROPPED on UPDATE; the
        // learner-core reads accumulated STRUCTURAL behaviors, so merge them (structural-only; privacy firewall).
        const mergedBehaviors = mergeStructuralBehaviors(row.learned_behaviors, update.learnedBehaviors);

        await supabase
          .from('foundational_patterns')
          .update({
            confidence_mean: newConfidence,
            confidence_variance: newVariance,
            anomaly_rate_mean: newAnomalyRate,
            total_executions: row.total_executions + update.executionCount,
            tenant_count: row.tenant_count + 1, // simplified — see note below
            learned_behaviors: mergedBehaviors,
            updated_at: new Date().toISOString(),
          })
          .eq('pattern_signature', update.patternSignature);
      } else {
        // Insert new
        await supabase
          .from('foundational_patterns')
          .insert({
            pattern_signature: update.patternSignature,
            confidence_mean: update.confidence,
            confidence_variance: 0, // single observation — zero spread until a second tenant contributes
            total_executions: update.executionCount,
            tenant_count: 1,
            anomaly_rate_mean: update.anomalyRate,
            learned_behaviors: update.learnedBehaviors,
          });
      }
    }
  } catch (err) {
    console.error('[FlywheelPipeline] aggregateFoundational error:', err);
  }
}

// ──────────────────────────────────────────────
// Flywheel 3: Domain Aggregation
// ──────────────────────────────────────────────

/**
 * Aggregate density updates into domain_patterns.
 * Tagged by domain_id + vertical_hint.
 */
export async function aggregateDomain(input: FlywheelAggregationInput): Promise<void> {
  if (input.densityUpdates.length === 0) return;

  try {
    const supabase = await getClient();

    for (const update of input.densityUpdates) {
      // OB-235 P5 — vertical_hint null-consistency fix. The INSERT below writes `verticalHint ?? null`, but
      // this lookup compared against `?? ''`, so a returning tenant never matched the existing NULL-vertical
      // row → it INSERTED a duplicate (NULLs are distinct in the unique index) instead of UPDATING. Match the
      // insert: filter IS NULL when no hint, else equality.
      let existingQuery = supabase
        .from('domain_patterns')
        .select('*')
        .eq('pattern_signature', update.patternSignature)
        .eq('domain_id', input.domainId);
      existingQuery = input.verticalHint
        ? existingQuery.eq('vertical_hint', input.verticalHint)
        : existingQuery.is('vertical_hint', null);
      const { data: existing } = await existingQuery.maybeSingle();

      const row = existing as DomainPatternRow | null;

      if (row) {
        const newConfidence = ema(row.confidence_mean, update.confidence);
        // OB-235 P5 gap 2 — merge structural learned_behaviors on UPDATE (was dropped) for the learner-core.
        const mergedBehaviors = mergeStructuralBehaviors(row.learned_behaviors, update.learnedBehaviors);

        await supabase
          .from('domain_patterns')
          .update({
            confidence_mean: newConfidence,
            total_executions: row.total_executions + update.executionCount,
            tenant_count: row.tenant_count + 1,
            learned_behaviors: mergedBehaviors,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      } else {
        await supabase
          .from('domain_patterns')
          .insert({
            pattern_signature: update.patternSignature,
            domain_id: input.domainId,
            vertical_hint: input.verticalHint ?? null,
            confidence_mean: update.confidence,
            total_executions: update.executionCount,
            tenant_count: 1,
            learned_behaviors: update.learnedBehaviors,
          });
      }
    }
  } catch (err) {
    console.error('[FlywheelPipeline] aggregateDomain error:', err);
  }
}

// ──────────────────────────────────────────────
// Cold Start — Load priors for a new tenant
// ──────────────────────────────────────────────

export interface ColdStartPrior {
  confidence: number;
  learnedBehaviors: Record<string, unknown>;
}

/**
 * Load structural priors from foundational + domain patterns.
 * Domain-specific priors override foundational where both exist.
 * Returns map of pattern_signature → { confidence, learnedBehaviors }.
 */
export async function loadColdStartPriors(
  domainId: string,
  verticalHint?: string
): Promise<Map<string, ColdStartPrior>> {
  const priors = new Map<string, ColdStartPrior>();

  try {
    const supabase = await getClient();

    // Load foundational priors (all structural patterns)
    const { data: foundational } = await supabase
      .from('foundational_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors');

    for (const row of (foundational ?? []) as FoundationalPatternRow[]) {
      priors.set(row.pattern_signature, {
        confidence: row.confidence_mean,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors
          : {},
      });
    }

    // Load domain priors (override foundational where applicable)
    let query = supabase
      .from('domain_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors')
      .eq('domain_id', domainId);

    if (verticalHint) {
      query = query.eq('vertical_hint', verticalHint);
    }

    const { data: domain } = await query;

    for (const row of (domain ?? []) as DomainPatternRow[]) {
      priors.set(row.pattern_signature, {
        confidence: row.confidence_mean,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors
          : {},
      });
    }
  } catch (err) {
    console.error('[FlywheelPipeline] loadColdStartPriors error:', err);
  }

  return priors;
}

// ──────────────────────────────────────────────
// Cold Start Discount Factor
// ──────────────────────────────────────────────

/** Priors are discounted — they're structural suggestions, not proven for this tenant */
export const COLD_START_DISCOUNT = 0.6;

/**
 * Convert cold start priors into initial PatternDensity entries.
 * Confidence is discounted by COLD_START_DISCOUNT.
 */
export function applyPriorsToEmptyDensity(
  priors: Map<string, ColdStartPrior>
): Map<string, PatternDensity> {
  const density = new Map<string, PatternDensity>();

  for (const [sig, prior] of Array.from(priors.entries())) {
    const discountedConfidence = prior.confidence * COLD_START_DISCOUNT;
    density.set(sig, {
      signature: sig,
      confidence: discountedConfidence,
      totalExecutions: 0,
      lastAnomalyRate: 0,
      lastCorrectionCount: 0,
      executionMode: discountedConfidence >= 0.7 ? 'light_trace' : 'full_trace',
      learnedBehaviors: prior.learnedBehaviors,
    });
  }

  return density;
}

// ──────────────────────────────────────────────
// Post-Consolidation Hook
// ──────────────────────────────────────────────

/**
 * Fire-and-forget after tenant density consolidation.
 * Aggregates into both Flywheel 2 + Flywheel 3.
 */
export async function postConsolidationFlywheel(
  tenantId: string,
  domainId: string,
  verticalHint: string | undefined,
  densityUpdates: FlywheelAggregationInput['densityUpdates']
): Promise<void> {
  await Promise.allSettled([
    aggregateFoundational({ tenantId, domainId, verticalHint, densityUpdates }),
    aggregateDomain({ tenantId, domainId, verticalHint, densityUpdates }),
  ]);
}
