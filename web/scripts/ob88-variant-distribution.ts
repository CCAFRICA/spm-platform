import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';

async function main() {
  // Get latest batch
  const { data: batches } = await sb.from('calculation_batches')
    .select('id').eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false }).limit(1);
  const batchId = batches?.[0]?.id;
  if (!batchId) throw new Error('No batch');

  // Count by variant
  const variantCounts = new Map<string, number>();
  const variantOpticalTotal = new Map<string, number>();
  let page = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('metadata, components')
      .eq('batch_id', batchId)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const md = r.metadata as Record<string, unknown>;
      const variant = String(md?.variant || 'unknown');
      variantCounts.set(variant, (variantCounts.get(variant) || 0) + 1);

      // Get optical payout
      const components = r.components as Array<{ payout: number; componentName?: string }>;
      const optical = components?.find(c => c.componentName?.includes('Optical'));
      if (optical) {
        variantOpticalTotal.set(variant, (variantOpticalTotal.get(variant) || 0) + (optical.payout || 0));
      }
    }
    if (data.length < 1000) break;
    page++;
  }

  console.log('Variant distribution:');
  for (const [v, c] of Array.from(variantCounts.entries())) {
    const optTotal = variantOpticalTotal.get(v) || 0;
    console.log(`  ${v}: ${c} entities, optical total: MX$${Math.round(optTotal).toLocaleString()}`);
  }

  // Expected: if all 172 non-certified got ~50% of certified optical payouts...
  const certCount = variantCounts.get('certified') || 0;
  const nonCertCount = variantCounts.get('non_certified') || 0;
  const certOptical = variantOpticalTotal.get('certified') || 0;
  const nonCertOptical = variantOpticalTotal.get('non_certified') || 0;

  console.log(`\nCertified avg optical: MX$${Math.round(certOptical / certCount)}`);
  console.log(`Non-certified avg optical: MX$${Math.round(nonCertOptical / nonCertCount)}`);
  console.log(`Ratio: ${(nonCertOptical / nonCertCount / (certOptical / certCount) * 100).toFixed(0)}%`);
}

main().catch(console.error);
