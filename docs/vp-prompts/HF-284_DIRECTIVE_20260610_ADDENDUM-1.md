# HF-284 — ADDENDUM 1: HALT-2 DISPOSITION — OWNERSHIP, NOT AGE

**Date:** 2026-06-10
**Parent:** `docs/vp-prompts/HF-284_DIRECTIVE_20260610.md` — all terms binding except as amended.
**This file:** save verbatim at `docs/vp-prompts/HF-284_DIRECTIVE_20260610_ADDENDUM-1.md`; commit in Phase 0-A.

## A1.1 — RULING
The §3 1.1 timestamp-clamp design is **WITHDRAWN for BOTH paths**. Grounds: (1) CC's HALT-2 constraint — clamping `session-start` to a refreshing `iat` defeats the 8h absolute cap (OWASP A07 / SR-39 regression); (2) architect-identified second hole — clamping `last-activity` to `iat` blesses genuinely idle sessions whenever the resumption request triggers a token refresh (idle gap > token TTL ⇒ fresh iat ⇒ clamp passes a 30-min-violating session). Age is a broken proxy for residue under token refresh. The residue signal is **session identity**.

## A1.2 — BINDING DESIGN: SESSION-OWNERSHIP TAGGING
1. **Tag:** new cookie `vialuce-session-sid` = the access token's `session_id` claim (decode post-`getUser()`; same cookie options family as the other bookkeeping cookies). HALT-1 is redefined: `session_id` unobtainable in the middleware context → paste constraint, stop. `iat` is no longer needed.
2. **Ownership check (every authenticated request, before any expiry kill):**
   - sid cookie ABSENT or ≠ token `session_id` → the bookkeeping cookies are another session's residue (or legacy-untagged): **reinitialize** `vialuce-last-activity = now`, `vialuce-session-start = now`, `vialuce-session-sid = session_id`; emit server-side `auth.session.bookkeeping_reset` with `{ had_prior: bool, prior_last_activity_age_ms?, prior_session_start_age_ms? }`; **do not kill**; continue the request.
   - sid MATCH → run the idle (:241) and absolute (:234) checks **exactly as current code, raw values** — semantics byte-preserved within a session.
3. **Consequences (state in ADR + report):** login-path kill eliminated (new sign-in ⇒ new `session_id` ⇒ reinit, never kill); 8h absolute cap fully intact (session-start resets only on a new auth session); 30-min idle fully intact (refresh-resumption is sid-matched ⇒ raw check kills). One-time post-deploy effect: in-flight sessions are untagged ⇒ first request reinitializes their clocks (bounded, disclosed; strict thereafter) — record under SR-39.
4. Event rename: `auth.session.bookkeeping_healed` → `auth.session.bookkeeping_reset` (declared in auth-logger types). Arms 1.2 (error split) and 1.3 (branch observability) proceed UNCHANGED from the working tree.

## A1.3 — TESTS (replaces §3 1.4)
(a) stale cookies + new/absent sid → reinit, NO kill (the login case; fail-before/pass-after pasted) · (b) sid-matched + last-activity 40 min stale → idle kill PRESERVED, including with a freshly-refreshed token · (c) sid-matched + session-start > 8h → absolute kill PRESERVED despite recent iat · (d) cookies absent entirely → initialized as today · (e) legacy untagged cookies → reinit, no kill (migration case). HALT-3 (semantics changed) now binds to (b) and (c).

## A1.4 — SEQUENCE AND BOOKKEEPING
- **Phase 0-A (Commit 1A, before Phase 1):** commit this addendum + ADR amendment via NEW commit (SR-41): Option A (clamp, both variants) REJECTED with both holes recorded verbatim; Option B' (session-ownership tagging) CHOSEN; option (a) idle-only REJECTED (inherits the refresh-resumption hole + leaves absolute exposure).
- Phase 1 then proceeds per A1.2/A1.3; gates HG-1/HG-2/HG-3 re-keyed to the ownership design (HG-1: ownership check governs both kill paths, code paste; HG-2: test (a) fail-before/pass-after; HG-3: tests (b)+(c) pasted). §6A gains: "Directive-defect Meta candidate #6: the clamp invariant conflated bookkeeping cookies with opposite refresh semantics — invariants must be derived per-signal lifecycle, not per-threshold."
- All other parent terms unchanged. Resume at Phase 0-A.

*vialuce.ai · HF-284 A1 · the clock belongs to the session that wound it*
