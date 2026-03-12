import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const RS = 'b1c20001-aaaa-bbbb-cccc-222222222222';

async function go() {
  console.log('Cleaning existing calculation results...');
  for (const table of ['calculation_traces', 'calculation_results', 'entity_period_outcomes', 'calculation_batches']) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', T);
    if (count && count > 0) {
      await sb.from(table).delete().eq('tenant_id', T);
      console.log(`  ${table}: ${count} rows deleted`);
    }
  }

  console.log('\nRecalculating all periods...');
  const { data: periods } = await sb.from('periods').select('id, canonical_key, start_date')
    .eq('tenant_id', T).order('start_date');

  let grandTotal = 0;
  for (const p of periods || []) {
    console.log(`\n  Calculating ${p.canonical_key}...`);
    const res = await fetch('http://localhost:3000/api/calculation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: T, periodId: p.id, ruleSetId: RS }),
    });
    const data = await res.json();
    const total = data.totalPayout || 0;
    grandTotal += total;
    console.log(`    Result: $${total.toLocaleString()} (${data.entityCount || 0} entities)`);
    if (data.error) console.log(`    ERROR: ${data.error}`);
    if (data.log) {
      const relevantLogs = (data.log as string[]).filter((l: string) =>
        l.includes('HF-108') || l.includes('OB-152') || l.includes('committed_data') || l.includes('Resolution path')
      );
      for (const l of relevantLogs) console.log(`    ${l}`);
    }
  }

  console.log(`\n\nGRAND TOTAL: $${grandTotal.toLocaleString()}`);
  console.log(`GT:          $321,381`);
  console.log(`DELTA:       $${grandTotal - 321381}`);
}
go();
