# HF-345 — Corrective: Persona Override Narrows Scope and Menu for VL Admin Preview — Completion Report

*Branch: `ob-246-rbac-menu-data-access` (HF-345 commits amend PR #604 — no new PR)*
*Date: 2026-06-26 · Substrate: DS-014 §8.2 · Decision 39 (corrected) · Decision 123 · OB-246*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 (Section B ADR gate satisfied — `docs/diagnostics/HF-345_ADR_G0.md`, commit `19f293b2`)*
*Evidentiary discipline: Rule 27 — every proof gate below carries PASTED evidence, not PASS/FAIL self-attestation.*

---

## 1. Summary

HF-345 corrects OB-246 §3.1d/§3.3b (the architect's earlier Decision-39 misread, which made the persona override
cosmetic on data + navigation — a VL admin saw tenant-wide data + the full sidebar for every persona, so no role's
experience could be demoed or verified). HF-345 makes the override **narrow scope + menu within entitlement** for a
VL-admin preview. **Decision 39 (corrected):** narrowing within an entitled identity is always safe; Decision 39
prohibits *widening* beyond authenticated entitlement, not an entitled admin narrowing their own view.

**Everything OB-246 built for REAL users is preserved byte-identical** — a member/manager/admin login has
`effectiveScope === scope`, `effectiveCapabilities === capabilities`, `effectiveRole === authenticated`, and the
override null/cleared. The override is gated to `isVLAdmin` (in auth-context), so a real user can never carry one.

**Design (ADR Option A — hoist):** the persona override was hoisted from `persona-context` INTO `auth-context` (it now
drives auth concerns). auth-context exposes on `AuthContextType`: `effectiveScope` (state + ONE reactive effect),
`effectiveCapabilities` (sync `useMemo`), `personaOverride` + gated `setPersonaOverride`. 13 client `useAuth().scope`
data consumers read `effectiveScope`. `navigation-context.effectiveRole` re-derives from the override.

**Gates:** `tsc --noEmit` 0 · `npm run build` 0 (Korean Test gate PASS) · `node --test` **294/294** · zero engine/SCI files.

---

## 2. Proof gates (PG-1 … PG-12) — pasted evidence

### PG-1 — `effectiveScope` on `AuthContextType` · PG-2 — `effectiveCapabilities` on `AuthContextType`
`web/src/contexts/auth-context.tsx` (interface):
```ts
  scope: AuthScope;
  // HF-345: what DATA consumers read. = scope for real users / no override / admin-preview. For a VL admin
  // previewing manager/rep, a representative narrowed scope (within entitlement — Decision 39, corrected).
  effectiveScope: AuthScope;
  // HF-345: capabilities the menu/UI gates against. = capabilities, except a VL-admin manager/rep preview
  // uses that persona's ROLE_CAPABILITIES set.
  effectiveCapabilities: string[];
  // HF-345: the active VL-admin persona preview (null = none / not a VL admin). Hoisted from persona-context.
  personaOverride: PersonaKey | null;
  setPersonaOverride: (persona: PersonaKey | null) => void;
```

### PG-3 — VL admin + Rep override → `effectiveScope = { type: 'own', entityId }`
`web/src/lib/auth/scope.ts` (`resolveSampleScope`, rep branch):
```ts
    if (persona === 'rep') {
      const own = profileId ? await readOwnEntityId(profileId, tenantId, sb) : null;
      if (own) {
        resolved = { type: 'own', entityId: own };
      } else {
        // highest-payout entity for the tenant (the getRepDashboardData null→top fallback)
        const { data: top } = await sb
          .from('entity_period_outcomes')
          .select('entity_id, total_payout')
          .eq('tenant_id', tenantId)
          .order('total_payout', { ascending: false })
          .limit(1)
          .maybeSingle();
        const topId = (top?.entity_id as string | undefined) ?? null;
        if (topId) {
          resolved = { type: 'own', entityId: topId };
        } else {
          const { data: anyEnt } = await sb
            .from('entities').select('id')
            .eq('tenant_id', tenantId).eq('entity_type', 'individual').limit(1).maybeSingle();
          const anyId = (anyEnt?.id as string | undefined) ?? null;
          resolved = anyId ? { type: 'own', entityId: anyId } : DENY_SCOPE;
        }
      }
    } else {
```
Driven from auth-context's effectiveScope effect (below) when `personaOverride === 'rep'`.

### PG-4 — VL admin + Manager override → `effectiveScope = { type: 'team', entityIds }`
`web/src/lib/auth/scope.ts` (`resolveSampleScope`, manager branch):
```ts
    } else {
      // manager
      const team = profileId ? await resolveEntityScope(profileId, tenantId, sb) : DENY_SCOPE;
      if (team.type === 'team') {
        resolved = team;
      } else {
        const { data: ents } = await sb
          .from('entities').select('id')
          .eq('tenant_id', tenantId).eq('entity_type', 'individual').limit(10);
        const ids = (ents ?? []).map(e => e.id as string);
        resolved = ids.length ? { type: 'team', entityIds: ids } : DENY_SCOPE;
      }
    }
```

### PG-5 — VL admin + no override (or admin override) → `effectiveScope = scope` (ALL)
`web/src/lib/auth/scope.ts` (`resolveSampleScope` head — admin → ALL):
```ts
  if (persona === 'admin') return ALL_SCOPE;
  // HF-345 review: a manager/rep preview with NO selected tenant fails CLOSED (deny) — never ALL (it cannot
  // pick a representative entity without a tenant, and showing the whole tenant would not be a narrowed preview).
  if (!tenantId) return DENY_SCOPE;
```
`web/src/contexts/auth-context.tsx` (effectiveScope effect — the early-return is the no-override / admin-preview path):
```ts
  // effectiveScope = scope for a real user / no override / admin preview (synchronous). A VL-admin
  // manager/rep preview resolves a representative sample (the ONLY async — within this lifecycle, HALT-C).
  useEffect(() => {
    if (!isUserVLAdmin || !personaOverride || personaOverride === 'admin') {
      setEffectiveScope(scope);
      return;
    }
    let cancelled = false;
    resolveSampleScope(personaOverride, profileId, selectedTenantId)
      .then(s => { if (!cancelled) setEffectiveScope(s); })
      .catch(() => { if (!cancelled) setEffectiveScope(DENY_SCOPE); });
    return () => { cancelled = true; };
  }, [isUserVLAdmin, personaOverride, scope, profileId, selectedTenantId]);
```

### PG-6 — Real member login → `effectiveScope = scope = own` (non-VL-admin path unchanged)
For a non-VL-admin, `isUserVLAdmin` is `false`, so the effect's first branch (`!isUserVLAdmin → setEffectiveScope(scope)`)
ALWAYS runs — `effectiveScope === scope` for every real user. `scope` is the OB-246 authenticated-role scope
(member → `{type:'own'}`, manager → `{type:'team'}`), unchanged. The override is additionally forced null for a
non-VL-admin by the clear-effect (`web/src/contexts/auth-context.tsx`):
```ts
  useEffect(() => {
    if (!isLoading && personaOverride !== null && !isUserVLAdmin) setPersonaOverrideState(null);
  }, [personaOverride, isUserVLAdmin, isLoading]);
```
And persona-context maps its `PersonaScope` from `effectiveScope` (= scope for real users):
```ts
  const scope = useMemo<PersonaScope>(() => authScopeToPersonaScope(effectiveScope), [effectiveScope]);
```

### PG-7 — `hasCapability` evaluates `effectiveCapabilities` when override active
`web/src/contexts/auth-context.tsx`:
```ts
  const effectiveCapabilities = useMemo(() => {
    if (isUserVLAdmin && personaOverride && personaOverride !== 'admin') {
      return Array.from(getCapabilities(overrideRole(personaOverride)));
    }
    return capabilities;
  }, [isUserVLAdmin, personaOverride, capabilities]);

  // ── Capabilities (entity model check) ──
  const hasCapability = useCallback((capability: string): boolean => {
    // HF-345: a VL admin previewing a narrower persona is gated against THAT persona's capability set
    // (narrowing within entitlement — always safe). Real users + admin-preview + no-override unchanged.
    if (isUserVLAdmin && personaOverride && personaOverride !== 'admin') {
      return effectiveCapabilities.includes(capability);
    }
    // OB-246 (DS-014 §4): platform/admin inherit ALL capabilities (the REAL authenticated role).
    if (user && (user.role === 'platform' || user.role === 'admin')) return true;
    return capabilities.includes(capability);
  }, [isUserVLAdmin, personaOverride, effectiveCapabilities, user, capabilities]);
```

### PG-8 — All data consumers read `effectiveScope`, not `scope`
`grep -rn "effectiveScope" src/app src/components | grep "useAuth()"` (13 client consumers, all aliased so local var
names are unchanged):
```
src/app/insights/page.tsx:55:                    const { effectiveScope: scope } = useAuth();
src/app/insights/my-team/page.tsx:49:            const { effectiveScope: teamScope } = useAuth();
src/app/insights/compensation/page.tsx:104:       const { user, effectiveScope: scope } = useAuth();
src/app/insights/trends/page.tsx:80:              const { effectiveScope: scope } = useAuth();
src/app/insights/performance/page.tsx:123:        const { effectiveScope: scope } = useAuth();
src/app/insights/analytics/page.tsx:64:           const { effectiveScope: scope } = useAuth();
src/app/acceleration/page.tsx:64:                 const { effectiveScope: scope } = useAuth();
src/app/investigate/trace/[entityId]/page.tsx:34:  const { effectiveScope: scope } = useAuth();
src/app/stream/page.tsx:450:                     const { effectiveScope: authScope } = useAuth();
src/app/perform/page.tsx:120:                    const { user, effectiveScope: scope } = useAuth();
src/app/performance/adjustments/page.tsx:65:        const { effectiveScope: scope } = useAuth();
src/app/data/transactions/page.tsx:25:             const { effectiveScope: scope } = useAuth();
src/components/dashboards/ManagerDashboard.tsx:117:  const { effectiveScope: authScope } = useAuth();
```
`EntityTable` (`/insights/analytics`, `/insights/compensation`) receives `scope={scope}` from its callers, where
`scope` is now the aliased `effectiveScope`. The Financial pages + `/perform/statements` read `usePersona().scope`,
which maps from `effectiveScope` (PG-6 snippet) — so they narrow in preview too.

### PG-9 — API routes / middleware do NOT read `effectiveScope`
`grep -rn "effectiveScope" src/app/api src/middleware.ts`:
```
>>> NONE — clean
```
Server-side security uses the REAL authenticated identity, never the preview-narrowed value: API routes derive tenant
via `resolveCallerTenant` (session), middleware gates via `permissions.hasCapability(authenticatedRole, …)`. The real
`scope` remains on `AuthContextType` for any security check.

### PG-10 — VL admin + Rep override → sidebar shows member items only
`web/src/contexts/navigation-context.tsx:113`:
```ts
  const effectiveRole = (isVLAdmin && personaOverride) ? personaToRole(personaOverride) : userRole;
```
The sidebars (`VialuceSidebar`, `ChromeSidebar`) filter via `getAccessibleWorkspaces(effectiveRole)` +
`getWorkspaceRoutesForRole(activeWorkspace, effectiveRole)` (OB-246 capability PDP). For a VL admin previewing Rep,
`effectiveRole = personaToRole('rep') = 'sales_rep'` → resolves to `member` capabilities → the rail shows only
member-reachable routes (`/stream` via `view.intelligence_stream`, `/perform` via `view.own_results`, `/notifications`);
`/insights*`, Finance, Platform Core, etc. (which require `view.team_results` / admin caps) drop. A real user's
`effectiveRole = userRole` (unchanged). The override is `isVLAdmin`-gated.

### PG-11 — `npm run build` exits 0
```
> @vialuce/platform@0.1.0 prebuild
[korean-test-gate] PASS: zero hardcoded legacy primitive-name string literals outside registry
   Creating an optimized production build ...
 ✓ Compiled successfully
BUILD_EXIT=0
```
Corroborating: `tsc --noEmit` exit 0; `node --test` → `tests 294 / pass 294 / fail 0`.

### PG-12 — PR #604 amended (same branch, no new PR)
`git log --oneline` on `ob-246-rbac-menu-data-access` (branch in sync with `origin`):
```
c80eefb4 HF-345: completion report CORRECTIVE section + adversarial review outcome
cc6d700a HF-345 review fixes: tighten preview narrowing (4 real findings the verify-phase under-rated)
372e1f89 HF-345: persona override narrows scope + menu for VL-admin preview (PG-1..10)
19f293b2 HF-345 ADR + G0 (before code): hoist persona override into auth-context (Option A)
90771ac0 OB-246: record PR #604 URL (PG-18)
```
PR: https://github.com/CCAFRICA/spm-platform/pull/604 (OPEN, amended — no new PR). This report adds one further commit.

---

## 3. Browser verification steps (architect, SR-43)

- **VL admin, Admin persona** → $58,406 / 85 entities / full sidebar / all panels — **unchanged** (`effectiveScope = scope = all`).
- **VL admin, Rep persona** → entity-specific data (the sample/own entity's payout, e.g. `$1,505`), reduced sidebar
  (Intelligence `/stream` + `/perform` + `/notifications` only — no Finance / Platform Core / Insights analytics),
  RepDashboard scoped to the sample entity. `effectiveScope = {type:'own', entityId}`; `effectiveRole = sales_rep`.
- **VL admin, Manager persona** → team-scoped data (a subset of entities), manager sidebar (adds `/insights*`),
  ManagerDashboard with team data. `effectiveScope = {type:'team', entityIds}`.
- **Real member login** → own-entity scope, member sidebar. *(Blocked on OB-246 Residual 2: `entities.profile_id`
  linkage = 0 rows → DENY/empty expected today; the path is correct, the data is not yet seeded.)*
- **Cross-tenant API (regression guard)** → unchanged from OB-246: an authenticated tenant-A user still cannot read
  tenant B (API binds tenant from session, not from `effectiveScope`).

---

## 4. HALT dispositions

| HALT | Disposition |
|---|---|
| **A** (sample-resolution latency >500ms) | VL-admin-only, ≤3 indexed `maybeSingle`/`limit` reads; module-level `tenantId:persona:profileId` cache (TTL 5 min) in `lib/auth/scope.ts`. Not triggered. |
| **B** (`hasCapability`/`effectiveCapabilities` breaks middleware/API) | Not triggered — auth-context `hasCapability` is CLIENT-only; middleware uses `permissions.hasCapability(authenticatedRole,…)`, API uses `resolveCallerTenant` (session). **PG-9 grep proves zero server-side `effectiveScope`.** |
| **C** (second lifecycle / waterfall / loop) | Not triggered — `effectiveCapabilities` is a sync `useMemo`; `effectiveScope` is ONE reactive effect inside the existing auth lifecycle (no new context/hook); the only async is the sample resolution. |
| **D** (calc engine / SCI) | Not triggered — read-path + context only. `git diff --name-only main...HEAD | grep -iE "run-calculation|convergence-service|/sci/"` → CLEAN. |

**Adversarial review (commit `cc6d700a`):** a 3-dimension find→refute review (real-user byte-identical /
narrow-only-no-widen / lifecycle-no-loop) raised 6 candidates; the verify phase confirmed 0, but applying judgment
(the OB-246 lesson — do not rubber-stamp dismissals) **4 were genuinely real** and fixed: (1) `resolveSampleScope`
failed OPEN to ALL on a null tenant → now DENY for manager/rep; (2) sample cache key omitted `profileId` → added;
(3) `effectiveScope` went stale across a VL-admin tenant switch (the `scope` dep is the stable `ALL_SCOPE` ref) →
`selectedTenantId` captured into state (refreshed in `initAuth`, which re-runs on the switch navigation) + added to
the effect deps; (4) the clear-forged-override effect could wipe a legitimate VL admin's preview during the
auth-loading window → gated on `!isLoading`. The 2 dismissed were genuine non-issues (effectiveScope seeded to scope;
the sessionStorage read is `window`-guarded). No WIDEN, no real-user divergence, no API/middleware `effectiveScope`,
no render loop confirmed.

---

## 5. Out of scope / residuals

- **Real member/manager DATA verification** — still blocked on OB-246 Residual 2 (`entities.profile_id` linkage = 0
  rows). HF-345 makes the VL-admin preview correct; real-user verification follows after linkage seeding.
- **Financial module persona scoping** — separate directive; Financial API scope-derivation remains deferred (HALT-E).
- **Sample entity/team selection UI** — the preview auto-selects (highest-payout entity, first-10 entities). A UI to
  choose which entity/team to preview is a future enhancement (HF-345 §6A Residual 2).
- **Effective-scope tenant-change-without-navigation** — handled via `selectedTenantId` refreshed in `initAuth` (which
  re-runs on the tenant-switch navigation); a hypothetical non-navigating in-app tenant switch would need a re-toggle.

---

## 6. ARTIFACT SYNC

```
ARTIFACT SYNC
MC: HF-345 → COMPLETE (corrective on OB-246 / PR #604). Corrects OB-246 §3.1d/§3.3b.
REGISTRY: Access Control / Persona Scoping → the VL-admin persona PREVIEW is now functional (narrows data +
          menu within entitlement). PDR-05 evidence reinforced: scope/menu derive from authenticated identity for
          real users; the preview narrows only within an entitled VL-admin identity (never widens).
R1: tenant-isolation → still MET (API tenant-binding unchanged; effectiveScope never reaches server).
    access-control → REFINED: Decision 39 interpretation corrected (narrowing-within-entitlement is safe);
    real users byte-identical; VL-admin preview demonstrates each role's DS-014 §8.2 adaptation.
BOARD: CAPS delta for Access Control / RBAC — persona preview row moves from "cosmetic" to "functional
       (scope + menu)". Real-user behavior unchanged from OB-246.
SUBSTRATE: DS-014 §8.2, Decision 39 (corrected), Decision 123, OB-246 exercised. HALT-A/B/C/D dispositioned.
           Captured: "narrowing within entitlement is always safe" (Decision 39 corrected interpretation);
           "hoist override into auth-context as derived state" (effectiveScope/effectiveCapabilities pattern);
           "a verify-phase that defaults-to-refuted can under-rate real findings — apply judgment" (4 real fixes).
```

---

*HF-345 — Corrective: Persona Override Narrows Scope and Menu for VL Admin Preview*
*2026-06-26 · vialuce.ai · Intelligence. Acceleration. Performance.*
*Substrate: DS-014 §8.2 · Decision 39 (corrected) · Decision 123 · OB-246*
