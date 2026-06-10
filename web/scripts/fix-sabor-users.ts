// SUPERSEDED BY provision-user.ts (HF-282) — do not run.
// Retained as a forensic artifact (HF-282 §3.3 / SR-41): this is the torn-provisioning
// script — it repaired Sabor auth.users identities but never wrote Sabor profiles rows,
// and (oldest-row read at :30-33) would copy role 'vl_admin'. The canonical writer
// (provision-user.ts: one auth user -> one profile, role alias-normalized, abort-loud)
// replaces it. See docs/completion-reports/HF-282_COMPLETION_REPORT_20260610.md.
//
// Run via: cd web && set -a && source .env.local && set +a && npx tsx scripts/fix-sabor-users.ts
// Non-destructive: updateUserById (no deletes) for Sabor; additive create for platform admins.
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // === SABOR: non-destructive identity attach (NO deletes) ===
  const SABOR = [
    { email: 'admin@saborgrupo.mx', password: 'sabor-demo-2024' },
    { email: 'gerente@saborgrupo.mx', password: 'sabor-demo-2024' },
    { email: 'mesero@saborgrupo.mx', password: 'sabor-demo-2024' },
  ];
  const { data: pre } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of SABOR) {
    const existing = pre.users.find(x => x.email?.toLowerCase() === u.email.toLowerCase());
    if (!existing) { console.log(`${u.email}: NOT FOUND — skipping (will need create)`); continue; }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: u.password, email_confirm: true,
    });
    if (error) console.log(`${u.email}: updateUserById error — ${error.message}`);
    else console.log(`${u.email}: updateUserById OK (id ${existing.id})`);
  }

  // === PLATFORM ADMINS: pure create (mirror canonical platform@vialuce.com) ===
  const { data: canonical } = await supabaseAdmin
    .from('profiles').select('role, capabilities')
    .eq('email', 'platform@vialuce.com')
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!canonical) throw new Error('platform@vialuce.com not found — cannot mirror canonical role/capabilities');
  console.log('Canonical role:', canonical.role, '| capabilities:', JSON.stringify(canonical.capabilities));

  for (const admin of [
    { email: 'eoadmin@vialuce.com', password: 'Vialuce-2024!', displayName: 'EO Admin' },
    { email: 'tdadmin@vialuce.com', password: 'Vialuce-2024!', displayName: 'TD Admin' },
  ]) {
    const already = pre.users.find(x => x.email?.toLowerCase() === admin.email.toLowerCase());
    let authId: string;
    if (already) {
      await supabaseAdmin.auth.admin.updateUserById(already.id, { password: admin.password, email_confirm: true });
      authId = already.id;
      console.log(`• ${admin.email}: auth existed, password reset (id ${authId})`);
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: admin.email, password: admin.password, email_confirm: true,
      });
      if (cErr || !created?.user) { console.log(`${admin.email}: createUser error — ${cErr?.message}`); continue; }
      authId = created.user.id;
      console.log(`✓ Created auth user: ${admin.email} → ${authId} (identities: ${created.user.identities?.length ?? 0})`);
    }
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('email', admin.email).maybeSingle();
    if (existingProfile) {
      await supabaseAdmin.from('profiles').update({
        auth_user_id: authId, role: canonical.role, capabilities: canonical.capabilities,
        tenant_id: null, display_name: admin.displayName,
      }).eq('id', existingProfile.id);
    } else {
      await supabaseAdmin.from('profiles').insert({
        id: crypto.randomUUID(), auth_user_id: authId, display_name: admin.displayName,
        email: admin.email, role: canonical.role, capabilities: canonical.capabilities,
        tenant_id: null, locale: 'en',
      });
    }
    console.log(`✓ Platform admin ready: ${admin.email} → ${authId}`);
  }

  // === PROOF ===
  const { data: verify } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  console.log('\n=== IDENTITIES ===');
  for (const email of ['admin@saborgrupo.mx','gerente@saborgrupo.mx','mesero@saborgrupo.mx','eoadmin@vialuce.com','tdadmin@vialuce.com']) {
    const u = verify.users.find(x => x.email?.toLowerCase() === email.toLowerCase());
    console.log(`${email}: identities=${u?.identities?.length ?? 'NOT FOUND'}`);
  }
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  console.log('\n=== LOGIN TEST ===');
  for (const { email, password } of [
    { email:'admin@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'gerente@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'mesero@saborgrupo.mx', password:'sabor-demo-2024' },
    { email:'eoadmin@vialuce.com', password:'Vialuce-2024!' },
    { email:'tdadmin@vialuce.com', password:'Vialuce-2024!' },
  ]) {
    const { data: s, error } = await anon.auth.signInWithPassword({ email, password });
    console.log(`${email}: ${s?.session ? '✓ LOGIN OK' : `✗ FAILED — ${error?.message}`}`);
    if (s?.session) await anon.auth.signOut();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
