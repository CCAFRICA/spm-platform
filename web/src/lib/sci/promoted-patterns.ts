// Pattern Promotion — ML trains the heuristic layer
// OB-160L — "The ML layer trains the heuristic layer, then gets out of the way"
//
// Promoted patterns are structural fingerprints that consistently classify the same way
// across multiple tenants. When promoted, they become deterministic confidence floors —
// equivalent to composite signatures from signatures.ts, but learned from data.
//
// Zero domain vocabulary. Korean Test applies.

import { createClient } from '@supabase/supabase-js';
import type { AgentType } from './sci-types';

// ============================================================
// TYPES
// ============================================================

export interface PromotedPattern {
  id: string;
  patternSignature: string;
  promotedClassification: AgentType;
  confidenceFloor: number;
  evidence: {
    signalCount: number;
    accuracy: number;
    tenantCount: number;
    promotedAt: string;
    classificationDistribution: Record<string, number>;
  };
  active: boolean;
}

export interface PromotionCandidate {
  patternSignature: string;
  topClassification: AgentType;
  accuracy: number;
  signalCount: number;
  tenantCount: number;
  classificationDistribution: Record<string, number>;
  meetsThreshold: boolean;
}

// ============================================================
// PROMOTION THRESHOLDS
// ============================================================

const PROMOTION_THRESHOLDS = {
  MIN_SIGNAL_COUNT: 10,       // At least 10 classification events
  MIN_ACCURACY: 0.85,         // Same classification >= 85% of the time
  MIN_TENANT_COUNT: 3,        // Across 3+ tenants
  CONFIDENCE_FLOOR: 0.80,     // Promoted patterns get 0.80 confidence floor
} as const;

// ============================================================
// IDENTIFY PROMOTION CANDIDATES
// ============================================================

/**
 * Query foundational_patterns for structural fingerprints that consistently
 * classify the same way. These are promotion candidates.
 */
export async function identifyPromotionCandidates(
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<PromotionCandidate[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('foundational_patterns')
      .select('pattern_signature, confidence_mean, total_executions, tenant_count, learned_behaviors')
      .gte('total_executions', PROMOTION_THRESHOLDS.MIN_SIGNAL_COUNT)
      .gte('tenant_count', PROMOTION_THRESHOLDS.MIN_TENANT_COUNT);

    if (error || !data) return [];

    const candidates: PromotionCandidate[] = [];

    for (const row of data) {
      const behaviors = (row.learned_behaviors as Record<string, unknown>) ?? {};
      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
      const entries = Object.entries(dist);
      if (entries.length === 0) continue;

      entries.sort((a, b) => b[1] - a[1]);
      const [topClassification, topCount] = entries[0];
      const total = entries.reduce((sum, [, c]) => sum + c, 0);
      const accuracy = topCount / total;

      candidates.push({
        patternSignature: row.pattern_signature as string,
        topClassification: topClassification as AgentType,
        accuracy,
        signalCount: total,
        tenantCount: (row.tenant_count as number) ?? 0,
        classificationDistribution: dist,
        meetsThreshold: accuracy >= PROMOTION_THRESHOLDS.MIN_ACCURACY,
      });
    }

    return candidates.sort((a, b) => b.accuracy - a.accuracy);
  } catch {
    return [];
  }
}

// ============================================================
// LOAD PROMOTED PATTERNS (for scoring pipeline)
// ============================================================

/**
 * Load active promoted patterns from foundational_patterns.
 * Called during scoring to apply confidence floors alongside composite signatures.
 *
 * Returns Map<pattern_signature, PromotedPattern> for O(1) lookup.
 */
export async function loadPromotedPatterns(
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Map<string, PromotedPattern>> {
  const patterns = new Map<string, PromotedPattern>();

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query foundational patterns that meet promotion thresholds
    const { data, error } = await supabase
      .from('foundational_patterns')
      .select('id, pattern_signature, confidence_mean, total_executions, tenant_count, learned_behaviors')
      .gte('total_executions', PROMOTION_THRESHOLDS.MIN_SIGNAL_COUNT)
      .gte('tenant_count', PROMOTION_THRESHOLDS.MIN_TENANT_COUNT);

    if (error || !data) return patterns;

    for (const row of data) {
      const behaviors = (row.learned_behaviors as Record<string, unknown>) ?? {};
      const dist = (behaviors.classification_distribution as Record<string, number>) ?? {};
      const entries = Object.entries(dist);
      if (entries.length === 0) continue;

      entries.sort((a, b) => b[1] - a[1]);
      const [topClassification, topCount] = entries[0];
      const total = entries.reduce((sum, [, c]) => sum + c, 0);
      const accuracy = topCount / total;

      if (accuracy < PROMOTION_THRESHOLDS.MIN_ACCURACY) continue;

      patterns.set(row.pattern_signature as string, {
        id: row.id as string,
        patternSignature: row.pattern_signature as string,
        promotedClassification: topClassification as AgentType,
        confidenceFloor: PROMOTION_THRESHOLDS.CONFIDENCE_FLOOR,
        evidence: {
          signalCount: total,
          accuracy,
          tenantCount: (row.tenant_count as number) ?? 0,
          promotedAt: new Date().toISOString(),
          classificationDistribution: dist,
        },
        active: true,
      });
    }
  } catch {
    // Promotion failure must never block scoring
  }

  return patterns;
}

// ============================================================
// APPLY PROMOTED PATTERNS (during scoring)
// ============================================================

export interface PromotedPatternMatch {
  agent: AgentType;
  confidence: number;
  patternSignature: string;
  evidence: PromotedPattern['evidence'];
}

/**
 * Check if a structural fingerprint matches a promoted pattern.
 * Returns the promoted classification + confidence floor if matched.
 *
 * Called alongside detectSignatures() in the scoring pipeline.
 * Same mechanism as composite signatures, but patterns come from data, not code.
 */
export function checkPromotedPatterns(
  fingerprintSignature: string,
  promotedPatterns: Map<string, PromotedPattern>,
): PromotedPatternMatch | null {
  const pattern = promotedPatterns.get(fingerprintSignature);
  if (!pattern || !pattern.active) return null;

  return {
    agent: pattern.promotedClassification,
    confidence: pattern.confidenceFloor,
    patternSignature: pattern.patternSignature,
    evidence: pattern.evidence,
  };
}
