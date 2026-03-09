/**
 * DS-009 Layer 3: Entity Resolution — Derived, Not Routed
 *
 * Scans ALL committed_data for a tenant to discover person identifiers
 * from field identities. Creates/updates entities table. Backfills entity_id.
 *
 * Called AFTER all SCI content units complete (post-import), not per-unit.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export async function resolveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ created: number; updated: number; linked: number }> {

  // Step 1: Scan committed_data for batches that have field_identities
  // We need to find which columns are person identifiers in each batch
  const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null }>();
  const BATCH_SIZE = 200;

  let offset = 0;
  const seenBatches = new Set<string>();
  while (true) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('import_batch_id, metadata')
      .eq('tenant_id', tenantId)
      .not('metadata->field_identities', 'is', null)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const batchId = row.import_batch_id as string | null;
      if (!batchId || seenBatches.has(batchId)) continue;
      seenBatches.add(batchId);

      const meta = row.metadata as Record<string, unknown> | null;
      const fieldIds = meta?.field_identities as Record<string, {
        structuralType?: string;
        contextualIdentity?: string;
      }> | undefined;
      if (!fieldIds) continue;

      // Korean Test: match on structuralType, not column names
      let idColumn: string | null = null;
      let nameColumn: string | null = null;

      for (const [colName, fi] of Object.entries(fieldIds)) {
        if (fi.structuralType === 'identifier' &&
            fi.contextualIdentity?.toLowerCase().includes('person')) {
          idColumn = colName;
        }
        if (fi.structuralType === 'name') {
          nameColumn = colName;
        }
      }

      // Fallback: any identifier column if no 'person' contextual identity
      if (!idColumn) {
        for (const [colName, fi] of Object.entries(fieldIds)) {
          if (fi.structuralType === 'identifier') {
            idColumn = colName;
            break;
          }
        }
      }

      if (idColumn) {
        batchIdentifiers.set(batchId, { idColumn, nameColumn });
      }
    }

    if (rows.length < 1000) break;
    offset += 1000;
  }

  // Also check semantic_roles for entity_identifier (covers batches without field_identities)
  offset = 0;
  while (true) {
    const { data: rows } = await supabase
      .from('committed_data')
      .select('import_batch_id, metadata')
      .eq('tenant_id', tenantId)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const batchId = row.import_batch_id as string | null;
      if (!batchId || seenBatches.has(batchId)) continue;
      seenBatches.add(batchId);

      const meta = row.metadata as Record<string, unknown> | null;
      const semanticRoles = meta?.semantic_roles as Record<string, { role?: string }> | undefined;
      if (!semanticRoles) continue;

      let idColumn: string | null = null;
      let nameColumn: string | null = null;

      for (const [colName, sr] of Object.entries(semanticRoles)) {
        if (sr.role === 'entity_identifier') idColumn = colName;
        if (sr.role === 'entity_name') nameColumn = colName;
      }

      if (idColumn && !batchIdentifiers.has(batchId)) {
        batchIdentifiers.set(batchId, { idColumn, nameColumn });
      }
    }

    if (rows.length < 1000) break;
    offset += 1000;
  }

  if (batchIdentifiers.size === 0) return { created: 0, updated: 0, linked: 0 };

  // Step 2: Scan committed_data for unique entity identifiers across ALL batches
  const allEntities = new Map<string, string>(); // external_id -> display_name

  for (const [batchId, { idColumn, nameColumn }] of Array.from(batchIdentifiers.entries())) {
    let batchOffset = 0;
    while (true) {
      const { data: rows } = await supabase
        .from('committed_data')
        .select('row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .range(batchOffset, batchOffset + 999);

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        if (!extId) continue;
        const name = nameColumn ? String(rd[nameColumn] ?? extId).trim() : extId;
        if (!allEntities.has(extId)) {
          allEntities.set(extId, name);
        }
      }

      if (rows.length < 1000) break;
      batchOffset += 1000;
    }
  }

  if (allEntities.size === 0) return { created: 0, updated: 0, linked: 0 };

  // Step 3: Dedup against existing entities
  const existingMap = new Map<string, string>();
  const allExtIds = Array.from(allEntities.keys());
  for (let i = 0; i < allExtIds.length; i += BATCH_SIZE) {
    const slice = allExtIds.slice(i, i + BATCH_SIZE);
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);

    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // Step 4: Create new entities
  const newEntities: Array<{
    tenant_id: string;
    external_id: string;
    display_name: string;
    entity_type: string;
    status: string;
    temporal_attributes: unknown[];
    metadata: Record<string, unknown>;
  }> = [];

  for (const [extId, name] of Array.from(allEntities.entries())) {
    if (!existingMap.has(extId)) {
      newEntities.push({
        tenant_id: tenantId,
        external_id: extId,
        display_name: name,
        entity_type: 'individual',
        status: 'active',
        temporal_attributes: [],
        metadata: {},
      });
    }
  }

  let created = 0;
  if (newEntities.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < newEntities.length; i += CHUNK) {
      const chunk = newEntities.slice(i, i + CHUNK);
      const { error } = await supabase.from('entities').insert(chunk);
      if (error) {
        console.error('[Entity Resolution] Insert failed:', error);
        break;
      }
      created += chunk.length;
    }
  }

  // Step 5: Re-fetch full entity lookup (including newly created)
  const entityLookup = new Map<string, string>();
  for (let i = 0; i < allExtIds.length; i += BATCH_SIZE) {
    const slice = allExtIds.slice(i, i + BATCH_SIZE);
    const { data: ents } = await supabase
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .in('external_id', slice);
    if (ents) {
      for (const e of ents) {
        if (e.external_id) entityLookup.set(e.external_id, e.id);
      }
    }
  }

  // Step 6: Backfill entity_id on ALL committed_data rows across ALL batches
  let linked = 0;
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
    // Paginate through unlinked rows
    while (true) {
      const { data: unlinkeds } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .is('entity_id', null)
        .limit(500);

      if (!unlinkeds || unlinkeds.length === 0) break;

      // Group by entity UUID for batch update
      const updatesByEntityUuid = new Map<string, string[]>();
      for (const row of unlinkeds) {
        const rd = row.row_data as Record<string, unknown>;
        const extId = String(rd[idColumn] ?? '').trim();
        const entityUuid = entityLookup.get(extId);
        if (entityUuid) {
          if (!updatesByEntityUuid.has(entityUuid)) updatesByEntityUuid.set(entityUuid, []);
          updatesByEntityUuid.get(entityUuid)!.push(row.id);
        }
      }

      let linkedThisPage = 0;
      for (const [entityUuid, rowIds] of Array.from(updatesByEntityUuid.entries())) {
        for (let i = 0; i < rowIds.length; i += BATCH_SIZE) {
          const chunk = rowIds.slice(i, i + BATCH_SIZE);
          await supabase
            .from('committed_data')
            .update({ entity_id: entityUuid })
            .in('id', chunk);
          linkedThisPage += chunk.length;
        }
      }
      linked += linkedThisPage;

      if (unlinkeds.length < 500) break;
    }
  }

  console.log(`[Entity Resolution] DS-009 3.3: ${created} created, ${linked} rows linked across ${batchIdentifiers.size} batches`);

  return { created, updated: 0, linked };
}
