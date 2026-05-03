/**
 * HF-196 Phase 1: Shared post-commit construction module.
 *
 * Unifies the post-import work that previously diverged between
 * `/api/import/sci/execute` (plan path — ran entity resolution post-execute)
 * and `/api/import/sci/execute-bulk` (data path — entity resolution missing
 * after OB-182 removed the post-commit construction). Now both endpoints
 * delegate to this single function, restoring vertical-slice symmetry per
 * IGF-T1-E906 (Vertical Slice Rule) and closing Break #3 (import surface
 * fragmentation) identified in Phase 6-AUDIT.
 *
 * Korean Test (IGF-T1-E910) compliance:
 *   - Tenant-agnostic: tenant_id is a runtime parameter
 *   - Zero hardcoded field names; entity matching delegates to
 *     resolveEntitiesFromCommittedData which uses structural identifiers
 *     from field_identities metadata
 *   - Zero domain-specific string literals
 *
 * Carry Everything (IGF-T1-E902): does not gate on classification — runs
 * on ALL committed_data for the tenant regardless of which pipeline ran.
 *
 * Idempotent: safe to call repeatedly; resolveEntitiesFromCommittedData
 * skips rows that already have entity_id populated.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEntitiesFromCommittedData } from './entity-resolution';

export interface PostCommitConstructionContext {
  supabase: SupabaseClient;
  tenantId: string;
  source: 'sci-execute' | 'sci-bulk';
}

export interface PostCommitConstructionResult {
  entitiesCreated: number;
  entityRowsLinked: number;
  source: PostCommitConstructionContext['source'];
  durationMs: number;
}

/**
 * Run post-commit construction: entity resolution + entity_id back-link.
 *
 * Both import endpoints call this after their committed_data inserts.
 * Returns structural counts for caller-side logging; never throws on
 * recoverable errors (errors logged + counts surfaced as zeros).
 */
export async function executePostCommitConstruction(
  context: PostCommitConstructionContext,
): Promise<PostCommitConstructionResult> {
  const startedAt = Date.now();
  const { supabase, tenantId, source } = context;

  let entitiesCreated = 0;
  let entityRowsLinked = 0;

  try {
    const result = await resolveEntitiesFromCommittedData(supabase, tenantId);
    entitiesCreated = result.created;
    entityRowsLinked = result.linked;
    console.log(
      `[PostCommitConstruction:${source}] tenant=${tenantId} ` +
      `entities_created=${entitiesCreated} rows_back_linked=${entityRowsLinked}`,
    );
  } catch (err) {
    console.error(
      `[PostCommitConstruction:${source}] resolveEntitiesFromCommittedData failed (non-blocking):`,
      err,
    );
  }

  return {
    entitiesCreated,
    entityRowsLinked,
    source,
    durationMs: Date.now() - startedAt,
  };
}
