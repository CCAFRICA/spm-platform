// OB-249 — Remediation Stage: the signal wiring (I5 / G7 / G11 / P5).
//
// Remediation writes to the ONE canonical signal surface (classification_signals via
// writeSignalWithClient), distinguished from every other signal only by PROVENANCE
// (source='remediation', signal_type prefix 'remediation:'). There is no private channel
// (G7). The Normalizer READS prior remediation signals before it expresses (G11 / read-path
// coherence) — via a DEDICATED-COLUMN query (NOT getTrainingSignals, which drops
// decision_source/scope/structural_fingerprint), filtered to the remediation signal_type +
// tenant + scope, with NO latest-N type-mixing cap (the proof-falsifiability fix).
//
// EVERY write here is NON-THROWING (try/catch). writeSignal THROWS CanonicalWriteError on
// insert failure; remediation must NEVER abort the import it remediates (I5: a blocked write
// is itself reported as a remediation signal, never a silent dead-end — and that report is
// also guarded so a signal-surface outage cannot cascade).

import type { SupabaseClient } from '@supabase/supabase-js';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer';
import type { Json } from '@/lib/supabase/database.types';
import type { RemediationSignalPayload } from './remediation-types';

export const REMEDIATION_SOURCE = 'remediation';
export const SIGNAL_NORMALIZATION = 'remediation:normalization';
export const SIGNAL_STAGE_RUN = 'remediation:stage_run';
export const SIGNAL_DEGRADED = 'remediation:degraded';

/** A prior-signal row as read back for read-before-express (dedicated columns selected). */
interface PriorRemediationRow {
  signal_value: Json;
  structural_fingerprint: Json | null;
  context: Json | null;
  created_at: string;
}

/**
 * READ (G11): all prior `remediation:normalization` signal payloads for this tenant, scoped,
 * newest first. The Normalizer consults these before expressing so a known variant→canonical
 * grouping is reused with zero LLM (I6/P6). Filtered to the exact signal_type so accumulating
 * classification/atom signals never evict remediation rows past a cap (the falsifiability fix).
 * Optionally narrowed to one producing agent (context.agent) so each agent reads only its own.
 */
export async function readPriorNormalizationSignals(
  supabase: SupabaseClient,
  tenantId: string,
  agentName?: string,
): Promise<Json[]> {
  try {
    const { data, error } = await supabase
      .from('classification_signals')
      .select('signal_value, structural_fingerprint, context, created_at')
      .eq('tenant_id', tenantId)
      .eq('signal_type', SIGNAL_NORMALIZATION)
      .eq('scope', 'tenant')
      .order('created_at', { ascending: false })
      .limit(5000); // a generous ceiling, NOT a type-mixing latest-N cap (single signal_type)
    if (error) {
      console.warn(`[OB-249][remediation-signals] prior-read failed (non-blocking): ${error.message}`);
      return [];
    }
    const rows = (data ?? []) as unknown as PriorRemediationRow[];
    if (!agentName) return rows.map((r) => r.signal_value);
    return rows
      .filter((r) => {
        const ctx = (r.context ?? {}) as Record<string, unknown>;
        return ctx.agent === agentName;
      })
      .map((r) => r.signal_value);
  } catch (err) {
    console.warn(`[OB-249][remediation-signals] prior-read threw (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * WRITE (P5 / G7): persist one agent's serialized proposal fragment to the canonical surface.
 * source='remediation' + signal_type='remediation:normalization' is the provenance that lets
 * it coexist with every other signal on the one surface. The structural fingerprint targets
 * the same value-set the recall keys on. Non-throwing; returns whether it landed.
 */
export async function writeNormalizationSignal(
  supabase: SupabaseClient,
  params: { tenantId: string; agentName: string; payload: RemediationSignalPayload },
): Promise<boolean> {
  const { tenantId, agentName, payload } = params;
  try {
    await writeSignalWithClient(
      {
        tenantId,
        signalType: SIGNAL_NORMALIZATION,
        source: REMEDIATION_SOURCE,
        decisionSource: agentName,
        scope: 'tenant',
        // confidence MUST be in [0,1] or null — never a count (out-of-range → null + an extra
        // observability:write_failure row). The agent supplies a normalized confidence.
        confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
        structuralFingerprint: payload.fingerprint ? { fingerprintHash: payload.fingerprint } : null,
        signalValue: { agent: agentName, key: payload.key, expresser: payload.expresser ?? null, proposal: payload.value },
        context: { ob: 'OB-249', agent: agentName, kind: 'normalization' },
      },
      supabase,
    );
    return true;
  } catch (err) {
    // I5: a blocked learning write must NOT silently dead-end. Report it as a remediation
    // signal — itself fully guarded so a signal-surface outage cannot cascade into the import.
    console.error(`[OB-249][remediation-signals] normalization write FAILED (non-blocking) agent=${agentName} key=${payload.key}: ${err instanceof Error ? err.message : String(err)}`);
    await emitDegradedSignal(supabase, { tenantId, agentName, stage: 'propose-write', reason: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * STAGE-RUN marker (P8): emitted once per content unit EVEN WHEN zero changes were made, so a
 * clean import that traversed the stage is provably distinct from one that bypassed it.
 * Pairs with the per-row metadata.remediation._stageRan stamp written in commitContentUnit.
 */
export async function emitStageRunSignal(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    unitId: string;
    sheetName: string;
    agentsRun: string[];
    columnsConsidered: number;
    changeCount: number;
    changesByColumn: Record<string, number>;
    degradedAgents: string[];
  },
): Promise<void> {
  const { tenantId, ...rest } = params;
  try {
    await writeSignalWithClient(
      {
        tenantId,
        signalType: SIGNAL_STAGE_RUN,
        source: REMEDIATION_SOURCE,
        decisionSource: 'remediation_stage',
        scope: 'tenant',
        confidence: null,
        signalValue: rest as unknown as Record<string, unknown>,
        context: { ob: 'OB-249', kind: 'stage_run', unitId: rest.unitId },
      },
      supabase,
    );
  } catch (err) {
    console.error(`[OB-249][remediation-signals] stage_run emission failed (non-blocking) unit=${params.unitId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** DEGRADED marker (I5): the stage (or one agent) could not complete — the LLM was down, a
 *  write was blocked, construct threw. The import proceeds with whatever congruence was safely
 *  achievable (identity in the worst case); this records WHY, never a silent gap. Guarded. */
export async function emitDegradedSignal(
  supabase: SupabaseClient,
  params: { tenantId: string; agentName: string; stage: string; reason: string },
): Promise<void> {
  const { tenantId, ...rest } = params;
  try {
    await writeSignalWithClient(
      {
        tenantId,
        signalType: SIGNAL_DEGRADED,
        source: REMEDIATION_SOURCE,
        decisionSource: rest.agentName,
        scope: 'tenant',
        confidence: null,
        signalValue: rest as unknown as Record<string, unknown>,
        context: { ob: 'OB-249', kind: 'degraded', agent: rest.agentName },
      },
      supabase,
    );
  } catch {
    // terminal guard — a degraded-signal emission must itself never throw into the import.
  }
}
