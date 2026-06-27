// HF-341 R6 — Expression-derived classification (replaces the HF-105/HF-230 heuristic
// Level-1 pattern classifier AND the Level-2 CRR Bayesian scorer, both DELETED).
//
// This is the SOLE producer of a content unit's classification. It reads ONLY the
// LLM's free-form expression — the per-column `data_nature` / `characterization`
// the model assessed, and the `identifies` scope — and maps it to the four data
// natures the calc partitions on (entity / target / transaction / reference). The
// classification value becomes committed_data.data_type (the calc sheet-bucket
// partition key) via the identity map in data-type-resolver.ts.
//
// What R6 deleted from the prior design:
//   • the [SCI-HC-PATTERN] heuristic decision-tree-as-override + its coverage gate
//     and confidence constants — there is no Level-2 to hand off to, so this ALWAYS
//     produces a classification (no null);
//   • the [SCI-CRR-DIAG] Bayesian posterior scoring (computePosteriors, agent weight
//     rules, CRL reliability, seed priors) — structural scoring no longer decides;
//   • the idRepeatRatio cardinality heuristic (already removed in R5).
//
// Decision 108 (HC Override Authority) is now absolute: every branch reads the LLM's
// words. Zero structural-profile fields (no row counts, no repeat ratios, no
// sampling). Zero domain vocabulary; zero field-name matching; zero value-content
// checks (Korean Test, LOCKED).
//
// HALT-CALC: for any sheet the LLM recognized (HC populated — every sealed-figure
// tenant), this reproduces the exact classification the prior code reached, because
// classifyByHCPattern already OVERRODE the Bayesian whenever HC coverage >= 50%. The
// Bayesian only decided low-coverage sheets, which the sealed tenants do not have.
// So data_type — and therefore the calc partition key — is byte-identical for
// BCL $312,033 / Meridian $556,985 / MIR Plan 2 210,000 until the architect re-imports.

import type { ContentProfile, AgentType, HeaderInterpretation } from './sci-types';
import { TXN_SCOPE } from './scope-predicates';

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
// EXPRESSION → CLASSIFICATION
// ============================================================

export function deriveClassificationFromExpression(profile: ContentProfile): ExpressionClassification {
  const hc = profile.headerComprehension;

  // No expression at all — the LLM produced nothing to read. There is no Bayesian
  // fallback (deleted); a sheet with no recognized columns is treated as dimensional
  // reference data (it is not the entity population and carries no entity-keyed
  // measures we can attribute). Loud, inspectable provenance for the architect.
  const interps = hc ? Array.from(hc.interpretations.values()).filter(hasNature) : [];
  if (interps.length === 0) {
    return { classification: 'reference', confidence: 0.50, matchedConditions: ['NO recognized expression — defaulted to reference'] };
  }

  const identifierCount = interps.filter(isIdentifier).length;
  const measureCount = interps.filter(isMeasure).length;
  const hasMeasure = measureCount > 0;
  const hasReferenceKey = interps.some(isReferenceKey);
  const hasName = interps.some(isName);
  const hasTemporal = interps.some(isTemporal);
  const hasTxnScopeIdentifier = interps.some(i => isIdentifier(i) && isTxnScopeIdentifier(i));

  // ── Branch 1: dimensional lookup ──
  // A categorical lookup key with no entity identifier (hub capacity, product
  // catalog, rate table). The reference-key nature IS the discriminator.
  if (hasReferenceKey && identifierCount === 0) {
    return { classification: 'reference', confidence: 0.85, matchedConditions: ['HAS reference key', 'NO identifier'] };
  }

  // ── Branch 2: entity definition ──
  // No quantitative measures — the file DEFINES entities (roster, org chart,
  // employee master) rather than measuring them.
  if (!hasMeasure) {
    const conds = ['NO measure'];
    if (identifierCount > 0) conds.push(`${identifierCount} identifier(s)`);
    if (hasName) conds.push('HAS name');
    return { classification: 'entity', confidence: 0.90, matchedConditions: conds };
  }

  // ── Branch 3: transaction — events that REFERENCE entities ──
  // A reference key means each row is an event linked to an entity by foreign key.
  if (identifierCount >= 1 && hasReferenceKey) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      matchedConditions: ['HAS measure', 'HAS reference key — event references entities', `${identifierCount} identifier(s)`, `${measureCount} measure column(s)`],
    };
  }
  // ...or a per-row event id (folio/receipt) the LLM scoped as a transaction.
  if (identifierCount >= 1 && hasTxnScopeIdentifier) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      matchedConditions: ['HAS measure', 'HAS a transaction-scope identifier (per-row event id)', hasTemporal ? 'HAS temporal — per-period event data' : 'event id present (temporal optional)', `${identifierCount} identifier(s)`, `${measureCount} measure column(s)`],
    };
  }

  // ── Branch 4: target — entity-level records with measures ──
  // An identifier, NO reference key, NO per-row event id: this IS the entity record
  // (quotas/targets/thresholds), not an event. The event discriminant is the LLM's
  // expressed scope, never a repeat ratio (R5/R6).
  if (identifierCount >= 1) {
    return {
      classification: 'target',
      confidence: 0.85,
      matchedConditions: ['HAS measure', 'NO reference key — entity-level record', hasTemporal ? 'HAS temporal but NO transaction-scope identifier — per-entity records' : 'NO temporal — snapshot', `${identifierCount} identifier(s)`, `${measureCount} measure column(s)`],
    };
  }

  // identifierCount === 0 with measure present → aggregate reference data
  // (capacity/threshold tables) without entity association.
  return { classification: 'reference', confidence: 0.80, matchedConditions: ['HAS measure', 'NO identifier'] };
}
