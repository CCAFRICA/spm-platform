// OB-204 A.8 — single-door lifecycle harness (live DB, sandbox tenant; cleans up after).
// Per role: createUser → mint session (generateLink→verifyOtp) → resolveIdentity contract-true
// → capability checks per matrix → changeRole + re-assert → disable + assert blocked → erase +
// assert tombstone → events uuid-only (I-1 proof). Run from web/:
//   set -a && source .env.local && set +a && npx tsx scripts/ob204-mint-harness.ts
import { createClient } from '@supabase/supabase-js';
import { createUser, changeRole, disable, erase } from '../src/lib/auth/provision-user';
import { resolveIdentity } from '../src/lib/auth/resolve-identity';
import { deriveCapabilities, hasCapability, type Role } from '../src/lib/auth/permissions';

const SANDBOX_TENANT = 'a0b1c2d3-e4f5-4a6b-8c7d-000000000204';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => { (cond ? pass++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function setupSandbox() {
  await sb.from('tenants').upsert({ id: SANDBOX_TENANT, name: 'OB-204 Harness Sandbox', slug: 'ob204-harness', currency: 'USD', locale: 'en', features: {}, settings: {} });
}
async function teardown(profileIds: string[]) {
  for (const id of profileIds) await sb.from('profiles').delete().eq('id', id);   // hard-remove tombstones
  await sb.from('tenants').delete().eq('id', SANDBOX_TENANT);
}

async function mintSession(email: string): Promise<boolean> {
  const { data } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = (data?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!tokenHash) return false;
  const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified, error } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  return !error && !!verified?.session;
}

async function runRole(role: Role, ts: number): Promise<string> {
  const email = `harness-${role}-${ts}@vialuce.test`;
  const tenantId = role === 'platform' ? null : SANDBOX_TENANT;
  console.log(`\n── role=${role} (${email}) ──`);
  const created = await createUser({ email, displayName: `Harness ${role}`, role, tenantId, mode: 'temp_password' });
  check('createUser returns profileId + authUserId', !!created.profileId && !!created.authUserId);
  check('capabilities = deriveCapabilities(role) (array, matrix-verbatim)', eq(created.capabilities, deriveCapabilities(role)));

  const minted = await mintSession(email);
  check('mint session (generateLink→verifyOtp) yields a session', minted);

  const ident = await resolveIdentity(sb as never, created.authUserId);
  check('resolveIdentity returns contract-true row', !!ident && ident.role === role && Array.isArray(ident.capabilities) && (role === 'platform') === (ident.tenantId === null),
    ident ? `role=${ident.role} tenant=${ident.tenantId ?? 'NULL'} capShape=${Array.isArray(ident.capabilities) ? 'array' : typeof ident.capabilities}` : 'null');

  // capability checks per matrix (role-based PDP)
  const sampleCap = role === 'platform' ? 'platform.system_config' : 'view.own_results';
  check(`hasCapability(${role}, ${sampleCap}) matches matrix`, hasCapability(role, sampleCap as never) === deriveCapabilities(role).includes(sampleCap));

  // role-change → re-assert (avoid platform↔non-platform to keep tenant coherence)
  const newRole: Role = role === 'viewer' ? 'member' : role === 'platform' ? 'platform' : 'viewer';
  if (newRole !== role) {
    const ch = await changeRole({ targetProfileId: created.profileId, newRole });
    check(`changeRole→${newRole} re-derives capabilities`, eq(ch.capabilities, deriveCapabilities(newRole)));
  }

  // disable → assert blocked (auth ban)
  await disable({ targetProfileId: created.profileId });
  const { data: banned } = await sb.auth.admin.getUserById(created.authUserId);
  check('disable → auth user banned (blocked)', !!(banned?.user as { banned_until?: string } | undefined)?.banned_until);

  // erase → assert tombstone (auth anonymized+banned; profile retained PII-nulled)
  await erase({ targetProfileId: created.profileId });
  const { data: anonUser } = await sb.auth.admin.getUserById(created.authUserId);
  const au = anonUser?.user as { banned_until?: string; email?: string } | undefined;
  check('erase → auth anonymized + banned (cannot authenticate, no PII)', !!au?.banned_until && au?.email === `erased+${created.profileId}@anon.invalid`,
    au ? `email=${au.email} banned=${!!au.banned_until}` : 'null');
  const { data: tomb } = await sb.from('profiles').select('email, display_name, capabilities').eq('id', created.profileId).single();
  check('erase → profile tombstoned (PII nulled)', !!tomb && tomb.email === `erased+${created.profileId}@anon.invalid` && tomb.display_name === 'Erased user' && eq(tomb.capabilities, []),
    tomb ? `email=${tomb.email} name=${tomb.display_name}` : 'no row');
  return created.profileId;
}

async function main() {
  console.log('================ OB-204 A.8 MINT HARNESS ================');
  await setupSandbox();
  const ts = 1781400000000;   // fixed stamp (no Date.now in tooling)
  const profileIds: string[] = [];
  for (const role of ['platform', 'admin', 'manager', 'member', 'viewer'] as Role[]) {
    try { profileIds.push(await runRole(role, ts + (['platform','admin','manager','member','viewer'].indexOf(role)))); }
    catch (e) { fail++; console.log(`  FAIL role=${role} threw: ${e instanceof Error ? e.message : e}`); }
  }

  // I-1 proof: no '@' (email) in any lifecycle event payload emitted for these profiles
  console.log('\n── I-1: event payloads uuid-only (no PII) ──');
  const { data: evts } = await sb.from('platform_events')
    .select('event_type, payload')
    .in('event_type', ['user.created', 'user.role_changed', 'user.disabled', 'user.enabled', 'user.erased', 'user.credentials_sent'])
    .in('entity_id', profileIds);
  const withAt = (evts ?? []).filter(e => /@/.test(JSON.stringify(e.payload)));
  check(`event payloads scanned=${evts?.length ?? 0}; with '@' email pattern = 0`, withAt.length === 0, withAt.length ? `LEAK: ${JSON.stringify(withAt[0])}` : '');

  await teardown(profileIds);
  console.log(`\n================ RESULT: ${pass} PASS / ${fail} FAIL ================`);
  if (fail > 0) process.exit(1);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
