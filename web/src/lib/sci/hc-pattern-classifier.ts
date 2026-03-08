// HF-105: HC Pattern Classifier — Level 1 Resolution
// Two-Level Resolution Model: Level 1 (this file) uses HC role
// presence/absence + idRepeatRatio. Level 2 (resolver.ts) is CRR Bayesian fallback.
//
// Pattern rules use ONLY:
//   - HC column role presence/absence (confidence >= 0.80)
//   - identifierRepeatRatio as the single structural disambiguator
// No weights. No scores. No field-name matching.

import type { ContentProfile, AgentType } from './sci-types';

// ============================================================
// HC PATTERN RESULT
// ============================================================

export interface HCPatternResult {
  classification: AgentType;
  confidence: number;
  patternName: string;
  matchedConditions: string[];
}

// Minimum HC confidence to count a role as present
const HC_ROLE_THRESHOLD = 0.80;

// ============================================================
// LEVEL 1 CLASSIFIER
// Returns a classification if HC roles unambiguously match a pattern.
// Returns null when no pattern matches — caller falls through to Level 2.
// ============================================================

export function classifyByHCPattern(profile: ContentProfile): HCPatternResult | null {
  const hc = profile.headerComprehension;
  if (!hc) return null;

  // Count high-confidence roles
  let hasIdentifier = false;
  let hasName = false;
  let hasTemporal = false;
  let hasMeasure = false;
  let hasReferenceKey = false;
  let measureCount = 0;

  for (const interp of Array.from(hc.interpretations.values())) {
    if (interp.confidence < HC_ROLE_THRESHOLD) continue;
    switch (interp.columnRole) {
      case 'identifier': hasIdentifier = true; break;
      case 'name': hasName = true; break;
      case 'temporal': hasTemporal = true; break;
      case 'measure': hasMeasure = true; measureCount++; break;
      case 'reference_key': hasReferenceKey = true; break;
    }
  }

  const idRepeatRatio = profile.structure.identifierRepeatRatio;

  // ────────────────────────────────────────────────────────
  // ENTITY: HAS identifier AND HAS name AND idRepeatRatio ≤ 1.5
  // "One row per person with categorical attributes"
  // ────────────────────────────────────────────────────────
  if (hasIdentifier && hasName && idRepeatRatio > 0 && idRepeatRatio <= 1.5) {
    return {
      classification: 'entity',
      confidence: 0.90,
      patternName: 'entity_roster',
      matchedConditions: [
        'HAS identifier',
        'HAS name',
        `idRepeatRatio=${idRepeatRatio.toFixed(2)} (<=1.5)`,
      ],
    };
  }

  // ────────────────────────────────────────────────────────
  // TRANSACTION: HAS identifier AND HAS measure AND HAS temporal AND idRepeatRatio > 1.5
  // "Repeated entities over time with numeric measurements"
  // ────────────────────────────────────────────────────────
  if (hasIdentifier && hasMeasure && hasTemporal && idRepeatRatio > 1.5) {
    return {
      classification: 'transaction',
      confidence: 0.90,
      patternName: 'repeated_measures_over_time',
      matchedConditions: [
        'HAS identifier',
        `HAS measure (${measureCount} columns)`,
        'HAS temporal',
        `idRepeatRatio=${idRepeatRatio.toFixed(2)} (>1.5)`,
      ],
    };
  }

  // ────────────────────────────────────────────────────────
  // REFERENCE: HAS reference_key AND NOT HAS identifier AND NOT HAS name
  // "Lookup table with categorical keys"
  // ────────────────────────────────────────────────────────
  if (hasReferenceKey && !hasIdentifier && !hasName) {
    return {
      classification: 'reference',
      confidence: 0.85,
      patternName: 'lookup_table',
      matchedConditions: [
        'HAS reference_key',
        'NOT HAS identifier',
        'NOT HAS name',
      ],
    };
  }

  // ────────────────────────────────────────────────────────
  // TARGET: HAS identifier AND HAS measure AND NOT HAS temporal AND idRepeatRatio ≤ 1.5
  // "Per-entity numeric benchmarks without temporal repetition"
  // ────────────────────────────────────────────────────────
  if (hasIdentifier && hasMeasure && !hasTemporal && idRepeatRatio > 0 && idRepeatRatio <= 1.5) {
    return {
      classification: 'target',
      confidence: 0.85,
      patternName: 'per_entity_benchmarks',
      matchedConditions: [
        'HAS identifier',
        `HAS measure (${measureCount} columns)`,
        'NOT HAS temporal',
        `idRepeatRatio=${idRepeatRatio.toFixed(2)} (<=1.5)`,
      ],
    };
  }

  // No pattern matched — fall through to Level 2 (CRR Bayesian)
  return null;
}
