/**
 * Synaptic Anomaly Detector
 *
 * Lightweight inline checks during entity execution.
 * Writes anomaly synapses to the SynapticSurface.
 * ZERO domain language. Korean Test applies.
 *
 * Checks:
 * 1. boundary_hit   — input value exactly on a tier boundary
 * 2. zero_output    — operation produced zero when input was non-zero
 * 3. data_missing   — required metric is null/undefined/NaN
 * 4. range_exceeded — output outside expected range for operation type
 */

import type { SynapticSurface } from './synaptic-types';
import { writeSynapse } from './synaptic-surface';

// ──────────────────────────────────────────────
// Anomaly Check Results
// ──────────────────────────────────────────────

export interface AnomalyCheck {
  detected: boolean;
  type: string;
  detail: string;
  value: number;
}

// ──────────────────────────────────────────────
// Boundary Hit — value exactly on a tier edge
// ──────────────────────────────────────────────

/**
 * Check if a value falls exactly on a boundary edge.
 * This can indicate edge-case behavior worth tracking.
 */
export function checkBoundaryHit(
  value: number,
  boundaries: Array<{ min: number | null; max: number | null }>,
  componentIndex: number,
  entityId: string,
  surface?: SynapticSurface
): AnomalyCheck {
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    if ((b.min !== null && value === b.min) || (b.max !== null && value === b.max)) {
      const check: AnomalyCheck = {
        detected: true,
        type: 'boundary_hit',
        detail: `value=${value} matches boundary[${i}] edge`,
        value,
      };

      if (surface) {
        writeSynapse(surface, {
          type: 'boundary_behavior',
          componentIndex,
          entityId,
          value: 0.5, // neutral — not necessarily wrong
          detail: check.detail,
          timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        });
      }

      return check;
    }
  }

  return { detected: false, type: 'boundary_hit', detail: '', value };
}

// ──────────────────────────────────────────────
// Zero Output — non-zero input produced zero
// ──────────────────────────────────────────────

/**
 * Check if an operation produced zero when the input was non-zero.
 * May indicate a misconfigured tier or gate.
 */
export function checkZeroOutput(
  inputValue: number,
  outputValue: number,
  componentIndex: number,
  entityId: string,
  surface?: SynapticSurface
): AnomalyCheck {
  if (inputValue !== 0 && outputValue === 0) {
    const check: AnomalyCheck = {
      detected: true,
      type: 'zero_output',
      detail: `input=${inputValue} produced output=0`,
      value: inputValue,
    };

    if (surface) {
      writeSynapse(surface, {
        type: 'anomaly',
        componentIndex,
        entityId,
        value: 0.3, // low confidence — might be intentional
        detail: check.detail,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }

    return check;
  }

  return { detected: false, type: 'zero_output', detail: '', value: outputValue };
}

// ──────────────────────────────────────────────
// Data Missing — required metric not available
// ──────────────────────────────────────────────

/**
 * Check if a required data field is missing or invalid.
 */
export function checkDataMissing(
  fieldName: string,
  rawValue: unknown,
  componentIndex: number,
  entityId: string,
  surface?: SynapticSurface
): AnomalyCheck {
  const isMissing = rawValue === undefined || rawValue === null || (typeof rawValue === 'number' && isNaN(rawValue));

  if (isMissing) {
    const check: AnomalyCheck = {
      detected: true,
      type: 'data_missing',
      detail: `field="${fieldName}" is ${rawValue === undefined ? 'undefined' : rawValue === null ? 'null' : 'NaN'}`,
      value: 0,
    };

    if (surface) {
      writeSynapse(surface, {
        type: 'data_quality',
        componentIndex,
        entityId,
        value: 0.0, // zero confidence — data is missing
        detail: check.detail,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }

    return check;
  }

  return { detected: false, type: 'data_missing', detail: '', value: typeof rawValue === 'number' ? rawValue : 0 };
}

// ──────────────────────────────────────────────
// Range Exceeded — output outside expected bounds
// ──────────────────────────────────────────────

/**
 * Check if an output value is outside an expected range.
 * For ratios: expected 0-5 (500% max).
 * For scalars: check against explicit min/max.
 */
export function checkRangeExceeded(
  value: number,
  expectedMin: number,
  expectedMax: number,
  componentIndex: number,
  entityId: string,
  surface?: SynapticSurface
): AnomalyCheck {
  if (value < expectedMin || value > expectedMax) {
    const check: AnomalyCheck = {
      detected: true,
      type: 'range_exceeded',
      detail: `value=${value} outside expected [${expectedMin}, ${expectedMax}]`,
      value,
    };

    if (surface) {
      writeSynapse(surface, {
        type: 'anomaly',
        componentIndex,
        entityId,
        value: 0.2, // low confidence — likely a real problem
        detail: check.detail,
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }

    return check;
  }

  return { detected: false, type: 'range_exceeded', detail: '', value };
}

// ──────────────────────────────────────────────
// Batch Check — run all detectors on an entity result
// ──────────────────────────────────────────────

export interface EntityCheckResult {
  entityId: string;
  componentIndex: number;
  anomalies: AnomalyCheck[];
  totalAnomalies: number;
}

/**
 * Run all relevant anomaly checks on an entity's execution result.
 * Returns summary of detected anomalies.
 */
export function checkEntityResult(
  entityId: string,
  componentIndex: number,
  inputValue: number,
  outputValue: number,
  boundaries: Array<{ min: number | null; max: number | null }> | undefined,
  surface?: SynapticSurface
): EntityCheckResult {
  const anomalies: AnomalyCheck[] = [];

  // Check boundary hit if boundaries provided
  if (boundaries && boundaries.length > 0) {
    const bCheck = checkBoundaryHit(inputValue, boundaries, componentIndex, entityId, surface);
    if (bCheck.detected) anomalies.push(bCheck);
  }

  // Check zero output
  const zCheck = checkZeroOutput(inputValue, outputValue, componentIndex, entityId, surface);
  if (zCheck.detected) anomalies.push(zCheck);

  return {
    entityId,
    componentIndex,
    anomalies,
    totalAnomalies: anomalies.length,
  };
}
