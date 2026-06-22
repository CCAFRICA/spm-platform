// Synaptic Content Ingestion — Negotiation Engine
// OB-134 — Spatial intelligence + field-level claims
// OB-159 — Adapted for unified scoring (signatures + round 2 in agents.ts)
// OB-231 — Free-form column characterization (data_nature) replaces the retired role enum.
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
  HeaderInterpretation,
} from './sci-types';
import { isEntityIdentifierAgent } from './sci-types'; // HF-285-B (value import)
import { scoreContentUnit, resolveClaimsPhase1, requiresHumanReview } from './agents';

// ============================================================
// OB-231 — CHARACTERIZATION READERS (file-local, free-form; no shared enum utility).
// Each predicate reads the LLM's own words (data_nature + characterization + identifies) via a
// tolerant regex — NOT equality against a quoted role literal (so the EPG holds) and NOT a shared
// classification surface. Mirrors the readers in header-comprehension.ts; kept local per design.
// ============================================================

const natureNorm = (interp: HeaderInterpretation): string =>
  `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`.toLowerCase();

function natureIsTemporal(interp: HeaderInterpretation): boolean {
  return /\b(date|time|temporal|month|year|quarter|period|day|week|timestamp|fecha)\b/i.test(natureNorm(interp));
}
function natureIsMeasure(interp: HeaderInterpretation): boolean {
  return /\b(measure|metric|amount|quantity|count|numeric|value|sum|total|monto|importe)\b/i.test(`${interp.data_nature ?? ''}`.toLowerCase());
}
function natureIsName(interp: HeaderInterpretation): boolean {
  return /\b(name|nombre|display[_ ]?name|full[_ ]?name|label)\b/i.test(natureNorm(interp));
}
function natureIsIdentifier(interp: HeaderInterpretation): boolean {
  return /\b(identifier|identif|\bid\b|document|dni|code|número|numero|key)\b/i.test(natureNorm(interp));
}
// A reference-key nature is an identifier that points at another sheet/dimension rather than this row.
function natureIsReferenceKey(interp: HeaderInterpretation): boolean {
  return /\b(reference[_ ]?key|ref[_ ]?key|foreign[_ ]?key|lookup[_ ]?key|hierarch|reports[_ ]?to|points[_ ]?to|link)\b/i.test(natureNorm(interp));
}
function natureIsAttribute(interp: HeaderInterpretation): boolean {
  return /\b(attribute|categor|property|tag|flag|status|type|class|grouping|atributo)\b/i.test(natureNorm(interp));
}
// HC is "silent" when there is no interpretation, or its words convey no recognizable nature.
function natureIsSilent(interp?: HeaderInterpretation): boolean {
  if (!interp) return true;
  return !(
    natureIsTemporal(interp) ||
    natureIsMeasure(interp) ||
    natureIsName(interp) ||
    natureIsIdentifier(interp) ||
    natureIsReferenceKey(interp) ||
    natureIsAttribute(interp)
  );
}

// ============================================================
// FIELD AFFINITY WEIGHTS
// ============================================================

// HC-aware field affinity rules (Decision 108)
// Uses the HC data_nature characterization when available, falls back to structural/dataType detection
interface HCFieldAffinityRule {
  test: (f: FieldProfile, hc?: HeaderInterpretation) => boolean;
  affinities: Record<AgentType, number>;
}

const FIELD_AFFINITY_RULES: HCFieldAffinityRule[] = [
  // HF-196 Phase 1G Path α — Site 4: HC-primacy gating on entity-identifier affinity (Decision 108).
  // HC identifier nature produces affinity. Structural arm (integer && isSequential) only contributes
  // when HC is silent on that column (preserves cold-start / flywheel-roleMap-miss capability).
  {
    test: (f, hc) => (!!hc && !natureIsReferenceKey(hc) && natureIsIdentifier(hc)) ||
      (natureIsSilent(hc) && f.dataType === 'integer' && !!f.distribution.isSequential),
    affinities: { entity: 0.90, target: 0.70, transaction: 0.70, plan: 0.10, reference: 0.30 },
  },
  // Name fields → entity (HC name nature or structural person-name detection)
  {
    test: (f, hc) => (!!hc && natureIsName(hc)) || f.nameSignals.looksLikePersonName,
    affinities: { entity: 0.90, target: 0.20, transaction: 0.10, plan: 0.10, reference: 0.50 },
  },
  // Temporal fields → transaction (HC temporal nature or date dataType)
  {
    test: (f, hc) => (!!hc && natureIsTemporal(hc)) || f.dataType === 'date',
    affinities: { transaction: 0.90, entity: 0.10, target: 0.20, plan: 0.10, reference: 0.05 },
  },
  // Currency/monetary fields → transaction, then target (dataType-based, not header substring)
  {
    test: (f) => f.dataType === 'currency',
    affinities: { transaction: 0.80, target: 0.60, entity: 0.10, plan: 0.30, reference: 0.10 },
  },
  // Reference key fields → reference
  {
    test: (_f, hc) => !!hc && natureIsReferenceKey(hc),
    affinities: { reference: 0.90, entity: 0.20, transaction: 0.10, target: 0.10, plan: 0.05 },
  },
  // Rate/percentage → plan, then target (dataType-based)
  {
    test: (f) => f.dataType === 'percentage',
    affinities: { plan: 0.80, target: 0.50, transaction: 0.20, entity: 0.10, reference: 0.10 },
  },
  // HC measure nature → transaction or target depending on context
  {
    test: (_f, hc) => !!hc && !natureIsReferenceKey(hc) && !natureIsIdentifier(hc) && natureIsMeasure(hc),
    affinities: { transaction: 0.60, target: 0.50, entity: 0.10, plan: 0.20, reference: 0.10 },
  },
  // HC attribute nature → entity or reference
  {
    test: (_f, hc) => !!hc && natureIsAttribute(hc),
    affinities: { entity: 0.60, reference: 0.50, transaction: 0.30, target: 0.20, plan: 0.10 },
  },
  // Low-cardinality text (categorical) → entity attribute or category code
  {
    test: f => f.dataType === 'text' && f.distinctCount > 0 && f.distinctCount < 20,
    affinities: { entity: 0.60, transaction: 0.40, target: 0.30, plan: 0.20, reference: 0.40 },
  },
  // HF-196 Phase 1G Path α — Site 5: Sequential integers → IDs (HC silent only) per Decision 108.
  {
    test: (f, hc) => natureIsSilent(hc) &&
      f.dataType === 'integer' && !!f.distribution.isSequential,
    affinities: { entity: 0.70, target: 0.40, transaction: 0.40, plan: 0.10, reference: 0.30 },
  },
];

// ============================================================
// FIELD AFFINITY SCORING
// ============================================================

function scoreFieldAffinity(field: FieldProfile, hc?: HeaderInterpretation): Record<AgentType, number> {
  const affinities: Record<AgentType, number> = { plan: 0, entity: 0, target: 0, transaction: 0, reference: 0 };
  let matchCount = 0;

  for (const rule of FIELD_AFFINITY_RULES) {
    if (rule.test(field, hc)) {
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

export function computeFieldAffinities(profile: ContentProfile): FieldAffinity[] {
  const hc = profile.headerComprehension;

  return profile.fields.map(field => {
    // Get HC interpretation if available
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const affinities = scoreFieldAffinity(field, hcInterp);

    const entries = Object.entries(affinities) as [AgentType, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const winner = entries[0][0];
    // HF-196 Phase 1G Path α — Site 6: Shared-field flag with HC primacy (Decision 108).
    // HC identifier nature marks the field shared. Structural arm marks shared only when HC is silent.
    const isShared = (!!hcInterp && !natureIsReferenceKey(hcInterp) && natureIsIdentifier(hcInterp)) ||
      (natureIsSilent(hcInterp) && field.dataType === 'integer' && !!field.distribution.isSequential);

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

export interface SplitAnalysis {
  shouldSplit: boolean;
  primaryAgent: AgentType;
  secondaryAgent: AgentType | null;
  primaryFields: string[];
  secondaryFields: string[];
  sharedFields: string[];
  reasoning: string;
}

export function analyzeSplit(
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

export function generatePartialBindings(
  profile: ContentProfile,
  agent: AgentType,
  ownedFields: string[],
  sharedFields: string[]
): SemanticBinding[] {
  const relevantFields = new Set([...ownedFields, ...sharedFields]);
  const bindings: SemanticBinding[] = [];
  const hc = profile.headerComprehension;
  const rowCount = profile.structure.rowCount ?? profile.fields.length;

  for (const field of profile.fields) {
    if (!relevantFields.has(field.fieldName)) continue;

    const hcInterp = hc?.interpretations.get(field.fieldName);
    const identifies = hcInterp?.identifies;
    const role = inferRoleForAgent(field, agent, hcInterp, rowCount, identifies);
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
  agent: AgentType,
  hc?: HeaderInterpretation,
  rowCount: number = 0,
  identifies?: string,
): { role: SemanticBinding['semanticRole']; context: string; confidence: number } {
  // HF-171: LLM-Primary identifier classification. Same logic as assignSemanticRole.
  const ENTITY_TYPES = ['person', 'employee', 'organization', 'account', 'customer', 'client', 'member'];
  const RECORD_TYPES = ['transaction', 'order', 'invoice', 'receipt', 'record', 'ticket'];

  // OB-231: an identifier nature that is NOT a reference key (its own-row identifier).
  const hcIsOwnIdentifier = !!hc && !natureIsReferenceKey(hc) && natureIsIdentifier(hc);

  // HF-196 Phase 1G — HC-primary identifier branch (Decision 108: HC Override Authority Hierarchy LOCKED).
  // HC primacy: structural arm previously coupled here via OR-peer construction is split into a separate
  // HC-silence-gated branch below, restoring HF-095 Phase 2 stated intent ("HC primary, structural fallback").
  if (hcIsOwnIdentifier) {
    // LLM-Primary
    if (identifies) {
      const iw = identifies.toLowerCase();
      if (ENTITY_TYPES.some(t => iw.includes(t))) {
        return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (LLM: ${identifies})`, confidence: 0.95 };
      }
      if (RECORD_TYPES.some(t => iw.includes(t))) {
        return { role: 'transaction_identifier', context: `${field.fieldName} — record identifier (LLM: ${identifies})`, confidence: 0.95 };
      }
      return { role: 'entity_identifier', context: `${field.fieldName} — identifier (LLM: ${identifies})`, confidence: 0.85 };
    }
    // HF-285-B: classification-aware fallback (twin of agents.ts:assignSemanticRole;
    // T1-E952 — fix both arms). Entity/target-classified identifier → entity_identifier
    // regardless of cardinality; cardinality→transaction_identifier is transaction/reference only.
    if (isEntityIdentifierAgent(agent)) {
      return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (entity-classified sheet, HF-285-B)`, confidence: 0.85 };
    }
    // Deterministic Fallback: cardinality (transaction/reference)
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — per-row identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%, no LLM context)`, confidence: 0.80 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.85 };
  }

  // HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108).
  // Preserves classification capability for cold-start / flywheel-roleMap-miss / LLM-error scenarios
  // while preventing structural override of HC-confident measure/attribute interpretations
  // (closes Cantidad_Productos_Cruzados misclassification: HC said measure@0.90; OR-peer arm
  // overrode to entity_identifier because distinct integer values formed consecutive sequence).
  if (natureIsSilent(hc) && field.dataType === 'integer' && !!field.distribution.isSequential) {
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent, uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.75 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — sequential identifier (HC silent, cardinality ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.75 };
  }

  // HC reference-key nature → agent-aware mapping
  if (!!hc && natureIsReferenceKey(hc)) {
    // HF-186: For entity agent, a reference key means hierarchical link (e.g., reports_to → manager).
    // NOT this row's own identifier. Maps to entity_relationship instead.
    if (agent === 'entity') {
      return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical reference`, confidence: 0.75 };
    }
    // For target/transaction/reference agents, the reference key IS the entity link
    if (identifies) {
      const iw = identifies.toLowerCase();
      if (ENTITY_TYPES.some(t => iw.includes(t))) {
        return { role: 'entity_identifier', context: `${field.fieldName} — entity ref key (LLM: ${identifies})`, confidence: 0.95 };
      }
      if (RECORD_TYPES.some(t => iw.includes(t))) {
        return { role: 'transaction_identifier', context: `${field.fieldName} — record ref key (LLM: ${identifies})`, confidence: 0.95 };
      }
    }
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — per-row reference key`, confidence: 0.90 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — reference key`, confidence: 0.90 };
  }

  switch (agent) {
    case 'entity':
      if ((!!hc && natureIsName(hc)) || field.nameSignals.looksLikePersonName) return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
      // HF-098: Structural fallback — first column in entity sheet → entity_identifier
      if (field.fieldIndex === 0 && (field.dataType === 'integer' || field.dataType === 'text')) return { role: 'entity_identifier', context: `${field.fieldName} — first column identifier`, confidence: 0.75 };
      if (!!hc && natureIsAttribute(hc)) return { role: 'entity_attribute', context: `${field.fieldName} — attribute`, confidence: 0.75 };
      if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20) return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
      return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };

    case 'target':
      if (!!hc && natureIsMeasure(hc)) return { role: 'performance_target', context: `${field.fieldName} — measure/goal`, confidence: 0.80 };
      if (field.dataType === 'currency') return { role: 'baseline_value', context: `${field.fieldName} — baseline`, confidence: 0.70 };
      if (field.dataType === 'text') return { role: 'category_code', context: `${field.fieldName} — grouping`, confidence: 0.60 };
      return { role: 'unknown', context: `${field.fieldName} — unclassified`, confidence: 0.30 };

    case 'transaction':
      if ((!!hc && natureIsTemporal(hc)) || field.dataType === 'date') return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
      if (field.dataType === 'currency') return { role: 'transaction_amount', context: `${field.fieldName} — event value`, confidence: 0.85 };
      if (!!hc && natureIsMeasure(hc)) return { role: 'transaction_count', context: `${field.fieldName} — measure`, confidence: 0.70 };
      if (field.dataType === 'integer') return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
      if (field.dataType === 'text') return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.60 };
      return { role: 'unknown', context: `${field.fieldName} — unclassified`, confidence: 0.30 };

    case 'plan':
      if (field.dataType === 'percentage') return { role: 'rate_value', context: `${field.fieldName} — rate/threshold`, confidence: 0.80 };
      if (field.dataType === 'currency') return { role: 'payout_amount', context: `${field.fieldName} — reward amount`, confidence: 0.75 };
      if (field.dataType === 'text') return { role: 'descriptive_label', context: `${field.fieldName} — rule text`, confidence: 0.65 };
      return { role: 'tier_boundary', context: `${field.fieldName} — threshold`, confidence: 0.50 };

    case 'reference':
      if (!!hc && natureIsName(hc)) return { role: 'descriptive_label', context: `${field.fieldName} — display label`, confidence: 0.85 };
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
