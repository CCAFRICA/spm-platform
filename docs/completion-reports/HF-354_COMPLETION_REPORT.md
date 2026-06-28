# HF-354 — Tenant Fleet Card → Working Tenant Management Access

**Status:** ready to merge (CC authored/committed/PR'd; **architect merges + browser-confirms the card opens the working surface — SR-44**).
**Branch:** `hf-354-tenant-card-edit-access` (off `origin/main` d5d8fa5a).
**Mode:** ULTRACODE. **SQL:** **NONE** (UI/navigation/reachability only — §5.2).
**Deliverable:** unconditional — a platform admin reaches a *rendering* tenant-management surface from each Tenant Fleet card. **Delivered (working access), not investigated (I0).**

---

## §0 — CRF + collision gate
- [x] Seed: `HF-354 / Cite: platform admin cannot reach tenant management; restore the edit entry point on the Tenant Fleet cards / ULTRACODE / DELIVERABLE = working access, not investigation`.
- [x] **Collision gate:** `HF-354` appears only in the directive doc — no code/branch/PR collision.
- [x] **Architecture Decision Gate** recorded (§A — current-state finding + the repair).
- [x] **SR-39 gate (§5.3)** cleared.
- [x] Anti-Pattern Registry incl. the anti-narrowing clause I0 (§6A).

---

## §5.1 — Current-state finding (a step toward the fix; NOT the deliverable — I0)

Established from the live `main`, end to end, before building. The access path has TWO halves; one was already repaired, one was still broken:

**Half 1 — does the destination render / what redirects it? ALREADY REPAIRED (HF-353, on main, verified present):**
- `app/admin/tenants/page.tsx` is the real HF-352 surface (`RequireCapability platform.system_config` → selector + PRISM toggle + Clean Slate + Delete Tenant). It renders.
- The `/select-tenant` bounce was the **client tenant gate** in `auth-shell.tsx`. HF-353 added `/admin/tenants` to `TENANT_EXEMPT_ROUTES` (verified on main: `['/login','/select-tenant','/admin/tenants','/admin/tenants/new']`) → `shouldGateToSelectTenant` returns false → **no redirect**.
- Confirmed the other layers do NOT block: **middleware** `canAccessWorkspace('platform','/admin/tenants')` = `hasCapability('platform','platform.system_config')` = **true** (matches the `/admin` prefix in `WORKSPACE_CAPABILITIES`); `requiredFeatureForPath('/admin/tenants')` = `null` (no PRISM feature gate); there is **no** `app/admin/layout.tsx` guard; `RequireCapability` gates on `user.role` and renders an inline notice on denial (never a `/select-tenant` redirect). The only automatic `/select-tenant` redirects in the codebase are `middleware` (only `/` and `/login`) and `auth-shell` (now exempt for this route); the rest are explicit user-click "back to Observatory" handlers.

**Half 2 — the entry point on the card: STILL BROKEN (the real remaining gap HF-354 closes).**
HF-353's card entry was a **12px, muted, transparent icon-button buried in the card's header row** between the lifecycle badge and the chevron — while the obvious target (the entire card) navigates to the tenant's `/stream`. Result: a platform admin scanning the Observatory sees no recognizable way to *manage* a tenant → the lived experience is "there is no entry point," exactly as reported. **Per I0 the correct action is to repair this into a working, discoverable control — not to stop at "a control technically exists."**

**The repair (§A):** replace the buried icon with a **prominent, full-width, labeled "Manage tenant" control at the bottom of each card**, capability-gated, opening the existing HF-352 surface scoped to that tenant.

---

## §A — Architecture Decision Gate (the wiring)

- **Entry point (I1):** a full-width **"Manage tenant"** button (Settings icon + label, accent-tinted so it reads as a real action) at the bottom of every Tenant Fleet card in `ObservatoryTab.tsx`, below the next-action line. The card body keeps its distinct meaning (click = *enter* the tenant → `/stream`); the new button is the unmistakable *manage* path. `stopPropagation()` so it never also fires the card's enter-click.
- **Scoped reuse (I2):** the button does `router.push('/admin/tenants?tenant=<id>')`; the existing HF-352 surface reads `?tenant=` (HF-353, on main) and pre-selects that tenant — the toggle, Clean Slate, and Delete Tenant are present for it. **One surface; no parallel surface or route.**
- **Renders (I3):** reuses HF-353's exempt-route repair (verified present, §5.1). No redirect/404 for a `platform.system_config` admin, from the card or by URL.
- **Capability gate (I4):** the control renders only when `hasCapability(user.role, 'platform.system_config')` (added `useAuth` + `hasCapability` to the component). The Observatory is already platform-admin-only; this makes the gate explicit. **No role-string, no new role.** The route remains gated by `authorizePlatformObservability()`.
- **Destructive path (I5):** **untouched** — `git diff` over `lib/platform/` and `app/api/platform/tenants/[tenantId]/` is empty; HF-352 tests 9/9.

---

## §4 — Proof gates (evidence)

> Reachability is the deliverable → the architect browser-confirms (SR-44). CC proves the code-level facts.

- **P1 — Card control exists + gated (I1/I4).** Each card renders a prominent "Manage tenant" button under `{canManageTenants && …}`, `canManageTenants = hasCapability(user.role,'platform.system_config')`. *Grep shows the gated control + zero role-string. **Architect browser-confirms** the control on the card.*
- **P2 — Opens the surface, scoped to the tenant (I2).** Button → `/admin/tenants?tenant=<id>`; surface pre-selects via `?tenant=` (on main). *Code wiring shown. **Architect browser-confirms** card → surface with the toggle/Clean Slate/Delete present for that tenant.*
- **P3 — Surface renders, no redirect/404 (I3).** Exempt route (auth-shell) + middleware pass + no admin-layout guard, all verified (§5.1). *The corrected cause is HF-353's `TENANT_EXEMPT_ROUTES` (present on main). **Architect browser-confirms** the surface renders.*
- **P4 — Reuse, not rebuild (I2/I5).** Single `app/admin/tenants/page.tsx`; destructive engine/routes byte-identical; HF-352 tests **9/9**. *`git diff --stat` over `lib/platform/` + destructive routes = empty.*
- **P5 — The prism toggle works from here (the unblock).** The reached surface mounts `PrismCapabilityToggle` for the selected tenant → `prism_enabled` flips via the existing audited route. *Component present on the surface; route unchanged. **Architect browser-confirms** Casa Diaz can be enabled from the card path.*

**Build / dev:** `tsc --noEmit` clean (only the pre-existing hf350 test-file `--target` error remains, untouched); `rm -rf .next && npm run build` → `✓ Compiled successfully`, BUILD_ID present, `ƒ /admin/tenants` (5.63 kB) + `ƒ /select-tenant` (6.16 kB) compiled; `npm run dev` → `localhost:3000` responds (HTTP 307 = unauth → /login; the authed VL-admin client path is the architect's walk).

---

## §5.2 / §5.3
- **§5.2 (Schema):** **no SQL.** Only `ObservatoryTab.tsx` (the card control). No table, query, or DDL.
- **§5.3 (SR-39):** the control renders only for `platform.system_config` holders (`hasCapability` gate) inside the already-platform-only Observatory; the destination route is gated by `authorizePlatformObservability()` and the middleware `/admin` capability map. The change exposes nothing to non-admins. SOC 2 CC6 / DS-014 / Decision 123 consistent.

---

## §6A — Anti-Pattern Registry — PASS
- **No scope narrowing; no investigation-as-deliverable (I0)** — the §5.1 finding fed the repair; the output is a working, discoverable entry point + verified-rendering destination, not a report. The half that was broken (the buried entry point) was repaired, not described.
- **Entry point on the card (I1)** — prominent, full-width, labeled; not buried.
- **Reuse the existing surface; no parallel surface/route (I2)** — one destination, `?tenant=` scoped.
- **Surface actually renders (I3)** — exempt route + middleware pass + no layout guard verified.
- **Capability-gated; no role-string; no new role (I4).**
- **No destructive-path change (I5)** — HF-352 engine + confirmation untouched; tests green.
- **No registry / set-membership** — capability-gated structurally.
- **No LLM / data-pipeline change (I6)** — Decision 158 preserved.

## §F — Files
**Edited (1):** `web/src/components/platform/ObservatoryTab.tsx` — removed the buried 12px header icon-button; added the prominent capability-gated full-width "Manage tenant" control at the bottom of each card; added `useAuth` + `hasCapability` for the I4 gate. **No new files; no SQL; no destructive/engine change.** (Reuses HF-353's on-main exempt-route repair + `?tenant=` pre-select for the destination.)

*This file is the prompt (DD-11). It ends at §6A.*
