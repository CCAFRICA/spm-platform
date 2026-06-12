/**
 * DIAG-063 / A3 — Cross-file entity resolution (READ-ONLY probe)
 *
 * Identifier model per SCHEMA_REFERENCE_LIVE.md:
 *   entities.external_id (text, nullable) — a SINGLE source key column per entity row.
 *   alias_registry maps alias_text -> reference_item_id (reference data), NOT entities.
 *
 * Therefore "multiple source identifiers per entity" is measured two ways:
 *   (1) external_id uniqueness across entity rows (dedup proof: 1 row per source key)
 *   (2) entities whose linked committed_data rows span >= 2 distinct import_batch_id
 *       (the cross-FILE resolution evidence under the single-external_id model)
 *
 * Anonymization: tenant UUIDs only. No display_name, no file_name, no row_data values.
 * Korean Test: structural columns only (schema names), no data literals.
 * SELECT-only via supabase-js.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Step 1: most recent tenant with a multi-file batch set (>= 2 import_batches)
  const { data: batches, error: bErr } = await supabase
    .from('import_batches')
    .select('id, tenant_id, status, row_count, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (bErr) throw bErr;

  const byTenant = new Map<string, { id: string; status: string; row_count: number; created_at: string }[]>();
  for (const b of batches ?? []) {
    const arr = byTenant.get(b.tenant_id) ?? [];
    arr.push(b);
    byTenant.set(b.tenant_id, arr);
  }

  let chosenTenant: string | null = null;
  for (const b of batches ?? []) {
    if ((byTenant.get(b.tenant_id)?.length ?? 0) >= 2) { chosenTenant = b.tenant_id; break; }
  }
  if (!chosenTenant) { console.log('NO multi-file tenant found in latest 500 batches'); return; }

  const tBatches = byTenant.get(chosenTenant)!;
  console.log(`tenant=${chosenTenant} import_batches_in_window=${tBatches.length}`);
  for (const b of tBatches) {
    console.log(`  batch=${b.id} status=${b.status} row_count=${b.row_count} created_at=${b.created_at}`);
  }

  // Step 2: total entities for tenant
  const totalQ = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', chosenTenant);
  console.log(`entities_total=${totalQ.count}`);

  // Step 3: external_id model — distinct external_ids vs rows (dedup proof)
  const extIds = new Map<string, number>(); // external_id -> entity row count (values never printed)
  let nullExt = 0;
  let withMetadataKeys = 0;
  const metadataKeyHistogram = new Map<number, number>(); // keyCount -> entities
  let offset = 0;
  const entityIdToExt = new Map<string, string>();
  while (true) {
    const { data: rows, error } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', chosenTenant)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      if (r.external_id == null || r.external_id === '') nullExt++;
      else {
        extIds.set(r.external_id, (extIds.get(r.external_id) ?? 0) + 1);
        entityIdToExt.set(r.id, r.external_id);
      }
      const keyCount = r.metadata && typeof r.metadata === 'object' ? Object.keys(r.metadata as object).length : 0;
      if (keyCount > 0) withMetadataKeys++;
      metadataKeyHistogram.set(keyCount, (metadataKeyHistogram.get(keyCount) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
  const dupExtIds = Array.from(extIds.values()).filter(c => c >= 2).length;
  console.log(`entities_with_external_id=${Array.from(extIds.values()).reduce((a, b) => a + b, 0)} distinct_external_ids=${extIds.size} external_ids_mapping_to_multiple_entity_rows=${dupExtIds} entities_null_or_empty_external_id=${nullExt}`);
  console.log(`entities_with_nonempty_metadata=${withMetadataKeys} metadata_keycount_histogram=${JSON.stringify(Array.from(metadataKeyHistogram.entries()))}`);

  // Step 4: cross-file linkage — per entity, distinct import_batch_id in committed_data
  const entityBatches = new Map<string, Set<string>>();
  let cdRows = 0, cdLinked = 0, cdNullEntity = 0;
  offset = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from('committed_data')
      .select('entity_id, import_batch_id')
      .eq('tenant_id', chosenTenant)
      .range(offset, offset + 999);
    if (error) throw error;
    if (!rows || rows.length === 0) break;
    cdRows += rows.length;
    for (const r of rows) {
      if (!r.entity_id) { cdNullEntity++; continue; }
      cdLinked++;
      if (!r.import_batch_id) continue;
      let s = entityBatches.get(r.entity_id);
      if (!s) { s = new Set(); entityBatches.set(r.entity_id, s); }
      s.add(r.import_batch_id);
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
  const multiBatch = Array.from(entityBatches.values()).filter(s => s.size >= 2).length;
  const batchSpanHistogram = new Map<number, number>();
  for (const s of Array.from(entityBatches.values())) {
    batchSpanHistogram.set(s.size, (batchSpanHistogram.get(s.size) ?? 0) + 1);
  }
  console.log(`committed_data_rows=${cdRows} rows_linked_to_entity=${cdLinked} rows_entity_id_null=${cdNullEntity}`);
  console.log(`entities_referenced_in_committed_data=${entityBatches.size} entities_spanning_ge2_import_batches=${multiBatch}`);
  console.log(`entity_batch_span_histogram=${JSON.stringify(Array.from(batchSpanHistogram.entries()).sort((a, b) => a[0] - b[0]))}`);

  // Step 5: alias_registry — confirm it is reference-item scoped, count only
  const aliasQ = await supabase
    .from('alias_registry')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', chosenTenant);
  console.log(`alias_registry_rows_for_tenant=${aliasQ.count}`);
}

main().catch(e => { console.error('PROBE FAILED:', e.message ?? e); process.exit(1); });
