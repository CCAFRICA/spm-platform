# HF-307 — Bliss Design Correction (authoritative OKLCH tokens + design vocabulary) — Completion Report

**Date:** 2026-06-18 · **Branch:** `dev` · **HEAD:** `732fc2af` · **PR:** #541 (`dev`→`main`, OB-201 + HF-305/306/307).
**Status:** BUILT — `next build` exit-0, `tsc` clean, FOUC intact. Screenshot gates = architect SR-44.

## Strategy / key decision (the v3 translation — §6A)
The authoritative `styles.css` is Tailwind v4 (`@theme inline`) with OKLCH. The app is **Tailwind v3**, and the shadcn tokens are consumed via `hsl(var(--token))` in `tailwind.config.ts` **and by 18 chart/tooltip components** that read `hsl(var(--token))` directly, with heavy opacity-modifier use (`bg-muted/50` ×37, `bg-primary/10` ×24). Unwrapping the pipeline to `var(--token)` would turn those into `hsl(hsl(...))` → broken in **both** themes = HALT-1 regression. So I kept the v3 `hsl()` pipeline and split by consumer:
- **Brand tokens + design vocabulary → raw OKLCH, used directly** (§4.2 honored where it's safe): `--ink/--indigo/--gold/--gold-deep/--gold-soft/--indigo-soft/--offwhite/--muted2`, `--app-bg`, `--card-surface`, and every vocabulary class (`.eyebrow`, `.hairline`, `.tint-*`, `.shimmer`, `.underline-wipe`, `.lift`).
- **13 shadcn pipeline tokens → authoritative OKLCH accurately CONVERTED to HSL** (via an OKLab→sRGB→HSL computation, not hex, not eyeballed) so the v3 pipeline + 18 consumers + opacity all keep working.
- **Only the bliss block + bliss-conditional component code changed.** `:root`/`.dark`/`[data-theme="current"]`/`tailwind.config` are untouched ⇒ **HALT-1 satisfied by construction.**

## G1 — Token correction ✓
Bliss shadcn tokens (HSL ← authoritative OKLCH): `--background 0 0% 100%` (white), `--foreground 239.5 62.5% 19.7%` (ink `oklch(0.24 0.11 274)`), `--primary 240.2 57.9% 33.8%` (indigo `oklch(0.34 0.16 274)`), `--secondary 221.1 100% 97%` (indigo-soft), `--muted 232.7 58.7% 98.6%` (offwhite), `--muted-foreground 228.6 19.7% 45.8%` (`oklch(0.52 0.06 274)`), `--accent 37.2 82.9% 59.8%` (gold), `--border/--input 227.2 19% 90.5%` (`oklch(0.92 0.01 274)`), `--destructive 358.1 88% 44.2%`, `--radius 0.25rem`. Brand tokens carry raw OKLCH + `--muted2 oklch(0.86 0.012 274)`. Compiled-CSS proof: `oklch(0.34 0.16 274)` and `--foreground:239.5 62.5% 19.7%` both present.

## G2 — Font rendering ✓ (code evidence)
`--font-display:"Urbanist"`, `--font-sans:"Inter"` (added — authoritative name), `--font-mono:"DM Mono"`; `--font-body` aliases `--font-sans`. `html[data-theme=bliss] h1..h6{font-family:var(--font-display)}`, `body{font-family:var(--font-body)}` (HF-306). Architect: confirm computed font-family in-browser.

## G3 — Eyebrow labels ✓ (corrected)
`html[data-theme=bliss] .uppercase.tracking-wider{ font-family:var(--font-mono); letter-spacing:0.18em; color:var(--color-indigo) }` — color corrected gold-deep→**indigo**, tracking 0.22→0.18em (§3: eyebrow base is indigo; gold is `.eyebrow-gold`). Plus the explicit `.eyebrow`/`.eyebrow-gold`/`.eyebrow-muted` utilities.

## G4 — Diamond logo ✓
`ChromeSidebar.tsx` renders the §3.3 diamond SVG under bliss (via `isBliss`); `current` keeps the gradient "V":
```jsx
{isBliss ? (
  <svg width="32" height="32" viewBox="0 0 40 40" fill="none" className="shrink-0">
    <rect x="11" y="11" width="18" height="18" rx="1" transform="rotate(45 20 20)" stroke="var(--color-indigo)" strokeWidth="1.25" />
    <rect x="15.5" y="15.5" width="9" height="9" rx="0.5" transform="rotate(45 20 20)" fill="var(--color-indigo)" />
    <circle cx="20" cy="20" r="1.6" fill="var(--color-gold)" />
  </svg>
) : ( <div className="…bg-gradient-to-br …"><span className="text-white">V</span></div> )}
```

## G5 — All pages walked (honest grep-based inventory; browser SR is architect's)
The bulk of every page reskins via the HF-305 theme-aware palette + the HF-307 token correction (anything using `bg-*/text-*/border-{slate,zinc,gray}` or the shadcn semantic utilities). The remaining **non-theme-aware dark surfaces** (inline hex / dark gradient utilities the palette can't reach) by page:
- **In-scope, remaining:** `upgrade` (4), `insights` (3), `acceleration` (2), `data` (1), root `page.tsx` (1). These are inline-hex/dark-gradient stragglers → follow-on (same class as HF-305 G6 inline-hex).
- **Out of scope (§6):** `login` (1), `signup` (3), `select-tenant`/Observatory (1) — HF-308 / Observatory-admin.
- **Component-level:** `ManagerDashboard.tsx` — only a gold/amber accent gradient (not a dark surface; left). `operate/reconciliation` — dark expanded-row remediated (see G6).

## G6 — Manager + Reconcile ✓
- **Reconcile** (`operate/reconciliation/page.tsx`): the dark expanded-row `style={{backgroundColor:'#0f172a'}}` → `className="…bg-slate-900"` (theme-aware via HF-305; byte-identical at current since slate-900=#0f172a, light under bliss). Rest of the page reskins via the palette.
- **Manager** (`ManagerDashboard.tsx`): no dark surface — its one inline gradient is gold/amber (an accent), left as-is. Surfaces reskin via the palette.
- Remaining straggler (logged): the reconcile "back" button inline `#7c3aed` (violet) — not a dark surface; would need an `isBliss` hook to go indigo; follow-on.

## G7 — Utility classes present ✓ (compiled-CSS proof)
`.eyebrow` (4 rules incl. variants), `.hairline`, `.lift`(+hover), `.tint-a/b/c/d`, `.shimmer`(+::after/:hover), `.underline-wipe`(+hover) — all defined `[data-theme="bliss"]`-scoped, OKLCH verbatim. **Note:** the `iap-*`/`vl-*` keyframes named in §3 were NOT in the provided source text (only their names were listed) and are §6-out-of-scope marketing-icon animations → omitted (not fabricated).

## G8 — Build clean ✓
`tsc --noEmit` exit 0; `npm run build` exit 0. (Honesty: batch 2 first introduced a build break — a `*/` inside the comment text `iap-*/vl-*` prematurely closed the CSS comment; caught immediately and fixed in `91d3e004` before proceeding.)

## G9 — Current unchanged ✓
Only the bliss block + bliss-conditional component code (`isBliss`, diamond, `.app-navbar`) changed. `current` pipeline (`:root`/`.dark`/config) is untouched → byte-for-byte identical. FOUC: `curl /login` → `data-theme` in SSR HTML.

## Commit table
| Batch | SHA | What |
|---|---|---|
| 1 | `cd250c54` | authoritative OKLCH tokens (shadcn→HSL, brand→OKLCH, roles, fonts, radius) |
| 2 | `0d124c9c`→`91d3e004` | design vocabulary + eyebrow→indigo (build-break fix folded in) |
| 3+4 | `732fc2af` | diamond logo + Reconcile dark surface |
| report | (this) | HF-307 report |

## Confirmations
Zero auth/RLS/session surface · no new features/routes/data · no schema/DB · marketing untouched · `current` unchanged · Tailwind NOT upgraded (v3 translation per §6A).

## Residuals
- In-scope dark-surface stragglers (G5): `upgrade`/`insights`/`acceleration`/`data`/root — inline-hex/dark-gradient, follow-on.
- `iap-*`/`vl-*` keyframes (not in provided source; §6 out of scope).
- Reconcile violet "back" button (`#7c3aed`).
- Neutral-scale `ink-2/ink-3/muted-2` intermediate steps use my interpolated OKLCH (authoritative source only specifies the endpoints) — visually consistent, refine if needed.
- HF-305 G6 tail (text-white dual-use, inline-hex Observatory) — separate color-layer items.

---

*HF-307 · Bliss design correction · 2026-06-18 · vialuce.ai · authoritative OKLCH applied within the v3 pipeline (zero current regression); vocabulary + diamond logo delivered; dark-surface stragglers inventoried.*
