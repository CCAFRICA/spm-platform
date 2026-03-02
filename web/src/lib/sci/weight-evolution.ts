// SCI Weight Evolution — Analytical service for weight adjustment proposals
// OB-135 Phase 8 — Read-only. NEVER auto-applies. Korean Test applies.
//
// Reads accumulated classification signals and computes what adjusted weights
// WOULD be if we applied learning from user confirmations/overrides.
// Observatory displays these proposals; human decides whether to apply.

import { getSCISignals } from './signal-capture-service';
import type { AgentType } from './sci-types';

// ============================================================
// TYPES
// ============================================================

export interface WeightEvolutionAnalysis {
  /** Current static weights by agent */
  currentWeights: Record<AgentType, Array<{ signal: string; weight: number }>>;
  /** Proposed adjustments based on outcome data */
  proposedAdjustments: WeightAdjustment[];
  /** Total classification outcomes analyzed */
  sampleSize: number;
  /** How many were user overrides */
  overrideCount: number;
  /** Confidence in the proposals (higher sample = higher confidence) */
  confidence: number;
  /** Whether we have enough data to propose anything */
  hasEnoughData: boolean;
  generatedAt: string;
}

export interface WeightAdjustment {
  agent: AgentType;
  signal: string;
  currentWeight: number;
  proposedWeight: number;
  delta: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  /** Why this adjustment is proposed */
  basis: string;
  /** How many override events contributed */
  overrideEvidence: number;
  /** How many confirmation events support current weight */
  confirmEvidence: number;
}

// ============================================================
// CURRENT WEIGHTS (mirrors agents.ts — read-only snapshot)
// ============================================================
// These are extracted from agents.ts AGENT_WEIGHTS for analysis.
// If agents.ts weights change, update this map.

const CURRENT_WEIGHTS: Record<AgentType, Record<string, number>> = {
  plan: {
    auto_generated_headers: 0.25,
    high_sparsity: 0.20,
    percentage_values: 0.15,
    descriptive_labels: 0.15,
    low_row_count: 0.10,
    no_entity_id: 0.05,
    has_currency: -0.03,
    has_date: -0.10,
    high_row_count: -0.15,
    has_entity_id: -0.10,
  },
  entity: {
    has_entity_id: 0.25,
    has_name_field: 0.20,
    moderate_rows: 0.15,
    categorical_attributes: 0.10,
    has_license_field: 0.10,
    no_date: 0.05,
    high_currency: -0.10,
    transactional_rows: -0.15,
    auto_generated_headers: -0.20,
  },
  target: {
    has_entity_id: 0.20,
    has_target_field: 0.25,
    reference_rows: 0.15,
    has_currency: 0.10,
    no_date: 0.10,
    clean_headers: 0.05,
    no_entity_id: -0.25,
    transactional_rows: -0.15,
    auto_generated_headers: -0.15,
    high_sparsity: -0.10,
  },
  transaction: {
    has_date: 0.25,
    has_entity_id: 0.15,
    has_currency: 0.15,
    transactional_rows: 0.20,
    moderate_rows: 0.05,
    clean_headers: 0.05,
    no_date: -0.25,
    reference_rows: -0.10,
    auto_generated_headers: -0.15,
    high_sparsity: -0.10,
  },
};

// Minimum outcomes before we propose adjustments
const MIN_SAMPLE_SIZE = 5;

// Maximum adjustment per signal per iteration
const MAX_ADJUSTMENT = 0.05;

// Learning rate — how aggressively to adjust
const LEARNING_RATE = 0.3;

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

export async function computeWeightEvolution(
  tenantId: string
): Promise<WeightEvolutionAnalysis | null> {
  try {
    // Load classification signals and outcomes
    const [classifications, outcomes] = await Promise.all([
      getSCISignals(tenantId, { signalType: 'content_classification', limit: 1000 }),
      getSCISignals(tenantId, { signalType: 'content_classification_outcome', limit: 1000 }),
    ]);

    if (outcomes.length === 0) {
      return {
        currentWeights: formatCurrentWeights(),
        proposedAdjustments: [],
        sampleSize: classifications.length,
        overrideCount: 0,
        confidence: 0,
        hasEnoughData: false,
        generatedAt: new Date().toISOString(),
      };
    }

    // Build outcome map: contentUnitId → { predicted, confirmed, wasOverridden, signals }
    const outcomeMap = new Map<string, {
      predicted: AgentType;
      confirmed: AgentType;
      wasOverridden: boolean;
      predictionConfidence: number;
    }>();

    for (const o of outcomes) {
      const val = o.signalValue;
      const cuId = val.contentUnitId as string;
      if (!cuId) continue;
      outcomeMap.set(cuId, {
        predicted: val.predictedClassification as AgentType,
        confirmed: val.confirmedClassification as AgentType,
        wasOverridden: val.wasOverridden === true,
        predictionConfidence: (val.predictionConfidence as number) || 0,
      });
    }

    // Build signal activity map: for each classification, which signals fired
    const signalActivityMap = new Map<string, {
      agentScores: Array<{ agent: string; topSignals: string[] }>;
      winningAgent: string;
    }>();

    for (const c of classifications) {
      const val = c.signalValue;
      const cuId = val.contentUnitId as string;
      if (!cuId) continue;
      signalActivityMap.set(cuId, {
        agentScores: (val.agentScores as Array<{ agent: string; topSignals: string[] }>) || [],
        winningAgent: val.winningAgent as string,
      });
    }

    // Compute signal-level statistics
    const signalStats = new Map<string, {
      agent: AgentType;
      signal: string;
      correctWhenActive: number;
      wrongWhenActive: number;
    }>();

    let overrideCount = 0;

    for (const [cuId, outcome] of Array.from(outcomeMap.entries())) {
      if (outcome.wasOverridden) overrideCount++;

      const activity = signalActivityMap.get(cuId);
      if (!activity) continue;

      // For each agent's top signals, track if that prediction was correct
      for (const agentScore of activity.agentScores) {
        const agent = agentScore.agent as AgentType;
        const wasCorrect = agent === outcome.confirmed;

        for (const signal of agentScore.topSignals) {
          const key = `${agent}::${signal}`;
          if (!signalStats.has(key)) {
            signalStats.set(key, { agent, signal, correctWhenActive: 0, wrongWhenActive: 0 });
          }
          const stat = signalStats.get(key)!;
          if (wasCorrect) {
            stat.correctWhenActive++;
          } else {
            stat.wrongWhenActive++;
          }
        }
      }
    }

    // Generate proposed adjustments
    const adjustments: WeightAdjustment[] = [];

    for (const [, stat] of Array.from(signalStats.entries())) {
      const total = stat.correctWhenActive + stat.wrongWhenActive;
      if (total < 2) continue; // Need at least 2 observations

      const currentWeight = CURRENT_WEIGHTS[stat.agent]?.[stat.signal];
      if (currentWeight === undefined) continue; // Signal not in weight table

      const correctRate = stat.correctWhenActive / total;
      const errorRate = stat.wrongWhenActive / total;

      // If signal leads to wrong classification more than right, reduce weight
      // If signal leads to right classification mostly, increase weight
      let rawDelta = 0;
      if (errorRate > 0.5 && currentWeight > 0) {
        // Positive weight but mostly wrong → decrease
        rawDelta = -LEARNING_RATE * currentWeight * errorRate;
      } else if (errorRate > 0.5 && currentWeight < 0) {
        // Negative weight and mostly wrong → make more negative (increase magnitude)
        rawDelta = -LEARNING_RATE * Math.abs(currentWeight) * errorRate;
      } else if (correctRate > 0.7 && currentWeight > 0) {
        // Positive weight and mostly right → small increase
        rawDelta = LEARNING_RATE * currentWeight * (correctRate - 0.7);
      }

      // Clamp adjustment
      const delta = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, rawDelta));

      if (Math.abs(delta) < 0.001) continue; // Skip trivial adjustments

      const proposedWeight = Math.round((currentWeight + delta) * 1000) / 1000;

      adjustments.push({
        agent: stat.agent,
        signal: stat.signal,
        currentWeight,
        proposedWeight,
        delta: Math.round(delta * 1000) / 1000,
        direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged',
        basis: `${total} outcomes: ${stat.correctWhenActive} correct, ${stat.wrongWhenActive} overrides`,
        overrideEvidence: stat.wrongWhenActive,
        confirmEvidence: stat.correctWhenActive,
      });
    }

    // Sort by absolute delta (biggest proposed changes first)
    adjustments.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Confidence = f(sample size) — sigmoid-like curve
    const confidence = Math.min(1.0, outcomes.length / 50);

    return {
      currentWeights: formatCurrentWeights(),
      proposedAdjustments: adjustments,
      sampleSize: outcomes.length,
      overrideCount,
      confidence: Math.round(confidence * 100) / 100,
      hasEnoughData: outcomes.length >= MIN_SAMPLE_SIZE,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[WeightEvolution] Analysis failed:', err);
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

function formatCurrentWeights(): Record<AgentType, Array<{ signal: string; weight: number }>> {
  const result: Record<AgentType, Array<{ signal: string; weight: number }>> = {
    plan: [], entity: [], target: [], transaction: [],
  };

  for (const agent of ['plan', 'entity', 'target', 'transaction'] as AgentType[]) {
    const weights = CURRENT_WEIGHTS[agent];
    result[agent] = Object.entries(weights)
      .map(([signal, weight]) => ({ signal, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  return result;
}
