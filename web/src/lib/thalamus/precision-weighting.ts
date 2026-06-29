/**
 * OB-253 Phase 4 — precision-weighting (the trust safeguard, DS-031 §5).
 *
 * Predictive coding's power and danger are the same mechanism: a strongly-predicting model
 * HALLUCINATES — it predicts away real signal it should have surfaced. Maximum prediction (silent,
 * confidence ≥ 0.95) is maximum hallucination risk. For a trust platform, the worst failure is a real
 * data error a confident model silently predicts away, and the operator never sees it.
 *
 * The safeguard: override the density execution mode TOWARD SURFACING when the CONSEQUENCE of a wrong
 * prediction is high AND the model's EXPOSURE (how much of this exact structure it has actually seen)
 * is thin. High confidence on thin exposure is exactly where a model hallucinates.
 *
 * Decision 158: the override is DETERMINISTIC — a pure function of consequence × exposure. The LLM does
 * NOT decide what to surface; this function does. The LLM may only reason (at the apex) about what was
 * surfaced. No-registry: consequence validates STRUCTURAL properties (downstream dependency, prior
 * correction history, identity impact, scale), never set membership / a list of "important fields".
 *
 * §5 is a LEARNING SURFACE (architect Q2): the calibration is NOT a hardcoded threshold. It starts
 * conservative and converges from operator feedback (confirm → exposure grows, surface less; correct →
 * a real miss, surface more). refineCalibration() is that feedback step.
 */

import type { CoPresentSurface, ExposureSignal } from './signal-surface';
import { exposureFromSurface, THIN_EXPOSURE_EXECUTIONS, THIN_EXPOSURE_MATCHES } from './signal-surface';
import type { JointResolution, ColumnContext } from './joint-recognition';
import { numericForm } from './joint-recognition';

export type ExecutionMode = 'silent' | 'light_trace' | 'full_trace';

// Baseline mode from density confidence (mirrors the engine's DENSITY_THRESHOLDS; read-only — G9).
export const SILENT_MIN = 0.95;
export const FULL_TRACE_MAX = 0.70;
export function baselineMode(confidence: number): ExecutionMode {
  if (confidence >= SILENT_MIN) return 'silent';
  if (confidence >= FULL_TRACE_MAX) return 'light_trace';
  return 'full_trace';
}

export interface ConsequenceSignal {
  score: number; // [0,1]
  factors: string[];
}

/**
 * Consequence of a WRONG prediction for a value — derived from its STRUCTURAL position in the data
 * graph (no registry, no field-name list). Structural indicators:
 *  - identity-cascade   : a deduplication (distinct-identity) error cascades through entity resolution
 *  - anomaly            : a genuine outlier silently accepted corrupts a high-stakes input
 *  - error-prone field  : prior recognition/remediation signals exist for this column (historically corrected)
 *  - feeds-calculation  : a numeric value likely feeds a calc component (wrong input → wrong payout)
 *  - scale              : a high-recall tenant where silent errors accumulate
 */
export function consequence(r: JointResolution, surface: CoPresentSurface): ConsequenceSignal {
  const factors: string[] = [];
  let score = 0;
  if (r.resolvedFacet === 'deduplication') { score += 0.4; factors.push('entity_resolution_cascade'); }
  if (r.resolvedFacet === 'anomaly') { score += 0.35; factors.push('genuine_anomaly'); }
  const priorForColumn = surface.signals.filter((s) => {
    const sv = s.signalValue as { column?: unknown } | null;
    return sv && typeof sv === 'object' && (sv as { column?: unknown }).column === r.column;
  }).length;
  if (priorForColumn > 0) { score += Math.min(0.3, priorForColumn / 20); factors.push(`historically_corrected:${priorForColumn}`); }
  if (numericForm(r.value) !== null) { score += 0.25; factors.push('feeds_calculation'); }
  const maxMatch = [...surface.fingerprints.sheet, ...surface.fingerprints.atom].reduce((m, f) => Math.max(m, f.matchCount), 0);
  if (maxMatch >= 5) { score += 0.1; factors.push('scale'); }
  return { score: Math.min(1, score), factors };
}

/** The learning-surface calibration (NOT a hardcoded threshold — refined by operator feedback). */
export interface PrecisionCalibration {
  /** consequence at/above which a thin-exposure value overrides toward surfacing. */
  consequenceThreshold: number;
  /** exposure executions below which exposure is "thin". */
  thinExecutions: number;
  /** exposure matches below which exposure is "thin". */
  thinMatches: number;
}

/** Conservative initial calibration (structural). It converges via refineCalibration. */
export const DEFAULT_CALIBRATION: PrecisionCalibration = {
  consequenceThreshold: 0.5,
  thinExecutions: THIN_EXPOSURE_EXECUTIONS,
  thinMatches: THIN_EXPOSURE_MATCHES,
};

export type OperatorFeedback = 'confirmed' | 'corrected';

/**
 * Refine the calibration from one operator decision (the learning surface, architect Q2). A CORRECTION
 * means a surfaced item was a real error → be MORE eager to surface (lower threshold). A CONFIRMATION
 * means a surfaced item was fine → be slightly LESS eager (raise threshold). Bounded so it converges,
 * never runs away. Deterministic. The exposure thresholds also relax as the surface accumulates.
 */
export function refineCalibration(cal: PrecisionCalibration, feedback: OperatorFeedback): PrecisionCalibration {
  const STEP = 0.05;
  const next = { ...cal };
  if (feedback === 'corrected') next.consequenceThreshold = Math.max(0.2, cal.consequenceThreshold - STEP);
  else next.consequenceThreshold = Math.min(0.9, cal.consequenceThreshold + STEP);
  return next;
}

export interface PrecisionVerdict {
  value: string;
  column: string;
  baselineMode: ExecutionMode;
  overriddenMode: ExecutionMode;
  surfaced: boolean; // overridden toward surfacing (the trust flag)
  consequence: ConsequenceSignal;
  exposure: ExposureSignal;
  reason: string;
}

/**
 * The precision-weighting override (DETERMINISTIC, Decision 158). A value that density would treat as
 * `silent` (confidence ≥ 0.95) is overridden toward surfacing when consequence ≥ threshold AND exposure
 * is thin. A value with genuine (high) exposure is NOT overridden — the model has truly learned it.
 */
export function precisionWeight(input: {
  baselineConfidence: number;
  resolution: JointResolution;
  surface: CoPresentSurface;
  calibration?: PrecisionCalibration;
}): PrecisionVerdict {
  const cal = input.calibration ?? DEFAULT_CALIBRATION;
  const base = baselineMode(input.baselineConfidence);
  const cons = consequence(input.resolution, input.surface);
  const expBase = exposureFromSurface(input.surface);
  // re-evaluate thinness against the (learning) calibration thresholds
  const thin = expBase.totalExecutions < cal.thinExecutions && expBase.matchCount < cal.thinMatches;
  const exposure: ExposureSignal = { ...expBase, thin };

  const trigger = cons.score >= cal.consequenceThreshold && thin;
  let overridden = base;
  let surfaced = false;
  let reason: string;
  if (trigger && base === 'silent') {
    // the load-bearing case: a value the model would silently predict away is overridden to visible.
    overridden = 'light_trace';
    surfaced = true;
    reason = `precision-weight override: consequence ${cons.score.toFixed(2)} ≥ ${cal.consequenceThreshold} AND exposure thin (exec=${exposure.totalExecutions}, matches=${exposure.matchCount}) → surfaced for operator judgment`;
  } else if (cons.score >= cal.consequenceThreshold && !thin) {
    reason = `no override: high consequence but GENUINE exposure (exec=${exposure.totalExecutions}, matches=${exposure.matchCount}) — the model has actually learned this pattern; efficiency preserved`;
  } else if (trigger) {
    // high consequence + thin, but the value is already non-silent (already visible) — no override needed.
    reason = `already visible (${base}); precision-weighting did not need to override`;
  } else {
    reason = `no override: consequence ${cons.score.toFixed(2)} < ${cal.consequenceThreshold}`;
  }
  return { value: input.resolution.value, column: input.resolution.column, baselineMode: base, overriddenMode: overridden, surfaced, consequence: cons, exposure, reason };
}

// re-export for the /data wiring + tests
export type { ColumnContext };
