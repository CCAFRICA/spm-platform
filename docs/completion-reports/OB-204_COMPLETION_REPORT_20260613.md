# OB-204 — User Provisioning & RBAC: The Single Door — COMPLETION REPORT

**Repo:** `CCAFRICA/spm-platform` (VP) · **Date:** 2026-06-13 · **Executes:** DS-028 R7 (User Provisioning & RBAC Functional Design)
**Authored by:** CC (Phase E close), against `docs/vp-prompts/OB-204_DIRECTIVE_20260611.md` + the architect-couriered phase directives.

---

## 1 — Summary

OB-204 built **one validated door** for every user that enters the platform, with the contracts enforced at write time. It closes the production defect class: users created by seed scripts outside any validated path, with `profiles.capabilities` written as a **JSONB object** (`{"icm":true,"admin":true}`) where the consumer (`mapProfileToUser`) calls `.includes()` and an object throws `TypeError` — the Sabor login failure. The structural fix: a single writer (`provision-user.ts`), a capability-derivation seam, DB CHECK constraints, the multi-door estate retired, and data-protection invariants (I-1…I-5) made structural (type signatures, not policy). The defect is now **impossible through the platform**, not merely prohibited: `jsonb_typeof(capabilities)='array'` is a DB constraint that actively rejects an object (Phase B verifier, by name).

**A1 PASS** (architect browser-verified, production, 2026-06-13): all three Sabor users log in and reach role-correct workspaces. RCA confirmed.

---

## 2 — Phase 0 findings (pre-flight, PR #492)

Full evidence is in PR #492's gate report; key facts:
- **Capability-shape probe (0.3):** Sabor `admin@`/`gerente@`/`mesero@` carried **object** capabilities; every known-good user an **array**. No HALT-6 (suspect real).
- **Consumer contract (0.4):** `mapProfileToUser` (auth-context.tsx) → `profile.capabilities.includes('manage_tenants')` requires an array; object throws. `fetchCurrentProfile`→`resolveIdentity` is array-tolerant but the mapping is not.
- **0.7 inventory / classification:** ~10 seed-path direct profile writers (writer-path = `frmx/p3-profiles.ts` primary; the rest seed/demo) → EPG-1 retirement set; capability-literal writers → EPG-2; emitter payloads → EPG-3 (clean).
- **HALT status:** none fired (OB-204 free; `MFA_REQUIRED_ROLES=['platform','admin']`; `platform_events.tenant_id` NULL precedent 1934/1965; schema matches DS-028 §2).
- **⚠ Phase 0 NOT YET MERGED — see §7.** PR #492 is OPEN; the addendum, the schema-verify script, and the DS-027-file removal are on branch `ob-204-phase0`, not `main`.

---

## 3 — Per-phase evidence (cite branches/SHAs; new evidence pasted)

| Phase | PR | What |
|---|---|---|
| A — writer/routes/dispatch | #493 `fdb03b9f` | `deriveCapabilities`; `provision-user.ts` (createUser/changeRole/disable/enable/erase/sendCredentials); 8 routes + `authorizeUserMgmt`; `dispatch.ts`; A.8 harness **45/0**; 12 seed writers retired; 14 orphans cleaned |
| B — enforcement migration | #494 `3026ff0f` | migration 017 (normalize all 11 rows → matrix; status col; 4 CHECK constraints; FK SET NULL; audit nullable; PII cleanse); verifier **10/10** |
| C — surfaces | #495 `c0c06843` | `GET /api/users` server-backed list (CLT166-F10 fix); `UserAdminConsole` (F1/F4–F10/F7); `/configure/users` + `/admin/users` |
| D — templates + routing | #496 `2274d38c` | branded en/es-MX templates; `resolveRecipient` 4-layer routing; `siteUrl()` no-fallback throw; migration 018; harness **14/0/1-skip** |
| F — hierarchy | #497 `9b067a0a` | CPI (Decision-158 split); materializer; review panel; bulk promote; A7 harness **7/0** |

### E.1 — harnesses re-run on merged `main` (2026-06-13)
```
A.8 mint harness:       45 PASS / 0 FAIL
F.5 hierarchy harness:   7 PASS / 0 FAIL
```

### E.2 — EPG re-run on `main`
- **EPG-1** (profiles insert|upsert) — allowlist is service + Phase-B verifier; both present, nothing else:
  ```
  web/src/lib/auth/provision-user.ts:175   (the single writer — ALLOWED)
  web/scripts/ob204-phaseb-verify.ts:39    (failing-write probe — ALLOWED per directive)
  ```
- **EPG-2** (capability literals, excl. tests + deriveCapabilities) — 2 residuals, both **§6 out-of-scope auth flows**:
  ```
  web/src/app/api/auth/signup/route.ts:133   (self-signup — §6 OOS)
  web/src/app/auth/callback/route.ts:96       (OAuth first-login — §6 OOS / SSO-adjacent)
  ```
- **EPG-3** (PII in writer payload constructors): `ZERO` — the `emitLifecycle` signature accepts no string-PII parameter.

---

## 4 — Phase B (migration applied + verified)

- **Migration `017_ob204_user_contract_enforcement.sql`** — authored by CC, **applied to production by the architect via Dashboard SQL Editor (SR-44), 2026-06-13, success/no errors.** Full SQL in PR #494.
- **Pre-flight (`ob204-phaseb-gen.ts`):** CONSTRAINT-SAFE — 11 profiles, 0 duplicate `auth_user_id`, 0 role/tenant incoherence; capability arrays = `deriveCapabilities()` verbatim.
- **Post-application verification (`ob204-phaseb-verify.ts`) — 10/10:**
  ```
  (A) row audit: every capabilities array · every role canonical · (role=platform)⇔(tenant NULL) · auth_user_id unique · status present
  (B) failing-write probes — each constraint rejects BY NAME:
      profiles_capabilities_array · profiles_role_canon · profiles_platform_tenant · profiles_status_check · profiles_auth_user_id_unique
  ```
  (First probe run was a false positive — rejected on `display_name` NOT NULL; corrected so each probe isolates its target constraint. The 10/10 is the corrected result.)
- **Migration `018_ob204_tenant_notification_email.sql`** (D.2 Layer 2) — applied by the architect 2026-06-13.

---

## 5 — SR-39 §7A compliance walk

| Mechanism | Implementing artifact (on `main`) |
|---|---|
| Single writer + contracts (§2,§3) | `provision-user.ts:150` `createUser`; `:44` `validateRoleTenant`; constraints `profiles_{role_canon,capabilities_array,platform_tenant,auth_user_id_unique,status_check}` (migration 017, verifier 10/10) |
| Closed PII field set (I-2) | `CreateUserInput` `provision-user.ts:118-128` — exactly `{email,displayName,role,tenantId,entityId?,mode,locale?,notifyEmail?,actorProfileId?}`; no behavioral/device/location field |
| uuid spine, PII-free payloads (I-1) | `emitLifecycle` `provision-user.ts:69` (no string-PII parameter) + A.8 harness `event payloads scanned=19; with '@' = 0` |
| F10 erase + tombstone (GDPR Art 17) | `erase` `provision-user.ts:264` (anonymize+ban; profile retained PII-nulled) + A.8 `erase → profile tombstoned (PII nulled)`; FK `ON DELETE SET NULL` (migration 017) for true-deletion path |
| Rectification (GDPR Art 16) | `changeRole` `provision-user.ts:216`; email-change is the named ARCO-Rectificación seam (§9, the writer) |
| Link-based delivery (I-3 / NIST 800-63B) | `dispatch.ts:140-142` `sendInvite`/`sendSignInLink`/`sendRecovery` — `{to,locale,link}` only; `resolveRecipient` `:51`; no password parameter exists |
| Notice presentation (I-4) | `api/privacy-notice/presented/route.ts:18` emits `privacy_notice.presented` (version `:9`); `PrivacyNoticeFooter` first-login hook |
| Data map + subprocessor register (GDPR Art 30) | DS-028 §2A table (`docs/design-specifications/DS-028_USER_PROVISIONING_RBAC_FUNCTIONAL_DESIGN_20260611.md`); residency named below |
| AAL2 + MFA + lockout (SOC 2 CC6) | `authorize-user-mgmt.ts:44` `getAuthenticatorAssuranceLevel` (AAL2 gate); `provision-user.ts:103` `assertNotLastPlatform`; `middleware.ts:45` `MFA_REQUIRED_ROLES` + `:293` enforcement |
| Bounded IP retention (Q-I) | migration 017 item (6) — `platform_events` 90-day PII cleanse (`payload - 'email' - 'ip' - 'ip_address' - 'user_agent'`) |
| Encryption at rest / TLS | **Inherited platform control — Supabase** (Postgres AES-256 at rest; TLS in transit). Not OB-204 code. |
| **Residency named (GDPR Art 30)** | Supabase production region: **architect to confirm the exact region string** (not resolvable from code) — named gap below. |

**Named gaps:** (a) the Supabase **production region string** is not resolvable from code — architect supplies it for the Art-30 record. (b) EPG-2's two §6-OOS writers (signup, OAuth callback) write capability literals — out of scope per §6, flagged for a future pass.

---

## 6 — Acceptance evidence (A1–A7)

- **A1 — PASS** (architect browser-verified, production, 2026-06-13): three Sabor users (`admin@` MFA→`/stream`; `mesero@`→member; `gerente@`→manager). RCA: capabilities JSONB **object** → `.includes()` TypeError in `mapProfileToUser`; Phase B normalized all 11 rows to arrays; the `jsonb_typeof='array'` CHECK prevents recurrence (verifier rejects an object by name).
- **A2 — invite end-to-end:** A.8 harness `createUser(invite)` + mint session + resolveIdentity contract-true (45/0). Resend + sign-in link branded delivery: D.4 harness (14/0/1; 6 sends). *Real Resend message IDs require the production key (F-1) — dry-run locally.*
- **A3 — platform→tenant-admin→self chain:** A.8 harness creates + resolves all five roles incl. platform (tenant NULL) and tenant-scoped roles (45/0).
- **A4 — zero-violation audit:** Phase B verifier 10/10 + A.8 mint harness 45/0.
- **A5 — platform invite + last-platform protection:** A.8 covers platform creation; the lockout guard (`assertNotLastPlatform`) refuses leaving zero active platform users.
- **A6 — erase proof + estate PII grep zero:** A.8 `erase → tombstone` + `event payloads with '@' = 0` (I-1 proof).
- **A7 — hierarchy constructed from data:** F.5 harness 7/0 — CPI → confirm → promote → `profile_scope` set-equals {manager + 3 direct reports} → reject → regenerates without it.

---

## 7 — Merged SHAs

| PR | Phase | Merge commit |
|---|---|---|
| #492 | 0 — pre-flight | **OPEN — NOT MERGED** (branch `ob-204-phase0` @ `b5194950`). The HF-284 addendum + schema-verify script + DS-027-file removal are not on `main`. ⚠ requires architect merge. |
| #493 | A | `fdb03b9f` |
| #494 | B | `3026ff0f` |
| #495 | C | `c0c06843` |
| #496 | D | `2274d38c` |
| #497 | F | `9b067a0a` |
| #498 | E (this) | _(filled on merge)_ |

---

## 8 — Residuals

- **PR #492 unmerged** (above) — the Phase-0 evidence + DS-027-file cleanup await merge.
- **F.1 roster email sourcing:** bulk-promote uses a placeholder `@roster.invalid` address (delivery still routes via D.2 tenant `notification_email`); sourcing the invite address from the entity's import-classified email-semantic field needs the roster endpoint to surface that field — follow-up.
- **EPG-2 §6-OOS writers** (signup, OAuth callback) write capability literals — out of scope per §6.
- **Real Resend message IDs / tenant-routing E2E** need the production `RESEND_API_KEY` + a prod-keyed harness run; migration 018 applied so tenant-routing is now live.
- **ip-nulling scheduling automation** (Q-I) — the cleanse is committed + dated; scheduling is a §6A residual.
- **Scope ENFORCEMENT** (RLS read policies, manager team views) explicitly NOT wired — §9 successor reads `profile_scope`.
- **Per §6A standing residuals** carried from the directive.

---

## 9 — Q-G supersession note (E2 — invitation flow)

OB-204 delivers **E2 (the invitation/credential-delivery flow)**, effective **2026-06-13**: the single-door `createUser` invite path + branded Resend templates + layered routing supersede the prior ad-hoc invitation surfaces.
**⚠ Canonical target absent:** `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` is **not present in the repo** (architect-held). This note is recorded here standalone; the architect should fold it into that living-criteria document.

---

## 10 — SR-43 statement

**OB-204 is shipped — with one open gate.** Phases A–F are merged to `main` (#493–#497), the enforcement migrations are applied to production, the harnesses pass on `main` (A.8 45/0, F.5 7/0), the EPGs are clean (EPG-2 residuals are §6-OOS), and **A1 is architect-verified in production**. The single door is built, contract-enforced, defect-class-closed, surfaced, email-routed, and the hierarchy is constructed-from-data. **Outstanding for full close: merge PR #492 (Phase 0)** and confirm the Supabase region string for the Art-30 record. Per SR-43, CC does not assert login outcomes from `login.success` — A1 is the architect-channel browser evidence (HF-284 lesson honored).

*OB-204 · executes DS-028 R7 · one door for users · contracts at the door · the door is the fix*
