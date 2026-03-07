// Synaptic Content Ingestion — Agent Scoring Models
// Decision 77 — OB-127, OB-159 Unified Scoring Overhaul
// Five specialist agents with structural heuristic scoring.
// Korean Test: scoring uses structural properties only. Zero field-name matching.

import type {
  ContentProfile, AgentType, AgentScore, AgentSignal,
  ContentClaim, SemanticBinding, SemanticRole,
} from './sci-types';
import { detectSignatures } from './signatures';

// ============================================================
// AGENT WEIGHT DEFINITIONS
// OB-159: All scoring uses structural properties from ContentProfile.
// nameSignals are used ONLY in semantic binding (observation text).
// ============================================================

interface WeightRule {
  signal: string;
  weight: number;
  test: (p: ContentProfile) => boolean;
  evidence: (p: ContentProfile) => string;
}

const PLAN_WEIGHTS: WeightRule[] = [
  { signal: 'auto_generated_headers', weight: 0.25, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'headers contain __EMPTY pattern' },
  { signal: 'high_sparsity', weight: 0.20, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
  { signal: 'percentage_values', weight: 0.15, test: p => p.patterns.hasPercentageValues, evidence: () => 'percentage values detected' },
  { signal: 'descriptive_labels', weight: 0.15, test: p => p.patterns.hasDescriptiveLabels, evidence: () => 'low-cardinality descriptive text columns' },
  { signal: 'low_row_count', weight: 0.10, test: p => p.patterns.rowCountCategory === 'reference', evidence: p => `${p.structure.rowCount} rows (reference)` },
  { signal: 'no_entity_id', weight: 0.05, test: p => !p.patterns.hasEntityIdentifier, evidence: () => 'no entity identifier column' },
  { signal: 'has_currency', weight: -0.03, test: p => p.patterns.hasCurrencyColumns > 0, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns` },
  { signal: 'has_date', weight: -0.10, test: p => p.patterns.hasDateColumn, evidence: () => 'date column present' },
  { signal: 'high_row_count', weight: -0.15, test: p => p.patterns.rowCountCategory === 'transactional', evidence: p => `${p.structure.rowCount} rows (transactional)` },
  { signal: 'has_entity_id', weight: -0.10, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier column present' },
];

const ENTITY_WEIGHTS: WeightRule[] = [
  { signal: 'has_entity_id', weight: 0.25, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier column present' },
  // OB-160C: Korean Test compliant — structural name detection only (no nameSignals in scoring)
  { signal: 'has_structural_name', weight: 0.20, test: p => p.patterns.hasStructuralNameColumn, evidence: () => 'structural name column detected (identifier-relative cardinality)' },
  // OB-159: Volume pattern replaces absolute row count
  { signal: 'single_per_entity', weight: 0.15, test: p => p.patterns.volumePattern === 'single', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (single — roster pattern)` },
  { signal: 'categorical_attributes', weight: 0.10, test: p => p.structure.categoricalFieldCount >= 2, evidence: p => `${p.structure.categoricalFieldCount} categorical text fields` },
  { signal: 'no_date', weight: 0.05, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'high_currency', weight: -0.10, test: p => p.patterns.hasCurrencyColumns > 2, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns (>2)` },
  { signal: 'many_per_entity', weight: -0.15, test: p => p.patterns.volumePattern === 'many', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (many — not a roster)` },
  { signal: 'auto_generated_headers', weight: -0.20, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
  { signal: 'high_numeric_ratio', weight: -0.10, test: p => p.structure.numericFieldRatio > 0.50, evidence: p => `${(p.structure.numericFieldRatio * 100).toFixed(0)}% numeric fields (>50%)` },
];

const TARGET_WEIGHTS: WeightRule[] = [
  { signal: 'has_entity_id', weight: 0.20, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier column present' },
  // OB-159: REMOVED containsTarget (+0.25) — Korean Test violation.
  // Target agent now relies on structural signals: numeric fields + low repeat + no temporal.
  { signal: 'has_numeric_fields', weight: 0.15, test: p => p.structure.numericFieldRatio > 0.30, evidence: p => `${(p.structure.numericFieldRatio * 100).toFixed(0)}% numeric fields (>30%)` },
  { signal: 'single_or_few_per_entity', weight: 0.15, test: p => p.patterns.volumePattern === 'single' || p.patterns.volumePattern === 'few', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (${p.patterns.volumePattern})` },
  { signal: 'no_date', weight: 0.10, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'has_currency', weight: 0.10, test: p => p.patterns.hasCurrencyColumns > 0 && p.patterns.hasCurrencyColumns <= 3, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns (1-3)` },
  { signal: 'clean_headers', weight: 0.05, test: p => p.structure.headerQuality === 'clean', evidence: () => 'clean headers' },
  { signal: 'no_entity_id', weight: -0.25, test: p => !p.patterns.hasEntityIdentifier, evidence: () => 'no entity identifier' },
  { signal: 'many_per_entity', weight: -0.20, test: p => p.patterns.volumePattern === 'many', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (many — not targets)` },
  { signal: 'auto_generated_headers', weight: -0.15, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
  { signal: 'high_sparsity', weight: -0.10, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
  { signal: 'has_temporal', weight: -0.15, test: p => p.patterns.hasDateColumn || p.patterns.hasTemporalColumns, evidence: () => 'temporal dimension present — data varies over time' },
];

const TRANSACTION_WEIGHTS: WeightRule[] = [
  { signal: 'has_date', weight: 0.25, test: p => p.patterns.hasDateColumn, evidence: () => 'date column present' },
  { signal: 'has_entity_id', weight: 0.15, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier present' },
  { signal: 'has_currency', weight: 0.15, test: p => p.patterns.hasCurrencyColumns > 0, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns` },
  // OB-159: Volume pattern replaces absolute row count
  { signal: 'many_per_entity', weight: 0.20, test: p => p.patterns.volumePattern === 'many', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (many — repeating events)` },
  { signal: 'few_per_entity', weight: 0.05, test: p => p.patterns.volumePattern === 'few', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (few)` },
  { signal: 'clean_headers', weight: 0.05, test: p => p.structure.headerQuality === 'clean', evidence: () => 'clean headers' },
  { signal: 'high_numeric_ratio', weight: 0.15, test: p => p.structure.numericFieldRatio > 0.50, evidence: p => `${(p.structure.numericFieldRatio * 100).toFixed(0)}% numeric fields (>50%)` },
  { signal: 'no_date', weight: -0.25, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'single_per_entity', weight: -0.10, test: p => p.patterns.volumePattern === 'single', evidence: p => `${p.structure.identifierRepeatRatio.toFixed(1)} rows/entity (single — not events)` },
  { signal: 'auto_generated_headers', weight: -0.15, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
  { signal: 'high_sparsity', weight: -0.10, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
];

const REFERENCE_WEIGHTS: WeightRule[] = [
  { signal: 'high_key_uniqueness', weight: 0.25, test: p => {
    return p.fields.some(f => f.distinctCount > 0 && f.distinctCount / Math.max(1, p.structure.rowCount) > 0.80);
  }, evidence: p => {
    const f = p.fields.find(f => f.distinctCount > 0 && f.distinctCount / Math.max(1, p.structure.rowCount) > 0.80);
    return f ? `${f.distinctCount}/${p.structure.rowCount} unique (${(f.distinctCount / Math.max(1, p.structure.rowCount) * 100).toFixed(0)}%)` : 'high key uniqueness';
  }},
  { signal: 'descriptive_columns', weight: 0.20, test: p => p.patterns.hasDescriptiveLabels, evidence: () => 'descriptive text columns present' },
  { signal: 'low_row_count', weight: 0.15, test: p => p.patterns.rowCountCategory === 'reference', evidence: p => `${p.structure.rowCount} rows (reference)` },
  { signal: 'no_date_column', weight: 0.10, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'no_entity_identifier', weight: 0.10, test: p => !p.patterns.hasEntityIdentifier, evidence: () => 'no entity identifier' },
  { signal: 'clean_headers', weight: 0.05, test: p => p.structure.headerQuality === 'clean', evidence: () => 'clean headers' },
  { signal: 'has_date_column', weight: -0.20, test: p => p.patterns.hasDateColumn, evidence: () => 'date column present' },
  { signal: 'transactional_rows', weight: -0.20, test: p => p.patterns.rowCountCategory === 'transactional', evidence: p => `${p.structure.rowCount} rows (transactional)` },
  { signal: 'has_entity_identifier', weight: -0.10, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier present' },
  { signal: 'high_sparsity', weight: -0.10, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
  { signal: 'auto_generated_headers', weight: -0.15, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
];

const AGENT_WEIGHTS: Record<AgentType, WeightRule[]> = {
  plan: PLAN_WEIGHTS,
  entity: ENTITY_WEIGHTS,
  target: TARGET_WEIGHTS,
  transaction: TRANSACTION_WEIGHTS,
  reference: REFERENCE_WEIGHTS,
};

// ============================================================
// SCORING — Signatures + Additive Weights + Round 2
// ============================================================

function scoreAgent(agent: AgentType, profile: ContentProfile): AgentScore {
  const weights = AGENT_WEIGHTS[agent];
  const signals: AgentSignal[] = [];
  let raw = 0;

  for (const rule of weights) {
    if (rule.test(profile)) {
      raw += rule.weight;
      signals.push({
        signal: rule.signal,
        weight: rule.weight,
        evidence: rule.evidence(profile),
      });
    }
  }

  const confidence = Math.max(0, Math.min(1, raw));

  const topSignals = signals
    .filter(s => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const reasoning = topSignals.length > 0
    ? `${agent} agent: ${topSignals.map(s => s.evidence).join('; ')}`
    : `${agent} agent: no positive signals`;

  return { agent, confidence, signals, reasoning };
}

/**
 * Compute additive scores with signature floors but WITHOUT Round 2 negotiation.
 * Used by classifyContentUnits in synaptic-ingestion-state.ts (Phase C consolidated pipeline).
 */
export function computeAdditiveScores(profile: ContentProfile): AgentScore[] {
  const agents: AgentType[] = ['plan', 'entity', 'target', 'transaction', 'reference'];

  // STEP 1: Detect composite signatures
  const signatures = detectSignatures(profile);

  // STEP 2: Compute additive scores (Round 1)
  const scores = agents.map(agent => scoreAgent(agent, profile));

  // STEP 3: Apply signature confidence floors
  for (const sig of signatures) {
    const agentScore = scores.find(s => s.agent === sig.agent);
    if (agentScore && agentScore.confidence < sig.confidence) {
      agentScore.confidence = sig.confidence;
      agentScore.signals.unshift({
        signal: `signature:${sig.signatureName}`,
        weight: sig.confidence,
        evidence: sig.matchedConditions.join('; '),
      });
      agentScore.reasoning = `Composite signature "${sig.signatureName}": ${sig.matchedConditions.join(', ')}. ${agentScore.reasoning}`;
    }
  }

  return scores;
}

/**
 * Full scoring pipeline: additive + signature floors + Round 2 negotiation.
 * Used by negotiation.ts for backward compatibility.
 * New code should use classifyContentUnits from synaptic-ingestion-state.ts.
 */
export function scoreContentUnit(profile: ContentProfile): AgentScore[] {
  const scores = computeAdditiveScores(profile);

  // Round 2 Negotiation — agents adjust based on each other's structural claims
  negotiateRound2(scores, profile);

  // Sort by confidence descending
  return scores.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================
// HEADER COMPREHENSION SIGNALS (OB-160C Phase 2)
// ADDITIVE: when headerComprehension is null, scoring works on structural signals only.
// ============================================================

export function applyHeaderComprehensionSignals(
  scores: AgentScore[],
  profile: ContentProfile,
): void {
  if (!profile.headerComprehension) return;

  const interpretations = profile.headerComprehension.interpretations;

  // Count columns by ColumnRole
  let temporalCount = 0;
  let measureCount = 0;
  let nameCount = 0;
  let attributeCount = 0;
  let referenceKeyCount = 0;

  for (const interp of Array.from(interpretations.values())) {
    switch (interp.columnRole) {
      case 'temporal': temporalCount++; break;
      case 'measure': measureCount++; break;
      case 'name': nameCount++; break;
      case 'attribute': attributeCount++; break;
      case 'reference_key': referenceKeyCount++; break;
    }
  }

  const totalColumns = interpretations.size;
  if (totalColumns === 0) return;

  const measureRatio = measureCount / totalColumns;
  const attributeRatio = attributeCount / totalColumns;

  // --- Transaction Agent signals from header comprehension ---
  const transaction = scores.find(s => s.agent === 'transaction');
  if (transaction) {
    if (temporalCount >= 1) {
      transaction.confidence += 0.10;
      transaction.signals.push({
        signal: 'hc_temporal_columns',
        weight: 0.10,
        evidence: `LLM identified ${temporalCount} temporal column(s)`,
      });
    }
    if (measureRatio > 0.40) {
      transaction.confidence += 0.08;
      transaction.signals.push({
        signal: 'hc_measure_heavy',
        weight: 0.08,
        evidence: `LLM identified ${(measureRatio * 100).toFixed(0)}% of columns as measures`,
      });
    }
  }

  // --- Entity Agent signals from header comprehension ---
  const entity = scores.find(s => s.agent === 'entity');
  if (entity) {
    if (nameCount >= 1) {
      entity.confidence += 0.10;
      entity.signals.push({
        signal: 'hc_name_column',
        weight: 0.10,
        evidence: `LLM identified ${nameCount} name column(s)`,
      });
    }
    if (attributeRatio > 0.30) {
      entity.confidence += 0.08;
      entity.signals.push({
        signal: 'hc_attribute_heavy',
        weight: 0.08,
        evidence: `LLM identified ${(attributeRatio * 100).toFixed(0)}% of columns as attributes`,
      });
    }
    if (temporalCount >= 2) {
      entity.confidence -= 0.10;
      entity.signals.push({
        signal: 'hc_temporal_not_roster',
        weight: -0.10,
        evidence: `LLM identified ${temporalCount} temporal columns — rosters don't have multiple temporal dimensions`,
      });
    }
  }

  // --- Target Agent signals from header comprehension ---
  const target = scores.find(s => s.agent === 'target');
  if (target) {
    if (temporalCount >= 1) {
      target.confidence -= 0.10;
      target.signals.push({
        signal: 'hc_temporal_not_targets',
        weight: -0.10,
        evidence: `LLM identified ${temporalCount} temporal column(s) — targets are static reference data`,
      });
    }
  }

  // --- Reference Agent signals from header comprehension ---
  // Decision 110: HC authority now derived from CRL seed priors, not hardcoded floors.
  // HC reference_key signals are collected as additive evidence for Bayesian resolution.
  const reference = scores.find(s => s.agent === 'reference');
  if (reference && referenceKeyCount >= 1) {
    reference.confidence += 0.15;
    reference.signals.push({
      signal: 'hc_reference_key',
      weight: 0.15,
      evidence: `LLM identified ${referenceKeyCount} reference key column(s)`,
    });
  }

  // Clamp all scores to [0, 1]
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
}

// ============================================================
// ROUND 2 NEGOTIATION — Spatial Intelligence
// OB-159: Agents see each other's scores and adjust.
// All adjustments reference structural properties.
// ============================================================

function negotiateRound2(scores: AgentScore[], profile: ContentProfile): void {
  const scoreMap = new Map(scores.map(s => [s.agent, s]));

  const transaction = scoreMap.get('transaction');
  const target = scoreMap.get('target');
  const entity = scoreMap.get('entity');

  const repeatRatio = profile.structure.identifierRepeatRatio;
  const hasTemporal = profile.patterns.hasDateColumn || profile.patterns.hasTemporalColumns;

  // Transaction vs Target: targets don't repeat 4x per entity
  if (transaction && target && target.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.25, (repeatRatio - 1.0) * 0.08);
    target.confidence = Math.max(0, target.confidence - penalty);
    target.signals.push({
      signal: 'r2_repeat_inconsistency',
      weight: -penalty,
      evidence: `Repeat ratio ${repeatRatio.toFixed(1)} contradicts target pattern (targets set once per entity)`,
    });
  }

  // Transaction boost: temporal + high repeat = transactional
  if (transaction && target && hasTemporal && repeatRatio > 1.5) {
    const boost = 0.10;
    transaction.confidence = Math.min(1, transaction.confidence + boost);
    transaction.signals.push({
      signal: 'r2_temporal_repeat_conviction',
      weight: boost,
      evidence: `Temporal markers + repeat ratio ${repeatRatio.toFixed(1)} confirm transactional pattern`,
    });
  }

  // Entity vs Transaction: rosters don't repeat
  if (entity && transaction && entity.confidence > 0.30 && repeatRatio > 2.0) {
    const penalty = Math.min(0.20, (repeatRatio - 1.0) * 0.07);
    entity.confidence = Math.max(0, entity.confidence - penalty);
    entity.signals.push({
      signal: 'r2_repeat_not_roster',
      weight: -penalty,
      evidence: `Repeat ratio ${repeatRatio.toFixed(1)} — rosters have ~1.0`,
    });
  }

  // Entity vs Target: high numeric ratio favors target over entity
  if (entity && target && Math.abs(entity.confidence - target.confidence) < 0.15) {
    const numericRatio = profile.structure.numericFieldRatio;
    if (numericRatio > 0.50) {
      const shift = 0.08;
      entity.confidence = Math.max(0, entity.confidence - shift);
      target.confidence = Math.min(1, target.confidence + shift);
    }
  }

  // Absence boost: clear winner gets small boost
  const sorted = scores.slice().sort((a, b) => b.confidence - a.confidence);
  if (sorted.length >= 2) {
    const gap = sorted[0].confidence - sorted[1].confidence;
    if (gap > 0.25) {
      sorted[0].confidence = Math.min(0.98, sorted[0].confidence + 0.05);
      sorted[0].signals.push({
        signal: 'r2_absence_clarity',
        weight: 0.05,
        evidence: `Gap of ${(gap * 100).toFixed(0)}% to next agent — high classification clarity`,
      });
    }
  }

  // Clamp all
  for (const s of scores) {
    s.confidence = Math.max(0, Math.min(1, s.confidence));
  }
}

// ============================================================
// CLAIM RESOLUTION (Phase 1)
// ============================================================

export function resolveClaimsPhase1(
  profile: ContentProfile,
  scores: AgentScore[]
): ContentClaim {
  const winner = scores[0];
  const runnerUp = scores[1];
  const gap = winner.confidence - (runnerUp?.confidence || 0);

  const semanticBindings = generateSemanticBindings(profile, winner.agent);

  return {
    contentUnitId: profile.contentUnitId,
    agent: winner.agent,
    claimType: 'FULL',
    confidence: winner.confidence,
    semanticBindings,
    reasoning: winner.reasoning + (gap < 0.10 ? ` (close call: gap ${gap.toFixed(2)} with ${runnerUp?.agent})` : ''),
  };
}

export function requiresHumanReview(scores: AgentScore[]): boolean {
  if (scores.length < 2) return false;
  const gap = scores[0].confidence - scores[1].confidence;
  return scores[0].confidence < 0.50 || gap < 0.10;
}

// ============================================================
// SEMANTIC BINDING GENERATION
// Decision 108: Uses HC columnRole when available, structural dataType as fallback.
// ============================================================

function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  return profile.fields.map(field => {
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcRole = hcInterp?.columnRole;
    const binding = assignSemanticRole(field, agent, hcRole);
    return {
      sourceField: field.fieldName,
      platformType: field.dataType,
      semanticRole: binding.role,
      displayLabel: field.fieldName,
      displayContext: binding.context,
      claimedBy: agent,
      confidence: binding.confidence,
    };
  });
}

function assignSemanticRole(
  field: ContentProfile['fields'][0],
  agent: AgentType,
  hcRole?: string,
): { role: SemanticRole; context: string; confidence: number } {
  // HC identifier or reference_key → entity_identifier regardless of agent
  if (hcRole === 'identifier' || hcRole === 'reference_key') {
    return { role: 'entity_identifier', context: `${field.fieldName} — identifier`, confidence: 0.90 };
  }
  // Structural sequential integer → entity_identifier
  if (field.dataType === 'integer' && field.distribution.isSequential) {
    return { role: 'entity_identifier', context: `${field.fieldName} — sequential identifier`, confidence: 0.85 };
  }

  switch (agent) {
    case 'plan': return assignPlanRole(field, hcRole);
    case 'entity': return assignEntityRole(field, hcRole);
    case 'target': return assignTargetRole(field, hcRole);
    case 'transaction': return assignTransactionRole(field, hcRole);
    case 'reference': return assignReferenceRole(field, hcRole);
  }
}

function assignPlanRole(field: ContentProfile['fields'][0], hcRole?: string): { role: SemanticRole; context: string; confidence: number } {
  if (field.dataType === 'percentage')
    return { role: 'rate_value', context: `Rule definition — rate/threshold value`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'payout_amount', context: `Rule definition — reward amount`, confidence: 0.75 };
  if (hcRole === 'measure')
    return { role: 'tier_boundary', context: `Rule definition — measure value`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `Rule definition — descriptive text`, confidence: 0.70 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'tier_boundary', context: `Rule definition — threshold value`, confidence: 0.65 };
  return { role: 'unknown', context: `Rule definition — unclassified field`, confidence: 0.30 };
}

function assignEntityRole(field: ContentProfile['fields'][0], hcRole?: string): { role: SemanticRole; context: string; confidence: number } {
  if (hcRole === 'name' || field.nameSignals.looksLikePersonName)
    return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
  // HF-098: Structural fallback — first column integer in entity sheet → entity_identifier
  // Without HC, sequential detection may miss non-contiguous IDs (e.g., 101, 205, 340).
  // First-column integer is the most common entity ID pattern across all locales.
  if (field.fieldIndex === 0 && (field.dataType === 'integer' || field.dataType === 'text'))
    return { role: 'entity_identifier', context: `${field.fieldName} — first column identifier`, confidence: 0.75 };
  if (hcRole === 'attribute')
    return { role: 'entity_attribute', context: `${field.fieldName} — attribute`, confidence: 0.75 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
  return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
}

function assignTargetRole(field: ContentProfile['fields'][0], hcRole?: string): { role: SemanticRole; context: string; confidence: number } {
  if (hcRole === 'measure')
    return { role: 'performance_target', context: `${field.fieldName} — measure/goal`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'baseline_value', context: `${field.fieldName} — baseline for comparison`, confidence: 0.70 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — grouping category`, confidence: 0.65 };
  if (field.dataType === 'text')
    return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified target field`, confidence: 0.30 };
}

function assignTransactionRole(field: ContentProfile['fields'][0], hcRole?: string): { role: SemanticRole; context: string; confidence: number } {
  if (hcRole === 'temporal' || field.dataType === 'date')
    return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
  if (field.dataType === 'currency')
    return { role: 'transaction_amount', context: `${field.fieldName} — monetary value`, confidence: 0.85 };
  if (hcRole === 'measure')
    return { role: 'transaction_count', context: `${field.fieldName} — measure`, confidence: 0.70 };
  if (field.dataType === 'integer')
    return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified event field`, confidence: 0.30 };
}

function assignReferenceRole(field: ContentProfile['fields'][0], hcRole?: string): { role: SemanticRole; context: string; confidence: number } {
  if (hcRole === 'name')
    return { role: 'descriptive_label', context: `${field.fieldName} — display label`, confidence: 0.85 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — category grouping`, confidence: 0.75 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `${field.fieldName} — descriptive text`, confidence: 0.65 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'baseline_value', context: `${field.fieldName} — reference value`, confidence: 0.55 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified reference field`, confidence: 0.30 };
}
