// HF-367 — Direct read of the model's recognition (eradicates the keyword-scan classifier
// and the HF-364 structural-dominance derivation).
//
// This is the SOLE producer of a content unit's classification. It reads ONLY the model's
// per-column recognition — the `identifies` SCOPE and the `data_nature` NATURE the model
// assessed for each column (OB-231) — and CONSTRUCTS the sheet-level classification (entity /
// transaction / reference) from what the model already recognized. It does NOT re-decide,
// score, weight, count, or second-guess that recognition. The classification value becomes
// committed_data.data_type (the calc sheet-bucket partition key) via the identity map in
// data-type-resolver.ts.
//
// WHAT HF-367 DELETED (and why):
//   • Layer A — the `natureText` blob (`data_nature + characterization`) and every predicate
//     that keyword-scanned it (isReferenceKey / isIdentifier / isMeasure / isName / isTemporal).
//     The blob mixed the model's crisp `data_nature` assessment with its free-form EXPLANATORY
//     sentence, and `isReferenceKey` — checked first, suppressing `isIdentifier` — matched the
//     word "reference"/"foreign key" that incidentally appears in the model's DESCRIPTION of an
//     identifier column ("…used to reference employees"), flipping the model's
//     data_nature="identifier"/identifies="entity" to a reference-key. The model's own
//     explanation was used as evidence against the model's structured judgment (DIAG-081).
//   • Layer B — the weighted-facet structural-dominance derivation (buildDominanceFacets /
//     classifyByDominance). A clean adder summing Layer-A's poisoned booleans still produced a
//     poisoned result; and, per Decision 158, deterministic code does not DERIVE the
//     classification at all — the model already produces it via `identifies` / `data_nature`.
//   • Both silent `→ reference@0.50` defaults. A missing recognition is now a loud error.
//
// WHAT REPLACES BOTH: a direct read. Per column, the model's dedicated `identifies` (scope)
// and `data_nature` (nature) channels are read via the single-source scope-predicates — the
// SAME canonical surface the entity-id resolver (commit-content-unit.ts) reads on the SAME
// `identifies` channel. The `characterization` prose is NEVER read here. The sheet class is
// constructed with plain booleans:
//   • a column the model scopes as a TRANSACTION identifier → the rows are events → transaction;
//   • else a column the model scopes as an ENTITY identifier, WITH period + measures → per-period
//     performance over that entity (NOT a roster) → transaction (DIAG-080: never entity);
//   • else an ENTITY identifier, without per-period measures → a roster/master → entity;
//   • else no entity- and no transaction-identifying column → a dimensional lookup → reference.
// No weighted scoring, no facet summing, no cardinality/uniqueness check, no default-on-absence.
//
// Korean Test: the model emits `identifies` / `data_nature` as FREE-FORM PROSE by design
// (producer prompt: "do NOT select from a fixed list"; OB-231). Reading prose to a concept
// therefore uses the platform's canonical MULTILINGUAL structural word-class predicates
// (scope-predicates.ts) — structural, extensible by recognition, single-source, never a
// column name, never a value-content check, never a row-count ratio, never the prose blob.
//
// C2 FAIL-LOUD: if the model recognized NOTHING usable (no header comprehension, or every
// column's `data_nature` is empty / the producer's `unknown` sentinel), this raises a
// structured error naming the sheet and the missing field — it does NOT guess or default.

import type { ContentProfile, AgentType, HeaderInterpretation } from './sci-types';
import { ENTITY_SCOPE, TXN_SCOPE, IDENTIFIER_NATURE, MEASURE_NATURE, TEMPORAL_NATURE } from './scope-predicates';

export interface ExpressionClassification {
  classification: AgentType;
  confidence: number;
  matchedConditions: string[];
}

// Raised when the model produced no recognition to read. C2: a comprehension gap is surfaced
// loudly, never papered over with a default classification.
export class MissingRecognitionError extends Error {
  constructor(sheet: string, missing: string) {
    super(`HF-367: cannot classify sheet "${sheet}" — the model's recognition is absent (${missing}). ` +
      `The classification is READ from the model's per-column identifies/data_nature; there is no default. ` +
      `Fix at the comprehension layer (the model must emit the recognition), not here.`);
    this.name = 'MissingRecognitionError';
  }
}

// The producer's non-recognition sentinel for `data_nature` (header-comprehension.ts /
// decomposed-comprehension.ts write exactly `'unknown'` when the model recognized nothing).
// A column is "recognized" when its dedicated `data_nature` channel carries a real assessment.
function isRecognized(interp: HeaderInterpretation): boolean {
  const nature = (interp.data_nature ?? '').trim();
  return nature.length > 0 && nature.toLowerCase() !== 'unknown';
}

// ── Per-column reads of the model's DEDICATED channels (never `characterization`) ──
// scope ← `identifies`; nature ← `data_nature`. Each is a single-source structural read.
const scopeIsEntity = (i: HeaderInterpretation) => ENTITY_SCOPE.test(i.identifies ?? '');
const scopeIsTxn = (i: HeaderInterpretation) => TXN_SCOPE.test(i.identifies ?? '');
const natureIsIdentifier = (i: HeaderInterpretation) => IDENTIFIER_NATURE.test(i.data_nature ?? '');
const natureIsMeasure = (i: HeaderInterpretation) => MEASURE_NATURE.test(i.data_nature ?? '');
const natureIsTemporal = (i: HeaderInterpretation) => TEMPORAL_NATURE.test(i.data_nature ?? '');

// ============================================================
// EXPRESSION → CLASSIFICATION  (read the model, construct the sheet class)
// ============================================================

export function deriveClassificationFromExpression(profile: ContentProfile): ExpressionClassification {
  const hc = profile.headerComprehension;
  const sheet = profile.tabName || profile.sourceFile || profile.contentUnitId || 'unknown';

  // C2 fail-loud: the model must have produced recognition to read.
  if (!hc) throw new MissingRecognitionError(sheet, 'no header comprehension');
  const recognized = Array.from(hc.interpretations.values()).filter(isRecognized);
  if (recognized.length === 0) {
    throw new MissingRecognitionError(sheet, 'no column carries a usable data_nature (all empty or "unknown")');
  }

  // The model's per-column recognition, as the model expressed it. An identifier column the
  // model scoped as a TRANSACTION identifies an event; as an ENTITY, a recurring entity.
  const txnIdCol = recognized.find(i => natureIsIdentifier(i) && scopeIsTxn(i));
  const entityIdCol = recognized.find(i => natureIsIdentifier(i) && scopeIsEntity(i));
  const hasMeasure = recognized.some(natureIsMeasure);
  const hasPeriod = recognized.some(natureIsTemporal);

  // Construct the sheet class from what the model recognized. Confidence = the model's own
  // confidence in the deciding recognition (Decision 158) — not a synthesized constant.
  if (txnIdCol) {
    return {
      classification: 'transaction',
      confidence: txnIdCol.confidence,
      matchedConditions: [`model scopes "${txnIdCol.columnName}" as a transaction identifier — each row is an event`],
    };
  }

  if (entityIdCol) {
    if (hasMeasure && hasPeriod) {
      // Per-period measured records over an entity: performance data, NEVER a roster (DIAG-080).
      return {
        classification: 'transaction',
        confidence: entityIdCol.confidence,
        matchedConditions: [
          `model scopes "${entityIdCol.columnName}" as an entity identifier, with period + measures — per-period performance over the entity (not a roster)`,
        ],
      };
    }
    // An entity identifier without per-period measures: the sheet identifies entities and does
    // not measure them over time — a roster/master.
    return {
      classification: 'entity',
      confidence: entityIdCol.confidence,
      matchedConditions: [`model scopes "${entityIdCol.columnName}" as an entity identifier, no per-period measures — a roster/master`],
    };
  }

  // No column the model scopes as an entity- or transaction-identifier: a dimensional lookup.
  // Confidence = the model's strongest column recognition (it recognized the columns; none is
  // an identifier). This is the residual per Decision 158, NOT a silent default (recognition
  // is present — fail-loud already fired above if it were absent).
  const strongest = recognized.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return {
    classification: 'reference',
    confidence: strongest.confidence,
    matchedConditions: ['model recognized no entity- and no transaction-identifying column — a dimensional lookup (reference)'],
  };
}
