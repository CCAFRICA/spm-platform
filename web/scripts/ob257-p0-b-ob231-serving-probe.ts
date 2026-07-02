// OB-257 P0 discovery (item 2 / letter b) — READ-ONLY probe.
// Is convergence/recognition-driven financial serving OPERATIVE live?
// Run: cd web && npx tsx --env-file=.env.local scripts/ob257-p0-b-ob231-serving-probe.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // Sabor tenant id
  const { data: sabor, error: te } = await sb.from('tenants').select('id, name').ilike('name', '%sabor%');
  console.log('tenants ilike %sabor%:', JSON.stringify(sabor), te?.message ?? '');
  const SABOR = sabor?.[0]?.id as string | undefined;

  // surface_bindings — the HF-337 store the financial route reads
  const { data: sbAll, error: sbe } = await sb
    .from('surface_bindings')
    .select('tenant_id, surface_id, resolved_fields, confidence, recognized_by, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (sbe) console.log('surface_bindings error:', sbe.message);
  console.log(`surface_bindings rows (up to 50): ${sbAll?.length ?? 0}`);
  for (const r of sbAll ?? []) {
    const rf = (r as any).resolved_fields as Array<{ field_name?: string; display_label?: string }> | null;
    console.log(`  tenant=${String((r as any).tenant_id).slice(0, 8)} surface=${(r as any).surface_id} -> ${JSON.stringify(rf?.map(f => f.field_name ?? f.display_label))} conf=${(r as any).confidence} by=${(r as any).recognized_by}`);
  }

  // comprehension_artifacts per tenant (recognition input)
  for (const [label, tid] of [['BCL', BCL], ['SABOR', SABOR]] as const) {
    if (!tid) { console.log(`${label}: no tenant id`); continue; }
    const { count } = await sb.from('comprehension_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    console.log(`comprehension_artifacts ${label}: ${count}`);
    const { count: sc } = await sb.from('surface_bindings').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    console.log(`surface_bindings ${label}: ${sc}`);
    const { count: sa } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('data_type', 'pos_cheque');
    console.log(`summary_artifacts(pos_cheque) ${label}: ${sa}`);
    const { count: saAny } = await sb.from('summary_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
    console.log(`summary_artifacts(any data_type) ${label}: ${saAny}`);
    // what data_types does committed_data hold for this tenant?
    const { data: dt } = await sb.from('committed_data').select('data_type').eq('tenant_id', tid).limit(1000);
    const counts: Record<string, number> = {};
    for (const r of dt ?? []) counts[(r as any).data_type] = (counts[(r as any).data_type] ?? 0) + 1;
    console.log(`committed_data data_type sample(1000) ${label}: ${JSON.stringify(counts)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
