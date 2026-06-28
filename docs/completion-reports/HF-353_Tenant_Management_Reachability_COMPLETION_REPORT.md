# HF-353 — Tenant Management Reachability (Verify the Surface · Restore the Entry Point · Honest Labels)

**Status:** ready to merge (CC authored/committed/PR'd; **architect merges + performs the navigability walk — SR-44**).
**Branch:** `hf-353-tenant-management-reachability` (off `origin/main` d7afce99 — has HF-352 #616).
**Mode:** ULTRACODE. **SQL:** **NONE** (navigation + labels only — §5.2 noted).
**Branch taken:** **EXISTS** — the HF-352 surface is real and complete; the defect is reachability, not absence.

---

## §0 — CRF + collision gate
- [x] Seed: `HF-353 / Cite: /admin/tenants redirects to /select-tenant — surface unreachable, existence unverified; queue labels dishonest; edit-Tenant entry missing from cards / ULTRACODE`.
- [x] **Collision gate:** `HF-353` appears only in the directive doc — no code/branch/PR collision.
- [x] **Reality Gate 0 (§5.1)** cleared and recorded BEFORE any build (§P0).
- [x] **Architecture Decision Gate** recorded (branch + fix, §A).
- [x] **SR-39 gate (§5.3)** cleared — the fix does not bypass the capability gate (§5.3).
- [x] Anti-Pattern Registry pass (§6A).

---

## §P0 — REALITY GATE 0 (the finding — front and center; I1)

**Established from the live codebase + the redirect trace, NOT the HF-352 report:**

**(a) Does the surface exist / can it render?** **YES — real and complete.** `web/src/app/admin/tenants/page.tsx` (≈180 lines) renders `RequireCapability capability="platform.system_config"` → `TenantManagementInner`: a tenant selector, the relocated `PrismCapabilityToggle`, **Clean Slate** (cascade-aware category checkboxes), **Delete Tenant**, and two `DestructiveConfirmModal`s wired to `/api/platform/tenants/[id]/clean-slate` and `/delete`. Not a stub. The HF-352 destructive engine (`lib/platform/tenant-deletion.ts`, `confirm-challenge.ts`) is present. → **EXISTS branch; no rebuild.**

**(b) What intercepts `/admin/tenants` → `/select-tenant`?** The **client-side tenant gate** in `web/src/components/layout/auth-shell.tsx` (`AuthShellProtected`). `TENANT_EXEMPT_ROUTES` (line 23) listed `/login`, `/select-tenant`, `/admin/tenants/new` — **but NOT `/admin/tenants`.** So for an authenticated platform admin with **no selected tenant**, `shouldGateToSelectTenant({ isVLAdmin: true, hasTenant: false, isTenantExempt: false, … })` returns true (`lib/auth/tenant-gate.ts:31`) → `router.push('/select-tenant')` (auth-shell.tsx:156) and the surface renders `null` (auth-shell.tsx:216). **The middleware is NOT the cause** — on a workspace-permission denial it redirects to `/unauthorized`, not `/select-tenant`; and `canAccessWorkspace('platform', '/admin/tenants')` passes (the HF-352 nav route grants platform `platform.system_config`). The observed `/select-tenant` symptom is dispositive: it can only come from the client gate.

**(c) Remnants of the historical edit-Tenant card entry?** None under that name in git history; the fleet cards in `ObservatoryTab.tsx` are single "click to enter tenant" buttons with no manage/edit affordance. Restored fresh (matching the existing card visual language), not recovered.

**Bonus finding (the dishonest labels' true mechanism):** the Operations Queue API (`observatory/route.ts`) sets `href: '/select-tenant'`, but the **client ignores `href`** — `ObservatoryTab.tsx` (old lines 292–297) mapped the *label* through `ACTION_ROUTES` so **all three** labels (`View Tenant` / `Run Calculation` / `Resume`) resolved to **`/operate`**. One behavior (enter the tenant, land on `/operate`) wearing three names. The second builder `platform-queries.ts:getOperationsQueue` is **dead** (no importer) and sets no `action` — no second copy to fix.

---

## §A — Architecture Decision Gate (EXISTS branch — the fix)

Three reachability corrections + one honesty correction, all navigation/label only:

1. **(a) URL-reachable** — add `/admin/tenants` to `TENANT_EXEMPT_ROUTES` (auth-shell.tsx). A platform-wide management surface that operates on a tenant chosen *in-page* must not require a *pre-selected* tenant — exactly the reason `/admin/tenants/new` is already exempt. The capability gate is untouched (the exemption removes the tenant **precondition**, not access control). Comment in `tenant-gate.ts` updated to match.
2. **(b) Entry point restored** — a **"Manage"** button on each tenant fleet card (`ObservatoryTab.tsx`) → `/admin/tenants?tenant=<id>`, opening the **existing** HF-352 surface pre-selected for that tenant. The card became a `role="button"` div (with Enter/Space keyboard handling) so the real `<button>` nests validly; the Manage button `stopPropagation()`s so it doesn't also fire the card's enter-tenant click. The surface reads `?tenant=` from the URL (client-only, no `useSearchParams` Suspense dependency) and pre-selects once the list loads.
3. **(c) Honest labels** — all three queue actions relabeled to **"Go to tenant"** (observatory/route.ts) and the label-keyed `ACTION_ROUTES` map removed in favor of a single `handleSelectTenant(tenantId, '/operate')`. **Behavior unchanged** (still `/operate`); the three names that implied three actions collapse to the one thing the button does.

---

## §B — §5.1 / §5.2 / §5.3 gates
- **§5.1 (Reality Gate 0):** completed above (§P0) before any edit.
- **§5.2 (Schema):** **no SQL.** This HF touches only client navigation (auth-shell, ObservatoryTab, the surface's query-param read) and one API string (the queue label). No table, no DDL, no query change.
- **§5.3 (SR-39):** the exemption is orthogonal to access control. `/admin/tenants` remains protected by (1) the middleware capability/workspace gate, (2) `RequireCapability platform.system_config` on the page, (3) `authorizePlatformObservability()` on every `/api/platform/tenants/*` route. The client tenant gate only ever applied to VL admins (`isVLAdmin && !hasTenant`); exempting one route from it cannot expose the surface to a non-admin. The Manage card entry is rendered only inside the platform-admin-only Observatory (`/select-tenant` → `PlatformObservatory`). SOC 2 CC6 / DS-014 / Decision 123 consistent.

---

## §4 — Proof gates (evidence)

> Per the directive: a reachability defect ("tests green but the human can't get there") is not unit-testable. CC proves the **code-level** facts; the **architect** confirms the **browser** navigability (SR-44). No PASS/FAIL self-attestation of reachability.

- **P0 — Reality established (I1/I3).** §P0 above: surface EXISTS (real, gated); redirect cause = the `TENANT_EXEMPT_ROUTES` omission in auth-shell.tsx (traced, not the middleware). → EXISTS branch.
- **P1 — URL-reachable (I2).** `TENANT_EXEMPT_ROUTES` now includes `/admin/tenants` → `shouldGateToSelectTenant` returns false for it (`isTenantExempt = true`) → no wrongful bounce. *Code change in auth-shell.tsx:29. **Architect browser-confirms** a platform admin with no selected tenant reaches the surface by URL.*
- **P2 — Entry point restored (I4).** Each fleet card carries a "Manage" button → `/admin/tenants?tenant=<id>`; the surface pre-selects that tenant. *Code in ObservatoryTab.tsx + page.tsx. **Architect browser-confirms** card → surface.*
- **P3 — Honest labels (I5).** All three queue actions now read "Go to tenant"; the label-keyed route map is gone; behavior (`/operate`) unchanged. *observatory/route.ts + ObservatoryTab.tsx. **Architect browser-confirms.***
- **P4 — Reuse, not rebuild (I6).** The Manage entry opens the SINGLE existing surface (`/admin/tenants`); no parallel surface/route created; gate is the existing `platform.system_config`. *Grep: one `app/admin/tenants/page.tsx`; zero new routes; zero role-string added.*
- **P5 — Destructive path untouched (I7).** `git diff --stat` over `tenant-deletion.ts`, `confirm-challenge.ts`, and the clean-slate/delete/confirm-challenge routes = **empty**. HF-352 platform tests **9/9 pass** (`node --test`).

**Build / dev:** `tsc --noEmit` clean (only the pre-existing hf350 test-file `--target` error remains, untouched); `rm -rf .next && npm run build` → `✓ Compiled successfully`, BUILD_ID present, route table shows `ƒ /admin/tenants` (5.63 kB) + `/admin/tenants/new` + `/select-tenant`, artifact `.next/server/app/admin/tenants/page.js` present; `npm run dev` → `localhost:3000` responds (HTTP 307 = unauth → /login, expected; the client tenant-gate path is exercised only by an authenticated VL admin → the architect's walk).

---

## §6A — Anti-Pattern Registry — PASS
- **No building on an unverified claim** (I1) — Reality Gate 0 ran first; the HF-352 report was checked, not trusted (it was accurate; the gap was the auth-shell exemption).
- **No "tests pass" = "reachable"** (I2) — navigability is the deliverable; CC proves code-level facts, architect walks the browser.
- **No silent rebuild past an absent surface** (I3) — surface existed; no rebuild. (HALT branch not taken, correctly.)
- **No parallel surface / route / role-string / new role** (I6) — one surface reused, existing capability gate, zero role-string.
- **No dishonest label** (I5) — "Go to tenant" says what it does; the three-names-one-action mechanism removed.
- **No destructive-path change** (I7) — HF-352 engine + confirmation + destructive routes byte-identical; tests green.
- **No registry / set-membership** — capability-gated structurally.
- **No LLM / data-pipeline change** (I8) — Decision 158 intact.

## §F — Files
**Edited (5):** `components/layout/auth-shell.tsx` (exempt `/admin/tenants` from the tenant gate); `lib/auth/tenant-gate.ts` (comment parity); `app/api/platform/observatory/route.ts` (3 labels → "Go to tenant"); `components/platform/ObservatoryTab.tsx` (Manage card entry + card→div a11y + queue onClick simplified); `app/admin/tenants/page.tsx` (read `?tenant=` deep-link → pre-select). **No new files; no SQL; no engine change.**

*This file is the prompt (DD-11). It ends at §6A.*
