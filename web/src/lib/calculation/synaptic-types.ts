/**
 * Synaptic State — Type Definitions
 *
 * Shared computational surface for agent communication.
 * ZERO domain language. Korean Test applies.
 *
 * Agents read/write synapses during execution.
 * Density persists across runs for progressive learning.
 */

// ──────────────────────────────────────────────
// Synapse Types
// ──────────────────────────────────────────────

export type SynapseType =
  | 'confidence'
  | 'anomaly'
  | 'correction'
  | 'pattern'
  | 'boundary_behavior'
  | 'data_quality'
  | 'resolution_hint'
  | 'performance';

export interface Synapse {
  type: SynapseType;
  componentIndex: number;
  entityId?: string;
  value: number;           // 0-1 for confidence, arbitrary for others
  detail?: string;         // human-readable note
  timestamp: number;       // performance.now() offset
}

// ──────────────────────────────────────────────
// Execution Modes — density-driven
// ──────────────────────────────────────────────

export type ExecutionMode = 'full_trace' | 'light_trace' | 'silent';

export const DENSITY_THRESHOLDS = {
  /** Below this → full_trace (both engines, all synapses) */
  FULL_TRACE_MAX: 0.70,
  /** At or above this → silent (intent only, no trace) */
  SILENT_MIN: 0.95,
  /** Between FULL_TRACE_MAX and SILENT_MIN → light_trace */
} as const;

// ──────────────────────────────────────────────
// Pattern Density — persistent per tenant+pattern
// ──────────────────────────────────────────────

export interface PatternDensity {
  signature: string;
  confidence: number;          // 0-1
  totalExecutions: number;
  lastAnomalyRate: number;
  lastCorrectionCount: number;
  executionMode: ExecutionMode;
  learnedBehaviors: Record<string, unknown>;
}

export type SynapticDensity = Map<string, PatternDensity>;

// ──────────────────────────────────────────────
// Synaptic Surface — in-memory during a run
// ──────────────────────────────────────────────

export interface SynapticSurface {
  /** Run-level synapses */
  runSynapses: Map<SynapseType, Synapse[]>;
  /** Component-level synapses, keyed by componentIndex */
  componentSynapses: Map<number, Map<SynapseType, Synapse[]>>;
  /** Entity-level synapses, keyed by entityId */
  entitySynapses: Map<string, Map<SynapseType, Synapse[]>>;
  /** Pre-loaded density from previous runs */
  density: SynapticDensity;
  /** Running statistics for the current run */
  stats: SurfaceStats;
}

export interface SurfaceStats {
  totalSynapsesWritten: number;
  anomalyCount: number;
  correctionCount: number;
  entityCount: number;
  componentCount: number;
  startTime: number;
}

// ──────────────────────────────────────────────
// Density update — produced by consolidation
// ──────────────────────────────────────────────

export interface DensityUpdate {
  signature: string;
  newConfidence: number;
  newMode: ExecutionMode;
  totalExecutions: number;
  anomalyRate: number;
}
