/* eslint-disable @typescript-eslint/no-explicit-any */ // OB-228: data layer walks untyped rule_sets.components / committed_data.row_data JSONB (substrate is dynamic by design)
/**
 * OB-228 — resolvePersona: the refraction seam (Concept ⑧).
 *
 * Reads profiles.{role, capabilities, tenant_id} + profile_scope (visible_*_ids).
 * profiles has NO `persona` column (Phase 1) — persona is derived from role +
 * capabilities. profile_scope is empty platform-wide (Phase 1) — an admin with no
 * scope row defaults to ALL-VISIBLE (unrestricted); a non-admin with no scope row
 * fails closed. The seam is NOT a hardcoded "admin" constant (HALT-3 spirit).
 *
 * The persona string drives renderer dispatch downstream; only AdminRenderer exists
 * this OB (OB-229 adds Rep/Manager via slot-fill, not refactor).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import type { PersonaScope } from './types';

const ADMIN_ROLES = new Set(['admin', 'vl_admin', 'platform', 'owner']);
const EDIT_CAP = 'icm.configure_plans';
const ADMIN_CAPS = new Set(['icm.configure_plans', 'manage_tenants', 'icm.simulate']);

function derivePersona(role: string, capabilities: string[]): { persona: string; isAdmin: boolean; canEdit: boolean } {
  const r = (role ?? '').toLowerCase();
  const caps = new Set(capabilities ?? []);
  const isAdmin = ADMIN_ROLES.has(r) || Array.from(ADMIN_CAPS).some((c) => caps.has(c));
  const canEdit = caps.has(EDIT_CAP) || ADMIN_ROLES.has(r);
  const persona = isAdmin ? 'admin' : r === 'manager' ? 'manager' : 'rep';
  return { persona, isAdmin, canEdit };
}

export async function resolvePersona(profileId: string, client?: SupabaseClient<Database>): Promise<PersonaScope> {
  const sb = client ?? createClient();

  const { data: profile } = await sb
    .from('profiles')
    .select('id, role, capabilities, tenant_id')
    .eq('id', profileId)
    .maybeSingle();

  const role = String((profile as any)?.role ?? 'viewer');
  const capabilities = (((profile as any)?.capabilities as string[]) ?? []) || [];
  const tenantId = ((profile as any)?.tenant_id as string | null) ?? null;
  const { persona, isAdmin, canEdit } = derivePersona(role, capabilities);

  const { data: scope } = await sb
    .from('profile_scope')
    .select('visible_rule_set_ids, visible_entity_ids, visible_period_ids')
    .eq('profile_id', profileId)
    .maybeSingle();

  const visibleRuleSetIds = ((scope as any)?.visible_rule_set_ids as string[]) ?? [];
  const visibleEntityIds = ((scope as any)?.visible_entity_ids as string[]) ?? [];
  const visiblePeriodIds = ((scope as any)?.visible_period_ids as string[]) ?? [];

  // Admin with no/empty scope row ⇒ unrestricted (sees all). Non-admin with no row ⇒ fail closed.
  const unrestricted = isAdmin && visibleRuleSetIds.length === 0;

  return { persona, tenantId, visibleRuleSetIds, visibleEntityIds, visiblePeriodIds, isAdmin, unrestricted, canEdit };
}

/** Resolve persona from an already-resolved identity (server path: avoids a re-read). */
export function personaFromIdentity(identity: {
  id: string;
  tenantId: string | null;
  role: string;
  capabilities: string[];
}, scope?: { visible_rule_set_ids?: string[]; visible_entity_ids?: string[]; visible_period_ids?: string[] } | null): PersonaScope {
  const { persona, isAdmin, canEdit } = derivePersona(identity.role, identity.capabilities);
  const visibleRuleSetIds = scope?.visible_rule_set_ids ?? [];
  return {
    persona,
    tenantId: identity.tenantId,
    visibleRuleSetIds,
    visibleEntityIds: scope?.visible_entity_ids ?? [],
    visiblePeriodIds: scope?.visible_period_ids ?? [],
    isAdmin,
    unrestricted: isAdmin && visibleRuleSetIds.length === 0,
    canEdit,
  };
}
