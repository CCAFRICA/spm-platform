# DIAG-062 — SABOR USERS: PROFILE-MISSING CENSUS

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Act — except at the enumerated HALT conditions in §4.**

**Type:** DIAG (read-only diagnostic — evidence only; ships ZERO product code, Rule 23)
**Date:** 2026-06-10
**Repo:** `CCAFRICA/spm-platform`, branch `diag-062-sabor-profile-census` cut from `origin/main` (post `ab958dd1`; Phase 0 confirms)
**Directive file (this file):** `docs/vp-prompts/DIAG-062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md` — committed in Phase 0 (Rule 29 / DD-10)

---

## §0 — CC STANDING RULES HEADER

Binding: `CC_STANDING_ARCHITECTURE_RULES.md` v2.0 (as applicable to a read-only batch); `CC_DIAGNOSTIC_PROTOCOL.md` Rules 19–24 in full — Rule 21 (trace the code path before any conclusion), Rule 22 (Level-1/3 surfaces only; no browser test — the architect's eyewitness report is accepted), Rule 23 (zero diagnostic/product code shipped; this batch commits DOCUMENTATION only), Rule 24 (this is round 1 of ≤3). `COMPLETION_REPORT_ENFORCEMENT.md` Rules 25–28 apply: a DIAG is a CC batch and produces a completion report. SR-44: no DDL, no Dashboard, no data mutation of any kind — service-role READS only; no sessions minted, no `last_sign_in_at` side effects this DIAG. SQL Verification Gate: verify live column names via service-role read before each query.

Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`. This file IS the prompt (DD-11); read end-to-end; no summary block.

### COMPLETION REPORT RULES (25–28)
25. Report file created BEFORE the final push of the batch (no build phase exists in a DIAG — adaptation stated)
26. Mandatory structure: Commits → Files → Hard Gates → Soft Gates → Compliance → Issues → Script Output
27. Evidence = pasted code/output. NOT "this was verified."
28. One commit per phase (3 phases, 3 commits).

---

## §1 — PROBLEM STATEMENT (fact to explain; no interpretation)

Architect eyewitness report (production, post-`54416d6b`): Sabor Grupo users fail at login with the PROFILE MISSING error. Known-good contrast: `admin@saborgrupo.mx` passed HF-283's G-B control via **minted JWT** (valid `profiles` row, tenant `f7093bcc-…`) — but browser password login and the non-admin personas were never exercised by that harness. Class hypothesis to TEST, not assume (Rule 21): the HF-282 `resolveIdentity` no-profile branch — authentication succeeds, no `profiles` row matches `auth_user_id`. Lineage: orphan-pass class (auth↔profile linkage); reseed history (`FRMX_RESEED_SABOR_GRUPO_GASTRONOMICO.md`: auth users existed with no provider; `ensureAuthUser` createUser→listUsers→updateUser may have recreated auth users under new UUIDs, orphaning profiles).

## §2 — SUBSTRATE-BOUND DISCIPLINE APPLICATIONS

- **Rule 21 / trace-before-conclusion:** the error string is traced to its emitting branch (Phase 1, E1) BEFORE any data conclusion.
- **T1-E905 / Prove Don't Describe:** every evidence item is a paste — code with `file:line`, query output, git output.
- **Reconciliation-channel separation:** CC assembles evidence and HALTs; the architect interprets and drafts the fix. No ranked causes, no fix sketches.
- **Schema discipline:** column names verified against the live schema by service-role read before each census query; queried via `npx tsx` with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no psql, no exec_sql).
- **Number discipline:** the DIAG number derives from `docs/diagnostics/` (Phase 0), never from memory.

## §3 — PHASES

**Ordering rationale:** provenance before evidence (the number and HEAD anchor the artifact); the code trace (E1) before the data census so the data is read against the actual failing branch; the report last, before the final push (Rule 25 adaptation).

All work on branch `diag-062-sabor-profile-census`; push after every commit; commands from repo root; ASCII commit messages.

### Phase 0 — Provenance (Commit 1)
0.1 Derive next DIAG number from `docs/diagnostics/`; if 062 is taken, renumber this file and all internal references; record.
0.2 Save this directive at `docs/vp-prompts/DIAG-062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md`.
0.3 `git log origin/main --oneline -1` — record HEAD.
**Commit 1:** `DIAG-062 Phase 0: directive committed; provenance`

### Phase 1 — Evidence assembly (Commit 2)
Assemble E1–E6 into `docs/diagnostics/DIAG-062_SABOR_PROFILE_MISSING_OUTPUT.md`; every item pasted.

- **E1 — Error provenance (Rule 21 chain):** grep the literal UI error text; paste the rendering surface, the `resolveIdentity` branch producing it, and that branch's `platform_events` event name. State the chain explicitly: `auth success → resolveIdentity (file:line) → branch (file:line) → UI surface (file:line)`. **HALT-1** if the string does NOT trace to the no-profile branch — paste what it actually traces to and stop.
- **E2 — Expected set:** locate the in-repo Sabor seed source (`FRMX_RESEED_SABOR_GRUPO_GASTRONOMICO.md` or successor seed script); paste its path and the canonical user list (emails + roles). If no in-repo source exists, state the searches performed and proceed with E3 as the de-facto set.
- **E3 — auth.users census:** every user matching `%saborgrupo%`: id, email, providers, email_confirmed_at, created_at, last_sign_in_at.
- **E4 — profiles census:** every row with `tenant_id = <Sabor tenant id>` (resolve the full id from `tenants` by slug/name; paste it): id, auth_user_id, role, plus identifying columns per the live schema.
- **E5 — Join diff (the deliverable):** three explicit lists — (a) auth users with NO matching `profiles.auth_user_id`; (b) profiles whose `auth_user_id` matches NO auth user (dead links); (c) correctly linked. Place `admin@saborgrupo.mx` in its list explicitly.
- **E6 — Event record:** `platform_events` since the `54416d6b` deploy for the E1 event name plus `login.success`, filtered to sabor emails — paste rows (who hit which branch, when).

**Commit 2:** `DIAG-062 Phase 1: census evidence assembled (E1-E6)`

### Phase 2 — Completion report (Commit 3; Rule 25 — before final push)
Create `docs/completion-reports/DIAG-062_COMPLETION_REPORT.md` per §5. Commit and push.
**Commit 3:** `DIAG-062 Phase 2: completion report`

Then HALT. Post the OUTPUT artifact and the completion report contents to the architect. No PR is required for a DIAG unless the architect orders one at review.

## §4 — HALT CONDITIONS

- **HALT-1:** E1 provenance mismatch (error string does not trace to the no-profile branch) — paste the actual chain; stop.
- **HALT-2:** a census surface is unreachable via service-role read — paste the constraint and the searches attempted; stop. Do not substitute a mutation-bearing workaround.
- **Terminal HALT:** after Phase 2 — evidence only; no fix, no ranked causes; the architect drafts the fix directive from the output.

## §5 — REPORTING DISCIPLINE

**File:** `docs/completion-reports/DIAG-062_COMPLETION_REPORT.md` (canonical location per the 2026-06-10 standing-text correction).

## COMPLETION REPORT ENFORCEMENT
The completion report is created as a FILE, not terminal output — at `docs/completion-reports/DIAG-062_COMPLETION_REPORT.md`, BEFORE the batch's final push, containing VERBATIM gate criteria with PASS/FAIL and PASTED evidence, committed. If this file does not exist at batch end, the batch is INCOMPLETE.

**Skeleton (Rule 26) — criteria below are the canonical verbatim text:**

```markdown
# DIAG-062 COMPLETION REPORT
## Date / Execution Time
## COMMITS (in order)
## FILES CREATED
## FILES MODIFIED   (expected: NONE beyond docs — Rule 23)
## PROOF GATES — HARD
| HG-1 | The error chain is pasted with file:line: auth success -> resolveIdentity branch -> UI surface | | |
| HG-2 | The expected Sabor user set is pasted with its in-repo source path (or the search trail if absent) | | |
| HG-3 | auth.users census pasted (all %saborgrupo% users, all listed fields) | | |
| HG-4 | profiles census pasted (all rows for the Sabor tenant id, schema-verified columns) | | |
| HG-5 | Join diff pasted as three explicit lists (auth-without-profile / dead-link profiles / linked), admin@ placed | | |
| HG-6 | platform_events record pasted (E1 event + login.success for sabor emails since deploy) | | |
| HG-7 | Zero product code shipped: git diff scope is docs/ only (Rule 23) | | (git diff --stat paste) |
## PROOF GATES — SOFT
| SG-1 | Output artifact within Rule 20 limits (summaries <=15 lines per census, full pastes in appendices) | | |
| SG-2 | DIAG number derived from docs/diagnostics/, stated | | |
## STANDING RULE COMPLIANCE
- Rules 19-24 / Rule 23 docs-only / Rule 25 (report before final push - adaptation stated) / Rule 27 / Rule 28 (3 phases, 3 commits) / SR-44 (zero mutations, zero sessions)
## KNOWN ISSUES
## VERIFICATION SCRIPT OUTPUT  (the census script outputs)
```

## §6 — OUT OF SCOPE
Any fix, provisioning, re-linking, or data mutation; any auth-user creation or session mint; the orphan pass itself; password/provider repair; the reseed re-run. Observations only.

## §6A — RESIDUALS
- The fix directive (provisioning/re-link via the canonical `provision-user.ts` writer) follows from this evidence — architect-drafted.
- Forward formation rule (Meta, this session): every CC directive — DIAG included — uses full structured formation and produces a completion report; DIAG-061's lighter shape is superseded.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*DIAG-062_SABOR_PROFILE_MISSING_DIRECTIVE_20260610.md · read-only · evidence, then the architect*
