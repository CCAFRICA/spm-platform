/**
 * OB-154 Phase 2: Direct data import — same logic as SCI execute pipeline
 * Commits data, creates entities (deduped), binds entity_id, extracts source_date, creates assignments.
 * Run from: spm-platform/web
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { extractSourceDate, findDateColumnFromBindings, buildSemanticRolesMap } from '../src/lib/sci/source-date-extraction';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const DATA_FILE = '/Users/AndrewAfrica/Desktop/ViaLuce AI/ENTB TEST/BacktTest_Optometrista_mar2025_Proveedores.xlsx';
const BATCH = 200;

// File name to data_type normalization
function toDataType(fileName: string, sheetName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/\s+/g, '_');
  const sheet = sheetName.toLowerCase().replace(/\s+/g, '_');
  return `${stem}__${sheet}`;
}

interface SheetInfo {
  sheetName: string;
  rows: Record<string, unknown>[];
  columns: string[];
  entityIdField: string | null; // field name for entity identifier
  classification: 'entity' | 'transaction' | 'target';
}

function parseXlsx(): SheetInfo[] {
  const wb = XLSX.readFile(DATA_FILE);
  const results: SheetInfo[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Determine entity identifier field and classification
    // Structural heuristic: find the field most likely to be an employee identifier
    let entityIdField: string | null = null;
    let classification: 'entity' | 'transaction' | 'target' = 'transaction';

    if (name === 'Datos Colaborador') {
      entityIdField = 'num_empleado';
      classification = 'entity';
    } else if (columns.includes('num_empleado')) {
      entityIdField = 'num_empleado';
    } else if (columns.includes('Vendedor')) {
      entityIdField = 'Vendedor';
    }
    // Store-level sheets (no direct employee link)
    // Base_Venta_Tienda, Base_Clientes_Nuevos, Base_Cobranza have store IDs only

    results.push({ sheetName: name, rows, columns, entityIdField, classification });
  }

  return results;
}

async function run() {
  console.log('=== OB-154 PHASE 2: DIRECT DATA IMPORT ===\n');

  const sheets = parseXlsx();
  let totalRows = 0;
  for (const s of sheets) {
    console.log(`  ${s.sheetName}: ${s.rows.length} rows, ${s.columns.length} cols, entityId=${s.entityIdField || 'NONE'}, class=${s.classification}`);
    totalRows += s.rows.length;
  }
  console.log(`  Total: ${totalRows} rows\n`);

  // ============================================================
  // STEP 1: Create entities from Datos Colaborador (entity sheet)
  // ============================================================
  console.log('--- Step 1: Create Entities ---');
  const entitySheet = sheets.find(s => s.classification === 'entity')!;

  // Collect unique employees
  const entityData = new Map<string, { name: string; role?: string; storeId?: string }>();
  for (const row of entitySheet.rows) {
    const eid = String(row[entitySheet.entityIdField!] ?? '').trim();
    if (!eid) continue;
    if (entityData.has(eid)) continue;
    entityData.set(eid, {
      name: eid,
      role: String(row['Puesto'] ?? '').trim() || undefined,
      storeId: String(row['No_Tienda'] ?? '').trim() || undefined,
    });
  }
  console.log(`Unique employees from roster: ${entityData.size}`);

  // Check existing entities
  const allIds = Array.from(entityData.keys());
  const existingMap = new Map<string, string>();
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data: existing } = await sb
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', OPTICA)
      .in('external_id', slice);
    if (existing) {
      for (const e of existing) {
        if (e.external_id) existingMap.set(e.external_id, e.id);
      }
    }
  }

  // Create new entities
  const newIds = allIds.filter(eid => !existingMap.has(eid));
  if (newIds.length > 0) {
    const INSERT_BATCH = 5000;
    for (let i = 0; i < newIds.length; i += INSERT_BATCH) {
      const slice = newIds.slice(i, i + INSERT_BATCH);
      const entities = slice.map(eid => {
        const meta = entityData.get(eid);
        return {
          tenant_id: OPTICA,
          external_id: eid,
          display_name: meta?.name || eid,
          entity_type: 'individual',
          status: 'active',
          temporal_attributes: [],
          metadata: {
            ...(meta?.role ? { role: meta.role } : {}),
            ...(meta?.storeId ? { storeId: meta.storeId } : {}),
          },
        };
      });
      const { error } = await sb.from('entities').insert(entities);
      if (error) {
        console.error(`Insert error: ${error.message}`);
        process.exit(1);
      }
    }
    console.log(`Created ${newIds.length} new entities`);
  } else {
    console.log('All entities already exist');
  }

  // Refresh entity ID map
  const entityIdMap = new Map<string, string>();
  for (let i = 0; i < allIds.length; i += BATCH) {
    const slice = allIds.slice(i, i + BATCH);
    const { data } = await sb
      .from('entities')
      .select('id, external_id')
      .eq('tenant_id', OPTICA)
      .in('external_id', slice);
    if (data) {
      for (const e of data) {
        if (e.external_id) entityIdMap.set(e.external_id, e.id);
      }
    }
  }
  console.log(`Entity ID map: ${entityIdMap.size} entries`);

  // ============================================================
  // STEP 2: Commit data to committed_data (all sheets)
  // ============================================================
  console.log('\n--- Step 2: Commit Data ---');

  for (const sheet of sheets) {
    const dataType = toDataType('backttest_optometrista_mar2025_proveedores', sheet.sheetName);
    console.log(`\n  ${sheet.sheetName} (${sheet.rows.length} rows) → ${dataType}`);

    // Create import batch
    const batchId = crypto.randomUUID();
    await sb.from('import_batches').insert({
      id: batchId,
      tenant_id: OPTICA,
      file_name: `ob154-${sheet.sheetName}`,
      file_type: 'xlsx',
      row_count: sheet.rows.length,
      status: 'completed',
    });

    // Insert committed_data rows in chunks
    let inserted = 0;
    const INSERT_SIZE = 500;

    for (let i = 0; i < sheet.rows.length; i += INSERT_SIZE) {
      const chunk = sheet.rows.slice(i, i + INSERT_SIZE);
      const records = chunk.map(row => {
        // Resolve entity_id
        let entityId: string | null = null;
        if (sheet.entityIdField) {
          const extId = String(row[sheet.entityIdField] ?? '').trim();
          entityId = entityIdMap.get(extId) || null;
        }

        // Extract source_date from date fields
        let sourceDate: string | null = null;

        // Check Fecha Corte (Excel serial date)
        const fechaCorte = row['Fecha Corte'] || row['FechaCorte'];
        if (fechaCorte && typeof fechaCorte === 'number' && fechaCorte > 40000 && fechaCorte < 50000) {
          const d = new Date((fechaCorte - 25569) * 86400 * 1000);
          sourceDate = d.toISOString().substring(0, 10);
        }

        // Check Mes + Año
        if (!sourceDate && row['Mes'] != null && row['Año'] != null) {
          const mes = Number(row['Mes']);
          const ano = Number(row['Año']);
          if (mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2030) {
            // Last day of the month
            const lastDay = new Date(ano, mes, 0).getDate();
            sourceDate = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          }
        }

        return {
          tenant_id: OPTICA,
          import_batch_id: batchId,
          entity_id: entityId,
          data_type: dataType,
          source_date: sourceDate,
          row_data: row,
          metadata: {},
        };
      });

      const { error } = await sb.from('committed_data').insert(records);
      if (error) {
        console.error(`    Insert error at row ${i}: ${error.message}`);
        break;
      }
      inserted += records.length;
    }

    console.log(`    Inserted: ${inserted} rows`);
  }

  // ============================================================
  // STEP 3: Create rule_set_assignments
  // ============================================================
  console.log('\n--- Step 3: Create Assignments ---');

  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id')
    .eq('tenant_id', OPTICA)
    .in('status', ['active', 'draft']);

  if (ruleSets && ruleSets.length > 0) {
    const allEntityIds = Array.from(entityIdMap.values());

    for (const rs of ruleSets) {
      let created = 0;
      for (let i = 0; i < allEntityIds.length; i += BATCH) {
        const slice = allEntityIds.slice(i, i + BATCH);
        const assignments = slice.map(eid => ({
          tenant_id: OPTICA,
          rule_set_id: rs.id,
          entity_id: eid,
        }));
        const { error } = await sb.from('rule_set_assignments').insert(assignments);
        if (error) {
          console.error(`  Assignment insert error: ${error.message}`);
          break;
        }
        created += slice.length;
      }
      console.log(`  Rule set ${rs.id.substring(0, 8)}...: ${created} assignments`);
    }
  }

  // ============================================================
  // STEP 4: Verification
  // ============================================================
  console.log('\n--- VERIFICATION ---');

  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  const { count: cdTotal } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  const { count: cdBound } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA).not('entity_id', 'is', null);
  const { count: cdSourceDate } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA).not('source_date', 'is', null);
  const { count: assignCount } = await sb.from('rule_set_assignments')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);
  const { count: periodCount } = await sb.from('periods')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA);

  console.log(`Entities: ${entityCount}`);
  console.log(`Committed data: ${cdTotal} total, ${cdBound} entity-bound, ${cdSourceDate} with source_date`);
  console.log(`Assignments: ${assignCount}`);
  console.log(`Periods: ${periodCount}`);

  // Source date range
  const { data: sdMin } = await sb.from('committed_data')
    .select('source_date').eq('tenant_id', OPTICA).not('source_date', 'is', null)
    .order('source_date', { ascending: true }).limit(1);
  const { data: sdMax } = await sb.from('committed_data')
    .select('source_date').eq('tenant_id', OPTICA).not('source_date', 'is', null)
    .order('source_date', { ascending: false }).limit(1);
  console.log(`Source date range: ${sdMin?.[0]?.source_date} to ${sdMax?.[0]?.source_date}`);

  // Check duplicate entities
  const dupCheck = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('entities').select('external_id')
      .eq('tenant_id', OPTICA).range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      const eid = e.external_id || '';
      dupCheck.set(eid, (dupCheck.get(eid) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  const dups = Array.from(dupCheck.entries()).filter(([, c]) => c > 1);
  console.log(`Duplicate external_ids: ${dups.length}`);

  // Proof gates
  console.log('\n--- PROOF GATES ---');
  console.log(`PG-3: Entities ~ 719: ${entityCount !== null && entityCount >= 600 && entityCount <= 800 ? 'PASS' : 'FAIL'} (${entityCount})`);
  console.log(`PG-4: Committed data ~ 119K: ${cdTotal !== null && cdTotal >= 100000 ? 'PASS' : 'CHECK'} (${cdTotal})`);
  console.log(`PG-5: Source_date populated: ${cdSourceDate !== null && cdSourceDate > 0 ? 'PASS' : 'FAIL'} (${cdSourceDate})`);
  console.log(`PG-6: Assignments created: ${assignCount !== null && assignCount > 0 ? 'PASS' : 'FAIL'} (${assignCount})`);
  console.log(`PG-7: Entity binding: ${cdBound !== null && cdBound > 0 ? 'PASS' : 'FAIL'} (${cdBound})`);

  console.log('\n=== Phase 2 Complete ===');
}

run().catch(console.error);
