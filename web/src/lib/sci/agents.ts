// Synaptic Content Ingestion — Agent Scoring Models
// Decision 77 — OB-127
// Four specialist agents with structural heuristic scoring.
// Zero domain vocabulary. Korean Test applies.

import type {
  ContentProfile, AgentType, AgentScore, AgentSignal,
  ContentClaim, SemanticBinding, SemanticRole,
} from './sci-types';

// ============================================================
// AGENT WEIGHT DEFINITIONS
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
  { signal: 'has_name_field', weight: 0.20, test: p => p.fields.some(f => f.nameSignals.containsName), evidence: () => 'name field detected' },
  { signal: 'moderate_rows', weight: 0.15, test: p => p.patterns.rowCountCategory === 'moderate', evidence: p => `${p.structure.rowCount} rows (moderate)` },
  { signal: 'categorical_attributes', weight: 0.10, test: p => p.fields.filter(f => f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 20).length >= 2, evidence: () => '2+ categorical text fields' },
  { signal: 'has_license_field', weight: 0.10, test: p => p.fields.some(f => { const l = f.fieldName.toLowerCase(); return l.includes('license') || l.includes('licencia') || l.includes('product'); }), evidence: () => 'license/product field detected' },
  { signal: 'no_date', weight: 0.05, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'high_currency', weight: -0.10, test: p => p.patterns.hasCurrencyColumns > 2, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns (>2)` },
  { signal: 'transactional_rows', weight: -0.15, test: p => p.patterns.rowCountCategory === 'transactional', evidence: p => `${p.structure.rowCount} rows (transactional)` },
  { signal: 'auto_generated_headers', weight: -0.20, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
];

const TARGET_WEIGHTS: WeightRule[] = [
  { signal: 'has_entity_id', weight: 0.20, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier column present' },
  { signal: 'has_target_field', weight: 0.25, test: p => p.fields.some(f => f.nameSignals.containsTarget), evidence: () => 'target/goal field detected' },
  { signal: 'reference_rows', weight: 0.15, test: p => p.patterns.rowCountCategory === 'reference', evidence: p => `${p.structure.rowCount} rows (reference)` },
  { signal: 'has_currency', weight: 0.10, test: p => p.patterns.hasCurrencyColumns > 0 && p.patterns.hasCurrencyColumns <= 3, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns (1-3)` },
  { signal: 'no_date', weight: 0.10, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'clean_headers', weight: 0.05, test: p => p.structure.headerQuality === 'clean', evidence: () => 'clean headers' },
  { signal: 'no_entity_id', weight: -0.25, test: p => !p.patterns.hasEntityIdentifier, evidence: () => 'no entity identifier' },
  { signal: 'transactional_rows', weight: -0.15, test: p => p.patterns.rowCountCategory === 'transactional', evidence: p => `${p.structure.rowCount} rows (transactional)` },
  { signal: 'auto_generated_headers', weight: -0.15, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
  { signal: 'high_sparsity', weight: -0.10, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
];

const TRANSACTION_WEIGHTS: WeightRule[] = [
  { signal: 'has_date', weight: 0.25, test: p => p.patterns.hasDateColumn, evidence: () => 'date column present' },
  { signal: 'has_entity_id', weight: 0.15, test: p => p.patterns.hasEntityIdentifier, evidence: () => 'entity identifier present' },
  { signal: 'has_currency', weight: 0.15, test: p => p.patterns.hasCurrencyColumns > 0, evidence: p => `${p.patterns.hasCurrencyColumns} currency columns` },
  { signal: 'transactional_rows', weight: 0.20, test: p => p.patterns.rowCountCategory === 'transactional', evidence: p => `${p.structure.rowCount} rows (transactional)` },
  { signal: 'moderate_rows', weight: 0.05, test: p => p.patterns.rowCountCategory === 'moderate', evidence: p => `${p.structure.rowCount} rows (moderate)` },
  { signal: 'clean_headers', weight: 0.05, test: p => p.structure.headerQuality === 'clean', evidence: () => 'clean headers' },
  { signal: 'no_date', weight: -0.25, test: p => !p.patterns.hasDateColumn, evidence: () => 'no date column' },
  { signal: 'reference_rows', weight: -0.10, test: p => p.patterns.rowCountCategory === 'reference', evidence: p => `${p.structure.rowCount} rows (reference)` },
  { signal: 'auto_generated_headers', weight: -0.15, test: p => p.structure.headerQuality === 'auto_generated', evidence: () => 'auto-generated headers' },
  { signal: 'high_sparsity', weight: -0.10, test: p => p.structure.sparsity > 0.30, evidence: p => `sparsity ${(p.structure.sparsity * 100).toFixed(0)}% > 30%` },
];

const AGENT_WEIGHTS: Record<AgentType, WeightRule[]> = {
  plan: PLAN_WEIGHTS,
  entity: ENTITY_WEIGHTS,
  target: TARGET_WEIGHTS,
  transaction: TRANSACTION_WEIGHTS,
};

// ============================================================
// SCORING
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

  // Clamp to 0.0 - 1.0
  const confidence = Math.max(0, Math.min(1, raw));

  // Generate reasoning from top 3 contributing signals
  const topSignals = signals
    .filter(s => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const reasoning = topSignals.length > 0
    ? `${agent} agent: ${topSignals.map(s => s.evidence).join('; ')}`
    : `${agent} agent: no positive signals`;

  return { agent, confidence, signals, reasoning };
}

export function scoreContentUnit(profile: ContentProfile): AgentScore[] {
  const agents: AgentType[] = ['plan', 'entity', 'target', 'transaction'];
  return agents
    .map(agent => scoreAgent(agent, profile))
    .sort((a, b) => b.confidence - a.confidence);
}

// ============================================================
// CLAIM RESOLUTION (Phase 1 — no negotiation)
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
// ============================================================

function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  return profile.fields.map(field => {
    const binding = assignSemanticRole(field, agent);
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
  agent: AgentType
): { role: SemanticRole; context: string; confidence: number } {
  switch (agent) {
    case 'plan':
      return assignPlanRole(field);
    case 'entity':
      return assignEntityRole(field);
    case 'target':
      return assignTargetRole(field);
    case 'transaction':
      return assignTransactionRole(field);
  }
}

function assignPlanRole(field: ContentProfile['fields'][0]): { role: SemanticRole; context: string; confidence: number } {
  if (field.dataType === 'percentage' || field.nameSignals.containsRate)
    return { role: 'rate_value', context: `Rule definition — rate/threshold value`, confidence: 0.80 };
  if (field.dataType === 'currency' || field.nameSignals.containsAmount)
    return { role: 'payout_amount', context: `Rule definition — reward amount`, confidence: 0.75 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `Rule definition — descriptive text`, confidence: 0.70 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'tier_boundary', context: `Rule definition — threshold value`, confidence: 0.65 };
  return { role: 'unknown', context: `Rule definition — unclassified field`, confidence: 0.30 };
}

function assignEntityRole(field: ContentProfile['fields'][0]): { role: SemanticRole; context: string; confidence: number } {
  if (field.nameSignals.containsId)
    return { role: 'entity_identifier', context: `${field.fieldName} — unique identifier`, confidence: 0.90 };
  if (field.nameSignals.containsName)
    return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
  const lower = field.fieldName.toLowerCase();
  if (lower.includes('license') || lower.includes('licencia') || lower.includes('product'))
    return { role: 'entity_license', context: `${field.fieldName} — access permission`, confidence: 0.80 };
  if (lower.includes('manager') || lower.includes('parent') || lower.includes('reports'))
    return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical link`, confidence: 0.75 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
  return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
}

function assignTargetRole(field: ContentProfile['fields'][0]): { role: SemanticRole; context: string; confidence: number } {
  if (field.nameSignals.containsId)
    return { role: 'entity_identifier', context: `${field.fieldName} — links target to entity`, confidence: 0.90 };
  if (field.nameSignals.containsTarget)
    return { role: 'performance_target', context: `${field.fieldName} — goal/benchmark value`, confidence: 0.90 };
  if ((field.dataType === 'currency' || field.nameSignals.containsAmount) && !field.nameSignals.containsTarget)
    return { role: 'baseline_value', context: `${field.fieldName} — baseline for comparison`, confidence: 0.70 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — grouping category`, confidence: 0.65 };
  if (field.dataType === 'text')
    return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified target field`, confidence: 0.30 };
}

function assignTransactionRole(field: ContentProfile['fields'][0]): { role: SemanticRole; context: string; confidence: number } {
  if (field.nameSignals.containsId)
    return { role: 'entity_identifier', context: `${field.fieldName} — links event to entity`, confidence: 0.85 };
  if (field.nameSignals.containsDate || field.dataType === 'date')
    return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
  if (field.dataType === 'currency' || field.nameSignals.containsAmount)
    return { role: 'transaction_amount', context: `${field.fieldName} — monetary value`, confidence: 0.85 };
  if (field.dataType === 'integer' && !field.nameSignals.containsId)
    return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified event field`, confidence: 0.30 };
}
