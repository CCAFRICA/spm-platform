import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  let totalUpdated = 0;

  while (true) {
    const { data: rows } = await sb.from('committed_data')
      .select('id, row_data')
      .eq('tenant_id', T)
      .is('source_date', null)
      .limit(500);

    if (!rows || rows.length === 0) break;

    // Group by source_date
    const groups = new Map<string, string[]>();
    let noDateCount = 0;

    for (const r of rows) {
      const rd = r.row_data as Record<string, unknown>;
      let sourceDate: string | null = null;

      // Fecha Corte (Excel serial)
      const fc = rd['Fecha Corte'];
      if (typeof fc === 'number' && fc > 40000 && fc < 50000) {
        sourceDate = new Date((fc - 25569) * 86400 * 1000).toISOString().split('T')[0];
      }

      // Mes + Año
      if (!sourceDate) {
        const mes = rd['Mes'];
        const ano = rd['Año'];
        if (typeof mes === 'number' && typeof ano === 'number' && ano >= 2020) {
          const lastDay = new Date(ano, mes, 0).getDate();
          sourceDate = `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
      }

      if (sourceDate) {
        if (!groups.has(sourceDate)) groups.set(sourceDate, []);
        groups.get(sourceDate)!.push(r.id);
      } else {
        noDateCount++;
      }
    }

    for (const [sd, ids] of Array.from(groups.entries())) {
      const { error } = await sb.from('committed_data')
        .update({ source_date: sd })
        .in('id', ids);
      if (error) console.error(`Error for ${sd}:`, error.message);
      totalUpdated += ids.length;
    }

    if (noDateCount > 0) {
      console.log(`${noDateCount} rows have no date fields — skipping`);
      // Update with a sentinel date so we don't re-process them
      const noDateIds = rows
        .filter(r => {
          const rd = r.row_data as Record<string, unknown>;
          return !rd['Fecha Corte'] && !rd['Mes'];
        })
        .map(r => r.id)
        .slice(0, 500);
      if (noDateIds.length > 0) {
        await sb.from('committed_data')
          .update({ source_date: '1970-01-01' })
          .in('id', noDateIds);
        totalUpdated += noDateIds.length;
      }
    }

    if (totalUpdated % 5000 < 500) {
      console.log(`Updated ${totalUpdated} rows so far...`);
    }
  }

  console.log(`\nTotal updated: ${totalUpdated}`);

  // Final counts
  const { count: withSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .not('source_date', 'is', null);
  const { count: withoutSD } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', T)
    .is('source_date', null);
  console.log(`Final: ${withSD} with source_date, ${withoutSD} without`);
}

run();
