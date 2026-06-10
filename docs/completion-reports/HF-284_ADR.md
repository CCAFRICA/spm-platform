ARCHITECTURE DECISION RECORD — HF-284
=====================================
Login-path session lifecycle: stale per-browser bookkeeping cookies cannot kill a
fresh auth session. Section B gate; committed BEFORE any implementation code
(Phase 0), beside prior ADRs. Records the one-invariant choice + the combined-arms
scope (error split, branch observability).

PROBLEM
-------
`vialuce-last-activity` and `vialuce-session-start` are browser-session-scoped cookies
(no maxAge — HF-167) that OUTLIVE the auth session they describe. On login,
`signInWithEmail` (auth-service.ts:32-48) awaits `logAuthEventClient('auth.login.success')`
→ POST `/api/auth/log-event`, which TRAVERSES middleware before `fetchCurrentProfile`
runs (HF-151 made this deterministic). Middleware (middleware.ts:204/:241-246) reads a
stale `vialuce-last-activity` left by a PRIOR session in the same browser, computes idle
against a dead session's clock, and `clearAuthCookies` (:244) zeroes the just-created
`sb-*` cookies. `getUser()` then nulls at auth-service.ts:182-183 — short-circuiting
BEFORE the profiles query — and auth-context.tsx:256 mislabels it "Account found but
profile is missing." The absolute-timeout path (:234, `vialuce-session-start`) carries
the identical dead-cookie exposure. Empirically: admin@saborgrupo.mx sign-in 17:12:39Z
→ `auth.session.expired.idle` 17:12:40Z (QD-2 anchors; data census DIAG-062 proved the
profile rows are healthy and correctly linked — the failure is session-absent, not
profile-absent).

Defect class: CROSS-SESSION STATE LEAKAGE — per-browser bookkeeping adjudicating a
session it does not belong to. Closing only the idle path is instance closure (AP-D2);
the invariant must close idle AND absolute together, and cover every future login
surface (incl. platform-created users at first login).

OPTIONS (Section B template lines per option)
---------------------------------------------
Option A — token-issuance clamp: `effective = max(cookieTs, tokenIatMs)` for BOTH the
  idle (:241) and absolute (:234) checks, with heal-on-clamp (rewrite the clamped
  cookie to iat) and a `bookkeeping_healed` event.                          [CHOSEN]
  - Scale 10x: ok — O(1) per request, one JWT decode of an already-trusted token, no
    row work. AI-first: n/a. Transport: no new HTTP bodies (getSession reads cookies
    already present post-getUser). Atomicity: per-request decision, self-healing cookie
    write rides the existing pass-through response; genuine-idle path returns its own
    redirect response unchanged.
  - CHOSEN: ONE invariant — "a bookkeeping timestamp older than the current token's
    issuance is dead-session residue" — derived from the token's own `iat` claim, not
    from a registry of login call sites. Covers idle + absolute + every future surface.
    Genuine idleness byte-preserved: when the token is itself old (iat old) and activity
    old, effective stays old → expiry fires (DD-7 / T1-E947). No timeout constant
    changes; SessionExpiryWarning untouched. No lifetime extension beyond the issued
    session (effective ∈ [iat, now]; an expired Supabase session never reaches this code
    — getUser already nulled) → NIST 800-63B / CC6 neutral.
Option B — stamp the bookkeeping cookies at every login call site:
  - Scale 10x: ok. Transport: none. Atomicity: N independent writes, no barrier.
  - REJECTED: a call-site registry (Korean-Test failure) — the alias of "current
    session" scattered across every signIn surface; misses future/forgotten surfaces
    (platform-created users); fails derivation-from-one-declaration.
Option C — make the cookies auth-lifecycle-scoped (clear on every login before checks):
  - REJECTED: still leaves first-request ordering races (the log POST traverses
    middleware before any clear could run client-side) and does nothing for the silent
    mislabel; treats the symptom (cookie lifetime) not the invariant (issuance is the
    floor).

COMBINED ARMS (named per DD-7 — explicit scope, not scope creep)
----------------------------------------------------------------
Arm 1 (structural invariant): the clamp above. The fix.
Arm 2 (honest error surfaces): `fetchCurrentProfile` distinguishes session-absent
  (getUser null → typed sentinel `SESSION_ABSENT`) from profile-zero-rows (null);
  auth-context maps them to DISTINCT user messages. The mislabel directly extended this
  diagnosis across three rounds — fixing the structure without fixing the surface would
  leave the next session-absent failure equally unreadable.
Arm 3 (branch observability): the silent client-login branches (resolve-identity
  zero_rows/query_error + the new session_absent) emit via the client-capable path
  (`logAuthEventClient`), since `logAuthEvent` no-ops client-side (auth-logger.ts:61) —
  which is precisely why E6 saw zero `identity.resolve.zero_rows` despite the branch
  being reachable on the browser path.

SR-39 POSTURE (full verdicts in the completion report, Phase 3)
---------------------------------------------------------------
CC6: timeout semantics preserved, dead-state leakage removed — neither strengthens nor
weakens auth. OWASP A07: session fixation/lifecycle — the clamp binds bookkeeping to the
issued token, removing cross-session residue. NIST 800-63B: no session lifetime extension
(clamp floors at issuance, never beyond now; expired Supabase sessions never reach here).
DS-014 / Decision 123: unchanged.

CONSEQUENCES
------------
+ One derived invariant closes idle + absolute + all future login surfaces.
+ Session-absent failures become readable and observable.
- resolve-identity's zero_rows/query_error now emit via the client path; server-side
  callers (middleware) of those two branches degrade to silent (fetch is a no-op on the
  server). Accepted: server-side has its own `auth.redirect.*` observability; the bug and
  the silence were both client-side. Recorded in KNOWN ISSUES.
- One JWT decode per authenticated request (already-trusted token; negligible).

*HF-284 ADR · a session is never idle before it exists*
