// OB-235 P4 — calculation-layer store adapter (LearnStore). Wraps the EXISTING synaptic_density table
// (migration 015; keyed (tenant_id, signature)) so the P2 learner-core can drive calculation density with
// the same recall/consolidate contract it drives comprehension / expression bindings with. NO new store
// (AP-17/HALT-SURFACE): the row shape mirrors synaptic-density.ts's loadDensity/persistDensityUpdates.
// The recall key is the Synaptic-Spec pattern_signature (RecallQuery.fingerprintHash carries it — the calc
// layer's "fingerprint" IS the component's structural pattern signature, a hash of its structural intent,
// never a field name). NO REGISTRY: nothing gated on an allowed-value set.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnStore, RecallQuery } from '../learn-store';
import type { PatternDensity, ExecutionMode } from '@/lib/calculation/synaptic-types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The adapter artifact = a PatternDensity plus the tenant it belongs to (LearnStore.persist takes only the
// artifact, so the tenant travels with it). signature == the pattern_signature == RecallQuery.fingerprintHash.
export interface TenantPatternDensity extends PatternDensity {
  tenantId: string;
}

export const synapticDensityStore: LearnStore<TenantPatternDensity> = {
  // Recall one pattern's density for the tenant (exact signature). Returns null on miss (cold pattern).
  async recall(sb: SupabaseClient, q: RecallQuery): Promise<TenantPatternDensity | null> {
    if (!q.tenantId) return null;
    const { data } = await (sb as any).from('synaptic_density')
      .select('signature, confidence, execution_mode, total_executions, last_anomaly_rate, last_correction_count, learned_behaviors')
      .eq('tenant_id', q.tenantId).eq('signature', q.fingerprintHash).maybeSingle();
    if (!data) return null;
    return {
      tenantId: q.tenantId,
      signature: data.signature,
      confidence: data.confidence ?? 0.5,
      totalExecutions: data.total_executions ?? 0,
      lastAnomalyRate: data.last_anomaly_rate ?? 0,
      lastCorrectionCount: data.last_correction_count ?? 0,
      executionMode: (data.execution_mode ?? 'full_trace') as ExecutionMode,
      learnedBehaviors: (typeof data.learned_behaviors === 'object' && data.learned_behaviors !== null) ? data.learned_behaviors : {},
    };
  },
  // Persist one pattern's density (idempotent upsert on (tenant_id, signature)) — same row shape as
  // synaptic-density.ts's persistDensityUpdates, so the live consolidation path and this adapter are one store.
  async persist(sb: SupabaseClient, a: TenantPatternDensity): Promise<void> {
    const { error } = await (sb as any).from('synaptic_density').upsert({
      tenant_id: a.tenantId,
      signature: a.signature,
      confidence: a.confidence,
      execution_mode: a.executionMode,
      total_executions: a.totalExecutions,
      last_anomaly_rate: a.lastAnomalyRate,
      last_correction_count: a.lastCorrectionCount,
      learned_behaviors: a.learnedBehaviors ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,signature' });
    if (error) console.error('[OB-235 P4] synaptic_density persist failed:', error.message);
  },
};
