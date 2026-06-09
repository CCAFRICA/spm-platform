/**
 * HF-248 Phase 2 — interpretation error taxonomy + bounded retry policy.
 *
 * Structural classifier per T1-E910 v2 (Korean Test): error class is derived
 * from STRUCTURAL signals (HTTP status codes, JSON parse signatures, validator
 * violation types) — not from message string matching beyond standard
 * protocol-level fields. The taxonomy distinguishes cognition failures
 * (deterministic, retrying doesn't help) from adapter failures (transient,
 * bounded retry with back-off is appropriate).
 *
 * Per T1-E920 (Repeated Fix Failure Is a Pattern): the policy CAPS retries
 * by class. Cognition errors get 1 attempt — same LLM call against same input
 * will deterministically produce the same truncated/violating output. Adapter
 * errors get 2-3 attempts with exponential back-off.
 */

export type InterpretationErrorClass =
  | 'cognition_truncation'   // LLM emitted truncated content (parse error mid-stream, missing rate-table cells)
  | 'cognition_violation'    // Validator rejected (grammar violation, terminal completeness, scale annotation)
  | 'adapter_rate_limit'     // HTTP 429
  | 'adapter_overloaded'     // HTTP 503
  | 'adapter_timeout'        // HTTP 504 or network timeout
  | 'adapter_transient'      // Other 5xx
  | 'schema_invalid'         // Response shape wrong (missing required fields)
  | 'unknown';

export interface ComponentOutcome {
  id: string;
  name: string;
  status: 'success' | 'failed';
  attempts: number;
  errClass?: InterpretationErrorClass;
  errMessage?: string;
  httpStatus?: number;
  violations?: string;
  /** HF-248 Phase 3: marker that this component was skipped via reimport-resume (no LLM call this run). */
  skippedFromPrior?: boolean;
  /**
   * HF-280: the variant/category id(s) this component applies to (from the
   * skeleton's appliesToEmployeeTypes). DISPLAY data only — carried so the
   * import-atomicity failure (plan-interpretation.ts) can name which variant a
   * failed component belongs to. NOT a predicate (the atomicity predicate is
   * outcome.status only).
   */
  appliesTo?: string[];
  lastAttemptAt: string;
}

interface RetryPolicySpec {
  maxAttempts: number;
  backoffMs: number;
}

/**
 * Classify an interpretation failure. Accepts either a thrown error (from
 * the AI adapter) or a parsed response object (the adapter-layer fallback
 * shape `{parseError, error, ...}`). Returns the structural class — callers
 * use the class to look up the retry policy below.
 */
export function classifyInterpretationError(
  err: unknown,
  response?: Record<string, unknown> | null,
): InterpretationErrorClass {
  // Structural classification from response shape (cognition + parse).
  if (response && typeof response === 'object') {
    if (response.parseError === true) {
      // The adapter caught JSON.parse failure. parse-mid-stream is the
      // canonical truncation signature.
      return 'cognition_truncation';
    }
    if (typeof response.error === 'string' && response.error.startsWith('JSON parse failed')) {
      return 'cognition_truncation';
    }
    if (response.fallback === true) {
      // Provider-level fallback (no content, hard failure) — treat as
      // transient until proven deterministic.
      return 'adapter_transient';
    }
  }

  // Validator-side failures arrive via thrown UnconvertibleComponentError or
  // a wrapped Error whose message contains the violation signature.
  if (err instanceof Error) {
    const msg = err.message ?? '';
    if (msg.includes('exhaustive_emission')) {
      return 'cognition_truncation';
    }
    if (
      msg.includes('arity@')
      || msg.includes('op_unknown@')
      || msg.includes('unknown_prime@')
      || msg.includes('child_topology@')
      || msg.includes('decision_127@')
      || msg.includes('scale_annotation@')
      || msg.includes('terminal_completeness@')
      || msg.includes('UnconvertibleComponentError')
    ) {
      return 'cognition_violation';
    }
    // HTTP status sniffing on the error message — standard protocol-level
    // structural signal. The adapter throws with the HTTP status embedded:
    // `Anthropic API error: 429 {...}`. Match the status code, not the body.
    const httpMatch = msg.match(/(?:^|\s)(\d{3})(?:\s|$)/);
    if (httpMatch) {
      const code = Number(httpMatch[1]);
      if (code === 429) return 'adapter_rate_limit';
      if (code === 503) return 'adapter_overloaded';
      if (code === 504) return 'adapter_timeout';
      if (code >= 500 && code < 600) return 'adapter_transient';
    }
    if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('econnreset') || msg.toLowerCase().includes('etimedout')) {
      return 'adapter_timeout';
    }
    if (msg.includes('No content in Anthropic response')) {
      return 'adapter_transient';
    }
  }

  return 'unknown';
}

/**
 * Retry policy per error class. Cognition errors get exactly 1 attempt —
 * the same LLM call against the same input deterministically produces
 * the same truncated/violating output. Adapter errors get bounded retry
 * with exponential back-off.
 */
export function retryPolicy(errClass: InterpretationErrorClass): RetryPolicySpec {
  switch (errClass) {
    case 'cognition_violation':
      // HF-265 (P2.2): bounded retry. A malformed CompositionalIntent (missing shape/kind
      // discriminants on branch nodes) can vary across attempts, so 3 attempts gives the LLM a
      // chance to self-correct. CAVEAT (HALT-2): interpretPlanComponent runs at temperature 0 and
      // takes no retry-hint parameter, so without a prompt-level structural hint (threading that
      // requires the adapter plan_component prompt-build — out of HF-265 scope, §6) the retry may
      // reproduce the same output. The effective-retry hint is deferred to the §6A emission DIAG.
      return { maxAttempts: 3, backoffMs: 0 };
    case 'cognition_truncation':
      return { maxAttempts: 1, backoffMs: 0 };
    case 'adapter_rate_limit':
      return { maxAttempts: 3, backoffMs: 2000 };  // 2s, 4s
    case 'adapter_overloaded':
      return { maxAttempts: 3, backoffMs: 2000 };
    case 'adapter_timeout':
      return { maxAttempts: 2, backoffMs: 1000 };
    case 'adapter_transient':
      return { maxAttempts: 2, backoffMs: 1000 };
    case 'schema_invalid':
      return { maxAttempts: 1, backoffMs: 0 };
    case 'unknown':
      return { maxAttempts: 1, backoffMs: 0 };
  }
}
