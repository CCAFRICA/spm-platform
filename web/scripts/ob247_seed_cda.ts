/**
 * OB-247 — seed a Customer Data Administrator (CDA) test user (service-role).
 *
 * Creates an auth user + a profiles row with role='cda' and capabilities = the cda
 * matrix entry (data.upload, view.own_uploads). The user enrolls MFA at first login
 * (the existing /auth/mfa flow — no new auth path). Idempotent.
 *
 * NOTE: profiles.role is TEXT but constrained by profiles_role_canon — this seed
 * REQUIRES 20260626_ob247_cda_role.sql to be applied first (HALT-A). Until then the
 * profiles insert correctly fails with a constraint violation.
 *
 * Run: npx tsx --env-file=.env.local scripts/ob247_seed_cda.ts
 * Optional env: CDA_EMAIL, CDA_PASSWORD, CDA_TENANT_NAME
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.env.CDA_EMAIL ?? 'cda.demo@vialuce.test';
const PASSWORD = process.env.CDA_PASSWORD ?? 'CdaPortal!2026demo';
// These mirror ROLE_CAPABILITIES['cda'] / deriveCapabilities('cda') (dotted TS Capability strings).
const CDA_CAPABILITIES = ['data.upload', 'view.own_uploads'];

async function findUserByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; scan for the email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  // 1. Pick a tenant (named override, else the first).
  const tenantName = process.env.CDA_TENANT_NAME;
  const tq = sb.from('tenants').select('id, name').order('name');
  const { data: tenants, error: tErr } = await (tenantName ? tq.eq('name', tenantName) : tq.limit(1));
  if (tErr || !tenants?.length) throw new Error(`no tenant found: ${tErr?.message ?? 'empty'}`);
  const tenant = tenants[0];
  console.log(`Tenant: ${tenant.name} [${tenant.id}]`);

  // 2. Create (or find) the auth user.
  let userId = await findUserByEmail(EMAIL);
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'CDA Demo', role: 'cda' },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    userId = data.user.id;
    console.log(`Created auth user ${userId}`);
  } else {
    // Ensure the password is the known test password (idempotent reset).
    await sb.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    console.log(`Reused auth user ${userId} (password reset to known value)`);
  }

  // 3. Upsert the profiles row (role='cda', owner-scoped capabilities).
  const { data: existing } = await sb.from('profiles').select('id').eq('auth_user_id', userId).maybeSingle();
  const profileRow = {
    auth_user_id: userId,
    email: EMAIL,
    display_name: 'CDA Demo',
    role: 'cda',
    tenant_id: tenant.id,
    capabilities: CDA_CAPABILITIES,
    locale: 'en-US',
  };
  if (existing) {
    const { error } = await sb.from('profiles').update(profileRow).eq('id', existing.id);
    if (error) throw new Error(`profile update failed: ${error.message}`);
    console.log(`Updated profile ${existing.id}`);
  } else {
    const { data, error } = await sb.from('profiles').insert(profileRow).select('id').single();
    if (error) throw new Error(`profile insert failed: ${error.message}`);
    console.log(`Inserted profile ${data.id}`);
  }

  // 4. Verify.
  const { data: check } = await sb
    .from('profiles')
    .select('id, role, tenant_id, capabilities, email')
    .eq('auth_user_id', userId)
    .maybeSingle();
  console.log('\n=== Seeded CDA ===');
  console.log(JSON.stringify(check, null, 2));
  console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
  console.log('First login → MFA enroll (cda is in MFA_REQUIRED_ROLES) → lands at /portal.');
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});
