// OB-204 B.2 / HALT-2 — orphan census (READ-ONLY). auth.users vs profiles.
import { createClient } from '@supabase/supabase-js';
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const KEEP = new Set(['platform@vialuce.ai', 'tdadmin@vialuce.ai', 'eoadmin@vialuce.ai']);
  // all auth users (paginate)
  const authUsers: { id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (!data?.users?.length) break;
    for (const u of data.users) authUsers.push({ id: u.id, email: (u.email ?? '').toLowerCase() });
    if (data.users.length < 200) break;
  }
  const { data: profs } = await sb.from('profiles').select('id, auth_user_id, email, role, tenant_id, capabilities');
  const profByAuth = new Map((profs ?? []).map(p => [p.auth_user_id, p]));
  console.log(`auth.users=${authUsers.length} profiles=${profs?.length ?? 0}`);
  console.log('\n=== ORPHANS (auth user WITHOUT a profile row) ===');
  let orphan = 0;
  for (const u of authUsers) { if (!profByAuth.has(u.id)) { orphan++; console.log(`  ORPHAN auth=${u.id.slice(0,8)} email=${u.email}`); } }
  console.log(`orphan count = ${orphan}`);
  console.log('\n=== PROFILED non-platform-persona users (what "delete ALL except 3 platform" would ALSO remove) ===');
  let profiledNonKeep = 0;
  for (const p of (profs ?? [])) {
    const email = String(p.email ?? '').toLowerCase();
    const isPlatformPersona = KEEP.has(email);
    if (!isPlatformPersona) { profiledNonKeep++; if (profiledNonKeep <= 40) console.log(`  PROFILED email=${email} role=${p.role} tenant=${(p.tenant_id??'NULL')?.toString().slice(0,8)} capShape=${Array.isArray(p.capabilities)?'array':typeof p.capabilities}`); }
  }
  console.log(`profiled non-platform-persona count = ${profiledNonKeep}`);
  console.log('\n  platform personas present:', authUsers.filter(u => KEEP.has(u.email)).map(u=>u.email).join(', ') || 'NONE');
}
main().catch(e => { console.error(e); process.exit(1); });
