# HF-331 — `getSession()` / `onAuthStateChange` Inventory + Architecture Decision Record

**OB-178 Phase C class closure.** Date 2026-06-22. Branch `hf-331-getsession-retirement`.
Method: exhaustive grep of `web/src/` (`.ts`/`.tsx`) + per-callsite source reading. Committed **before** any source modification (Section B gate; directive ordering constraint).

---

## §1 — Objective 1: Diagnostic grep (full output, evidentiary)

```
$ grep -rn "getSession" web/src/ --include="*.ts" --include="*.tsx"
src/middleware.ts:219:    const { data: { session } } = await supabase.auth.getSession();
src/contexts/auth-context.tsx:24:  getSession,
src/contexts/auth-context.tsx:183:        const session = await getSession();
src/contexts/auth-context.tsx:189:        //    getSession() can return stale cookie data in Chrome.        [comment]
src/components/layout/auth-shell.tsx:160:  // ... a hanging getSession()/getUser()/fetchCurrentProfile() ...  [comment]
src/lib/audit-service.ts:29:      sessionId: this.getSessionId(),                                  [DIFFERENT method]
src/lib/audit-service.ts:191:  private getSessionId(): string {                                   [DIFFERENT method]
src/lib/supabase/client.ts:10: * READ operations (getUser, getSession) are done SERVER-SIDE       [comment]
src/lib/supabase/client.ts:17: * Do NOT add getUser() or getSession() calls ...                   [comment]
src/lib/supabase/auth-service.ts:144:export async function getSession() {
src/lib/supabase/auth-service.ts:146:  const { data: { session } } = await supabase.auth.getSession();
src/lib/supabase/auth-service.ts:153: * getSession() can return stale cookie data ...                [comment]
src/lib/supabase/auth-service.ts:213:    // getSession() reads from cookies ...                       [comment]

$ grep -rn "onAuthStateChange" web/src/ --include="*.ts" --include="*.tsx"
src/contexts/auth-context.tsx:26:  onAuthStateChange,
src/contexts/auth-context.tsx:210:        unsubscribe = onAuthStateChange(async (event) => {
src/lib/supabase/client.ts:8: *   - onAuthStateChange (SIGNED_OUT detection only ...)            [comment]
src/lib/supabase/auth-service.ts:241:export function onAuthStateChange(
src/lib/supabase/auth-service.ts:245:  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
```

Additional server-side `session.user` access (found by auditing `.user` reads in `src/app`):
```
$ grep -rn "session.user" web/src/app --include="*.ts" --include="*.tsx"
src/app/auth/callback/route.ts:43,55,61,62,91  — session from exchangeCodeForSession(code)
```

---

## §2 — Per-hit classification table

| # | File:Line | Context | Reads session/user for auth-gating? | Disposition |
|---|---|---|---|---|
| 1 | `middleware.ts:219` | **server** (middleware) | Reads `session.access_token` (NOT `.user`) to decode the HF-284 session-ownership `session_id` claim. Token already validated by `getUser()` at `:137`. | **REPLACE** |
| 2 | `contexts/auth-context.tsx:183` | **client** (`initAuth` useEffect) | `const session = await getSession()` → `if (!session) return`. Cookie-PRESENCE pre-check, immediately re-validated by `getAuthUser()` at `:191`. Never reads `session.user`. | **REPLACE** |
| 3 | `contexts/auth-context.tsx:24` | client (import) | Import of the `getSession` wrapper (used only at `:183`). | **REPLACE** (remove import) |
| 4 | `lib/supabase/auth-service.ts:144–148` | utility (`export async function getSession`) | The wrapper itself (`supabase.auth.getSession()`). Sole consumer is `auth-context.tsx:183`. | **REPLACE → DELETE** (dead after #2) |
| 5 | `contexts/auth-context.tsx:210` | client (`onAuthStateChange` callback) | Callback signature is `(event)` — reads the **event type only** (`SIGNED_IN`/`TOKEN_REFRESHED`/`SIGNED_OUT`), then re-fetches via `fetchCurrentProfile()` which uses `getUser()`. Does NOT read `session.user`. | **RETAIN** (already compliant) |
| 6 | `lib/supabase/auth-service.ts:241–246` | utility (`onAuthStateChange` wrapper) | Generic passthrough of the callback; reads nothing. | **RETAIN** |
| 7 | `app/auth/callback/route.ts:41–91` | **server** (OAuth route) | `session` from `exchangeCodeForSession(code)` — a server round-trip; the session is server-authentic (NOT the cookie/storage `insecureUserWarningProxy` path). This is the OAuth code-exchange WRITE path (Decision 142 §4.3). | **RETAIN** |
| 8 | `audit-service.ts:29,191` (`getSessionId`) | utility | A DIFFERENT method — the audit-trail session id, not Supabase `auth.getSession`. | **N/A** |
| 9 | comments (`auth-context:189`, `auth-shell:160`, `client.ts:8/10/17`, `auth-service:153/213`) | — | Documentation only; no API call. | **N/A** (refresh prose to match) |

**Counts: REPLACE = 3 actionable callsites (`middleware:219`, `auth-context:183` [+import], `auth-service` wrapper delete) · RETAIN = 3 · INVESTIGATE = 0.**
Under HALT-3 (15). No HALT-1 (no callsite mixes server-gating + client-write in one function).

### Why the server-side warning is NOT middleware (mechanism, not assumption)
The Supabase warning fires only when `session.user` (an `insecureUserWarningProxy`, `auth-js/.../helpers.js:360`) is **accessed**, and only while `suppressGetSessionWarning === false`. In middleware: `getUser()` (`:137`) sets `suppressGetSessionWarning = true` BEFORE `getSession()` (`:219`) runs, and the route returns at `:150` whenever `getUser()` fails — so `:219` (a) never accesses `.user` and (b) runs only under a suppressed flag. Middleware therefore cannot emit the warning. The warning source is a `getSession()→session.user` read elsewhere; the only server `session.user` access is `auth/callback` via `exchangeCodeForSession` (server-authentic, RETAIN). Regardless of the exact emitting line, the directive's objective (SR-34: retire the `getSession()` class from server/auth-gating contexts) is met by REPLACE-migrating #1–#4 and proving EPG-1.

---

## §3 — ARCHITECTURE DECISION RECORD (Section B — committed before implementation)

```
Problem: Complete OB-178 Phase C — retire surviving getSession() consumers in server-side /
         auth-gating contexts (Decision 142, SR-34, SR-39). 3 REPLACE callsites identified.

#1 middleware.ts:219 — needs the session_id CLAIM (HF-284 ownership tag) from the access_token JWT.
   getUser() does NOT return the access_token, so a literal getSession→getUser swap is impossible
   (HALT-2 shape mismatch). Options:
     A (CHOSEN): supabase.auth.getClaims() — the library's SANCTIONED server-verified claim reader. It
       obtains the current token, verifies the signature (JWKS-cached on asymmetric keys; getUser(token)
       fallback on symmetric), and returns the decoded claims incl. session_id. Removes the explicit
       getSession() from OUR code (EPG-1) and yields a SERVER-VERIFIED session_id — the structural fix
       (SR-39). Does NOT emit the insecure-user warning (it reads claims, never session.user).
     B (REJECTED): hand-parse the sb-<ref>-auth-token cookie for the access_token + decodeJwtSessionId —
       fragile, coupled to @supabase/ssr storage format + chunking (AP-25 spirit).
   Behavior preserved exactly: tokenSessionId = claims.session_id ?? null; null on any error (the
   try/catch is retained). decodeJwtSessionId is retained (still unit-tested) but no longer called by
   middleware. Note: getClaims() internally reads the session to obtain the token; on symmetric JWTs it
   adds one verified getUser(token) call per request (middleware already calls getUser once at :137).
   Accepted per SR-39 (server-enforced verification over micro-latency); latency/polling deferred (§6A).

#2 auth-context.tsx:183 — client cookie-presence pre-check, immediately re-validated by getAuthUser()
   at :191. The pre-check is the stale-read race the directive blames for Symptom A. CHOSEN: collapse
   the getSession()+getAuthUser() two-step into the single authoritative getAuthUser(); PRESERVE the
   stale-cookie signOut() by calling it whenever getAuthUser() returns null (the stale-cookie case is
   the meaningful one; the no-cookie case is a harmless no-op already excluded on public routes by
   AUTH_SKIP_ROUTES). Downstream logic (fetchCurrentProfile, setUser, onAuthStateChange, redirect
   ownership) UNCHANGED (DD-7). Net: zero client getSession; the server-verified getUser() is the sole
   session source.

#3 auth-service.ts getSession() wrapper — dead after #2 (sole consumer). DELETE the function +
   the import in auth-context (SR-34: retire the class, no dead getSession in the tree).

RETAINED (correct per Decision 142 §4.3): onAuthStateChange listeners (event-type only + getUser
   refetch); auth/callback exchangeCodeForSession (server-authentic OAuth write path).

GOVERNING PRINCIPLES:
  G1 standard: OWASP session mgmt + SOC2 CC6 — server-verified session reads. G2 embodiment: getUser()/
    getClaims() round-trip to the Auth server is the structural control (not policy). G3 traceability:
    this inventory → ADR → diffs → EPG. SR-34 (no bypass — class-wide). SR-39 (compliance gate restored).
  DD-7: downstream auth logic byte-preserved; only the auth-state SOURCE changes.

Anti-Pattern Registry: AP-25 (no hardcoded field/cookie parsing — rejected Option B); AP-D2 (instance-
  vs-class closure — all three REPLACE callsites migrated, not just the one symptom).
```

**Gate complete.** Proceed to Objective 2.
