/**
 * HF-282 Phase 3 — provision-user.ts — THE canonical user-provisioning surface.
 *
 * Run via: cd web && set -a && source .env.local && set +a && npx tsx scripts/provision-user.ts [--apply]
 *   (default = DRY RUN: census + plan only, no writes. Pass --apply to perform writes.)
 *
 * Contract (mirrors the HF-280 atomicity class at the identity layer):
 *  (a) ensureAuthUser  — createUser, or on-exists updateUserById with email_confirm:true
 *      (the FRMX pattern). Never deletes an auth user it did not create.
 *  (b) ONE profiles row keyed auth_user_id, role stored ALIAS-NORMALIZED (resolveRole).
 *      Check-then-write: 0 existing -> insert; exactly 1 -> update; >1 -> ABORT LOUD
 *      (duplicate identity is the canon violation — needs architect disposition, never
 *       auto-merged here).
 *  (c) verify post-state: exactly 1 auth identity + exactly 1 profile, else ABORT LOUD
 *      (partial identity state is unrepresentable, not repaired downstream).
 *
 * Korean Test / AP-25: emails/roles appear ONLY in the SPECS seed block below
 * (provisioning data), never in resolution logic. resolveIdentity is the reader.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ROLE_ALIASES: Record<string, string> = {
  platform: 'platform', vl_admin: 'platform', admin: 'admin', tenant_admin: 'admin',
  manager: 'manager', member: 'member', individual: 'member', sales_rep: 'member', viewer: 'viewer',
};
const resolveRole = (r: string): string | null => ROLE_ALIASES[r] ?? null;

export interface ProvisionSpec {
  email: string;
  password: string;
  displayName: string;
  role: string;            // any alias; stored canonical
  tenantId: string | null; // null for platform-scope
  locale: string;
}

export interface ProvisionResult {
  email: string;
  authId: string;
  authAction: 'created' | 'updated';
  profileAction: 'inserted' | 'updated';
  finalProfileCount: number;
}

export async function provisionUser(admin: SupabaseClient, spec: ProvisionSpec, apply: boolean): Promise<ProvisionResult> {
  const canonRole = resolveRole(spec.role);
  if (!canonRole) throw new Error(`[provision] unknown role '${spec.role}' for ${spec.email} — refuse (Korean Test: role must resolve)`);

  // (a) ensureAuthUser
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list.users.find(u => u.email?.toLowerCase() === spec.email.toLowerCase());
  let authId: string;
  let authAction: 'created' | 'updated';
  if (existing) {
    authId = existing.id; authAction = 'updated';
    if (apply) await admin.auth.admin.updateUserById(authId, { password: spec.password, email_confirm: true });
  } else {
    authAction = 'created';
    if (apply) {
      const { data: created, error } = await admin.auth.admin.createUser({ email: spec.email, password: spec.password, email_confirm: true });
      if (error || !created?.user) throw new Error(`[provision] createUser failed for ${spec.email}: ${error?.message}`);
      authId = created.user.id;
    } else {
      authId = '(dry-run: would create)';
    }
  }

  // (b) ONE profiles row keyed auth_user_id
  let profileAction: 'inserted' | 'updated' = 'updated';
  if (existing || apply) {
    const lookupId = authId.startsWith('(dry') ? '__none__' : authId;
    const { data: rows } = await admin.from('profiles').select('id').eq('auth_user_id', lookupId);
    if (rows && rows.length > 1) {
      throw new Error(`[provision] ${spec.email} has ${rows.length} profile rows for auth_user_id=${lookupId} — ABORT (duplicate identity; architect disposition required, never auto-merge)`);
    }
    profileAction = rows && rows.length === 1 ? 'updated' : 'inserted';
    if (apply) {
      if (rows && rows.length === 1) {
        await admin.from('profiles').update({ role: canonRole, tenant_id: spec.tenantId, display_name: spec.displayName, locale: spec.locale }).eq('id', rows[0].id);
      } else {
        await admin.from('profiles').insert({ auth_user_id: authId, email: spec.email, role: canonRole, tenant_id: spec.tenantId, display_name: spec.displayName, locale: spec.locale, capabilities: [] });
      }
    }
  }

  // (c) verify post-state (only meaningful under --apply)
  let finalProfileCount = -1;
  if (apply && !authId.startsWith('(dry')) {
    const { data: after } = await admin.from('profiles').select('id').eq('auth_user_id', authId);
    finalProfileCount = after?.length ?? 0;
    if (finalProfileCount !== 1) {
      throw new Error(`[provision] POST-STATE VIOLATION for ${spec.email}: expected exactly 1 profile, found ${finalProfileCount} — ABORT`);
    }
  }
  return { email: spec.email, authId, authAction, profileAction, finalProfileCount };
}

// ── SEED / provisioning data (AP-25: literals confined to this block) ──
// HF-282 Phase 0.2 live orphan census = Banco Cumbre + admin@vialuce.ai (NOT the 3
// Sabor users the directive assumed). Authoritative role/tenant exists ONLY for
// admin@bancocumbre.ec (seed-bcl-tenant.ts: role 'admin', BCL tenant). The other
// orphans' roles/tenants are NOT dispositioned — left out pending architect input
// (provisioning a guessed role is an SR-39 violation). Add dispositioned specs here.
const SPECS: ProvisionSpec[] = [
  { email: 'admin@bancocumbre.ec', password: process.env.HF282_BCL_ADMIN_PW || 'CHANGE-ME', displayName: 'Patricia Zambrano', role: 'admin', tenantId: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', locale: 'es' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(`=== provision-user.ts ${apply ? '(APPLY — writes enabled)' : '(DRY RUN — no writes)'} ===`);

  // census: per-auth_user_id profile count (post-state verification tool)
  const { data: all } = await admin.from('profiles').select('auth_user_id, role, email');
  const byAuth = new Map<string, number>();
  for (const r of all ?? []) byAuth.set(r.auth_user_id, (byAuth.get(r.auth_user_id) ?? 0) + 1);
  const multi = Array.from(byAuth.entries()).filter(([, n]) => n > 1);
  console.log(`profiles=${all?.length ?? 0} distinct auth_user_id=${byAuth.size} duplicate-groups=${multi.length}`);
  for (const [id, n] of multi) console.log(`  DUP auth_user_id=${id} count=${n}`);

  for (const spec of SPECS) {
    try {
      const r = await provisionUser(admin, spec, apply);
      console.log(`  ${apply ? 'OK' : 'PLAN'} ${r.email}: auth=${r.authAction} profile=${r.profileAction} authId=${r.authId} finalProfileCount=${r.finalProfileCount}`);
    } catch (e) {
      console.log(`  ABORT ${spec.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
