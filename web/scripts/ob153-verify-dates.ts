import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Get unique source_dates with counts
  const dates = new Map<string, number>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('source_date')
      .eq('tenant_id', T)
      .not('source_date', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      dates.set(r.source_date, (dates.get(r.source_date) || 0) + 1);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log('Source date distribution:');
  for (const [d, c] of Array.from(dates.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${d}: ${c} rows`);
  }

  // Check existing periods
  const { data: periods } = await sb.from('periods')
    .select('canonical_key, label')
    .eq('tenant_id', T)
    .order('canonical_key');
  console.log('\nExisting periods:', periods?.map(p => p.label).join(', '));

  // Which year-months are covered?
  const ym = new Set<string>();
  for (const d of Array.from(dates.keys())) {
    if (d === '1970-01-01') continue;
    const [y, m] = d.split('-');
    ym.add(`${y}-${m}`);
  }
  console.log('\nYear-months in data:', Array.from(ym).sort().join(', '));

  const existingKeys = new Set(periods?.map(p => p.canonical_key) || []);
  const missing = Array.from(ym).filter(k => !existingKeys.has(k));
  console.log('Missing periods:', missing.join(', ') || 'none');
}

run();
