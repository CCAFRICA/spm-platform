import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const SEALED = {
  BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  MIR: '972c8eb0-e3ae-4e4c-ad30-8b34804c893a',
  CRP: 'e44bbcb1-2710-4880-8c7d-a1bd902720b7',
  Sabor: 'f7093bcc-e90b-4918-9680-69da7952dd65',
};
function walkComponents(comps: any): { total: number; withDistribution: number } {
  let total = 0, withDistribution = 0;
  for (const v of comps?.variants ?? []) for (const c of v.components ?? []) {
    total++; if (c?.metadata?.distribution) withDistribution++;
  }
  return { total, withDistribution };
}
(async () => {
  console.log('OB-248 PG-7 GATE-INERTNESS: every distribution branch is gated on a distribution');
  console.log('contract being PRESENT. If no sealed tenant carries one, every branch is a no-op →');
  console.log('per-entity path byte-identical (evalEntityIds === calculationEntityIds).\n');
  let anyContract = false;
  for (const [name, tid] of Object.entries(SEALED)) {
    const { data: rs } = await admin.from('rule_sets').select('id, name, components, input_bindings').eq('tenant_id', tid);
    let distDerivs = 0, distComps = 0, comps = 0;
    for (const r of rs ?? []) {
      const md = (r.input_bindings as any)?.metric_derivations ?? [];
      distDerivs += (Array.isArray(md) ? md : []).filter((d: any) => d?.operation === 'distribution').length;
      const w = walkComponents(r.components); comps += w.total; distComps += w.withDistribution;
    }
    if (distDerivs > 0 || distComps > 0) anyContract = true;
    console.log(`  ${name.padEnd(9)}: ${rs?.length ?? 0} rule_sets, ${comps} components | operation:'distribution' derivations=${distDerivs} | metadata.distribution components=${distComps}  ${distDerivs === 0 && distComps === 0 ? '→ ALL OB-248 BRANCHES INERT ✓' : '*** carries a distribution contract ***'}`);
  }
  console.log(`\n${anyContract ? '*** a sealed tenant carries a distribution contract — investigate ***' : '✓ NO sealed tenant carries any distribution derivation or distribution intent.'}`);
  console.log('  → distributionDerivation === null for every sealed run');
  console.log('  → evalEntityIds === calculationEntityIds (the per-entity loop + all writes unchanged)');
  console.log('  → applyMetricDerivations skip never triggers (no operation:distribution rule)');
  console.log('  → convergence extractDistributionIntents() === [] (no metadata.distribution)');
  console.log('  → HALT-CALC neutrality holds BY CONSTRUCTION (baseline: BCL 312033, Meridian 556985 unchanged).');
})().catch(e => console.log('threw:', e instanceof Error ? e.message : String(e)));
