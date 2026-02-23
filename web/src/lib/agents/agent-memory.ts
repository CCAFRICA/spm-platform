/**
 * Agent Memory — Unified Read Interface for Agent Priors
 *
 * Provides a single interface for all Foundational Agents to read
 * accumulated intelligence from three flywheel sources:
 *   - Flywheel 1 (Tenant): synaptic_density
 *   - Flywheel 2 (Foundational): foundational_patterns
 *   - Flywheel 3 (Domain): domain_patterns
 *   - Signal history: classification_signals
 *
 * Called ONCE before a pipeline run, not per-entity.
 * Results cached for the duration of the run.
 *
 * ZERO domain language. Korean Test applies.
 */

import type { PatternDensity, SynapticDensity } from '@/lib/calculation/synaptic-types';

// ──────────────────────────────────────────────
// Agent Types
// ──────────────────────────────────────────────

export type AgentType =
  | 'ingestion'
  | 'interpretation'
  | 'calculation'
  | 'reconciliation'
  | 'insight'
  | 'resolution';

// ──────────────────────────────────────────────
// Prior Types
// ──────────────────────────────────────────────

export interface AgentPriors {
  /** Flywheel 1: tenant-specific density */
  tenantDensity: SynapticDensity;

  /** Flywheel 2: cross-tenant structural priors */
  foundationalPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;

  /** Flywheel 3: domain + vertical priors */
  domainPriors: Map<string, { confidence: number; learnedBehaviors: Record<string, unknown> }>;

  /** Aggregated signal history from classification_signals */
  signalHistory: SignalSummary;
}

export interface SignalSummary {
  fieldMappingSignals: Array<{
    sourceColumn: string;
    mappedField: string;
    confidence: number;
    occurrences: number;
  }>;
  interpretationSignals: Array<{
    componentPattern: string;
    confidence: number;
    occurrences: number;
  }>;
  reconciliationSignals: Array<{
    discrepancyClass: string;
    count: number;
    lastSeen: string;
  }>;
  resolutionSignals: Array<{
    rootCause: string;
    count: number;
    lastSeen: string;
  }>;
}

// ──────────────────────────────────────────────
// Client Resolution
// ──────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[AgentMemory] Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ──────────────────────────────────────────────
// Load Priors
// ──────────────────────────────────────────────

/**
 * Load priors scoped to what an agent needs.
 * Called ONCE before a pipeline run, not per-entity.
 *
 * Each agent type reads the same interface but emphasizes different data:
 * - calculation: primarily tenantDensity
 * - ingestion: primarily fieldMappingSignals
 * - interpretation: primarily interpretationSignals + componentPattern density
 * - reconciliation: primarily reconciliationSignals + correction density
 * - insight: primarily all (broadest consumer)
 * - resolution: primarily resolutionSignals + correction density
 */
export async function loadPriorsForAgent(
  tenantId: string,
  domainId: string,
  _agentType: AgentType,
  verticalHint?: string
): Promise<AgentPriors> {
  const priors: AgentPriors = {
    tenantDensity: new Map(),
    foundationalPriors: new Map(),
    domainPriors: new Map(),
    signalHistory: {
      fieldMappingSignals: [],
      interpretationSignals: [],
      reconciliationSignals: [],
      resolutionSignals: [],
    },
  };

  try {
    const supabase = await getClient();

    // 1. Load tenant density from synaptic_density (Flywheel 1)
    const { data: densityRows } = await supabase
      .from('synaptic_density')
      .select('*')
      .eq('tenant_id', tenantId);

    for (const row of (densityRows ?? []) as Array<Record<string, unknown>>) {
      const sig = row.signature as string;
      priors.tenantDensity.set(sig, {
        signature: sig,
        confidence: (row.confidence as number) ?? 0.5,
        totalExecutions: (row.total_executions as number) ?? 0,
        lastAnomalyRate: (row.last_anomaly_rate as number) ?? 0,
        lastCorrectionCount: (row.last_correction_count as number) ?? 0,
        executionMode: ((row.execution_mode as string) ?? 'full_trace') as PatternDensity['executionMode'],
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 2. Load foundational priors (Flywheel 2)
    const { data: foundationalRows } = await supabase
      .from('foundational_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors');

    for (const row of (foundationalRows ?? []) as Array<Record<string, unknown>>) {
      priors.foundationalPriors.set(row.pattern_signature as string, {
        confidence: (row.confidence_mean as number) ?? 0.5,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 3. Load domain priors (Flywheel 3)
    let domainQuery = supabase
      .from('domain_patterns')
      .select('pattern_signature, confidence_mean, learned_behaviors')
      .eq('domain_id', domainId);

    if (verticalHint) {
      domainQuery = domainQuery.eq('vertical_hint', verticalHint);
    }

    const { data: domainRows } = await domainQuery;

    for (const row of (domainRows ?? []) as Array<Record<string, unknown>>) {
      priors.domainPriors.set(row.pattern_signature as string, {
        confidence: (row.confidence_mean as number) ?? 0.5,
        learnedBehaviors: (typeof row.learned_behaviors === 'object' && row.learned_behaviors !== null)
          ? row.learned_behaviors as Record<string, unknown>
          : {},
      });
    }

    // 4. Load signal summary from classification_signals (aggregated)
    const { data: signalRows } = await supabase
      .from('classification_signals')
      .select('signal_type, signal_value, confidence, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    priors.signalHistory = aggregateSignals(signalRows ?? []);
  } catch (err) {
    console.error('[AgentMemory] loadPriorsForAgent error:', err);
  }

  return priors;
}

// ──────────────────────────────────────────────
// Signal Aggregation (internal)
// ──────────────────────────────────────────────

function aggregateSignals(rows: Array<Record<string, unknown>>): SignalSummary {
  const fieldMappingMap = new Map<string, { mappedField: string; confidence: number; occurrences: number }>();
  const interpretationMap = new Map<string, { confidence: number; occurrences: number }>();
  const reconciliationMap = new Map<string, { count: number; lastSeen: string }>();
  const resolutionMap = new Map<string, { count: number; lastSeen: string }>();

  for (const row of rows) {
    const signalType = row.signal_type as string;
    const signalValue = row.signal_value as Record<string, unknown> | null;
    const confidence = (row.confidence as number) ?? 0;
    const createdAt = (row.created_at as string) ?? '';

    if (!signalValue) continue;

    if (signalType?.includes('field_mapping')) {
      const col = (signalValue.sourceColumn as string) ?? '';
      const field = (signalValue.mappedField as string) ?? '';
      const existing = fieldMappingMap.get(col);
      if (existing) {
        existing.occurrences++;
        existing.confidence = Math.max(existing.confidence, confidence);
      } else {
        fieldMappingMap.set(col, { mappedField: field, confidence, occurrences: 1 });
      }
    } else if (signalType?.includes('interpretation') || signalType?.includes('dual_path')) {
      const pattern = (signalValue.componentPattern as string) ?? (signalValue.signature as string) ?? '';
      if (pattern) {
        const existing = interpretationMap.get(pattern);
        if (existing) {
          existing.occurrences++;
          existing.confidence = Math.max(existing.confidence, confidence);
        } else {
          interpretationMap.set(pattern, { confidence, occurrences: 1 });
        }
      }
    } else if (signalType?.includes('reconciliation')) {
      const cls = (signalValue.discrepancyClass as string) ?? '';
      const existing = reconciliationMap.get(cls);
      if (existing) {
        existing.count++;
      } else {
        reconciliationMap.set(cls, { count: 1, lastSeen: createdAt });
      }
    } else if (signalType?.includes('resolution')) {
      const cause = (signalValue.rootCause as string) ?? '';
      const existing = resolutionMap.get(cause);
      if (existing) {
        existing.count++;
      } else {
        resolutionMap.set(cause, { count: 1, lastSeen: createdAt });
      }
    }
  }

  return {
    fieldMappingSignals: Array.from(fieldMappingMap.entries()).map(([col, data]) => ({
      sourceColumn: col,
      ...data,
    })),
    interpretationSignals: Array.from(interpretationMap.entries()).map(([pattern, data]) => ({
      componentPattern: pattern,
      ...data,
    })),
    reconciliationSignals: Array.from(reconciliationMap.entries()).map(([cls, data]) => ({
      discrepancyClass: cls,
      ...data,
    })),
    resolutionSignals: Array.from(resolutionMap.entries()).map(([cause, data]) => ({
      rootCause: cause,
      ...data,
    })),
  };
}

// ──────────────────────────────────────────────
// Empty Priors (for unit tests / cold start)
// ──────────────────────────────────────────────

export function emptyPriors(): AgentPriors {
  return {
    tenantDensity: new Map(),
    foundationalPriors: new Map(),
    domainPriors: new Map(),
    signalHistory: {
      fieldMappingSignals: [],
      interpretationSignals: [],
      reconciliationSignals: [],
      resolutionSignals: [],
    },
  };
}
