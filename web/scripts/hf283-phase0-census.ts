import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function main() {
  const { data: all } = await s.from('profiles').select('id, auth_user_id, role, email, tenant_id');
  const byAuth = new Map<string, number>();
  for (const r of all ?? []) byAuth.set(r.auth_user_id, (byAuth.get(r.auth_user_id) ?? 0) + 1);
  const dups = Array.from(byAuth.entries()).filter(([, n]) => n > 1);
  console.log(`(a) auth_user_id with >1 profile row: ${dups.length}  (expect 0)`);
  for (const [id, n] of dups) console.log(`     DUP ${id} count=${n}`);
  const plat = (all ?? []).filter(r => r.auth_user_id === '9c179b53-c5ee-4af7-a36b-09f5db3e35f2');
  console.log(`(b) platform@vialuce.com rows: ${plat.length}  (expect 1) -> roles=[${plat.map(r=>r.role).join(', ')}] ids=[${plat.map(r=>r.id).join(', ')}]`);
  const tdc = (all ?? []).filter(r => (r.email||'').toLowerCase() === 'tdelcarlo@vialuce.ai');
  console.log(`(c) tdelcarlo@vialuce.ai rows: ${tdc.length}  (expect 0)`);
  const vla = (all ?? []).filter(r => r.role === 'vl_admin');
  console.log(`(d) role='vl_admin' rows anywhere: ${vla.length}`);
  for (const r of vla) console.log(`     VL_ADMIN id=${r.id} auth=${r.auth_user_id} email=${r.email} tenant=${r.tenant_id ?? 'NULL'}`);
  console.log(`total profiles=${all?.length ?? 0}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
