// OB-235 P2 — the store-adapter interface the learner-core drives. One adapter per EXISTING store
// (comprehension_artifacts / synaptic_density / surface_bindings / foundational_patterns / domain_patterns)
// — NO new stores are introduced (HALT-SURFACE). The adapter is the only layer-specific piece; the
// learner-core is generic over it.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StructuralFeatures } from './structural-fingerprint-matcher';

// Match scope. 'tenant'/'expression' read within tenant_id; the cross-tenant reads (foundational/domain,
// and expression cold-start) DROP tenant_id and key on (structural_fingerprint_hash[, surface_id]) — the
// index HF-337 built. Scope is a structural parameter, not a gated allowed-value set.
export type LearnScope = 'tenant' | 'foundational' | 'domain' | 'expression';

export interface RecallQuery {
  scope: LearnScope;
  fingerprintHash: string;
  tenantId?: string;             // present for same-tenant reads; DROPPED for cross-tenant reads
  surfaceId?: string;            // expression scope: the (fingerprint_hash, surface_id) cross-tenant key
  features?: StructuralFeatures; // for similarity when an exact-hash miss should still fuzzy-match
  minSimilarity?: number;        // structural-match threshold (caller/learner-core supplies a default)
}

// Generic over the layer's persisted artifact shape T. Implementations wrap an EXISTING table.
export interface LearnStore<TArtifact> {
  /** Read the stored artifact for this scope/fingerprint (exact hash first, then optional similarity). */
  recall(sb: SupabaseClient, q: RecallQuery): Promise<TArtifact | null>;
  /** Persist the learned artifact to the existing store (idempotent upsert). */
  persist(sb: SupabaseClient, artifact: TArtifact): Promise<void>;
}
