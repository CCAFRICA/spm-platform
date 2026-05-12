// HF-216 Phase 6: trigger calculation by direct POST-handler import (middleware
// bypassed by design — script runs in same Node process as the route handler).
// Read calculation_results for entity 007da35a × period 3c2557f4 and paste verbatim.

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

const TENANT_ID = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const RULE_SET_ID = '939cf576-4096-4ceb-a142-539a486868b3';
const PERIOD_ID = '3c2557f4-d922-4b30-a073-ac4811f1f3cb';
const ENTITY_ID = '007da35a-8e65-453b-ada9-b62337fd8683';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

(async () => {
  console.log('=== Direct POST handler invocation (middleware bypassed) ===');
  const mod = await import('../src/app/api/calculation/run/route');
  const req = new NextRequest('http://localhost/api/calculation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_ID, periodId: PERIOD_ID, ruleSetId: RULE_SET_ID }),
  });
  const res = await mod.POST(req);
  console.log(`HTTP status: ${res.status}`);
  const body = await res.text();
  console.log(`body length: ${body.length} chars`);
  if (res.status !== 200) {
    console.log(`body (first 2000 chars): ${body.slice(0, 2000)}`);
    process.exit(1);
  }

  console.log('\n=== calculation_results for entity 007da35a × period 3c2557f4 ===');
  const { data: cr, error } = await supabase
    .from('calculation_results')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('entity_id', ENTITY_ID)
    .eq('period_id', PERIOD_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !cr || cr.length === 0) {
    console.log('ERROR or empty result:', JSON.stringify(error));
    return;
  }
  const r = cr[0];
  console.log(`result_id:    ${r.id}`);
  console.log(`batch_id:     ${r.batch_id}`);
  console.log(`created_at:   ${r.created_at}`);
  console.log(`total_payout: ${r.total_payout}`);

  console.log('\n--- components[].payout (verbatim) ---');
  const comps = (r.components ?? []) as Array<Record<string, unknown>>;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    console.log(`components[${i}]: id=${c.componentId} name=${c.componentName} payout=${c.payout}`);
  }

  console.log('\n--- metadata.intentTraces[4] (verbatim) ---');
  const md = (r.metadata ?? {}) as Record<string, unknown>;
  const traces = (md.intentTraces ?? []) as Array<Record<string, unknown>>;
  const t4 = traces[4];
  if (t4) {
    const inputs = (t4.inputs ?? {}) as Record<string, Record<string, unknown>>;
    const loads = inputs.hub_total_loads;
    const cap = inputs.hub_total_capacity;
    console.log(`intentTraces[4].inputs.hub_total_loads.rawValue:    ${JSON.stringify(loads?.rawValue)}`);
    console.log(`intentTraces[4].inputs.hub_total_capacity.rawValue: ${JSON.stringify(cap?.rawValue)}`);
    console.log(`intentTraces[4].modifiers:                          ${JSON.stringify(t4.modifiers)}`);
    console.log(`intentTraces[4].finalOutcome:                       ${JSON.stringify(t4.finalOutcome)}`);
  } else {
    console.log('intentTraces[4] is undefined');
  }

  console.log('\n--- metadata.intentMatch / intentTotal / legacyTotal ---');
  console.log(`metadata.intentMatch:  ${JSON.stringify(md.intentMatch)}`);
  console.log(`metadata.intentTotal:  ${JSON.stringify(md.intentTotal)}`);
  console.log(`metadata.legacyTotal:  ${JSON.stringify(md.legacyTotal)}`);

  console.log('\n--- metadata.intentTraces[4] full (for reference) ---');
  console.log(JSON.stringify(t4, null, 2));
})();
