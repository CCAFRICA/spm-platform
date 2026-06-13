# GOVERNANCE SESSION HANDOFF — 2026-06-11

**Session window:** 2026-06-10 → 06-11, approximately one extended day of continuous work (long session; closed at architect order).
**Primary outcome:** Tenant entry restored platform-wide (HF-283, production-verified) and the login-killing session-lifecycle defect eliminated (HF-284, production-verified at the middleware layer) — while the Sabor tenant-user login failure remains OPEN with no established RCA, and the architect pivoted the program to User Provisioning & RBAC (DS-027 drafted) as the structural resolution path.
**Reader orientation:** read Section -1 first, then 0, 19, 20. The rest fills in detail. This handoff pairs with `NEW_CONVERSATION_STARTER_20260611.md`; paste both per the corrected workflow.

---

## SECTION -1 — CRITICAL PATH TO OBJECTIVE (Correction 19)

**1. What we are building.** Vialuce (vialuce.ai) is a B2B Incentive Compensation Management / Sales Performance Management platform whose engine is a domain-agnostic prime-DAG calculator fed by a convergence layer that maps any tenant's data columns to plan metrics with zero per-tenant code. Its distinguishing architecture: AI recognizes (compact CompositionalIntent), deterministic code constructs and guarantees (Decision 158); every fingerprint re-encounter rides a decreasing-cost curve (Progressive Performance). Repo `CCAFRICA/spm-platform` (Next.js / Supabase / Vercel), production at vialuce.ai.

**2. Why it matters.** ICM buyers pay for trustworthy, auditable commission outcomes without consultant-built per-tenant logic. The billable unit is the Verified Payout (one commission calculated, reconciled, audit-sealed); the moat is that the second encounter of any plan shape costs ~$0/~100ms. Three proof tenants already reconcile to ground truth exactly (BCL $312,033; Meridian Q1 trio twice; CRP Plans 1+3 $364,457.84).

**3. Current commercial gate / next user-facing milestone.** **User-Ready** — real users run end-to-end through the browser. Platform personas (platform@, tdadmin, eoadmin) now WORK in production: login → tenant entry → workspace. Tenant personas are the gap.

**4. Binding constraint.** Tenant-side users cannot be trusted to exist correctly: every tenant user was seed-created outside any validated path, and the Sabor trio still fails login with an unestablished RCA (strongest untested suspect: `capabilities` stored as JSONB object vs the design-contract array). The binding work unit is the **User Provisioning & RBAC build (DS-027 → OB)** — one validated writer, contracts at the door, Sabor re-provisioned through it as acceptance test A1. (Two optional 5-minute closure probes exist for the current defect; see §20 Path B.)

**5. Frame of reference for next session.** Every proposed action filters through: *does this advance tenant users working in production via the provisioning build (or close the Sabor RCA in ≤5 minutes on the way)?* If neither, defer. Do not resume open-ended Sabor troubleshooting — the architect explicitly halted that line after 6+ hours; only the two bounded probes in §20-B are sanctioned.

---

## SECTION 0 — CRITICAL ORIENTATION FACTS

1. **HF-283 CLOSED (SR-43 ratified):** RLS role-vocabulary drift fixed via one canonical DB predicate `public.is_platform()` re-keying 72 live policies; tenant entry verified in browser for all three platform personas. PRs #473 (merge `54416d6b`), #474 (`b95f14c7`), #475 (`ab958dd1`).
2. **HF-284 shipped and production-verified at the middleware layer, but its SR-43 close is RESCINDED:** session-ownership tagging (`vialuce-session-sid`) replaced the stale-cookie kill — five `bookkeeping_reset → login.success` pairs observed in production — yet the Sabor user-facing login still fails (architect eyewitness, post-deploy, hard-refreshed). PR #476 (merge `3a09afa8`, production), addendum PR #477 (`59c52182`) — the #477 addendum's user-outcome claim is retracted and needs a correcting addendum.
3. **Sabor RCA: NOT ESTABLISHED.** Eliminated with receipts: data/linkage (DIAG-062), RLS policy (EPG-P), query under JWT (QD-1/2), session survival (HF-284 events), Site-URL/provider, cache (hard-refresh failed). Untested prime suspect: capabilities shape (object vs array; splits working/failing 6-for-6). Two bounded probes drafted (§20-B).
4. **Architect pivot (sovereign):** stop troubleshooting; build User Provisioning & RBAC. **DS-027** functional design drafted (operationalizes DS-014; capabilities derived from role; single writer; Sabor re-provisioning = acceptance A1) — awaiting §1/§9 dispositions, then OB directive in the fresh session. ~9 Meta candidates held (Section 6); none binding.
5. **Recommended next action:** Turn-1 orientation → architect dispositions DS-027 (§1 amendments incl. DS-014 lock, §9 exclusions) → draft the Provisioning/RBAC OB directive (full formation); optionally fold the two 5-minute Sabor probes into the OB's Phase 0.

## SECTION 1 — SESSION GOALS AND OUTCOMES

The session opened against DIAG-061 with the goal of restoring tenant entry for testers and closing the auth arc. It achieved that fully (HF-283), then absorbed an unplanned second arc: the Sabor "Account found but profile is missing" report, which produced DIAG-062, two QUICK DETERMINE reads, and HF-284 — a real, production-verified session-lifecycle fix — without resolving the reported symptom, whose root cause remains open. The architect ordered a strategic pivot: leverage the design history (DS-014 located and read in full) into DS-027, a functional design for platform-owned user provisioning and RBAC, converting the unresolved defect class into the new build's acceptance criteria. Summary: two structural auth fixes shipped and verified; one user-facing defect open with a named untested suspect; program redirected to the provisioning build.

## SECTION 2 — REPO STATE AT SESSION CLOSE

- **Repo:** `CCAFRICA/spm-platform`; `main` at `59c52182` (PR #477 doc merge) — production deployment at `3a09afa8` (PR #476 merge; Vercel Ready ~00:10Z, confirmed post-#476 by GitHub deployments API). Feature branches merged and cleaned per CC report.
- **Committed this session (code):** `web/src/middleware.ts` (ownership gate), `web/src/lib/auth/session-lifecycle.ts` (+tests), `web/src/lib/supabase/auth-service.ts` (SESSION_ABSENT), `web/src/contexts/auth-context.tsx` (error split), `web/src/lib/auth/resolve-identity.ts` + `auth-logger.ts` (client-capable emits); HF-283: migration `web/supabase/migrations/20260610180000_hf283_rls_platform_predicate.sql` (architect-applied), `resolve-identity.ts` PLATFORM_ROLE_VALUES export, lifecycle route derivation, tenant-entry error surface + events.
- **Committed (docs):** HF-283/HF-284 directives + addenda (`docs/vp-prompts/`), QD-SABOR-1_2 (`docs/diagnostics/`), completion reports + ADR (`docs/completion-reports/`), DIAG-061/062 outputs.
- **Outputs NOT yet committed (architect-side, from this conversation):** `DS-027_USER_PROVISIONING_RBAC_FUNCTIONAL_DESIGN_20260611.md`, `PLATFORM_CREATED_USERS_OB_SCOPE_20260611.md`, this handoff + starter. DIAG-063 (+A1) exists in outputs but is **WITHDRAWN — never execute**.
- **External state:** Supabase prod — dedup applied (platform@ vl_admin row + tdelcarlo dup rows removed); HF-283 migration applied; **no** schema change for HF-284. Site URL fix instructed (Auth → URL Configuration → `https://vialuce.ai` + redirect allowlist) — **completion unconfirmed.** Vercel prod = `3a09afa8`. Sabor tenant `f7093bcc-…`; admin@ auth id `72f821b1-2e31-4266-ac5d-7c977f6569e8`.

## SECTION 3 — PR TIMELINE (SESSION-SCOPED)

| PR | Title | Base | Merge SHA | Scope |
|---|---|---|---|---|
| #473 | HF-283 RLS platform predicate | main | `54416d6b` | is_platform(), 72 policies re-keyed, tenant-entry arm |
| #474 | HF-283 SR-43 addendum | main | `b95f14c7` | browser+events closure evidence |
| #475 | Report relocation + standing-text fix | main | `ab958dd1` | docs/completion-reports/ canon; Section D rule 5 |
| #476 | HF-284 session-lifecycle invariant | main | `3a09afa8` | ownership tagging, error split, observability, 91 tests |
| #477 | HF-284 SR-43 addendum (doc) | main | `59c52182` | closure evidence — **user-outcome claim RETRACTED; correcting addendum owed** |

## SECTION 4 — HF-283 EXECUTION CYCLE (main work surface)

DIAG-061 falsified per-account divergence and proved class-wide denial: `tenants_select_vl_admin` keyed raw `'vl_admin'` while HF-282's canonical role is `'platform'` → zero tenant rows for every platform user → loadTenantConfig throw. Fix: one SECURITY DEFINER predicate `public.is_platform()` mirroring exported `PLATFORM_ROLE_VALUES`; wholesale re-key of the policy class with names/cmds/TO/permissive byte-preserved (EPG-1-PRE-R2 live read authoritative after the architect caught the first read's missing roles/permissive columns). Addenda: A1 lifecycle-route derivation + migration-021 storage policies as OR-disjunct (no second predicate); A2 transformation taxonomy P1/P2/P3, stale `profiles.id=auth.uid()` keying preserved as residual; A3 TO/permissive preservation; A4 HALT-6 voided — **no human passwords persisted anywhere ever**; harness mints user JWTs via service-role generateLink→verifyOtp (standing posture). Harness flip: 0→9 tenants for all three personas; Sabor control stable at 1. Browser-verified by architect; 13 `tenant.entered` events; SR-43 RATIFIED CLOSED.

## SECTION 5 — SABOR ARC + HF-284 (incident surface; partially open)

Sequence: DIAG-062 (orphan hypothesis falsified; all three users correctly linked, roles admin/manager/sales_rep) → EPG-P (profiles policies healthy) → QD-1 (query returns row under minted JWT; anon returns `[]` silently) → QD-2 (mechanism: browser-scoped `vialuce-last-activity` outlives its session; signInWithEmail awaits a log POST that traverses middleware; stale cookie → idle check kills the FRESH session 1s after login; getUser nulls; UI mislabels as profile-missing) → **HF-284**: CC HALT-2 correctly stopped the architect's clamp design (Hole 1: defeats 8h cap under token refresh — CC; Hole 2: blesses idle resumption — architect), dispositioned to **session-ownership tagging** (`vialuce-session-sid` = token `session_id`; mismatch→reinit+`bookkeeping_reset`, never kill; match→raw checks byte-preserved) + error split (`SESSION_ABSENT` sentinel, distinct message) + client-capable branch observability. 91/91 tests; shipped `3a09afa8`.
**Then the overclaim:** SR-43 was closed on `bookkeeping_reset→login.success` pairs — but `login.success` fires BEFORE the profile fetch, so it cannot prove the user outcome. Architect eyewitness (post-deploy, fresh incognito, hard-refreshed): same old error string, **zero** failure-branch events — internally contradictory on new code (the split string can't render without an emit). Stale-bundle explanation was applied twice against the eyewitness and is NOT confirmed as resolution (hard refresh failed). History search (architect-ordered) surfaced the Mar-6 cache precedent — which then didn't apply. Final state: network capture shows the profiles query returning 200 @ 1.1 kB (row-sized) during a failing attempt; `/auth/v1/user` healthy; log-event route has **no** runtime allowlist (CC-verified — new event names persist). **Untested prime suspect:** capabilities shape — failing Sabor rows carry `{"admin":true,"financial":true,"icm":true}` (object), all working rows carry arrays; DS-014/MDS-v2 contract is array. Probe SQL drafted (§20-B). A CC read of `fetchCurrentProfile`/`mapProfileToUser` full bodies was requested; **response never arrived in-channel**. SR-43 close **RESCINDED by architect-channel; CC acknowledgment unconfirmed.** Architect then pivoted (§ -1.4).

## SECTION 6 — META CANDIDATES CAPTURED THIS SESSION

| # | Title (short) | Domain |
|---|---|---|
| M1 | Incomplete read surface ×2 (unreachable pg_policies path; EPG-1 missing roles/permissive) | architect drafting |
| M2 | Credential persistence prohibition → mint pattern standing | security/verification |
| M3 | Courier-as-hands git (CC does ALL git; architect gates = paste + reply) | channel discipline |
| M4 | Stale-path class (PROJECT ROOT → docs/completion-reports/) | governing-text hygiene |
| M5 | Invariants derived per-signal lifecycle, not per-threshold (clamp conflated opposite cookie semantics) | design method |
| M6 | Regenerate-vs-retrieve diagnosis (history search found the precedent only when ordered) | diagnosis method |
| M7 | `login.success`-before-fetch ⇒ outcome overclaim class (SR-43 ratified on proxy evidence) | verification |
| M8 | Eyewitness-dismissal (stale-bundle story used twice against architect reports) | verification |
| M9 | All CC directives (incl. DIAG) = full formation + completion report; lightweight QD blocks only for read-only determination | formation rules |

Total Meta candidates now in flight: ~9 from this session (plus prior accumulation). All held for ICA disposition. Do NOT treat as binding standing rules.

## SECTION 7 — DECISIONS LOCKED AND UNLOCKED THIS SESSION

No new numbered Decisions locked. No Decisions unlocked. **Proposed for lock next session:** DS-014 (with DS-027 §1 amendments). Operational decisions binding forward: is_platform()/PLATFORM_ROLE_VALUES pairing (HF-283); session-ownership tagging design (HF-284 A1); no-credentials mint posture (HF-283 A4); reports live at `docs/completion-reports/`; structured-MD formation for every CC directive; concise architect-gate format ("run X / file at Y / steps 1-2-3"); architect dispositions supersede stale directive text; numbers derived from registries, never placeholders (DS-027 derivation: index allocates DS-020–026 → DS-027).

## SECTION 8 — TMR CANDIDATES

Zero direct TMR candidates this session. Indirect: M5 (per-signal-lifecycle invariants) and the HALT-2 two-hole episode may merit eventual methodology capture. Defer to ICA.

## SECTION 9 — CLT ENTRIES

Zero formal CLT entries created. Informal browser/runtime verifications: platform@/tdadmin/eoadmin tenant entry (HF-283 SR-43); Sabor admin@ failing attempts 00:28/01:31/post-hard-refresh (architect); production deploy confirmations; events-table reads.

## SECTION 10 — SR-39 COMPLIANCE GATE STATE

Both HFs touched auth/session: HF-283 and HF-284 completion reports carry full SR-39 verdict sections (CC6 neutral/no-weakening; OWASP A07 improved — the rejected clamp would have been a regression; NIST 800-63B no lifetime extension; DS-014/Decision 123 unchanged; HF-284 one-time post-deploy reinit disclosed). The forthcoming Provisioning/RBAC OB is SR-39-mandatory (user lifecycle + invite/reset token flows).

## SECTION 11 — STANDING RULES STATE

`CC_STANDING_ARCHITECTURE_RULES.md` amended this session: Section D rule 5 now reads `docs/completion-reports/` (PR #475). Project-knowledge copy of `COMPLETION_REPORT_ENFORCEMENT.md` still carries the stale "PROJECT ROOT" line — **Andrew-side project-file edit pending.** Promotion candidates: M2 (no-credentials), M9 (formation rule) queued for future amendment, held with Metas.

## SECTION 12 — DEFECT CLASS ANALYSIS (required)

**Root pattern: verification by proxy + claim hardening.** Manifestations: (a) HF-284 SR-43 ratified on `login.success` events that fire pre-fetch — proxy mistaken for outcome; (b) the stale-bundle narrative applied twice against architect eyewitness without confirmation; (c) the Mar-6 precedent first missed (regenerate-vs-retrieve), then over-applied. Catches that worked: architect STEP BACKs forced the rescind and the history search; CC HALT-2 stopped a real OWASP regression pre-ship and the re-derivation found a second hole — the formation discipline converting a design error into a one-message correction. **Secondary class: architect directive defects** (read-surface omissions, clamp mis-derivation, placeholder numbering AP-D7) — caught by CC gates and architect SOP enforcement, all corrected in-session. Carried rule: outcome claims require outcome evidence (screen or post-fetch event), never upstream proxies.

## SECTION 13 — FILES CREATED OR MODIFIED THIS SESSION

**Created (code, committed):** session-lifecycle.ts + 2 test files. **Modified (code, committed):** middleware.ts, auth-service.ts, auth-context.tsx, resolve-identity.ts, auth-logger.ts; HF-283 set incl. migration + lifecycle route. **Created (docs, committed):** HF-283 directive+A1–A4, HF-284 directive+A1, two completion reports + ADR, QD-SABOR-1_2, DIAG-061/062 outputs, SR-43 addenda. **Architect outputs (uncommitted):** DS-027, OB scope doc, this handoff, the starter; DIAG-063+A1 (WITHDRAWN — discard). **External config:** dedup SQL + HF-283 migration applied (Supabase); Site URL change instructed/unconfirmed.

## SECTION 14 — CONVERSATION PATTERN OBSERVATIONS

Productive: QUICK DETERMINE read blocks (mechanism found in two messages); HALT discipline; verbatim-receipt evidence chains; concise architect-gate format. Unproductive, caught: DIAG-formation theater (063 withdrawn); four rounds of DevTools envelope-chasing from imprecise capture instructions; proxy-based ratification. Drift risks open: the rescinded SR-43 must not silently re-harden in future summaries; session length itself degraded precision near the end (architect named it; honored by this close).

## SECTION 15 — CC EXECUTION OBSERVATIONS

Above baseline. Standouts: HALT-2 constraint paste (in-tree verified, correctly scoped, no self-disposition); clean evidence-gated completion reports (91/91, pasted gates); honest deployment-binding caveat (couldn't tie `dpl_` id → said so). No false stops. One open thread: the requested fetchCurrentProfile/mapProfileToUser read and the SR-43-rescind acknowledgment never returned in-channel — re-issue if §20-B runs.

## SECTION 16 — GOVERNANCE ENGINE POSITION

No VG substrate work this session; no substrate-state claims made (Correction 17 gate therefore not triggered — it binds the moment next session touches VG). IGF Wave-2 promotions (T2-E09, T2-E30) remain pending as before. VP↔VG: this session's Meta crop (~9) is ICA-capture inventory.

## SECTION 17 — HANDOFF BEST-PRACTICE OBSERVATIONS

Applied at draft time: Corrections 1 (execution loci throughout), 2→5 (Turn 2 = zero commands; decision-branched verbal confirmations only), 3 (corrections-file pointer in the starter), 7 (Vocabulary Appendix below), 19 (Section -1 + fresh-agent-first read order in the starter). Corrections 6–7 full texts are absent from project files (only change-log lines exist) — **gap flagged**; honored by their summaries. CLOSING_PROMPT (VG) adopted partially per architect's "if beneficial": final-pass seven-category inventory delivered in chat; the separate Closing Report file consciously folded into this handoff's §4/§5/§12/§13 at this session's scale — separation remains available for future sessions. Length rationale: two shipped HFs + one open incident + a program pivot justify density above template minimum.

## SECTION 18 — RISKS AND OPEN QUESTIONS FOR NEXT SESSION

**Risks:** R1 — the rescinded HF-284 SR-43 re-hardens via stale summaries (mitigation: §0-2 wording is canonical; correcting addendum is Path C). R2 — Sabor troubleshooting re-expands unbounded (mitigation: §-1.5 frame; only §20-B probes sanctioned). R3 — Site URL unconfirmed blocks every email flow in the OB (mitigation: Turn-2 confirmation; 2-minute Dashboard action). R4 — provisioning OB drafted without DS-027 dispositions → rework (mitigation: Turn 3 sequence). R5 — capabilities normalization (§6 remediation) touching live rows without the constraint set could mask the defect instead of proving it (mitigation: probe first OR normalize-with-evidence inside the OB).
**Open questions:** Q1 — DS-027 §1 amendments (incl. DS-014 lock) and §9 exclusions: architect disposition? Q2 — run §20-B probes pre-OB or fold into OB Phase 0? Q3 — did CC acknowledge the SR-43 rescind / mark the #477 addendum REOPENED? Q4 — were the four `user_recovery_requested→login→logout` pairs (14:59/15:20/22:58/23:55, admin@) CC mint probes? (presumed yes; label in record). Q5 — Site URL change completed? Q6 — gh GraphQL token SSO refresh (low).

## SECTION 19 — IMMEDIATE NEXT SESSION START SCRIPT

**Turn 1 — Claude (new session):** reads `NEW_CONVERSATION_STARTER_20260611.md` (pasted by Andrew) and the appended artifacts (this handoff; DS-027). Posts an orientation confirmation that explicitly states the milestone (User-Ready) and binding constraint (Provisioning/RBAC build; Sabor RCA open with bounded probes) per Section -1.3/-1.4, plus any drift detected between this handoff and the starter. No tools beyond the reads.
**Turn 2 — Andrew replies (zero commands; decision branches inline):** (a) "Any manual changes to git/Supabase/Vercel since close?" — if yes, name them, Claude re-baselines; (b) "Site URL set to https://vialuce.ai?" — if no, Andrew does it now (Dashboard → Auth → URL Configuration), 2 minutes, before any email-flow design; (c) "Did CC acknowledge the SR-43 rescind?" — if unknown, Claude includes the re-issue line in the next CC paste.
**Turn 3 — Andrew dispositions DS-027 §1/§9 (and Q2: probes pre-OB or in-OB).** Claude (architect channel) then drafts the **Provisioning/RBAC OB directive** in full formation (INF reference: §0 header w/ Autonomy + Rules 25–28, phases w/ commit-per-phase, HALTs, Rule-26 report skeleton, §6/§6A; CC paste block LAST) — CC executes; Andrew couriers.

## SECTION 20 — PATH DETAIL

**Path A — OB: User Provisioning & RBAC (RECOMMENDED).** Identifier: OB number derived from Mission Control/registry at draft. Scope: DS-027 §2–§8 (single writer + API routes; F1–F7 flows; two surfaces; remediation migration — orphans, UNIQUE(auth_user_id), role CHECK, capabilities array CHECK + normalization, tenant-create auto-insert fix; events/audit; SR-39). Dependencies: DS-027 dispositions (Turn 3); Site URL (Q5); DS-014 lock recommended. Gates: per falsifiable artifact (writer+contracts → migration applied → surfaces → email flows → A1–A4 acceptance), Correction-5 budget. Meta rules baked in: M2 (mint, no credentials), M7 (outcome evidence only — A1 is a browser screen, not an event proxy), M9 (full formation). Estimated: 1–2 sessions. Sequencing: first.
**Path B — bounded Sabor probes (≤10 min total, optional, foldable into A Phase 0).** (1) **Andrew runs in Supabase SQL Editor:** `UPDATE profiles SET capabilities='["admin","financial","icm"]'::jsonb WHERE auth_user_id='72f821b1-2e31-4266-ac5d-7c977f6569e8';` then logs in as admin@saborgrupo.mx in a fresh window. Branch: login lands → RCA = capabilities shape, confirmed; gerente/mesero + seeder fix ride the OB remediation with proof. Login still fails → revert (`SET capabilities='{"icm":true,"admin":true,"financial":true}'::jsonb`, same WHERE) and stop — the OB's re-provisioning supersedes further probing. (2) **CC executes (paste):** the outstanding read — full bodies of `fetchCurrentProfile` + `mapProfileToUser` + every null/throw condition when a row IS returned — plus rescind acknowledgment. Decision branch: if mapper rejects object-shaped capabilities, RCA confirmed from code side.
**Path C — HF-284 SR-43 correcting addendum (doc-only, CC, 15 min).** Scope: #477 addendum amended — middleware arm VERIFIED (events), user-outcome claim RETRACTED, status tied to Path A/B resolution. Dependency: none. Sequencing: ride along with A's first doc commit.
**Path D — B3 dev/prod substrate separation.** Unchanged from prior handoffs; deferred behind A per §-1.5 (it gates real *external* test users; A gates users existing at all).
**Recommendation:** A, with B folded into A's Phase 0 and C riding A's first commit. Reasoning: A removes the binding constraint and structurally resolves the open defect; B costs minutes and can convert A1 from hope to certainty before the build starts.

---

## VOCABULARY APPENDIX (Correction 7)

OB=feature build · HF=hotfix · DIAG=diagnostic (never ships code) · QD=lightweight read-only determine block · CLT=browser verification · DS=design spec · SR-34/39/41/42/43/44=standing rules (no-bypass / compliance gate / revert discipline / locked-rule halt / ship-completes-work / destructive-ops-are-Andrew's) · EPG=evidence paste gate (architect Dashboard read) · CRF+PCD=pre-action checklist + compliance verdict table · CC=Claude Code implementation channel · VP/VG=platform repo / governance repo · Mint=credential-free user JWT via generateLink→verifyOtp · SR-43 RESCINDED=closure withdrawn; do not re-harden.

---

*vialuce.ai · Intelligence. Acceleration. Performance.*
*GOVERNANCE_SESSION_HANDOFF_20260611.md — Session close 2026-06-11*
*Two auth invariants shipped and verified; Sabor RCA open with bounded probes; program pivoted to DS-027 Provisioning/RBAC. ~9 Meta candidates held. Forward: disposition DS-027, draft the OB.*
