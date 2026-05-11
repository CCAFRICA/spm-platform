/**
 * Canonical Signal Writer — OB-199 Phase 3 (DS-023 §5.1, §5.2, §5.3, §5.5)
 *
 * The singular entry point for every write to `classification_signals`. All
 * pre-existing writers (`persistSignal`, `persistSignalBatch`,
 * `writeClassificationSignal`, and the four direct `.from('classification_signals').insert(...)`
 * bypass sites surfaced in AUD-006 §1.2) migrate to call `writeSignal` /
 * `writeSignalBatch` per DS-023 §5.1.
 *
 * Substrate enforcement at the boundary:
 *
 *   §5.2 — Structural contract enforcement (Decision 30 v2 inclusive [0.0, 1.0])
 *   §5.3 — Identifier derivation from the registry (Decision 154/155, AUD-004 v3 E1+E2+E3)
 *   §5.4 — Producer-side normalization (OB-199 Phase 1 at anthropic-adapter.ts)
 *   §5.5 — No writer-side clamp (HF-214 Phase 2 A clamp removed)
 *
 * §5.2 validation outcomes (CHANGE 2 in DS-022 v2 + architect resolution 2026-05-11):
 *
 *   in_range          → confidence persists as asserted (Decision 30 v2: 0.0–1.0 inclusive)
 *   out_of_range      → row persists with confidence:null + observability:write_failure signal
 *   missing_required  → row persists with confidence:null + observability:write_failure signal
 *   missing_optional  → row persists with confidence:null; no observability signal
 *
 * T1-E902 (Carry Everything): row always persists when the signal_type is
 * registered; the confidence field carries the validation outcome (the value,
 * or null when the value would violate the contract).
 *
 * T1-E907 (Fix Logic, Not Data): out-of-range and missing-required outcomes
 * emit an observability:write_failure signal so the producer-side defect is
 * structurally observable. The fix lives at the producer; the writer surfaces.
 *
 * Decision 154/155: unregistered signal_type fails at the boundary with
 * structured error (CanonicalWriteError, cause='unregistered_signal_type').
 * No soft-warn at this layer; the registry is the canonical declaration surface
 * and unregistered writes are contract violations, not informational events.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/lib/supabase/database.types';
import { isRegistered, lookup, all as allRegistered } from './signal-registry';

// ============================================
// TYPES
// ============================================

/**
 * Public input type for canonical writes. Accepts the union of fields the
 * pre-OB-199 dual-architecture inserts wrote:
 *   - JSONB path (signal-persistence.ts): tenant_id, entity_id, signal_type,
 *     signal_value, confidence, source, context, calculation_run_id, rule_set_id
 *   - Dedicated-columns path (sci/classification-signal-service.ts): adds
 *     source_file_name, sheet_name, structural_fingerprint, classification,
 *     decision_source, classification_trace, vocabulary_bindings, agent_scores,
 *     human_correction_from, scope
 *
 * Per DS-023 §5.1, the canonical writer's insert shape includes both as nullable
 * fields. Callers from either pre-canonical path migrate to the same type.
 */
export interface CanonicalSignalInput {
  tenantId: string;
  signalType: string;
  // JSONB-path fields (from signal-persistence.ts)
  signalValue?: Record<string, unknown>;
  confidence?: number | null;
  source?: string;
  entityId?: string | null;
  context?: Record<string, unknown>;
  calculationRunId?: string | null;
  ruleSetId?: string | null;
  // Dedicated-column fields (from sci/classification-signal-service.ts;
  // collapse per AUD-001 F-002 closure)
  sourceFileName?: string | null;
  sheetName?: string | null;
  structuralFingerprint?: Record<string, unknown> | null;
  classification?: string | null;
  decisionSource?: string | null;
  classificationTrace?: Record<string, unknown> | null;
  vocabularyBindings?: Record<string, unknown> | null;
  agentScores?: Record<string, unknown> | null;
  humanCorrectionFrom?: string | null;
  scope?: string | null;
}

export type CanonicalWriteFailureCause =
  | 'unregistered_signal_type'
  | 'database_unreachable'
  | 'insert_failed';

/**
 * Typed error class thrown by the canonical writer per DS-023 §5.2:
 *
 *   - `unregistered_signal_type` — signal_type is not in the registry
 *     (Decision 154/155 violation); thrown synchronously at validation
 *   - `database_unreachable` — Supabase client throws (network, auth, etc.);
 *     thrown after retry policy (currently no retry)
 *   - `insert_failed` — Postgres returns an error on insert (schema mismatch,
 *     constraint violation other than confidence-range, etc.)
 *
 * Callers handle this explicitly. Fire-and-forget patterns (`void writeSignal(...)`)
 * are an architectural anti-pattern per AUD-001 F-003.
 */
export class CanonicalWriteError extends Error {
  constructor(
    public readonly cause: CanonicalWriteFailureCause,
    public readonly signalType: string,
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalWriteError';
  }
}

export interface WriteResult {
  success: boolean;
  observabilitySignalEmitted: boolean;
  error?: string;
}

export interface BatchWriteResult {
  success: boolean;
  count: number;
  observabilitySignalsEmitted: number;
  error?: string;
}

// ============================================
// VALIDATION (DS-023 §5.2)
// ============================================

type ValidationOutcome =
  | { kind: 'in_range'; confidence: number }
  | { kind: 'out_of_range'; original: unknown }
  | { kind: 'missing_required' }
  | { kind: 'missing_optional' };

/**
 * Per-signal Decision 30 v2 validation.
 *
 * Decision 30 v2: confidence ∈ [0.0, 1.0] inclusive bound (per IRA Q3 disposition).
 * 1.0 is admissible (no longer the 0.9999 exclusive clamp boundary HF-214 Phase 2
 * established). Out-of-range = confidence is a number outside [0, 1] OR NaN/Infinity.
 *
 * `confidence_required` per signal_type is read from the registry (Phase 2 schema).
 * When absent (registry returned no declaration), the caller has already failed
 * upstream via assertRegistered; this function asserts the precondition.
 */
function validateSignal(signal: CanonicalSignalInput): ValidationOutcome {
  const decl = lookup(signal.signalType);
  if (!decl) {
    throw new CanonicalWriteError(
      'unregistered_signal_type',
      signal.signalType,
      `[CanonicalWriter] signal_type '${signal.signalType}' is not registered. ` +
      `Per Decision 154/155 + AUD-004 v3 E1/E2, every signal_type must declare ` +
      `at least one reader before write. Available identifiers: ${allRegistered().map(d => d.identifier).join(', ')}`,
    );
  }
  const conf = signal.confidence;
  const confRequired = decl.confidence_required;

  if (conf === null || conf === undefined) {
    return confRequired ? { kind: 'missing_required' } : { kind: 'missing_optional' };
  }
  if (typeof conf === 'number' && Number.isFinite(conf) && conf >= 0.0 && conf <= 1.0) {
    return { kind: 'in_range', confidence: conf };
  }
  // numeric NaN/Infinity or any value outside [0, 1] (typed as number but out
  // of range) → out_of_range. Also catches non-numeric values that slipped
  // past the TypeScript optional-number annotation.
  return { kind: 'out_of_range', original: conf };
}

// ============================================
// ROW CONSTRUCTION
// ============================================

/**
 * Build the canonical `classification_signals` insert row from a
 * CanonicalSignalInput. Per DS-023 §5.1 the row shape unifies the JSONB-path
 * and dedicated-column-path schemas; missing fields persist as null per
 * Postgres column-default semantics.
 *
 * @param confidenceToPersist — the validated confidence value, or null when
 *   the §5.2 outcome rejects the producer's assertion (out_of_range,
 *   missing_required) or when no confidence was provided (missing_optional)
 */
function buildInsertRow(signal: CanonicalSignalInput, confidenceToPersist: number | null): Record<string, unknown> {
  return {
    tenant_id: signal.tenantId,
    entity_id: signal.entityId ?? null,
    signal_type: signal.signalType,
    signal_value: (signal.signalValue ?? {}) as Json,
    confidence: confidenceToPersist,
    source: signal.source ?? 'ai_prediction',
    context: (signal.context ?? {}) as Json,
    calculation_run_id: signal.calculationRunId ?? null,
    rule_set_id: signal.ruleSetId ?? null,
    // Dedicated columns (AUD-001 F-002 collapse; nullable when not provided)
    source_file_name: signal.sourceFileName ?? null,
    sheet_name: signal.sheetName ?? null,
    structural_fingerprint: (signal.structuralFingerprint ?? null) as Json | null,
    classification: signal.classification ?? null,
    decision_source: signal.decisionSource ?? null,
    classification_trace: (signal.classificationTrace ?? null) as Json | null,
    vocabulary_bindings: (signal.vocabularyBindings ?? null) as Json | null,
    agent_scores: (signal.agentScores ?? null) as Json | null,
    human_correction_from: signal.humanCorrectionFrom ?? null,
    scope: signal.scope ?? null,
  };
}

/**
 * Construct the observability:write_failure signal that accompanies an
 * out_of_range or missing_required outcome. Per DS-023 §5.2 the signal carries:
 *
 *   - offending_field: 'confidence' (the only field §5.2 currently validates)
 *   - expected_range: '[0.0, 1.0]' (Decision 30 v2 inclusive)
 *   - actual_value: the producer's asserted value (string-coerced for NaN/Infinity
 *     since JSON-stringify produces nulls for those; we want them observable)
 *   - outcome_kind: 'out_of_range' | 'missing_required'
 *   - source_signal_type: the signal_type that triggered the failure
 *
 * The observability signal itself is `confidence_required: false` per registry
 * (registered in Phase 2); it never re-triggers validation.
 */
function buildObservabilitySignal(
  originalSignal: CanonicalSignalInput,
  outcome: Exclude<ValidationOutcome, { kind: 'in_range' } | { kind: 'missing_optional' }>,
): CanonicalSignalInput {
  const actualValueObservable = outcome.kind === 'out_of_range'
    ? (typeof outcome.original === 'number' && !Number.isFinite(outcome.original)
        ? String(outcome.original) // 'NaN' | 'Infinity' | '-Infinity'
        : outcome.original)
    : null;
  return {
    tenantId: originalSignal.tenantId,
    signalType: 'observability:write_failure',
    signalValue: {
      offending_field: 'confidence',
      expected_range: '[0.0, 1.0]',
      actual_value: actualValueObservable as unknown,
      outcome_kind: outcome.kind,
      source_signal_type: originalSignal.signalType,
      source_entity_id: originalSignal.entityId ?? null,
      source_rule_set_id: originalSignal.ruleSetId ?? null,
      source_calculation_run_id: originalSignal.calculationRunId ?? null,
    },
    confidence: null, // observability:write_failure is confidence_required:false
    source: 'system',
    calculationRunId: originalSignal.calculationRunId ?? null,
    ruleSetId: originalSignal.ruleSetId ?? null,
    context: { producing_module: 'canonical-signal-writer' },
  };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Write a single signal through the canonical entry point per DS-023 §5.1.
 *
 * Throws CanonicalWriteError when:
 *   - signal_type is unregistered (cause='unregistered_signal_type')
 *   - the database insert fails (cause='insert_failed' or 'database_unreachable')
 *
 * Returns WriteResult on a contract-failure outcome (out_of_range,
 * missing_required) where the row persists but the producer should be made aware:
 *   - success=true, observabilitySignalEmitted=true
 *
 * In-range and missing-optional outcomes return success=true,
 * observabilitySignalEmitted=false.
 */
export async function writeSignal(
  signal: CanonicalSignalInput,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<WriteResult> {
  if (!isRegistered(signal.signalType)) {
    throw new CanonicalWriteError(
      'unregistered_signal_type',
      signal.signalType,
      `[CanonicalWriter] writeSignal: signal_type '${signal.signalType}' not registered. ` +
      `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
      `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
    );
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return writeSignalWithClient(signal, supabase);
}

/**
 * Internal/testable variant of writeSignal that accepts a Supabase client
 * directly. Exported for unit tests; production callers use `writeSignal`.
 */
export async function writeSignalWithClient(
  signal: CanonicalSignalInput,
  supabase: SupabaseClient,
): Promise<WriteResult> {
  const outcome = validateSignal(signal);
  const confidenceToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
  const row = buildInsertRow(signal, confidenceToPersist);

  try {
    const { error } = await supabase.from('classification_signals').insert(row);
    if (error) {
      throw new CanonicalWriteError(
        'insert_failed',
        signal.signalType,
        `[CanonicalWriter] insert failed for signal_type='${signal.signalType}' tenant='${signal.tenantId}': ${error.message}`,
      );
    }
  } catch (err) {
    if (err instanceof CanonicalWriteError) throw err;
    throw new CanonicalWriteError(
      'database_unreachable',
      signal.signalType,
      `[CanonicalWriter] database unreachable for signal_type='${signal.signalType}' tenant='${signal.tenantId}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Emit observability signal for contract-failure outcomes (out_of_range, missing_required)
  if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
    const obs = buildObservabilitySignal(signal, outcome);
    const obsRow = buildInsertRow(obs, null);
    try {
      const { error: obsError } = await supabase.from('classification_signals').insert(obsRow);
      if (obsError) {
        // Per DS-023 §5.2: observability emission failure does NOT swallow
        // the original row's persistence outcome. Surface via stderr so the
        // failure is observable, but the original write succeeded.
        console.error(
          `[CanonicalWriter] observability:write_failure emission failed (original row persisted) ` +
          `for source_signal_type='${signal.signalType}': ${obsError.message}`,
        );
        return { success: true, observabilitySignalEmitted: false };
      }
    } catch (err) {
      console.error(
        `[CanonicalWriter] observability:write_failure emission threw (original row persisted) ` +
        `for source_signal_type='${signal.signalType}': ${err instanceof Error ? err.message : String(err)}`,
      );
      return { success: true, observabilitySignalEmitted: false };
    }
    return { success: true, observabilitySignalEmitted: true };
  }

  return { success: true, observabilitySignalEmitted: false };
}

/**
 * Write a batch of signals through the canonical entry point per DS-023 §5.1.
 *
 * Behavior:
 *   - Unregistered signal_type in the batch → CanonicalWriteError on the first
 *     such signal (the entire batch fails atomically; resolve registration
 *     upstream and retry)
 *   - Per-row validation produces an outcome; rows persist together in one
 *     batch insert with confidence:null where the outcome rejects the producer
 *   - Observability signals emit in a single follow-up batch insert (one round-
 *     trip), efficient for the common case of zero or few rejections in a batch
 *   - Observability batch failure does NOT swallow the original batch outcome
 */
export async function writeSignalBatch(
  signals: CanonicalSignalInput[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<BatchWriteResult> {
  if (signals.length === 0) return { success: true, count: 0, observabilitySignalsEmitted: 0 };

  // Pre-validate every signal_type is registered (Decision 154/155 + AUD-004 v3 E1/E2).
  // Atomic: if any signal in the batch is unregistered, no writes occur.
  for (const s of signals) {
    if (!isRegistered(s.signalType)) {
      throw new CanonicalWriteError(
        'unregistered_signal_type',
        s.signalType,
        `[CanonicalWriter] writeSignalBatch: signal_type '${s.signalType}' not registered. ` +
        `Decision 154/155 + AUD-004 v3 E1/E2: registration is the canonical declaration surface. ` +
        `Available: ${allRegistered().map(d => d.identifier).join(', ')}`,
      );
    }
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return writeSignalBatchWithClient(signals, supabase);
}

/**
 * Internal/testable variant of writeSignalBatch. Exported for unit tests.
 */
export async function writeSignalBatchWithClient(
  signals: CanonicalSignalInput[],
  supabase: SupabaseClient,
): Promise<BatchWriteResult> {
  if (signals.length === 0) return { success: true, count: 0, observabilitySignalsEmitted: 0 };

  // Validate each signal; build insert rows + collect observability signals
  const outcomes = signals.map(validateSignal);
  const rows = signals.map((s, i) => {
    const outcome = outcomes[i];
    const confToPersist = outcome.kind === 'in_range' ? outcome.confidence : null;
    return buildInsertRow(s, confToPersist);
  });
  const observabilitySignals: CanonicalSignalInput[] = [];
  for (let i = 0; i < signals.length; i++) {
    const outcome = outcomes[i];
    if (outcome.kind === 'out_of_range' || outcome.kind === 'missing_required') {
      observabilitySignals.push(buildObservabilitySignal(signals[i], outcome));
    }
  }

  // Primary insert
  try {
    const { error } = await supabase.from('classification_signals').insert(rows);
    if (error) {
      // OB-199 Phase 4 supplement B (Row 6 disposition): per-row forensic
      // granularity on batch failures. The single CanonicalWriteError below
      // collapses all rows into one cause; without this loop the producer
      // cannot isolate which row(s) in the batch carry the offending value
      // (HF-214 Phase 1's pre-canonical per-row diagnostic intent restored).
      for (let i = 0; i < signals.length; i++) {
        const s = signals[i];
        const sv = (s.signalValue ?? {}) as Record<string, unknown>;
        const metricName = sv['metric_name'] ?? null;
        const componentIndex = sv['component_index'] ?? null;
        const svJson = JSON.stringify(s.signalValue ?? null);
        const svTruncated = svJson.length > 200 ? svJson.slice(0, 200) + '…' : svJson;
        console.error(
          `[CanonicalWriter] batch row=${i} signal_type=${s.signalType} ` +
          `confidence=${String(s.confidence)} ` +
          `metric_name=${String(metricName)} ` +
          `component_index=${String(componentIndex)} ` +
          `signal_value_truncated=${svTruncated}`,
        );
      }
      throw new CanonicalWriteError(
        'insert_failed',
        signals[0]?.signalType ?? '<empty-batch>',
        `[CanonicalWriter] batch insert failed (count=${signals.length}): ${error.message}`,
      );
    }
  } catch (err) {
    if (err instanceof CanonicalWriteError) throw err;
    throw new CanonicalWriteError(
      'database_unreachable',
      signals[0]?.signalType ?? '<empty-batch>',
      `[CanonicalWriter] database unreachable on batch (count=${signals.length}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Observability emission (one round-trip for the whole batch)
  let observabilityEmitted = 0;
  if (observabilitySignals.length > 0) {
    const obsRows = observabilitySignals.map(s => buildInsertRow(s, null));
    try {
      const { error: obsError } = await supabase.from('classification_signals').insert(obsRows);
      if (obsError) {
        console.error(
          `[CanonicalWriter] batch observability emission failed (originals persisted; count=${observabilitySignals.length}): ${obsError.message}`,
        );
      } else {
        observabilityEmitted = observabilitySignals.length;
      }
    } catch (err) {
      console.error(
        `[CanonicalWriter] batch observability emission threw (originals persisted; count=${observabilitySignals.length}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    success: true,
    count: signals.length,
    observabilitySignalsEmitted: observabilityEmitted,
  };
}
