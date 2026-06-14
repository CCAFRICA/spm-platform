// OB-204 Step 6 — orphan cleanup (architect-dispositioned 2026-06-13). Deletes auth users
// with NO profile row via auth.admin.deleteUser; emits one PII-free user.orphan_cleanup event
// (uuid + action only) per deletion. KEEPS all profiled users. DRY-RUN unless --apply.
import { createClient } from '@supabase/supabase-js';
const KEEP_PLATFORM = ['platform@vialuce.com', 'tdadmin@vialuce.com', 'eoadmin@vialuce.com'];
async function listOrphans(sb: any) {
  const authUsers: { id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (!data?.users?.length) break;
    for (const u of data.users) authUsers.push({ id: u.id, email: (u.email ?? '').toLowerCase() });
    if (data.users.length < 200) break;
  }
  const { data: profs } = await sb.from('profiles').select('auth_user_id');
  const have = new Set((profs ?? []).map((p: any) => p.auth_user_id));
  return { orphans: authUsers.filter(u => !have.has(u.id)), totalAuth: authUsers.length, totalProfiles: profs?.length ?? 0,
           platformPresent: authUsers.filter(u => KEEP_PLATFORM.includes(u.email)).map(u => u.email) };
}
async function main() {
  const apply = process.argv.includes('--apply');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const before = await listOrphans(sb);
  console.log(`=== CENSUS BEFORE ===\nauth=${before.totalAuth} profiles=${before.totalProfiles} orphans=${before.orphans.length}`);
  console.log(`platform personas (.com) present & KEPT: ${before.platformPresent.join(', ')}`);
  for (const o of before.orphans) console.log(`  orphan auth=${o.id.slice(0,8)} email=${o.email}`);
  if (!apply) { console.log('\n(DRY RUN — pass --apply to delete)'); return; }
  console.log(`\n=== DELETING ${before.orphans.length} orphans ===`);
  for (const o of before.orphans) {
    // PII-free event FIRST (uuid + action only; no email/name/IP)
    await sb.from('platform_events').insert({ tenant_id: null, event_type: 'user.orphan_cleanup', actor_id: null, entity_id: o.id, payload: { auth_user_id: o.id, action: 'orphan_cleanup' }, processed_by: [] });
    const { error } = await sb.auth.admin.deleteUser(o.id);
    console.log(`  ${error ? 'FAIL' : 'DELETED'} auth=${o.id.slice(0,8)}${error ? ' err=' + error.message : ''}`);
  }
  const after = await listOrphans(sb);
  console.log(`\n=== CENSUS AFTER ===\nauth=${after.totalAuth} profiles=${after.totalProfiles} orphans=${after.orphans.length} (expect 0)`);
  console.log(`profiles unchanged: ${before.totalProfiles === after.totalProfiles ? 'YES ('+after.totalProfiles+')' : 'NO — INVESTIGATE'}`);
  console.log(`platform personas still present: ${after.platformPresent.join(', ')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
