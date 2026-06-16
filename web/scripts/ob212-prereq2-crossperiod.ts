// OB-212 §B Prereq-2 — confirm cross-period component VALUE differences exist (→ real deltas, no fabrication).
// READ-ONLY. For Meridian (3 periods) and BCL (multiple batches): same entity, per-component values across batches.
// Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob212-prereq2-crossperiod.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : String(id));
const comps = (c: unknown) => (Array.isArray(c) ? c : []).map((x: any) => `${x?.name ?? x?.componentName}=${x?.outputValue ?? x?.payout ?? x?.value}`).join(', ');

async function forTenant(nameLike: string, sampleExternal: string) {
  const { data: t } = await sb.from('tenants').select('id, name').ilike('name', `%${nameLike}%`).maybeSingle();
  const tid = (t as any)?.id; console.log(`\n=== ${(t as any)?.name} (${short(tid)}) — entity ${sampleExternal} per-component across batches ===`);
  if (!tid) return;
  const { data: ent } = await sb.from('entities').select('id').eq('tenant_id', tid).eq('external_id', sampleExternal).maybeSingle();
  const eid = (ent as any)?.id; if (!eid) { console.log(`  entity ${sampleExternal} not found`); return; }
  const { data: rows } = await sb.from('calculation_results').select('batch_id, total_payout, components, period_id').eq('tenant_id', tid).eq('entity_id', eid);
  // resolve period names
  const periodIds = Array.from(new Set((rows ?? []).map((r: any) => r.period_id).filter(Boolean)));
  const { data: periods } = periodIds.length ? await sb.from('periods').select('id, name').in('id', periodIds as string[]) : { data: [] } as any;
  const pname = (id: string) => (periods ?? []).find((p: any) => p.id === id)?.name ?? short(id);
  console.log(`  ${rows?.length ?? 0} result rows for this entity:`);
  (rows ?? []).forEach((r: any) => console.log(`    batch=${short(r.batch_id)} period="${pname(r.period_id)}" total=${r.total_payout} | ${comps(r.components)}`));
  // distinctness verdict
  const sigs = new Set((rows ?? []).map((r: any) => comps(r.components)));
  console.log(`  → distinct component-vectors across batches: ${sigs.size} (≥2 ⇒ cross-period reconciliation yields REAL component deltas)`);
}

async function main() {
  console.log('================ OB-212 PREREQ-2 CROSS-PERIOD DELTA CHECK (read-only) ================');
  await forTenant('Meridian', '70001');
  await forTenant('Cumbre', 'BCL-5003');
  console.log('\n================ END ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
