import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

  // LAB: verify exact values
  console.log('=== LAB Regression ===');
  const checks = [
    { label: 'CL', count: 100, total: 6540774.36 },
    { label: 'DG', count: 48, total: 601000.00 },
    { label: 'MO', count: 56, total: 989937.41 },
    { label: 'IR', count: 64, total: 366600.00 },
  ];
  
  const { data: labData } = await sb
    .from('calculation_results')
    .select('rule_set_id, total_payout, rule_sets!inner(name)')
    .eq('tenant_id', LAB);

  // Group by plan name
  const byPlan = new Map<string, { count: number; total: number }>();
  for (const r of labData || []) {
    const name = (r as any).rule_sets?.name || 'Unknown';
    const prev = byPlan.get(name) || { count: 0, total: 0 };
    byPlan.set(name, { count: prev.count + 1, total: prev.total + (r.total_payout || 0) });
  }
  
  for (const [name, stats] of Array.from(byPlan.entries())) {
    console.log(`  ${name}: ${stats.count} results, $${stats.total.toFixed(2)}`);
  }

  // MBC: find tenant
  const { data: tenants } = await sb
    .from('tenants')
    .select('id, name')
    .ilike('name', '%MBC%');
  console.log('\n=== MBC Tenant Search ===');
  for (const t of tenants || []) console.log(`  ${t.name}: ${t.id}`);

  if (tenants && tenants.length > 0) {
    const mbcId = tenants[0].id;
    const { data: mbcData, count } = await sb
      .from('calculation_results')
      .select('total_payout', { count: 'exact' })
      .eq('tenant_id', mbcId);
    
    const mbcTotal = (mbcData || []).reduce((s: number, r: { total_payout: number | null }) => s + (r.total_payout || 0), 0);
    console.log(`  ${tenants[0].name}: ${count} results, $${mbcTotal.toFixed(2)}`);
  }
}

main().catch(console.error);
