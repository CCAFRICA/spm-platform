# DIAG-062 — SABOR USERS: PROFILE-MISSING CENSUS (OUTPUT)

**Type:** DIAG (read-only; evidence only — Rule 23, zero product code)
**Date:** 2026-06-10
**Branch:** `diag-062-sabor-profile-census` (cut from `origin/main` @ `ab958dd1`)
**Deploy anchor:** `54416d6b` (2026-06-10 08:34:45 -0700 / 15:34:45Z)
**Method:** service-role READS only (SR-44 — no DDL, no mutation, no session mint). `npx tsx` census via `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `web/.env.local`. Probe scripts run from `web/` and deleted (no product code shipped).

---

## HEADLINE (facts only; the architect interprets)

1. **E1 — the error string traces to the no-profile branch.** `'Account found but profile is missing. Contact your administrator.'` is returned by `auth-context.tsx:256` when `fetchCurrentProfile()` returns `null`; `fetchCurrentProfile` returns null only when `resolveIdentity` returns null; on the login path the null arises from the **zero-rows** branch (`resolve-identity.ts:91-94`, event `identity.resolve.zero_rows`). **HALT-1 NOT triggered** — provenance matches the class hypothesis' branch.
2. **E3/E4/E5 — the data does NOT match the orphan hypothesis.** All 3 Sabor auth users exist; all 3 have a `profiles` row in the correct tenant (`f7093bcc-…`) with the correct role; **every `auth_user_id` is correctly linked.** Join diff: auth-without-profile = **0**, dead-link profiles = **0**, correctly-linked = **3** (incl. `admin@saborgrupo.mx`).
3. **E6 — no Sabor no-profile event exists.** `identity.resolve.zero_rows` count in `platform_events` = **0 (ever)**. No `auth.login.failure` for the 3 Sabor auth ids since deploy. `admin@saborgrupo.mx` (auth `72f821b1…`) **did authenticate today** — its id appears in an `auth.session.expired.idle` event at 17:12:40Z, and `last_sign_in_at` = 17:12:39Z.
4. **Code-traced limitation on E6's negative.** `logAuthEvent` (auth-logger.ts:61) **returns early when `SUPABASE_SERVICE_ROLE_KEY` is absent** — i.e. on the **client**. The login profile-fetch path (`fetchCurrentProfile` → `resolveIdentity`) runs **client-side** (browser `createClient`, auth-service.ts:175). Therefore a zero-rows hit on the *browser login path* is **structurally unrecordable** in `platform_events`. The 8 `identity.resolve.duplicate_rows` events that DO exist were emitted server-side (middleware path). E6's empty Sabor result is consistent with BOTH "branch never fired for Sabor" AND "branch fired client-side but cannot self-record" — E6 alone cannot distinguish them. E3-E5 (the data census) is the load-bearing evidence, and it shows healthy, linked profiles.

> The data census falsifies the orphan-pass class hypothesis (§1 of the directive): there are no orphaned auth users and no dead-link profiles for Sabor. Reconciliation between the architect's browser-eyewitness PROFILE MISSING and this healthy data state is the architect's to draw — no cause is ranked here.

---

## E1 — ERROR PROVENANCE (Rule 21 chain)

**Chain:** `auth success → fetchCurrentProfile → resolveIdentity (zero-rows branch) → null → UI surface`

```
auth success:    web/src/contexts/auth-context.tsx:240   await signInWithEmail(email, password)   // no throw = authenticated
profile fetch:   web/src/contexts/auth-context.tsx:254   const profile = await fetchCurrentProfile()
  delegates to:  web/src/lib/supabase/auth-service.ts:189 const identity = await resolveIdentity(supabase, user.id)
  no-profile br: web/src/lib/auth/resolve-identity.ts:91-94
                   if (!rows || rows.length === 0) {
                     void logAuthEvent('identity.resolve.zero_rows', { authUserId }, authUserId);  // <-- platform_events event name
                     return null;
                   }
  null mapped:   web/src/lib/supabase/auth-service.ts:190-192  if (!identity) return null;
UI surface:      web/src/contexts/auth-context.tsx:255-256
                   if (!profile) {
                     return { success: false, error: 'Account found but profile is missing. Contact your administrator.' };
                   }
```

**`platform_events` event name for this branch:** `identity.resolve.zero_rows` (declared auth-logger.ts:28).

**Client-side silencing of that event (auth-logger.ts:58-62):**
```
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) return; // Not server-side — skip
```
`fetchCurrentProfile` uses the **browser** client (`auth-service.ts:12 import { createClient } from './client'`; `client.ts:27`), so on the login path `SUPABASE_SERVICE_ROLE_KEY` is undefined and the event write is skipped.

---

## E2 — EXPECTED SET (canonical Sabor users)

**In-repo source:** `docs/vp-prompts/FRMX_RESEED_SABOR_GRUPO_GASTRONOMICO.md` (§"PROFILES", lines 208-214) and the writer `web/scripts/frmx/p3-profiles.ts:4-6`. Slug `sabor-grupo`.

| display_name | email | role | capabilities |
|---|---|---|---|
| Carlos Mendoza | admin@saborgrupo.mx | admin | `{admin, financial, icm}` |
| Ana Martínez | gerente@saborgrupo.mx | manager | `{manager, financial}` |
| Diego Ramírez | mesero@saborgrupo.mx | sales_rep | `{rep}` |

(Note: `web/scripts/seed-sabor-grupo.ts:37` carries a stale `TENANT_ID = 10000000-0001-…`; the live tenant resolved by slug is `f7093bcc-…` — see T0. The FRMX p3 writer resolves by slug and is the current canonical source.)

---

## E3 — auth.users CENSUS (`%saborgrupo%`)

Source: `auth.admin.listUsers` (paginated). `providers: []` / `identities_len: null` is the **known `listUsers` reporting artifact** (see prior finding `supabase-listusers-identities-null`), NOT proof of a missing provider — the `last_sign_in_at` values and E6's `session.expired.idle` for `72f821b1…` evidence that password auth succeeds.

| email | auth id | email_confirmed_at | created_at | last_sign_in_at |
|---|---|---|---|---|
| admin@saborgrupo.mx | `72f821b1-2e31-4266-ac5d-7c977f6569e8` | 2026-06-03T05:57:32Z | 2026-06-03T05:57:32Z | **2026-06-10T17:12:39Z** |
| gerente@saborgrupo.mx | `a32195f7-e479-4c24-ab82-cf9f5f05a27b` | 2026-06-03T05:57:32Z | 2026-06-03T05:57:32Z | 2026-06-09T20:01:09Z |
| mesero@saborgrupo.mx | `0c2d0238-b627-44d4-9dd3-162c221db5a5` | 2026-06-03T05:57:33Z | 2026-06-03T05:57:33Z | 2026-06-09T20:01:29Z |

Full JSON paste: Appendix A.

---

## E4 — profiles CENSUS (tenant `f7093bcc-e90b-4918-9680-69da7952dd65`)

Schema-verified columns (live probe): `id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at`.

| profile id | auth_user_id | email | role | display_name |
|---|---|---|---|---|
| `dad5ab3d-…` | `72f821b1-…` | admin@saborgrupo.mx | admin | Carlos Mendoza |
| `07fa3350-…` | `a32195f7-…` | gerente@saborgrupo.mx | manager | Ana Martínez |
| `e555dff1-…` | `0c2d0238-…` | mesero@saborgrupo.mx | sales_rep | Diego Ramírez |

A second read `profiles WHERE email ILIKE '%saborgrupo%'` (any tenant) returned the **same 3 rows** — no Sabor-email profile exists outside tenant `f7093bcc`. Full JSON paste: Appendix B.

---

## E5 — JOIN DIFF (the deliverable)

- **(a) auth users with NO matching profile:** `[]` — none.
- **(b) profiles with a dead `auth_user_id` link:** `[]` — none.
- **(c) correctly linked:** all three —
  - `admin@saborgrupo.mx` → `72f821b1-…` ✅ **(placed here explicitly)**
  - `gerente@saborgrupo.mx` → `a32195f7-…` ✅
  - `mesero@saborgrupo.mx` → `0c2d0238-…` ✅

The auth↔profile linkage is intact for all three personas.

---

## E6 — EVENT RECORD (`platform_events` since deploy `54416d6b`)

- Events since deploy (all types): **61**. Filtered to the 3 Sabor auth ids / tenant / sabor-email payloads: **0** matching `identity.resolve.*` or `auth.login.failure`.
- `identity.resolve.zero_rows` in the table: **0 (ever).** `identity.resolve.query_error`: **0.**
- Only `identity.resolve.*` events that exist: **8 × `identity.resolve.duplicate_rows`**, actor `9c179b53-…` (a non-Sabor / multi-profile platform user), 2026-06-10 05:03Z.
- **Sabor-relevant event:** `auth.session.expired.idle`, actor `72f821b1-…` (= admin@saborgrupo.mx), **2026-06-10T17:12:40Z** — i.e. that auth user held a session.
- `auth.login.success` is recorded **262×** overall and **4×** since deploy (actors `9c179b53`, `e6e13eee`, `ee18f0e5` — none of the 3 Sabor ids). Interpretation of that absence is bounded by E1's client-side-silencing trace.

Full event dump + histogram: Appendix C.

---

## APPENDIX A — E3 full JSON
```json
[
  {"id":"0c2d0238-b627-44d4-9dd3-162c221db5a5","email":"mesero@saborgrupo.mx","providers":[],"identities_len":null,"email_confirmed_at":"2026-06-03T05:57:33.326187Z","created_at":"2026-06-03T05:57:33.323284Z","last_sign_in_at":"2026-06-09T20:01:29.224474Z"},
  {"id":"a32195f7-e479-4c24-ab82-cf9f5f05a27b","email":"gerente@saborgrupo.mx","providers":[],"identities_len":null,"email_confirmed_at":"2026-06-03T05:57:32.89495Z","created_at":"2026-06-03T05:57:32.891809Z","last_sign_in_at":"2026-06-09T20:01:09.210029Z"},
  {"id":"72f821b1-2e31-4266-ac5d-7c977f6569e8","email":"admin@saborgrupo.mx","providers":[],"identities_len":null,"email_confirmed_at":"2026-06-03T05:57:32.400229Z","created_at":"2026-06-03T05:57:32.383507Z","last_sign_in_at":"2026-06-10T17:12:39.468223Z"}
]
```

## APPENDIX B — E4 full JSON (by tenant_id)
```json
[
  {"id":"dad5ab3d-cf94-4430-9b47-a88a74028e36","auth_user_id":"72f821b1-2e31-4266-ac5d-7c977f6569e8","role":"admin","email":"admin@saborgrupo.mx","display_name":"Carlos Mendoza","tenant_id":"f7093bcc-e90b-4918-9680-69da7952dd65","capabilities":{"icm":true,"admin":true,"financial":true}},
  {"id":"07fa3350-a7fb-4404-b983-86ab1b726174","auth_user_id":"a32195f7-e479-4c24-ab82-cf9f5f05a27b","role":"manager","email":"gerente@saborgrupo.mx","display_name":"Ana Martínez","tenant_id":"f7093bcc-e90b-4918-9680-69da7952dd65","capabilities":{"manager":true,"financial":true}},
  {"id":"e555dff1-944e-448b-9407-6144a133f9f0","auth_user_id":"0c2d0238-b627-44d4-9dd3-162c221db5a5","role":"sales_rep","email":"mesero@saborgrupo.mx","display_name":"Diego Ramírez","tenant_id":"f7093bcc-e90b-4918-9680-69da7952dd65","capabilities":{"rep":true}}
]
```

## APPENDIX C — E6 event histogram + identity.resolve.* dump
```json
event_type histogram (last <=5000 rows):
{
  "auth.logout":22,"auth.mfa.verify.success":198,"auth.login.failure":41,
  "auth.redirect.unauth_protected":101,"auth.mfa.verify.failure":13,"auth.login.success":262,
  "auth.session.expired.idle":179,"auth.session.expired.absolute":8,"auth.redirect.mfa_verify":23,
  "auth.mfa.enroll":2,"auth.redirect.unauth_root":21,"identity.resolve.duplicate_rows":8,
  "auth.redirect.tenant_select":21,"auth.shell.unauth_redirect":4,"auth.shell.hydration_timeout":7,
  "tenant.entered":16
}
// NOTE: no identity.resolve.zero_rows and no identity.resolve.query_error keys present.

last identity.resolve.* events EVER (all duplicate_rows, actor 9c179b53, NOT Sabor):
[
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:38.893189+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:38.804582+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:38.440429+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:31.388980+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:31.311220+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:30.708666+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:27.225766+00:00"},
  {"event_type":"identity.resolve.duplicate_rows","actor_id":"9c179b53-c5ee-4af7-a36b-09f5db3e35f2","created_at":"2026-06-10T05:03:26.576374+00:00"}
]

Sabor-relevant row in the 61-event since-deploy window:
{"event_type":"auth.session.expired.idle","actor_id":"72f821b1-2e31-4266-ac5d-7c977f6569e8","tenant_id":null,"created_at":"2026-06-10T17:12:40.479318+00:00"}  // = admin@saborgrupo.mx
```

---

*vialuce.ai · DIAG-062 · read-only · the linkage is intact — evidence to the architect*
