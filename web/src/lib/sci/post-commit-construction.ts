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

    // ── HF-263 Phase 2 (HALT-A): CPI Shared-Attribute relationship discovery ──
    // Runs AFTER resolveEntitiesFromCommittedData so both 'individual' (employee) and
    // 'location' (hub/grouping) entities exist and entity_id is back-linked on the rows.
    // Korean Test: value-set intersection only — no column-name registry, no language literals.
    await discoverSharedAttributeRelationships(supabase, tenantId);
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

/**
 * HF-263 Phase 2 (CPI Dimension 1 — Shared Attribute). For each column on the
 * entity-classified committed_data rows, compute value-set intersection with the
 * external_ids of non-individual (grouping) entities. When a column's distinct
 * values predominantly match grouping entities, it is a relationship bridge:
 * write `assigned_to` entity_relationships from each individual to its grouping entity.
 *
 * Structural (Korean Test): keys on data_type classification and value-set overlap,
 * never on column names or language. Best-effort: never throws into the import path.
 */
async function discoverSharedAttributeRelationships(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  // 1. Non-individual (grouping) entities — the candidate relationship targets.
  const { data: groupingEntities } = await supabase
    .from('entities')
    .select('id, external_id, entity_type')
    .eq('tenant_id', tenantId)
    .neq('entity_type', 'individual');

  if (!groupingEntities || groupingEntities.length === 0) return;
  const groupingByExtId = new Map(
    groupingEntities.filter(e => e.external_id).map(e => [e.external_id!.trim(), e]),
  );

  // 2. Entity-classified rows carry the bridging enrichment columns (e.g. an
  //    assigned-hub column). entity_id is the individual's UUID (back-linked above).
  const { data: entityRows } = await supabase
    .from('committed_data')
    .select('row_data, entity_id')
    .eq('tenant_id', tenantId)
    .eq('data_type', 'entity')
    .not('entity_id', 'is', null)
    .limit(5000);

  if (!entityRows || entityRows.length === 0) return;

  // 3. Candidate bridge columns (structural keys only; skip _rowIndex/_sheetName).
  const allKeys = new Set<string>();
  for (const r of entityRows) {
    const rd = r.row_data as Record<string, unknown> | null;
    if (rd) for (const k of Object.keys(rd)) if (!k.startsWith('_')) allKeys.add(k);
  }

  // 4. For each column, test value-set intersection with grouping external_ids.
  for (const colKey of Array.from(allKeys)) {
    const colValues = new Set<string>();
    for (const r of entityRows) {
      const val = (r.row_data as Record<string, unknown> | null)?.[colKey];
      if (val != null && typeof val === 'string' && val.trim()) colValues.add(val.trim());
    }
    if (colValues.size === 0) continue;

    let intersectionCount = 0;
    for (const v of Array.from(colValues)) if (groupingByExtId.has(v)) intersectionCount++;

    // Structural threshold: a bridge column has >50% of its distinct values matching
    // grouping entities (a free-text attribute column intersects ~0%).
    if (intersectionCount === 0 || intersectionCount / colValues.size <= 0.5) continue;

    // 5. Build individual → grouping relationships.
    const relationships: Array<{
      tenant_id: string;
      source_entity_id: string;
      target_entity_id: string;
      relationship_type: string;
      source: string;
      confidence: number;
      evidence: Record<string, unknown>;
      context: Record<string, unknown>;
    }> = [];

    for (const r of entityRows) {
      const groupVal = (r.row_data as Record<string, unknown> | null)?.[colKey];
      if (!groupVal || typeof groupVal !== 'string' || !groupVal.trim()) continue;
      const groupEntity = groupingByExtId.get(groupVal.trim());
      if (!groupEntity || !r.entity_id) continue;

      relationships.push({
        tenant_id: tenantId,
        source_entity_id: r.entity_id,
        target_entity_id: groupEntity.id,
        relationship_type: 'assigned_to',
        source: 'ai_inferred',
        confidence: 0.85,
        evidence: { signal: 'shared_attribute', field: colKey, import_source: 'post_commit_construction' },
        context: {},
      });
    }

    if (relationships.length === 0) continue;
    for (let i = 0; i < relationships.length; i += 500) {
      const slice = relationships.slice(i, i + 500);
      const { error: relErr } = await supabase
        .from('entity_relationships')
        .upsert(slice, { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' });
      if (relErr) console.warn(`[HF-263 CPI] entity_relationships upsert error: ${relErr.message}`);
    }
    console.log(
      `[HF-263 CPI] Created ${relationships.length} '${colKey}' -> assigned_to relationships ` +
      `(${groupingByExtId.size} grouping entities)`,
    );
  }
}
