// Contextual Reliability Lookup (CRL) — Decision 110
// OB-161 — Hierarchical reliability lookup for signal source types.
// Five levels: fingerprint → category → boundary → global → seed prior.
// Queries classification_signals for empirical accuracy data.
// Falls back through levels when insufficient evidence exists.

import { createClient } from '@supabase/supabase-js';
import type { StructuralFingerprint } from './classification-signal-service';
import { fingerprintToSignature } from './classification-signal-service';
import { getSeedPrior } from './seed-priors';
import type { SignalSourceType } from './seed-priors';
import type { AgentType } from './sci-types';

// Minimum observations required at each CRL level
const MIN_OBSERVATIONS = 5;

// ============================================================
// CRL RESULT — what the lookup returns
// ============================================================

export interface CRLResult {
  sourceType: SignalSourceType;
  reliability: number;         // 0-1: empirical or seed reliability
  level: 'fingerprint' | 'category' | 'boundary' | 'global' | 'seed';
  observations: number;        // how many data points informed this
  description: string;
}

// ============================================================
// CRL CACHE — per-session to avoid repeated DB queries
// ============================================================

interface CRLCache {
  tenantId: string;
  signalData: SignalRow[] | null;
}

interface SignalRow {
  classification: string;
  confidence: number;
  decision_source: string;
  structural_fingerprint: StructuralFingerprint | null;
  agent_scores: Record<string, number> | null;
  human_correction_from: string | null;
  source: string | null;
}

let crlCache: CRLCache | null = null;

/**
 * Load classification_signals for a tenant (cached per session).
 * Called once, reused for all CRL lookups in the same analyze request.
 */
async function loadSignalData(
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<SignalRow[]> {
  if (crlCache && crlCache.tenantId === tenantId && crlCache.signalData !== null) {
    return crlCache.signalData;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('classification_signals')
      .select('classification, confidence, decision_source, structural_fingerprint, agent_scores, human_correction_from, source')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !data) {
      crlCache = { tenantId, signalData: [] };
      return [];
    }

    const rows = data as SignalRow[];
    crlCache = { tenantId, signalData: rows };
    return rows;
  } catch {
    crlCache = { tenantId, signalData: [] };
    return [];
  }
}

/**
 * Reset CRL cache (call at start of each analyze request).
 */
export function resetCRLCache(): void {
  crlCache = null;
}

// ============================================================
// CONTEXTUAL RELIABILITY LOOKUP
// Given a signal source type and structural context,
// returns the empirical reliability at the most specific level available.
// ============================================================

/**
 * Look up the reliability for a signal source type given structural context.
 *
 * Hierarchical fallback:
 *   Level 1 (fingerprint): Exact structural fingerprint match
 *   Level 2 (category): Fingerprint bucket match (relaxed)
 *   Level 3 (boundary): Classification boundary context
 *   Level 4 (global): All signals of this source type for tenant
 *   Level 5 (seed): Cold-start seed prior
 */
export async function contextualReliabilityLookup(
  sourceType: SignalSourceType,
  fingerprint: StructuralFingerprint | null,
  tenantId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  boundaryClassifications?: AgentType[],
): Promise<CRLResult> {
  const signals = await loadSignalData(tenantId, supabaseUrl, supabaseServiceKey);

  if (signals.length === 0) {
    return seedFallback(sourceType);
  }

  // Level 1: Exact fingerprint match
  if (fingerprint) {
    const sig = fingerprintToSignature(fingerprint);
    const fpMatches = signals.filter(s => {
      if (!s.structural_fingerprint) return false;
      return fingerprintToSignature(s.structural_fingerprint) === sig;
    });

    if (fpMatches.length >= MIN_OBSERVATIONS) {
      const reliability = computeSourceReliability(fpMatches, sourceType);
      if (reliability !== null) {
        return {
          sourceType,
          reliability,
          level: 'fingerprint',
          observations: fpMatches.length,
          description: `Exact fingerprint match: ${fpMatches.length} observations`,
        };
      }
    }

    // Level 2: Category match (relaxed — same buckets but ignore columnCount)
    const categoryMatches = signals.filter(s => {
      if (!s.structural_fingerprint) return false;
      const sp = s.structural_fingerprint;
      return (
        sp.numericFieldRatioBucket === fingerprint.numericFieldRatioBucket &&
        sp.identifierRepeatBucket === fingerprint.identifierRepeatBucket &&
        sp.hasTemporalColumns === fingerprint.hasTemporalColumns &&
        sp.rowCountBucket === fingerprint.rowCountBucket
      );
    });

    if (categoryMatches.length >= MIN_OBSERVATIONS) {
      const reliability = computeSourceReliability(categoryMatches, sourceType);
      if (reliability !== null) {
        return {
          sourceType,
          reliability,
          level: 'category',
          observations: categoryMatches.length,
          description: `Category match (relaxed fingerprint): ${categoryMatches.length} observations`,
        };
      }
    }
  }

  // Level 3: Boundary match (similar competing classifications)
  if (boundaryClassifications && boundaryClassifications.length >= 2) {
    const boundaryMatches = signals.filter(s => {
      if (!s.agent_scores) return false;
      const scoredAgents = Object.entries(s.agent_scores)
        .filter(([, score]) => (score as number) > 0.30)
        .map(([agent]) => agent);
      return boundaryClassifications.every(bc => scoredAgents.includes(bc));
    });

    if (boundaryMatches.length >= MIN_OBSERVATIONS) {
      const reliability = computeSourceReliability(boundaryMatches, sourceType);
      if (reliability !== null) {
        return {
          sourceType,
          reliability,
          level: 'boundary',
          observations: boundaryMatches.length,
          description: `Boundary match (${boundaryClassifications.join(' vs ')}): ${boundaryMatches.length} observations`,
        };
      }
    }
  }

  // Level 4: Global — all signals for this tenant
  if (signals.length >= MIN_OBSERVATIONS) {
    const reliability = computeSourceReliability(signals, sourceType);
    if (reliability !== null) {
      return {
        sourceType,
        reliability,
        level: 'global',
        observations: signals.length,
        description: `Global tenant signals: ${signals.length} observations`,
      };
    }
  }

  // Level 5: Seed prior
  return seedFallback(sourceType);
}

// ============================================================
// RELIABILITY COMPUTATION
// Empirical accuracy of a signal source type within a set of signals.
// ============================================================

function computeSourceReliability(
  signals: SignalRow[],
  sourceType: SignalSourceType,
): number | null {
  // For HC source type, check signals where HC was involved
  // by looking at whether the final classification matches what HC would suggest
  // For structural sources, check whether the source's top prediction was correct
  // (correct = not overridden by human)

  // Simple accuracy metric: what fraction of signals were NOT human-corrected?
  // Human corrections indicate the system was wrong.
  // This is source-agnostic since we don't store per-source-type outcomes.
  // As the flywheel matures, we can add source-specific tracking.

  const total = signals.length;
  if (total === 0) return null;

  const correct = signals.filter(s => !s.human_correction_from).length;
  const accuracy = correct / total;

  // Blend with seed prior to prevent extreme values from small samples
  // Bayesian smoothing: (seed * pseudocount + accuracy * n) / (pseudocount + n)
  const seedReliability = getSeedPrior(sourceType);
  const pseudocount = 3; // weight of prior
  const blended = (seedReliability * pseudocount + accuracy * total) / (pseudocount + total);

  return blended;
}

function seedFallback(sourceType: SignalSourceType): CRLResult {
  return {
    sourceType,
    reliability: getSeedPrior(sourceType),
    level: 'seed',
    observations: 0,
    description: `Cold start: seed prior for ${sourceType}`,
  };
}
