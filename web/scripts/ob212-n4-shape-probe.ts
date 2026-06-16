// OB-212 N3/N4 tool-shape probe (read-only): rule_set variant/intent structure + BCL committed_data.
// Run: set -a && source .env.local && set +a && npx tsx scripts/ob212-n4-shape-probe.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const j = (v: unknown, n = 260) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };

async function main() {
  // rule_set components/variants
  const { data: rs } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', BCL).eq('status', 'active').limit(1);
  const r: any = rs?.[0];
  const c = r?.components;
  console.log('=== rule_set', r?.id, `"${r?.name}" ===`);
  console.log('  components typeof:', Array.isArray(c) ? 'array' : typeof c, 'topKeys:', j(c && typeof c === 'object' ? Object.keys(c) : []));
  const variants = c?.variants ?? (Array.isArray(c) ? [{ variantId: '(flat)', components: c }] : []);
  for (const v of variants) {
    console.log(`  variant "${v.variantId}" — ${v.components?.length} components:`);
    (v.components ?? []).forEach((cp: any, i: number) => console.log(`    [${i}] id=${cp.id} name="${cp.name}" order=${cp.order} enabled=${cp.enabled} intentKeys=${j(cp.metadata?.intent ? Object.keys(cp.metadata.intent) : 'NONE')}`));
  }

  // committed_data for BCL
  const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log('\n=== committed_data (BCL) count:', count, '===');
  const { data: cd } = await sb.from('committed_data').select('entity_id, period_id, data_type, row_data').eq('tenant_id', BCL).limit(2);
  (cd ?? []).forEach((row: any) => console.log(`  data_type=${row.data_type} entity=${String(row.entity_id).slice(0,8)} period=${String(row.period_id).slice(0,8)} row_data keys=${j(Object.keys(row.row_data ?? {}))}`));
  // does a specific BCL entity have committed_data in period B (a8febd82)?
  const { data: ent } = await sb.from('entities').select('id').eq('tenant_id', BCL).eq('external_id', 'BCL-5027').maybeSingle();
  if (ent) {
    const { count: ec } = await sb.from('committed_data').select('*', { count: 'exact', head: true }).eq('tenant_id', BCL).eq('entity_id', (ent as any).id);
    console.log(`  BCL-5027 (${String((ent as any).id).slice(0,8)}) committed_data rows: ${ec}`);
  }
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
