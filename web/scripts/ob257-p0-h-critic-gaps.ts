// OB-257 P0 completeness-critic gap probe (READ-ONLY).
// Run: npx tsx --env-file=.env.local scripts/ob257-p0-h-critic-gaps.ts
// Gaps: (1) Sabor rule_sets status vs ruleSetCount contradiction; (2) BCL insight staleness
// vs summary_artifacts freshness; (3) tenant features verbatim (BCL/Sabor + any 'revenue' key).
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
/* eslint-disable @typescript-eslint/no-explicit-any */

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

(async () => {
  // (1) rule_sets status for Sabor + BCL
  for (const [name, tid] of [['SABOR', SABOR], ['BCL', BCL]] as const) {
    const { data, error } = await sb.from('rule_sets')
      .select('id, name, status, created_at')
      .eq('tenant_id', tid);
    console.log(`${name} rule_sets (${(data ?? []).length} rows)${error ? ' ERR ' + error.message : ''}:`);
    for (const r of data ?? []) console.log(`  ${r.id} | status=${r.status} | ${r.name} | ${r.created_at}`);
    const active = await sb.from('rule_sets').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'active');
    console.log(`  ${name} status='active' count (session-context ruleSetCount):`, active.count);
  }

  // (2) BCL freshness: newest summary_artifacts vs newest intelligence_artifacts
  const sa = await sb.from('summary_artifacts').select('created_at, data_type').eq('tenant_id', BCL).order('created_at', { ascending: false }).limit(1);
  const ia = await sb.from('intelligence_artifacts').select('created_at, source').eq('tenant_id', BCL).order('created_at', { ascending: false }).limit(1);
  console.log('BCL newest summary_artifact:', JSON.stringify(sa.data), sa.error?.message ?? '');
  console.log('BCL newest intelligence_artifact:', JSON.stringify(ia.data), ia.error?.message ?? '');
  const iaCount = await sb.from('intelligence_artifacts').select('*', { count: 'exact', head: true }).eq('tenant_id', BCL);
  console.log('BCL intelligence_artifacts count:', iaCount.count);

  // (3) tenant features verbatim + any tenant carrying a 'revenue'-ish key
  const { data: tenants } = await sb.from('tenants').select('id, name, features');
  for (const t of tenants ?? []) {
    const keys = Object.keys((t.features ?? {}) as Record<string, unknown>);
    const revKeys = keys.filter(k => k.toLowerCase().includes('revenue'));
    if (t.id === BCL || t.id === SABOR) console.log(`FEATURES ${t.name}: ${JSON.stringify(t.features)}`);
    if (revKeys.length) console.log(`REVENUE-KEY COLLISION on ${t.name}: ${JSON.stringify(revKeys)}`);
  }
  console.log('tenants scanned:', (tenants ?? []).length, '| revenue-key collisions: see lines above (none printed = none found)');
})();
