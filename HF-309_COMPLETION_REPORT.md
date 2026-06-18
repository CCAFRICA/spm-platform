# HF-309 — Per-User Theme Preference + Login Page + Observatory Theming — Completion Report

**Date:** 2026-06-18 · **Branch:** `hf-309-user-theme-preference` · **HEAD:** `03148eb6` · base `main` (`4f96ae72`).
**Status:** BUILT — `next build` exit-0, `tsc` clean. Mechanism only; **zero visual/design changes**.

## G1 — Schema ✓
Architect applied `20260618130000_hf309_profiles_preferences.sql`. Service-role read:
```
OK preferences exists; sample: [{"id":"dad5ab3d-…","preferences":{}},{"id":"c2d0329a-…","preferences":{}}]
```
`profiles.preferences jsonb NOT NULL DEFAULT '{}'` present.

## G2 — Fallback chain ✓
`web/src/lib/theme/active-theme.ts`:
```ts
export async function getResolvedTheme(explicit?: AppTheme | null | string): Promise<AppTheme> {
  if (explicit === 'bliss' || explicit === 'current') return explicit;  // (1) per-context preference
  return getActiveTheme();  // (2) platform_settings global default → (3) 'current'
}
```
`web/src/app/layout.tsx`:
```ts
const cookieTheme = (await cookies()).get("vl-theme")?.value as AppTheme | undefined;
const explicitTheme = authState.isAuthenticated
  ? authState.profile?.themePreference ?? null   // (1a) authed → profiles.preferences->>'theme'
  : cookieTheme ?? null;                           // (1b) pre-auth → vl-theme cookie
const activeTheme = await getResolvedTheme(explicitTheme);
```
Three levels demonstrated:
- **user `preferences.theme="bliss"`** → `themePreference="bliss"` (resolveIdentity maps it) → bliss.
- **user `preferences={}`** → `themePreference=null` → `getActiveTheme()` (global) → global default.
- **global absent/error** → `getActiveTheme()` catch returns `'current'`.
`preferences` is threaded with **no extra query** — `resolveIdentity` already `select('*')`s; `mapToResolvedIdentity` extracts `themePreference` (validated to `current|bliss|null`) → `ServerAuthState.profile.themePreference`.

## G3 — Cookie (theme name string ONLY — HALT-2) ✓
`web/src/app/api/user/theme/route.ts`:
```ts
const VALID = new Set(['current', 'bliss']);
if (typeof theme !== 'string' || !VALID.has(theme)) return 400;   // validated before any write
res.cookies.set('vl-theme', theme, { path:'/', sameSite:'lax', secure:true, maxAge:31536000 });
```
`web/src/components/layout/user-menu.tsx` (on-login/authed-mount sync): `document.cookie = \`vl-theme=${t}; …\`` where `t ∈ {current,bliss}`. **No user id, tenant id, session token, or auth data is ever written to the cookie.** HALT-2 satisfied.

## G4 — Login page ✓ (runtime-verified)
Login renders via the root layout (no own layout), which reads `cookies()` server-side. With the global row at `bliss`:
```
no cookie            → data-theme="bliss"    (falls to global default)
cookie vl-theme=current → data-theme="current"  (cookie wins)
cookie vl-theme=bliss   → data-theme="bliss"
```
data-theme is in the initial SSR HTML (no FOUC).

## G5 — User toggle ✓
File `web/src/components/layout/user-menu.tsx`, route: the user-menu dropdown (rendered in the app shell for every authenticated user). A "Theme" segmented control (Current / Bliss) → `POST /api/user/theme` → `window.location.reload()` (server re-renders under the new preference). Per §3.4, no full My Profile page was built — only the toggle, in the nearest existing user surface.

## G6 — Observatory reached ✓
`select-tenant` (PlatformObservatory) has **no own layout** — it renders under the root layout and receives `data-theme`. Only nested layouts are `financial/` and `operate/`, which nest *inside* the root layout (App Router) and do not bypass `<html data-theme>`. No bypass anywhere. (Observatory inline-panel visual remediation remains §6 out of scope.)

## G7 — Global default preserved ✓
`platform_settings.active_ui_theme` row untouched; `getActiveTheme()` still reads it (it's level 2/3 of the chain); the Observatory > Settings > Appearance toggle (`FeatureFlagsTab`, OB-201) is unchanged and still the global control.

## G8 — Build clean ✓
`tsc --noEmit` exit 0; `npm run build` exit 0. (Two type fixes: the route uses a relaxed `SupabaseClient` cast because `preferences` isn't in the generated DB types yet — same pattern as OB-212 agent_invocations; and the `auth-service.test.ts` ResolvedIdentity mock got `themePreference: null`.)

## G9 — Current unchanged ✓
When no user has set a preference (the state before this HF), every render resolves `getResolvedTheme(null)` → `getActiveTheme()` → the same global value as pre-HF → identical output. The per-user path only diverges when a user explicitly opts in (new capability). No token/pipeline/vocabulary change. `data-theme="current"` is byte-identical.

## Commit table
| Item | SHA | What |
|---|---|---|
| migration | `264316fd` | `profiles.preferences` jsonb (architect-applied) |
| impl | `03148eb6` | fallback chain + cookie + /api/user/theme + user-menu toggle + preferences threading |
| report | (this) | HF-309 report |

## Confirmations
- **Cookie non-sensitive (G3):** theme name string only, validated; HALT-2 enforced.
- **Global default preserved (G7):** `platform_settings.active_ui_theme` + Appearance toggle intact.
- **Zero visual/design changes** — theme tokens/pipeline/vocabulary from PR #541 untouched.
- **Zero auth/RLS scope expansion** beyond the presentation-only `preferences` column; existing `profiles` RLS unchanged; SR-39 did not fire.

## Residuals (§6A)
- `vl-theme` cookie persists across logout by design (one-line follow-on to clear on sign-out if desired).
- `preferences` jsonb is extensible for future non-auth prefs (locale override, layout) — no schema change needed.
- Observatory inline-panel visual remediation (HF-305 G6) — standalone HF; the theme attribute reaches it.
- Login-page `text-white` straggler (HF-308 deferred) — surfaces during architect SR.

---

*HF-309 · Per-user theme preference · 2026-06-18 · vialuce.ai · mechanism only; user pref → global → current; cookie-backed login; Observatory in scope; global default preserved.*
