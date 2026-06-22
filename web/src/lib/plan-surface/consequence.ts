/**
 * OB-228 Phase 4 — the Consequence Engine (Concept ②).
 *
 * HALT-4 (Phase 1): a lightweight single-rule_set recompute over committed_data requires
 * extracting the metrics-resolution layer out of the byte-identical live calc route
 * (architect-channel, GT-reconciled) OR forbidden parallel math — an architectural
 * decision beyond this OB. AND MIR is uncalculated (no baseline). So `recomputeConsequence`
 * is the SINGLE SURFACED SEAM: it returns availability=false with the precise constraint
 * and NEVER fabricates payout numbers (Decision 158 / AP-22). `diffConsequence` is built
 * and ready for when the recompute adapter lands (a follow-on OB).
 *
 * What IS deterministic and shipped: the structural edit diff (summarizeEdits) — the
 * before→after of the plan's actual numbers — and the commit path.
 */
import type { BaselineOutcome } from './types';
import type { AppliedEdit } from './edit-model';

export interface RecomputeResult {
  available: boolean;
  reason: string;
  outcomes: BaselineOutcome[];
}

export interface ConsequenceDiff {
  available: boolean;
  reason?: string;
  aggregateDelta: number;
  thresholdCrossers: number;
  newZeros: number;
  perEntity: { entityId: string; before: number; after: number; delta: number }[];
}

/**
 * The recompute SEAM. Surfaced, not faked (HALT-4). When the scoped recompute adapter
 * exists (follow-on OB) this evaluates the edited component set over committed_data via
 * the engine kernel; until then it reports unavailable with the precise reason.
 */
export async function recomputeConsequence(
  ruleSetId: string,
  editedCalculationIntent: unknown,
  periodId: string | null,
): Promise<RecomputeResult> {
  // Seam signature — the follow-on recompute adapter consumes (ruleSetId, edited DAG, period).
  void ruleSetId; void editedCalculationIntent; void periodId;
  return {
    available: false,
    reason:
      'Recompute pending architect disposition (HALT-4): the deterministic per-entity recompute ' +
      'requires the metrics-resolution layer to be extracted from the byte-identical live calc route ' +
      '(architect-channel, GT-reconciled) — and MIR has no calculated baseline yet. The edit + commit ' +
      'are deterministic and shipped; the payout consequence preview lands when the recompute adapter does.',
    outcomes: [],
  };
}

/** Real diff between a baseline and a recomputed outcome set. Ready for when recompute lands. */
export function diffConsequence(baseline: BaselineOutcome[], recomputed: RecomputeResult): ConsequenceDiff {
  if (!recomputed.available) {
    return { available: false, reason: recomputed.reason, aggregateDelta: 0, thresholdCrossers: 0, newZeros: 0, perEntity: [] };
  }
  const byId = new Map(baseline.map((b) => [b.entityId, b.totalPayout]));
  const perEntity = recomputed.outcomes.map((o) => {
    const before = byId.get(o.entityId) ?? 0;
    const after = o.totalPayout;
    return { entityId: o.entityId, before, after, delta: after - before };
  });
  const aggregateDelta = perEntity.reduce((s, e) => s + e.delta, 0);
  const newZeros = perEntity.filter((e) => e.before !== 0 && e.after === 0).length;
  const thresholdCrossers = perEntity.filter((e) => (e.before === 0) !== (e.after === 0) || Math.sign(e.delta) !== 0).length;
  return { available: true, aggregateDelta, thresholdCrossers, newZeros, perEntity };
}

/** The deterministic structural summary of an edit — before→after of the plan's numbers.
 *  This is the modeled change (Tier-2 agency), shipped now; no recompute required. */
export function summarizeEdits(applied: AppliedEdit[]): { count: number; lines: { label: string; from: number; to: number; pct: number | null }[] } {
  const lines = applied.map((a) => ({
    label: a.label,
    from: a.from,
    to: a.to,
    pct: a.from !== 0 ? ((a.to - a.from) / Math.abs(a.from)) * 100 : null,
  }));
  return { count: applied.length, lines };
}
