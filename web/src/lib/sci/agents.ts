// Synaptic Content Ingestion — Agent Scoring Models
// Decision 77 — OB-127, OB-159 Unified Scoring Overhaul
// Five specialist agents with structural heuristic scoring.
// Korean Test: scoring uses structural properties only. Zero field-name matching.

import type {
  ContentProfile, AgentType, AgentScore,
  ContentClaim, SemanticBinding, SemanticRole,
} from './sci-types';
import { isEntityIdentifierAgent } from './sci-types'; // HF-285-B (value import)

// ============================================================
// HF-341 R6: the structural agent scoring (5 WeightRule registries, scoreAgent,
// computeAdditiveScores, applyHeaderComprehensionSignals, the Round-2 negotiation,
// scoreContentUnit) is DELETED. Classification is derived from the LLM expression
// (expression-classifier.ts); resolver.ts synthesizes the score vector this module
// once produced. What remains here is claim/binding/semantic-role assignment, which
// reads the (now expression-derived) classification + the HC interpretations.
// ============================================================

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
// Decision 108: Uses HC data_nature when available, structural dataType as fallback.
// ============================================================

function generateSemanticBindings(profile: ContentProfile, agent: AgentType): SemanticBinding[] {
  const hc = profile.headerComprehension;
  const rowCount = profile.structure.rowCount ?? profile.fields.length;
  return profile.fields.map(field => {
    // HF-373 Phase G (D10): pass the FULL HeaderInterpretation — the bare primitives
    // (nature_role/scope_role, HF-368/HF-372) are the recognition this path was DROPPING
    // (only the data_nature prose was passed, then regex-scanned; a decimal measure whose
    // prose lacked an English keyword fell to 'unknown' and the HF-247 gate blocked the
    // fingerprint on 5 of 6 live Datos imports, while prose luck poisoned the 6th).
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const binding = assignSemanticRole(field, agent, hcInterp, rowCount);
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

// ============================================================
// HF-373 Phase G (D10) — BARE-PRIMITIVE READERS (registry subtraction; the FULL-claim twin
// of negotiation.ts HF-372 Phase C). The OB-231 NATURE_IS_* word-boundary regexes over the
// model's free-form data_nature prose are DELETED — they were per-run roulette (English
// keywords in translated prose) and the direct root cause of D10: 'unknown' semanticRoles
// blocking the fingerprint write AND the \bperiod\b-in-measure-prose transaction_date
// poison. Each predicate reads the model's OWN bare primitive by EQUALITY. The HF-171
// identifies-prose ENTITY_TYPES/RECORD_TYPES word lists are subtracted too: scope_role IS
// the model's answer to "what does this identify" (entity | transaction | reference | none).
// A recognition the model did not render reads as SILENT -> the structural dataType arms
// (a legitimate structural fallback, not a default classification).
// ============================================================

type HcInterp = { data_nature?: string; identifies?: string; nature_role?: string; scope_role?: string } | undefined;

const natureIsIdentifier = (i: HcInterp) => !!i && i.nature_role === 'identifier' && i.scope_role !== 'reference';
const natureIsReferenceKey = (i: HcInterp) => !!i && i.nature_role === 'identifier' && i.scope_role === 'reference';
const natureIsMeasure = (i: HcInterp) => !!i && i.nature_role === 'measure';
const natureIsTemporal = (i: HcInterp) => !!i && i.nature_role === 'temporal';
const natureIsName = (i: HcInterp) => !!i && i.nature_role === 'name';
const natureIsAttribute = (i: HcInterp) => !!i && i.nature_role === 'categorical';
const natureIsSilent = (i: HcInterp) => !i || !(i.nature_role && i.nature_role.trim());

export function assignSemanticRole(  // exported for HF-373 Phase G deterministic tests
  field: ContentProfile['fields'][0],
  agent: AgentType,
  interp: HcInterp,
  rowCount: number = 0,
): { role: SemanticRole; context: string; confidence: number } {
  // HF-171 -> HF-373: LLM-primary identifier classification, now via the bare primitives.
  // scope_role names WHAT the column identifies -- no identifies-prose word list.
  if (natureIsIdentifier(interp)) {
    if (interp?.scope_role === 'entity') {
      return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (model: scope_role=entity)`, confidence: 0.95 };
    }
    if (interp?.scope_role === 'transaction') {
      return { role: 'transaction_identifier', context: `${field.fieldName} — record identifier (model: scope_role=transaction)`, confidence: 0.95 };
    }
    // scope_role 'none'/absent: classification-aware fallback (HF-285-B), then cardinality (HF-169).
    if (isEntityIdentifierAgent(agent)) {
      return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (entity-classified sheet, HF-285-B)`, confidence: 0.85 };
    }
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — per-row identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%, no scope primitive)`, confidence: 0.80 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.85 };
  }

  // HF-186: a reference-scope identifier (dimensional lookup key). For the ENTITY agent it is a
  // hierarchical/dimension link, never this row's own identifier.
  if (natureIsReferenceKey(interp)) {
    if (agent === 'entity') {
      return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical reference (HF-186: entity-agent reference key → entity_relationship)`, confidence: 0.75 };
    }
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — per-row reference key`, confidence: 0.90 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — reference key`, confidence: 0.90 };
  }

  // HF-196 Phase 1G — structural fallback ONLY when the model rendered no nature primitive
  // (Decision 108: HC Override Authority Hierarchy LOCKED; twin of negotiation.ts natureIsSilent).
  if (natureIsSilent(interp) && field.dataType === 'integer' && field.distribution.isSequential) {
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — sequential entity identifier (HC silent)`, confidence: 0.75 };
  }

  switch (agent) {
    case 'plan': return assignPlanRole(field, interp);
    case 'entity': return assignEntityRole(field, interp);
    case 'target': return assignTargetRole(field, interp);
    case 'transaction': return assignTransactionRole(field, interp);
    case 'reference': return assignReferenceRole(field, interp);
  }
}

function assignPlanRole(field: ContentProfile['fields'][0], interp?: HcInterp): { role: SemanticRole; context: string; confidence: number } {
  if (field.dataType === 'percentage')
    return { role: 'rate_value', context: `Rule definition — rate/threshold value`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'payout_amount', context: `Rule definition — reward amount`, confidence: 0.75 };
  if (natureIsMeasure(interp))
    return { role: 'tier_boundary', context: `Rule definition — measure value`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `Rule definition — descriptive text`, confidence: 0.70 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'tier_boundary', context: `Rule definition — threshold value`, confidence: 0.65 };
  return { role: 'unknown', context: `Rule definition — unclassified field`, confidence: 0.30 };
}

function assignEntityRole(field: ContentProfile['fields'][0], interp?: HcInterp): { role: SemanticRole; context: string; confidence: number } {
  if (natureIsName(interp) || field.nameSignals.looksLikePersonName)
    return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
  // HF-098: Structural fallback — first column integer in entity sheet → entity_identifier
  if (field.fieldIndex === 0 && (field.dataType === 'integer' || field.dataType === 'text'))
    return { role: 'entity_identifier', context: `${field.fieldName} — first column identifier`, confidence: 0.75 };
  if (natureIsAttribute(interp))
    return { role: 'entity_attribute', context: `${field.fieldName} — attribute`, confidence: 0.75 };
  // HF-373 Phase G: a measure column on an entity sheet (a roster metric) is an attribute-carried
  // measure, never 'unknown' — the bare primitive names it.
  if (natureIsMeasure(interp))
    return { role: 'entity_attribute', context: `${field.fieldName} — measured property (model: nature_role=measure)`, confidence: 0.75 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
  return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
}

function assignTargetRole(field: ContentProfile['fields'][0], interp?: HcInterp): { role: SemanticRole; context: string; confidence: number } {
  if (natureIsMeasure(interp))
    return { role: 'performance_target', context: `${field.fieldName} — measure/goal`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'baseline_value', context: `${field.fieldName} — baseline for comparison`, confidence: 0.70 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — grouping category`, confidence: 0.65 };
  if (field.dataType === 'text')
    return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified target field`, confidence: 0.30 };
}

function assignTransactionRole(field: ContentProfile['fields'][0], interp?: HcInterp): { role: SemanticRole; context: string; confidence: number } {
  // HF-373 Phase G (D10): the bare primitives decide REGARDLESS of platformType. Pre-HF-373
  // a decimal/boolean measure whose prose missed the English regex fell to 'unknown'@0.3
  // (fingerprint blocked, 5/6 live runs), and \bperiod\b in a measure's prose hit the
  // TEMPORAL regex first (5 measures cached as transaction_date — the poisoned fingerprint).
  if (natureIsTemporal(interp) || (natureIsSilent(interp) && field.dataType === 'date'))
    return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
  if (natureIsMeasure(interp)) {
    if (field.dataType === 'currency')
      return { role: 'transaction_amount', context: `${field.fieldName} — monetary measure`, confidence: 0.85 };
    return { role: 'transaction_count', context: `${field.fieldName} — measure (model: nature_role=measure)`, confidence: 0.80 };
  }
  if (natureIsName(interp) || natureIsAttribute(interp))
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  // structural fallbacks (model silent)
  if (field.dataType === 'currency')
    return { role: 'transaction_amount', context: `${field.fieldName} — monetary value`, confidence: 0.85 };
  if (field.dataType === 'integer')
    return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
  if (field.dataType === 'decimal')
    return { role: 'transaction_count', context: `${field.fieldName} — numeric measure (structural)`, confidence: 0.55 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified event field`, confidence: 0.30 };
}

function assignReferenceRole(field: ContentProfile['fields'][0], interp?: HcInterp): { role: SemanticRole; context: string; confidence: number } {
  if (natureIsName(interp))
    return { role: 'descriptive_label', context: `${field.fieldName} — display label`, confidence: 0.85 };
  if (natureIsMeasure(interp))
    return { role: 'baseline_value', context: `${field.fieldName} — reference measure`, confidence: 0.70 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — category grouping`, confidence: 0.75 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `${field.fieldName} — descriptive text`, confidence: 0.65 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'baseline_value', context: `${field.fieldName} — reference value`, confidence: 0.55 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified reference field`, confidence: 0.30 };
}
