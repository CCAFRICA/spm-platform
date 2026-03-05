// OB-153: Fast batch source_date updates using data_type + value grouping
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Strategy 1: proveedores — Fecha Corte is Excel serial
  // Get unique Fecha Corte values
  const { data: fcSample } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
    .limit(100);

  const fechaCorteValues = new Set<number>();
  for (const r of fcSample || []) {
    const rd = r.row_data as Record<string, unknown>;
    const fc = rd['Fecha Corte'];
    if (typeof fc === 'number' && fc > 40000 && fc < 50000) {
      fechaCorteValues.add(fc);
    }
  }
  console.log('Unique Fecha Corte values in proveedores:', Array.from(fechaCorteValues));

  // For each unique Fecha Corte, use SQL RPC to bulk-update
  // We'll use the Supabase REST API with a filter
  for (const fc of Array.from(fechaCorteValues)) {
    const sourceDate = new Date((fc - 25569) * 86400 * 1000).toISOString().split('T')[0];
    console.log(`Setting source_date=${sourceDate} for Fecha Corte=${fc} in proveedores...`);

    // Use containedBy filter on row_data JSONB
    const { error, count } = await sb.from('committed_data')
      .update({ source_date: sourceDate })
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores')
      .is('source_date', null)
      .filter('row_data->>Fecha Corte', 'eq', String(fc));

    console.log(`  Updated. Error: ${error?.message || 'none'}`);
  }

  // Same for base_clientes_nuevos
  const { data: fcSample2 } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', T)
    .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos')
    .limit(100);

  const fechaCorteValues2 = new Set<number>();
  for (const r of fcSample2 || []) {
    const rd = r.row_data as Record<string, unknown>;
    const fc = rd['Fecha Corte'];
    if (typeof fc === 'number' && fc > 40000 && fc < 50000) {
      fechaCorteValues2.add(fc);
    }
  }
  console.log('\nUnique Fecha Corte values in base_clientes_nuevos:', Array.from(fechaCorteValues2));

  for (const fc of Array.from(fechaCorteValues2)) {
    const sourceDate = new Date((fc - 25569) * 86400 * 1000).toISOString().split('T')[0];
    console.log(`Setting source_date=${sourceDate} for Fecha Corte=${fc} in base_clientes_nuevos...`);

    const { error } = await sb.from('committed_data')
      .update({ source_date: sourceDate })
      .eq('tenant_id', T)
      .eq('data_type', 'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos')
      .is('source_date', null)
      .filter('row_data->>Fecha Corte', 'eq', String(fc));

    console.log(`  Error: ${error?.message || 'none'}`);
  }

  // Strategy 2: base_venta_individual and base_club_proteccion — use Mes/Año
  for (const dt of [
    'backttest_optometrista_mar2025_proveedores__base_venta_individual',
    'backttest_optometrista_mar2025_proveedores__base_club_proteccion',
  ]) {
    // Find unique Mes/Año combos
    const { data: mesAnoSample } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', T)
      .eq('data_type', dt)
      .limit(500);

    const combos = new Set<string>();
    for (const r of mesAnoSample || []) {
      const rd = r.row_data as Record<string, unknown>;
      const mes = rd['Mes'];
      const ano = rd['Año'];
      if (typeof mes === 'number' && typeof ano === 'number') {
        combos.add(`${mes}-${ano}`);
      }
    }

    console.log(`\n${dt}: unique Mes/Año combos:`, Array.from(combos));

    for (const combo of Array.from(combos)) {
      const [mesStr, anoStr] = combo.split('-');
      const mes = parseInt(mesStr);
      const ano = parseInt(anoStr);
      const lastDay = new Date(ano, mes, 0).getDate();
      const sourceDate = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      console.log(`Setting source_date=${sourceDate} for Mes=${mes} Año=${ano} in ${dt.split('__')[1] || dt}...`);

      const { error } = await sb.from('committed_data')
        .update({ source_date: sourceDate })
        .eq('tenant_id', T)
        .eq('data_type', dt)
        .is('source_date', null)
        .filter('row_data->>Mes', 'eq', String(mes))
        .filter('row_data->>Año', 'eq', String(ano));

      console.log(`  Error: ${error?.message || 'none'}`);
    }
  }

  // Verify
  const { count: withSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);

  const { count: withoutSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .is('source_date', null);

  console.log(`\nFinal: ${withSD} rows with source_date, ${withoutSD} without`);
}

run();
