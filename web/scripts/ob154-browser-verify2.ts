/**
 * OB-154 Phase 5B: More precise browser error check
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
  const cookie = await getAuthCookie();

  // More precise error detection
  const res = await fetch(`${BASE_URL}/operate/calculate`, {
    headers: { Cookie: cookie },
    redirect: 'follow',
  });

  const text = await res.text();

  // Check for actual error page patterns
  const patterns = [
    { name: 'Next.js error page', regex: /class="next-error-h1"/i },
    { name: 'Server error title', regex: /<title>.*(?:500|Server Error|Internal).*<\/title>/i },
    { name: 'Error boundary', regex: /Something went wrong/i },
    { name: 'Runtime error', regex: /Application error: a (?:client|server)-side exception/i },
  ];

  console.log('=== PRECISE ERROR CHECK ===');
  console.log(`Page status: ${res.status}`);
  console.log(`Content length: ${text.length}`);

  let hasRealError = false;
  for (const p of patterns) {
    const found = p.regex.test(text);
    if (found) {
      console.log(`  FOUND: ${p.name}`);
      hasRealError = true;
    }
  }

  if (!hasRealError) {
    console.log('  No real error patterns found — page loads clean');
  }

  // Check that key UI elements exist
  const uiChecks = [
    { name: 'Calculate button/text', found: /calculate/i.test(text) },
    { name: 'Period selector', found: /period|January|February/i.test(text) },
    { name: 'Next.js RSC payload', found: text.includes('__next') || text.includes('__N_SSP') },
  ];

  console.log('\nUI element checks:');
  for (const check of uiChecks) {
    console.log(`  ${check.name}: ${check.found ? 'PRESENT' : 'MISSING'}`);
  }

  // Test results batch query (what UI does on calculation results load)
  const { data: batch } = await sb.from('calculation_batches')
    .select('id, status, entity_count, metadata')
    .eq('tenant_id', T)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (batch) {
    const meta = batch.metadata as Record<string, unknown>;
    const summary = meta?.summary as Record<string, unknown> | undefined;
    console.log(`\nLatest batch: status=${batch.status}, entities=${batch.entity_count}`);
    console.log(`  Total payout from metadata: ${summary?.total_payout}`);
  }

  console.log(`\nPG-20: No server errors: ${!hasRealError ? 'PASS' : 'FAIL'}`);
}

run().catch(console.error);
