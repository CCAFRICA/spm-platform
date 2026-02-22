import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  // Fetch all periods
  const { data: periods, error } = await supabase
    .from('periods')
    .select('*')
    .order('canonical_key', { ascending: true });

  if (error) {
    console.error('Failed to fetch periods:', error.message);
    return;
  }

  console.log(`\n=== PERIOD AUDIT: ${periods?.length ?? 0} periods ===\n`);

  let needsRepair = 0;

  for (const p of (periods ?? [])) {
    const hasStart = p.start_date !== null && p.start_date !== undefined;
    const hasEnd = p.end_date !== null && p.end_date !== undefined;
    const status = (hasStart && hasEnd) ? 'OK' : 'MISSING_DATES';

    if (status === 'MISSING_DATES') {
      needsRepair++;
      // Try to compute dates from canonical_key (format: YYYY-MM)
      const parts = p.canonical_key?.match(/^(\d{4})-(\d{2})$/);
      if (parts) {
        const year = parseInt(parts[1]);
        const month = parseInt(parts[2]);
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        console.log(`REPAIR: ${p.canonical_key} → start=${startDate}, end=${endDate} (tenant=${p.tenant_id})`);

        const { error: updateErr } = await supabase
          .from('periods')
          .update({ start_date: startDate, end_date: endDate })
          .eq('id', p.id);

        if (updateErr) {
          console.log(`  FAILED: ${updateErr.message}`);
        } else {
          console.log('  REPAIRED');
        }
      } else {
        console.log(`CANNOT REPAIR: ${p.id} canonical_key=${p.canonical_key} (unrecognized format)`);
      }
    } else {
      console.log(`OK: ${p.canonical_key} → ${p.start_date} to ${p.end_date} (tenant=${p.tenant_id})`);
    }
  }

  console.log(`\n=== SUMMARY: ${periods?.length ?? 0} periods, ${needsRepair} needed repair ===`);
}

run().catch(console.error);
