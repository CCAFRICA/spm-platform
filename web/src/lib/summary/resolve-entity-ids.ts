// OB-232 Objective 1 — structural entity resolution for summaries.
// Populates committed_data.entity_id for rows that carry an entity identifier in row_data, by
// VALUE-OVERLAP with entities.external_id. KOREAN TEST: the identifier field is DISCOVERED from the
// data (the row_data key whose values match external_ids), never a hardcoded field name like
// 'ID_Empleado'. T1-E902: rows are only updated, never deleted/filtered; unresolvable rows stay NULL.

import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NullRow { id: string; row_data: Record<string, unknown> | null }

/** The row_data key whose string values most-overlap the entity external_id set (the join key). */
function discoverIdentifierField(rows: NullRow[], extIds: Set<string>): { field: string | null; matches: number } {
  const counts = new Map<string, number>();
  const sample = rows.slice(0, 1000);
  for (const r of sample) {
    const rd = r.row_data || {};
    for (const k in rd) {
      const v = rd[k];
      if (typeof v === 'string' && extIds.has(v)) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let field: string | null = null;
  let matches = 0;
  for (const [k, c] of Array.from(counts.entries())) if (c > matches) { field = k; matches = c; }
  // require a real signal: at least 3 matches and ≥10% of the sample
  const threshold = Math.max(3, Math.floor(sample.length * 0.1));
  return matches >= threshold ? { field, matches } : { field: null, matches };
}

export interface EntityResolutionResult {
  tenantId: string;
  total: number;          // NULL-entity rows considered
  resolved: number;       // rows updated with an entity_id
  fieldUsed: string | null;
  entitiesMatched: number;
}

export async function resolveEntityIds(
  sb: SupabaseClient,
  tenantId: string,
  opts: { dataType?: string } = {},
): Promise<EntityResolutionResult> {
  // 1. external_id → entity id map
  const extToId = new Map<string, string>();
  {
    let offset = 0;
    for (;;) {
      const { data, error } = await sb
        .from('entities')
        .select('id, external_id')
        .eq('tenant_id', tenantId)
        .not('external_id', 'is', null)
        .range(offset, offset + 999);
      if (error) throw new Error(`entities read: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const e of data as any[]) if (e.external_id) extToId.set(e.external_id, e.id);
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  const extIds = new Set(extToId.keys());

  // 2. NULL-entity rows
  const rows: NullRow[] = [];
  {
    let offset = 0;
    for (;;) {
      let q = sb.from('committed_data').select('id, row_data').eq('tenant_id', tenantId).is('entity_id', null);
      if (opts.dataType) q = q.eq('data_type', opts.dataType);
      const { data, error } = await q.order('id', { ascending: true }).range(offset, offset + 999);
      if (error) throw new Error(`committed_data read: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...(data as NullRow[]));
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  if (rows.length === 0 || extIds.size === 0) {
    return { tenantId, total: rows.length, resolved: 0, fieldUsed: null, entitiesMatched: 0 };
  }

  // 3. discover the identifier field by value-overlap
  const { field } = discoverIdentifierField(rows, extIds);
  if (!field) {
    return { tenantId, total: rows.length, resolved: 0, fieldUsed: null, entitiesMatched: 0 };
  }

  // 4. group resolvable row ids by target entity
  const byEntity = new Map<string, string[]>();
  for (const r of rows) {
    const v = r.row_data?.[field];
    if (typeof v !== 'string') continue;
    const entityId = extToId.get(v);
    if (!entityId) continue;
    const arr = byEntity.get(entityId) ?? [];
    arr.push(r.id);
    byEntity.set(entityId, arr);
  }

  // 5. batch update
  let resolved = 0;
  for (const [entityId, ids] of Array.from(byEntity.entries())) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb.from('committed_data').update({ entity_id: entityId }).in('id', chunk);
      if (error) throw new Error(`update entity_id: ${error.message}`);
      resolved += chunk.length;
    }
  }

  return { tenantId, total: rows.length, resolved, fieldUsed: field, entitiesMatched: byEntity.size };
}
