# HF-331 Completion Report — Complete OB-178 Phase C: Retire Surviving `getSession()` Callsites

**Date:** 2026-06-22 · **Category:** HF · **Branch:** `hf-331-getsession-retirement`
**Substrate:** Decision 142 (httpOnly cookie architecture — server-verified session reads), SR-34 (no bypass — class-wide), SR-39 (SOC 2 CC6 / OWASP session-management compliance gate). OB-178 Phase C **class closure**.
**Inventory + ADR:** `docs/diagnostics/HF-331_GETSESSION_INVENTORY.md`. **Directive:** `docs/vp-prompts/HF-331_DIRECTIVE_20260622.md`.

Sequence-number gate (HALT-4): HF-331 verified as next available (highest referenced = HF-330; the only "HF-331" was this directive file). No collision.

---

## Objective 1 — Inventory (full grep, classification, counts)

Full grep output + per-hit table in the inventory doc. Summary:

```
$ grep -rn "getSession" web/src/ --include="*.ts" --include="*.tsx"   → 13 hits
$ grep -rn "onAuthStateChange" web/src/ --include="*.ts" --include="*.tsx"  → 5 hits
```

| Disposition | Count | Callsites |
|---|---|---|
| **REPLACE** | 3 | `middleware.ts:219` (server, `access_token`→session_id) · `auth-context.tsx:183` (+import :24) (client presence pre-check) · `auth-service.ts:144` getSession() wrapper (dead after migration) |
| **RETAIN** | 3 | `auth-context.tsx:210` onAuthStateChange (event-type only + getUser refetch) · `auth-service.ts:241` onAuthStateChange wrapper · `app/auth/callback/route.ts` exchangeCodeForSession (server-authentic OAuth write path) |
| **INVESTIGATE** | 0 | — |
| N/A | — | `audit-service.getSessionId` (different method); 6 comment-only lines |

Under HALT-3 (15). No HALT-1 (no callsite mixes server-gating + client-write in one function).

**Mechanism note (why middleware was never the warning emitter):** the Supabase warning fires only on `session.user` access (an `insecureUserWarningProxy`) while `suppressGetSessionWarning === false`. In middleware, `getUser()` (`:137`) sets that flag true before `getSession()` (`:219`) runs, the route returns at `:150` if getUser fails, and `:219` reads `access_token` (never `.user`). The only server `session.user` access is `auth/callback` via `exchangeCodeForSession` (server-authentic). Regardless of the exact historical emitter, SR-34's objective (retire the class from server/auth-gating contexts) is met and proven via EPG-1.

---

## Architecture Decision Record

Committed before any source modification (Section B; directive ordering constraint) — `git 83b3a178`. Full record in the inventory doc §3. Decisions:
- **#1 `middleware.ts:219`** → `supabase.auth.getClaims()` (server-verified claim reader; returns `session_id`; no cookie-trusted `getSession()`; no insecure-user warning). Rejected: hand-parsing the `sb-<ref>-auth-token` cookie (AP-25 fragility). `getUser()` can't supply the access_token (HALT-2 shape mismatch), so a literal swap was impossible.
- **#2 `auth-context.tsx:183`** → collapse the `getSession()` presence pre-check + `getAuthUser()` two-step into a single server-verified `getAuthUser()`; preserve the stale-cookie `signOut()` by calling it on `null` (DD-7: downstream logic unchanged).
- **#3 `auth-service.ts` wrapper** → delete (sole consumer migrated).
- **RETAINED:** onAuthStateChange listeners; auth/callback exchangeCodeForSession (Decision 142 §4.3 write paths).

---

## Objective 2 — Per-file diffs (old → new)

`git diff main...hf-331 --stat`: 3 files, +19 / −25.

**`web/src/middleware.ts`** (import `:29`, body `:217–223`):
```diff
- import { resolveSessionOwnership, decodeJwtSessionId } from '@/lib/auth/session-lifecycle';
+ import { resolveSessionOwnership } from '@/lib/auth/session-lifecycle'; // HF-331: decodeJwtSessionId retired from middleware

  let tokenSessionId: string | null = null;
  try {
-   const { data: { session } } = await supabase.auth.getSession();
-   tokenSessionId = decodeJwtSessionId(session?.access_token);
+   const { data } = await supabase.auth.getClaims();
+   const sid = (data?.claims as { session_id?: unknown } | undefined)?.session_id;
+   tokenSessionId = typeof sid === 'string' ? sid : null;
  } catch {
    tokenSessionId = null;
  }
```

**`web/src/contexts/auth-context.tsx`** (import `:24`, initAuth `:181–197`):
```diff
- import { ..., fetchCurrentProfile, getSession, getAuthUser, onAuthStateChange, ... }
+ import { ..., fetchCurrentProfile, getAuthUser, onAuthStateChange, ... }

-   const session = await getSession();
-   if (!session) { return; }
-   const authUser = await getAuthUser();
-   if (!authUser) { await signOut().catch(() => {}); return; }
+   const authUser = await getAuthUser();   // sole, server-verified session source
+   if (!authUser) { await signOut().catch(() => {}); return; }   // preserves stale-cookie clear
```

**`web/src/lib/supabase/auth-service.ts`** (`:140–148`): deleted the `export async function getSession()` wrapper (replaced with an HF-331 retirement note). `getAuthUser()` / `fetchCurrentProfile()` (already `getUser()`-based) unchanged.

Downstream auth logic (role/tenant resolution, redirect routing, hydration gating, MFA enforcement, onAuthStateChange handling) **unchanged** (DD-7).

---

## Objective 3 — Elimination Proof Gate

**EPG-1** — `grep -rn 'getSession' web/src/ ...` → zero `supabase.auth.getSession()` / `.getSession()` API calls remain (verified: `grep "auth.getSession\|\.getSession()" ... | grep -v getSessionId` returns **nothing**). Remaining "getSession" hits are comments + the unrelated `audit-service.getSessionId`.

**EPG-2** — `grep -rn 'onAuthStateChange' web/src/ ...` → the only listener (`auth-context.tsx:205`) reads the **event type** (`SIGNED_IN`/`TOKEN_REFRESHED`/`SIGNED_OUT`) and re-fetches via `fetchCurrentProfile()` (`getUser()`-based); the wrapper (`auth-service.ts:235`) is a passthrough. No `session.user` cookie read for gating.

**EPG-3** — `npm run build`:
```
✓ Compiled successfully
ƒ Middleware                                  76.9 kB
build exit: 0
```
(The "Dynamic server usage" lines are the standard expected cookie/searchParams dynamic-render notices — not failures; build exited 0.) `npx tsc --noEmit` → 0 errors. Korean-test prebuild gate → PASS. `session-lifecycle` unit tests → 8/8 (decodeJwtSessionId retained + still verified).

**EPG-4** — `npm run dev` → `✓ Ready in 1217ms`; `curl /login` → **HTTP 200** (RETAIN login write-path intact).

**EPG-5** — `curl /` → **307 → /login**; `curl /select-tenant` → **307 → /login?redirect=%2Fselect-tenant** (middleware runs, clean redirect, no hang — the desktop Symptom-A surface). Dev-server log scan for `getSession` / "may not be authentic" / "insecure" → **NONE**. No compile errors.

> Authenticated-path note: unauth `curl`s do not reach the authed `getClaims()` branch (middleware returns at `:150` for unauthenticated requests). The change is type-checked, build-clean, and the `getClaims()` return shape (`data.claims.session_id`) is confirmed against `@supabase/auth-js` source. Per §6A / SR-44, the architect performs the authenticated desktop + iOS/FxiOS mobile A/B verification post-merge.

---

## HALT conditions

None fired. HALT-3 explicitly checked (3 REPLACE < 15). HALT-2 anticipated for `middleware:219` (getUser lacks `access_token`) and resolved via `getClaims()` (sanctioned, behavior-preserving). HALT-1/HALT-4 not applicable.

---

## ARTIFACT SYNC
```
MC: OB-178 Phase C ("retire client-side getSession in server/auth-gating contexts") → CLOSED (class closure).
    No new MC item warranted.
REGISTRY: Auth row → evidence: zero supabase.auth.getSession() API calls in web/src (EPG-1); middleware +
    auth-context init now exclusively server-verified (getUser/getClaims). Retire effort: "OB-178 Phase C
    incomplete — surviving getSession callsites."
R1: Auth criterion "server-enforced session validation (SOC2 CC6 / OWASP)" → status: server-verified across
    all auth-gating reads (middleware, client init); cookie-trusted reads eliminated.
BOARD: Auth/Session CAPS — gap "incomplete getSession migration" closed; ev=EPG-1..5; ef=getClaims server-verify.
SUBSTRATE: Decision 142 exercised (server-side session resolution); SR-34 (class-wide retirement, not instance);
    SR-39 (compliance restored); OB-178 Phase C class closure achieved. AP-D2 avoided (all 3 REPLACE migrated,
    not just the one symptom).
```

## Residuals (per directive §6A — named, not addressed)
eoadmin excessive session count (Decision 139 scope) · ~1/sec session-state polling (may incidentally reduce; not measured) · `auth.shell.hydration_timeout` emission (should cease if root retired; re-diagnose if it persists) · mobile iOS/FxiOS production verification (architect-only, SR-44).

---

## PR
`gh pr create --base main --head hf-331-getsession-retirement` — link appended below. **CC does not merge (SR-44).**
