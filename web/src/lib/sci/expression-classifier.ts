// HF-368 — reads the model's BARE structural PRIMITIVE (`scope_role`/`nature_role`) by equality
// against the fixed primitive set (structural-primitives.ts). The bilingual word-list registry
// scope-predicates.ts (which HF-367 read and grew) is DELETED; the model — not a developer word
// list — names which primitive each column is. No regex over the model's prose survives here.
//
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
// WHAT REPLACES BOTH (updated by HF-368): a direct read of the model's BARE structural
// PRIMITIVES. HF-367 read `identifies` / `data_nature` PROSE via the bilingual word-list registry
// scope-predicates.ts; HF-368 DELETED that registry. Per column, the model now names the bare
// primitive it emits — `scope_role` ∈ {entity,transaction,reference,none}, `nature_role` ∈
// {identifier,measure,temporal,name,categorical} — read here by EQUALITY against the fixed set
// (structural-primitives.ts). The prose (`identifies`/`data_nature`/`characterization`) is NEVER
// read here. The sheet class is constructed with plain booleans:
//   • a column the model scopes TRANSACTION + identifier → the rows are events → transaction;
//   • else a column scoped ENTITY + identifier, WITH period + measures → per-period performance
//     over that entity (NOT a roster) → transaction (DIAG-080: never entity);
//   • else an ENTITY identifier, without per-period measures → a roster/master → entity;
//   • else no entity- and no transaction-identifying column → a dimensional lookup → reference.
// No word list, no regex over the model's text, no scoring, no cardinality, no default-on-absence.
//
// Korean Test: the multilingual MODEL maps its own recognition (in ANY language) onto the fixed
// primitive; the code compares the bare token to the fixed architecture — never a developer
// synonym list. A Korean roster classifies with NO developer edit.
//
// C2 FAIL-LOUD: no header comprehension, or no column carrying a bare `nature_role` → raise
// MissingRecognitionError (absent). A `scope_role`/`nature_role` OUTSIDE the fixed set → raise
// PrimitiveRecognitionError (novel). Never a default, never a word-match fallback.

import type { ContentProfile, AgentType, HeaderInterpretation } from './sci-types';
import { validateScope, validateNature } from './structural-primitives';

export interface ExpressionClassification {
  classification: AgentType;
  confidence: number;
  matchedConditions: string[];
}

// Raised when the model produced no bare-primitive recognition to read. C2: a comprehension gap
// is surfaced loudly, never papered over with a default classification. (A NOVEL primitive — one
// outside the fixed set — raises PrimitiveRecognitionError from structural-primitives.ts instead.)
export class MissingRecognitionError extends Error {
  constructor(sheet: string, missing: string) {
    super(`HF-368: cannot classify sheet "${sheet}" — the model's bare primitive recognition is absent (${missing}). ` +
      `The classification is READ from the model's per-column scope_role/nature_role; there is no word-list fallback and no default. ` +
      `Fix at the comprehension layer (the model must render the bare primitive), not here.`);
    this.name = 'MissingRecognitionError';
  }
}

// HF-368 — read the MODEL's bare structural PRIMITIVE (never the prose, never a word list).
// A column is "recognized" when the model rendered its bare `nature_role`. The scope/nature are
// compared by EQUALITY against the fixed primitive (structural-primitives.ts) — no regex.
function isRecognized(interp: HeaderInterpretation): boolean {
  return !!(interp.nature_role && interp.nature_role.trim());
}

// ============================================================
// EXPRESSION → CLASSIFICATION  (read the model, construct the sheet class)
// ============================================================

export function deriveClassificationFromExpression(profile: ContentProfile): ExpressionClassification {
  const hc = profile.headerComprehension;
  const sheet = profile.tabName || profile.sourceFile || profile.contentUnitId || 'unknown';

  // C2 fail-loud: the model must have produced recognition to read.
  if (!hc) throw new MissingRecognitionError(sheet, 'no header comprehension');

  // Validate every column's bare primitives against the FIXED set — a NOVEL scope/nature (the
  // model recognized something outside our primitives) raises loudly (never word-matched away).
  const all = Array.from(hc.interpretations.values());
  for (const i of all) {
    validateScope(sheet, i.columnName, i.scope_role);
    validateNature(sheet, i.columnName, i.nature_role);
  }

  const recognized = all.filter(isRecognized);
  if (recognized.length === 0) {
    throw new MissingRecognitionError(sheet, 'no column carries a bare nature_role — the model rendered no structural primitive');
  }

  // The model's per-column recognition, read by EQUALITY against the fixed primitive. An
  // identifier the model scopes as a TRANSACTION identifies an event; as an ENTITY, a recurring entity.
  const txnIdCol = recognized.find(i => i.nature_role === 'identifier' && i.scope_role === 'transaction');
  const entityIdCol = recognized.find(i => i.nature_role === 'identifier' && i.scope_role === 'entity');
  const hasMeasure = recognized.some(i => i.nature_role === 'measure');
  const hasPeriod = recognized.some(i => i.nature_role === 'temporal');

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
