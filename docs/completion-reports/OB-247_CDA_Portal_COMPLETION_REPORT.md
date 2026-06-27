# OB-247 — DS-032 Slice A: The Customer Data Administrator & The Focused Portal — Completion Report

**Branch:** `ob-247-cda-portal` (based on `ob-245-prism-slice1` @ `225f275b` — the OB-245 membrane; isolated worktree)
**Mode:** ULTRACODE. Implements DS-032 §11 Slice A on the DS-031 / OB-245 membrane.
**Date:** 2026-06-26

---

## CRF + PCD

**CRF**
- [x] Seed: OB-247 / Cite DS-032 §11-SliceA + DS-031 membrane + live capability matrix / Class: OB vertical slice / Mode: ULTRACODE.
- [x] OB-247 re-confirmed against the live registry: no `ob-247*` branch existed (clear).
- [x] Architecture Decision Gate cleared (ADR below).
- [x] Anti-Pattern Registry checked: **no parallel auth/persona path** — the CDA is added by extending the existing matrix / landing rule / MFA list / shell gate (additive cases). No registry-style validation (the role CHECK is a control-plane constraint, not a data taxonomy). Capabilities structural (`data.upload`, `view.own_uploads`), Korean-Test-clean.
- [x] CC paste block: none.

**PCD**
- [x] Built the full Slice A (401 fix + persona + landing + portal + MFA) — scope not narrowed.
- [x] Added the CDA by **extending** existing RBAC primitives — coordinated with OB-246 (additive cases, no parallel path). **No HALT-D** (collision analysis below).
- [x] A role migration WAS required (the `profiles_role_canon` CHECK) — authored + committed; **architect applies via SQL Editor (HALT-A)**; CC verifies via tsx.
- [x] Created the PR; **architect merges**, order coordinated with OB-246.

---

## 1. What shipped

A Customer Data Administrator authenticates (with MFA), lands **directly** in a focused, chromeless upload portal (`/portal`), uploads via the membrane, watches the luminous spine, is confirmed in customer voice, and sees **only their own** deliveries and **no operator surface**.

### Files
- **Phase 0:** `lib/prism/actor.ts` — 401 fix (canonical pattern).
- **RBAC:** `lib/auth/permissions.ts` (cda role + caps + alias + matrix + `/portal` workspace gate), `lib/auth/landing.ts` (new `landingPathForRole`).
- **Landing/MFA/shell:** `middleware.ts` (MFA + landing), `app/page.tsx` (landing), `components/layout/auth-shell.tsx` (chromeless `/portal`).
- **Portal:** `app/portal/layout.tsx` + `app/portal/page.tsx`. Customer voice via an additive `audience` param on `components/prism/{prism-status.ts,StatusSpine.tsx,SubmitDropzone.tsx}`.
- **Migration:** `web/supabase/migrations/20260626_ob247_cda_role.sql` (extend `profiles_role_canon`).
- **Seed + tests:** `scripts/ob247_seed_cda.ts`, `src/lib/auth/__tests__/ob247-cda.test.ts`.

---

## 2. Architecture Decision Gate — decisions

1. **Base = `ob-245-prism-slice1`** (the membrane must be present; OB-245 PR #605 is unmerged). The CDA RBAC cases are additive and merge cleanly with OB-246 (below) — no need to base off OB-246.
2. **401 root cause (Phase 0).** Confirmed: `resolveActor` required a non-null `profile.tenant_id`, but migration 005 makes `tenant_id` NULL for **platform** users — so every `/api/prism/*` 401'd the platform-admin tester (the OB-245 HALT-C finding). The profile RLS read itself works (`profiles_select_own`). **Fix** = the canonical pattern (`/api/comprehension`, `/api/periods`): `getUser()` is the sole auth gate; profile via service-role; effective tenant = `profile.tenant_id` OR the `vialuce-tenant-id` cookie for platform admins. No new auth path. Fixes operators **and** CDAs.
3. **Role needs a migration after all (HALT-A).** `profiles.role` is TEXT but constrained by `profiles_role_canon` (migration 017) to the 5 canonical roles. The CDA is a 6th canonical role → the constraint must admit `'cda'`. (The seed surfaced this; §3.4 anticipated it.)
4. **Chromeless portal mechanism.** Operator chrome lives in `AuthShell` (root layout) gated by a pathname check — not route groups. Adding `pathname.startsWith('/portal')` to its `showShell=false` gate suppresses sidebar/topbar/persona-switcher/workspace-nav while keeping the auth gate. The "no operator surface" invariant falls out of suppressing the shell.
5. **OB-246 collision = none (no HALT-D).** OB-246 touches `auth-context`/`persona-context`/`workspace-config`/`navigation-context` (+1 line in `permissions.ts`). OB-247 touches `actor.ts`, `permissions.ts` (distinct regions), `middleware.ts` (OB-246 doesn't), `auth-shell.tsx` (OB-246 doesn't), `page.tsx`, new files. **`auth-context.tsx` and `persona-context.tsx` are untouched.** The CDA even inherits OB-246's `AuthScope='own'` automatically (its `resolveAuthScope` fallthrough gives any non-platform/admin/manager role `own` once `resolveRole('cda')` is non-null). Persona-context avoided entirely (chromeless portal). Only `workspace-config.ts` was a theoretical risk — **skipped** (the portal is chromeless, so no nav entry is needed).

---

## 3. Proof gates

### Verified now

**Gates 2 (capabilities), 3 (landing), 4 (near-empty nav)** — `node --test src/lib/auth/__tests__/ob247-cda.test.ts`:
```
✔ cda is a canonical role (resolveRole)
✔ gate 2: cda has EXACTLY {data.upload, view.own_uploads} and nothing else
✔ gate 2: cda has NO operator capabilities
✔ gate 3: cda lands in the portal; operators land in /stream
✔ gate 4: cda has NO accessible operator workspaces (near-empty nav falls out of capabilities)
ℹ tests 5  ℹ pass 5  ℹ fail 0
```

**Gate 1 (401 → canonical pattern):** the `actor.ts` diff (getUser-gate-only + service-role profile + role-gated cookie tenant) reconciles to `/api/comprehension`. Root cause confirmed in live data — **all 3 platform/vl_admin profiles have NULL `tenant_id`** (so the old `!profile.tenant_id → 401` tripped for every platform admin, i.e. the architect's session). The live `401 → 200` is architect-verified in-browser after the migrations apply (the bucket/table from OB-245 must exist for prepare/commit/files to reach 200) — HALT-B.

**Gate 8 (no parallel path):** `git diff 225f275b HEAD --stat` — additive only; **`auth-context.tsx` / `persona-context.tsx` not in the diff**. The CDA is extended cases in the existing matrix/landing/MFA/shell.

**Build + typecheck:** `tsc --noEmit` 0 errors; `npm run build` exit 0; `/portal` + `/api/prism/*` built.

### Architect-gated

- **Gate 5 (functional upload loop):** needs the CDA seeded (HALT-A: the constraint migration) **and** OB-245's membrane migration (file_objects + ingest-quarantine) applied. Then a CDA upload advances received→scanning→cleared. HALT-B (browser).
- **Gate 6 (owner-scoped):** `/api/prism/files` is the RLS session client; `file_objects` owner branch = `owner_id = auth.uid()` → the CDA sees only their own. Verifiable once seeded.
- **Gate 7 (MFA):** `'cda'` ∈ `MFA_REQUIRED_ROLES`; middleware compares canonical role; a CDA at aal1 → `/auth/mfa/enroll` (standard Supabase TOTP, no bypass). HALT-B (browser).

The CDA seed (`ob247_seed_cda.ts`) created the auth user but the `profiles` insert was correctly **blocked by `profiles_role_canon`** until the migration applies — confirming the constraint is real and the migration is required. Re-run the seed after HALT-A to complete it (idempotent).

---

## 3.5 Adversarial review + fixes

A 4-dimension adversarial review ran against the auth-touching changes. **Invariants confirmed HOLD:** no parallel auth/persona path (`auth-context`/`persona-context` untouched; the CDA is extended cases); `getUser()` is the sole auth gate (no IDOR — tenant-bound users never reach the cookie branch; `owner_id` non-spoofable); MFA not weakened (canonical-role gate → enroll/verify, no bypass); owner-scoped isolation (RLS `owner_id = auth.uid()`). Findings fixed:

| Sev | Finding | Fix |
|---|---|---|
| HIGH | The constraint migration omitted live/written role aliases (`tenant_admin` from signup, `vl_admin`) → would abort on apply or break signup | Rewrote as a **superset**: all canonical roles + every alias the app writes + `cda`. Verified against live data (roles in use: admin/platform/manager/member — all preserved). |
| MED | Phase 0 cookie-tenant branch gated on data-shape (null tenant), not role | Now gated on `resolveRole(profile.role) === 'platform'` — fail-closed by role (matches `/api/comprehension`'s `isPlatform &&`). |
| MED | CDA could reach `/stream` (Intelligence Stream) by direct URL (not a restricted workspace) | Added `'/stream': 'view.intelligence_stream'` to `WORKSPACE_CAPABILITIES` → middleware blocks the CDA (no operator caps). |
| LOW | Portal sign-out was a 2nd impl (skipped tenant-cookie cleanup) | Use the canonical `useAuth().logout()`. |
| LOW | Stale comments (landing.ts re tenant-context; seed "no migration") | Corrected. |
| LOW | `/api/prism/files` polled twice on `/portal` (SubmitDropzone + page) | Left (functionally correct; 2 cheap RLS-scoped fetches). Noted. |

**Scope note (comprehensive operator-route lockout):** OB-247 blocks `/stream` and the routes already in `WORKSPACE_CAPABILITIES`; locking the CDA out of *every* operator route by direct URL (`/perform`, `/insights`, …) is **OB-246's** capability-gated access engine — the CDA contributes the zero-operator-capability profile that engine denies on. **Pre-existing (not OB-247):** the middleware MFA block is `try/catch` fail-open (`middleware.ts:309-311`) — unchanged here.

Re-verified post-fix: `tsc` 0 errors; tests 5/5; `npm run build` exit 0.

## 4. SR-39 compliance

| Standard | Mechanism |
|---|---|
| SOC 2 CC6 | Owner-scoped `file_objects` RLS (`owner_id = auth.uid()`); MFA/AAL2 for the CDA; append-only `file.*` audit (from the membrane). |
| OWASP | Phase 0 keeps `getUser()` as the auth gate; no IDOR (tenant cookie read only for platform admins, who are already cross-tenant authorized; tenant-bound users always use `profile.tenant_id`). |
| NIST SP 800-63B | Full MFA/AAL — `'cda'` enrolled in `MFA_REQUIRED_ROLES`, no magic-link/weak bypass. |
| DS-014 / DS-019 | Capability-derived portal + nav (`data.upload`/`view.own_uploads`); MFA via the existing auth path. |
| Decision 123 | The role constraint, the owner RLS, and the capability gating are structural. |

---

## 5. HALT status
- **HALT-A (migration apply):** ACTIVE — architect applies `20260626_ob247_cda_role.sql` (extends `profiles_role_canon`), then CC/architect re-runs `ob247_seed_cda.ts`. **Plus inherited:** OB-245's `20260626_ob245_prism_membrane.sql` must be applied for the upload loop (gate 5).
- **HALT-B (browser verification):** ACTIVE — architect verifies the portal/MFA/landing/no-operator-surface + the live 401→200 in-browser.
- **HALT-C (PR merge):** ACTIVE — architect merges, order coordinated with OB-246.
- **HALT-D (OB-246 collision):** NOT triggered — additive cases, clean merge.
- **HALT-E (scope narrowing):** none — all §3 elements shipped.

## 6. Residuals (§6A)
- **OB-245 relationship:** Phase 0 resolves OB-245's HALT-C 401. The fix lives on this branch (based on the membrane); the architect may cherry-pick it to PR #605 or merge OB-247 — coordination noted.
- **OB-246 coordination:** the CDA persona enrolls in OB-246's model automatically (AuthScope `own` fallthrough). Merge order architect-directed; the only adjacent file is `permissions.ts` (distinct regions → clean).
- **Slice B / C:** the four confidence panels, then the signal capture + learning loop.
- **Invite scaling (DS-032 §5):** Slice A seeds a CDA that logs in; the customer-admin self-serve CDA-invite affordance is a later refinement.
- `tenant-context.tsx:196` (post-tenant-select → `/stream`) is intentionally unchanged: it only fires for platform admins selecting a tenant; a CDA is tenant-bound and never hits it.
