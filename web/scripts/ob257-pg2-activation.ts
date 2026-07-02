// OB-257 PG-2 — activation runner: enables revenue_enabled for BCL and runs THE single materializer
// (the same function the Observatory toggle / finalize cascade / activate route call), then re-runs
// for the idempotency no-op evidence. Run: npx tsx --env-file=.env.local scripts/ob257-pg2-activation.ts
import { createClient } from '@supabase/supabase-js';
import { materializeRevenueRollups } from '../src/lib/revenue/materializer';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // 1. Entitlement flip (the CLI equivalent of the Observatory toggle; the browser click-path
  //    remains available to the architect and will no-op idempotently).
  const { data: t } = await sb.from('tenants').select('features').eq('id', BCL).single();
  console.log('features BEFORE:', JSON.stringify(t?.features));
  const features = { ...((t?.features as Record<string, unknown>) ?? {}), revenue_enabled: true };
  const { error: wErr } = await sb.from('tenants').update({ features, updated_at: new Date().toISOString() }).eq('id', BCL);
  if (wErr) throw new Error(`entitlement write: ${wErr.message}`);
  const { data: t2 } = await sb.from('tenants').select('features').eq('id', BCL).single();
  console.log('features AFTER :', JSON.stringify(t2?.features));

  // 2. Activation run (no import, no file touch, no classification pass).
  console.log('\n=== ACTIVATION RUN 1 ===');
  const r1 = await materializeRevenueRollups(sb as never, BCL, (m) => console.log('[trace]', m));
  console.log('RESULT 1:', JSON.stringify(r1, null, 1));

  // 3. Idempotency re-run — must be a no-op.
  console.log('\n=== ACTIVATION RUN 2 (idempotency) ===');
  const r2 = await materializeRevenueRollups(sb as never, BCL, (m) => console.log('[trace]', m));
  console.log('RESULT 2:', JSON.stringify({ ok: r2.ok, noop: r2.noop, durationMs: r2.durationMs, rollupsWritten: r2.rollupsWritten }, null, 1));

  // 4. Post-state: rollup counts per namespace + meta + insights.
  for (const dt of ['revenue_period', 'revenue_entity_period', 'revenue_dimension_period', 'revenue_meta']) {
    const { count } = await sb.from('summary_rollups').select('id', { count: 'exact', head: true }).eq('tenant_id', BCL).eq('data_type', dt);
    console.log(`summary_rollups[${dt}]: ${count} rows`);
  }
  const { data: meta } = await sb.from('summary_rollups').select('metrics').eq('tenant_id', BCL).eq('data_type', 'revenue_meta').single();
  console.log('meta metrics:', JSON.stringify(meta?.metrics, null, 1));
  const { data: ins } = await sb.from('intelligence_artifacts').select('context').eq('tenant_id', BCL).eq('source', 'revenue-insight');
  const byKind: Record<string, number> = {};
  for (const r of ins ?? []) byKind[(r.context as { kind?: string })?.kind ?? '?'] = (byKind[(r.context as { kind?: string })?.kind ?? '?'] ?? 0) + 1;
  console.log('revenue-insight artifacts by kind:', JSON.stringify(byKind));
}
main().catch((e) => { console.error(e); process.exit(1); });
