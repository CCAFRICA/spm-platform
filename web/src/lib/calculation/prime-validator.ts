/**
 * Prime-DAG Post-Generation Validator
 *
 * Runs after every plan interpretation, before the LLM's emitted intent is
 * persisted to rule_sets.components. Validates each prime_dag component's
 * calculationIntent against PRIME_GRAMMAR (the canonical declaration).
 *
 * Five checks (from prime-grammar.validatePrimeTree):
 *   1. Type correctness — every node's inputs match arity and type constraints.
 *   2. Exhaustive emission — when an expected cell count is supplied, count
 *      constant leaves and warn if fewer than expected (warning, not critical).
 *   3. Scale self-description (HF-339) — a compare-constant that carries scale
 *      metadata must carry a well-formed, free-form self-describing nature
 *      (meta.unit, open-vocabulary). A bare constant is the model's valid
 *      declaration that the value needs no normalization and is NOT flagged.
 *      (Replaces the prior set-membership presence check, which warned on every
 *      correct-but-stripped value against the closed ScaleUnit registry.)
 *   4. Decision 127 compliance — band-selection conditionals use gte+lt
 *      (half-open). lte upper bounds are flagged as violations.
 *   5. Terminal completeness — else chains terminate in an explicit constant.
 *
 * Critical violations make the result invalid; the caller (ai-plan-interpreter /
 * plan-orchestration) throws so the component cannot proceed.
 *
 * HF-341 R3: with the CompositionalIntent shape layer + intent-constructor eradicated, the LLM emits
 * the PrimeNode DAG directly and this verifier IS the construction layer. The three guarantees that
 * constructTree previously provided BY CONSTRUCTION — Decision-127 half-open band edges, single-site /
 * coherent scale placement (incl. the HF-279 ratio-band rule), and terminal completeness — are now
 * ELEVATED to CRITICAL: a directly-emitted DAG that violates any of them is rejected loudly at import
 * (C2), never silently persisted. exhaustive_emission stays critical (HF-244). Only structurally-benign
 * notes (if any) remain warnings.
 */

import { validatePrimeTree } from './prime-grammar';
import type { ValidationResult, ValidationViolation } from './prime-grammar';

export type { ValidationResult, ValidationViolation };

export interface ValidateComponentOptions {
  /**
   * Expected leaf-count for band-selection patterns. Plan interpretation may
   * supply this when the plan metadata declares a rate-table cell count
   * (1D N tiers or 2D N×M cells). Absent → exhaustive_emission check skipped.
   */
  expectedCellCount?: number;
  /**
   * Component label for diagnostic context — included in log lines.
   */
  componentLabel?: string;
}

/**
 * Validate a single component intent. Returns the structured result so the
 * caller can log critical/warning violations and decide whether to proceed.
 */
export function validateComponentIntent(
  intent: unknown,
  opts: ValidateComponentOptions = {},
): ValidationResult {
  return validatePrimeTree(intent, { expectedCellCount: opts.expectedCellCount });
}

/**
 * Emit a single-line summary to the supplied logger (or console.warn by
 * default) for any violations found. Caller controls whether to throw on
 * critical — this helper does not throw.
 */
export function logValidationViolations(
  result: ValidationResult,
  componentLabel: string,
  logger: (line: string) => void = (s) => console.warn(s),
): void {
  if (result.violations.length === 0) return;
  for (const v of result.violations) {
    logger(
      `[PrimeValidator] ${componentLabel} (${v.severity}) ${v.check} @ ${v.nodePath}: ${v.message}`,
    );
  }
}
