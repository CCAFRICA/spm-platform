// Set source_date in batches of IDs (bypasses JSON filter limitations)
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function setByDataType(dataType: string, sourceDate: string) {
  let offset = 0;
  let total = 0;
  while (true) {
    const { data: rows } = await sb.from('committed_data')
      .select('id')
      .eq('tenant_id', T)
      .eq('data_type', dataType)
      .is('source_date', null)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    const ids = rows.map(r => r.id);
    const { error } = await sb.from('committed_data')
      .update({ source_date: sourceDate })
      .in('id', ids);

    if (error) {
      console.error(`Error updating ${dataType}:`, error.message);
      break;
    }

    total += ids.length;
    // Don't increment offset — rows with NULL source_date will shrink
    if (rows.length < 1000) break;
  }
  return total;
}

async function setByMesAno(dataType: string) {
  // Get ALL unique Mes/Año combos by scanning all rows
  const mesAnoCombos = new Map<string, { mes: number; ano: number }>();
  let offset = 0;
  while (true) {
    const { data: rows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', T)
      .eq('data_type', dataType)
      .is('source_date', null)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const rd = r.row_data as Record<string, unknown>;
      const mes = rd['Mes'];
      const ano = rd['Año'];
      if (typeof mes === 'number' && typeof ano === 'number') {
        mesAnoCombos.set(`${mes}-${ano}`, { mes, ano });
      }
    }

    offset += rows.length;
    if (rows.length < 1000) break;
  }

  console.log(`  Found ${mesAnoCombos.size} unique Mes/Año combos in remaining rows`);

  let total = 0;
  for (const [, { mes, ano }] of Array.from(mesAnoCombos.entries())) {
    const lastDay = new Date(ano, mes, 0).getDate();
    const sourceDate = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Select IDs matching this combo, then update
    let batchOffset = 0;
    while (true) {
      const { data: rows } = await sb.from('committed_data')
        .select('id, row_data')
        .eq('tenant_id', T)
        .eq('data_type', dataType)
        .is('source_date', null)
        .range(batchOffset, batchOffset + 999);

      if (!rows || rows.length === 0) break;

      const ids = rows
        .filter(r => {
          const rd = r.row_data as Record<string, unknown>;
          return rd['Mes'] === mes && rd['Año'] === ano;
        })
        .map(r => r.id);

      if (ids.length > 0) {
        const { error } = await sb.from('committed_data')
          .update({ source_date: sourceDate })
          .in('id', ids);
        if (error) console.error(`Error: ${error.message}`);
        total += ids.length;
      }

      // If all rows matched, don't increment (they'll be filtered by is null next time)
      if (ids.length === rows.length) break;
      batchOffset += rows.length;
      if (rows.length < 1000) break;
    }
    console.log(`    Mes=${mes} Año=${ano} → ${sourceDate}: updated`);
  }
  return total;
}

async function run() {
  // proveedores: ALL have Fecha Corte=45412 → 2024-04-30
  console.log('proveedores...');
  const c1 = await setByDataType('backttest_optometrista_mar2025_proveedores', '2024-04-30');
  console.log(`  Updated ${c1}`);

  // base_clientes_nuevos: has multiple Fecha Corte values, but we already got them
  // Check remaining
  console.log('\nbase_clientes_nuevos...');
  const { count: bcnRemaining } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos')
    .is('source_date', null);
  console.log(`  ${bcnRemaining} remaining without source_date`);

  // base_venta_individual: already all done
  const { count: bviRemaining } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_venta_individual')
    .is('source_date', null);
  console.log(`\nbase_venta_individual: ${bviRemaining} remaining`);

  // base_club_proteccion: needs Mes/Año combos
  console.log('\nbase_club_proteccion...');
  const c4 = await setByMesAno('backttest_optometrista_mar2025_proveedores__base_club_proteccion');
  console.log(`  Updated ${c4}`);

  // Final check
  const { count: withSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);
  const { count: withoutSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .is('source_date', null);

  console.log(`\nFinal: ${withSD} with source_date, ${withoutSD} without`);
}

run();
