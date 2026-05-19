// HF-238 Phase 4: Per-tenant per-plan per-period calculation totals report.
// Reads from calculation_results — no interpretation, just verbatim totals.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TENANT_IDS = [
  'e44bbcb1-2710-4880-8c7d-a1bd902720b7', // CRP
  '5035b1e8-0754-4527-b7ec-9f93f85e4c79', // Meridian
  'b1c2d3e4-aaaa-bbbb-cccc-111111111111', // BCL
];

(async () => {
  const { data: tenants } = await sb
    .from('tenants')
    .select('id, name')
    .in('id', TENANT_IDS);

  console.log('=== HF-238 Phase 4 Totals Report ===\n');

  for (const tid of TENANT_IDS) {
    const tenant = tenants?.find(t => t.id === tid);
    console.log(`────────────────────────────────────────────`);
    console.log(`TENANT: ${tenant?.name ?? tid} (${tid})`);

    const { data: ruleSets } = await sb
      .from('rule_sets')
      .select('id, name, status')
      .eq('tenant_id', tid);

    const { data: periods } = await sb
      .from('periods')
      .select('id, start_date, end_date, period_type, label')
      .eq('tenant_id', tid)
      .order('start_date');

    console.log(`Plans: ${(ruleSets ?? []).length}, Periods: ${(periods ?? []).length}`);

    for (const plan of (ruleSets ?? [])) {
      console.log(`\n  PLAN: ${plan.name}  [${plan.id}]  status=${plan.status}`);

      for (const period of (periods ?? [])) {
        const periodLabel = (period as { label?: string }).label
          ?? `${(period as { start_date: string }).start_date}/${(period as { end_date: string }).end_date}`;

        const { data: results, error } = await sb
          .from('calculation_results')
          .select('entity_id, total_payout, batch_id')
          .eq('tenant_id', tid)
          .eq('rule_set_id', plan.id)
          .eq('period_id', period.id);

        if (error) {
          console.log(`    ${periodLabel}: ERROR ${error.message}`);
          continue;
        }
        if (!results || results.length === 0) {
          console.log(`    ${periodLabel}: no results`);
          continue;
        }
        const total = results.reduce((s, r: { total_payout: number | null }) => s + (Number(r.total_payout) || 0), 0);
        const distinctBatches = Array.from(new Set(results.map((r: { batch_id: string | null }) => r.batch_id)));
        console.log(`    ${periodLabel}: entities=${results.length} total=${total.toFixed(2)} batches=${distinctBatches.length}`);
      }
    }
  }

  console.log(`\n=== Done ===`);
})();
