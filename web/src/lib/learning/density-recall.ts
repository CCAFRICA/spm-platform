// OB-235 P4 — calculation-layer Tenant loop: RECALL density before the entity loop and SELECT the execution
// mode per pattern (the read-path the live calc route wires in P9 — G11 read-before-expensive-work). This
// is the (b) action the density loop was missing: load (a) + consolidate (c) + flywheel (d) are already live
// (P0); only mode SELECTION never gated the loop. RECONNECT, not rebuild.
//
// RECONCILIATION IS ABSOLUTE: the execution mode gates TRACING ONLY (whether synapses are written /
// persisted), never a computed value — silent skips the trace, not the math. The mode is a pure function of
// recalled density; the per-entity outcome computation takes no mode/density input. So a second run that
// shifts toward silent is byte-identical in outcomes (HALT-CALC honoured).
//
// EXTENDS, does not duplicate: reuses loadDensity (synaptic-density.ts I/O) + getExecutionMode + the
// Synaptic-Spec DENSITY_THRESHOLDS (synaptic-surface.ts / synaptic-types.ts). NO REGISTRY, Korean-clean
// (signatures are structural pattern hashes; no field names).

import type { SynapticDensity, ExecutionMode } from '@/lib/calculation/synaptic-types';
import { createSynapticSurface, getExecutionMode } from '@/lib/calculation/synaptic-surface';
import { loadDensity } from '@/lib/calculation/synaptic-density';

export interface DensityRecall {
  density: SynapticDensity;
  coldStart: boolean;                                  // no prior density → every pattern runs full_trace
  modeFor(signature: string): ExecutionMode;           // the recalled mode for one pattern signature
  modeDistribution(signatures: string[]): Record<ExecutionMode, number>;
}

/** Recall a tenant's pattern density and expose the execution-mode selection. The mode logic is the live
 *  getExecutionMode (over a density-only surface) — reused verbatim so this read-path and the live loop
 *  can never drift. */
export function buildDensityRecall(density: SynapticDensity): DensityRecall {
  const surface = createSynapticSurface(density); // only `density` is read by getExecutionMode
  return {
    density,
    coldStart: density.size === 0,
    modeFor: (signature: string) => getExecutionMode(surface, signature),
    modeDistribution(signatures: string[]): Record<ExecutionMode, number> {
      const dist: Record<ExecutionMode, number> = { full_trace: 0, light_trace: 0, silent: 0 };
      for (const sig of signatures) dist[getExecutionMode(surface, sig)]++;
      return dist;
    },
  };
}

/** Load-before-the-loop: recall the tenant's density (reusing the live loader) and return the mode selector.
 *  Graceful: a load failure yields an empty density → all-full_trace (cold), never a throw. */
export async function recallDensity(tenantId: string): Promise<DensityRecall> {
  let density: SynapticDensity;
  try { density = await loadDensity(tenantId); }
  catch { density = new Map(); }
  return buildDensityRecall(density);
}
