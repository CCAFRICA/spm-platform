// HF-105 / HF-230 — Level-1 HC Pattern Classifier
// Two-Level Resolution Model: Level 1 (this file) derives classification
// from HC role composition; Level 2 (resolver.ts CRR Bayesian) runs only
// when this function returns null.
//
// HF-230 replaces the pre-existing four-pattern registry (entity_roster,
// repeated_measures_over_time, lookup_table, per_entity_benchmarks) with
// a decision tree built from three HC nature primitives:
//   1. reference-key presence + identifier absence  -> dimensional lookup
//   2. measure presence                              -> data ABOUT entities
//   3. identifier count (0 / 1 / 2+)                 -> reference / target / transaction
//
// Decision 108 (HC Override Authority, LOCKED 2026-03-07) is enforced by
// construction: every branch is gated solely on HC nature output. No
// structural-profile fields are read (no row-repetition heuristic, no
// row count, no sampling). When HC is confident on at least 50% of
// columns the tree runs; otherwise it returns null and Level-2 CRR
// Bayesian classifies from structural scoring.
//
// Korean Test (LOCKED): the tree reads the free-form `data_nature`
// characterization the LLM assessed for each column — identifier, name,
// temporal, measure, attribute, reference-key, etc. OB-231 retired the
// fixed enum, so the primitives below read the free-form text with
// tolerant regex (NATURE) and the free-form `identifies` scope (IDENTITY)
// rather than equality on a closed vocabulary. Zero domain vocabulary;
// zero field-name matching; zero value-content checks.

import type { ContentProfile, AgentType, HeaderInterpretation } from './sci-types';
import { TXN_SCOPE } from './scope-predicates';

// HF-341 R4: does an identifier column carry a TRANSACTION scope (a per-row event id — folio/receipt/
// invoice) in the LLM's free-form `identifies`? This is the expression that distinguishes an EVENT
// sheet (rows are transactions) from a per-entity record sheet — replacing the idRepeatRatio heuristic.
function isTxnScopeIdentifier(interp: HeaderInterpretation): boolean {
  return TXN_SCOPE.test(`${interp.identifies ?? ''}`);
}

// ============================================================
// HC PATTERN RESULT (interface preserved from HF-105)
// ============================================================

export interface HCPatternResult {
  classification: AgentType;
  confidence: number;
  patternName: string;
  matchedConditions: string[];
}

// Minimum HC confidence to count a nature as present (Decision 108 threshold).
const HC_ROLE_THRESHOLD = 0.80;

// Minimum fraction of columns reaching HC_ROLE_THRESHOLD before the tree
// will classify. Below this the tree returns null and Level-2 CRR Bayesian
// handles the file.
const MIN_COVERAGE_RATIO = 0.50;

// ============================================================
// NATURE PRIMITIVES — free-form readers (OB-231)
// ============================================================
// The former closed enum is gone; each consumer reads the free-form
// `data_nature` (and `characterization` as a backup signal) directly with
// tolerant regex. These helpers are FILE-LOCAL by design — no shared
// classifier module (the architecture forbids an intermediary matching
// utility; each consumer reads the LLM's words for itself).

// Combined free-form text the LLM produced for a column's nature.
function natureText(interp: HeaderInterpretation): string {
  return `${interp.data_nature ?? ''} ${interp.characterization ?? ''}`;
}

// A column has an assessed nature when its free-form text is non-empty and
// the LLM did not mark it indeterminate.
function hasNature(interp: HeaderInterpretation): boolean {
  const txt = natureText(interp).trim();
  if (!txt) return false;
  return !/\b(unknown|indeterminate|unclear|unrecognized)\b/i.test(interp.data_nature ?? '');
}

// Reference-key: a foreign key / lookup pointer to another entity.
// Read FIRST so it stays disjoint from the plain identifier primitive
// (both involve id/key wording; reference wins when present).
function isReferenceKey(interp: HeaderInterpretation): boolean {
  return /\b(reference|foreign[\s_-]?key|lookup|dimensional)\b/i.test(natureText(interp));
}

// Identifier: the row's own identity (id/identity/key) and NOT a reference.
function isIdentifier(interp: HeaderInterpretation): boolean {
  if (isReferenceKey(interp)) return false;
  return /\b(identifier|identity|\bid\b|primary[\s_-]?key|unique[\s_-]?key)\b/i.test(natureText(interp));
}

// Measure: a quantitative / monetary value. HF-230's contemplated `currency`
// nature folds in here — monetary content is a measure for the tree.
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

// ============================================================
// LEVEL 1 CLASSIFIER — PRIMITIVE-BASED DECISION TREE
// ============================================================

export function classifyByHCPattern(profile: ContentProfile): HCPatternResult | null {
  const hc = profile.headerComprehension;
  if (!hc) return null;

  // ── Coverage gate ────────────────────────────────────────
  // At least MIN_COVERAGE_RATIO of columns must have HC interpretations at
  // >= HC_ROLE_THRESHOLD before the tree runs. Below this Level-2 owns
  // the decision.
  const totalColumns = hc.interpretations.size;
  if (totalColumns === 0) return null;

  const confidentRoles = Array.from(hc.interpretations.values())
    .filter(interp => interp.confidence >= HC_ROLE_THRESHOLD);
  if (confidentRoles.length / totalColumns < MIN_COVERAGE_RATIO) {
    return null;
  }

  // ── HC nature primitives ────────────────────────────────
  // OB-203 (class fix, AUD-009): conditions key on resolved nature PRESENCE, NOT a re-threshold of the
  // per-column confidence. Memory layers supply confidence on heterogeneous scales (LLM ~0.95, atom
  // recognition/roleConf, sheet-flywheel binding 0.30-0.90 — the last classification-derived and
  // self-reinforcing). The confidence gate is applied ONCE above (the coverage gate); past it, a
  // column's assigned nature is trusted. This fixes BOTH the atom-claim (D5) and flywheel-injection
  // arms at one site — given identical nature assignments, the classification is identical regardless
  // of which layer supplied them or at what confidence.
  const roles = Array.from(hc.interpretations.values()).filter(hasNature);
  const identifierCount = roles.filter(isIdentifier).length;
  const measureCount = roles.filter(isMeasure).length;
  const hasMeasure = measureCount > 0;
  const hasReferenceKey = roles.some(isReferenceKey);
  const hasName = roles.some(isName);
  // AUD-013: temporal nature primitive — distinguishes per-period transactional
  // data (actuals over time) from one-time entity snapshots (targets).
  // A sheet with identifier + measure + temporal is event data over time;
  // a sheet with identifier + measure + no temporal is an entity snapshot.
  const hasTemporal = roles.some(isTemporal);
  // HF-230 directive contemplated a separate `currency` nature that would
  // imply a monetary measure. The free-form data_nature has no fixed schema;
  // monetary content reads as `measure` here (isMeasure folds currency wording
  // into the measure primitive), so the disjunction stays intact regardless of
  // how the LLM phrased a monetary column.
  const measurePresent = hasMeasure;
  // HF-341 R4 (C2): the target/transaction discriminant reads the LLM's EXPRESSION FIRST. A sheet
  // carrying a TRANSACTION-scope identifier (a per-row event id — folio/receipt, in the LLM's free-form
  // `identifies`) records EVENTS → transaction; this PRECEDES (and on the MIR Folio case, replaces) the
  // idRepeatRatio heuristic, which mis-read Folio's 1:1 ratio as "per-period target" AND flipped
  // fresh-vs-cached because the cache dropped the scope (R4-1 fixes the cache). idRepeatRatio is RETAINED
  // ONLY as a measured structural fallback for the events-over-time-WITHOUT-an-event-id class (monthly
  // actuals: an entity that repeats across periods with no per-row id), which the per-column expression
  // does not encode — deleting it outright regresses that class (Meridian/AUD-013). It is a measured
  // property of the data, not a role-term registry; the expression takes precedence over it.
  const hasTxnScopeIdentifier = roles.some(interp => isIdentifier(interp) && isTxnScopeIdentifier(interp));
  const idRepeatRatio = profile.structure.identifierRepeatRatio;

  // ── Branch 1: dimensional lookup ─────────────────────────
  // A categorical lookup key with no entity identifier — hub capacity,
  // product catalog, rate table, etc. The reference-key nature IS the
  // discriminator; identifier absence confirms it isn't entity-keyed
  // data with an additional reference column.
  if (hasReferenceKey && identifierCount === 0) {
    return {
      classification: 'reference',
      confidence: 0.85,
      patternName: 'dimensional_lookup',
      matchedConditions: [
        'HAS reference key',
        'NO identifier',
      ],
    };
  }

  // ── Branch 2: entity definition ──────────────────────────
  // No quantitative measures — the file DEFINES entities (roster, org
  // chart, employee master) rather than measuring them. Identifier and
  // name presence are informational; absence of measure is the
  // discriminator.
  if (!measurePresent) {
    const conds: string[] = ['NO measure', 'NO currency'];
    if (identifierCount > 0) conds.push(`${identifierCount} identifier(s)`);
    if (hasName) conds.push('HAS name');
    return {
      classification: 'entity',
      confidence: 0.90,
      patternName: 'entity_definition',
      matchedConditions: conds,
    };
  }

  // ── Branches 3 & 4: measure present ──────────────────────
  // HF-232: Discriminate target from transaction by `hasReferenceKey`, not
  // by `identifierCount`. The LLM distinguishes two kinds of ID columns:
  //   identifier    — the row's own identity (transaction_id, employee_id)
  //   reference-key — a foreign key to another entity (sales_rep_id)
  // HF-230 counted only identifier natures, so a sales file with
  // transaction_id (identifier @0.95) + sales_rep_id (reference-key @0.95)
  // landed in `identifierCount === 1` → target. Wrong: the presence of a
  // reference key is the semantic signal that the file RECORDS events
  // referencing entities (transactional), not entity-level records (target).

  // Branch 3: Transaction data — events that REFERENCE entities.
  // Has a per-row identifier AND a reference key (foreign key to another entity).
  // "Each row is an event with its own ID, linked to an entity via foreign key."
  //
  // AUD-013 extension: per-period actuals data (entity_id + measure + temporal)
  // is ALSO transactional even when no reference key is present. The temporal
  // column means each row is a measurement AT A POINT IN TIME — the row is an
  // event, not an entity-level snapshot. Without this branch, monthly
  // actuals with employee_id + amount + period_date classified as target
  // (entity-level snapshot), which mis-typed transactional data as
  // configuration and broke convergence.
  if (identifierCount >= 1 && hasReferenceKey) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      patternName: 'event_transactions',
      matchedConditions: [
        'HAS measure',
        'HAS reference key — event references entities',
        `${identifierCount} identifier(s)`,
        `${measureCount} measure column(s)`,
      ],
    };
  }
  if (identifierCount >= 1 && hasTxnScopeIdentifier) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      patternName: 'event_transactions_txnscope',
      matchedConditions: [
        'HAS measure',
        'HAS a transaction-scope identifier (per-row event id) — the LLM expressed it records events',
        hasTemporal ? 'HAS temporal — per-period event data' : 'event id present (temporal optional)',
        `${identifierCount} identifier(s)`,
        `${measureCount} measure column(s)`,
      ],
    };
  }
  // HF-341 R4: structural FALLBACK (not the expression — see the note above). An entity that REPEATS
  // across periods (idRepeatRatio > 1.5) with a temporal column is events-over-time even when it carries
  // no per-row event id (monthly actuals: employee_id + amount + month). The per-column expression does
  // not encode this; deleting it regresses the class (Meridian/AUD-013). A measured structural property.
  if (identifierCount >= 1 && hasTemporal && idRepeatRatio > 1.5) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      patternName: 'event_transactions_temporal',
      matchedConditions: [
        'HAS measure',
        'HAS temporal — per-period event data',
        `idRepeatRatio=${idRepeatRatio.toFixed(2)} (>1.5 — the entity repeats across periods; structural fallback)`,
        `${identifierCount} identifier(s)`,
        `${measureCount} measure column(s)`,
      ],
    };
  }

  // Branch 4: Target/reference data — entity-level records with measures.
  // Has an identifier but NO reference key AND NO temporal — this IS the
  // entity record, not referencing another, and not per-period.
  // "One value set per entity — quotas, targets, thresholds, rates."
  // HF-341 R4: a measure-bearing sheet with an identifier, NO reference key, and NO transaction-scope
  // identifier (no per-row event id) is per-entity records — a target (quotas/thresholds). The event
  // discriminant is the LLM's expressed scope (a transaction-scope id above), not a repeat ratio.
  if (identifierCount >= 1 && !hasReferenceKey && !hasTxnScopeIdentifier) {
    return {
      classification: 'target',
      confidence: 0.85,
      patternName: 'entity_targets',
      matchedConditions: [
        'HAS measure',
        'NO reference key — entity-level record',
        hasTemporal
          ? 'HAS temporal but NO transaction-scope identifier — the LLM expressed per-entity records (a per-period target), not events'
          : 'NO temporal — snapshot, not per-period',
        `${identifierCount} identifier(s)`,
        `${measureCount} measure column(s)`,
      ],
    };
  }

  // identifierCount === 0 with measure present → aggregate reference data
  // (e.g., capacity tables, threshold tables) without entity association.
  return {
    classification: 'reference',
    confidence: 0.80,
    patternName: 'measure_only_reference',
    matchedConditions: [
      'HAS measure',
      'NO identifier',
    ],
  };
}
