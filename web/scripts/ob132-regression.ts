import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
  const MBC = '33334444-5555-6666-7777-888899990000';

  const { data: labData } = await sb
    .from('calculation_results')
    .select('rule_set_id, total_payout')
    .eq('tenant_id', LAB);

  const labByPlan = new Map<string, { count: number; total: number }>();
  for (const r of labData || []) {
    const key = r.rule_set_id;
    const prev = labByPlan.get(key) || { count: 0, total: 0 };
    labByPlan.set(key, { count: prev.count + 1, total: prev.total + (r.total_payout || 0) });
  }

  const { data: rulesets } = await sb
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', LAB);
  
  const nameMap = new Map<string, string>();
  for (const rs of rulesets || []) nameMap.set(rs.id, rs.name);

  console.log('=== LAB Regression ===');
  const expected: Record<string, { results: number; total: number }> = {
    'CL': { results: 100, total: 6540774.36 },
    'DG': { results: 48, total: 601000.00 },
    'MO': { results: 56, total: 989937.41 },
    'IR': { results: 64, total: 366600.00 },
  };
  
  for (const [id, stats] of Array.from(labByPlan.entries())) {
    const name = nameMap.get(id) || id.slice(0, 8);
    const shortName = name.split(/[\s-]/)[0].toUpperCase().slice(0, 2);
    const exp = expected[shortName];
    const totalMatch = exp ? Math.abs(stats.total - exp.total) < 0.10 : false;
    const countMatch = exp ? stats.count === exp.results : false;
    console.log(`  ${name}: ${stats.count} results, $${stats.total.toFixed(2)} ${countMatch && totalMatch ? 'PASS' : 'FAIL'}`);
  }

  const { data: mbcData } = await sb
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', MBC);
  
  const mbcTotal = (mbcData || []).reduce((s: number, r: { total_payout: number | null }) => s + (r.total_payout || 0), 0);
  const mbcCount = (mbcData || []).length;
  const mbcPass = mbcCount === 240 && Math.abs(mbcTotal - 3245212.66) < 1.00;
  console.log(`\n=== MBC Regression ===`);
  console.log(`  MBC: ${mbcCount} results, $${mbcTotal.toFixed(2)} ${mbcPass ? 'PASS' : 'FAIL'}`);
}

main().catch(console.error);
