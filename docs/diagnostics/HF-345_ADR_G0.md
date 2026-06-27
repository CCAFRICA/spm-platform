# HF-345 — Architecture Decision Record + G0 (BEFORE code)

*Corrective: Persona Override Narrows Scope and Menu for VL Admin Preview*
*Branch: `ob-246-rbac-menu-data-access` (HF-345 commits amend PR #604 — NOT a new PR)*
*Date: 2026-06-26 · Substrate: DS-014 §8.2 · Decision 39 (corrected) · Decision 123 · OB-246*
*Standing rules: CC_STANDING_ARCHITECTURE_RULES.md v3.0 Section B (this gate)*

---

## §0 — Pre-flight

| Check | Result |
|---|---|
| HF sequence | No prior HF-345 in `docs/`; directive at `docs/vp-prompts/HF-345_DIRECTIVE_20260626.md`. **HF-345 correct.** |
| Branch / PR | Commit on `ob-246-rbac-menu-data-access` (PR #604 open) — amend, no new PR (directive §3.4). |
| What OB-246 got right | AuthScope union, single `initAuth` lifecycle, fail-closed reader, override gated by `isVLAdmin`, capability-gated menu, API session-binding, 8 fns accept AuthScope, empty-means-all closed, real-user scope from authenticated role — **ALL PRESERVED.** |
| What this HF corrects | OB-246 §3.1d/§3.3b made the persona override cosmetic on scope+menu (a VL admin saw tenant-wide data + full sidebar for every persona). Decision 39 (corrected): narrowing WITHIN entitlement is always safe; an entitled VL admin previewing a narrower role is not widening. |

---

## §1 — The architectural question + decision

**Problem:** `effectiveScope`/`effectiveCapabilities` must live on `AuthContextType` (directive §3.1/§3.2) and be
"computed INSIDE auth-context, reacting to the persona override change" (§3.1). But the persona override currently
lives in `persona-context`, and the sample-entity resolution for a manager/rep preview needs the **selected
tenant** — which lives in `tenant-context` (below auth-context: `tenant-context.tsx:119` does `useAuth()`).

**Key enabling facts (verified):**
- For a VL admin the selected tenant is in `sessionStorage('vialuce_admin_tenant')` / cookie `vialuce-tenant-id`
  (`tenant-context.tsx:155-160`) — **auth-context can read it directly** (it already manipulates these in `logout`).
- Selecting a tenant **navigates** (`router.push('/')`), which re-runs `initAuth` → the override effect re-seeds on
  tenant change (no stale-tenant edge in practice).

### Option A — Hoist the persona override into auth-context (CHOSEN)
auth-context becomes the single owner of all auth-derived state: `scope` (real), `personaOverride` (hoisted from
persona-context, keeping its `isVLAdmin` gate + sessionStorage sync), `effectiveCapabilities` (sync `useMemo`),
`effectiveScope` (state + one reactive effect that does the async sample-resolution for manager/rep preview, reading
the VL-admin tenant from storage). persona-context + navigation-context CONSUME the hoisted override via `useAuth()`.
- Scale/AI-first/transport/atomicity: ✅ — sample = ≤3 indexed reads, VL-admin-only, cached by `tenantId:persona`;
  zero hardcoding; reads only; fail-CLOSED to `deny` when no entities.
- Matches §3.1 literally ("computed INSIDE auth-context, reacting to the override"); single lifecycle (HALT-C).

### Option B — Keep override in persona-context; push effective values UP to auth-context state via a setter
- ❌ child-pushes-to-parent state (render-loop risk), and contradicts §3.1 ("computed INSIDE auth-context"). REJECTED.

### Option C — A new EffectiveAuthProvider below tenant-context
- ❌ a second context/lifecycle — the exact HF-343 `useAuthScope` regression HALT-C forbids. REJECTED.

```
CHOSEN: Option A — hoist the override into auth-context; effectiveCapabilities = sync useMemo; effectiveScope =
        state + ONE reactive effect (sample-resolution within the existing lifecycle); selected tenant read from
        sessionStorage/cookie (the same source tenant-context uses for VL admins).
REJECTED: B (child→parent state push, render loops) and C (second lifecycle — HF-343 regression / HALT-C).
```

### Consumer flip (minimal-diff)
Every CLIENT `useAuth().scope` data consumer (~13: insights*, perform, stream, acceleration, my-team,
data/transactions, ManagerDashboard, investigate/trace, adjustments) flips to `effectiveScope` via destructure ALIAS
(`const { effectiveScope: scope } = useAuth()`) — local var names unchanged, zero downstream edits. EntityTable
narrows automatically (its callers pass the aliased `scope`). Financial pages + statements + ManagerDashboard's
`getManagerDashboardData` narrow because `persona-context.scope` now maps from `effectiveScope` (HALT-C bridge).
`scope` (real) stays on the context for any security check; **no API route / middleware reads `effectiveScope`**
(API uses `resolveCallerTenant`/session; middleware uses `permissions.hasCapability(authenticatedRole, …)`).

---

## §2 — GOVERNING PRINCIPLES (G1–G6)

- **G1/G2:** DS-014 §8.2 (elements adapt by capability) + Decision 39 (corrected: narrowing-within-entitlement is
  safe). Embodiment: `effectiveScope`/`effectiveCapabilities` are DERIVED inside the one auth lifecycle from
  `scope + override + isVLAdmin`; a real user (override gated off) has `effectiveScope === scope` structurally — the
  preview cannot widen, only narrow within an entitled identity.
- **G3:** auditor reads `effectiveScope` derivation + `hasCapability` override branch → sees the preview narrows, the
  real path is untouched.
- **G4:** least privilege / principle-of-least-astonishment — the preview shows what the role *actually* experiences
  (Decision 123 transparent compliance), not admin data through a themed lens.
- **G5:** domain-agnostic (scope discriminants over entity sets).
- **G6:** no speculation — derived state + one reactive effect, the standard React pattern.

---

## §3 — HALT dispositions

| HALT | Disposition |
|---|---|
| **A** (sample-resolution latency >500ms) | VL-admin-only, ≤3 indexed `maybeSingle`/`limit` reads; add a module-level `tenantId:persona` cache (TTL) in `lib/auth/scope.ts` (directive permits; Residual 3). Will report measured latency. |
| **B** (`hasCapability` vs effectiveCapabilities breaks middleware/API) | auth-context `hasCapability` is CLIENT-only (RequireCapability + sidebar). Middleware uses `permissions.hasCapability(authenticatedRole, …)` (server, real role); API uses `resolveCallerTenant` (session). Neither reads the client `hasCapability` or `effectiveCapabilities`. Verified — no server path touched. |
| **C** (second lifecycle / waterfall) | Option A keeps ONE lifecycle: `effectiveCapabilities` is a sync `useMemo`; `effectiveScope` is one reactive effect inside auth-context (no new context/hook). The only async is sample-resolution (§3.3), inside the existing lifecycle. |
| **D** (calc engine / SCI) | Not touched — read-path + context only. `git diff --stat` will confirm `run-calculation.ts`/`convergence-service.ts`/SCI absent. |

**Behavior preservation:** REAL users (member/manager/admin login) — `effectiveScope === scope`,
`effectiveCapabilities === capabilities`, `effectiveRole === authenticated` — **byte-identical to OB-246**. The ONLY
change is for a VL admin WITH an active override (gated), whose preview now narrows scope + menu within entitlement.

*HF-345 ADR · committed before implementation per Section B.*
