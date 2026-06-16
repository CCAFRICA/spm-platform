# INF-001: Dev/Prod Substrate Separation (B3) — R3

**Date:** 2026-06-10 (R3) · supersedes R2 of same date and R1 of 2026-05-29
**Category:** INF (Infrastructure)
**Closes:** B3 — Dev/Prod substrate separation (Tier B, hard test-user gate) per `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md`
**Critical-path item:** Item 6 per `USER_READY_CRITICAL_PATH_SEQUENCING_20260506.md`
**Repo:** VP — `CCAFRICA/spm-platform`
**Pairs with:** `ViaLuce_Build_Operations_Reference.docx`, `INF_IGF_STACK_BUILD_20260409_R1.md` (template precedent), `CC_STANDING_ARCHITECTURE_RULES.md`, OB-202 (Release Visibility & Relaunch — companion code artifact)
**Drafting SOP:** `INF_Structured_Compliant_Drafting_Reference_20260513.md` — the file IS the prompt (DD-11); fully-qualified paths (DD-8); prose matches implementation (DD-9).

> **Sequence number:** INF-001 — first document in the numbered INF series (architect-confirmed 2026-06-10).

---

## R1 → R2 CHANGE LOG

R2 closes four gaps of a single species — *schema clone ≠ project clone* — plus one settings addition:

| # | Change | Location |
|---|---|---|
| 1 | Auth configuration provisioning (Site URL, redirect URLs, MFA, email templates) — dashboard config does not travel in a DDL export | New §A.2 |
| 2 | Stable branch domain `dev.vialuce.ai` — preview hash-subdomains are hostile to auth redirect allow-lists | New §A.3 |
| 3 | Storage bucket recreation + dev email-sender decision | New §B.5 |
| 4 | Dev auth-user provisioning via `provision-user.ts` canonical writer (HF-282) — **must precede the separation proof**, since every surface sits behind login | New §D (sections D-onward renumbered) |
| 5 | Vercel **Skew Protection** toggle — settings-side half of the relaunch experience (code-side half is companion OB-202) | §C.4 |

Design decisions from R1 are unchanged and remain LOCKED: clone-schema / import-fresh; migration-replay off critical path.

### R2 → R3

| # | Change | Location |
|---|---|---|
| 6 | Companion OB number assigned: OB-XXX → **OB-202** (all references) | Throughout |
| 7 | DD-8 tightening: §D provisioning step restructured as explicit read-then-run (no pseudo-argument placeholder in the terminal block) | §D |

---

## 0 — DESIGN DECISION (LOCKED)

1. **Schema:** Clone current **prod** schema structure into the new **dev** Supabase. Structure only — zero tenant rows.
2. **Data:** Import **fresh** through the SCI pipeline. No tenant-row copy. Proof tenants re-established in dev as an explicit step (§H).

**Why:** Copied rows arrive already-shaped, bypassing the import path that is supposed to shape them — masking import-path defects. Fresh import on a parity schema exercises import → classify → calculate → reconcile on a clean substrate with zero prod risk, and sidesteps cross-substrate round-trip-closure and RLS questions a row-copy would raise.

---

## 1 — WHY THIS DIRECTIVE EXISTS

VP runs **one** Supabase project. `dev` and `main` Vercel builds both read it; schema changes during development hit production data immediately. There is no safe place to verify a migration before it touches prod. B3 stands up a **dev-only Supabase project** and splits Vercel branch deploys:

- `main` → **prod-Supabase** (`vialuce.ai`)
- `dev` → **dev-Supabase** (`dev.vialuce.ai` + previews; all engineering work)
- Migration path becomes: apply to dev → verify → promote to prod via the existing SQL-Editor discipline

---

## 2 — INVARIANTS THIS DIRECTIVE MUST NOT BREAK

1. **No psql / CLI / exec_sql RPC in VP.** Dev migrations are applied exactly as prod's: architect pastes SQL into the **dev** project's SQL Editor. CC authors/commits migration files and verifies post-application via service-role tsx-scripts.
2. **Account/credential creation is architect-only.** Every step that creates a project, generates a key, or enters a credential is `[YOU]`. CC never provisions accounts or handles credentials.
3. **`dev` branch is permanent.** CC works on `dev`. Do not delete it.
4. **`SUPABASE_SERVICE_ROLE_KEY` is server-only**, never `NEXT_PUBLIC_`. Same for `ANTHROPIC_API_KEY`, `RESEND_API_KEY`.
5. **One profile per auth user (Option B, SOC CC6).** Dev user provisioning routes through `provision-user.ts` — the HF-282 canonical writer — not ad-hoc dashboard inserts.
6. **SR-39 adjacency.** B3 alters data-access topology; it must not weaken RLS or auth. **B4** (RLS re-audit) is the paired successor gate (§I).

---

## 3 — LEGEND

- **[YOU]** — Architect, in a dashboard or local terminal. All provisioning/credential actions.
- **[TERMINAL]** — Shell command on the architect's machine.
- **[CC]** — Claude Code, VP repo, branch `dev`. Code/config/script + commit + push.
- **[VERIFY]** — Gate. Do not proceed past a failed gate.

---

## SECTION A — PROVISION THE DEV SUPABASE PROJECT  `[YOU]`

**[YOU]** Sign into the Supabase dashboard, in the organization owning the current VP prod project.

**[YOU]** **New project**:
- **Name:** `spm-platform-dev`
- **Database password:** generate strong; **save to vault immediately**
- **Region:** match the prod project's region **exactly** (verify against prod's settings before selecting)
- **Plan:** Free tier sufficient for dev at current scale. (Free projects pause after ~7 days idle; active work keeps it awake. Upgrade later if pausing becomes friction.)

**[YOU]** Create; wait for provisioning.

### A.1 — Capture credentials  `[YOU]`

**[YOU]** Dev project → **Project Settings → API**. Capture to vault, labelled **DEV**:
- Project URL (`https://<dev-project-ref>.supabase.co`)
- `anon` key · `service_role` key (**SENSITIVE**) · project ref · DB password

### A.2 — Auth configuration (R2)  `[YOU]`

Dashboard-level auth config does **not** travel in a schema export. Configure the dev project explicitly:

**[YOU]** Dev project → **Authentication → URL Configuration**:
- **Site URL:** `https://dev.vialuce.ai` (created in §A.3)
- **Redirect URLs:** add `https://dev.vialuce.ai/**` and `http://localhost:3000/**`

**[YOU]** Dev project → **Authentication → Providers / MFA / Email Templates**: mirror prod's settings (email provider enabled, MFA settings matching prod so the eoadmin-style MFA-enrollment flow is testable in dev, email templates copied if customized in prod).

> This intersects the pending **Site URL dashboard fix** on prod. Configure dev correctly from day one; resolve prod's Site URL item on its own track — do not couple it into B3.

**[VERIFY]**
- [ ] Dev Site URL = `https://dev.vialuce.ai`
- [ ] Redirect URLs include dev domain + localhost
- [ ] MFA + provider settings mirror prod

### A.3 — Stable branch domain (R2)  `[YOU]`

Per-deployment preview hash-subdomains can't be allow-listed for auth redirects. Assign a stable domain to the `dev` branch:

**[YOU]** Vercel → VP project → **Settings → Domains** → add `dev.vialuce.ai`, assigned to the **`dev` branch** (branch-domain assignment; supported on Pro).

**[YOU]** Cloudflare → DNS → add the CNAME for `dev.vialuce.ai` per Vercel's instruction (proxy/DNS-only per your existing Cloudflare-with-Vercel convention — match how `vialuce.ai` is configured today).

**[VERIFY]**
- [ ] `https://dev.vialuce.ai` resolves and serves the latest `dev`-branch deployment
- [ ] All five DEV credential items in vault · region matches prod

---

## SECTION B — CLONE PROD SCHEMA INTO DEV  `[YOU]` + `[CC]`

Dev's schema structurally identical to prod's; **zero tenant rows**.

### B.1 — Export prod schema (structure only)  `[YOU]`

**[YOU]** Produce a **schema-only** dump of prod (DDL: tables, columns, types, constraints, indexes, **RLS policies and grants**, functions, triggers, enums) with no row data — via the schema-only `pg_dump` against the prod connection string, or the dashboard's schema SQL surface if you prefer to stay dashboard-only.

> The check that matters: **RLS policies and grants are present in the dump.** Tenant isolation is RLS-enforced; a clone that silently drops policies creates a dev environment that does not match prod's security posture and invalidates the B4 re-audit. Confirm policies appear in the file before applying.

### B.2 — Apply schema to dev  `[YOU]`

**[YOU]** Paste the DDL into the **dev** project's SQL Editor and run. (Invariant 1.)

### B.3 — Parity-verification script  `[CC]`

**[CC]** On `dev`, author `web/scripts/inf-b3-verify-schema-parity.ts`: connects via service-role to whichever project the env points at; emits table list, per-table columns + types, constraint names, RLS-enabled flag per table, policy names per table. Reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env — **no hardcoded project refs** (no environment-specific string literals in tooling).

**[CC]** Commit `INF-001 Phase B: schema parity verification script`; push `dev`.

### B.4 — Run parity check against both  `[YOU]`

**[TERMINAL]**
```bash
# from web/ — PROD
NEXT_PUBLIC_SUPABASE_URL=<prod-url> SUPABASE_SERVICE_ROLE_KEY=<prod-service-role> \
  npx tsx scripts/inf-b3-verify-schema-parity.ts > /tmp/schema-prod.txt
# DEV
NEXT_PUBLIC_SUPABASE_URL=<dev-url> SUPABASE_SERVICE_ROLE_KEY=<dev-service-role> \
  npx tsx scripts/inf-b3-verify-schema-parity.ts > /tmp/schema-dev.txt

diff /tmp/schema-prod.txt /tmp/schema-dev.txt
```

**[VERIFY]**
- [ ] `diff` clean: table set, column shapes, constraints identical
- [ ] RLS-enabled flags + policy names match per table
- [ ] Dev tenant-data tables all at **zero rows**

Resolve any diff in dev (re-apply missing DDL) before §C.

### B.5 — Storage buckets + email sender (R2)  `[YOU]`

**[YOU]** Prod project → **Storage**: inventory bucket names + public/private settings + policies. Recreate each in the dev project (bucket definitions are not table DDL; storage *policies* may or may not have travelled with the dump — verify, recreate if absent).

**[YOU]** **Email decision:** dev uses Supabase's **default built-in sender** (rate-limited — fine for dev, self-throttling, and prevents a seeding run from emailing a real address from a production-looking domain). Do **not** wire prod's Resend credentials into dev. If dev later needs higher email volume, provision a separate Resend test config as its own INF step.

**[VERIFY]**
- [ ] Every prod bucket exists in dev with matching visibility + policies
- [ ] Dev auth email sender = Supabase default (no Resend creds in dev)

---

## SECTION C — SPLIT VERCEL BRANCH DEPLOYS + SKEW PROTECTION  `[YOU]`

**[YOU]** Vercel → VP project → **Settings → Environment Variables**. Per-environment values:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | **dev** URL | **dev** URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon | **dev** anon | **dev** anon |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service_role | **dev** service_role | **dev** service_role |

> Same variable name, different value per environment — the standard Vercel mechanism. `dev`-branch deployments are Preview-class, so Preview = dev-Supabase achieves the split; the Development scope covers `vercel dev` local runs. Non-Supabase variables (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`) unchanged — except note §B.5: dev does not use Resend, so if any code path reads `RESEND_API_KEY` at Preview scope, set Preview's value empty and confirm the code path degrades gracefully (HALT to architect if it hard-fails).

### C.4 — Skew Protection (R2)  `[YOU]`

**[YOU]** Vercel → VP project → **Settings** → enable **Skew Protection** (Pro feature). Confirm the current maximum protection window on your plan in the dashboard and set it to the maximum available.

> This is the settings-side half of the relaunch experience: stale clients keep being served *their own* deployment's assets and functions for the window's duration, so an open session is never broken mid-work by a deploy. The visible half — the "Relaunch to update" banner — is companion **OB-202** and ships as code. Skew protection covers Vercel-served assets/functions only; it does not version the database. The schema-side discipline (additive-first migrations) is locked as a standing rule in OB-202 Phase 4.

**[YOU]** Trigger a fresh preview build:

**[TERMINAL]**
```bash
git checkout dev
git commit --allow-empty -m "INF-001 Phase C: trigger preview rebuild with dev-Supabase env"
git push origin dev
```

**[VERIFY]**
- [ ] Production env vars = prod values; Preview + Development = dev values
- [ ] Skew Protection enabled, window set
- [ ] Preview deployment completed post-push; `dev.vialuce.ai` serves it

---

## SECTION D — PROVISION DEV AUTH USERS (R2, tightened R3)  `[YOU]`

Auth users live in the Supabase-managed `auth` schema and **do not clone**. Every VP surface sits behind login — §E's separation proof is unreachable without at least one dev user. HF-282 made `provision-user.ts` the canonical writer; dev users route through it.

**[YOU]** Step 1 — read the canonical writer's interface before running it (its argument surface is repo-truth, not directive-truth):

**[TERMINAL]**
```bash
sed -n '1,40p' web/scripts/provision-user.ts
```

**[YOU]** Step 2 — run the script pointed at dev for one platform-admin account, supplying the arguments exactly as the script header documents them. The env prefix is fixed; the arguments come from Step 1:

**[TERMINAL]**
```bash
NEXT_PUBLIC_SUPABASE_URL=<dev-url> SUPABASE_SERVICE_ROLE_KEY=<dev-service-role> \
  npx tsx web/scripts/provision-user.ts
```

(Append the Step-1-documented arguments for role `platform` and identity `platform-dev@vialuce.com` to that command line. The directive deliberately does not fabricate the flag names — repo-truth governs.)

> Use a **dev-distinct identity** — never reuse prod credentials in dev. Save to vault labelled DEV. **HALT-D1:** if the script cannot provision a platform-level user without an existing tenant, stop and disposition with the architect (this is itself a finding about the provisioning surface).

**[VERIFY]**
- [ ] Dev platform-admin exists (visible in dev project → Authentication → Users)
- [ ] Exactly **one** profile row for the user (Option B invariant) — check via dev service-role script
- [ ] Login succeeds at `https://dev.vialuce.ai`

---

## SECTION E — PROVE THE SPLIT (THE CRITICAL GATE)  `[YOU]`

**[YOU]** Logged into `dev.vialuce.ai` as the dev platform-admin: exercise a DB read (tenant list). Then open production `vialuce.ai` (prod credentials) and the same read.

**[VERIFY] — Separation proof:**
- [ ] Dev shows an **empty/near-empty** substrate (no prod tenants)
- [ ] Prod shows existing tenants, unchanged
- [ ] A **write** in dev (create a throwaway tenant) does **NOT** appear in prod
- [ ] The throwaway tenant is visible via the **dev** service-role script and absent via the prod one
- [ ] The dev platform-admin does **not** exist in prod's auth users

If a dev write appears in prod, **STOP** — Preview env vars still point at prod. Re-run §C before anything else.

---

## SECTION F — MIGRATE ENGINEERING TOOLING TO DEV-ONLY  `[YOU]` + `[CC]`

### F.1 — Local env files  `[YOU]`

**[YOU]** Update `web/.env.local` so its Supabase block points at **dev**. Move prod credentials to a separate `web/.env.prod.local` for rare, deliberate, explicitly-invoked prod runs. Confirm both gitignored.

> The behavioral core of B3: a no-override tsx-script run now hits dev. Touching prod becomes a deliberate act.

### F.2 — Standing-rule addendum  `[CC]`

**[CC]** On `dev`, append to `CC_STANDING_ARCHITECTURE_RULES.md`. **Rule number derivation:** read the live file first, take the highest existing rule number + 1 (the project-knowledge copy is stale — derive from repo only), and report the assigned number in the completion report:

> **Rule [N] — Dev-Substrate Default (B3).** All CC tsx-scripts, seeds, and verification runs target the dev Supabase via `web/.env.local`. CC never targets prod. Tasks requiring prod access escalate to the architect as `[YOU]` steps with explicit prod-env invocation. CC does not author scripts that hardcode project refs or read prod credentials.

**[CC]** Commit `INF-001 Phase F: dev-substrate-default standing rule`; push `dev`.

**[VERIFY]**
- [ ] `web/.env.local` → dev; `web/.env.prod.local` exists, gitignored; neither staged
- [ ] Standing rule present on `dev`
- [ ] No-override run of `web/scripts/inf-b3-verify-schema-parity.ts` reports the **dev** project

---

## SECTION G — DOCUMENT THE NEW TOPOLOGY  `[CC]`

**[CC]** On `dev`, record in build-ops documentation (INF addendum if the .docx stays canonical): branch→project mapping, per-environment Vercel variable scoping, `dev.vialuce.ai` branch domain, dev-default tooling rule, dev email-sender posture, Skew Protection state, and the migration-promotion path (dev SQL Editor → verify → prod SQL Editor → verify).

**[CC]** Commit `INF-001 Phase G: two-substrate topology documented`; push `dev`.

---

## SECTION H — RE-ESTABLISH PROOF TENANTS IN DEV (FRESH IMPORT)  `[YOU]` + `[CC]`

No row-copy. Recommendation: **one** tenant first — BCL (cleanest ground truth, $312,033) — end-to-end before populating others.

**[CC]** Run the existing seed path for BCL against dev (env per §F). Tenant-admin users for the tenant route through `provision-user.ts` (Invariant 5). Then exercise the **live import path** for the tenant's source data — fresh import, not row-copy.

**[VERIFY]**
- [ ] BCL exists in dev (dev service-role script); prod BCL unchanged
- [ ] Import → calculate → reconcile completes in dev against ground truth ($312,033)

> Architect reconciles in architect channel. CC reports the calculated value verbatim with no reconciliation interpretation.

---

## SECTION I — SUCCESSOR GATE: B4 RLS RE-AUDIT (REFERENCE ONLY)

B3 changes data-access topology; **B4** verifies tenant isolation still holds (HF-134-style sweep, run against dev post-separation, per critical-path Item 7). The test-user gate is not cleared until B4 passes. This directive names B4; it does not execute it.

---

## SECTION J — CLOSURE

- [ ] §E separation proof passed
- [ ] §F tooling defaults to dev
- [ ] §H BCL reconciles in dev via fresh import
- [ ] §G topology documented

On closure: update `VIALUCE_USER_READY_EXIT_CRITERIA_R1.md` B3 → ✅ with date; update critical-path Item 6; sequence **B4** (Item 7) and companion **OB-202** (Release Visibility & Relaunch — its deploy-verification rides the new dev→prod promotion path as first passenger).

**Risk-adjacency watch:** capture-side defects surfaced during B3 → record as DIAG-030 context; **do not expand B3 scope.**

---

*INF-001 R2 · Dev/Prod Substrate Separation (B3) · 2026-06-10*
*vialuce.ai · Intelligence. Acceleration. Performance.*
*Drafted to INF_Structured_Compliant_Drafting_Reference_20260513.md — the file IS the prompt.*
