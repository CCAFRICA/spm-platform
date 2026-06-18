# THEME ARCHITECTURE DECISION — OB-201

**Date:** 2026-06-18 · **OB:** OB-201 (App UI Theme System — "Bliss" re-skin + global revert toggle)
**Status:** ACCEPTED (Option A) · presentation-layer capability, no IAP claimed.

## Problem
Add a reversible global app-UI theme ("bliss") without forking the component tree, with a single
DB-backed global toggle and zero structural-regression risk on revert.

## Decisive context (from the live codebase, not assumption)
The authenticated app **already has a CSS-variable design system**: shadcn-style HSL tokens in
`web/src/app/globals.css` (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`,
`--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--radius`),
consumed by `web/tailwind.config.ts` via `hsl(var(--token))`. The root layout
(`web/src/app/layout.tsx`) is a **server component** that already `await`s server auth state — so a
server-side theme read is available with no new hydration path. This is the seam: overriding those
tokens under a `[data-theme]` attribute re-skins every component that uses the semantic Tailwind
utilities (`bg-primary`, `text-foreground`, `border-border`, …) with no component edits.

| Criterion | Option A — CSS-variable token swap under `[data-theme]` | Option B — Parallel component layer behind a feature flag |
|---|---|---|
| Scale 10× | **PASS** — one token sheet per theme; adding a theme = one CSS block | FAIL — every new theme multiplies the component surface |
| AI-first / no hardcoding | **PASS** — tokens are structural (`--primary`), Korean-Test-safe | WEAK — forked components re-introduce literals per branch |
| Transport | n/a | n/a |
| Atomicity / clean revert | **PASS** — revert = one `platform_settings` row; zero structural risk | FAIL — revert leaves dead forked code; every fix done twice |
| Regression risk | **LOW** — `current` token values = today's exact values ⇒ pixel-identical | HIGH — two code paths drift |

## CHOSEN: Option A
A single component tree with two token sets swapped by a `[data-theme]` attribute on `<html>`, read
server-side from `platform_settings.active_ui_theme`. Revert is one row change; the `current` token set
is defined to exactly equal today's values, so a default deploy is visually inert.

## REJECTED: Option B
A parallel component layer is a permanent maintenance fork — every subsequent fix must be applied twice,
and a revert leaves dead code behind. It violates "one tree, two token sets" and carries high drift risk
for zero benefit over Option A on a codebase that already has the CSS-variable seam.

## How the swap works (implementation note)
- `:root` / `.dark` / `[data-theme="current"]` carry today's exact token values (unchanged).
- `html[data-theme="bliss"]` overrides the SAME shadcn tokens with bliss-palette HSL values (indigo
  `#2D2F8F` → `--primary`, gold `#E8A838` → `--accent`, offwhite/ink backgrounds, bliss `--border`),
  plus the bliss brand tokens (`--color-indigo`, `--color-gold`, …), fonts (Urbanist/Inter/DM Mono),
  spacing/radius/shadow tokens, keyframes, and signature primitives (pill CTAs, diamond backdrop,
  mono eyebrows, gold dots, hairlines). `html[data-theme="bliss"]` (specificity 0,1,1) wins over the
  hardcoded `.dark` class (0,1,0).
- The body shell bg/fg move to `--app-bg`/`--app-fg` tokens (current = today's exact `#0a0e1a`/`#e2e8f0`)
  so the page background re-skins under bliss while staying pixel-identical at `current`.
- **Coverage bound (§6A residual):** the swap re-skins components using the semantic token utilities.
  Components that hardcode literal Tailwind palette classes (`bg-slate-900`, `navy-*`) or inline hex do
  NOT auto-re-skin and are logged as follow-on residuals — not a structural risk, just incomplete brand
  coverage, surfaced during Phase 3 visual verification.
