/**
 * DS-009 Layer 3: Entity Resolution — Derived, Not Routed
 *
 * Scans ALL committed_data for a tenant to discover person identifiers
 * from field identities. Creates/updates entities table. Backfills entity_id.
 *
 * Called AFTER all SCI content units complete (post-import), not per-unit.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// HF-110: Guard against row index misidentification
// If most values are sequential small integers (0,1,2... or 1,2,3...), it's likely row indices
function looksLikeRowIndex(values: string[]): boolean {
  if (values.length < 3) return false;
  const nums: number[] = [];
  for (const v of values) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && String(n) === v.trim()) nums.push(n);
  }
  if (nums.length < values.length * 0.8) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[0] <= 1 && sorted[sorted.length - 1] <= sorted.length + 1;
}

export async function resolveEntitiesFromCommittedData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ created: number; updated: number; linked: number }> {

  // Step 1: Discover which batches have person identifier columns
  // Priority: entity batches first, then transaction/target, then reference
  const batchIdentifiers = new Map<string, { idColumn: string; nameColumn: string | null }>();
  const batchLabels = new Map<string, string>(); // batchId -> informational_label
  const BATCH_SIZE = 200;

  const seenBatches = new Set<string>();

  // Scan committed_data metadata for identifier columns
  // Read one row per batch to get metadata (dedup by import_batch_id)
  let offset = 0;
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
      if (!meta) continue;

      const label = (meta.informational_label as string) || '';
      batchLabels.set(batchId, label);

      let idColumn: string | null = null;
      let nameColumn: string | null = null;

      // Primary: field_identities (DS-009)
      const fieldIds = meta.field_identities as Record<string, {
        structuralType?: string;
        contextualIdentity?: string;
      }> | undefined;

      if (fieldIds && Object.keys(fieldIds).length > 0) {
        // Korean Test: match on structuralType, not column names
        for (const [colName, fi] of Object.entries(fieldIds)) {
          if (fi.structuralType === 'identifier' &&
              fi.contextualIdentity?.toLowerCase().includes('person')) {
            idColumn = colName;
          }
          if (fi.structuralType === 'name' &&
              fi.contextualIdentity?.toLowerCase().includes('person')) {
            nameColumn = colName;
          }
        }
        // Fallback within field_identities: any name column
        if (!nameColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'name') {
              nameColumn = colName;
              break;
            }
          }
        }
        // Fallback within field_identities: any identifier
        if (!idColumn) {
          for (const [colName, fi] of Object.entries(fieldIds)) {
            if (fi.structuralType === 'identifier') {
              idColumn = colName;
              break;
            }
          }
        }
      }

      // HF-110 Fix C: Fallback to semantic_roles when field_identities absent or has no person identifier
      if (!idColumn) {
        const semanticRoles = meta.semantic_roles as Record<string, { role?: string }> | undefined;
        if (semanticRoles) {
          for (const [colName, sr] of Object.entries(semanticRoles)) {
            if (sr.role === 'entity_identifier') idColumn = colName;
            if (sr.role === 'entity_name' && !nameColumn) nameColumn = colName;
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

  if (batchIdentifiers.size === 0) return { created: 0, updated: 0, linked: 0 };

  // HF-110: Prioritize entity-classified batches for entity discovery
  // Entity batches are the canonical source of person identifiers
  // Transaction/target batches are secondary (they reference entities)
  // Reference batches are excluded from entity discovery (they contain hub/store/location data)
  const ENTITY_LABELS = new Set(['entity', 'transaction', 'target']);
  const entityBatchIds = Array.from(batchIdentifiers.keys())
    .filter(id => ENTITY_LABELS.has(batchLabels.get(id) || ''));
  // If no entity/transaction/target batches found, use all batches
  const discoveryBatchIds = entityBatchIds.length > 0
    ? entityBatchIds
    : Array.from(batchIdentifiers.keys());

  // Step 2: Scan committed_data for unique entity identifiers
  const allEntities = new Map<string, string>(); // external_id -> display_name

  for (const batchId of discoveryBatchIds) {
    const { idColumn, nameColumn } = batchIdentifiers.get(batchId)!;
    let batchOffset = 0;
    const sampleValues: string[] = [];

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
        if (sampleValues.length < 50) sampleValues.push(extId);
        const name = nameColumn ? String(rd[nameColumn] ?? extId).trim() : extId;
        if (!allEntities.has(extId)) {
          allEntities.set(extId, name);
        }
      }

      if (rows.length < 1000) break;
      batchOffset += 1000;
    }

    // HF-110: Guard against row index misidentification
    if (looksLikeRowIndex(sampleValues)) {
      console.log(`[Entity Resolution] Skipping batch ${batchId}: identifier column ${idColumn} looks like row indices`);
      // Remove entities that came from this batch
      for (const val of sampleValues) {
        allEntities.delete(val);
      }
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
  // (not just discovery batches — transaction/target batches also need entity_id)
  let linked = 0;
  for (const [batchId, { idColumn }] of Array.from(batchIdentifiers.entries())) {
    while (true) {
      const { data: unlinkeds } = await supabase
        .from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', tenantId)
        .eq('import_batch_id', batchId)
        .is('entity_id', null)
        .limit(500);

      if (!unlinkeds || unlinkeds.length === 0) break;

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
