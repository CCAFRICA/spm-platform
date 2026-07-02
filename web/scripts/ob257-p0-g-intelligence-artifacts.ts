// OB-257 P0 Discovery Item 7 — intelligence_artifacts live inventory (READ-ONLY).
// Run: npx tsx --env-file=.env.local scripts/ob257-p0-g-intelligence-artifacts.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
/* eslint-disable @typescript-eslint/no-explicit-any */

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

(async () => {
  // Sabor tenant id (live authority)
  const { data: sabor, error: te } = await sb.from('tenants').select('id, name').ilike('name', '%sabor%');
  console.log('SABOR tenant:', te ? `ERR ${te.message}` : JSON.stringify(sabor));

  // Total artifact count
  const tot = await sb.from('intelligence_artifacts').select('id', { count: 'exact', head: true });
  console.log('intelligence_artifacts TOTAL count:', tot.error ? `ERR ${tot.error.message}` : tot.count);

  // Per-tenant counts
  const { data: allRows, error: ae } = await sb.from('intelligence_artifacts').select('tenant_id, artifact_type, severity, entity_id, entity_type, period_id, source, created_at').limit(2000);
  if (ae) { console.log('scan ERR:', ae.message); process.exit(0); }
  const byTenant: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of allRows ?? []) {
    byTenant[r.tenant_id] = (byTenant[r.tenant_id] ?? 0) + 1;
    byKind[r.artifact_type ?? 'NULL'] = (byKind[r.artifact_type ?? 'NULL'] ?? 0) + 1;
    bySource[r.source ?? 'NULL'] = (bySource[r.source ?? 'NULL'] ?? 0) + 1;
  }
  console.log('rows scanned:', (allRows ?? []).length);
  console.log('by tenant:', JSON.stringify(byTenant, null, 1));
  console.log('distinct artifact_type (kind) counts:', JSON.stringify(byKind, null, 1));
  console.log('by source:', JSON.stringify(bySource, null, 1));
  const periodScoped = (allRows ?? []).filter(r => r.period_id != null).length;
  const entityScoped = (allRows ?? []).filter(r => r.entity_id != null).length;
  console.log(`period_id NOT NULL: ${periodScoped} / entity_id NOT NULL: ${entityScoped}`);

  // Sample rows: 2 full rows from whichever tenant has data (prefer BCL)
  const sampleTenant = byTenant[BCL] ? BCL : Object.keys(byTenant)[0];
  if (sampleTenant) {
    const { data: samples } = await sb.from('intelligence_artifacts').select('*').eq('tenant_id', sampleTenant).order('created_at', { ascending: false }).limit(2);
    console.log(`SAMPLE rows (tenant ${sampleTenant}):`);
    for (const s of samples ?? []) console.log(JSON.stringify(s, null, 1).slice(0, 2200));
    if (samples?.[0]) console.log('COLUMNS (Object.keys):', Object.keys(samples[0]).join(', '));
  } else {
    console.log('TABLE EMPTY — no sample rows.');
    const { data: probe } = await sb.from('intelligence_artifacts').select('*').limit(1);
    console.log('probe rows:', JSON.stringify(probe));
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
