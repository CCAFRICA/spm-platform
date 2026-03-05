// OB-153: Create periods for Óptica by scanning Fecha Corte across relevant data_types
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Data types known to have Fecha Corte (from diagnostic)
const DATE_DATA_TYPES = [
  'backttest_optometrista_mar2025_proveedores',
  'backttest_optometrista_mar2025_proveedores__base_clientes_nuevos',
];

async function run() {
  // Check existing periods
  const { data: existing } = await sb.from('periods')
    .select('id, label, canonical_key')
    .eq('tenant_id', OPTICA_ID);

  if (existing && existing.length > 0) {
    console.log('Existing periods:', existing.map(p => p.label).join(', '));
    // Delete them if they look like bogus ones from earlier attempts
    const ids = existing.map(p => p.id);
    console.log(`Deleting ${ids.length} existing periods...`);
    const { error: delErr } = await sb.from('periods').delete().in('id', ids);
    if (delErr) {
      console.error('Delete failed:', delErr.message);
      return;
    }
    console.log('Deleted.');
  }

  // Scan ALL unique Fecha Corte values across both data types
  const periodMap = new Map<string, { year: number; month: number; count: number }>();

  for (const dt of DATE_DATA_TYPES) {
    let offset = 0;
    while (true) {
      const { data: rows } = await sb.from('committed_data')
        .select('row_data')
        .eq('tenant_id', OPTICA_ID)
        .eq('data_type', dt)
        .range(offset, offset + 4999);

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const rd = row.row_data as Record<string, unknown>;
        const val = rd['Fecha Corte'];
        if (typeof val === 'number' && val > 40000 && val < 50000) {
          const date = new Date((val - 25569) * 86400 * 1000);
          if (!isNaN(date.getTime())) {
            const y = date.getUTCFullYear();
            const m = date.getUTCMonth() + 1;
            if (y >= 2020 && y <= 2030) {
              const key = `${y}-${String(m).padStart(2, '0')}`;
              const existing = periodMap.get(key);
              if (existing) existing.count++;
              else periodMap.set(key, { year: y, month: m, count: 1 });
            }
          }
        }
      }

      offset += rows.length;
      if (rows.length < 5000) break;
    }
    console.log(`Scanned ${dt}: offset=${offset}`);
  }

  const sorted = Array.from(periodMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log('\nDetected periods:', sorted.map(([k, v]) => `${k} (${v.count} rows)`).join(', '));

  if (periodMap.size === 0) {
    console.log('No periods detected.');
    return;
  }

  // Create periods
  const newPeriods = sorted.map(([key, data]) => {
    const lastDay = new Date(data.year, data.month, 0).getDate();
    return {
      id: crypto.randomUUID(),
      tenant_id: OPTICA_ID,
      label: `${MONTH_NAMES[data.month - 1]} ${data.year}`,
      period_type: 'monthly',
      status: 'open',
      start_date: `${data.year}-${String(data.month).padStart(2, '0')}-01`,
      end_date: `${data.year}-${String(data.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      canonical_key: key,
      metadata: { source: 'ob153_calculate', recordCount: data.count },
    };
  });

  const { error } = await sb.from('periods').insert(newPeriods);
  if (error) {
    console.error('Period creation failed:', error.message);
    return;
  }

  console.log(`\nCreated ${newPeriods.length} periods:`);
  for (const p of newPeriods) {
    console.log(`  ${p.label} (${p.canonical_key}): ${p.start_date} to ${p.end_date}`);
  }
}

run();
