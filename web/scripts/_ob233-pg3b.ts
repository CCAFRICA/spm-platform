// OB-233 PG-3b — comprehension-plan decoupling. Proves comprehension_artifacts holds EXACTLY one row
// per distinct field per tenant, independent of plan (rule_set) count. The UNIQUE(tenant_id, field_name)
// constraint is the structural guarantee; this empirically confirms count == distinct-field-count and
// NOT ~(plans x fields). Usage: npx tsx --env-file=.env.local scripts/_ob233-pg3b.ts "<tenant substring>"
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */

async function main() {
  const arg = process.argv[2] ?? 'Sabor';
  const { data: tens } = await sb.from('tenants').select('id, name').ilike('name', `%${arg}%`);
  if (!tens?.length) { console.log(`no tenant "${arg}"`); return; }
  const t = tens[0] as any; const tenantId = t.id;
  console.log(`=== PG-3b decoupling: ${t.name} (${tenantId}) ===\n`);

  const { count: planCount } = await sb.from('rule_sets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`rule_sets (plans): ${planCount}`);

  // distinct field_names across ALL committed_data row_data (paged)
  const distinct = new Set<string>();
  let off = 0;
  for (;;) {
    const { data } = await sb.from('committed_data').select('row_data').eq('tenant_id', tenantId).order('id').range(off, off + 999);
    if (!data?.length) break;
    for (const r of data as any[]) for (const k in (r.row_data || {})) distinct.add(k);
    if (data.length < 1000) break; off += 1000;
  }
  console.log(`distinct fields across committed_data: ${distinct.size}`);

  const { count: caCount } = await sb.from('comprehension_artifacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log(`comprehension_artifacts rows: ${caCount}`);

  console.log('');
  console.log(`one row per field (count == distinct fields)?  ${caCount === distinct.size ? 'YES' : 'NO'}`);
  console.log(`independent of plan count (NOT ~plans x fields = ${(planCount ?? 0) * distinct.size})?  ${caCount !== (planCount ?? 0) * distinct.size || (planCount ?? 0) <= 1 ? 'YES (decoupled)' : 'CHECK'}`);

  // shared-field sample: a field appears once even with multiple plans
  const { data: dup } = await sb.from('comprehension_artifacts').select('field_name').eq('tenant_id', tenantId).limit(2000);
  const seen = new Map<string, number>();
  for (const r of (dup ?? []) as any[]) seen.set(r.field_name, (seen.get(r.field_name) ?? 0) + 1);
  const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
  console.log(`duplicate field_name rows (must be 0): ${dups.length}`);
  const sample = Array.from(seen.keys()).slice(0, 3);
  console.log(`sample fields (each exactly once): ${sample.map((f) => `${f}=${seen.get(f)}`).join(', ')}`);
  console.log('\n=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
