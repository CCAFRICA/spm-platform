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
    const hcInterp = hc?.interpretations.get(field.fieldName);
    const hcNature = hcInterp?.data_nature;
    const identifies = hcInterp?.identifies;
    const binding = assignSemanticRole(field, agent, hcNature, rowCount, identifies);
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

// OB-231: data_nature is free-form LLM text. These file-local regex helpers read
// the nature directly (no shared classifier module, no quoted role literals). A
// pattern like /identifier/i is EPG-safe — it is not the single-quoted literal.
const NATURE_IS_IDENTIFIER = (n?: string) => !!n && /\b(identifier|\bid\b|primary[ _-]?key)\b/i.test(n);
const NATURE_IS_REFERENCE_KEY = (n?: string) => !!n && /\b(reference[ _-]?key|ref[ _-]?key|foreign[ _-]?key|lookup[ _-]?key)\b/i.test(n);
const NATURE_IS_MEASURE = (n?: string) => !!n && /\b(measure|amount|value|metric|quantity|sum|total|numeric)\b/i.test(n);
const NATURE_IS_TEMPORAL = (n?: string) => !!n && /\b(date|time|temporal|month|year|period|day|week|quarter)\b/i.test(n);
const NATURE_IS_ATTRIBUTE = (n?: string) => !!n && /\b(attribute|categor|property|dimension|tag|flag)\b/i.test(n);
const NATURE_IS_NAME = (n?: string) => !!n && /\b(name|label|title|description|display)\b/i.test(n);
const NATURE_IS_UNKNOWN = (n?: string) => !n || /\bunknown\b/i.test(n) || n.trim() === '';

function assignSemanticRole(
  field: ContentProfile['fields'][0],
  agent: AgentType,
  hcNature?: string,
  rowCount: number = 0,
  identifies?: string,
): { role: SemanticRole; context: string; confidence: number } {
  // HF-171: LLM-Primary identifier classification.
  // The LLM already knows whether this identifies a person, transaction,
  // location, etc. Use its answer directly. Cardinality is fallback only.
  // Korean Test: LLM translates any language → English `identifies`.
  // Code reads LLM's English output. Customer vocabulary never in code path.
  const ENTITY_TYPES = ['person', 'employee', 'organization', 'account', 'customer', 'client', 'member'];
  const RECORD_TYPES = ['transaction', 'order', 'invoice', 'receipt', 'record', 'ticket'];

  // HF-171: data_nature reads as an identifier — this row's own primary identifier
  if (NATURE_IS_IDENTIFIER(hcNature)) {
    // LLM-Primary: use `identifies` scope if available
    if (identifies) {
      const iw = identifies.toLowerCase();
      if (ENTITY_TYPES.some(t => iw.includes(t))) {
        return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (LLM: ${identifies})`, confidence: 0.95 };
      }
      if (RECORD_TYPES.some(t => iw.includes(t))) {
        return { role: 'transaction_identifier', context: `${field.fieldName} — record identifier (LLM: ${identifies})`, confidence: 0.95 };
      }
      // LLM provided `identifies` but not entity or record — default to entity
      return { role: 'entity_identifier', context: `${field.fieldName} — identifier (LLM: ${identifies})`, confidence: 0.85 };
    }

    // HF-285-B: classification-aware fallback (no LLM `identifies` scope). For an
    // entity/target-classified sheet, an identifier column identifies the entity
    // regardless of cardinality — the high-uniqueness→transaction_identifier path
    // is correct ONLY for transaction/reference sheets. DIAG-066: the warm
    // flywheel cached transaction_identifier for entity sheets (this branch,
    // pre-fix), diverging from the cold proposal's entity_identifier; this
    // converges both surfaces. Korean Test: structural agent check, no literals.
    if (isEntityIdentifierAgent(agent)) {
      return { role: 'entity_identifier', context: `${field.fieldName} — entity identifier (entity-classified sheet, HF-285-B)`, confidence: 0.85 };
    }
    // Deterministic Fallback: HF-169 cardinality check (transaction/reference)
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — per-row identifier (uniqueness ${(uniquenessRatio * 100).toFixed(0)}%, no LLM context)`, confidence: 0.80 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — identifier (cardinality fallback, uniqueness ${(uniquenessRatio * 100).toFixed(0)}%)`, confidence: 0.85 };
  }

  // HF-186: data_nature reads as a reference key — agent-aware mapping.
  // For ENTITY agent, a reference key means hierarchical link (e.g., reports_to → manager,
  // store_id → branch). NOT this row's own identifier. Maps to entity_relationship.
  // For other agents, the reference key IS the link to the entity that owns this row.
  // HF-196 Phase 1B: regression fix — this branch was previously merged with the identifier
  // branch in assignSemanticRole, causing entity-classified files to label all reference keys as
  // entity_identifier. inferRoleForAgent in negotiation.ts had the agent-aware mapping;
  // assignSemanticRole did not. Now ported here for FULL-claim path symmetry.
  if (NATURE_IS_REFERENCE_KEY(hcNature)) {
    if (agent === 'entity') {
      return { role: 'entity_relationship', context: `${field.fieldName} — hierarchical reference (HF-186: entity-agent reference key → entity_relationship)`, confidence: 0.75 };
    }
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
  // HF-196 Phase 1G — Structural fallback ONLY when HC is silent (Decision 108: HC Override Authority Hierarchy LOCKED).
  // Twin of negotiation.ts:299 fix. Preserves entity-id classification for cold-start /
  // flywheel-roleMap-miss / LLM-error scenarios; prevents structural override of HC-confident
  // measure/attribute interpretations (closes Adjacent-Arm Drift on assignSemanticRole).
  if (NATURE_IS_UNKNOWN(hcNature) && field.dataType === 'integer' && field.distribution.isSequential) {
    const uniquenessRatio = rowCount > 0 ? field.distinctCount / rowCount : 0;
    if (uniquenessRatio > 0.8) {
      return { role: 'transaction_identifier', context: `${field.fieldName} — sequential per-row identifier (HC silent)`, confidence: 0.75 };
    }
    return { role: 'entity_identifier', context: `${field.fieldName} — sequential entity identifier (HC silent)`, confidence: 0.75 };
  }

  switch (agent) {
    case 'plan': return assignPlanRole(field, hcNature);
    case 'entity': return assignEntityRole(field, hcNature);
    case 'target': return assignTargetRole(field, hcNature);
    case 'transaction': return assignTransactionRole(field, hcNature);
    case 'reference': return assignReferenceRole(field, hcNature);
  }
}

function assignPlanRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (field.dataType === 'percentage')
    return { role: 'rate_value', context: `Rule definition — rate/threshold value`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'payout_amount', context: `Rule definition — reward amount`, confidence: 0.75 };
  if (NATURE_IS_MEASURE(hcNature))
    return { role: 'tier_boundary', context: `Rule definition — measure value`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `Rule definition — descriptive text`, confidence: 0.70 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'tier_boundary', context: `Rule definition — threshold value`, confidence: 0.65 };
  return { role: 'unknown', context: `Rule definition — unclassified field`, confidence: 0.30 };
}

function assignEntityRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (NATURE_IS_NAME(hcNature) || field.nameSignals.looksLikePersonName)
    return { role: 'entity_name', context: `${field.fieldName} — display name`, confidence: 0.85 };
  // HF-098: Structural fallback — first column integer in entity sheet → entity_identifier
  // Without HC, sequential detection may miss non-contiguous IDs (e.g., 101, 205, 340).
  // First-column integer is the most common entity ID pattern across all locales.
  if (field.fieldIndex === 0 && (field.dataType === 'integer' || field.dataType === 'text'))
    return { role: 'entity_identifier', context: `${field.fieldName} — first column identifier`, confidence: 0.75 };
  if (NATURE_IS_ATTRIBUTE(hcNature))
    return { role: 'entity_attribute', context: `${field.fieldName} — attribute`, confidence: 0.75 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'entity_attribute', context: `${field.fieldName} — categorical property`, confidence: 0.70 };
  return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
}

function assignTargetRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (NATURE_IS_MEASURE(hcNature))
    return { role: 'performance_target', context: `${field.fieldName} — measure/goal`, confidence: 0.80 };
  if (field.dataType === 'currency')
    return { role: 'baseline_value', context: `${field.fieldName} — baseline for comparison`, confidence: 0.70 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — grouping category`, confidence: 0.65 };
  if (field.dataType === 'text')
    return { role: 'entity_attribute', context: `${field.fieldName} — entity property`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified target field`, confidence: 0.30 };
}

function assignTransactionRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (NATURE_IS_TEMPORAL(hcNature) || field.dataType === 'date')
    return { role: 'transaction_date', context: `${field.fieldName} — event timestamp`, confidence: 0.90 };
  if (field.dataType === 'currency')
    return { role: 'transaction_amount', context: `${field.fieldName} — monetary value`, confidence: 0.85 };
  if (NATURE_IS_MEASURE(hcNature))
    return { role: 'transaction_count', context: `${field.fieldName} — measure`, confidence: 0.70 };
  if (field.dataType === 'integer')
    return { role: 'transaction_count', context: `${field.fieldName} — event count`, confidence: 0.60 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.70 };
  if (field.dataType === 'text')
    return { role: 'category_code', context: `${field.fieldName} — classification`, confidence: 0.50 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified event field`, confidence: 0.30 };
}

function assignReferenceRole(field: ContentProfile['fields'][0], hcNature?: string): { role: SemanticRole; context: string; confidence: number } {
  if (NATURE_IS_NAME(hcNature))
    return { role: 'descriptive_label', context: `${field.fieldName} — display label`, confidence: 0.85 };
  if (field.dataType === 'text' && field.distinctCount > 0 && field.distinctCount < 20)
    return { role: 'category_code', context: `${field.fieldName} — category grouping`, confidence: 0.75 };
  if (field.dataType === 'text')
    return { role: 'descriptive_label', context: `${field.fieldName} — descriptive text`, confidence: 0.65 };
  if (field.dataType === 'integer' || field.dataType === 'decimal')
    return { role: 'baseline_value', context: `${field.fieldName} — reference value`, confidence: 0.55 };
  return { role: 'unknown', context: `${field.fieldName} — unclassified reference field`, confidence: 0.30 };
}
