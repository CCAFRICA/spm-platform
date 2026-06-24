// OB-235 P3 — comprehension-layer store adapter (LearnStore). Wraps the EXISTING stores:
//   - structural_fingerprints holds the recall KEY — a structural fingerprint of a comprehended import
//     shape. We reuse the table (AP-17/HALT-SURFACE clean), writing the di10 CHECK-permitted column values
//     (scope='tenant', granularity='sheet') and marking the row comprehension-kind via classification_result.
//     The structural hash is unique to comprehension fingerprints, so recall keys on (tenant_id,
//     fingerprint_hash) + the kind marker — no collision with SCI fingerprints.
//   - comprehension_artifacts holds the CONTENT (written by the comprehension generator).
// No new store. NO REGISTRY — nothing is gated on an allowed-value SET; the `kind` marker is a structural
// discriminator. (The di10 CHECK is itself a schema-layer allowed-set on scope/granularity — recorded in
// the ADR as registry-advocacy, false per the standing rule; not altered here, we use a permitted value.)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearnStore, RecallQuery } from '../learn-store';
import type { StructuralFeatures } from '../structural-fingerprint-matcher';

/* eslint-disable @typescript-eslint/no-explicit-any */

const COMPREHENSION_SCOPE = 'comprehension'; // structural fingerprint-kind discriminator (not a registry)

export interface ComprehensionFingerprint {
  tenantId: string;
  fingerprintHash: string;
  features: StructuralFeatures;
}

export const comprehensionStore: LearnStore<ComprehensionFingerprint> = {
  // Recall: a comprehension fingerprint with this hash already recorded for the tenant. The structural
  // hash is unique to comprehension fingerprints (sha256 of the structural features), so keying on
  // (tenant_id, fingerprint_hash) finds only our row — no collision with SCI fingerprints. The
  // classification_result.kind marker discriminates for observability.
  async recall(sb: SupabaseClient, q: RecallQuery): Promise<ComprehensionFingerprint | null> {
    if (!q.tenantId) return null;
    const { data } = await (sb as any).from('structural_fingerprints')
      .select('fingerprint_hash, fingerprint, classification_result')
      .eq('tenant_id', q.tenantId).eq('fingerprint_hash', q.fingerprintHash)
      .eq('classification_result->>kind', COMPREHENSION_SCOPE).limit(1);
    if (data && data.length) return { tenantId: q.tenantId, fingerprintHash: q.fingerprintHash, features: (data[0].fingerprint ?? {}) as StructuralFeatures };
    return null;
  },
  // Persist: record the comprehension fingerprint. Idempotent. Uses the structural_fingerprints values
  // its di10 CHECK constraint permits (scope='tenant', granularity='sheet', confidence<=~0.92) and marks
  // the row as comprehension-kind in classification_result. (The di10 check is a schema-layer allowed-set
  // on scope/granularity — recorded in the ADR as registry-advocacy false per the standing rule; we do
  // not alter it via migration here, we use a permitted value + our own jsonb marker.)
  async persist(sb: SupabaseClient, a: ComprehensionFingerprint): Promise<void> {
    const existing = await (sb as any).from('structural_fingerprints')
      .select('id').eq('tenant_id', a.tenantId).eq('fingerprint_hash', a.fingerprintHash)
      .eq('classification_result->>kind', COMPREHENSION_SCOPE).limit(1);
    if (existing.data && existing.data.length) return; // already recorded — idempotent
    const now = new Date().toISOString();
    const { error } = await (sb as any).from('structural_fingerprints').insert({
      tenant_id: a.tenantId,
      fingerprint: a.features,                              // the structural features (jsonb)
      fingerprint_hash: a.fingerprintHash,
      classification_result: { kind: COMPREHENSION_SCOPE }, // NOT NULL + our discriminator marker
      column_roles: {},                                     // NOT NULL; recall keys on shape, not roles
      match_count: 1,
      confidence: 0.9,
      granularity: 'sheet',                                 // di10-permitted value
      algorithm_version: 1,                                 // smallint
      scope: 'tenant',                                      // di10-permitted value (comprehension is per-tenant)
      created_at: now,
      updated_at: now,
    });
    // Fail-loud (not silent): a failed fingerprint persist means the next encounter stays cold.
    if (error) console.error('[OB-235 P3] comprehension fingerprint persist failed:', error.message);
  },
};
