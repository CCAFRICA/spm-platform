# OB-201 — App UI Theme System ("Bliss" re-skin + global revert toggle) — Completion Report

**Date:** 2026-06-18 · **Branch:** `dev` · **HEAD:** `c4e6608a` · **Base for PR:** `main`.
**Status:** BUILT + server-verified. `next build` exit-0, `tsc --noEmit` clean. FOUC proof passed (both themes). Screenshot/console EPGs are browser-only → architect visual SR.

> **Branch note (surfaced):** `dev` was 416 commits behind main and 0 ahead (pre-OB-215). Building OB-201 on stale `dev` would have edited files against a 416-commit-old base → conflict/regression on merge. `dev` had zero unique commits, so I fast-forwarded it to main (`5fb6e45e → 5d9676da`, non-destructive) before building. PR is `dev`→`main`, diff = OB-201 only.

---

## 1 — ADR (Phase 1 EPG)
Committed: `docs/architecture/THEME_ARCHITECTURE_DECISION_OB201.md` @ `49af8fbb`. **Option A** (CSS-variable token swap under `[data-theme]`) chosen over Option B (parallel component layer): single tree + two token sheets, revert = one row, zero structural risk; B is a permanent maintenance fork. Decisive live-code context: the app already has the shadcn CSS-var seam (`hsl(var(--token))` in `tailwind.config.ts`) and an async server-component root layout — so the swap needs no component edits and no new hydration path.

## 2 — Token-set parity (Phase 2 EPG)
`globals.css` defines `:root, [data-theme="current"]` (today's EXACT values) and `html[data-theme="bliss"]`. Parity check (`comm -23 current bliss`) — **every CURRENT token is defined in BLISS (empty diff):**
```
CURRENT set: --accent --accent-foreground --app-bg --app-fg --background --border --card
  --card-foreground --chart-{1..5} --destructive --destructive-foreground --font-body
  --font-display --font-mono --foreground --input --muted --muted-foreground --popover
  --popover-foreground --primary --primary-foreground --radius --ring --secondary
  --secondary-foreground
BLISS set: <all of the above> PLUS bliss-only brand/primitive tokens:
  --color-{indigo,indigo-dark,indigo-soft,gold,gold-deep,gold-soft,ink,ink-bg,ink-panel,
  offwhite,muted,border} --sp-{2..16} --radius-{default,lg,xl,full} --shadow-{card,panel,hero}
Tokens in CURRENT missing from BLISS: (none)
```
The bliss-only tokens are referenced **exclusively by bliss-scoped CSS** (`html[data-theme="bliss"] .bliss-*`); zero current components reference them → **HALT-2 does not fire**.

## 3 — Before/after tokenization parity (Phase 2 EPG)
Pixel-equivalence at `current` is guaranteed **by construction**: (a) the `[data-theme="current"]` shadcn token values are byte-identical to the prior `:root`/`.dark` values; (b) the body shell tokens `--app-bg`/`--app-fg` equal the prior inline literals exactly (`#0a0e1a`/`#e2e8f0`); (c) no `data-theme` was emitted until Phase 3, so the Phase-2 render path was unchanged. **Visual before/after screenshots: architect SR** (browser-only; I cannot capture screenshots).

## 4 — platform_settings row (Phase 3 EPG §5.2)
FP-49 pre-check: columns `[id, key, value, description, updated_by, updated_at, created_at]`, `active_ui_theme` absent. After architect applied the seed:
```json
[ { "id": "4f284319-474d-47d0-8b44-ad97b3dcd67e", "key": "active_ui_theme",
    "value": "current",
    "description": "Global app UI theme. \"current\" or \"bliss\". Controls [data-theme] on root <html>.",
    "updated_by": null, "updated_at": "2026-06-18T05:09:15Z", "created_at": "2026-06-18T05:09:15Z" } ]
```

## 5 — FOUC proof (Phase 3 EPG §5.3) — `data-theme` in the INITIAL server-rendered HTML
`curl -s http://localhost:3000/login | grep '<html'` (raw network HTML, NOT the post-hydration DOM):
```
default (current):  <html lang="en" class="dark" data-theme="current" style="color-scheme:dark">
on transient flip:  <html lang="en" class="dark" data-theme="bliss"   style="color-scheme:light">
after revert:       <html lang="en" class="dark" data-theme="current" style="color-scheme:dark">
```
The attribute is present in SSR output — not applied via `useEffect`/client JS. **HALT-3 does not fire.** (The bliss row was set transiently via service-role to prove the SSR path, then reverted; the DB is left at the `current` default.)

## 6 — Bliss re-skin screenshots (Phase 3 EPG)
**Architect SR (browser).** Toggle Observatory → Settings → Appearance → "Bliss"; the page reloads and re-renders with `data-theme="bliss"`. Expect: indigo `#2D2F8F` primaries, gold `#E8A838` accents, offwhite page bg, Urbanist/Inter typography, diamond backdrop. **Coverage bound (§6A):** components using semantic Tailwind utilities (`bg-primary`, `text-foreground`, `bg-card`, `border-border`, `bg-muted`, charts) re-skin automatically; components with hardcoded literal palette classes or inline hex (much of the Observatory's own inline-styled panels, some dark one-offs) stay as-is — logged as follow-on residuals, not structural risk.

## 7 — Revert screenshots (Phase 3 EPG)
**Architect SR (browser).** Toggle back to "Current" → identical to pre-OB. Code-side guarantee: revert sets one row; `current` tokens equal pre-OB values exactly (see §3); SSR confirmed identical (§5).

## 8 — Console-clean both themes (Phase 3 EPG §5.5)
**Architect SR (browser console).** Code-side: `next build` exit-0, `tsc --noEmit` clean, no undefined-token references (§2 parity), the bliss `@import` and diamond data-URI are valid CSS. No console output is producible from `curl`.

## 9 — Explicit confirmations (§5A.9)
- **Zero new auth/RLS/session/encryption/audit surface.** Only an INSERT of one row into the existing global `platform_settings` (no `tenant_id`), read via the existing service-role path. SR-39 does not fire (DD-7).
- **Zero duplicate/parallel component files.** One component tree; the swap is CSS-variable overrides under `[data-theme]`. No forked code paths.
- **Default = `current`.** Seed value `"current"`; `getActiveTheme()` falls back to `current` on any error → deploy is visually inert.
- **Marketing/public routes untouched.** Only the authenticated app shell (`layout.tsx` body tokens + `globals.css` token blocks + the VL-Admin toggle) changed. No marketing files edited.
- **KAEL-7 widget / animated agent icons:** not added (out of scope §6).

## 10 — Commits (on `dev`)
| Phase | SHA | Content |
|---|---|---|
| 1 | `49af8fbb` | ADR |
| 2 | `7b96a443` | globals.css token sets + bliss palette/fonts/primitives; layout body tokens; tailwind font tokens |
| 3a | `4447ef48` | migration file (architect-applied) |
| 3 | `c4e6608a` | active-theme.ts + layout data-theme emit + VL-Admin Appearance toggle |

## 11 — Residuals (§6A)
- **Font-load perf:** three Google Fonts via `@import`; binaries fetch only under bliss usage. `<link rel=preload>`/self-host = follow-on HF.
- **Component re-skin coverage:** inline-styled / hardcoded-literal components (notably the Observatory's own panels, and any dark one-offs) do not auto-re-skin under bliss. Per-component token adoption = follow-on HFs; surfaces in the architect's §6/§7 visual pass.
- **Diamond logo:** SVG provided in the ADR; nav/favicon/spinner integration is follow-on (§6A).

---

*OB-201 · App UI Theme System · 2026-06-18 · vialuce.ai · presentation-layer, no IAP claimed. Screenshot + console EPGs pending architect visual SR.*
