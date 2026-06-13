# GOVERNANCE SESSION HANDOFF — 2026-06-10

**Session window:** 2026-06-10, extended continuous session (engine-arc close → auth incident → identity HF → tenant-entry diagnostic).
**Primary outcome:** HF-263→281 engine arc CLOSED (both proof tenants reconciled exact, twice across import generations); HF-282 canonical-identity shipped to production (`6c968ad`); an open tenant-entry defect isolated to a read-only diagnostic (DIAG-061) ready to dispatch.
**Reader orientation:** read Section -1, then 0, 19, 20 first. The rest fills in detail. This handoff is dense — paste it into the opening directive of the next conversation per the corrected handoff workflow. The open defect (DIAG-061) is the immediate work; everything else is closed or queued.

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE

1. **What we are building.** Vialuce (vialuce.ai) is a B2B ICM/SPM platform: a domain-agnostic prime-DAG calculation engine fed by a convergence layer that maps any tenant's spreadsheet columns to plan metrics with no per-tenant code, riding a fingerprint-based decreasing-cost recognition curve (Progressive Performance). It ingests a comp plan document + transaction data and produces auditable, reconciled commission payouts.

2. **Why it matters.** ICM platforms today require per-customer implementation engineering; Vialuce's thesis is that recognition + a universal calculation engine collapse that cost, and the "Verified Payout" (one commission calculated, reconciled, audit-sealed) is the billable unit. Primary market LATAM/Mexico. The moat is the recognition flywheel: second encounter of a known plan/data shape costs ~$0/~100ms.

3. **Current commercial gate / next user-facing milestone.** **User-Ready** — real test users logging in through the browser and running a tenant end-to-end. Two named testers exist (TD, EO) on platform-admin accounts.

4. **Binding constraint.** **Tenant entry is broken for tdadmin** (DIAG-061). tdadmin cannot get past the tenant-selection screen on production; eoadmin can. This blocks User-Ready directly — a tester who cannot enter a tenant cannot test anything. This is THE constraint; the engine is proven, the identity model is fixed, but the door to the workspace does not open for one tester.

5. **Frame of reference for next session.** Every action filters through: *does this open tenant entry for the testers, or is it local optimization?* DIAG-061 → its fix HF → tester re-verification is the critical path. Defer all else (CRP Plan 2/4, CRP Plan 3 grammar HF, the deferred unique constraint, Wave 2 substrate, orphan provisioning) until tenant entry works. The one parallel-safe item is the queued PR #471 (profile dedup) — inert until applied, does not touch tenant entry.

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

1. **Engine arc closed.** HF-263→281 complete: BCL (6 periods, $312,033 anchor exact) and Meridian (Q1 185,063/175,585/196,337 exact, reproduced across two import generations) both reconciled to the unit. Three structural invariants shipped (HF-279 coherence, HF-280 atomicity, HF-281 binding completeness), zero enumerated shapes.

2. **Auth incident → HF-282 shipped.** A multi-session debugging arc into "tdadmin ejected after login" found the cause was NOT account data but a code fork: `middleware.ts:304` used `.maybeSingle()`, which errors on platform@'s two profile rows. HF-282 (PRs #469 + #470, production `6c968ad`) shipped one canonical reader (`resolveIdentity`), one canonical writer (`provision-user.ts`), 13-branch redirect observability, and a dedup migration (PR #471, merged SHA `87df664f`) — the migration is merged but **not yet applied** and sits in a deprecated directory (Section 2 / Section 18 Risk 5).

3. **New defect surfaced post-fix, isolated to DIAG-061.** HF-282 fixed the *ejection*; a *different* symptom remains — tdadmin loops at tenant selection (clicks card, `/select-tenant` re-renders, `/operate` request never fires), reproduced across Chrome AND Safari. eoadmin (identical profile row, same build) enters cleanly. DIAG-061 (read-only) is drafted to find the runtime divergence from code, not theory.

4. **Workflow correction this session (binding).** The architect channel ran the human-as-debugger anti-pattern (CC_DIAGNOSTIC_PROTOCOL) for many turns — theorizing from logs/DB instead of tracing the code path (Rule 21), exceeding 3 diagnostic rounds (Rule 24), and repeatedly asking the tester for browser captures. Quality degraded late-session (basic errors: un-numbered DIAG, assumption-based SQL column, an invented "tester is flailing" narrative). This handoff exists partly to reset to a fresh context.

5. **Forward paths and recommendation.** Critical path: dispatch DIAG-061 → read its output → draft the tenant-entry fix HF → tester re-verifies. Parallel-safe: merge PR #471 + apply its migration (profile dedup; inert, does not touch tenant entry). Recommendation: **start a fresh conversation** for DIAG-061 — late-session reasoning quality in this conversation was below baseline.

---

## SECTION 1 — SESSION GOALS AND OUTCOMES

The session opened to close the HF-263→281 calculation-engine arc — verifying both proof tenants reconciled exactly against held ground truth, including a non-amnesia (Progressive Performance) re-import demonstration.

It did that (both tenants exact, twice across import generations, bindings DB-verified token-complete), then pivoted unplanned into a production auth incident: a tester reported being ejected after login. That investigation ran long, resolved into HF-282 (canonical identity resolution, shipped to production), and then surfaced a *second, distinct* tenant-entry defect that HF-282 did not address. The session ends with that defect isolated to a drafted read-only diagnostic (DIAG-061) rather than fixed, because late-session reasoning quality warranted a fresh-context handoff rather than continuing to a fix.

Summary: engine arc closed and identity-model fixed in production; one tenant-entry defect remains, cleanly scoped for the next session.

---

## SECTION 2 — REPO STATE AT SESSION CLOSE

- **Repo:** `CCAFRICA/spm-platform`. Branch `main` @ **`6c968ad`** (HF-282 winner-rule fixup, deployed to production via Vercel `vialuce-prod`).
- **Merged this session:** PR #469 (HF-282 SHA `68e350f8`), PR #470 (winner-rule fixup SHA `6c968adc`).
- **Merged this session (late):** **#471** (`hf-282-migration-amend`, merge SHA `87df664f`) — profile dedup migration + report updates. Now on `main`.
- **Authored, MERGED, NOT YET APPLIED:** `supabase/migrations/20260610120000_hf282_profile_dedup.sql` — deletes platform@'s `vl_admin` duplicate row + both tdelcarlo sandbox rows; UNIQUE(auth_user_id) constraint **removed** from it and deferred to the Platform-Created-Users OB. **Migration SQL still needs to be pasted into the Supabase SQL Editor to take effect** (merge ≠ apply).
- **⚠️ PLACEMENT DEFECT (discovered post-merge):** the dedup migration sits at the **deprecated** repo-root `supabase/migrations/` instead of the canonical `web/supabase/migrations/` (HF-259 commit `c983db1c` relocated the active migration set under `web/`). Root cause: the HF-282 directive §4 specified the literal path `supabase/migrations/<timestamp>_…` — a directive defect (drafted from a stale assumption), which CC followed correctly. **Does NOT affect a Dashboard SQL-Editor apply** (consumes content, not path), so the SQL is correct and applies as-is. A placement-fix PR (`git mv` to `web/supabase/migrations/`, content unchanged) is queued — see Section 18 Risk 5. Also noted: repo-root `supabase/migrations/` still contains a stale `016_flywheel_tables.sql` while canonical starts at `017…` — the deprecated folder is not fully drained; backlog assessment item.
- **External state:** Vercel `vialuce-prod` on `6c968ad`, Ready. Supabase project `dgmhpgycisvzxdudckiy` (shared dev/prod — B3 not yet done). Supabase **Site URL still `http://localhost:3000`** (queued fix, §6A of HF-282). `platform_events` now receiving named auth/tenant redirect events (HF-282 observability) AND background `.env`-scanner noise from the public internet.

---

## SECTION 3 — PR TIMELINE (SESSION-SCOPED)

| PR | Title | Base | Merge SHA | Scope |
|----|-------|------|-----------|-------|
| #466 | HF-279 DAG-divide band coherence | main | 0e386878 | (carried from prior arc; merged earlier) |
| #467 | HF-280 plan-import atomicity | main | 8e887370 | (carried; merged earlier) |
| #468 | HF-281 convergence binding completeness | main | — | (carried; merged earlier) |
| #469 | HF-282 canonical identity resolution | main | 68e350f8 | resolveIdentity, provision-user, observability, authored migration |
| #470 | HF-282 winner-rule fixup | main | 6c968adc | corrects resolveIdentity winner (vl_admin alias trap); resolve-identity 10/10 |
| #471 | HF-282 migration amendment | main | 87df664f | profile dedup (platform@ + tdelcarlo); constraint deferred; report updates. ⚠️ migration placed in deprecated dir (Section 2) |

---

## SECTION 4 — MAIN WORK SURFACE: HF-263→281 ENGINE ARC CLOSE

Both proof tenants reconciled exact against held ground truth, then re-imported to prove non-amnesia:

- **BCL:** Oct/Nov/Dec 44,590/46,291/61,986 exact; six-period sum $312,033 = anchor to the dollar; `resolutionFailures=[none]`; both variant groups mapped 7/7 fresh.
- **Meridian:** Jan/Feb/Mar 185,063/175,585/196,337 exact, **reproduced identically across two import generations** (componentTotals digit-identical). Fresh convergence mapped 8/8 both variant groups; senior-group "Utilización de Flota" resolved both hub tokens (the HF-281 defect did not recur). Bindings SQL on rule_set `cac8c391` confirmed all 10 components token-complete, both hub tokens on component_4 AND component_9, no failed markers.
- **Non-amnesia proof:** re-import of byte-identical files → all 3 sheets `tier=1 match=true`, fingerprints Updated not Stored-new, `llmCalled=false duration=0ms`, 32 fieldBindings injected from flywheel, HF-259 idempotent plan REUSE ($0 recognition). Progressive Performance demonstrated with hard numbers.

Class closed across three arms (SR-34): no plan persists incoherent (279), no plan persists incomplete (280), no calc runs unbindable (281).

---

## SECTION 5 — SECONDARY WORK SURFACE: AUTH INCIDENT → HF-282

A tester-reported "ejected after login" incident drove a long multi-session diagnostic. Key arc:

- Initial theories (profile id-keying, session/token expiry, cross-environment contention, scope) were each tested and falsified against evidence.
- The GoTrue auth log's `referer: localhost:3000` was correctly identified as a **Site URL config artifact** (not a second actor / not a real location) after the second-actor theory was raised and withdrawn — confirmed by platform@'s admin-call entries showing the same referer with no browser involved.
- **Actual cause:** `middleware.ts:304` `.maybeSingle()` errors on multi-row profiles → platform@ (2 rows) took a different code path than tdadmin (1 row). The accounts were equivalent; the CODE forked on row count.
- **HF-282 shipped:** `resolveIdentity` (one canonical reader, no maybeSingle), `provision-user.ts` (one canonical writer, atomic), 13-branch redirect observability, authored dedup migration. Winner-rule alias bug (vl_admin normalizes to platform, naive find picked wrong row) caught by CC's own test, fixed in #470.
- **Disposition (architect, binding):** one auth user → exactly one profile row (Option B), SOC CC6 governing; persona role-inheritance is presentation, not identity rows. HALT-2 (tdelcarlo two-tenant rows) dispositioned as deletable sandbox artifacts; UNIQUE(auth_user_id) deferred to Platform-Created-Users OB because the tenant-create flow inserts creator profiles (would conflict with the constraint).

Post-HF-282, the *ejection* is fixed but a *distinct* tenant-entry loop remains → DIAG-061 (Section 18, Risk 1).

---

## SECTION 6 — META CANDIDATES CAPTURED THIS SESSION

| Meta | Title | Domain |
|------|-------|--------|
| (architect-channel) | Human-as-debugger loop ran in architect channel, not just CC — the protocol's Rule 21/24 apply to architect diagnostic drafting too | Process / diagnostic discipline |
| (architect-channel) | DIAG numbering derived-from-conversation, not re-asked — using "can't derive from memory" as cover for not checking live context is a laziness failure | Drafting discipline |
| (provisioning) | User provisioning has had 5 mechanisms across 4 months (manual, CC scripts, app auto-create, cleanup HFs, admin-API) → torn-artifact class at identity layer; provision-user.ts is the canonical-writer answer | Identity / provisioning |
| (CI) | Vercel builds without running node:test → #469 shipped a failing test green; no PR test gate exists | CI / verification |

| (architect-channel) | HF-282 directive §4 specified deprecated migration path `supabase/migrations/` instead of canonical `web/supabase/migrations/` (HF-259 relocation) → CC placed the file wrong following the literal directive. Migration directives must specify the canonical `web/` path. | Drafting discipline / directive defect |

Total Meta candidates now in flight from this session: 5. All held for ICA Mode 1 disposition. Do NOT treat as binding standing rules.

---

## SECTION 7 — DECISIONS LOCKED AND UNLOCKED THIS SESSION

No new numbered Decisions locked. No Decisions unlocked.

**Operational decisions made this session (bind future work, not numbered):**
- One auth user → exactly one profile row (Option B), SOC CC6 governing. Persona role-inheritance reassigned to presentation layer.
- UNIQUE(auth_user_id) constraint deferred to a new **Platform-Created-Users OB** (the tenant-create creator-profile insert path must be reconciled first).
- tdelcarlo@vialuce.ai's two tenant_admin rows dispositioned as deletable sandbox artifacts.
- Tenant-entry defect (DIAG-061) is the binding constraint to User-Ready; all other work defers behind it.

---

## SECTION 8 — TMR CANDIDATES

Zero direct TMR candidates this session.

Indirect relevance (defer to ICA): the auth-incident diagnostic arc is a strong case study in evidence-from-code vs theory-from-logs; if a diagnostic-methodology TMR ever forms, this arc is source material.

---

## SECTION 9 — CLT ENTRIES

Zero formal CLT registry entries created this session.

Informal browser/runtime artifacts produced: tdadmin login tests (multiple, failing — the DIAG-061 symptom), eoadmin first-login test (clean), platform@ behavior (working). Production deploys: `68e350f8` then `6c968ad` to vialuce-prod.

---

## SECTION 10 — SR-39 COMPLIANCE GATE STATE

HF-282 touched auth/session/identity — SR-39 applies and was recorded in the HF-282 completion report Phase 6: unique identification (reader-enforced now, data-enforced deferred to the constraint OB), session-termination/redirect events logged (the 13-branch observability), no privilege escalation via duplicate-role rows (vl_admin row removal), cookie attributes unchanged-or-better. One axis (data-enforced uniqueness) intentionally outstanding behind the architect's deferral, not a failure.

DIAG-061 is read-only (no code) → no SR-39 gate.

---

## SECTION 11 — STANDING RULES STATE

`CC_STANDING_ARCHITECTURE_RULES.md` unchanged this session. No amendments. Promotion candidate queued: the CI-test-gate gap (Section 6) may warrant a standing rule that PRs run `node:test` before merge.

---

## SECTION 12 — DEFECT CLASS ANALYSIS

**Root pattern this session: diagnosis-by-theory instead of diagnosis-by-code-trace, in the architect channel.** The CC_DIAGNOSTIC_PROTOCOL forbids exactly this for CC (Rule 21 trace-before-fix, Rule 24 stop-at-3-rounds, anti-pattern human-as-debugger) — but the architect channel ran it anyway across the auth incident: many turns of theory generation from logs and DB censuses, repeated browser-capture asks to the tester, and theories advanced past where evidence supported them (the worst: an invented "tester is flailing across browsers" narrative that was actually correct test methodology).

**Surfaces it manifested:** (1) the profile-id-keying patch applied and live-tested before the lookup code was read (it didn't fix anything); (2) the referer field interpreted as a real location before verifying it was a config constant; (3) repeated SQL censuses proposed after the data layer was exhausted; (4) late-session basic errors (un-numbered DIAG, assumption-based column name in SQL).

**Why the catches worked:** the architect (human) repeatedly issued STEP-BACK / CRF interrupts that halted advancement on wrong premises — the eyewitness account (watching the tester log into vialuce.ai) directly contradicted and corrected a wrong log-interpretation. The lesson reinforced: when an eyewitness contradicts a log interpretation, interrogate the interpretation, not the witness.

**Correction applied:** DIAG-061 is structured to the protocol — trace the code path first (Rule 21), evidence-only, HALT before fix, no browser asks. The handoff to fresh context is itself the Rule-24 "stop and reset" rather than a 4th-round theory.

---

## SECTION 13 — FILES CREATED OR MODIFIED THIS SESSION

**Created (code, committed via #469/#470):** `web/src/lib/auth/resolve-identity.ts`, `web/src/lib/auth/tenant-gate.ts`, `web/src/lib/auth/__tests__/resolve-identity.test.ts`, `web/scripts/provision-user.ts`, `web/scripts/hf282-phase0-evidence.ts`.

**Modified (code, committed):** `web/src/middleware.ts`, `web/src/lib/supabase/auth-service.ts`, `web/src/lib/auth/server-auth.ts`, `web/src/lib/auth/auth-logger.ts`, `web/src/components/layout/auth-shell.tsx`, `web/src/contexts/tenant-context.tsx`, `web/scripts/fix-sabor-users.ts` (SUPERSEDED header).

**Created (committed via #471, unmerged):** `supabase/migrations/20260610120000_hf282_profile_dedup.sql`.

**Created (documentation, committed via CC):** `docs/diagnostics/DIAG-060_TENANT_ENTRY_BOUNCE_OUTPUT.md`, HF-282 completion report + ADR.

**To be dispatched next session (not yet in repo):** `DIAG-061_TENANT_ENTRY_DIVERGENCE_DIRECTIVE.md` (architect artifact, paste to CC → CC produces `docs/diagnostics/DIAG-061_..._OUTPUT.md`).

**External (Supabase/Vercel):** production deploys to `68e350f8` then `6c968ad`. Site URL change NOT yet applied.

---

## SECTION 14 — CONVERSATION PATTERN OBSERVATIONS

**Productive patterns that held:** STEP-BACK / CRF interrupts reliably halted wrong-premise advancement; PCD gate (verify schema before SQL) caught real column errors when invoked; the engine-arc close was crisp evidence-driven reconciliation.

**Unproductive patterns caught and corrected:** theory-from-logs (corrected late via the eyewitness contradiction and repeated STEP-BACKs); offloading decisions the architect already answered (DIAG number); assumption-based SQL (caught by PCD).

**Drift risks identified, not fully closed:** late-session reasoning quality degraded (the trigger for this handoff). The fresh-context handoff is the mitigation; if degradation recurs early in the next session, that is signal of context-window exhaustion rather than fatigue.

---

## SECTION 15 — CC EXECUTION OBSERVATIONS

CC performed at or above baseline. Specific catches: CC's own test caught the resolveIdentity winner-rule alias bug (vl_admin → platform) that #469 would otherwise have shipped, and CC fixed it in #470 and self-reported the staged-file omission honestly. CC honored both HALT-2 (tdelcarlo multi-tenant) and HALT-3 (existing tenantLoading guard) correctly during HF-282, surfacing findings rather than self-dispositioning. CC's DIAG-060 was thorough and correctly evidence-only. No false stops. The one CI gap (#469 failing test passing green) is an infrastructure gap, not a CC behavior failure — CC ran its tests locally and they passed; Vercel does not run them.

---

## SECTION 16 — GOVERNANCE ENGINE POSITION

IGF substrate unchanged this session — no Wave 2 promotion work occurred (engine arc + auth incident consumed the session). T2-E09 and T2-E30 remain the pending Wave 2 substrate items. No new FINDING-GOV entries. OB-IGF-03 through 06 agent runtimes remain future. The session's Meta candidates (Section 6) are held for ICA Mode 1 when it comes online.

---

## SECTION 17 — HANDOFF BEST-PRACTICE OBSERVATIONS

This handoff applies the canonical template (Sections -1 through 20) with Correction 19 (Section -1 Critical Path), Correction 1 (explicit execution locus throughout Section 19), and Correction 2 (minimum-viable Turn 2 verification). All corrections in `HANDOFF_TEMPLATE_CORRECTIONS.md` (through Correction 19) were read at draft time. Length is justified by the session spanning three distinct work surfaces (engine close, auth incident, open diagnostic). Section -1's binding constraint and Section 19's start script get the extra scrutiny the corrections mandate.

---

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

**Risks:**
1. **(BINDING) Tenant entry broken for tdadmin.** Blocks User-Ready. Mitigation: DIAG-061 → fix HF → re-verify. This is the session's whole forward focus.
2. **Shared dev/prod Supabase (B3 not done).** Made this session's localhost-referer confusion possible and means password-reset emails point at localhost. Mitigation: B3 substrate split (queued) + the Site URL fix (immediate, dashboard).
3. **CI runs no tests.** A failing test shipped green this session. Mitigation: add a PR test gate (Section 11 promotion candidate).
4. **Dedup migration merged (#471) but NOT applied.** platform@/tdelcarlo duplicates persist; `identity.resolve.duplicate_rows` logs on each resolve until the SQL is pasted into Supabase. Mitigation: paste `supabase/migrations/20260610120000_hf282_profile_dedup.sql` content into the SQL Editor (assertion-gated, rolls back if wrong; expect 3 rows deleted). Parallel-safe — does not touch tenant entry. Note: applying it makes tdelcarlo a zero-profile orphan (expected; sandbox account).
5. **Migration placement defect.** The dedup migration is at deprecated repo-root `supabase/migrations/` not canonical `web/supabase/migrations/` (HF-259 `c983db1c`). Root cause is a DIRECTIVE defect — HF-282 §4 specified the wrong literal path. Does not affect Dashboard apply. Mitigation: placement-fix PR (`git mv`, content unchanged). **Forward correction: every future migration directive must specify `web/supabase/migrations/` as the path — the repo-root location is deprecated.** Also assess the stale `016_flywheel_tables.sql` straggler in the deprecated dir.

**Open questions:**
1. **DIAG-061 root cause** — what varies at runtime between two identical platform profiles to make tenant entry complete for eoadmin and loop for tdadmin? Pending the DIAG output.
2. **Orphan provisioning** — 5 auth users without/with-drifted profiles (3 Banco Cumbre, admin@vialuce.ai, tdelcarlo post-delete). Roles/tenants need architect intent before `provision-user.ts --apply`. Deferred behind tenant entry.
3. **Did eoadmin actually enter a tenant, or just land on the picker and idle?** Unconfirmed — the log shows tenant_select then idle. If eoadmin never entered either, the click path may be unproven for BOTH accounts and DIAG-061's "eoadmin works" premise needs the picker-vs-entered distinction confirmed.

---

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

**Turn 1 — orientation (New-Conversation Claude reads, states orientation):**
New-Conversation Claude reads the appended handoff (Section -1, 0, 19, 20 first) and states a 3-line orientation grounding explicitly in Section -1 sub-sections 3 and 4: the milestone (User-Ready) and the binding constraint (tenant entry broken for tdadmin, DIAG-061). Architect confirms or corrects. Do NOT begin work until orientation is confirmed.

**Turn 2 — minimum-viable verification (Correction 2):**
1. **Andrew runs locally:** `git log origin/main --oneline -3` — confirms `6c968ad` (HF-282 winner fixup) is the head, pastes output back.
2. **Verbal confirmation:** "Since session close: has the dedup migration SQL been APPLIED in Supabase (#471 is already merged), has the migration placement-fix PR been done, has the Site URL been changed? Any other manual git/Supabase/Vercel/credential changes? If none, proceed."

That is the entire Turn 2. (No `ls`, no `git status`, no ceremonial re-checks — Correction 2.)

**Turn 3 — dispatch DIAG-061:**
New-Conversation Claude confirms the DIAG-061 directive (carried in the new-conversation starter, or re-read from `DIAG-061_TENANT_ENTRY_DIVERGENCE_DIRECTIVE.md`) is current against `6c968ad`, then **Andrew pastes DIAG-061 to CC**. CC produces `docs/diagnostics/DIAG-061_TENANT_ENTRY_DIVERGENCE_OUTPUT.md` (read-only, HALT after evidence). Andrew pastes the output back. New-Conversation Claude reads it and drafts the tenant-entry fix HF from the evidence — code-traced, not theorized (CC_DIAGNOSTIC_PROTOCOL Rule 21).

---

## SECTION 20 — PATH DETAIL

### Path A (CRITICAL) — Tenant entry fix → User-Ready
- **Identifier:** DIAG-061 → HF-283 (tenant-entry fix, number to confirm from repo at draft time)
- **Scope:** find the runtime divergence (DIAG-061 evidence §3.1–3.7), then one vertical-slice HF fixing the tenant-selection path so a platform/null-tenant tester enters a tenant; tester re-verifies on production.
- **Dependencies:** DIAG-061 output. Nothing else blocks it.
- **Gates:** DIAG evidence → HF (engine+experience slice if applicable) → SR-39 (touches auth/session) → production browser verification by the tester.
- **Meta baked in:** Rule 21 (code-trace before fix), Rule 24 (≤3 diagnostic rounds), no human-as-debugger.
- **Est. time:** one focused session if DIAG-061 names the cause cleanly.
- **Sequencing:** FIRST. Everything else defers behind it.

### Path B (PARALLEL-SAFE) — Profile dedup completion
- **Identifier:** #471 (MERGED, SHA `87df664f`) — apply + placement-fix outstanding
- **Scope:** (1) paste `supabase/migrations/20260610120000_hf282_profile_dedup.sql` content into Supabase SQL Editor, run (expect 3 rows deleted — platform@'s `vl_admin` + tdelcarlo's two; assertion passes, commits); (2) tell CC "migration applied" → CC tsx-reads EPG-4 (dup census 0, platform@ 1 row, tdelcarlo 0 rows); (3) placement-fix PR: `git mv` the migration to canonical `web/supabase/migrations/` (content unchanged) per HF-259 convention. Stops the `duplicate_rows` anomaly logging.
- **Dependencies:** none. Migration is inert until pasted; assertion-gated (rolls back if wrong). Placement fix is independent of apply (apply works from either path).
- **Sequencing:** any time; does not touch tenant entry. Note: applying makes tdelcarlo a zero-profile orphan (expected, sandbox).

### Path C (QUEUED, deferred) — behind tenant entry
- Site URL fix (dashboard, immediate when convenient); orphan provisioning (5 accounts, needs architect intent); Platform-Created-Users OB (the deferred UNIQUE constraint + tenant-create reconciliation); CRP Plans 2+4 reconciliation; CRP Plan 3 condition-subject grammar HF (evidence held: the intent-constructor rejects arithmetic in a condition subject — HF-271/279 composability class at a sibling surface); Wave 2 substrate (T2-E09, T2-E30); HF-263 CPI upsert dedupe; CI test gate.

**Recommendation across all paths:** Path A first, exclusively, until tenant entry works — it is the binding constraint to the only milestone that matters right now (User-Ready). Path B can be done in any idle moment (it is inert and safe). Everything in Path C defers. Start Path A in a FRESH conversation — late-session reasoning quality in the originating conversation was below baseline, and DIAG-061 deserves clean context.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*SESSION_HANDOFF_20260610.md — Session close 2026-06-10*
*Engine arc HF-263→281 CLOSED; HF-282 identity-canon shipped (6c968ad) + dedup PR #471 merged (unapplied); tenant-entry defect isolated to DIAG-061 (binding constraint to User-Ready). 5 Meta candidates in flight. Recommendation: fresh conversation, Path A.*
