# DS-027 — USER PROVISIONING & RBAC IMPLEMENTATION: FUNCTIONAL DESIGN
**Date:** 2026-06-11 · **Status:** DRAFT for architect disposition
**Number derivation:** INF_GOVERNANCE_INDEX Tier-3 register allocates DS-020–DS-026 (Synaptic State, Calculation Intent/Substrate, CRR, SCI, Reconciliation Intelligence, Plan Anomaly Detection, Agentic Architecture); highest actual file DS-023 → next free is DS-027. CC re-confirms against the index + repo at commit; renumber-and-state if taken.
**Parent architecture:** DS-014 Access Control Architecture (DRAFT — this design proposes its DECISION LOCK with the amendments in §1) · DS-019 (auth identity) · DS-013 (persona adaptation)
**Substrate already live:** resolveIdentity (one reader, HF-282) · provision-user.ts (one writer, HF-282) · is_platform() + PLATFORM_ROLE_VALUES (one role canon, HF-283) · session-ownership lifecycle (safe first logins, HF-284)

## §0 — WHY THIS, WHY NOW
Every user in production was created by a seed script outside any validated path. Today's unresolved login defect is the direct product: profiles with design-violating field shapes (capabilities written as JSONB objects; the design contract is an array). The structural fix is not another patch — it is making the platform the only thing that can create users, through one validated writer, with contracts enforced at write time. DS-014 §6 already designed the surfaces; this document makes them buildable.

## §1 — DS-014 AMENDMENTS PROPOSED FOR DECISION LOCK
1. **Role canon executed-to-date:** `vl_admin` retired at the RLS layer via `is_platform()` (HF-283); `PLATFORM_ROLE_VALUES` is the app-side declaration. The DS-014 resolution table stands; remaining renames (`sales_rep`→`member`, `tenant_admin`→`admin`) execute in the remediation phase (§6).
2. **Capabilities contract (closes today's defect class):** `profiles.capabilities` is a **JSONB array of capability strings** drawn ONLY from the DS-014 matrix vocabulary. It is **derived from role at write time** by the single writer — never authored by hand, never an object, never free text. A DB CHECK (`jsonb_typeof(capabilities) = 'array'`) backstops the writer.
3. **Per-tenant capability overrides** (DS-014 ABAC layer) are OUT of this build; the derivation function is the seam where they later attach.

## §2 — THE DATA CONTRACT (one user, fully specified)
**auth.users:** created via admin API by the writer; email confirmed per flow (invite link confirms; temp-password path sets `email_confirm: true`); provider `email`.
**profiles (exactly one row per auth user — Option B):**
- `auth_user_id` — the linkage; UNIQUE constraint added in §6 (deferred home from HF-282).
- `tenant_id` — NULL iff role `platform`; required otherwise.
- `role` — one of `platform | admin | manager | member | viewer` (CHECK constraint added §6).
- `capabilities` — derived array per §1.2 (e.g., admin → `["manage_users","import_data","configure_plans","run_calculation","view_all_results","upload_storage",…]` exactly per the DS-014 matrix).
- `display_name`, `email`, `locale` (tenant default, overridable), `avatar_url` null.
**Invariant:** any row violating this contract is impossible to create through the platform and is flagged by the §6 audit.

## §3 — THE SINGLE WRITER (the only door)
`provision-user.ts` extends to a lifecycle service consumed ONLY via server API routes (service-role; no client-direct profile writes; no new RLS write policies needed):
- `POST /api/users` — create+invite (or create+temp-password). Validates contract → creates auth user → inserts profile with derived capabilities → emits events → returns invite state. **Atomic:** auth-user creation rolls back (admin delete) if the profile insert fails.
- `POST /api/users/:id/reset` — admin-initiated reset email.
- `POST /api/users/:id/role` — role change → capabilities re-derived → events.
- `POST /api/users/:id/disable|enable` — auth ban/unban + profile flag.
- Public `/(auth)/forgot-password` — self-service reset (Site URL prerequisite).
**Authorization on every route:** caller capability `manage_users` + tenant scoping (admin manages own tenant only; platform any; nobody assigns `platform` except platform).
**Seeders retired:** all seed/demo scripts MUST call these routes (or the service directly under test harness) — direct `profiles` INSERTs outside the writer are prohibited and CI-greppable.

## §4 — FLOWS (functional detail)
**F1 Create/Invite (primary):** admin opens Users surface → "Invite user" → email, display name, role (no `platform` option for tenant admins), optional entity linkage (DS-014 §6.3 promotion) → submit → writer provisions → Supabase invite email (branded via Resend SMTP) → user sets password → first login (HF-284-safe) → lands per role (`/operate` for admin, `/perform` for manager/member/viewer per DS-014 workspace capabilities).
**F2 Create with temporary password (demo/offline):** same form, "set temporary password" toggle → forced password change at first login.
**F3 Self-service reset:** login page "Forgot password" → email → reset link → new password → login.
**F4 Admin reset:** Users surface row action → reset email sent → event logged.
**F5 Role change:** row action → role picker → capabilities re-derived → user's next request reflects new access (capability checks read live profile).
**F6 Disable/Enable:** row action → auth ban + flag → login blocked with honest message; enable reverses.
**F7 Entity-to-user promotion:** "Entities without platform access" list → Invite → F1 prefilled with entity linkage.

## §5 — SURFACES (per DS-014 §6, capability-gated)
- **`/admin/users`** (platform): all tenants, user counts, create tenant admins, cross-tenant reset/disable, role-change audit view.
- **`/configure/users`** (admin, own tenant): user list (fixes CLT166-F10 by routing the read through a server endpoint, not client RLS), F1–F7 actions, entity-linkage status.
- Tenant-facing strings follow tenant locale (es-MX for MX tenants). Navigation derives from capabilities (DS-014 §5.3) — no dead ends.

## §6 — REMEDIATION & ENFORCEMENT MIGRATION (one phase, architect-applied SQL)
1. Normalize existing rows: capabilities objects → derived arrays from role; `sales_rep`→`member` (and any `tenant_admin`→`admin`), per the DS-014 resolution table — **the three Sabor users are healed by this normalization or by F-test re-provisioning, whichever the build reaches first.**
2. Orphan pass: the 5 known orphans dispositioned (provision via writer or delete).
3. Constraints: `UNIQUE(auth_user_id)`; `role` CHECK against the canon; `capabilities` array CHECK. Tenant-create flow stops auto-inserting creator per-tenant profiles (the Option-B violation source).
4. Audit query committed: zero rows violating §2 — runs in CI-adjacent verification thereafter.

## §7 — OBSERVABILITY & COMPLIANCE (non-optional)
Every create/invite/accept/reset/role-change/disable emits `platform_events` + `audit_logs` (actor, target, tenant, before/after role). SR-39 full gate at ship (SOC2 CC6 user-lifecycle controls; OWASP; NIST 800-63B for invite/reset token flows; DS-014 conformance; Decision 123). Access denials logged per DS-014 2.6.

## §8 — ACCEPTANCE (the build's definition of done)
- **A1 (primary, converts today's defect into proof):** the three Sabor users — re-provisioned or normalized through this system — log in on production in a real browser and land in their role-correct workspace. mesero/member sees `/perform`; admin sees `/operate`.
- **A2:** tenant admin invites a brand-new user end-to-end (email received, password set, first login clean, role-correct landing) — DS-014 §7 Phase-3 proof.
- **A3:** platform admin creates a tenant admin for a fresh tenant; that admin then invites their own users without VL involvement (tenant self-service, DS-014 2.5).
- **A4:** contract audit returns zero violations; the mint harness covers create→login→capability checks per role; SR-43 browser pass recorded.

## §9 — OUT OF SCOPE (named)
Self-signup; SSO/SAML; email change; MFA enrollment UX for tenant users; per-tenant capability overrides; graph-derived manager scope (ReBAC) beyond what exists; profile_scope UI; the RLS-hygiene slice.

## §10 — SEQUENCING
P1 Site URL (done/verify) → this design + DS-014 dispositioned/LOCKED → **OB directive drafted in a fresh session** (full formation) → Phase A: writer/API + contracts (§3, §2) → Phase B: remediation migration (§6, architect-applied) → Phase C: surfaces (§5, F1–F7) → Phase D: emails/templates → Phase E: verification + SR-39 → SR-43 with A1–A3.

*vialuce.ai · Intelligence. Acceleration. Performance.*
*One door for users · contracts at the door · the door is the fix*
