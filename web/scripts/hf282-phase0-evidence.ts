// HF-282 Phase 0.2 — FP-49 schema + census evidence (read-only, service-role).
// PostgREST does not expose information_schema/pg_catalog; schema source = live row
// introspection + generated types; censuses run against public.profiles directly.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  // (a) live profiles columns (introspect one row)
  const { data: sample } = await supabase.from('profiles').select('*').limit(1);
  console.log('=== profiles columns (live row keys) ===');
  console.log(sample && sample[0] ? Object.keys(sample[0]).join(', ') : '(no rows)');

  // (b) duplicate census — group by auth_user_id having count > 1
  const { data: all, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, role, email, tenant_id, created_at')
    .order('created_at', { ascending: true });
  if (error) { console.log('profiles read error:', error.message); return; }
  const byAuth = new Map<string, any[]>();
  for (const r of all ?? []) {
    if (!byAuth.has(r.auth_user_id)) byAuth.set(r.auth_user_id, []);
    byAuth.get(r.auth_user_id)!.push(r);
  }
  console.log(`\n=== duplicate census (auth_user_id with >1 profile row) ===`);
  console.log(`total profiles=${all?.length ?? 0}  distinct auth_user_id=${byAuth.size}`);
  const dups: Array<{ authUserId: string; rows: any[] }> = [];
  for (const [authUserId, rows] of byAuth) {
    if (rows.length > 1) {
      dups.push({ authUserId, rows });
      console.log(`  auth_user_id=${authUserId}  count=${rows.length}`);
      for (const r of rows) console.log(`      id=${r.id} role=${r.role} email=${r.email} tenant_id=${r.tenant_id ?? 'NULL'} created=${r.created_at}  id===auth_user_id? ${r.id === r.auth_user_id}`);
    }
  }
  if (dups.length === 0) console.log('  (none)');

  // (c) orphan census — auth users without any profile row
  const profileAuthIds = new Set((all ?? []).map(r => r.auth_user_id));
  const orphans: Array<{ id: string; email: string }> = [];
  let page = 1;
  while (true) {
    const { data, error: lerr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (lerr) { console.log('listUsers error:', lerr.message); break; }
    for (const u of data.users) if (!profileAuthIds.has(u.id)) orphans.push({ id: u.id, email: u.email ?? '(no email)' });
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`\n=== orphan census (auth.users without a profile) — ${orphans.length} ===`);
  for (const o of orphans) console.log(`  ${o.email}  (${o.id})`);

  // (d) FK reference check on each duplicate profile id
  console.log(`\n=== FK reference counts for duplicate profile ids (profile_scope, audit_logs, entities.profile_id) ===`);
  for (const d of dups) {
    for (const r of d.rows) {
      for (const t of ['profile_scope', 'audit_logs', 'entities']) {
        const { count, error: cerr } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq('profile_id', r.id);
        console.log(`  ${t}.profile_id == ${r.id} (role=${r.role}) -> ${cerr ? 'ERR '+cerr.message : count}`);
      }
    }
  }

  // (e) verify no unique constraint on auth_user_id empirically (dups exist => no uq constraint)
  console.log(`\n=== unique-constraint inference: ${dups.length > 0 ? 'NO unique constraint on auth_user_id (duplicates present)' : 'no duplicates observed'} ===`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
