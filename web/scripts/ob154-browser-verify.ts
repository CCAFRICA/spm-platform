/**
 * OB-154 Phase 5: Browser verification
 * Tests API endpoints and data loading that the UI depends on
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@opticaluminar.mx';
const PASSWORD = 'demo-password-OL1';

async function getAuthCookie(): Promise<string> {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

async function run() {
  console.log('=== OB-154 PHASE 5: BROWSER VERIFICATION ===\n');

  const cookie = await getAuthCookie();

  // Test 1: Plan readiness API
  console.log('--- Test 1: Plan Readiness API ---');
  const readinessRes = await fetch(`${BASE_URL}/api/plan-readiness?tenantId=${T}`, {
    headers: { Cookie: cookie },
  });
  console.log(`  Status: ${readinessRes.status}`);
  if (readinessRes.ok) {
    const data = await readinessRes.json();
    console.log(`  Plans: ${data.plans?.length || 0}`);
    for (const p of data.plans || []) {
      console.log(`    ${p.name}: entities=${p.entityCount}, data=${p.dataRowCount}`);
    }
  }

  // Test 2: Calculation results exist in database
  console.log('\n--- Test 2: Results in Database ---');
  const { count: resultCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  const { count: batchCount } = await sb.from('calculation_batches')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', T);
  console.log(`  Calculation results: ${resultCount}`);
  console.log(`  Calculation batches: ${batchCount}`);

  // Test 3: Results loading (what the UI would load)
  console.log('\n--- Test 3: Results Data ---');
  const { data: batch } = await sb.from('calculation_batches')
    .select('id, period_id, rule_set_id, status, entity_count, metadata')
    .eq('tenant_id', T)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (batch) {
    console.log(`  Latest batch: ${batch.id.substring(0, 8)}...`);
    console.log(`  Status: ${batch.status}`);
    console.log(`  Entity count: ${batch.entity_count}`);

    // Sample results for this batch
    const { data: results } = await sb.from('calculation_results')
      .select('entity_id, total_payout, components')
      .eq('tenant_id', T)
      .eq('batch_id', batch.id)
      .limit(3);

    if (results && results.length > 0) {
      console.log(`  Sample results: ${results.length}`);
      for (const r of results) {
        const comps = r.components as Array<Record<string, unknown>>;
        console.log(`    Entity ${r.entity_id.substring(0, 8)}...: MX$${Number(r.total_payout).toFixed(2)} (${comps?.length || 0} components)`);
      }
    }
  }

  // Test 4: Calculate page loads
  console.log('\n--- Test 4: Page Load ---');
  const pageRes = await fetch(`${BASE_URL}/operate/calculate`, {
    headers: { Cookie: cookie },
    redirect: 'follow',
  });
  console.log(`  /operate/calculate: ${pageRes.status}`);
  const pageText = await pageRes.text();
  const hasError = pageText.includes('Error') && pageText.includes('500');
  const hasCalculate = pageText.includes('Calculate') || pageText.includes('calculate');
  console.log(`  Contains 'Calculate': ${hasCalculate}`);
  console.log(`  Contains server error: ${hasError}`);

  // Test 5: Periods are selectable
  console.log('\n--- Test 5: Periods ---');
  const { data: periods } = await sb.from('periods')
    .select('id, label, status, start_date, end_date')
    .eq('tenant_id', T)
    .order('start_date');
  console.log(`  Periods: ${periods?.length || 0}`);
  for (const p of periods || []) {
    console.log(`    ${p.label}: ${p.status} (${p.start_date} to ${p.end_date})`);
  }

  // Summary
  console.log('\n--- BROWSER VERIFICATION SUMMARY ---');
  console.log(`PG-17: Calculate page loads: ${pageRes.status === 200 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-18: Results display ready: ${(resultCount || 0) > 0 ? 'PASS' : 'FAIL'} (${resultCount} results)`);
  console.log(`PG-19: Periods available: ${(periods?.length || 0) >= 1 ? 'PASS' : 'FAIL'} (${periods?.length})`);
  console.log(`PG-20: No server errors: ${!hasError ? 'PASS' : 'FAIL'}`);
}

run().catch(console.error);
