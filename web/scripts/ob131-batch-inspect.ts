import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

async function main() {
  const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

  // Get batches
  const { data: batches, error: bErr } = await sb
    .from('calculation_batches')
    .select('id, rule_set_id, period_id, entity_count, lifecycle_state, summary, created_at')
    .eq('tenant_id', LAB)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (bErr) { console.log('batch error:', bErr); return; }
  console.log('Found', (batches || []).length, 'batches\n');

  // Get rule set names
  const rsIds = Array.from(new Set((batches || []).map((b: any) => b.rule_set_id).filter(Boolean)));
  const rsMap = new Map<string, string>();
  for (const rsId of rsIds) {
    const { data: rs } = await sb.from('rule_sets').select('id, name').eq('id', rsId).single();
    if (rs) rsMap.set(rs.id, rs.name);
  }

  // Get period labels
  const pIds = Array.from(new Set((batches || []).map((b: any) => b.period_id).filter(Boolean)));
  const pMap = new Map<string, string>();
  for (const pId of pIds) {
    const { data: p } = await sb.from('periods').select('id, label, canonical_key').eq('id', pId).single();
    if (p) pMap.set(p.id, p.label || p.canonical_key || 'unknown');
  }

  console.log('=== LAB BATCHES (by plan) ===');
  for (const b of (batches || [])) {
    const total = (b.summary as any)?.total_payout || 0;
    const planName = rsMap.get(b.rule_set_id) || 'unknown';
    const periodLabel = pMap.get(b.period_id) || 'unknown';
    console.log(`${planName} | ${periodLabel} | ${b.entity_count} entities | $${total.toLocaleString()} | batch:${b.id.slice(0, 8)} | ${b.lifecycle_state}`);
  }

  // Also get calculation_results summary per batch
  console.log('\n=== CALCULATION RESULTS PER BATCH ===');
  for (const b of (batches || [])) {
    const { data: results } = await sb
      .from('calculation_results')
      .select('total_payout')
      .eq('batch_id', b.id)
      .eq('tenant_id', LAB);

    const count = (results || []).length;
    const sum = (results || []).reduce((acc: number, r: any) => acc + (r.total_payout || 0), 0);
    const planName = rsMap.get(b.rule_set_id) || 'unknown';
    console.log(`${planName} | ${count} results | $${sum.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  }
}

main().catch(console.error);
