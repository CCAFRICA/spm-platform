# HF-305 — Full Visual Remediation (hardcoded dark literals → theme-aware tokens) — Completion Report

**Date:** 2026-06-18 · **Branch:** `dev` · **HEAD:** `db2dfd76` · **PR:** #541 (`dev`→`main`, also carries OB-201).
**Status:** BUILT — `next build` exit-0, `tsc --noEmit` clean, FOUC intact. Screenshot SR-44 (browser) is the architect's.

## Strategy (ULTRACODE latitude — "how you get there is yours")
Per-occurrence rewriting of 3047 dark-palette classes was rejected: it cannot preserve byte-for-byte `current` (dozens of distinct shades → a handful of semantic tokens) and is 3047 chances to break a className. Instead I made the **Tailwind neutral palette itself theme-aware**: each `slate`/`zinc`/`gray`/`navy` step resolves to `rgb(var(--c-SCALE-STEP, <exact-original-hex>) / <alpha-value>)`. At `current` the vars are unset → the fallback IS the exact original hex → byte-for-byte identical, zero component edits. Under `[data-theme="bliss"]` `globals.css` defines the vars, inverting the dark scale to bliss light surfaces + ink/muted text. This reskins all ~3047 occurrences across 206 files at once, safely.

---

## G1 — Hardcoded literal count (before / after)
- **Before:** 3047 dark-palette class occurrences (slate/zinc/gray/navy), 206 files. Plus 128 white/black, 1211 inline-hex (87 files).
- **After (source):** **3047 — unchanged BY DESIGN.** The literals are no longer rewritten; the *palette they resolve to* is now theme-aware. The meaningful metric is **bypass**, not literal count:
- **After (compiled CSS):** **0 non-var-backed neutral utilities.** Every `.bg/.text/.border-{zinc,slate,gray}-N{...}` routes through `--c-*`:
```
$ grep -ohE '\.(bg|text|border)-(zinc|slate|gray)-[0-9]+\{[^}]*\}' <built.css> | grep -v 'var(--c-' | wc -l
0
$ grep -ohE 'rgb\(var\(--c-(zinc|slate|gray)-[0-9]+,[^)]*\)' <built.css> | head -3
rgb(var(--c-gray-200, 229 231 235)   rgb(var(--c-gray-400, 156 163 175)   rgb(var(--c-zinc-800, 39 39 42)
```
So zero palette usages bypass the theme system — the objective of G1, achieved by mechanism rather than by deletion.

## G2 — Build clean
`npx tsc --noEmit` → exit 0 (no output). `npm run build` → exit 0, full route table, Korean-test gate PASS. (Verified after each batch.)

## G3 — FOUC intact
```
$ curl -s http://localhost:3000/login | grep '<html'
<html lang="en" class="dark" data-theme="bliss" style="color-scheme:light">
```
`data-theme` present in initial SSR HTML — OB-201's mechanism unbroken. (Currently `bliss` because the operator toggled it to view the reskin; the reader's quote-normalize handles the settings-PATCH double-encoding `"\"bliss\""` → `bliss`.)

## G4 — CLT closures
- **CLT51A-F2 (font/contrast):** under bliss, the palette remap turns dark surfaces light and light text → ink (`*-50/100→ink`, `*-400/500→muted #666080`), restoring dark-on-light contrast across every semantic surface. Files: `web/tailwind.config.ts`, `web/src/app/globals.css`.
- **CLT51A-F21 (sidebar rail):** `ChromeSidebar.tsx` (`web/src/components/navigation/ChromeSidebar.tsx`) reskins via batch 1 — its `bg-zinc-800`/`text-zinc-400/300/100` map to bliss light surface + ink/muted; the 4 `text-white` are the logo-on-gradient (correctly white) or overridden by the inline per-workspace accent. No edit needed.
- **CLT195-F03 (nondescript CTAs):** `web/src/components/calculate/PlanCard.tsx` — "Verify Results" + "View Intelligence" converted from `text-violet-400`/`text-indigo-400` text-links to pill CTAs (`rounded-full`, semantic `border-border`/`text-foreground` secondary + `bg-primary`/`text-primary-foreground` primary).

## G5 — Current-theme unchanged
At `data-theme="current"` the `--c-*` vars are **unset**, so every neutral utility resolves to its fallback = the exact original Tailwind hex (proven in compiled CSS, e.g. `bg-zinc-900 → rgb(var(--c-zinc-900, 24 24 27)/…)` = `rgb(24 24 27)` = zinc-900). Opacity modifiers preserved (`/<alpha-value>`). **Zero current regression** for the palette remap. The ONLY intentional current change is the CLT195-F03 CTAs (the authorized fix — nondescript links were a defect in `current` too). Screenshots = architect SR-44.

## G6 — HALT-1 / residual log (deferred, follow-on at architect disposition)
None required inventing a new token, so no hard HALT-1 fired. Deferred sub-optimal-under-bliss cases (all byte-safe at `current`):
1. **Light-context palette uses (minority):** `bg-slate-100` (18×), `bg-gray-100` (18×), `text-slate-900` (23×), `text-slate-700` (30×), `from-slate-50`/`to-slate-100` gradients (~36×) are used as *light fills / dark text on light elements* in the dark app. The scale inversion flips these the "wrong" way under bliss (light fill → dark). Minority; targeted semantic-token conversion is follow-on.
2. **`text-white` body text (109):** dual-use (body text vs button label on colored bg) — cannot be globally remapped without breaking button labels. Body uses on now-light bliss surfaces are low-contrast; per-occurrence conversion is follow-on.
3. **Inline hex (1211 across 87 files):** predominantly the platform Observatory (VL-admin-only, inline-styled) — not Tailwind classes, so outside the palette remap. The Observatory is internal admin, not the tenant marketing-match surface; conversion is follow-on.
4. **white/black opacity (`bg-white/5`, `bg-black/50`, 128×):** subtle/decorative; left as-is.

## Commit table
| Batch | SHA | Files | What |
|---|---|---|---|
| 1 | `273a618c` | 2 | theme-aware slate/zinc/gray/navy palette (config + globals vars) |
| 2 | `db2dfd76` | 2 | CLT195-F03 pill CTAs (PlanCard) + §3 grid backdrop (globals) |
| report | (this) | 1 | HF-305 completion report |

## Confirmations
- **Zero new auth/RLS/session surface.** Presentation only; SR-39 does not fire.
- **No new components, no new routes, no data surfaces.** Palette mechanism + 2 CTA restyles + backdrop.
- **No layout/structure changes.** Only color/font/radius/shadow values; spacing/flex/grid untouched.
- **No schema/migration/DB work.**
- **Marketing routes untouched** (separate Vercel project; not in this repo).

---

*HF-305 · Full visual remediation · 2026-06-18 · vialuce.ai · presentation-layer, no IAP claimed. Bulk reskin via theme-aware palette; light-context/inline-hex/text-white tail logged as G6 follow-on.*
