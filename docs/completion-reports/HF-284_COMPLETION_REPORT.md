# HF-284 COMPLETION REPORT

Login-path session lifecycle — stale per-browser bookkeeping cannot kill fresh
sessions. Gates re-keyed to the Addendum-1 session-ownership design (age clamp
withdrawn at HALT-2). Created BEFORE final build (Rule 25).

## Date / Execution Time
2026-06-10.

## COMMITS (in order)
1. `afe95926` — HF-284 Phase 0: directive + QD evidence + ADR
2. `87e32ee7` — HF-284 Phase 0-A: HALT-2 disposition addendum + ADR amendment
3. `40ced369` — HF-284 Phase 1: session-ownership invariant + error split + branch observability + tests
4. (this) — HF-284 Phase 2: completion report
5. (Phase 3) — build + tests appended; SR-39; PR

## FILES CREATED
- `web/src/lib/auth/session-lifecycle.ts` — pure ownership decision + `decodeJwtSessionId`
- `web/src/lib/auth/__tests__/session-lifecycle.test.ts`
- `web/src/lib/supabase/__tests__/auth-service.test.ts`
- `docs/vp-prompts/HF-284_DIRECTIVE_20260610.md`, `..._ADDENDUM-1.md`
- `docs/diagnostics/QD-SABOR-1_2_20260610.md`
- `docs/completion-reports/HF-284_ADR.md`, `HF-284_COMPLETION_REPORT.md`

## FILES MODIFIED
- `web/src/middleware.ts` — session-ownership gate replaces the init/clamp block
- `web/src/lib/supabase/auth-service.ts` — SESSION_ABSENT sentinel + classifyProfileFetch
- `web/src/contexts/auth-context.tsx` — sentinel handled at 3 call sites + distinct message
- `web/src/lib/auth/resolve-identity.ts` — zero_rows/query_error via client-capable path
- `web/src/lib/auth/auth-logger.ts` — declared `identity.resolve.session_absent`, `auth.session.bookkeeping_reset`
- (NO migrations/DDL; cookie-config.ts and SessionExpiryWarning.tsx UNTOUCHED)

## PROOF GATES — HARD

| ID | Criterion (verbatim, re-keyed per A1.4) | PASS/FAIL | Evidence |
|---|---|---|---|
| HG-1 | the ownership check governs BOTH kill paths (code paste) | **PASS** | middleware paste below |
| HG-2 | test (a) fail-before/pass-after | **PASS** | test output + test body below |
| HG-3 | tests (b)+(c) pasted (idle + absolute kill preserved) | **PASS** | test output below |
| HG-4 | session-absent vs profile-missing produce distinct user-facing messages (code paste) | **PASS** | auth-context paste below |
| HG-5 | the three branches emit via the client-capable path; event names declared (code paste) | **PASS** | resolve-identity + auth-service + auth-logger paste below |
| HG-6 | build exit 0 + full node --test output | **PENDING Phase 3** | appended in Phase 3 |
| HG-7 | zero migrations/DDL in the diff (git diff --stat paste) | **PASS** | diff --stat below |

### HG-1 — ownership gate governs both kill paths (`web/src/middleware.ts`)
```ts
let tokenSessionId: string | null = null;
try {
  const { data: { session } } = await supabase.auth.getSession();
  tokenSessionId = decodeJwtSessionId(session?.access_token);
} catch { tokenSessionId = null; }

const ownership = resolveSessionOwnership({
  now, sessionStartCookie: existingSessionStart, lastActivityCookie: existingLastActivity,
  sidCookie: existingSid, tokenSessionId, limits: SESSION_LIMITS,
});

if (ownership.reinit) {
  // sid ABSENT or mismatched → reinit clocks + tag, emit reset, DO NOT kill.
  supabaseResponse.cookies.set('vialuce-session-start', String(now), COOKIE_OPTS);
  supabaseResponse.cookies.set('vialuce-last-activity', String(now), COOKIE_OPTS);
  if (tokenSessionId) supabaseResponse.cookies.set('vialuce-session-sid', tokenSessionId, COOKIE_OPTS);
  logAuthEvent('auth.session.bookkeeping_reset', { had_prior, prior_*_age_ms }, user.id);
} else if (ownership.action === 'expired_absolute') {   // sid MATCH → raw 8h check
  ... clearAuthCookies + redirect /login?reason=session_expired ...
} else if (ownership.action === 'expired_idle') {       // sid MATCH → raw 30m check
  ... clearAuthCookies + redirect /login?reason=idle_timeout ...
} else {                                                 // sid MATCH + alive
  supabaseResponse.cookies.set('vialuce-last-activity', String(now), COOKIE_OPTS); // refresh idle clock
}
```
Both kill paths (absolute, idle) sit on the `else`-branch of the ownership gate — they
are reachable ONLY when sid matches (owned session); residue/new-session reinitializes.

### HG-2 — test (a): fail-before / pass-after (the login bug)
```
✔ (a) stale residue + MISMATCHED sid -> reinit, NO kill
✔ (a2) stale residue + ABSENT sid -> reinit, NO kill
```
Fail-before is asserted in-test: with `session-start = now-9h`, `last-activity = now-40m`,
`rawWouldKill(...)` returns `'expired_absolute'` (the OLD logic kills the fresh session).
Pass-after: ownership with `sidCookie=SID_A, tokenSessionId=SID_NEW` returns
`action='reinit'`, `reinit=true` — NO kill, clocks reinitialized.

### HG-3 — tests (b) + (c): genuine expiry preserved within an owned session
```
✔ (b) sid MATCH + last-activity 40m stale -> idle kill PRESERVED
✔ (c) sid MATCH + session-start >8h -> absolute kill PRESERVED
```
(b): `sidCookie=tokenSessionId=SID_A`, `last-activity=now-40m` → `action='expired_idle'`
— token freshness is irrelevant (sid is stable across refresh), so HALT-2's idle hole
cannot recur. (c): same sid, `session-start=now-9h` → `action='expired_absolute'` — the
8h cap fires despite any recent iat, because session-start resets only on a NEW session.

### HG-4 — distinct user-facing messages (`web/src/contexts/auth-context.tsx`)
```ts
const profile = await fetchCurrentProfile();
if (profile === SESSION_ABSENT) {
  return { success: false, error: 'Your session could not be established — please sign in again.' };
}
if (!profile) {
  return { success: false, error: 'Account found but profile is missing. Contact your administrator.' };
}
```
Session-absent (the live HF-284 branch) and profile-missing (true zero-rows) are now
separate strings, ending the cross-round mislabel.

### HG-5 — three branches on the client-capable path; names declared
`web/src/lib/auth/resolve-identity.ts` (zero_rows + query_error):
```ts
void logAuthEventClient('identity.resolve.query_error', { authUserId, error: error.message });
...
void logAuthEventClient('identity.resolve.zero_rows', { authUserId });
```
`web/src/lib/supabase/auth-service.ts` (session_absent):
```ts
if (userError || !user) {
  void logAuthEventClient('identity.resolve.session_absent', { reason: userError?.message ?? 'no_user' });
  return SESSION_ABSENT;
}
```
`web/src/lib/auth/auth-logger.ts` (declared types):
```ts
| 'identity.resolve.session_absent'
| 'auth.session.bookkeeping_reset'
```
Rationale: `logAuthEvent` no-ops client-side (auth-logger.ts:61, no service key) — the
exact reason DIAG-062 E6 saw zero `identity.resolve.zero_rows` despite the branch being
reachable on the browser login path.

### HG-7 — zero migrations/DDL (git diff --stat origin/main...HEAD)
```
 docs/completion-reports/HF-284_ADR.md              | 150 ++++
 docs/diagnostics/QD-SABOR-1_2_20260610.md          |  65 +
 docs/vp-prompts/HF-284_DIRECTIVE_20260610.md       |  82 +
 docs/vp-prompts/HF-284_DIRECTIVE_20260610_ADDENDUM-1.md | 26 +
 web/src/contexts/auth-context.tsx                  |  12 +-
 web/src/lib/auth/__tests__/session-lifecycle.test.ts | 153 +
 web/src/lib/auth/auth-logger.ts                    |   4 +
 web/src/lib/auth/resolve-identity.ts               |   9 +-
 web/src/lib/auth/session-lifecycle.ts              | 120 +
 web/src/lib/supabase/__tests__/auth-service.test.ts |  55 +
 web/src/lib/supabase/auth-service.ts               |  70 +-
 web/src/middleware.ts                              |  92 +-
```
No `.sql`, no `supabase/migrations/`, no DDL. Code + tests + docs only.

## PROOF GATES — SOFT
| ID | Criterion | PASS/FAIL | Evidence |
|---|---|---|---|
| SG-1 | no console noise added | **PASS** | no new `console.*` in the diff; reset/anomalies use the event channel, not console |
| SG-2 | ADR committed before implementation (commit order paste) | **PASS** | `afe95926`+`87e32ee7` (ADR/addendum) precede `40ced369` (implementation) |
| SG-3 | timeout constants untouched (diff paste) | **PASS** | `cookie-config.ts: UNTOUCHED`; `SessionExpiryWarning.tsx: UNTOUCHED` (diff name-only) |

## STANDING RULE COMPLIANCE
- Rules 19–24; Rule 25 (report before final build); Rule 27 (pasted evidence); Rule 28 (one commit per phase: 0, 0-A, 1, 2, 3).
- SR-39 — full verdicts appended Phase 3. Posture: CC6 neutral (timeout semantics byte-preserved within a session; cross-session residue removed); OWASP A07 (the clamp regression is the WHY this design replaced it — ownership keeps the 8h cap and 30m idle intact); NIST 800-63B (no lifetime extension — session-start resets only on a NEW auth session; expired Supabase sessions never reach this code). One-time post-deploy reinit of in-flight untagged sessions — bounded, disclosed.
- SR-41 (new commits only, no force-push). SR-44 n/a (no DDL).
- HALT-1 cleared (session_id present in the token — probe: claim keys include `session_id`). HALT-2 dispositioned by Addendum 1. HALT-3 bound to tests (b)+(c) — both PASS, genuine semantics preserved.

## KNOWN ISSUES
1. resolve-identity `zero_rows`/`query_error` now emit via `logAuthEventClient`; server-side
   callers (middleware) of those two branches degrade to silent (relative fetch is a no-op
   server-side). Accepted per directive 1.3 — server-side has its own `auth.redirect.*`
   observability; the bug and the silence were both client-side.
2. One-time post-deploy: in-flight sessions are untagged → first request reinitializes their
   clocks (bounded; strict thereafter). Disclosed under SR-39.
3. §6A Meta candidate #6: the withdrawn clamp conflated two bookkeeping cookies with opposite
   refresh semantics — invariants must be derived per-signal lifecycle, not per-threshold.

## VERIFICATION SCRIPT OUTPUT  (Phase 1 test run; full suite appended Phase 3)
```
✔ (a) stale residue + MISMATCHED sid -> reinit, NO kill
✔ (a2) stale residue + ABSENT sid -> reinit, NO kill
✔ (b) sid MATCH + last-activity 40m stale -> idle kill PRESERVED
✔ (c) sid MATCH + session-start >8h -> absolute kill PRESERVED
✔ (d) all cookies absent -> reinit (init), no kill, hadPrior false
✔ (e) legacy untagged cookies -> reinit, no kill
✔ owned + within both windows -> pass
✔ decodeJwtSessionId extracts session_id; null on malformed/absent
✔ getUser-null -> SESSION_ABSENT (NOT profile-missing null)
✔ user present + identity null -> null (profile-missing / zero-rows)
✔ user + identity -> mapped AuthProfile
ℹ tests 11 ℹ pass 11 ℹ fail 0
```
HALT-1 probe (session_id obtainable):
```
claim keys: aal, amr, app_metadata, aud, email, exp, iat, is_anonymous, iss, phone, role, session_id, sub, user_metadata
session_id present: true | value: 273b9bb2-0e18-4768-bb86-2f155a92b329
```

## PHASE 3 — BUILD + FULL SUITE + DEV SMOKE (HG-6)
Build sequence: `pkill -f "next dev"` → `rm -rf web/.next` → `npm run build` → `npm run dev` → curl.

Build — exit 0:
```
ƒ Middleware                                  76.9 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
(Full route table compiled; no type/lint/compile errors. `npx tsc --noEmit` also clean.)

Full `npm test` (node --test --import tsx 'src/**/__tests__/**/*.test.ts') — exit 0:
```
ℹ tests 91
ℹ suites 0
ℹ pass 91
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 579.287
```

Dev smoke — `http://localhost:3000/login`:
```
 ✓ Ready in 1038ms
HTTP 200
```
**HG-6: PASS.**

## SR-39 VERDICTS (Phase 3)
- **SOC 2 CC6 (logical access):** NEUTRAL. Within an owned session the idle (30m) and
  absolute (8h) checks run on RAW values exactly as before (HG-3 proves both still
  fire) — no auth strengthening or weakening. The only change is removing cross-session
  bookkeeping residue from adjudicating a session it never belonged to. Single
  authorization record per identity (resolveIdentity) unchanged.
- **OWASP A07 (identification & authentication failures / session management):** IMPROVED.
  The withdrawn iat-clamp would have defeated the 8h absolute cap (Hole 1) and blessed
  idle sessions on refresh-resumption (Hole 2); the ownership design keeps both caps
  intact (tests b, c) while eliminating the residue-kill of a freshly authenticated
  session. Session fixation is not introduced — the tag is read from the server-validated
  token's own `session_id`, never client-supplied.
- **NIST SP 800-63B (session management):** COMPLIANT. No session lifetime extension:
  `vialuce-session-start` resets ONLY when a NEW auth `session_id` is observed (a genuine
  new login), never on token refresh; an expired Supabase session never reaches this code
  (getUser() nulls upstream). Idle and absolute reauthentication thresholds are unchanged
  (cookie-config.ts untouched).
- **One-time post-deploy effect (disclosed):** sessions in flight at deploy are untagged
  (`vialuce-session-sid` absent) → their first authenticated request reinitializes the
  bookkeeping clocks and tags them (one `auth.session.bookkeeping_reset` with
  `had_prior:true`). Bounded to one request per in-flight session; strict ownership
  thereafter. No security downgrade — a reinitialized clock cannot exceed the live
  Supabase session, which getUser() already validated.
- **DS-014 (capability-based workspace authorization):** UNCHANGED — the MFA/workspace
  block downstream of the ownership gate is untouched.
- **Decision 123:** UNCHANGED.

## PR
**#476** — https://github.com/CCAFRICA/spm-platform/pull/476
`HF-284: session-lifecycle invariant — stale bookkeeping cannot kill fresh sessions`
base `main` ← head `hf-284-session-lifecycle-invariant`. **Held for architect merge instruction.**

## SR-43 ADDENDUM (post-merge, architect-side) — PENDING
In the SAME browser that failed: log in as `mesero@saborgrupo.mx` and `gerente@saborgrupo.mx`
→ tenant workspace renders; confirm `auth.session.bookkeeping_reset` and/or clean
`auth.login.success` rows; `platform@` regression unaffected.
