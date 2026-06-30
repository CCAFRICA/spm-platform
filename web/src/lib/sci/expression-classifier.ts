// HF-364 — Structural-dominance classification (replaces the HF-341 R6 / HF-351 F2
// ordered branch ladder, which was the last enumerated registry in the SCI
// classification chain).
//
// This is the SOLE producer of a content unit's classification. It reads ONLY the
// LLM's free-form expression — the per-column `data_nature` / `characterization`
// the model assessed, and the `identifies` scope — and maps it to the four data
// natures the calc partitions on (entity / target / transaction / reference). The
// classification value becomes committed_data.data_type (the calc sheet-bucket
// partition key) via the identity map in data-type-resolver.ts.
//
// What HF-364 deleted:
//   • the ordered if/else branch ladder (Branch 1 → 2 → 2.5 → 3 → 4). Branch ordering
//     was load-bearing: whichever branch fired first won, regardless of whether a later
//     branch was structurally more correct. Branch 2.5 (HF-351 F2, commit 8e84a68a)
//     returned `entity` for any sheet with an entity-scope id + a name + no event id, and
//     did NOT yield to a temporal + measures sheet (per-period performance data). The BCL
//     `datos` sheet (ID_Empleado + Nombre_Completo + Periodo + measures) hit Branch 2.5
//     and was misclassified `entity` → 0 transaction rows → $0 grand total (DIAG-080).
//   • the per-branch confidence constants (0.50 / 0.85 / 0.88 / 0.90).
//
// What replaces it: each LLM-recognized structural signal contributes weighted support
// to the data natures it structurally constitutes. The four natures' supports are summed
// from a FLAT facet list and the classification is the argmax. The derivation is
// ORDER-INDEPENDENT — summing facet support is commutative, and the winner is chosen by
// argmax over a fixed structural-specificity precedence, never by code position.
// Rearranging the facet list, or the score expressions, produces byte-identical output.
//
// Korean Test (LOCKED): every signal is read from the LLM's free-form expression
// (data_nature / characterization / identifies) with tolerant regex — never a column name,
// never a language-specific pattern, never a value-content check, never a row-count ratio.
//
// HALT-CALC: this reproduces the EXACT classification the branch ladder reached for every
// signal combination EXCEPT the one it was wrong on — a sheet carrying temporal + measures
// is no longer forced to `entity`. The HF-351 F2 roster (entity-scope id + name, NO
// temporal, NO event id) is preserved by the ABSENCE of a temporal signal, not by ordering.
// Confidence values changed (now coverage-derived); the calc partitions on the
// classification label, not its confidence — the only consumer (resolver.ts) requires the
// winner to clear the analyzeSplit gap of 0.25, which the 0.50 confidence floor satisfies.

import type { ContentProfile, AgentType, HeaderInterpretation } from './sci-types';
import { TXN_SCOPE, ENTITY_SCOPE } from './scope-predicates';

export interface ExpressionClassification {
  classification: AgentType;
  confidence: number;
  matchedConditions: string[];
}

// ============================================================
// NATURE PRIMITIVES — free-form readers (OB-231)
// ============================================================
// Each reads the LLM's free-form `data_nature` (+ `characterization` as backup)
// with tolerant regex. FILE-LOCAL by design — the architecture forbids a shared
// matching utility; each consumer reads the LLM's words for itself.

function natureText(interp: HeaderInterpretation): string {
  return `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`;
}

// A column has an assessed nature when its free-form text is non-empty and the
// LLM did not mark it indeterminate.
function hasNature(interp: HeaderInterpretation): boolean {
  const txt = natureText(interp).trim();
  if (!txt) return false;
  return !/\b(unknown|indeterminate|unclear|unrecognized)\b/i.test(interp.data_nature ?? '');
}

// Reference-key: a foreign key / lookup pointer to another entity. Read FIRST so it
// stays disjoint from the plain identifier primitive (reference wins when present).
function isReferenceKey(interp: HeaderInterpretation): boolean {
  return /\b(reference|foreign[\s_-]?key|lookup|dimensional)\b/i.test(natureText(interp));
}

// Identifier: the row's own identity (id/identity/key) and NOT a reference.
function isIdentifier(interp: HeaderInterpretation): boolean {
  if (isReferenceKey(interp)) return false;
  return /\b(identifier|identity|\bid\b|primary[\s_-]?key|unique[\s_-]?key)\b/i.test(natureText(interp));
}

// Measure: a quantitative / monetary value (currency wording folds in here).
function isMeasure(interp: HeaderInterpretation): boolean {
  return /\b(measure|amount|metric|quantity|numeric|monetary|currency|value)\b/i.test(natureText(interp));
}

// Name: a human-readable label for an entity.
function isName(interp: HeaderInterpretation): boolean {
  return /\b(name|label|title|description)\b/i.test(natureText(interp));
}

// Temporal: a date/time/period marker.
function isTemporal(interp: HeaderInterpretation): boolean {
  return /\b(date|time|temporal|month|year|period|day|quarter|week)\b/i.test(natureText(interp));
}

// A transaction-scope identifier: a per-row event id (folio/receipt/invoice) the
// LLM expressed in the free-form `identifies` scope. This is the expression that
// distinguishes an EVENT sheet (rows are transactions) from per-entity records.
function isTxnScopeIdentifier(interp: HeaderInterpretation): boolean {
  return TXN_SCOPE.test(`${interp.identifies ?? ''}`);
}

// ============================================================
// STRUCTURAL SIGNALS
// ============================================================
// The recognized structural signals a sheet exposes. Booleans come from the LLM's
// free-form expression (via the primitives above); the counts are derived the same way.
// This is the complete input to the dominance derivation — there is nothing else to read.

export interface StructuralSignals {
  hasEntityScopeIdentifier: boolean;
  hasName: boolean;
  hasTxnScopeIdentifier: boolean;
  hasTemporal: boolean;
  hasMeasure: boolean;
  hasReferenceKey: boolean;
  identifierCount: number;
  measureCount: number;
}

function readStructuralSignals(interps: HeaderInterpretation[]): StructuralSignals {
  const identifierCount = interps.filter(isIdentifier).length;
  const measureCount = interps.filter(isMeasure).length;
  return {
    identifierCount,
    measureCount,
    hasMeasure: measureCount > 0,
    hasReferenceKey: interps.some(isReferenceKey),
    hasName: interps.some(isName),
    hasTemporal: interps.some(isTemporal),
    hasTxnScopeIdentifier: interps.some(i => isIdentifier(i) && isTxnScopeIdentifier(i)),
    // An identifier the LLM scoped as the ENTITY itself (a recurring person/account),
    // not a per-row event id. Distinguishes a per-entity record from an event.
    hasEntityScopeIdentifier: interps.some(i =>
      isIdentifier(i) && ENTITY_SCOPE.test(`${i.identifies ?? ''}`) && !TXN_SCOPE.test(`${i.identifies ?? ''}`)),
  };
}

// ============================================================
// STRUCTURAL DOMINANCE — facets, support, argmax
// ============================================================
// A facet is a self-contained structural claim about ONE nature. `weight` is the facet's
// structural specificity on a 3-level scale, NOT a confidence: 3 = a defining/dominant
// structural mark, 2 = a compound structural pattern, 1 = a corroborating signal. The four
// natures' supports are the sum of their satisfied facets' weights. Because support is a
// sum, the order of this list does not affect the result.

interface DominanceFacet {
  nature: AgentType;
  weight: number;
  satisfied: boolean;
  reason: string;
}

// The four natures in fixed structural-specificity precedence (most-specific structural
// claim first). Used to iterate supports and to break the (in practice non-occurring) tie
// deterministically — never as a position-dependent classification rule.
const NATURE_PRECEDENCE: AgentType[] = ['transaction', 'target', 'entity', 'reference'];

export function buildDominanceFacets(s: StructuralSignals): DominanceFacet[] {
  const hasId = s.identifierCount >= 1;
  return [
    // ── TRANSACTION — per-event records ──
    {
      nature: 'transaction', weight: 3,
      satisfied: s.hasTxnScopeIdentifier,
      // contains "transaction-scope identifier" for diagnostic continuity (HF-341 R6)
      reason: 'per-row transaction-scope identifier (event id) — each row is a distinct event',
    },
    {
      nature: 'transaction', weight: 2,
      satisfied: s.hasMeasure && s.hasReferenceKey && hasId,
      reason: 'measured rows carry a foreign key — events reference entities',
    },
    {
      nature: 'transaction', weight: 1,
      satisfied: s.hasMeasure && s.hasTemporal && s.hasReferenceKey,
      reason: 'per-period measured rows reference entities — per-period events',
    },

    // ── TARGET — entity-level measured records (quotas / per-period performance) ──
    {
      nature: 'target', weight: 2,
      satisfied: s.hasMeasure && hasId && !s.hasTxnScopeIdentifier && !s.hasReferenceKey,
      reason: 'measures attributed to an identifier, no event id, no foreign key — entity-level records',
    },
    {
      nature: 'target', weight: 1,
      satisfied: s.hasMeasure && s.hasTemporal && hasId && !s.hasTxnScopeIdentifier,
      // temporal dominance: a per-period measured sheet over an identifier is performance
      // data, NOT a roster definition.
      reason: 'temporal + measures over an identifier — per-period performance (temporal dominance: not a roster)',
    },

    // ── ENTITY — a population definition (roster / master / org chart) ──
    {
      nature: 'entity', weight: 3,
      satisfied: s.hasEntityScopeIdentifier && s.hasName && !s.hasTemporal && !s.hasTxnScopeIdentifier,
      // contains "roster/master" for diagnostic continuity (HF-351 F2). The !hasTemporal
      // condition is the fix: a temporal + measures sheet (BCL datos) does NOT match.
      reason: 'entity-scope identifier + name, no temporal, no event id — a roster/master (entity remainder)',
    },
    {
      nature: 'entity', weight: 2,
      satisfied: !s.hasMeasure,
      reason: 'no measures — the sheet defines entities rather than measuring them',
    },

    // ── REFERENCE — a lookup / dimensional table (relationships or parameters) ──
    {
      nature: 'reference', weight: 3,
      satisfied: s.hasReferenceKey && s.identifierCount === 0,
      reason: 'reference key with no identifier — a pure lookup (reference isolation)',
    },
    {
      nature: 'reference', weight: 1,
      satisfied: s.hasMeasure && s.identifierCount === 0,
      reason: 'measures with no identifier — an aggregate parameter table',
    },
  ];
}

// Reduce a facet list to a classification. ORDER-INDEPENDENT: supports are summed (a
// commutative reduction) and the winner is the argmax over NATURE_PRECEDENCE. Passing the
// facets in any order — or any permutation of the score expressions — yields identical
// output. Confidence is derived from the score margin (no per-classification constant).
export function classifyByDominance(facets: DominanceFacet[]): ExpressionClassification {
  const support: Record<AgentType, number> = { transaction: 0, target: 0, entity: 0, reference: 0, plan: 0 };
  const reasonsByNature: Record<AgentType, string[]> = { transaction: [], target: [], entity: [], reference: [], plan: [] };

  for (const f of facets) {
    if (!f.satisfied) continue;
    support[f.nature] += f.weight;
    reasonsByNature[f.nature].push(f.reason);
  }

  // argmax with deterministic, order-independent tiebreak (structural-specificity
  // precedence). strictly-greater keeps the first precedence-nature on a tie.
  let winner: AgentType = NATURE_PRECEDENCE[0];
  for (const nature of NATURE_PRECEDENCE) {
    if (support[nature] > support[winner]) winner = nature;
  }

  // No structural support for any nature (only reachable on a degenerate signal set) →
  // dimensional reference, never the precedence-default transaction.
  if (support[winner] === 0) {
    return { classification: 'reference', confidence: 0.50, matchedConditions: ['NO structural support — defaulted to reference'] };
  }

  // Confidence from the margin between the top two nature supports — more decisive support
  // ⇒ higher confidence. One global formula; the +1 smoothing bounds it below 1.0 and
  // handles the single-facet win. Floor 0.50 keeps the resolver's analyzeSplit gap (>0.25)
  // satisfied for the synthesized winner-vs-0.05 vector.
  const ranked = NATURE_PRECEDENCE.map(n => support[n]).sort((a, b) => b - a);
  const top = ranked[0];
  const second = ranked[1] ?? 0;
  const confidence = 0.5 + 0.5 * (top - second) / (top + second + 1);

  return {
    classification: winner,
    confidence,
    matchedConditions: reasonsByNature[winner],
  };
}

// ============================================================
// EXPRESSION → CLASSIFICATION
// ============================================================

export function deriveClassificationFromExpression(profile: ContentProfile): ExpressionClassification {
  const hc = profile.headerComprehension;

  // Precondition (degenerate input): the LLM produced no recognized expression to read.
  // There is no Bayesian fallback (deleted). A sheet with zero recognized columns is not
  // the entity population and carries no entity-keyed measures we can attribute, so it is
  // treated as dimensional reference data. Loud, inspectable provenance for the architect.
  // This is OUTSIDE the dominance derivation — there are no signals to derive from.
  const interps = hc ? Array.from(hc.interpretations.values()).filter(hasNature) : [];
  if (interps.length === 0) {
    return { classification: 'reference', confidence: 0.50, matchedConditions: ['NO recognized expression — defaulted to reference'] };
  }

  const signals = readStructuralSignals(interps);
  return classifyByDominance(buildDominanceFacets(signals));
}
