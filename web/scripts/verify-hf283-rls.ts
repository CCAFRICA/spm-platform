// HF-283 Phase 5 (Addendum-4) — RLS verification harness, CREDENTIAL-FREE.
// User-scoped JWTs are MINTED via service-role admin.generateLink (no email sent) ->
// anon verifyOtp. No human password is ever read, written, prompted, or logged.
// Emails are identities (constants), not secrets. Minted session is aal1 — sufficient:
// the RLS check is auth.uid()-on-profiles.role, AAL-independent (DIAG-061 §3.2).
// Side-effect: a session + last_sign_in_at update per mint (same class DIAG-061 accepted).
// Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/verify-hf283-rls.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SABOR_TENANT = 'f7093bcc-e90b-4918-9680-69da7952dd65';

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

// Mint a user-scoped anon client via generateLink -> verifyOtp. Returns null on failure.
async function mint(email: string): Promise<{ client: SupabaseClient; err?: string }> {
  for (const type of ['magiclink', 'recovery'] as const) {
    const { data: gl, error: ge } = await admin.auth.admin.generateLink({ type, email } as never);
    const tokenHash = (gl as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
    if (ge || !tokenHash) { if (type === 'recovery') return { client: null as never, err: ge?.message ?? 'no hashed_token' }; continue; }
    const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: vo, error: ve } = await c.auth.verifyOtp({ type: type === 'magiclink' ? 'magiclink' : 'recovery', token_hash: tokenHash });
    if (ve || !vo?.session) { if (type === 'recovery') return { client: null as never, err: ve?.message ?? 'no session' }; continue; }
    return { client: c };
  }
  return { client: null as never, err: 'mint failed' };
}

const eqSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

async function main() {
  const { data: allT } = await admin.from('tenants').select('id');
  const full = (allT ?? []).map(t => t.id).sort();
  console.log(`service-role tenants: ${full.length} ids`);

  // Derive a Sabor control email (best-effort, A3.4)
  const { data: sab } = await admin.from('profiles').select('email').eq('tenant_id', SABOR_TENANT).limit(1).maybeSingle();
  const controlEmail = sab?.email as string | undefined;

  const platformIds = [
    { label: 'tdadmin', email: 'tdadmin@vialuce.com', required: true },
    { label: 'eoadmin', email: 'eoadmin@vialuce.com', required: true },
    { label: 'platform@', email: 'platform@vialuce.com', required: false },
  ];
  const mintFails: string[] = [];
  for (const id of platformIds) {
    const { client, err } = await mint(id.email);
    if (!client) { console.log(`${id.label}: MINT FAILED (${err})`); if (id.required) mintFails.push(id.label); continue; }
    const { data: rows, error } = await client.from('tenants').select('id').order('id');
    const ids = (rows ?? []).map(r => r.id).sort();
    console.log(`${id.label}: ${ids.length} tenants -> G-A ${eqSet(ids, full) ? 'PASS' : 'FAIL'}${error ? ' err=' + error.message : ''}`);
    await client.auth.signOut();
  }

  if (controlEmail) {
    const { client, err } = await mint(controlEmail);
    if (!client) { console.log(`control (${controlEmail}): MINT FAILED (${err}) — G-B best-effort-unavailable`); }
    else {
      const { data: rows } = await client.from('tenants').select('id').order('id');
      const ids = (rows ?? []).map(r => r.id).sort();
      console.log(`control (${controlEmail}): ${ids.length} tenants -> G-B ${eqSet(ids, [SABOR_TENANT]) ? 'PASS' : 'FAIL'} (own=${SABOR_TENANT})`);
      await client.auth.signOut();
    }
  } else {
    console.log('control: no Sabor profile found — G-B best-effort-unavailable');
  }

  if (mintFails.length === 2) {
    console.log(`HALT-7: both required identities failed to mint (${mintFails.join(', ')})`);
    process.exitCode = 2;
  }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });
