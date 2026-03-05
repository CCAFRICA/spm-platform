// Synaptic Content Ingestion — Proposal Intelligence Generator
// OB-138 — Surfaces agent reasoning as structured intelligence.
// Pure deterministic — no AI calls. Transforms existing scoring data.
// Zero domain vocabulary. Korean Test applies.

import type {
  ContentProfile,
  AgentType,
  AgentScore,
  NegotiationResult,
} from './sci-types';

// ============================================================
// TYPES
// ============================================================

export interface ProposalIntelligence {
  observations: string[];       // structural facts the agent noticed
  verdictSummary: string;       // one-line decision explanation
  whatChangesMyMind: string[];  // falsifiable conditions that would flip classification
}

// ============================================================
// CLASSIFICATION VOCABULARY (customer-facing)
// ============================================================

const AGENT_LABELS: Record<AgentType, string> = {
  plan: 'plan rules',
  entity: 'team roster',
  target: 'performance targets',
  transaction: 'operational data',
  reference: 'reference data',
};

// ============================================================
// OBSERVATIONS
// ============================================================
// Discrete facts about the data structure. Each is a falsifiable statement.

function buildObservations(
  profile: ContentProfile,
  scores: AgentScore[],
  negotiation: NegotiationResult,
): string[] {
  const obs: string[] = [];
  const { structure, patterns, fields } = profile;

  // Row count observation
  if (patterns.rowCountCategory === 'transactional') {
    obs.push(`${structure.rowCount.toLocaleString()} rows — high volume, typical of event records`);
  } else if (patterns.rowCountCategory === 'moderate') {
    obs.push(`${structure.rowCount} rows — moderate volume, typical of roster or target data`);
  } else {
    obs.push(`${structure.rowCount} rows — low volume, could be reference data or rule definitions`);
  }

  // Header quality
  if (structure.headerQuality === 'auto_generated') {
    obs.push('Headers are auto-generated (__EMPTY pattern) — content may lack column labels');
  } else if (structure.headerQuality === 'clean') {
    obs.push(`${structure.columnCount} columns with readable headers`);
  }

  // Key structural patterns
  if (patterns.hasEntityIdentifier) {
    const idField = fields.find(f => f.nameSignals.containsId);
    if (idField) {
      obs.push(`"${idField.fieldName}" looks like an identifier — ${idField.distinctCount} unique values`);
    } else {
      obs.push('Entity identifier column detected');
    }
  }

  if (patterns.hasDateColumn) {
    const dateField = fields.find(f => f.nameSignals.containsDate || f.dataType === 'date');
    if (dateField) {
      obs.push(`"${dateField.fieldName}" contains dates — timestamps for events`);
    }
  }

  if (patterns.hasCurrencyColumns > 0) {
    const currFields = fields.filter(f => f.dataType === 'currency' || f.nameSignals.containsAmount);
    if (currFields.length === 1) {
      obs.push(`"${currFields[0].fieldName}" contains monetary values`);
    } else if (currFields.length > 1) {
      obs.push(`${currFields.length} columns with monetary values`);
    }
  }

  if (patterns.hasPercentageValues) {
    obs.push('Percentage values detected — may indicate rates or thresholds');
  }

  // OB-159: Identifier repeat ratio (now in structure)
  if (structure.identifierRepeatRatio > 3.0) {
    obs.push(`Entity IDs repeat ~${structure.identifierRepeatRatio.toFixed(1)}x — same entities appear in multiple rows`);
  } else if (structure.identifierRepeatRatio > 0 && structure.identifierRepeatRatio <= 1.5) {
    obs.push(`Entity IDs are ~unique (repeat ratio ${structure.identifierRepeatRatio.toFixed(1)}) — one row per entity`);
  }

  // OB-159: Volume pattern
  if (patterns.volumePattern === 'many') {
    obs.push(`Volume pattern: many rows per entity — typical of event/transaction data`);
  } else if (patterns.volumePattern === 'single') {
    obs.push(`Volume pattern: one row per entity — typical of roster or reference data`);
  }

  // OB-159: Numeric field ratio (now in structure)
  if (structure.numericFieldRatio > 0.50) {
    obs.push(`${(structure.numericFieldRatio * 100).toFixed(0)}% of fields are numeric — data-heavy layout`);
  }

  // OB-158: Structural name column
  if (patterns.hasStructuralNameColumn) {
    const nameField = fields.find(f => f.nameSignals.looksLikePersonName);
    if (nameField) {
      obs.push(`"${nameField.fieldName}" contains person names (structural detection)`);
    }
  }

  // Sparsity
  if (structure.sparsity > 0.30) {
    obs.push(`${(structure.sparsity * 100).toFixed(0)}% of cells are empty — sparse layout typical of rule definitions`);
  }

  // Field affinity observation (from negotiation)
  if (negotiation.fieldAffinities.length > 0) {
    const fieldsByAgent = new Map<AgentType, number>();
    for (const fa of negotiation.fieldAffinities) {
      fieldsByAgent.set(fa.winner, (fieldsByAgent.get(fa.winner) || 0) + 1);
    }
    const total = negotiation.fieldAffinities.length;
    const entries = Array.from(fieldsByAgent.entries())
      .sort((a, b) => b[1] - a[1]);

    if (entries.length > 1 && entries[1][1] / total >= 0.25) {
      obs.push(
        `Fields split: ${entries[0][1]} align with ${AGENT_LABELS[entries[0][0]]}, ` +
        `${entries[1][1]} align with ${AGENT_LABELS[entries[1][0]]}`
      );
    }
  }

  // Close call observation
  if (scores.length >= 2) {
    const gap = scores[0].confidence - scores[1].confidence;
    if (gap < 0.10) {
      obs.push(
        `Close call: ${AGENT_LABELS[scores[0].agent]} ` +
        `(${(scores[0].confidence * 100).toFixed(0)}%) vs ` +
        `${AGENT_LABELS[scores[1].agent]} ` +
        `(${(scores[1].confidence * 100).toFixed(0)}%)`
      );
    }
  }

  return obs;
}

// ============================================================
// VERDICT SUMMARY
// ============================================================
// One-line natural language explanation of why this classification was chosen.

function buildVerdictSummary(
  winner: AgentType,
  scores: AgentScore[],
  profile: ContentProfile,
  negotiation: NegotiationResult,
): string {
  const winnerScore = scores.find(s => s.agent === winner);
  if (!winnerScore) return `Classified as ${AGENT_LABELS[winner]}.`;

  // Build from the top positive signals
  const positiveSignals = winnerScore.signals
    .filter(s => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  if (positiveSignals.length === 0) {
    return `Classified as ${AGENT_LABELS[winner]} by elimination — no strong signals for any type.`;
  }

  // Natural language evidence summaries per agent
  const evidenceParts: string[] = [];

  for (const sig of positiveSignals.slice(0, 3)) {
    evidenceParts.push(humanizeEvidence(sig.signal, sig.evidence));
  }

  // Split verdict
  if (negotiation.isSplit) {
    const secondary = negotiation.claims[1];
    if (secondary) {
      return `Mixed content — ${AGENT_LABELS[winner]} fields coexist with ${AGENT_LABELS[secondary.agent]} fields. Splitting this sheet.`;
    }
  }

  const evidenceStr = joinNaturalList(evidenceParts);
  return `This looks like ${AGENT_LABELS[winner]}: ${evidenceStr}.`;
}

function humanizeEvidence(signal: string, evidence: string): string {
  // Convert technical signal names into human-readable fragments
  switch (signal) {
    case 'has_date': return 'has a date column';
    case 'transactional_rows': return 'high row count typical of event data';
    case 'moderate_rows': return 'moderate row count';
    case 'has_entity_id': return 'has an identifier column';
    case 'has_name_field': return 'has a name column';
    case 'has_structural_name': return 'has a name column (structural detection)';
    case 'has_target_field': return 'has goal/target values';
    case 'has_numeric_fields': return 'has numeric measurement columns';
    case 'single_per_entity': return 'one row per entity (roster pattern)';
    case 'few_per_entity': return 'few rows per entity';
    case 'many_per_entity': return 'many rows per entity (event pattern)';
    case 'single_or_few_per_entity': return 'low rows per entity (target pattern)';
    case 'high_numeric_ratio': return 'high proportion of numeric columns';
    case 'has_currency': return 'contains monetary values';
    case 'auto_generated_headers': return 'headers suggest unstructured layout';
    case 'high_sparsity': return 'sparse layout typical of rule tables';
    case 'percentage_values': return 'contains percentage values';
    case 'descriptive_labels': return 'has descriptive text columns';
    case 'low_row_count': return 'low row count';
    case 'reference_rows': return 'low row count typical of reference data';
    case 'clean_headers': return 'has readable column headers';
    case 'categorical_attributes': return 'has categorical attributes';
    case 'has_license_field': return 'has a license/product field';
    case 'no_date': return 'no date column';
    case 'no_entity_id': return 'no identifier column';
    case 'has_temporal': return 'has temporal dimension';
    case 'r2_temporal_repeat_conviction': return 'temporal markers + repeating entities confirm events';
    case 'r2_absence_clarity': return 'clear classification with no close competitor';
    default:
      if (signal.startsWith('signature:')) return `composite signature: ${evidence}`;
      return evidence;
  }
}

function joinNaturalList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

// ============================================================
// WHAT CHANGES MY MIND (FALSIFIABILITY)
// ============================================================
// Conditions under which the classification would flip to something else.

function buildWhatChangesMyMind(
  winner: AgentType,
  scores: AgentScore[],
  profile: ContentProfile,
): string[] {
  const conditions: string[] = [];
  const runnerUp = scores.find(s => s.agent !== winner);

  if (!runnerUp) return conditions;

  // Agent-specific falsifiability based on what would flip the decision
  switch (winner) {
    case 'transaction': {
      if (profile.patterns.hasDateColumn) {
        conditions.push(
          `If the date column contains birth dates or hire dates, this is likely ${AGENT_LABELS['entity']} data`
        );
      }
      if (profile.patterns.hasCurrencyColumns > 0) {
        conditions.push(
          `If monetary values represent goals rather than actuals, this could be ${AGENT_LABELS['target']} data`
        );
      }
      if (profile.patterns.rowCountCategory === 'moderate') {
        conditions.push(
          `If each row represents a different person (not repeated events), this might be ${AGENT_LABELS['entity']} or ${AGENT_LABELS['target']} data`
        );
      }
      break;
    }
    case 'entity': {
      if (!profile.patterns.hasDateColumn) {
        conditions.push(
          `If a date column was missed, this could be ${AGENT_LABELS['transaction']} data`
        );
      }
      if (profile.fields.some(f => f.nameSignals.containsTarget || f.nameSignals.containsAmount)) {
        conditions.push(
          `If the numeric columns represent goals, this could be ${AGENT_LABELS['target']} data`
        );
      }
      break;
    }
    case 'target': {
      conditions.push(
        `If values change over time (not fixed goals), this may be ${AGENT_LABELS['transaction']} data`
      );
      if (profile.patterns.hasEntityIdentifier) {
        conditions.push(
          `If there are no performance metrics, this is likely just ${AGENT_LABELS['entity']} data`
        );
      }
      break;
    }
    case 'plan': {
      conditions.push(
        `If the sparse layout is due to missing data (not structure), this could be ${AGENT_LABELS[runnerUp.agent]} data`
      );
      if (profile.structure.headerQuality === 'auto_generated') {
        conditions.push(
          'If proper headers exist in a different row, the classification may change'
        );
      }
      break;
    }
  }

  // Runner-up proximity
  const gap = scores[0].confidence - runnerUp.confidence;
  if (gap < 0.15 && gap >= 0.01) {
    conditions.push(
      `${AGENT_LABELS[runnerUp.agent]} scored close ` +
      `(${(runnerUp.confidence * 100).toFixed(0)}% vs ${(scores[0].confidence * 100).toFixed(0)}%) — ` +
      `a small structural change could flip this`
    );
  }

  return conditions;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export function generateProposalIntelligence(
  profile: ContentProfile,
  scores: AgentScore[],
  negotiation: NegotiationResult,
  winner: AgentType,
): ProposalIntelligence {
  return {
    observations: buildObservations(profile, scores, negotiation),
    verdictSummary: buildVerdictSummary(winner, scores, profile, negotiation),
    whatChangesMyMind: buildWhatChangesMyMind(winner, scores, profile),
  };
}
