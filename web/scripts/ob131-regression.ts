/**
 * OB-131 Regression check — verify LAB calculation totals unchanged
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';

interface Expected {
  name: string;
  total: number;
  tolerance: number;
}

const EXPECTED: Expected[] = [
  { name: 'Deposit Growth Incentive', total: 601000.00, tolerance: 0.01 },
  { name: 'Consumer Lending Commission', total: 6540774.36, tolerance: 0.10 },
  { name: 'Mortgage Origination Bonus', total: 989937.41, tolerance: 0.10 },
  { name: 'CFG Insurance Referral', total: 366600.00, tolerance: 0.01 },
];

async function main() {
  console.log('=== OB-131 Regression Check ===\n');

  const { data: results } = await sb
    .from('calculation_results')
    .select('rule_set_id, total_payout')
    .eq('tenant_id', LAB);

  if (!results || results.length === 0) {
    console.log('ERROR: No calculation results');
    process.exit(1);
  }

  // Group by rule_set
  const byPlan = new Map<string, { count: number; total: number }>();
  for (const r of results) {
    const existing = byPlan.get(r.rule_set_id) || { count: 0, total: 0 };
    existing.count++;
    existing.total += Number(r.total_payout) || 0;
    byPlan.set(r.rule_set_id, existing);
  }

  // Get plan names
  const rsIds = Array.from(byPlan.keys());
  const nameMap = new Map<string, string>();
  for (const id of rsIds) {
    const { data } = await sb.from('rule_sets').select('id, name').eq('id', id).single();
    if (data) nameMap.set(data.id, data.name);
  }

  let allPass = true;
  for (const [rsId, stats] of byPlan.entries()) {
    const name = nameMap.get(rsId) || 'unknown';
    const expected = EXPECTED.find(e => name.includes(e.name.split(' ')[0]));

    if (expected) {
      const delta = Math.abs(stats.total - expected.total);
      const pass = delta <= expected.tolerance;
      console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}: ${stats.count} results, $${stats.total.toFixed(2)} (expected $${expected.total.toFixed(2)}, delta $${delta.toFixed(2)})`);
      if (!pass) allPass = false;
    } else {
      console.log(`INFO | ${name}: ${stats.count} results, $${stats.total.toFixed(2)} (no baseline)`);
    }
  }

  console.log(`\nRegression: ${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) process.exit(1);
}

main().catch(console.error);
