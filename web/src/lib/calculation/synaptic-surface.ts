/**
 * Synaptic Surface — In-Memory Shared Computation State
 *
 * Created per calculation run. Destroyed after consolidation.
 * ZERO domain language. Korean Test applies.
 *
 * O(1) read/write. No DB calls during entity loop.
 */

import type {
  Synapse,
  SynapseType,
  SynapticSurface,
  SynapticDensity,
  ExecutionMode,
  DensityUpdate,
} from './synaptic-types';
import { DENSITY_THRESHOLDS } from './synaptic-types';

// ──────────────────────────────────────────────
// Surface Creation
// ──────────────────────────────────────────────

/**
 * Create a new SynapticSurface for a calculation run.
 * Optionally pre-populate from persistent density.
 */
export function createSynapticSurface(density?: SynapticDensity): SynapticSurface {
  return {
    runSynapses: new Map(),
    componentSynapses: new Map(),
    entitySynapses: new Map(),
    density: density ?? new Map(),
    stats: {
      totalSynapsesWritten: 0,
      anomalyCount: 0,
      correctionCount: 0,
      entityCount: 0,
      componentCount: 0,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    },
  };
}

// ──────────────────────────────────────────────
// Synapse Write — O(1)
// ──────────────────────────────────────────────

/**
 * Write a synapse to the surface.
 * Appends to the appropriate scope map.
 */
export function writeSynapse(surface: SynapticSurface, synapse: Synapse): void {
  surface.stats.totalSynapsesWritten++;

  if (synapse.type === 'anomaly') surface.stats.anomalyCount++;
  if (synapse.type === 'correction') surface.stats.correctionCount++;

  // Run-level
  if (!surface.runSynapses.has(synapse.type)) {
    surface.runSynapses.set(synapse.type, []);
  }
  surface.runSynapses.get(synapse.type)!.push(synapse);

  // Component-level
  if (!surface.componentSynapses.has(synapse.componentIndex)) {
    surface.componentSynapses.set(synapse.componentIndex, new Map());
  }
  const compMap = surface.componentSynapses.get(synapse.componentIndex)!;
  if (!compMap.has(synapse.type)) {
    compMap.set(synapse.type, []);
  }
  compMap.get(synapse.type)!.push(synapse);

  // Entity-level (if entityId present)
  if (synapse.entityId) {
    if (!surface.entitySynapses.has(synapse.entityId)) {
      surface.entitySynapses.set(synapse.entityId, new Map());
    }
    const entityMap = surface.entitySynapses.get(synapse.entityId)!;
    if (!entityMap.has(synapse.type)) {
      entityMap.set(synapse.type, []);
    }
    entityMap.get(synapse.type)!.push(synapse);
  }
}

// ──────────────────────────────────────────────
// Synapse Read — O(1) lookup + O(n) filter
// ──────────────────────────────────────────────

/**
 * Read synapses from the surface.
 */
export function readSynapses(
  surface: SynapticSurface,
  type: SynapseType,
  scope: 'run' | 'component' | 'entity',
  key?: string | number
): Synapse[] {
  switch (scope) {
    case 'run':
      return surface.runSynapses.get(type) ?? [];
    case 'component': {
      if (key === undefined) return [];
      const compMap = surface.componentSynapses.get(key as number);
      return compMap?.get(type) ?? [];
    }
    case 'entity': {
      if (key === undefined) return [];
      const entityMap = surface.entitySynapses.get(key as string);
      return entityMap?.get(type) ?? [];
    }
  }
}

// ──────────────────────────────────────────────
// Execution Mode — density-driven
// ──────────────────────────────────────────────

/**
 * Determine execution mode from density for a given pattern.
 */
export function getExecutionMode(
  surface: SynapticSurface,
  patternSignature: string
): ExecutionMode {
  const density = surface.density.get(patternSignature);
  if (!density) return 'full_trace';

  if (density.confidence >= DENSITY_THRESHOLDS.SILENT_MIN) return 'silent';
  if (density.confidence >= DENSITY_THRESHOLDS.FULL_TRACE_MAX) return 'light_trace';
  return 'full_trace';
}

// ──────────────────────────────────────────────
// Consolidation — after the run
// ──────────────────────────────────────────────

/**
 * Consolidate the surface into density updates and signal batch.
 * Called once after the entity loop completes.
 */
export function consolidateSurface(surface: SynapticSurface): {
  densityUpdates: DensityUpdate[];
  signalBatch: Array<Record<string, unknown>>;
} {
  const densityUpdates: DensityUpdate[] = [];
  const signalBatch: Array<Record<string, unknown>> = [];

  // Group confidence synapses by componentIndex to compute per-pattern density
  const componentConfidences = new Map<number, number[]>();
  const componentAnomalies = new Map<number, number>();

  for (const [compIdx, typeMap] of Array.from(surface.componentSynapses.entries())) {
    const confidences = typeMap.get('confidence') ?? [];
    componentConfidences.set(compIdx, confidences.map(s => s.value));

    const anomalies = typeMap.get('anomaly') ?? [];
    componentAnomalies.set(compIdx, anomalies.length);
  }

  // For each pattern in density, compute updated confidence
  for (const [signature, existing] of Array.from(surface.density.entries())) {
    // Find which componentIndex maps to this signature
    // (The mapping is established when writing synapses — we use the pattern synapse)
    const patternSynapses = (surface.runSynapses.get('pattern') ?? [])
      .filter(s => s.detail === signature);

    if (patternSynapses.length === 0) continue;

    const compIdx = patternSynapses[0].componentIndex;
    const confidences = componentConfidences.get(compIdx) ?? [];
    const anomalyCount = componentAnomalies.get(compIdx) ?? 0;
    const entityCount = Math.max(surface.stats.entityCount, 1);

    // Compute new confidence: weighted average of existing + this run
    const runConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : existing.confidence;

    const anomalyRate = anomalyCount / entityCount;

    // Exponential moving average: 70% new, 30% existing
    const newConfidence = Math.max(0, Math.min(1,
      existing.confidence * 0.3 + runConfidence * 0.7 - anomalyRate * 0.1
    ));

    const newMode: ExecutionMode =
      newConfidence >= DENSITY_THRESHOLDS.SILENT_MIN ? 'silent' :
      newConfidence >= DENSITY_THRESHOLDS.FULL_TRACE_MAX ? 'light_trace' :
      'full_trace';

    densityUpdates.push({
      signature,
      newConfidence,
      newMode,
      totalExecutions: existing.totalExecutions + entityCount,
      anomalyRate,
    });

    // Training signal per component (not per entity)
    signalBatch.push({
      signalType: 'training:synaptic_density',
      signalValue: {
        signature,
        previousConfidence: existing.confidence,
        newConfidence,
        executionMode: newMode,
        anomalyRate,
        entityCount,
      },
    });
  }

  return { densityUpdates, signalBatch };
}

/**
 * Initialize density entries for new patterns not yet in density.
 * Called when a pattern is first seen for a tenant.
 */
export function initializePatternDensity(
  surface: SynapticSurface,
  signature: string,
  componentIndex: number
): void {
  if (!surface.density.has(signature)) {
    surface.density.set(signature, {
      signature,
      confidence: 0.5,
      totalExecutions: 0,
      lastAnomalyRate: 0,
      lastCorrectionCount: 0,
      executionMode: 'full_trace',
      learnedBehaviors: {},
    });
  }

  // Write a pattern synapse to track signature → componentIndex mapping
  writeSynapse(surface, {
    type: 'pattern',
    componentIndex,
    value: 0.5,
    detail: signature,
    timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
  });
}
