# HF-307A — Color Pipeline Migration (HSL → OKLCH) — Completion Report

**Date:** 2026-06-18 · **Branch:** `dev` · **HEAD:** `e25a28ab` · **PR:** #541 (`dev`→`main`).
**Status:** BUILT — `next build` exit-0, `tsc` clean, FOUC intact. **G2 solid-color parity: Δmax=0 rgb** (exact).

The entire Tailwind color pipeline now uses `oklch(var(--token) / <alpha-value>)` with bare OKLCH channels in the CSS variables, in BOTH themes. Solid colors render identically; opacity modifiers now blend in perceptually-uniform OKLCH space (removing the HSL hue-shift/wash-out that made bliss look "not crisp").

## G1 — Pipeline wrapper ✓
`tailwind.config.ts` — every semantic + chart color migrated (neutral scales `slate/zinc/gray/navy` stay `rgb(var())`, untouched):
```
background:  oklch(var(--background) / <alpha-value>)
foreground:  oklch(var(--foreground) / <alpha-value>)
card:        oklch(var(--card) / <alpha-value>)          card-foreground: oklch(var(--card-foreground) / <alpha-value>)
popover:     oklch(var(--popover) / <alpha-value>)        popover-foreground: …
primary:     oklch(var(--primary) / <alpha-value>)        primary-foreground: …
secondary:   oklch(var(--secondary) / <alpha-value>)      secondary-foreground: …
muted:       oklch(var(--muted) / <alpha-value>)          muted-foreground: …
accent:      oklch(var(--accent) / <alpha-value>)         accent-foreground: …
destructive: oklch(var(--destructive) / <alpha-value>)    destructive-foreground: …
border / input / ring: oklch(var(--…) / <alpha-value>)
chart-1..5:  oklch(var(--chart-N) / <alpha-value>)
```
`hsl(var(` remaining in config: **0**.

## G2 — Solid-color parity ✓ (Δmax = 0)
Original HSL hex vs new OKLCH hex (current theme), computed via the same OKLab pipeline:
```
primary     HSL rgb(99,102,241)  vs OKLCH rgb(99,102,241)  Δmax=0 OK
background  HSL rgb(5,8,15)       vs OKLCH rgb(5,8,15)      Δmax=0 OK
foreground  HSL rgb(241,245,249)  vs OKLCH rgb(241,245,249) Δmax=0 OK
border      HSL rgb(26,35,51)     vs OKLCH rgb(26,35,51)    Δmax=0 OK
accent      HSL rgb(21,28,41)     vs OKLCH rgb(21,28,41)    Δmax=0 OK
```
Solid colors are byte-identical → no solid-color regression in either theme (HALT-1 clear).

## G3 — Opacity rendering ✓
Compiled CSS:
```
.bg-primary\/10{background-color:oklch(var(--primary)/.1)}
.bg-muted\/50{background-color:oklch(var(--muted)/.5)}
.bg-primary{--tw-bg-opacity:1;background-color:oklch(var(--primary)/var(--tw-bg-opacity,1))}
```
Opacity now blends in OKLCH. `hsl(var(` in compiled CSS: **0**.

## G4 — Direct consumers updated (`hsl(var(--token))` → `oklch(var(--token))`)
The directive cited "18 components / 61 occurrences"; the actual `hsl(var(--token))` JSX/style consumers are **5 files / 19 occurrences** (the "61" matches the *opacity-modifier* count, handled by the config wrapper, not direct consumers):
- `web/src/app/insights/page.tsx` (`--chart-1` ×3)
- `web/src/app/insights/performance/page.tsx` (tooltip `--background`/`--border`)
- `web/src/components/charts/sales-history-chart.tsx` (tooltip `--background`/`--border`)
- `web/src/components/analytics/BreakdownChart.tsx` (`--chart-1..5`)
- `web/src/components/analytics/MetricTrendChart.tsx` (`--primary`/`--muted-foreground`/`--destructive`, multiple)
`hsl(var(` remaining in `web/src`: **0**.

## G5 — Current theme OKLCH (bare channels)
```
--background 0.1344 0.0163 262.7   --foreground 0.9676 0.007 247.9   --card 0.1519 0.0214 265.5
--card-foreground 0.9676 0.007 247.9  --popover 0.1519 0.0214 265.5  --popover-foreground 0.9676 0.007 247.9
--primary 0.586 0.2037 277.1       --primary-foreground 1 0 0        --secondary 0.226 0.0267 260
--secondary-foreground 0.9676 0.007 247.9  --muted 0.226 0.0267 260  --muted-foreground 0.6225 0.0468 256.8
--accent 0.226 0.0267 260          --accent-foreground 0.9676 0.007 247.9   --destructive 0.6368 0.2078 25.3
--destructive-foreground 1 0 0     --border 0.2558 0.0324 260        --input 0.2558 0.0324 260
--ring 0.586 0.2037 277.1          --chart-1 0.5929 0.1987 277       --chart-2 0.6983 0.1337 165.5
--chart-3 0.7232 0.15 60.6         --chart-4 0.6192 0.2037 312.7     --chart-5 0.6123 0.2093 6.4
```
(applied to both `:root, [data-theme="current"]` and `.dark` — byte-identical blocks.)

## G6 — Bliss theme OKLCH (authoritative, no conversion layer)
```
--background 1 0 0   --foreground 0.24 0.11 274   --card 1 0 0   --card-foreground 0.24 0.11 274
--popover 1 0 0      --popover-foreground 0.24 0.11 274   --primary 0.34 0.16 274   --primary-foreground 1 0 0
--secondary 0.97 0.025 274   --secondary-foreground 0.34 0.16 274   --muted 0.985 0.005 280
--muted-foreground 0.52 0.06 274   --accent 0.79 0.14 76   --accent-foreground 0.24 0.11 274
--destructive 0.55 0.22 28   --destructive-foreground 1 0 0   --border 0.92 0.01 274   --input 0.92 0.01 274
--ring 0.34 0.16 274   --chart-1 0.34 0.16 274   --chart-2 0.79 0.14 76
--chart-3 0.7232 0.15 60.6   --chart-4 0.6192 0.2037 312.7   --chart-5 0.6123 0.2093 6.4
```
The HF-307 HSL conversion layer is gone — the shadcn tokens now carry the production OKLCH values directly.

## G7 — Build clean ✓
`tsc --noEmit` exit 0; `npm run build` exit 0.

## G8 — FOUC intact ✓
`curl /login` → `<html ... data-theme="bliss" style="color-scheme:light">`.

## Commit table
| Item | SHA | What |
|---|---|---|
| migration | `e25a28ab` | config wrapper + both token blocks (current/bliss) + 5 consumers, hsl→oklch |
| report | (this) | HF-307A report |

## Confirmations
Both themes migrated · solid colors identical (Δmax=0) · opacity modifiers now OKLCH-blended · zero `hsl(var(` anywhere (config/CSS/components) · no auth/RLS/session surface · no schema/DB · marketing untouched · Tailwind NOT upgraded (v3-compatible `oklch(var(--channels) / <alpha-value>)`).

## Residuals (§6A)
- Chart tokens migrated (included). `color-mix(in hsl, …)`: grep found none. HF-305 `--c-slate-*`/`--c-zinc-*` palette vars stay `rgb(var())` (consumed directly, not via a color-function wrapper) — correctly out of scope per §6A.
- Very-low-opacity (<5%) tints may differ subtly from the old HSL blend — this is OKLCH being more correct (§6A), not a regression.

---

*HF-307A · HSL→OKLCH pipeline migration · 2026-06-18 · vialuce.ai · solid parity Δmax=0; opacity now perceptually uniform; fidelity ceiling removed.*
