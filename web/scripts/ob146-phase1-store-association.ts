/**
 * OB-146 Phase 1: Entity→Store Association
 *
 * Two-part fix:
 * 1. Update entity metadata with store_id from rows that have No_Tienda/num_tienda
 * 2. Update committed_data row_data for entities missing store key (BCP rows)
 *    so the engine can resolve store data
 *
 * The engine reads store from committed_data.row_data (storeId/num_tienda/No_Tienda).
 * Entities with only Base_Club_Proteccion data have no store field.
 * We bridge this using the employee→store mapping from roster/BVI data.
 *
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob146-phase1-store-association.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const PAGE_SIZE = 1000;

async function paginatedSelect(
  table: string,
  columns: string,
  filters: Array<{ op: string; col: string; val: unknown }>
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from(table).select(columns).range(from, to);
    for (const f of filters) {
      if (f.op === 'eq') q = q.eq(f.col, f.val);
      else if (f.op === 'is') q = q.is(f.col, f.val as null);
      else if (f.op === 'not_is') q = q.not(f.col, 'is', f.val as null);
      else if (f.op === 'ilike') q = q.ilike(f.col, f.val as string);
    }
    const { data, error } = await q;
    if (error) { console.error(`Query error on ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
    if (page > 200) { console.warn('Too many pages, stopping'); break; }
  }
  return rows;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('OB-146 PHASE 1: ENTITY→STORE ASSOCIATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Find Enero 2024 period
  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key')
    .eq('tenant_id', tenantId);
  const eneroPeriod = (periods ?? []).find(p => p.canonical_key === '2024-01');
  if (!eneroPeriod) { console.error('No Enero 2024 period'); process.exit(1); }

  // ═══════════════════════════════════════════════════════════════
  // Step 1: Build employee→store mapping from ALL committed_data
  // ═══════════════════════════════════════════════════════════════
  console.log('Step 1: Building employee→store mapping...\n');

  // Fetch ALL committed_data for this tenant+period (entity and store level)
  const allRows = await paginatedSelect('committed_data', 'id, entity_id, data_type, row_data', [
    { op: 'eq', col: 'tenant_id', val: tenantId },
    { op: 'eq', col: 'period_id', val: eneroPeriod.id },
  ]);
  console.log(`Total committed_data rows for Enero 2024: ${allRows.length}`);

  // Build entity_id → employee number mapping from entity rows
  const entityIdToEmpNum = new Map<string, string>();
  const entityIdToStore = new Map<string, string>();
  const entityIdToTier = new Map<string, string>();
  const entityIdToRango = new Map<string, string>();

  for (const row of allRows) {
    if (!row.entity_id) continue;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const entityId = String(row.entity_id);

    // Capture employee number from any row
    const empNum = rd['num_empleado'] as string | number | undefined;
    if (empNum !== undefined && empNum !== null) {
      entityIdToEmpNum.set(entityId, String(empNum));
    }

    // Capture store from rows that have it
    if (!entityIdToStore.has(entityId)) {
      const storeVal = rd['num_tienda'] ?? rd['No_Tienda'] ?? rd['storeId'];
      if (storeVal !== undefined && storeVal !== null) {
        entityIdToStore.set(entityId, String(storeVal));
      }
    }

    // Capture volume tier from LLave
    if (!entityIdToTier.has(entityId)) {
      const llave = rd['LLave Tamaño de Tienda'] as string | undefined;
      if (llave) {
        const parts = String(llave).split('-');
        if (parts.length >= 2) {
          entityIdToTier.set(entityId, parts[parts.length - 1]);
        }
      }
    }

    // Capture Rango de Tienda
    if (!entityIdToRango.has(entityId)) {
      const rango = (rd['Rango de Tienda'] ?? rd['Rango_Tienda']) as string | undefined;
      if (rango) {
        entityIdToRango.set(entityId, String(rango));
      }
    }
  }

  console.log(`Entities with employee number: ${entityIdToEmpNum.size}`);
  console.log(`Entities with store from row_data: ${entityIdToStore.size}`);
  console.log(`Entities with volume tier from LLave: ${entityIdToTier.size}`);
  console.log(`Entities with Rango de Tienda: ${entityIdToRango.size}`);

  // Build employee number → store mapping (for entities that HAVE store info)
  const empNumToStore = new Map<string, string>();
  const empNumToTier = new Map<string, string>();
  const empNumToRango = new Map<string, string>();

  for (const [entityId, empNum] of Array.from(entityIdToEmpNum.entries())) {
    const store = entityIdToStore.get(entityId);
    if (store) empNumToStore.set(empNum, store);
    const tier = entityIdToTier.get(entityId);
    if (tier) empNumToTier.set(empNum, tier);
    const rango = entityIdToRango.get(entityId);
    if (rango) empNumToRango.set(empNum, rango);
  }

  console.log(`\nEmployee→store mapping: ${empNumToStore.size} employees with store`);
  console.log(`Employee→tier mapping: ${empNumToTier.size} employees with volume tier`);
  console.log(`Employee→rango mapping: ${empNumToRango.size} employees with rango`);

  // Now extend: for entities that DON'T have store but DO have employee number,
  // look up the store from the employee mapping
  let storesMissing = 0;
  let storesResolved = 0;
  for (const [entityId, empNum] of Array.from(entityIdToEmpNum.entries())) {
    if (entityIdToStore.has(entityId)) continue;
    storesMissing++;
    const mappedStore = empNumToStore.get(empNum);
    if (mappedStore) {
      entityIdToStore.set(entityId, mappedStore);
      storesResolved++;
    }
  }

  console.log(`\nEntities missing store (had emp num): ${storesMissing}`);
  console.log(`Stores resolved via employee→store bridge: ${storesResolved}`);
  console.log(`Total entities with store after bridging: ${entityIdToStore.size}`);

  // ═══════════════════════════════════════════════════════════════
  // Step 2: Update entity metadata with store_id
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Step 2: Update entity metadata ---\n');

  // Fetch all entities
  const entityRows = await paginatedSelect('entities', 'id, external_id, metadata', [
    { op: 'eq', col: 'tenant_id', val: tenantId },
  ]);
  console.log(`Total entities: ${entityRows.length}`);

  let metaUpdated = 0;
  let metaSkipped = 0;
  const BATCH = 200;
  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];

  for (const ent of entityRows) {
    const entityId = String(ent.id);
    const store = entityIdToStore.get(entityId);
    if (!store) { metaSkipped++; continue; }

    const existingMeta = (ent.metadata ?? {}) as Record<string, unknown>;
    if (existingMeta.store_id === store) { metaSkipped++; continue; }

    const tier = entityIdToTier.get(entityId) ?? empNumToTier.get(entityIdToEmpNum.get(entityId) ?? '') ?? null;
    const rango = entityIdToRango.get(entityId) ?? empNumToRango.get(entityIdToEmpNum.get(entityId) ?? '') ?? null;

    const newMeta = {
      ...existingMeta,
      store_id: store,
      ...(tier ? { volume_tier: tier } : {}),
      ...(rango ? { store_range: rango } : {}),
    };

    updates.push({ id: entityId, metadata: newMeta });
  }

  console.log(`Entity metadata updates needed: ${updates.length}`);
  console.log(`Entity metadata already up-to-date or no store: ${metaSkipped}`);

  // Apply updates in batches
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const upd of batch) {
      const { error } = await supabase
        .from('entities')
        .update({ metadata: upd.metadata })
        .eq('id', upd.id)
        .eq('tenant_id', tenantId);
      if (error) {
        console.error(`Error updating entity ${upd.id}:`, error.message);
      } else {
        metaUpdated++;
      }
    }
    if ((i + BATCH) % 2000 === 0) {
      console.log(`  Updated ${Math.min(i + BATCH, updates.length)}/${updates.length} entities...`);
    }
  }

  console.log(`Entity metadata updated: ${metaUpdated}`);

  // ═══════════════════════════════════════════════════════════════
  // Step 3: Update committed_data row_data for BCP rows
  // The engine reads store from committed_data.row_data
  // BCP rows don't have num_tienda — add it
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Step 3: Update BCP committed_data rows with num_tienda ---\n');

  // Find BCP rows (entity_id NOT NULL, missing num_tienda/No_Tienda in row_data)
  let bcpUpdated = 0;
  let bcpSkipped = 0;
  let bcpNoStore = 0;

  // Process all entity rows that lack store key
  const rowsToUpdate: Array<{ id: string; row_data: Record<string, unknown> }> = [];

  for (const row of allRows) {
    if (!row.entity_id) continue;
    const rd = (row.row_data ?? {}) as Record<string, unknown>;
    const entityId = String(row.entity_id);

    // Skip rows that already have a store key
    if (rd['num_tienda'] !== undefined || rd['No_Tienda'] !== undefined || rd['storeId'] !== undefined) {
      bcpSkipped++;
      continue;
    }

    // Look up store for this entity
    const store = entityIdToStore.get(entityId);
    if (!store) {
      bcpNoStore++;
      continue;
    }

    // Add num_tienda to row_data
    const newRowData = { ...rd, num_tienda: isNaN(Number(store)) ? store : Number(store) };
    rowsToUpdate.push({ id: String(row.id), row_data: newRowData });
  }

  console.log(`BCP rows already have store key: ${bcpSkipped}`);
  console.log(`BCP rows with no store available: ${bcpNoStore}`);
  console.log(`BCP rows to update with num_tienda: ${rowsToUpdate.length}`);

  // Apply committed_data updates in batches
  for (let i = 0; i < rowsToUpdate.length; i += BATCH) {
    const batch = rowsToUpdate.slice(i, i + BATCH);
    for (const upd of batch) {
      const { error } = await supabase
        .from('committed_data')
        .update({ row_data: upd.row_data })
        .eq('id', upd.id);
      if (error) {
        console.error(`Error updating committed_data ${upd.id}:`, error.message);
      } else {
        bcpUpdated++;
      }
    }
    if ((i + BATCH) % 5000 === 0 || i + BATCH >= rowsToUpdate.length) {
      console.log(`  Updated ${Math.min(i + BATCH, rowsToUpdate.length)}/${rowsToUpdate.length} committed_data rows...`);
    }
  }

  console.log(`\nCommitted_data rows updated: ${bcpUpdated}`);

  // ═══════════════════════════════════════════════════════════════
  // Step 4: Verify
  // ═══════════════════════════════════════════════════════════════
  console.log('\n--- Verification ---\n');

  // Check entity metadata
  const { data: verifyEnts } = await supabase
    .from('entities')
    .select('metadata')
    .eq('tenant_id', tenantId)
    .not('metadata', 'is', null)
    .limit(1000);

  let verifyHasStore = 0;
  for (const e of verifyEnts ?? []) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (meta.store_id) verifyHasStore++;
  }

  console.log(`Entity metadata verification (sample of ${verifyEnts?.length ?? 0}): ${verifyHasStore} have store_id`);

  // Check committed_data
  const { data: verifyData } = await supabase
    .from('committed_data')
    .select('row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', eneroPeriod.id)
    .not('entity_id', 'is', null)
    .limit(1000);

  let verifyHasNumTienda = 0;
  for (const d of verifyData ?? []) {
    const rd = (d.row_data ?? {}) as Record<string, unknown>;
    if (rd.num_tienda !== undefined || rd.No_Tienda !== undefined) verifyHasNumTienda++;
  }

  console.log(`Committed_data verification (sample of ${verifyData?.length ?? 0}): ${verifyHasNumTienda} have store key`);

  // Check total entities with store
  const totalWithStore = await paginatedSelect('entities', 'id, metadata', [
    { op: 'eq', col: 'tenant_id', val: tenantId },
  ]);
  let finalHasStore = 0;
  for (const e of totalWithStore) {
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    if (meta.store_id) finalHasStore++;
  }

  console.log(`\nFinal: ${finalHasStore} / ${totalWithStore.length} entities have store_id in metadata`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1 COMPLETE');
  console.log(`PG-01: ${finalHasStore > 0 ? 'PASS' : 'FAIL'} — ${finalHasStore} entities have store_id`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
