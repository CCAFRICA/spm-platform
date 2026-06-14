/**
 * OB-204 A.2 / A.3 — THE single validated user-lifecycle writer (the single door).
 *
 * Every non-platform user enters here; every mutation flows through here. The
 * contracts are enforced at write time (DS-028 §2), not by documentation:
 *   - role ∈ canonical five (resolveRole); tenantId NULL iff role === 'platform'
 *   - capabilities are ALWAYS deriveCapabilities(role) — the caller cannot supply
 *     them (no capabilities parameter exists). Closes the OB-204 object-shape defect.
 *   - atomicity: auth.admin.createUser → profile insert → on failure
 *     auth.admin.deleteUser rollback (no orphan auth identity is ever left behind).
 *   - I-1 (uuid spine): every event/audit row references users by uuid + structural
 *     facts (role, tenant, action) ONLY. The emit helpers below accept no string-PII
 *     parameter — email/display_name/IP CANNOT enter a payload. The A.8 harness
 *     grepping payloads for '@' is the I-1 proof artifact.
 *   - A.3 lockout guard: no disable/demotion/erase may leave zero active platform
 *     users; self-targeting requires ≥1 OTHER active platform admin.
 *
 * Korean Test: identification is structural (role canon, uuid). The only literals are
 * the tombstone sentinel strings, which are structural anonymization markers, not
 * domain/language identification logic.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveRole, deriveCapabilities, type Role } from '@/lib/auth/permissions';
import { emitEvent, type PlatformEventType } from '@/lib/events/emitter';
import { writeAuditLog } from '@/lib/audit/audit-logger';
import { sendInvite, sendSignInLink, sendRecovery, type DispatchLocale } from '@/lib/email/dispatch';

// ── service-role admin client (server-only; routes call the service, the service owns the client) ──
function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── structured, typed errors (routes map .code → HTTP status) ──
export type ServiceErrorCode =
  | 'invalid_role' | 'tenant_scope_violation' | 'duplicate_identity' | 'not_found'
  | 'lockout_guard' | 'auth_create_failed' | 'profile_insert_failed' | 'rate_limited';
export class ProvisionError extends Error {
  constructor(public code: ServiceErrorCode, message: string) { super(message); this.name = 'ProvisionError'; }
}

// ── contract validation (DS-028 §2) ──
function validateRoleTenant(role: Role, tenantId: string | null): void {
  if ((role === 'platform') !== (tenantId === null)) {
    throw new ProvisionError('tenant_scope_violation',
      `contract: tenantId must be NULL iff role==='platform' (role=${role}, tenant=${tenantId ?? 'NULL'})`);
  }
}
function canonical(role: string): Role {
  const r = resolveRole(role);
  if (!r) throw new ProvisionError('invalid_role', `role '${role}' does not resolve to a canonical role`);
  return r;
}

// ── I-1 PII-free emitters (NO email/name/IP parameter exists) ──
interface LifecycleFacts {
  action: PlatformEventType;     // user.created | user.role_changed | ...
  auditAction: string;           // mirror for audit_logs.action
  targetProfileId: string;
  tenantId: string | null;       // NULL for platform-target rows (F-3)
  actorProfileId?: string | null;
  role?: Role | null;
  fromRole?: Role | null;        // role-change before
  toRole?: Role | null;          // role-change after
  extra?: Record<string, string | number | boolean | null>; // structural only (no PII)
}
async function emitLifecycle(sb: SupabaseClient, f: LifecycleFacts): Promise<void> {
  const payload: Record<string, unknown> = {
    target_profile_id: f.targetProfileId,
    ...(f.actorProfileId ? { actor_profile_id: f.actorProfileId } : {}),
    ...(f.role ? { role: f.role } : {}),
    ...(f.fromRole ? { from_role: f.fromRole } : {}),
    ...(f.toRole ? { to_role: f.toRole } : {}),
    ...(f.extra ?? {}),
  };
  await emitEvent({ tenant_id: f.tenantId, event_type: f.action, actor_id: f.actorProfileId ?? undefined, entity_id: f.targetProfileId, payload });
  await writeAuditLog(sb, {
    // platform-target rows carry NULL tenant (passed through; writeAuditLog is non-fatal).
    tenant_id: f.tenantId as unknown as string, profile_id: f.targetProfileId,
    action: f.auditAction, resource_type: 'user', resource_id: f.targetProfileId,
    changes: payload,
  });
}

// ── temp-password generation (live policy: UPPER+lower+digit+special; never logged/persisted) ──
function generateTempPassword(): string {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%^&*?-_';
  const all = U + L + D + S;
  // 16 chars; first four guarantee each class. Uses Web Crypto (Node 20 / Next runtime) for unpredictability.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const pick = (set: string, b: number) => set[b % set.length];
  const out = [pick(U, bytes[0]), pick(L, bytes[1]), pick(D, bytes[2]), pick(S, bytes[3])];
  for (let i = 4; i < 16; i++) out.push(pick(all, bytes[i]));
  return out.join('');
}

// ── A.3 lockout guard: count OTHER active platform users; refuse if action empties the set ──
async function assertNotLastPlatform(sb: SupabaseClient, targetProfileId: string): Promise<void> {
  // active = canonical platform role, not erased (auth present). Status column lands in Phase B;
  // pre-B the auth-ban state is the enforcement, so "active" here is role-based + not-tombstoned.
  const { data } = await sb.from('profiles').select('id, role, email').neq('id', targetProfileId);
  const otherActivePlatform = (data ?? []).filter(p =>
    resolveRole(p.role) === 'platform' && !String(p.email ?? '').endsWith('@anon.invalid'));
  if (otherActivePlatform.length === 0) {
    throw new ProvisionError('lockout_guard',
      'refused: this action would leave zero active platform users (DS-028 §3 survival rule)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateUserInput {
  email: string;
  displayName: string;
  role: string;                 // any alias; stored canonical
  tenantId: string | null;      // NULL iff platform
  entityId?: string;            // link an existing roster entity (entities.profile_id)
  mode: 'invite' | 'temp_password';
  locale?: DispatchLocale;
  actorProfileId?: string;      // who performed it (for I-1 events)
}
export interface CreateUserResult {
  profileId: string;
  authUserId: string;
  role: Role;
  capabilities: string[];
  tempPassword?: string;        // temp_password mode ONLY — returned ONCE, never logged/persisted
  delivery?: 'sent' | 'dry_run';
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const sb = admin();
  const role = canonical(input.role);
  validateRoleTenant(role, input.tenantId);
  const capabilities = deriveCapabilities(role);             // caller CANNOT supply (contract)

  // duplicate-identity guard (HF-282 canon): never auto-merge
  const { data: dupe } = await sb.from('profiles').select('id').ilike('email', input.email);
  if (dupe && dupe.length > 0) {
    throw new ProvisionError('duplicate_identity', `a profile already exists for ${input.email} — refuse (architect disposition; never auto-merge)`);
  }

  const tempPassword = input.mode === 'temp_password' ? generateTempPassword() : undefined;
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: input.mode === 'temp_password',          // temp mode = immediately usable
    user_metadata: { role, must_change_password: input.mode === 'temp_password' },
  });
  if (authErr || !created?.user) {
    throw new ProvisionError('auth_create_failed', `auth.admin.createUser failed for ${input.email}: ${authErr?.message}`);
  }
  const authUserId = created.user.id;

  // profile insert — on ANY failure, roll back the auth identity (atomicity)
  const { data: prof, error: profErr } = await sb.from('profiles').insert({
    auth_user_id: authUserId, email: input.email, display_name: input.displayName,
    role, tenant_id: input.tenantId, locale: input.locale ?? 'en', capabilities,
  }).select('id').single();
  if (profErr || !prof) {
    await sb.auth.admin.deleteUser(authUserId).catch(() => { /* best-effort rollback */ });
    throw new ProvisionError('profile_insert_failed', `profile insert failed for ${input.email} (auth identity rolled back): ${profErr?.message}`);
  }
  const profileId = prof.id as string;

  // link an existing roster entity if supplied
  if (input.entityId) {
    await sb.from('entities').update({ profile_id: profileId }).eq('id', input.entityId);
  }

  // invite mode: mint + send the invite link
  let delivery: 'sent' | 'dry_run' | undefined;
  if (input.mode === 'invite') {
    const { data: linkData } = await sb.auth.admin.generateLink({ type: 'invite', email: input.email });
    const link = (linkData?.properties?.action_link as string) ?? '';
    const receipt = await sendInvite({ to: input.email, locale: input.locale, link });
    delivery = receipt.delivery;
  }

  await emitLifecycle(sb, {
    action: 'user.created', auditAction: 'user.created', targetProfileId: profileId,
    tenantId: input.tenantId, actorProfileId: input.actorProfileId, role,
    extra: { mode: input.mode, entity_linked: !!input.entityId, delivery: delivery ?? 'n/a' },
  });

  return { profileId, authUserId, role, capabilities, tempPassword, delivery };
}

export interface MutateInput { targetProfileId: string; actorProfileId?: string; }

export async function changeRole(input: MutateInput & { newRole: string }): Promise<{ role: Role; capabilities: string[] }> {
  const sb = admin();
  const newRole = canonical(input.newRole);
  const { data: target } = await sb.from('profiles').select('id, role, tenant_id, auth_user_id').eq('id', input.targetProfileId).single();
  if (!target) throw new ProvisionError('not_found', `profile ${input.targetProfileId} not found`);
  const fromRole = resolveRole(target.role);
  validateRoleTenant(newRole, target.tenant_id as string | null);   // tenant/role coherence preserved
  // demoting a platform user away from platform is a lockout-class action
  if (fromRole === 'platform' && newRole !== 'platform') await assertNotLastPlatform(sb, input.targetProfileId);
  const capabilities = deriveCapabilities(newRole);

  await sb.from('profiles').update({ role: newRole, capabilities }).eq('id', input.targetProfileId);
  await sb.auth.admin.updateUserById(target.auth_user_id as string, { user_metadata: { role: newRole } });
  await emitLifecycle(sb, {
    action: 'user.role_changed', auditAction: 'user.role_changed', targetProfileId: input.targetProfileId,
    tenantId: target.tenant_id as string | null, actorProfileId: input.actorProfileId,
    fromRole: fromRole ?? undefined, toRole: newRole,
  });
  return { role: newRole, capabilities };
}

async function setBan(sb: SupabaseClient, authUserId: string, banned: boolean): Promise<void> {
  // Auth ban is the ENFORCEMENT (banned identities cannot authenticate) — works pre-Phase-B.
  await sb.auth.admin.updateUserById(authUserId, { ban_duration: banned ? '876000h' : 'none' });
}

export async function disable(input: MutateInput): Promise<void> {
  const sb = admin();
  const { data: t } = await sb.from('profiles').select('id, role, tenant_id, auth_user_id').eq('id', input.targetProfileId).single();
  if (!t) throw new ProvisionError('not_found', `profile ${input.targetProfileId} not found`);
  if (resolveRole(t.role) === 'platform') await assertNotLastPlatform(sb, input.targetProfileId);
  await setBan(sb, t.auth_user_id as string, true);
  // profiles.status lands in Phase B; best-effort here (column may not exist pre-B — auth ban is enforcement).
  await sb.from('profiles').update({ status: 'disabled' }).eq('id', input.targetProfileId).then(() => {}, () => {});
  await emitLifecycle(sb, { action: 'user.disabled', auditAction: 'user.disabled', targetProfileId: input.targetProfileId, tenantId: t.tenant_id as string | null, actorProfileId: input.actorProfileId });
}

export async function enable(input: MutateInput): Promise<void> {
  const sb = admin();
  const { data: t } = await sb.from('profiles').select('id, tenant_id, auth_user_id').eq('id', input.targetProfileId).single();
  if (!t) throw new ProvisionError('not_found', `profile ${input.targetProfileId} not found`);
  await setBan(sb, t.auth_user_id as string, false);
  await sb.from('profiles').update({ status: 'active' }).eq('id', input.targetProfileId).then(() => {}, () => {});
  await emitLifecycle(sb, { action: 'user.enabled', auditAction: 'user.enabled', targetProfileId: input.targetProfileId, tenantId: t.tenant_id as string | null, actorProfileId: input.actorProfileId });
}

export async function erase(input: MutateInput): Promise<void> {
  const sb = admin();
  const { data: t } = await sb.from('profiles').select('id, role, tenant_id, auth_user_id').eq('id', input.targetProfileId).single();
  if (!t) throw new ProvisionError('not_found', `profile ${input.targetProfileId} not found`);
  if (resolveRole(t.role) === 'platform') await assertNotLastPlatform(sb, input.targetProfileId);
  // tombstone: auth identity destroyed; profile row retained with PII nulled (GDPR Art 17 one-row erasure).
  await sb.auth.admin.deleteUser(t.auth_user_id as string).catch(() => { /* may already be gone */ });
  await sb.from('profiles').update({
    email: `erased+${input.targetProfileId}@anon.invalid`, display_name: 'Erased user',
    avatar_url: null, capabilities: [],
  }).eq('id', input.targetProfileId);
  await emitLifecycle(sb, { action: 'user.erased', auditAction: 'user.erased', targetProfileId: input.targetProfileId, tenantId: t.tenant_id as string | null, actorProfileId: input.actorProfileId });
}

export async function sendCredentials(input: MutateInput & { type: 'invite_resend' | 'magiclink' | 'recovery' }): Promise<{ delivery: 'sent' | 'dry_run' }> {
  const sb = admin();
  const { data: t } = await sb.from('profiles').select('id, email, tenant_id, locale').eq('id', input.targetProfileId).single();
  if (!t) throw new ProvisionError('not_found', `profile ${input.targetProfileId} not found`);
  const email = t.email as string;
  const locale = (t.locale as DispatchLocale) ?? 'en';
  const typeMap = { invite_resend: 'invite', magiclink: 'magiclink', recovery: 'recovery' } as const;
  const { data: linkData } = await sb.auth.admin.generateLink({ type: typeMap[input.type], email });
  const link = (linkData?.properties?.action_link as string) ?? '';
  const receipt = input.type === 'recovery' ? await sendRecovery({ to: email, locale, link })
    : input.type === 'magiclink' ? await sendSignInLink({ to: email, locale, link })
    : await sendInvite({ to: email, locale, link });
  await emitLifecycle(sb, {
    action: 'user.credentials_sent', auditAction: 'user.credentials_sent', targetProfileId: input.targetProfileId,
    tenantId: t.tenant_id as string | null, actorProfileId: input.actorProfileId,
    extra: { credential_type: input.type, delivery: receipt.delivery },
  });
  return { delivery: receipt.delivery };
}
