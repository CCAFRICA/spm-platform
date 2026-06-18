# HF-310 — Theme Toggle Accessibility Fix + Settings Surface Remediation — Completion Report

**Date:** 2026-06-18 · **Branch:** `hf-310-theme-toggle-fix` · **HEAD:** `cf08e8cd` · base `main` (`b1a784b6`).
**Status:** BUILT — `next build` exit-0, `tsc` clean. UI access-layer fix; HF-309 mechanism unchanged.

## Root-cause diagnosis (why the toggle wasn't visible)
HF-309 added the toggle to `web/src/components/layout/user-menu.tsx`. That component is rendered **only in the top-bar `Navbar`, and only on mobile** — its own comment: *"User Menu - Only show on mobile since Rail has UserIdentity on desktop."* On desktop, the bottom-left sidebar user menu is a **different component**, `web/src/components/navigation/mission-control/UserIdentity.tsx` (rendered by `ChromeSidebar.tsx:430`). So HF-309's toggle was real but on a surface desktop users never open. Confirming clue: the architect saw "My Profile / Settings / Sign Out" — exactly `UserIdentity`'s items, not `user-menu.tsx`'s ("Profile / Settings / Audit Log / Log out").

Secondary: `UserIdentity`'s "My Profile" and "Settings" `DropdownMenuItem`s had **no `onClick`** → clicking did nothing. The `Navbar` gear `<Button>` likewise had **no `onClick`/`href`**, and its `hidden md:flex` class wrongly **showed** it on desktop (the comment intended the opposite).

## G1 — Toggle visible ✓
`UserIdentity.tsx` now renders the toggle directly in the dropdown (both collapsed + expanded views), zero navigation steps:
```tsx
const themeToggle = (
  <div className="px-2 py-1.5">
    <div className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground">
      <Palette className="h-3.5 w-3.5" /> {isSpanish ? 'Tema' : 'Theme'}
    </div>
    <div className="inline-flex w-full rounded-md border border-border overflow-hidden text-xs">
      {(['current','bliss'] as const).map((t) => (
        <button onClick={() => setTheme(t)} disabled={themeSaving}
          className={theme===t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}>
          {t==='current' ? 'Current' : 'Bliss'}</button>))}
    </div>
  </div>
);
// rendered as {themeToggle} in both the collapsed and expanded DropdownMenuContent
```

## G2 — Toggle functional ✓
```tsx
const setTheme = async (next) => {
  if (next === theme || themeSaving) return;
  setThemeSaving(true);
  const res = await fetch('/api/user/theme', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ theme: next }) });
  if (res.ok) window.location.reload(); else setThemeSaving(false);
};
```
Calls the existing HF-309 route (persists `profiles.preferences` + sets the `vl-theme` cookie), then reloads so the server re-renders under the new `data-theme`. Browser click = architect SR-44.

## G3 — Gear icon ✓ (removed)
The dead `Navbar` Settings gear `<Button>` (no `onClick`/`href`) was removed with a code comment, plus its now-unused `Settings` lucide import. Settings access is the rail user menu; a real Settings page is a separate OB (§6A).

## G4 — Settings link ✓ (removed)
The `UserIdentity` "Settings" + "My Profile" items (no `onClick`; `/configure` & `/configuration` are 6-line redirect stubs, not real pages) were removed per §3.3 + HALT-1 (do not build a Settings page). Sign Out retained. The menu is now: [user info] → Theme toggle → Sign Out — every item functional.

## G5 — Observatory ✓
`select-tenant` (PlatformObservatory) has **no own layout** → renders under the root layout and receives `data-theme`. Unauth `curl /select-tenant` → 307 (redirect to login), confirming it sits behind the same root layout/auth. No bypass (HF-309 G6 holds).

## G6 — Login page ✓ (runtime-verified)
```
curl --cookie 'vl-theme=bliss'   /login → data-theme="bliss"
curl --cookie 'vl-theme=current' /login → data-theme="current"
```
The login page (root layout, pre-auth) emits `data-theme` from the `vl-theme` cookie in the initial SSR HTML.

## G7 — Build clean ✓
`tsc --noEmit` exit 0; `npm run build` exit 0.

## Commit table
| Item | SHA | What |
|---|---|---|
| fix | `cf08e8cd` | toggle → UserIdentity (live sidebar menu, both views); removed dead Settings/My-Profile items + Navbar gear button |
| report | (this) | HF-310 report |

## Confirmations
- HF-309 mechanism unchanged (API route, cookie, fallback chain, `profiles.preferences`).
- Toggle is in the dropdown, zero navigation steps (§4.2).
- No visual/design changes beyond the toggle; no schema changes.

## Residuals (§6A)
- Full Settings page + real My Profile page — deferred to a separate OB (HALT-1). Dead links removed rather than stubbed.
- `user-menu.tsx` (mobile top-bar menu) retains its HF-309 toggle — functional on mobile; harmless redundancy with the rail toggle.
- `database.types.ts` still stale for `preferences` (route uses a relaxed cast) — recommend a standalone type-regen (FP-49B).
- Login-page `text-white` straggler (HF-308 deferred) — surfaces during SR.

---

*HF-310 · Theme toggle accessibility + Settings remediation · 2026-06-18 · vialuce.ai · toggle relocated to the live sidebar menu; dead Settings surfaces removed; HF-309 mechanism intact.*
