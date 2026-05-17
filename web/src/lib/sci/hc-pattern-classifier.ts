// HF-105 / HF-230 — Level-1 HC Pattern Classifier
// Two-Level Resolution Model: Level 1 (this file) derives classification
// from HC role composition; Level 2 (resolver.ts CRR Bayesian) runs only
// when this function returns null.
//
// HF-230 replaces the pre-existing four-pattern registry (entity_roster,
// repeated_measures_over_time, lookup_table, per_entity_benchmarks) with
// a decision tree built from three HC role primitives:
//   1. reference_key presence + identifier absence  -> dimensional lookup
//   2. measure presence                              -> data ABOUT entities
//   3. identifier count (0 / 1 / 2+)                 -> reference / target / transaction
//
// Decision 108 (HC Override Authority, LOCKED 2026-03-07) is enforced by
// construction: every branch is gated solely on HC role output. No
// structural-profile fields are read (no row-repetition heuristic, no
// row count, no sampling). When HC is confident on at least 50% of
// columns the tree runs; otherwise it returns null and Level-2 CRR
// Bayesian classifies from structural scoring.
//
// Korean Test (LOCKED): the tree reads ColumnRole values from the
// sci-types ColumnRole union — `identifier`, `name`, `temporal`,
// `measure`, `attribute`, `reference_key`, `unknown`. Zero domain
// vocabulary; zero field-name matching; zero value-content checks.

import type { ContentProfile, AgentType } from './sci-types';

// ============================================================
// HC PATTERN RESULT (interface preserved from HF-105)
// ============================================================

export interface HCPatternResult {
  classification: AgentType;
  confidence: number;
  patternName: string;
  matchedConditions: string[];
}

// Minimum HC confidence to count a role as present (Decision 108 threshold).
const HC_ROLE_THRESHOLD = 0.80;

// Minimum fraction of columns reaching HC_ROLE_THRESHOLD before the tree
// will classify. Below this the tree returns null and Level-2 CRR Bayesian
// handles the file.
const MIN_COVERAGE_RATIO = 0.50;

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

  // ── HC role primitives ──────────────────────────────────
  // Three counts / booleans derived from the LLM's per-column role
  // assignments. Everything below is a function of these primitives.
  const identifierCount = confidentRoles.filter(r => r.columnRole === 'identifier').length;
  const measureCount = confidentRoles.filter(r => r.columnRole === 'measure').length;
  const hasMeasure = measureCount > 0;
  const hasReferenceKey = confidentRoles.some(r => r.columnRole === 'reference_key');
  const hasName = confidentRoles.some(r => r.columnRole === 'name');
  // HF-230 directive contemplated a separate `currency` ColumnRole that would
  // imply a monetary measure. The sci-types ColumnRole union does NOT carry
  // `currency` (the seven values are identifier / name / temporal / measure /
  // attribute / reference_key / unknown). Monetary content is classified as
  // `measure` by the LLM today; if a future schema extension adds `currency`
  // it should join this disjunction. For now the tree reads only the union
  // values that actually exist in the type.
  const measurePresent = hasMeasure;

  // ── Branch 1: dimensional lookup ─────────────────────────
  // A categorical lookup key with no entity identifier — hub capacity,
  // product catalog, rate table, etc. The reference_key role IS the
  // discriminator; identifier absence confirms it isn't entity-keyed
  // data with an additional reference column.
  if (hasReferenceKey && identifierCount === 0) {
    return {
      classification: 'reference',
      confidence: 0.85,
      patternName: 'dimensional_lookup',
      matchedConditions: [
        'HAS reference_key',
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
  // Distinguish target (entity-level — one value set per entity) from
  // transaction (event-level — repeating events per entity) by identifier
  // count. One identifier = entity-keyed; two+ = event-keyed (entity ID
  // + transaction/event ID).
  if (identifierCount === 1) {
    return {
      classification: 'target',
      confidence: 0.85,
      patternName: 'entity_targets',
      matchedConditions: [
        'HAS measure',
        '1 identifier — entity-level',
        `${measureCount} measure column(s)`,
      ],
    };
  }

  if (identifierCount >= 2) {
    return {
      classification: 'transaction',
      confidence: 0.85,
      patternName: 'event_transactions',
      matchedConditions: [
        'HAS measure',
        `${identifierCount} identifier(s) — event-level`,
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
