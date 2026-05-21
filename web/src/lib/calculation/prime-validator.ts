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
 *   3. Scale annotation presence — every constant used in a compare carries
 *      meta={unit,scale,confidence} (warning — convergence has a deterministic
 *      fallback that infers scale from distribution).
 *   4. Decision 127 compliance — band-selection conditionals use gte+lt
 *      (half-open). lte upper bounds are flagged as violations.
 *   5. Terminal completeness — else chains terminate in an explicit constant.
 *
 * Critical violations (unknown_prime, arity, op_unknown, child_topology) make
 * the result invalid; the caller (ai-plan-interpreter) throws so the component
 * cannot proceed. Warnings (scale_annotation, exhaustive_emission, decision_127,
 * terminal_completeness) are logged but do not block — the convergence layer's
 * deterministic fallbacks handle the missing-metadata cases.
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
