'use client';

/**
 * HF-343 Phase 1 — useAuthScope: the ONE authenticated-scope hook every `/perform` read binds to.
 *
 * Decision 39: the visible entity set derives from the authenticated `profiles.role`, NOT the
 * cosmetic persona switcher. For a real tenant user the switcher does not exist (it is VL-admin-gated
 * in VialuceSidebar), so `viewRole` is exactly their authenticated role. For a VL admin (platform,
 * entitled to everything) the switcher may only NARROW among entitled views — so the demo persona
 * selects the view, and an un-resolvable narrowing falls back to ALL (an entitled platform admin is
 * never shown LESS than the tenant). The switcher is therefore never the security boundary.
 *
 * Returns the EntityScope to thread into getCalculatedPeriods / getPeriodTotal / getComponentTotals /
 * getEntityResults, plus the capability flags that gate which org-wide panels render.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/contexts/tenant-context';
import { usePersona } from '@/contexts/persona-context';
import { personaToRole } from '@/lib/navigation/role-workspaces';
import { hasCapability, resolveRole, type Role } from '@/lib/auth/permissions';
import { resolveAuthenticatedScope, scopeIsDeny } from '@/lib/drill-through/entity-scope';
import { ALL_INSIGHTS_SCOPE } from '@/lib/insights/periods';
import type { EntityScope } from '@/lib/drill-through/types';

const DENY_SCOPE: EntityScope = { visibleEntityIds: [], visibleRuleSetIds: [], visiblePeriodIds: [], scopeType: 'explicit' };

export interface AuthScopeResult {
  /** scope resolution still in flight — callers should hold reads until false */
  loading: boolean;
  /** the canonical role whose lens the surface renders through (authenticated, or VL-admin demo) */
  viewRole: Role;
  /** thread into every scope-aware read; ALL for admin/platform, narrowed for manager/member */
  scope: EntityScope;
  /** view.all_results — platform/admin only (gates tenant-wide panels) */
  canViewAll: boolean;
  /** view.team_results — manager + admin/platform (gates team/aggregate panels) */
  canViewTeam: boolean;
  /** narrowed role whose entity set resolved to nothing (member with no linked entity — HALT-C) */
  isDenied: boolean;
  /** the member's OWN entity (the single narrowed entity), or null for team/all/denied scopes —
   *  the authoritative id a member sub-surface (RepDashboard) must read, NOT the cosmetic persona. */
  ownEntityId: string | null;
}

export function useAuthScope(): AuthScopeResult {
  const { user, isVLAdmin } = useAuth();
  const { currentTenant } = useTenant();
  const { persona } = usePersona();
  const tenantId = currentTenant?.id ?? '';

  // Effective VIEW role: authenticated role for real users; the entitled demo persona for VL admins.
  const viewRole: Role = useMemo(() => {
    const raw = isVLAdmin ? personaToRole(persona) : (user?.role ?? '');
    return resolveRole(raw) ?? 'member';
  }, [isVLAdmin, persona, user?.role]);

  // Capability flags derive from the view role (so a VL-admin demo gates panels exactly as the
  // demoed role would see them). For real users viewRole === authenticated role.
  const canViewAll = hasCapability(viewRole, 'view.all_results');
  const canViewTeam = hasCapability(viewRole, 'view.team_results');

  const [scope, setScope] = useState<EntityScope>(ALL_INSIGHTS_SCOPE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tenantId) {
      // No identity/tenant yet → hold reads (loading) and fail closed for non-admins.
      setScope(canViewAll ? ALL_INSIGHTS_SCOPE : DENY_SCOPE);
      setLoading(!user || !tenantId ? true : false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveAuthenticatedScope(viewRole, user.id, tenantId, { sampleWhenUnlinked: isVLAdmin })
      .then((s) => {
        if (cancelled) return;
        // A VL admin is entitled to all — never deny them; an un-resolvable demo narrows to ALL.
        setScope(isVLAdmin && scopeIsDeny(s) ? ALL_INSIGHTS_SCOPE : s);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setScope(canViewAll ? ALL_INSIGHTS_SCOPE : DENY_SCOPE); // fail closed for non-admins
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tenantId, viewRole, isVLAdmin]);

  const isDenied = scopeIsDeny(scope);
  // own entity = the single narrowed entity an own-scope (member) surface should read. For team/all
  // scopes this is null (those surfaces are not own-keyed).
  const ownEntityId = !canViewTeam && !isDenied && scope.visibleEntityIds.length > 0 ? scope.visibleEntityIds[0] : null;
  return { loading, viewRole, scope, canViewAll, canViewTeam, isDenied, ownEntityId };
}
