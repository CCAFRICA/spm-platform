// Synaptic Content Ingestion — Negotiation Engine
// OB-134 — Spatial intelligence + field-level claims
// OB-159 — Adapted for unified scoring (signatures + round 2 in agents.ts)
// Zero domain vocabulary. Korean Test applies.

import type {
  ContentProfile,
  FieldProfile,
  AgentType,
  AgentScore,
  ContentClaim,
  SemanticBinding,
  FieldAffinity,
  NegotiationResult,
  NegotiationLogEntry,
} from './sci-types';
import { scoreContentUnit, resolveClaimsPhase1, requiresHumanReview } from './agents';

// ============================================================
// FIELD AFFINITY WEIGHTS
// ============================================================

interface FieldAffinityRule {
  test: (f: FieldProfile) => boolean;
  affinities: Record<AgentType, number>;
}

const FIELD_AFFINITY_RULES: FieldAffinityRule[] = [
  // Entity identifier — entity owns it, but target + transaction need it as join key
  {
    test: f => f.nameSignals.containsId,
    affinities: { entity: 0.90, target: 0.70, transaction: 0.70, plan: 0.10, reference: 0.30 },
  },
  // Name fields → entity (header-based or structural)
  {
    test: f => f.nameSignals.containsName || f.nameSignals.looksLikePersonName,
    affinities: { entity: 0.90, target: 0.20, transaction: 0.10, plan: 0.10, reference: 0.50 },
  },
  // Date fields → transaction
  {
    test: f => f.nameSignals.containsDate || f.dataType === 'date',
    affinities: { transaction: 0.90, entity: 0.10, target: 0.20, plan: 0.10, reference: 0.05 },
  },
  // Amount/currency fields → transaction, then target
  {
    test: f => f.nameSignals.containsAmount || f.dataType === 'currency',
    affinities: { transaction: 0.80, target: 0.60, entity: 0.10, plan: 0.30, reference: 0.10 },
  },
  // Target fields → target
  {
    test: f => f.nameSignals.containsTarget,
    affinities: { target: 0.90, entity: 0.20, transaction: 0.20, plan: 0.10, reference: 0.10 },
  },
  // Rate/percentage → plan, then target
  {
    test: f => f.nameSignals.containsRate || f.dataType === 'percentage',
    affinities: { plan: 0.80, target: 0.50, transaction: 0.20, entity: 0.10, reference: 0.10 },
  },
  // Low-cardinality text (categorical) → entity attribute or category code
  {
    test: f => f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 20,
    affinities: { entity: 0.60, transaction: 0.40, target: 0.30, plan: 0.20, reference: 0.40 },
  },
  // Sequential integers → likely IDs
  {
    test: f => f.dataType === 'integer' && !!f.distribution.isSequential,
    affinities: { entity: 0.70, target: 0.40, transaction: 0.40, plan: 0.10, reference: 0.30 },
  },
];

// ============================================================
// FIELD AFFINITY SCORING
// ============================================================

function scoreFieldAffinity(field: FieldProfile): Record<AgentType, number> {
  const affinities: Record<AgentType, number> = { plan: 0, entity: 0, target: 0, transaction: 0, reference: 0 };
  let matchCount = 0;

  for (const rule of FIELD_AFFINITY_RULES) {
    if (rule.test(field)) {
      for (const agent of ['plan', 'entity', 'target', 'transaction', 'reference'] as AgentType[]) {
        affinities[agent] = Math.max(affinities[agent], rule.affinities[agent]);
      }
      matchCount++;
    }
  }

  if (matchCount === 0) {
    affinities.plan = 0.20;
    affinities.entity = 0.20;
    affinities.target = 0.20;
    affinities.transaction = 0.20;
    affinities.reference = 0.20;
  }

  return affinities;
}

function computeFieldAffinities(profile: ContentProfile): FieldAffinity[] {
  return profile.fields.map(field => {
    const affinities = scoreFieldAffinity(field);

    const entries = Object.entries(affinities) as [AgentType, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const winner = entries[0][0];
    const isShared = field.nameSignals.containsId;

    return {
      fieldName: field.fieldName,
      affinities,
      winner,
      isShared,
    };
  });
}

// ============================================================
// SPLIT DETECTION
// ============================================================

const SPLIT_THRESHOLD = 0.30;

interface SplitAnalysis {
  shouldSplit: boolean;
  primaryAgent: AgentType;
  secondaryAgent: AgentType | null;
  primaryFields: string[];
  secondaryFields: string[];
  sharedFields: string[];
  reasoning: string;
}

function analyzeSplit(
  fieldAffinities: FieldAffinity[],
  round2Scores: AgentScore[],
  log: NegotiationLogEntry[]
): SplitAnalysis {
  if (round2Scores.length < 2) {
    return {
      shouldSplit: false,
      primaryAgent: round2Scores[0]?.agent || 'transaction',
      secondaryAgent: null,
      primaryFields: fieldAffinities.map(f => f.fieldName),
      secondaryFields: [],
      sharedFields: [],
      reasoning: 'Single agent — no split possible',
    };
  }

  const top = round2Scores[0];
  const runnerUp = round2Scores[1];
  const gap = top.confidence - runnerUp.confidence;

  if (gap > 0.25) {
    log.push({
      stage: 'split_decision',
      message: `No split: clear winner ${top.agent} (gap ${(gap * 100).toFixed(0)}%)`,
      data: { gap, top: top.agent, runnerUp: runnerUp.agent },
    });
    return {
      shouldSplit: false,
      primaryAgent: top.agent,
      secondaryAgent: null,
      primaryFields: fieldAffinities.map(f => f.fieldName),
      secondaryFields: [],
      sharedFields: [],
      reasoning: `Clear winner: ${top.agent} by ${(gap * 100).toFixed(0)}%`,
    };
  }

  const fieldsByAgent = new Map<AgentType, string[]>();
  const sharedFields: string[] = [];

  for (const fa of fieldAffinities) {
    if (fa.isShared) sharedFields.push(fa.fieldName);
    if (!fieldsByAgent.has(fa.winner)) fieldsByAgent.set(fa.winner, []);
    fieldsByAgent.get(fa.winner)!.push(fa.fieldName);
  }

  const totalFields = fieldAffinities.length;
  const runnerUpFields = fieldsByAgent.get(runnerUp.agent) || [];
  const runnerUpRatio = runnerUpFields.length / totalFields;

  if (runnerUpRatio >= SPLIT_THRESHOLD) {
    const primaryFields = fieldsByAgent.get(top.agent) || [];
    const secondaryFields: string[] = [];
    for (const fa of fieldAffinities) {
      if (fa.winner === runnerUp.agent) {
        secondaryFields.push(fa.fieldName);
      } else if (fa.winner !== top.agent && !fa.isShared) {
        secondaryFields.push(fa.fieldName);
      }
    }

    log.push({
      stage: 'split_decision',
      message: `SPLIT: ${top.agent} owns ${primaryFields.length} fields, ${runnerUp.agent} owns ${secondaryFields.length} fields, ${sharedFields.length} shared`,
      data: {
        primaryAgent: top.agent, primaryCount: primaryFields.length,
        secondaryAgent: runnerUp.agent, secondaryCount: secondaryFields.length,
        sharedCount: sharedFields.length,
      },
    });

    return {
      shouldSplit: true,
      primaryAgent: top.agent,
      secondaryAgent: runnerUp.agent,
      primaryFields,
      secondaryFields,
      sharedFields,
      reasoning: `Mixed content: ${top.agent} (${primaryFields.length} fields) + ${runnerUp.agent} (${secondaryFields.length} fields)`,
    };
  }

  log.push({
    stage: 'split_decision',
    message: `No split: ${runnerUp.agent} fields too few (${runnerUpFields.length}/${totalFields} = ${(runnerUpRatio * 100).toFixed(0)}% < ${(SPLIT_THRESHOLD * 100).toFixed(0)}%)`,
    data: { runnerUpRatio, runnerUpAgent: runnerUp.agent, threshold: SPLIT_THRESHOLD },
  });

  return {
    shouldSplit: false,
    primaryAgent: top.agent,
    secondaryAgent: null,
    primaryFields: fieldAffinities.map(f => f.fieldName),
    secondaryFields: [],
    sharedFields: [],
    reasoning: `${top.agent} wins — runner-up ${runnerUp.agent} claims too few fields (${(runnerUpRatio * 100).toFixed(0)}%)`,
  };
}

// ============================================================
// SEMANTIC BINDING FOR PARTIAL CLAIMS
// ============================================================

function generatePartialBindings(
  profile: ContentProfile,
  agent: AgentType,
  ownedFields: string[],
  sharedFields: string[]
): SemanticBinding[] {
  const relevantFields = new Set([...ownedFields, ...sharedFields]);
  const bindings: SemanticBinding[] = [];

  for (const field of profile.fields) {
    if (!relevantFields.has(field.fieldName)) continue;

    const role = inferRoleForAgent(field, agent);
    bindings.push({
      sourceField: field.fieldName,
      platformType: field.dataType,
      semanticRole: role.role,
      displayLabel: field.fieldName,
      displayContext: role.context,
      claimedBy: agent,
      confidence: role.confidence,
    });
  }

  return bindings;
}

function inferRoleForAgent(
  field: FieldProfile,
  agent: AgentType
): { role: SemanticBinding['semanticRole']; context: string; confidence: number } {
  if (field.nameSignals.containsId) {
    return { role: 'entity_identifier', context: `${field.fieldName} — links to entity`, confidence: 0.90 };
  }

  switch (agent) {
    case 'entity':
      if (field.nameSignals.containsName) return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
      if (field.nameSignals.looksLikePersonName) return { role: 'entity_name', context: `${field.fieldName} — display name (structural)`, confidence: 0.80 };
      if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20) return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
      return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };

    case 'target':
      if (field.nameSignals.containsTarget) return { role: 'performance_target', context: `${field.fieldName} — goal value`, confidence: 0.90 };
      if (field.dataType === 'currency' || field.nameSignals.containsAmount) return { role: 'baseline_value', context: `${field.fieldName} — baseline`, confidence: 0.70 };
      if (field.dataType === 'text') return { role: 'category_code', context: `${field.fieldName} — grouping`, confidence: 0.60 };
      return { role: 'unknown', context: `${field.fieldName} — unclassified`, confidence: 0.30 };

    case 'transaction':
      if (field.nameSignals.containsDate || field.dataType === 'date') return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
      if (field.dataType === 'currency' || field.nameSignals.containsAmount) return { role: 'transaction_amount', context: `${field.fieldName} — event value`, confidence: 0.85 };
      if (field.dataType === 'integer') return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
      if (field.dataType === 'text') return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.60 };
      return { role: 'unknown', context: `${field.fieldName} — unclassified`, confidence: 0.30 };

    case 'plan':
      if (field.dataType === 'percentage' || field.nameSignals.containsRate) return { role: 'rate_value', context: `${field.fieldName} — rate/threshold`, confidence: 0.80 };
      if (field.dataType === 'currency' || field.nameSignals.containsAmount) return { role: 'payout_amount', context: `${field.fieldName} — reward amount`, confidence: 0.75 };
      if (field.dataType === 'text') return { role: 'descriptive_label', context: `${field.fieldName} — rule text`, confidence: 0.65 };
      return { role: 'tier_boundary', context: `${field.fieldName} — threshold`, confidence: 0.50 };

    case 'reference':
      if (field.nameSignals.containsName) return { role: 'descriptive_label', context: `${field.fieldName} — display label`, confidence: 0.85 };
      if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20) return { role: 'category_code', context: `${field.fieldName} — category`, confidence: 0.75 };
      if (field.dataType === 'text') return { role: 'descriptive_label', context: `${field.fieldName} — descriptive text`, confidence: 0.65 };
      return { role: 'unknown', context: `${field.fieldName} — unclassified reference field`, confidence: 0.30 };
  }
}

// ============================================================
// MAIN NEGOTIATION ENGINE
// ============================================================

export function negotiateRound2(profile: ContentProfile): NegotiationResult {
  const log: NegotiationLogEntry[] = [];

  // OB-159: scoreContentUnit now includes signatures + round 2 negotiation
  const round1Scores = scoreContentUnit(profile);
  log.push({
    stage: 'round1',
    message: `Scores: ${round1Scores.map(s => `${s.agent}=${(s.confidence * 100).toFixed(0)}%`).join(', ')}`,
    data: Object.fromEntries(round1Scores.map(s => [s.agent, s.confidence])),
  });

  // Field affinity analysis
  const fieldAffinities = computeFieldAffinities(profile);

  const fieldsByWinner = new Map<AgentType, number>();
  for (const fa of fieldAffinities) {
    fieldsByWinner.set(fa.winner, (fieldsByWinner.get(fa.winner) || 0) + 1);
  }
  log.push({
    stage: 'field_analysis',
    message: `Field affinities: ${Array.from(fieldsByWinner.entries()).map(([a, n]) => `${a}=${n}`).join(', ')}`,
    data: Object.fromEntries(fieldsByWinner),
  });

  // Split decision
  const splitAnalysis = analyzeSplit(fieldAffinities, round1Scores, log);

  // Build claims
  const claims: ContentClaim[] = [];
  const round2Scores = round1Scores;

  if (splitAnalysis.shouldSplit && splitAnalysis.secondaryAgent) {
    const primaryBindings = generatePartialBindings(
      profile, splitAnalysis.primaryAgent,
      splitAnalysis.primaryFields, splitAnalysis.sharedFields
    );
    const secondaryBindings = generatePartialBindings(
      profile, splitAnalysis.secondaryAgent,
      splitAnalysis.secondaryFields, splitAnalysis.sharedFields
    );

    const primaryScore = round1Scores.find(s => s.agent === splitAnalysis.primaryAgent);
    const secondaryScore = round1Scores.find(s => s.agent === splitAnalysis.secondaryAgent);

    claims.push({
      contentUnitId: profile.contentUnitId,
      agent: splitAnalysis.primaryAgent,
      claimType: 'PARTIAL',
      confidence: primaryScore?.confidence || 0,
      fields: splitAnalysis.primaryFields,
      sharedFields: splitAnalysis.sharedFields,
      semanticBindings: primaryBindings,
      reasoning: `${splitAnalysis.primaryAgent}: owns ${splitAnalysis.primaryFields.length} fields (PARTIAL)`,
    });

    claims.push({
      contentUnitId: `${profile.contentUnitId}::split`,
      agent: splitAnalysis.secondaryAgent,
      claimType: 'PARTIAL',
      confidence: secondaryScore?.confidence || 0,
      fields: splitAnalysis.secondaryFields,
      sharedFields: splitAnalysis.sharedFields,
      semanticBindings: secondaryBindings,
      reasoning: `${splitAnalysis.secondaryAgent}: owns ${splitAnalysis.secondaryFields.length} fields (PARTIAL)`,
    });

    log.push({
      stage: 'round2',
      message: `PARTIAL: ${splitAnalysis.primaryAgent} (${splitAnalysis.primaryFields.length} fields) + ${splitAnalysis.secondaryAgent} (${splitAnalysis.secondaryFields.length} fields), shared: [${splitAnalysis.sharedFields.join(', ')}]`,
    });
  } else {
    const fullClaim = resolveClaimsPhase1(profile, round1Scores);
    claims.push(fullClaim);

    log.push({
      stage: 'round2',
      message: `FULL: ${fullClaim.agent} wins at ${(fullClaim.confidence * 100).toFixed(0)}%`,
    });
  }

  return {
    contentUnitId: profile.contentUnitId,
    round1Scores,
    round2Scores,
    fieldAffinities,
    claims,
    isSplit: splitAnalysis.shouldSplit,
    log,
  };
}

// Re-export for convenience
export { requiresHumanReview };
