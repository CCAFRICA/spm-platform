/**
 * DIAG-063 / B1 — per-tenant L3 details availability (READ-ONLY, keys only)
 * One most-recent calculation_result per distinct tenant_id:
 * components[].details key names + intentTraces presence. No values printed.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: all, error } = await supabase
    .from('calculation_results')
    .select('tenant_id')
    .limit(2000);
  if (error) { console.log('ERROR', error.message); return; }
  const tenants = Array.from(new Set((all ?? []).map(r => r.tenant_id)));
  console.log(`distinct tenants with calculation_results: ${tenants.length}`);

  for (const t of tenants) {
    const { data, error: e2 } = await supabase
      .from('calculation_results')
      .select('id, components, metadata, created_at')
      .eq('tenant_id', t)
      .order('created_at', { ascending: false })
      .limit(1);
    if (e2 || !data?.length) { console.log(`${t}: ERROR/empty ${e2?.message ?? ''}`); continue; }
    const r = data[0];
    const comps = Array.isArray(r.components) ? (r.components as Array<Record<string, unknown>>) : [];
    const detailKeySets = comps.map(c =>
      c.details && typeof c.details === 'object' ? Object.keys(c.details as object).sort() : null);
    const nonEmpty = detailKeySets.filter(k => k && k.length > 0);
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const it = Array.isArray(meta.intentTraces) ? (meta.intentTraces as unknown[]).length : 0;
    console.log(JSON.stringify({
      tenant_id: t,
      latest_result_id: r.id,
      created_at: r.created_at,
      components: comps.length,
      components_with_nonempty_details: nonEmpty.length,
      sample_details_keys: nonEmpty[0] ?? [],
      intentTraces_count: it,
    }));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
