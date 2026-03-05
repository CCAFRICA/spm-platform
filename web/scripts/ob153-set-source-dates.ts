// OB-153: Set source_date on committed_data from row_data date fields
// This enables the OB-152 hybrid path to filter by period
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function excelSerialToDate(serial: number): string | null {
  const date = new Date((serial - 25569) * 86400 * 1000);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function mesAnoToDate(mes: number, ano: number): string | null {
  if (ano < 2020 || ano > 2030 || mes < 1 || mes > 12) return null;
  const lastDay = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

async function run() {
  let updated = 0;
  let offset = 0;

  while (true) {
    const { data: rows, error } = await sb.from('committed_data')
      .select('id, data_type, row_data')
      .eq('tenant_id', T)
      .is('source_date', null)
      .range(offset, offset + 999);

    if (error) {
      console.error('Query error:', error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    const updates: Array<{ id: string; source_date: string }> = [];

    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      let sourceDate: string | null = null;

      // Strategy 1: Fecha Corte (Excel serial) — proveedores, base_clientes_nuevos
      const fechaCorte = rd['Fecha Corte'];
      if (typeof fechaCorte === 'number' && fechaCorte > 40000 && fechaCorte < 50000) {
        sourceDate = excelSerialToDate(fechaCorte);
      }

      // Strategy 2: Mes + Año — base_venta_individual, base_club_proteccion
      if (!sourceDate) {
        const mes = rd['Mes'];
        const ano = rd['Año'];
        if (typeof mes === 'number' && typeof ano === 'number') {
          sourceDate = mesAnoToDate(mes, ano);
        }
      }

      if (sourceDate) {
        updates.push({ id: row.id, source_date: sourceDate });
      }
    }

    // Batch update
    if (updates.length > 0) {
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        for (const u of batch) {
          const { error: upErr } = await sb.from('committed_data')
            .update({ source_date: u.source_date })
            .eq('id', u.id);
          if (upErr) {
            console.error('Update error:', upErr.message);
          }
        }
      }
      updated += updates.length;
    }

    console.log(`Processed ${offset + rows.length} rows, ${updated} updated with source_date`);
    offset += rows.length;
    if (rows.length < 1000) break;
  }

  console.log(`\nDone. Total updated: ${updated}`);

  // Verify
  const { count } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);
  console.log(`Rows with source_date: ${count}`);
}

run();
