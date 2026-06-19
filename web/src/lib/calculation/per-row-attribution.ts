/**
 * OB-217 — Per-Transaction Attribution (prime-DAG, self-validating)
 *
 * The calculation engine computes at the ENTITY level: for each component it
 * aggregates an entity's transaction rows into one metric and evaluates the
 * component's prime DAG once → one rounded payout per component per entity.
 * This module decomposes that single payout back onto the individual
 * `committed_data` rows that produced it, so every transaction carries its own
 * auditable contribution. It is PURE (no DB, no I/O) — all data access lives in
 * the calculation route, which feeds resolved per-row values in and writes the
 * returned traces out.
 *
 * Execution model (HEAD): every live component is `componentType: 'prime_dag'`
 * and its `calculationIntent` is a PrimeNode DAG (see intent-types.ts). The
 * legacy `operation`-vocabulary intents the original directive assumed
 * (scalar_multiply / conditional_gate / bounded_lookup_*) are not present in any
 * live tenant. Attribution therefore analyses the prime DAG structurally.
 *
 * A component is per-row additively decomposable iff its outcome is
 *   rate × Σ(per-row metric)
 * possibly under an entity-level qualification gate. Three patterns:
 *   - additive       : ungated  rate × Σmetric            (e.g. multiply(reference(F), const(R)))
 *   - qualified      : the same under a conditional gate  (the gate fires entity-level)
 *   - non-attributable: flat amounts / tiers / ratios / matrices (no per-row decomposition)
 *
 * SR-38 (mathematical-equivalence gate): the per-row contributions are summed in
 * decimal.js and compared to the engine's RAW pre-rounding outcome
 * (`intentResult.outcome`). Decimal distribution makes rate × Σvalues identical
 * to Σ(rate × value), so the sum equals the raw outcome EXACTLY (not within a
 * tolerance). The engine then rounds once at the entity level to 0 dp
 * (ROUND_HALF_EVEN, HF-265/Decision 122); rounding the per-row sum the same way
 * recovers the stored integer payout. GAAP line-item presentation rounds the
 * sum once, never per row — so per-row contributions are stored unrounded and
 * reconcile to the raw outcome, and to the stored payout through one rounding.
 *
 * Korean Test: operates only on the domain-agnostic prime vocabulary and the
 * structural binding column passed in by the caller. No column-name, language,
 * or tenant literals.
 */

import Decimal from 'decimal.js';
import { toDecimal, toNumber, ZERO } from '@/lib/calculation/decimal-precision';
import type { Json } from '@/lib/supabase/database.types';
import type { PlanComponent } from '@/types/compensation-plan';

export type AttributionPattern = 'additive' | 'qualified' | 'non-attributable';

/** A single linear term: outcome contribution = rate × Σ(per-row metricField). */
export interface AdditiveTerm {
  /** Constant multiplier folded along the multiply chain (1 for a bare reference). */
  rate: number;
  /** The DAG reference field (resolved to a column via the convergence binding)
   *  or an aggregate field (a row_data column read directly). */
  metricField: string;
  kind: 'reference' | 'aggregate';
  /** True if this term sits beneath a `conditional` gate (qualification). */
  gated: boolean;
}

export interface DagAnalysis {
  terms: AdditiveTerm[];
  /** True when the DAG contains at least one conditional gate. */
  hasGate: boolean;
}

// RATIFIED: numerical-equality epsilon for decimal round-trip comparison (IEEE-754 /
// Goldberg 1991), NOT a developer-assigned authority threshold (Decision 110). The
// reconciliation that carries authority is round_half_even(Σ,0) === storedPayout below.
const MATCH_EPSILON = new Decimal('1e-6');

function constValue(node: unknown): number | null {
  if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (n.prime === 'constant' && typeof n.value === 'number') return n.value;
  }
  return null;
}

/**
 * Walk a prime DAG collecting candidate linear terms. `multiply(const, X)` folds
 * the constant into the rate and recurses into X; `conditional` recurses into
 * both branches (marking terms gated). Constants, ratios (divide), add/subtract,
 * and other primes yield no term (→ non-attributable contribution).
 */
function walkDag(node: unknown, rate: number, gated: boolean, out: AdditiveTerm[]): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  switch (n.prime) {
    case 'reference': {
      if (typeof n.field === 'string') out.push({ rate, metricField: n.field, kind: 'reference', gated });
      return;
    }
    case 'aggregate': {
      // Only an additive aggregation (sum) decomposes per row.
      if (n.op === 'sum' && typeof n.field === 'string') {
        out.push({ rate, metricField: n.field, kind: 'aggregate', gated });
      }
      return;
    }
    case 'arithmetic': {
      if (n.op !== 'multiply') return; // add/subtract/divide are not single-metric linear
      const inputs = Array.isArray(n.inputs) ? n.inputs : [];
      if (inputs.length !== 2) return;
      const c0 = constValue(inputs[0]);
      const c1 = constValue(inputs[1]);
      if (c0 !== null && c1 === null) walkDag(inputs[1], rate * c0, gated, out);
      else if (c1 !== null && c0 === null) walkDag(inputs[0], rate * c1, gated, out);
      // const×const or metric×metric → not a single-metric linear term: no term emitted
      return;
    }
    case 'conditional': {
      walkDag((n as { then?: unknown }).then, rate, true, out);
      walkDag((n as { else?: unknown }).else, rate, true, out);
      return;
    }
    default:
      // scope / filter / prior_period / compare / logical / constant → no term
      return;
  }
}

function dedupeTerms(terms: AdditiveTerm[]): AdditiveTerm[] {
  const seen = new Set<string>();
  const out: AdditiveTerm[] = [];
  for (const t of terms) {
    const key = `${t.kind}|${t.metricField}|${t.rate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function analyzePrimeDag(intent: unknown): DagAnalysis {
  const raw: AdditiveTerm[] = [];
  walkDag(intent, 1, false, raw);
  const hasGate = raw.some(t => t.gated);
  return { terms: dedupeTerms(raw), hasGate };
}

/**
 * Structural classification. Drives WHICH components run the per-row loop; the
 * runtime self-validation (sum === rawOutcome) is the final authority on whether
 * a given entity's outcome was actually produced by an attributable term.
 */
export function classifyAttributionPattern(component: PlanComponent): AttributionPattern {
  const intent = component.calculationIntent;
  if (!intent) return 'non-attributable';
  const { terms, hasGate } = analyzePrimeDag(intent);
  if (terms.length === 0) return 'non-attributable';
  // An ungated term always fires → additive. Only-gated terms → qualified.
  return terms.some(t => !t.gated) ? 'additive' : (hasGate ? 'qualified' : 'additive');
}

/**
 * Extract a business transaction reference from a row, structurally: a column
 * whose field-identity is an identifier and is NOT the entity-identifier column.
 * Prefers an explicit `transaction_identifier`. Returns null when no such column
 * exists (the structural identity `committed_data_id` is always sufficient).
 *
 * `metadata` is the sibling committed_data.metadata (field_identities live there,
 * not in row_data). `entityIdField` is the column to exclude (metadata.entity_id_field
 * or the binding's entity_identifier column).
 */
export function extractTransactionRef(
  rowData: Record<string, unknown> | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  entityIdField: string | null | undefined,
): string | null {
  if (!rowData || !metadata) return null;
  const fieldIdentities = metadata.field_identities as
    | Record<string, { structuralType?: string; contextualIdentity?: string }>
    | undefined;
  if (!fieldIdentities || typeof fieldIdentities !== 'object') return null;

  const candidates: Array<{ col: string; isTxn: boolean }> = [];
  for (const [col, fi] of Object.entries(fieldIdentities)) {
    if (!fi || fi.structuralType !== 'identifier') continue;
    if (entityIdField && col === entityIdField) continue;
    if (rowData[col] === null || rowData[col] === undefined || rowData[col] === '') continue;
    candidates.push({ col, isTxn: fi.contextualIdentity === 'transaction_identifier' });
  }
  if (candidates.length === 0) return null;
  // Deterministic: prefer an explicit transaction identifier, then alphabetical by column.
  candidates.sort((a, b) => (a.isTxn === b.isTxn ? a.col.localeCompare(b.col) : a.isTxn ? -1 : 1));
  const v = rowData[candidates[0].col];
  return v === null || v === undefined ? null : String(v);
}

export interface PerRowMetricValue {
  committedDataId: string;
  /** Raw (pre-scale) numeric metric value read from the bound column for this row. */
  rawValue: number;
  transactionRef: string | null;
}

export interface AttributionTracePrecursor {
  committedDataId: string;
  transactionRef: string | null;
  formula: string;
  inputs: Json;
  output: Json;
}

export interface AttributionOutcome {
  /** Σ(perRow) === rawOutcome within MATCH_EPSILON — this term produced the entity's outcome. */
  matched: boolean;
  /** round_half_even(Σ, 0) === storedPayout — per-row sum, engine-rounded, recovers the stored integer. */
  reconciled: boolean;
  perRowSum: number;
  roundedSum: number;
  /** |Σ - rawOutcome| — exact-equivalence delta for SR-38 reporting. */
  delta: number;
  traces: AttributionTracePrecursor[];
}

/**
 * Compute per-row contributions for one term and build trace precursors, all in
 * decimal.js. `effectiveRate` already folds the binding scale_factor into the
 * term rate, so contribution = effectiveRate × rawValue and the stored input is
 * the raw column value. Pure — the caller decides emit vs HALT from `matched`.
 */
export function attributeRows(params: {
  rows: PerRowMetricValue[];
  effectiveRate: number;
  metricColumn: string;
  pattern: AttributionPattern;
  rawOutcome: number;
  storedPayout: number;
  entityMetricValue?: number;
}): AttributionOutcome {
  const { rows, effectiveRate, metricColumn, pattern, rawOutcome, storedPayout, entityMetricValue } = params;
  const rateD = toDecimal(effectiveRate);
  let sum = ZERO;
  const traces: AttributionTracePrecursor[] = [];

  for (const r of rows) {
    const contribution = rateD.mul(toDecimal(r.rawValue));
    sum = sum.plus(contribution);
    const output: Record<string, unknown> = {
      contribution: toNumber(contribution),
      rate: effectiveRate,
      metricValue: r.rawValue,
      pattern,
      entityRawOutcome: rawOutcome,
      entityStoredPayout: storedPayout,
    };
    if (pattern === 'qualified') {
      output.qualification = { fired: true, entityMetricValue: entityMetricValue ?? null };
    }
    traces.push({
      committedDataId: r.committedDataId,
      transactionRef: r.transactionRef,
      formula: `${effectiveRate} × ${metricColumn}`,
      inputs: { [metricColumn]: r.rawValue } as Json,
      output: output as Json,
    });
  }

  const perRowSum = toNumber(sum);
  const roundedSum = toNumber(sum.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN));
  const delta = toNumber(sum.minus(toDecimal(rawOutcome)).abs());
  const matched = sum.minus(toDecimal(rawOutcome)).abs().lte(MATCH_EPSILON);
  const reconciled = roundedSum === storedPayout;
  return { matched, reconciled, perRowSum, roundedSum, delta, traces };
}
