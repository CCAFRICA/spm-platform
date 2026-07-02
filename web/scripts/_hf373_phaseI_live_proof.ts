/** HF-373 EPG-I1 — the REAL planSourceSheet over the LIVE Casa Diaz rule_sets (legacy
 * contentUnitId backfill parse), + COMISION GARANTIZADA's stored intent verbatim. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { planSourceSheet } from '../src/lib/plan-surface/plan-identity';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
(async () => {
  const { data: plans } = await sb.from('rule_sets').select('id, name, status, metadata, components').eq('tenant_id', CASA).eq('status', 'active').order('created_at');
  console.log('Casa Diaz ACTIVE plans — name + recovered source-sheet identity (the list surfaces render this):');
  for (const p of plans ?? []) {
    const sheet = planSourceSheet(p.metadata as Record<string, unknown>);
    console.log(`  ${String(p.name).padEnd(45)} — from sheet "${sheet}"`);
  }
  const gar = (plans ?? []).find(p => String(p.name).includes('GARANTIZADA'));
  if (gar) {
    const comps = gar.components as { variants?: Array<{ components?: Array<Record<string, unknown>> }> };
    const c = comps.variants?.[0]?.components?.[0];
    console.log('\nCOMISIÓN GARANTIZADA constructed component (verbatim):');
    console.log(`  name=${c?.name} componentType=${c?.componentType}`);
    console.log(`  calculationIntent=${JSON.stringify(c?.calculationIntent)}`);
    const { count: assignments } = await sb.from('rule_set_assignments').select('*', { count: 'exact', head: true }).eq('tenant_id', CASA);
    const { count: entities } = await sb.from('entities').select('*', { count: 'exact', head: true }).eq('tenant_id', CASA);
    console.log(`\nintactness: entities=${entities} assignments=${assignments} activePlans=${(plans ?? []).length}`);
  }
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
