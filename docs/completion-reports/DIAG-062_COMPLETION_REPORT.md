# DIAG-062 COMPLETION REPORT

## Date / Execution Time
2026-06-10. Read-only diagnostic (no build phase — Rule 25 adaptation: this report is created and committed BEFORE the batch's final push, in Phase 2 Commit 3).

## COMMITS (in order)
1. `c16b24ea` — DIAG-062 Phase 0: directive committed; provenance
2. `b11ee5d9` — DIAG-062 Phase 1: census evidence assembled (E1-E6)
3. (this) — DIAG-062 Phase 2: completion report

## FILES CREATED
- `docs/vp-prompts/DIAG-062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md` (relocated to canonical path per §0.2)
- `docs/diagnostics/DIAG-062_SABOR_PROFILE_MISSING_OUTPUT.md`
- `docs/completion-reports/DIAG-062_COMPLETION_REPORT.md`

## FILES MODIFIED   (expected: NONE beyond docs — Rule 23)
NONE. Census probe scripts were written under `web/`, executed, and **deleted** — never committed (git working tree verified clean of them). Zero product code.

## PROOF GATES — HARD
| ID | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | The error chain is pasted with file:line: auth success -> resolveIdentity branch -> UI surface | **PASS** | OUTPUT §E1: `auth-context.tsx:240` (signInWithEmail) → `auth-service.ts:189` (resolveIdentity) → `resolve-identity.ts:91-94` (zero_rows, returns null) → `auth-context.tsx:255-256` ('Account found but profile is missing'). HALT-1 not triggered. |
| HG-2 | The expected Sabor user set is pasted with its in-repo source path (or the search trail if absent) | **PASS** | OUTPUT §E2: source `docs/vp-prompts/FRMX_RESEED_SABOR_GRUPO_GASTRONOMICO.md` L208-214 + `web/scripts/frmx/p3-profiles.ts:4-6`; 3 users (admin/gerente/mesero), roles admin/manager/sales_rep. |
| HG-3 | auth.users census pasted (all %saborgrupo% users, all listed fields) | **PASS** | OUTPUT §E3 + Appendix A: 3 users with id, email, providers, email_confirmed_at, created_at, last_sign_in_at. |
| HG-4 | profiles census pasted (all rows for the Sabor tenant id, schema-verified columns) | **PASS** | OUTPUT §E4 + Appendix B: tenant `f7093bcc-e90b-4918-9680-69da7952dd65` (resolved by slug); schema columns probed live; 3 rows. |
| HG-5 | Join diff pasted as three explicit lists (auth-without-profile / dead-link profiles / linked), admin@ placed | **PASS** | OUTPUT §E5: (a) `[]`, (b) `[]`, (c) 3 linked; `admin@saborgrupo.mx → 72f821b1…` placed explicitly in (c). |
| HG-6 | platform_events record pasted (E1 event + login.success for sabor emails since deploy) | **PASS** | OUTPUT §E6 + Appendix C: `identity.resolve.zero_rows` = 0 ever; `auth.login.success` 262 total / 4 since deploy (none Sabor); admin auth id in `auth.session.expired.idle` 17:12:40Z. Client-side no-op limitation traced (auth-logger.ts:61). |
| HG-7 | Zero product code shipped: git diff scope is docs/ only (Rule 23) | **PASS** | `git diff --stat` of the branch vs origin/main below — docs/ only. |

### HG-7 evidence — branch diff scope vs origin/main
```
docs/completion-reports/DIAG-062_COMPLETION_REPORT.md
docs/diagnostics/DIAG-062_SABOR_PROFILE_MISSING_OUTPUT.md
docs/vp-prompts/DIAG-062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md
```
(All three paths under `docs/`. No `web/src/**` or any product path. Verbatim `git diff --stat origin/main...HEAD` at the time the prior two commits were in place — this report is the 3rd, staged at capture:)
```
 .../DIAG-062_SABOR_PROFILE_MISSING_OUTPUT.md       | 170 +++++++++++++++++++++
 ...062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md | 116 ++++++++++++++
 2 files changed, 286 insertions(+)
```

## PROOF GATES — SOFT
| ID | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| SG-1 | Output artifact within Rule 20 limits (summaries <=15 lines per census, full pastes in appendices) | **PASS** | OUTPUT body uses tables/summaries per census; full JSON pastes are in Appendices A/B/C. |
| SG-2 | DIAG number derived from docs/diagnostics/, stated | **PASS** | Phase 0: listed `docs/diagnostics/`; highest existing was DIAG-061; no DIAG-062 OUTPUT existed → 062 confirmed, no renumber. Recorded in commit `c16b24ea`. |

## STANDING RULE COMPLIANCE
- **Rules 19-24:** Rule 21 honored (E1 traces the code path before any data conclusion); Rule 22 (Level-1/3 surfaces — code + service-role reads; architect eyewitness accepted, no browser test); Rule 23 (docs-only, zero product code); Rule 24 (round 1 of ≤3).
- **Rule 23 docs-only:** confirmed — HG-7.
- **Rule 25:** adaptation stated (no build phase; report created before final push, Phase 2 Commit 3).
- **Rule 27:** all gate evidence is pasted code/output, not "verified."
- **Rule 28:** 3 phases, 3 commits.
- **SR-44:** zero mutations, zero DDL, zero sessions minted — service-role READS only (`listUsers`, table `select`s). No `last_sign_in_at` side effects (no `signInWithPassword` called).

## KNOWN ISSUES
1. **E6 negative is bounded, not absolute.** `identity.resolve.zero_rows` is emitted via `logAuthEvent`, which **no-ops client-side** (auth-logger.ts:61); the login profile-fetch path runs client-side. So a browser-path zero-rows hit is structurally unrecordable. E6's empty Sabor result cannot by itself distinguish "branch never fired" from "branch fired but could not self-record." **E3-E5 (the data census) is the load-bearing evidence** and shows healthy, correctly-linked profiles.
2. **`listUsers` returns `identities=null`** (providers shown as `[]`) — the documented reporting artifact (`supabase-listusers-identities-null`), not proof of a missing provider. Successful `last_sign_in_at` values and the `session.expired.idle` event for admin's auth id evidence that password auth works. A direct `auth.identities` read (would require SQL/exec_sql — out of SR-44 scope) was NOT performed.
3. **Stale tenant id in a legacy script:** `web/scripts/seed-sabor-grupo.ts:37` hardcodes `10000000-0001-…`; the live tenant is `f7093bcc-…` (resolved by slug). Observation only.

## VERIFICATION SCRIPT OUTPUT  (the census script outputs)
Full raw outputs are pasted in the OUTPUT artifact (`docs/diagnostics/DIAG-062_SABOR_PROFILE_MISSING_OUTPUT.md`) Appendices A, B, C. Summary:
- T0 tenant resolution → `f7093bcc-e90b-4918-9680-69da7952dd65` (slug `sabor-grupo`, name "Sabor Grupo Gastronomico"); single match by both slug and name.
- T0b profiles columns (live) → `id, tenant_id, auth_user_id, display_name, email, role, capabilities, locale, avatar_url, created_at, updated_at`.
- E3 → 3 auth users (admin/gerente/mesero), all email-confirmed, last sign-ins 2026-06-09/06-10.
- E4 → 3 profiles, tenant `f7093bcc`, roles admin/manager/sales_rep, correct auth_user_id each.
- E5 → auth-without-profile `[]`; dead-link `[]`; linked `[admin, gerente, mesero]`.
- E6 → 61 events since deploy; 0 `identity.resolve.zero_rows` ever; 8 `identity.resolve.duplicate_rows` (non-Sabor actor); admin auth id in `auth.session.expired.idle` 17:12:40Z.

## TERMINAL HALT
Evidence only. No fix, no ranked causes, no provisioning/re-link/mutation (§6 out of scope). The orphan-pass class hypothesis (directive §1) is falsified by the data census; the architect drafts the fix directive (or re-scopes the investigation) from this evidence.

---
*vialuce.ai · DIAG-062 completion report · read-only · evidence, then the architect*
