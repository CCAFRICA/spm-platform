import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken:false, persistSession:false } });
const USERS = [
  { name:'Carlos Mendoza', email:'admin@saborgrupo.mx', role:'admin', caps:{admin:true,financial:true,icm:true} },
  { name:'Ana Martínez', email:'gerente@saborgrupo.mx', role:'manager', caps:{manager:true,financial:true} },
  { name:'Diego Ramírez', email:'mesero@saborgrupo.mx', role:'sales_rep', caps:{rep:true} },
];
const PW = 'sabor-demo-2024';
async function findAuthUser(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users?.find((x:any) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}
async function main(){
  const { data: t } = await sb.from('tenants').select('id').eq('slug','sabor-grupo').single(); const tid=t!.id;
  await sb.from('profiles').delete().eq('tenant_id', tid); // idempotent: clear this tenant's profiles
  for (const u of USERS) {
    let uid = await findAuthUser(u.email);
    if (!uid) {
      const { data, error } = await sb.auth.admin.createUser({ email:u.email, password:PW, email_confirm:true });
      if (error) { console.error(`auth createUser ${u.email}:`, error.message); continue; }
      uid = data.user!.id;
    } else {
      await sb.auth.admin.updateUserById(uid, { password: PW });
    }
    const { error: pErr } = await sb.from('profiles').insert({ tenant_id:tid, auth_user_id:uid, display_name:u.name, email:u.email, role:u.role, capabilities:u.caps, locale:'es-MX' });
    if (pErr) console.error(`profile ${u.email}:`, pErr.message);
    else console.log(`  ${u.email} -> auth_user=${uid.slice(0,8)} role=${u.role}`);
  }
  const { data: profs } = await sb.from('profiles').select('display_name, email, role').eq('tenant_id', tid);
  console.log('PROOF profiles:', JSON.stringify(profs));
}
main().catch(e=>{console.error(e);process.exit(1);});
