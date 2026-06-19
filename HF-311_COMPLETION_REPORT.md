# HF-311 — Theme System Cleanup: Completion Report

**Branch:** `hf-311-theme-cleanup` · base `main` · **no merge (SR-44 — architect merges + browser-recalcs)**
**Discipline:** byte-safe `--strag-*` var indirection (HALT-1 zero current regression by construction); Observatory convert-not-redesign (HALT-2 untriggered); Korean Test semantic tokens; commit + push per batch, build green per batch.

## Three-category summary

| Category | Items | Outcome |
|---|---|---|
| **A — Code remediated** | 3, 5, 6, 7, 8 | Observatory 268 hex→var; 1 straggler fixed in-band, 2 classified no-change; shadcn scrim overridden; card radius 10px |
| **B — Verified & closed** | 4, 9 | Opacity decoratives + OKLCH intermediates: both acceptable, zero fixes needed |
| **C — Documented dispositions** | 10, 11, 13 | Settings/Profile, marketing keyframes, OB-numbering — no code (statements below) |

Item 12 (cookie-on-logout) is explicitly out of scope (§6B).

Commits:

| Commit | Item(s) | Summary |
|---|---|---|
| `85a93e46` | — | Architecture Decision Record (byte-safe var conversion) |
| `19ae25dd` | 3, 7 | Observatory inline-hex conversion + shadcn modal scrim |
| `8e4df04f` | 8 | Bliss card radius 10px |

---

## G1 — Observatory (Item 3)

```
BEFORE: 402 inline hex (10 platform/*.tsx files)
AFTER:  134 inline hex   →  268 converted to var(--strag-*)
```
**Scope (per directive — backgrounds + neutral primary text):** converted the slate/zinc surface darks + neutral text-light scale + the established `--strag-violet` action color. Added 11 byte-safe neutral-scale vars (`--strag-s0..s7`, `z5`, `z6`, `disabled`) whose `[data-theme="current"]` value = the EXACT original hex (computed style byte-identical) and `[data-theme="bliss"]` value mirrors the HF-307 scale mapping (slate-50→ink … slate-400→muted … slate-700→border).

**Left by design (134, not "resisted"):** status accents (emerald/amber/red/blue), brand indigo/violet variants, pure white, `#374151`, dark-red bg `#2a1115` — these are decorative accents, not backgrounds or primary text, and remain legible on white. **HALT-2 untriggered:** no layout/structure changed; only `color`/`background`/`border`/`fill`/gradient values.

**No files resisted clean conversion.** One in-band fix: `ModelConfigTab.tsx:141` disabled-save button had unconditional `color:'#fff'` over a bg that lightened under bliss → routed the disabled fill through `--strag-disabled` (current `#334155`, bliss ink-3) so the white label stays legible. Current byte-identical (`--strag-disabled` current = `--strag-s7` current = `#334155`).

## G2 — Stragglers closed (Items 5, 6)

- **Item 5** — `web/src/app/test-ds/page.tsx:50,67`, `text-white` on persona gradients (`from-slate-950 via-indigo-950 to-slate-950`). **Disposition: dev-only, no change.** `/test-ds` has zero references/nav links (standalone design-system showcase); the dark persona gradients are the page's subject matter. Directive Item-5 option (c).
- **Item 6** — `web/src/app/login/page.tsx:178`, `text-white` on `backgroundColor:'#2D2F8F'`. **Disposition: keep `text-white`.** `#2D2F8F` is a FIXED dark indigo (raw inline hex, not theme-aware) → white is legible in both themes. Directive Item-6 "fixed brand color → keep text-white." Adding `bliss:text-foreground` would invert white→ink on the dark button (invisible), so it must NOT be changed.

## G3 — shadcn audit (Item 7)

29/32 primitives are token-based (`bg-popover`, `text-foreground`, `border-border`, …) and adapt automatically because the tokens flip under `[data-theme="bliss"]` (and the slate/zinc Tailwind scales remap via `--c-*`).

| Disposition | Count | Primitives |
|---|---|---|
| **Correct as-is** (token-based) | 29 | accordion, alert, avatar, badge, button*, calendar, card*, chart, checkbox, collapsible, command, dropdown-menu, empty-state*, form, input, label, loading-button*, popover, progress, radio-group, scroll-area, select, separator, skeleton-loaders*, slider, switch, table, tabs, textarea, tooltip |
| **Overridden** | 2 | `dialog`, `alert-dialog` — stock `bg-black/80` Radix overlay scrim |
| **Deferred** | 1 | `currency-display` — `text-green-500`/`text-red-500` trend arrows (semantic status, legible on white) |

`* = app-customized file (editable directly); the rest are stock installs (override via scoped CSS).`
**Override applied** (`globals.css`, stock files not edited): a pure-black 80% modal scrim clashes with the light bliss surface →
```css
html[data-theme="bliss"] .bg-black\/80.fixed.inset-0 { background-color: oklch(0.24 0.11 274 / 0.45); }
```
(`bg-black/80` is overlay-only across the app — verified, so the class selector is scrim-specific.)

## G4 — Polish applied (Item 8)

| Component | Property | Old (bliss) | New (bliss) |
|---|---|---|---|
| `.vl-card` (shadcn Card, 111 files) | border-radius | `var(--radius-lg)` = 4px | **10px** (marketing card radius) |

Cards are softer than the 4px line-precision `--radius` (inputs/buttons) per the marketing language. Current cards keep `rounded-2xl` (override is bliss-scoped). **Already in place** (HF-306/307, verified present): pill CTAs (`button[data-variant] → radius-full`), warm shadows (`--shadow-card` on `.vl-card`), spacing scale (`--sp-*`). Finer per-surface spacing comparison against the marketing reference is a browser-visual task (layouts differ; directive: "obvious gaps only, not pixel-perfect") — deferred to architect visual review.

## G5 — Verify-and-close (Items 4, 9)

- **Item 4 — opacity decoratives: ACCEPTABLE, zero fixes.** Named utilities total 6 (`bg-white/5` ×3, `bg-black/50` ×3); broader white/black-opacity family ~15. Every `bg-black/N` is overlay-positioned (`fixed/absolute inset-0`, z-index) — i.e. modal scrims/dimmers, where dark-on-light is intended (the `/80` dialog scrims are softened by Item 7; `/30` navbar handled in HF-308). No `bg-black/N` is a non-scrim decorative → no dark-smudge risk. `bg-white/5` and `border-white/N` become subtle no-ops on light (not broken). *(The directive's "128" reflects a broader prior opacity inventory incl. colored `bg-{color}/10` status tints, which read fine on white.)*
- **Item 9 — interpolated OKLCH intermediates: CORRECT, no adjustment.** `ink-2` (L0.32 C0.09), `ink-3` (L0.40 C0.07), `muted-2` (L0.62 C0.045) sit on a monotonic smooth ramp between the authoritative endpoints `ink` (L0.24 C0.11) and `muted` (L0.52 C0.06) — lightness increases evenly, chroma decreases evenly, hue constant at 274. No discontinuity.

## G6 — Dispositions documented (Items 10, 11, 13)

- **Item 10 (Settings + My Profile):** separate OB scope. The theme toggle lives in the user-menu dropdown (HF-310) and does not depend on these pages. HF-310 removed the dead "Settings"/"My Profile" links because they navigated to redirect stubs (`/configure`, `/configuration`) with no pages behind them — non-functional before the theme work; their removal was correct. Not built here.
- **Item 11 (`iap-*`/`vl-*` marketing keyframes):** marketing-site animations, not app-UI. The keyframe names appeared in the HF-307 source material but the implementation code was not provided; CC correctly omitted them rather than fabricating. The app UI uses no animated agent icons, hero underlines, marquee scrolls, or orbital effects. Not added.
- **Item 13 (OB sequence numbering):** the OB-201 label is a session-local numbering artifact; the actual OB sequence had advanced (next OB number at the time = OB-216). The work shipped and merged correctly as **PR #541**. CC's completion report and ADR reference OB-201 — historical artifacts, no correction needed. No governance action.

## G7 — Build clean

`npx tsc --noEmit` exit 0 · `npm run build` exit 0 (rebuilt from clean `.next`). No malformed `var()`; 268 `var(--strag-*)` references resolve.

## G8 — Current unchanged

All changes are either (a) `[data-theme="bliss"]`-scoped CSS (scrim, card radius, bliss var block) or (b) byte-safe `var(--strag-*)` indirection whose `[data-theme="current"]` value equals the exact original hex. The new `current`-block var definitions only ADD vars (no existing token altered). `--strag-disabled` current = `#334155` = the prior `--strag-s7` value at that site. Therefore `data-theme="current"` computed styles are byte-identical to pre-HF — zero regression by construction (ADR §G2).

---

## Net-new findings (§6C residuals)

- **rgba() darks (not hex):** a few Observatory decoratives use `rgba(39,39,42,0.8)`-style dark fills (e.g. OnboardingTab future-step dots) — outside the inline-HEX scope of Item 3; they remain dark on white under bliss (minor, low-traffic). A follow-up rgba→var pass could close these.
- **Status accents on white:** light status colors (emerald-400 `#34d399`, amber-400) used as text read slightly low-contrast on white — left per Item-3 scope (decorative, not primary text); candidates for a future contrast-tuning pass if desired.

*HF-311 · 2026-06-18 · vialuce.ai*
