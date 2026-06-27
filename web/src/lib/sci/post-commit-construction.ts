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

    // ── OB-248 P-I1: hierarchy ingestion ──
    // A sheet that links entity→entity (a reporting hierarchy) constructs typed,
    // directed, temporal entity_relationships edges. Detected structurally (two
    // columns both value-overlapping individual external_ids); the LLM-recognized
    // relationship characterization types the edge. No-op when no hierarchy sheet
    // is present → BCL/Meridian/MIR import byte-identical (P-I3 neutrality).
    await constructHierarchyEdges(supabase, tenantId);
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

// ──────────────────────────────────────────────
// OB-248 P-I1: hierarchy ingestion — pure detection + construction
// ──────────────────────────────────────────────

/** Structural detection of a hierarchy/edge sheet: two entity-overlap columns. */
export interface HierarchyDetection {
  /** The ≈1:1-with-rows entity column (the subordinate / originator — edge SOURCE). */
  childCol: string;
  /** The repeating entity column (the supervisor — edge TARGET). */
  parentCol: string;
  /** A low-cardinality non-numeric column carrying the relationship label, when present. */
  typeCol: string | null;
}

/**
 * Detect a hierarchy edge sheet structurally (Korean Test — value-overlap and
 * cardinality only, never column names). A hierarchy sheet has ≥2 columns whose
 * values predominantly match individual external_ids; the higher-cardinality one
 * is the subordinate (≈1 row each), the next the supervisor (repeats). Returns
 * null when the rows are not a hierarchy sheet (→ no-op, neutrality).
 */
export function detectHierarchyEdges(
  rows: Array<Record<string, unknown>>,
  individualExtIds: Set<string>,
): HierarchyDetection | null {
  if (rows.length === 0 || individualExtIds.size === 0) return null;
  const cols = new Set<string>();
  for (const rd of rows) for (const k of Object.keys(rd)) if (!k.startsWith('_')) cols.add(k);

  const entityCols: Array<{ col: string; distinct: number }> = [];
  for (const col of Array.from(cols)) {
    const vals = new Set<string>(); let match = 0, total = 0;
    for (const rd of rows) { const v = rd[col]; if (v == null) continue; const s = String(v).trim(); if (!s) continue; total++; vals.add(s); if (individualExtIds.has(s)) match++; }
    if (total > 0 && match / total > 0.5) entityCols.push({ col, distinct: vals.size });
  }
  if (entityCols.length < 2) return null;
  entityCols.sort((a, b) => b.distinct - a.distinct);
  const childCol = entityCols[0].col;
  const parentCol = entityCols[1].col;
  if (childCol === parentCol) return null;

  let typeCol: string | null = null;
  for (const col of Array.from(cols)) {
    if (col === childCol || col === parentCol) continue;
    const vals = new Set<string>(); let nonNum = 0, total = 0;
    for (const rd of rows) { const v = rd[col]; if (v == null) continue; const s = String(v).trim(); if (!s) continue; total++; vals.add(s); if (!Number.isFinite(Number(s.replace(/[$,%\s]/g, '')))) nonNum++; }
    if (total > 0 && nonNum / total > 0.5 && vals.size <= Math.max(8, total / 4)) { typeCol = col; break; }
  }
  return { childCol, parentCol, typeCol };
}

export interface ConstructedEdge {
  tenant_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  source: string;
  confidence: number;
  evidence: Record<string, unknown>;
  context: Record<string, unknown>;
  effective_from: string;
}

/**
 * Construct directed child→parent edges from a detected hierarchy sheet. The edge
 * TYPE is the LLM-recognized relationship value carried in the data (`typeCol`),
 * or the supplied `recognizedType` characterization — never a literal in this
 * logic (Decision 158 / Korean Test). Orientation: SOURCE=subordinate so a
 * distribution originator walks UP via outbound edges.
 */
export function buildHierarchyEdges(
  rows: Array<Record<string, unknown>>,
  detection: HierarchyDetection,
  individualsByExtId: Map<string, { id: string }>,
  tenantId: string,
  recognizedType: string,
  nowIso: string,
): ConstructedEdge[] {
  const edges: ConstructedEdge[] = [];
  const seen = new Set<string>();
  for (const rd of rows) {
    const childExt = String(rd[detection.childCol] ?? '').trim();
    const parentExt = String(rd[detection.parentCol] ?? '').trim();
    const child = individualsByExtId.get(childExt);
    const parent = individualsByExtId.get(parentExt);
    if (!child || !parent || child.id === parent.id) continue;
    const rowType = detection.typeCol ? String(rd[detection.typeCol] ?? '').trim() : '';
    const type = rowType || recognizedType;
    if (!type) continue; // C2: an untyped edge is not fabricated — surfaced by the caller
    const dedup = `${child.id}|${parent.id}|${type}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    edges.push({
      tenant_id: tenantId, source_entity_id: child.id, target_entity_id: parent.id,
      relationship_type: type, source: 'imported_explicit', confidence: 1.0,
      evidence: { signal: 'hierarchy_sheet', childCol: detection.childCol, parentCol: detection.parentCol, typeCol: detection.typeCol },
      context: { recognized_relationship: rowType || recognizedType || null },
      effective_from: nowIso,
    });
  }
  return edges;
}

/**
 * P-I1 DB wrapper: scan each data_type for a hierarchy sheet, construct edges,
 * upsert via the existing onConflict key. Best-effort (never throws into import).
 * The recognized edge type is the typeCol value, or the parent column's
 * comprehension-recognized relationship characterization. When neither resolves,
 * the sheet's edges are skipped with a diagnostic (C2 — no hardcoded type).
 */
async function constructHierarchyEdges(supabase: SupabaseClient, tenantId: string): Promise<void> {
  const { data: individuals } = await supabase
    .from('entities').select('id, external_id').eq('tenant_id', tenantId).eq('entity_type', 'individual');
  if (!individuals || individuals.length === 0) return;
  const byExtId = new Map<string, { id: string }>();
  const extIds = new Set<string>();
  for (const e of individuals) { if (e.external_id) { const x = String(e.external_id).trim(); byExtId.set(x, { id: e.id }); extIds.add(x); } }
  if (extIds.size === 0) return;

  // candidate sheets: distinct data_types present for this tenant
  const { data: dtRows } = await supabase.from('committed_data').select('data_type').eq('tenant_id', tenantId).limit(5000);
  const dataTypes = Array.from(new Set((dtRows ?? []).map(r => String((r as { data_type: string }).data_type))));

  for (const dt of dataTypes) {
    const { data: sheetRows } = await supabase.from('committed_data').select('row_data').eq('tenant_id', tenantId).eq('data_type', dt).limit(5000);
    const rows = (sheetRows ?? []).map(r => (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data)) ? r.row_data as Record<string, unknown> : {});
    const detection = detectHierarchyEdges(rows, extIds);
    if (!detection) continue;

    // recognized relationship characterization for the parent column (comprehension).
    let recognizedType = '';
    try {
      const { data: ca } = await supabase.from('comprehension_artifacts')
        .select('field_name, relationships, characterization').eq('tenant_id', tenantId).eq('field_name', detection.parentCol).limit(1);
      const rel = ca && ca[0] ? (ca[0].relationships ?? ca[0].characterization) : null;
      if (typeof rel === 'string' && rel.trim()) recognizedType = rel.trim();
    } catch { /* best-effort */ }

    const edges = buildHierarchyEdges(rows, detection, byExtId, tenantId, recognizedType, new Date().toISOString());
    if (edges.length === 0) {
      console.warn(`[OB-248 P-I1] hierarchy sheet "${dt}" detected (${detection.childCol}→${detection.parentCol}) but no edge type recognized — edges skipped (C2: provide a relationship column).`);
      continue;
    }
    for (let i = 0; i < edges.length; i += 500) {
      const slice = edges.slice(i, i + 500);
      const { error: relErr } = await supabase.from('entity_relationships')
        .upsert(slice, { onConflict: 'tenant_id,source_entity_id,target_entity_id,relationship_type' });
      if (relErr) console.warn(`[OB-248 P-I1] entity_relationships upsert error (sheet "${dt}"): ${relErr.message}`);
    }
    console.log(`[OB-248 P-I1] hierarchy sheet "${dt}": ${edges.length} ${detection.childCol}→${detection.parentCol} edges (type from ${detection.typeCol ?? 'recognition'})`);
  }
}
