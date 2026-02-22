/**
 * Reconciliation Agent — Foundational Agent
 *
 * Compares execution outcomes against benchmark data.
 * Produces structured findings with classification.
 * Writes correction synapses that backpropagate to next run.
 *
 * ZERO domain language. Korean Test applies.
 * Communicates exclusively through the Synaptic Surface.
 */

import type { SynapticSurface, Synapse } from '@/lib/calculation/synaptic-types';
import { writeSynapse, readSynapses } from '@/lib/calculation/synaptic-surface';
import type { ExecutionTrace } from '@/lib/calculation/intent-types';

// ──────────────────────────────────────────────
// Input Types
// ──────────────────────────────────────────────

export interface ReconciliationInput {
  tenantId: string;
  batchId: string;
  benchmarkRecords: BenchmarkRecord[];
  calculatedResults: CalculatedResult[];
  executionTraces: Map<string, ExecutionTrace[]>;
  surface: SynapticSurface;
  tolerance?: number; // default 0.01
}

export interface BenchmarkRecord {
  entityExternalId: string;
  componentIndex: number;
  expectedOutcome: number;
  metadata?: Record<string, unknown>;
}

export interface CalculatedResult {
  entityId: string;
  entityExternalId: string;
  componentIndex: number;
  calculatedOutcome: number;
}

// ──────────────────────────────────────────────
// Output Types
// ──────────────────────────────────────────────

export type DiscrepancyClass =
  | 'match'
  | 'rounding'
  | 'data_divergence'
  | 'logic_divergence'
  | 'scope_mismatch'
  | 'temporal_mismatch'
  | 'offset_cancellation'
  | 'unclassified';

export interface TraceEvidence {
  reason: string;
  inputValues?: Record<string, number>;
  boundaryMatched?: { index: number; min: number | null; max: number | null };
  outputValue?: number;
}

export interface SynapticContext {
  confidenceSynapses: number;
  anomalySynapses: number;
  dataQualitySynapses: number;
  avgConfidence: number;
}

export interface ReconciliationFinding {
  entityId: string;
  entityExternalId: string;
  componentIndex: number;
  calculatedOutcome: number;
  expectedOutcome: number;
  delta: number;
  deltaPercent: number;
  classification: DiscrepancyClass;
  confidence: number;
  traceEvidence: TraceEvidence;
  synapticContext: SynapticContext;
}

export interface ReconciliationReport {
  batchId: string;
  timestamp: string;
  entityCount: {
    calculated: number;
    benchmark: number;
    matched: number;
    unmatched: number;
  };
  totalOutcome: {
    calculated: number;
    benchmark: number;
    delta: number;
    deltaPercent: number;
  };
  findings: ReconciliationFinding[];
  classifications: Record<DiscrepancyClass, number>;
  synapticDensityImpact: Array<{ signature: string; confidenceAdjustment: number }>;
  falseGreenDetected: boolean;
  correctionSynapsesWritten: number;
}

// ──────────────────────────────────────────────
// Classification Engine (deterministic, no LLM)
// ──────────────────────────────────────────────

function classifyDiscrepancy(
  calculated: number,
  expected: number,
  tolerance: number,
  trace: ExecutionTrace | undefined,
  surface: SynapticSurface,
  entityId: string,
  componentIndex: number
): { classification: DiscrepancyClass; confidence: number; evidence: TraceEvidence } {
  const delta = Math.abs(calculated - expected);
  const deltaPercent = expected !== 0
    ? (delta / Math.abs(expected)) * 100
    : (delta === 0 ? 0 : 100);

  // Within tolerance → match
  if (delta <= tolerance) {
    return { classification: 'match', confidence: 1.0, evidence: { reason: 'within_tolerance' } };
  }

  // Sub-unit rounding (< 1.0 in absolute terms)
  if (delta < 1.0) {
    return { classification: 'rounding', confidence: 0.9, evidence: { reason: 'sub_unit_variance', outputValue: delta } };
  }

  // Check synaptic evidence for this entity
  const entityAnomalies = readSynapses(surface, 'anomaly', 'entity', entityId);
  const entityDataQuality = readSynapses(surface, 'data_quality', 'entity', entityId);

  // Data quality issues → likely data_divergence
  if (entityDataQuality.length > 0) {
    return {
      classification: 'data_divergence',
      confidence: 0.75,
      evidence: {
        reason: 'data_quality_synapses_present',
        inputValues: trace ? extractInputValues(trace) : undefined,
      },
    };
  }

  // Anomalies present → could be boundary/logic issue
  if (entityAnomalies.length > 0) {
    const boundaryAnomaly = entityAnomalies.find(s => s.detail?.includes('boundary'));
    if (boundaryAnomaly) {
      return {
        classification: 'logic_divergence',
        confidence: 0.7,
        evidence: {
          reason: 'boundary_anomaly_detected',
          boundaryMatched: trace?.lookupResolution?.rowBoundaryMatched
            ? { index: trace.lookupResolution.rowBoundaryMatched.index, min: trace.lookupResolution.rowBoundaryMatched.min, max: trace.lookupResolution.rowBoundaryMatched.max }
            : undefined,
        },
      };
    }
  }

  // Large delta with trace available → check if inputs differ
  if (trace && deltaPercent > 5) {
    return {
      classification: 'data_divergence',
      confidence: 0.6,
      evidence: {
        reason: 'significant_delta_with_trace',
        inputValues: extractInputValues(trace),
        outputValue: trace.finalOutcome,
      },
    };
  }

  return { classification: 'unclassified', confidence: 0.3, evidence: { reason: 'manual_review_needed' } };
}

function extractInputValues(trace: ExecutionTrace): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [key, input] of Object.entries(trace.inputs)) {
    values[key] = input.resolvedValue;
  }
  return values;
}

// ──────────────────────────────────────────────
// False Green Detection
// ──────────────────────────────────────────────

export function detectFalseGreens(findings: ReconciliationFinding[]): boolean {
  // Group findings by entityExternalId
  const byEntity = new Map<string, ReconciliationFinding[]>();
  for (const f of findings) {
    if (!byEntity.has(f.entityExternalId)) byEntity.set(f.entityExternalId, []);
    byEntity.get(f.entityExternalId)!.push(f);
  }

  for (const [, entityFindings] of Array.from(byEntity.entries())) {
    if (entityFindings.length < 2) continue;

    const totalCalc = entityFindings.reduce((s, f) => s + f.calculatedOutcome, 0);
    const totalExp = entityFindings.reduce((s, f) => s + f.expectedOutcome, 0);
    const totalDelta = Math.abs(totalCalc - totalExp);

    const componentDeltas = entityFindings.filter(f => f.classification !== 'match');
    const sumAbsDeltas = componentDeltas.reduce((s, f) => s + Math.abs(f.delta), 0);

    // Total looks fine but components have large offsetting errors
    if (totalDelta < 1.0 && sumAbsDeltas > 100) {
      return true;
    }
  }

  return false;
}

// ──────────────────────────────────────────────
// Synaptic Context Builder
// ──────────────────────────────────────────────

function buildSynapticContext(
  surface: SynapticSurface,
  entityId: string
): SynapticContext {
  const confSynapses = readSynapses(surface, 'confidence', 'entity', entityId);
  const anomSynapses = readSynapses(surface, 'anomaly', 'entity', entityId);
  const dqSynapses = readSynapses(surface, 'data_quality', 'entity', entityId);

  const avgConf = confSynapses.length > 0
    ? confSynapses.reduce((s, syn) => s + syn.value, 0) / confSynapses.length
    : 1.0;

  return {
    confidenceSynapses: confSynapses.length,
    anomalySynapses: anomSynapses.length,
    dataQualitySynapses: dqSynapses.length,
    avgConfidence: avgConf,
  };
}

// ──────────────────────────────────────────────
// Correction Synapse Generation
// ──────────────────────────────────────────────

function generateCorrectionSynapses(
  findings: ReconciliationFinding[],
  surface: SynapticSurface
): number {
  let count = 0;

  for (const finding of findings) {
    if (finding.classification === 'match' || finding.classification === 'rounding') continue;

    const synapse: Synapse = {
      type: 'correction',
      componentIndex: finding.componentIndex,
      entityId: finding.entityId,
      value: 1 - finding.confidence, // higher value = more severe correction needed
      detail: `${finding.classification}:delta=${finding.delta.toFixed(2)}`,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };

    writeSynapse(surface, synapse);
    count++;
  }

  return count;
}

// ──────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────

export function reconcile(input: ReconciliationInput): ReconciliationReport {
  const tolerance = input.tolerance ?? 0.01;
  const findings: ReconciliationFinding[] = [];

  // Index benchmark by externalId + componentIndex
  const benchmarkIndex = new Map<string, BenchmarkRecord>();
  for (const b of input.benchmarkRecords) {
    benchmarkIndex.set(`${b.entityExternalId}:${b.componentIndex}`, b);
  }

  // Index calculated by externalId + componentIndex
  const calculatedIndex = new Map<string, CalculatedResult>();
  for (const c of input.calculatedResults) {
    calculatedIndex.set(`${c.entityExternalId}:${c.componentIndex}`, c);
  }

  // Unique entity external IDs from both sets
  const allExternalIds = new Set([
    ...input.benchmarkRecords.map(b => b.entityExternalId),
    ...input.calculatedResults.map(c => c.entityExternalId),
  ]);

  // All component indices
  const allComponentIndices = new Set([
    ...input.benchmarkRecords.map(b => b.componentIndex),
    ...input.calculatedResults.map(c => c.componentIndex),
  ]);

  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const extId of Array.from(allExternalIds)) {
    for (const compIdx of Array.from(allComponentIndices)) {
      const key = `${extId}:${compIdx}`;
      const benchmark = benchmarkIndex.get(key);
      const calculated = calculatedIndex.get(key);

      if (!benchmark && !calculated) continue;

      if (!benchmark || !calculated) {
        // Scope mismatch
        const finding: ReconciliationFinding = {
          entityId: calculated?.entityId ?? '',
          entityExternalId: extId,
          componentIndex: compIdx,
          calculatedOutcome: calculated?.calculatedOutcome ?? 0,
          expectedOutcome: benchmark?.expectedOutcome ?? 0,
          delta: Math.abs((calculated?.calculatedOutcome ?? 0) - (benchmark?.expectedOutcome ?? 0)),
          deltaPercent: 100,
          classification: 'scope_mismatch',
          confidence: 0.9,
          traceEvidence: { reason: !benchmark ? 'missing_from_benchmark' : 'missing_from_calculated' },
          synapticContext: calculated
            ? buildSynapticContext(input.surface, calculated.entityId)
            : { confidenceSynapses: 0, anomalySynapses: 0, dataQualitySynapses: 0, avgConfidence: 0 },
        };
        findings.push(finding);
        unmatchedCount++;
        continue;
      }

      // Both exist — classify
      const traces = input.executionTraces.get(calculated.entityId) ?? [];
      const trace = traces.find(t => t.componentIndex === compIdx);

      const { classification, confidence, evidence } = classifyDiscrepancy(
        calculated.calculatedOutcome,
        benchmark.expectedOutcome,
        tolerance,
        trace,
        input.surface,
        calculated.entityId,
        compIdx
      );

      const delta = Math.abs(calculated.calculatedOutcome - benchmark.expectedOutcome);
      const deltaPercent = benchmark.expectedOutcome !== 0
        ? (delta / Math.abs(benchmark.expectedOutcome)) * 100
        : (delta === 0 ? 0 : 100);

      const finding: ReconciliationFinding = {
        entityId: calculated.entityId,
        entityExternalId: extId,
        componentIndex: compIdx,
        calculatedOutcome: calculated.calculatedOutcome,
        expectedOutcome: benchmark.expectedOutcome,
        delta,
        deltaPercent,
        classification,
        confidence,
        traceEvidence: evidence,
        synapticContext: buildSynapticContext(input.surface, calculated.entityId),
      };

      findings.push(finding);
      if (classification === 'match') matchedCount++;
      else unmatchedCount++;
    }
  }

  // False green detection
  const falseGreenDetected = detectFalseGreens(findings);

  // Generate correction synapses
  const correctionSynapsesWritten = generateCorrectionSynapses(findings, input.surface);

  // Count classifications
  const classifications: Record<DiscrepancyClass, number> = {
    match: 0, rounding: 0, data_divergence: 0, logic_divergence: 0,
    scope_mismatch: 0, temporal_mismatch: 0, offset_cancellation: 0, unclassified: 0,
  };
  for (const f of findings) {
    classifications[f.classification]++;
  }

  // Density impact: patterns with corrections get confidence lowered
  const densityImpact: Array<{ signature: string; confidenceAdjustment: number }> = [];
  const discrepancyCount = findings.filter(f => f.classification !== 'match' && f.classification !== 'rounding').length;
  if (discrepancyCount > 0) {
    for (const [sig, density] of Array.from(input.surface.density.entries())) {
      const adjustment = -0.05 * (discrepancyCount / Math.max(findings.length, 1));
      densityImpact.push({ signature: sig, confidenceAdjustment: adjustment });
    }
  }

  // Totals
  const totalCalculated = input.calculatedResults.reduce((s, c) => s + c.calculatedOutcome, 0);
  const totalBenchmark = input.benchmarkRecords.reduce((s, b) => s + b.expectedOutcome, 0);
  const totalDelta = Math.abs(totalCalculated - totalBenchmark);

  return {
    batchId: input.batchId,
    timestamp: new Date().toISOString(),
    entityCount: {
      calculated: new Set(input.calculatedResults.map(c => c.entityExternalId)).size,
      benchmark: new Set(input.benchmarkRecords.map(b => b.entityExternalId)).size,
      matched: matchedCount,
      unmatched: unmatchedCount,
    },
    totalOutcome: {
      calculated: totalCalculated,
      benchmark: totalBenchmark,
      delta: totalDelta,
      deltaPercent: totalBenchmark !== 0 ? (totalDelta / Math.abs(totalBenchmark)) * 100 : 0,
    },
    findings,
    classifications,
    synapticDensityImpact: densityImpact,
    falseGreenDetected,
    correctionSynapsesWritten,
  };
}
