// OB-235 P2 — the scope/store-generic learner core. It generalizes HF-337's recognizer loop
// (read-path-first → hit/deterministic → miss/recognize+persist+signal) to EVERY scope and store.
//
// recall() reads the existing store (Tenant within tenant_id; Foundational/Domain/Expression with the
// tenant_id-dropped (fingerprint[, surface]) key). consolidate() persists the learned artifact to its
// existing store AND emits exactly one signal through the ONE canonical writer (the dual-write pattern,
// single surface — never a private channel; G7). NO REGISTRY: neither function gates on an allowed-value
// set; signalType is open vocabulary; the only validation is the canonical writer's structural confidence
// range check.

import type { SupabaseClient } from '@supabase/supabase-js';
import { writeSignalWithClient } from '@/lib/intelligence/canonical-signal-writer';
import type { LearnStore, RecallQuery } from './learn-store';

// Default structural-match threshold (Residual 1: tunable per layer; conservative — re-derive on doubt).
export const DEFAULT_MIN_SIMILARITY = 0.9;

/** Read the learned artifact for a scope/fingerprint. Returns null on miss (caller runs the cold path). */
export async function recall<T>(sb: SupabaseClient, store: LearnStore<T>, q: RecallQuery): Promise<T | null> {
  return store.recall(sb, { minSimilarity: DEFAULT_MIN_SIMILARITY, ...q });
}

export interface ConsolidateSignal {
  tenantId: string;
  signalType: string;                                  // open-vocabulary (NO registry)
  signalValue: Record<string, unknown>;
  confidence?: number | null;
  source?: string;
  scope?: string | null;
  structuralFingerprint?: Record<string, unknown> | null;
}

/**
 * Consolidate this run's learning: persist the artifact to its EXISTING store, then emit one signal via
 * the canonical writer. The two writes are the Role-4 dual-write — the artifact the next run reads, plus
 * the signal the flywheel consumes — both landing on the one signal surface.
 */
export async function consolidate<T>(
  sb: SupabaseClient,
  store: LearnStore<T>,
  artifact: T,
  signal: ConsolidateSignal,
): Promise<void> {
  await store.persist(sb, artifact);
  await writeSignalWithClient({
    tenantId: signal.tenantId,
    signalType: signal.signalType,
    signalValue: signal.signalValue,
    confidence: signal.confidence ?? null,
    source: signal.source,
    scope: signal.scope ?? null,
    structuralFingerprint: signal.structuralFingerprint ?? null,
  }, sb);
}
