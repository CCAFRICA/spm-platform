/**
 * OB-154 Phase 3B: Calculate January 2024
 * Calls /api/calculation/run via HTTP
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const OPTICA = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const BASE_URL = 'http://localhost:3000';
const EMAIL = 'admin@opticaluminar.mx';
const PASSWORD = 'demo-password-OL1';

async function getAuthCookie(): Promise<string> {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] || '';
  const sessionJson = JSON.stringify({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return `sb-${projectRef}-auth-token=${encodeURIComponent(sessionJson)}`;
}

async function run() {
  console.log('=== OB-154 PHASE 3B: CALCULATE JANUARY ===\n');

  // Get rule set and January period
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name').eq('tenant_id', OPTICA);
  const { data: periods } = await sb.from('periods')
    .select('id, label, start_date, end_date').eq('tenant_id', OPTICA)
    .order('start_date');

  const ruleSet = ruleSets?.[0];
  const janPeriod = periods?.find(p => p.label.includes('January'));

  if (!ruleSet || !janPeriod) {
    console.error('Missing rule set or January period');
    process.exit(1);
  }

  console.log(`Rule set: ${ruleSet.name} (${ruleSet.id.substring(0, 8)}...)`);
  console.log(`Period: ${janPeriod.label} (${janPeriod.start_date} to ${janPeriod.end_date})`);

  // Auth
  const cookie = await getAuthCookie();

  // Call calculation API
  console.log('\nCalling /api/calculation/run...');
  const startTime = Date.now();

  const res = await fetch(`${BASE_URL}/api/calculation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      tenantId: OPTICA,
      periodId: janPeriod.id,
      ruleSetId: ruleSet.id,
    }),
    signal: AbortSignal.timeout(300000),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Response: ${res.status} (${elapsed}s)`);

  if (!res.ok) {
    const text = await res.text();
    console.error(`Calculation failed: ${text.substring(0, 500)}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`\nResults:`);
  console.log(`  Entity count: ${result.entityCount ?? result.results?.length ?? 'unknown'}`);
  console.log(`  Total payout: ${result.totalPayout ?? 'unknown'}`);

  // Verify from database
  console.log('\n--- Database Verification ---');
  const { count: resultCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', OPTICA);

  // Total payout
  let totalPayout = 0;
  let offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', OPTICA)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) totalPayout += Number(r.total_payout) || 0;
    offset += data.length;
    if (data.length < 1000) break;
  }

  console.log(`  Results: ${resultCount}`);
  console.log(`  Total payout: MX$${totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`  Target: MX$1,253,832.00`);

  const delta = ((totalPayout - 1253832) / 1253832 * 100).toFixed(1);
  console.log(`  Delta: ${delta}%`);

  console.log(`\nPG-9: Calculation executes: ${res.status === 200 ? 'PASS' : 'FAIL'}`);
  console.log(`PG-10: Result count ~ 719: ${resultCount !== null && resultCount >= 600 && resultCount <= 800 ? 'PASS' : 'FAIL'} (${resultCount})`);
  console.log(`PG-11: Total payout within ±5% of MX$1,253,832: ${Math.abs(parseFloat(delta)) <= 5 ? 'PASS' : 'FAIL'} (${delta}%)`);
}

run().catch(console.error);
