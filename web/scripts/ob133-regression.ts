// OB-133 Regression check — LAB tenant calculation results
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LAB = 'a630404c-0777-4f6d-b760-b8a190ecd63c';
const MBC = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

async function check(tenantId: string, label: string) {
  const { data, error } = await sb
    .from('calculation_results')
    .select('total_payout, rule_sets(name)')
    .eq('tenant_id', tenantId);

  if (error) {
    console.log(`${label}: ERROR — ${error.message}`);
    return;
  }

  const byPlan: Record<string, { count: number; total: number }> = {};
  for (const r of data || []) {
    const name = (r.rule_sets as { name: string } | null)?.name || '?';
    if (!byPlan[name]) byPlan[name] = { count: 0, total: 0 };
    byPlan[name].count++;
    byPlan[name].total += r.total_payout;
  }

  console.log(`\n=== ${label} ===`);
  let grandCount = 0;
  let grandTotal = 0;
  for (const [name, v] of Object.entries(byPlan)) {
    console.log(`  ${name}: ${v.count} results, $${v.total.toFixed(2)}`);
    grandCount += v.count;
    grandTotal += v.total;
  }
  console.log(`  TOTAL: ${grandCount} results, $${grandTotal.toFixed(2)}`);
}

async function main() {
  await check(LAB, 'LAB (Consumer Advisors)');
  await check(MBC, 'MBC (Mexican Bank Co)');
}

main().catch(console.error);
