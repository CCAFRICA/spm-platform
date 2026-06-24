# HF-340 — Vialuce Theme: Font Scheme + Logo Parity with Bliss — COMPLETION REPORT

**Branch:** `hf-340-vialuce-font-logo-parity` · **Base:** `main` · **Pre-change SHA:** _(set at Tier-0 commit)_ · **Date:** 2026-06-24
**Channel:** SR-44 — architect browser-verifies + merges; CC does NOT merge. **Experience-only** (no engine/SQL/auth/RLS/session/schema — SR-39 does not fire).

---

## 1. ADR — Architecture Decision Gate (recorded BEFORE code, per §3)

**Decision:** Achieve Vialuce↔Bliss parity on fonts (Urbanist headings / Inter body / DM Mono labels) by aligning the **Vialuce-scoped** font token *values* to Bliss's, plus the one heading-application rule Bliss already has; and on logo by rendering the **same diamond mark** in the Vialuce rail, themed to Vialuce's own indigo/gold tokens. No new layer, no `!important`, no per-component override, no new/duplicate component file.

**Exact edits and their constraint-envelope placement:**

| # | File:loc | Edit | Envelope |
|---|---|---|---|
| 1 | `globals.css:612` (`--vl-font-sans`) | `var(--font-dm-sans),'DM Sans',…` → `"Inter", system-ui, sans-serif` | Vialuce-scoped token value (body font). Mirrors Bliss `--font-sans`. |
| 2 | `globals.css:615` (`--font-display`) | `var(--font-dm-sans),…` → `"Urbanist", system-ui, sans-serif` | Vialuce-scoped token value (heading/display). Mirrors Bliss `--font-display`. |
| 3 | `globals.css:615` (`--font-body`) | `var(--font-dm-sans),…` → `var(--font-sans)` (= Inter) | Vialuce-scoped. Mirrors Bliss `--font-body: var(--font-sans)`. |
| 4 | `globals.css:616` (`--font-sans`) | `var(--font-dm-sans),…` → `"Inter", system-ui, sans-serif` | Vialuce-scoped token value (tailwind `font-sans`). Mirrors Bliss. |
| 5 | `globals.css` (new rule, after the Vialuce `body` rule) | add `html[data-theme="vialuce"] h1,h2,h3,h4,h5,h6 { font-family: var(--font-display); }` | The identical heading application Bliss already carries (`globals.css:314-320`). Element-level, theme-scoped, reads the token — NOT a per-component override / not `!important` / not a parallel system. Required because raw headings otherwise inherit the body font. |
| 6 | `VialuceSidebar.tsx:127` | replace `<DollarSign className="h-4 w-4" />` with the diamond SVG (geometry byte-identical to `ChromeSidebar.tsx:279-283`), `stroke/fill` → `var(--vialuce-indigo)` / `var(--vialuce-gold)`; remove now-unused `DollarSign` from the import (`:26`) | Logo surface only. Existing file — **no new file** (G3). Bliss diamond branch in ChromeSidebar **untouched** (G4). |

**Unchanged (parity already holds / out of envelope):** `--vl-font-mono` (`:613`) and `--font-mono` (`:616`) already resolve to **DM Mono** = Bliss's `--font-mono`; left untouched. All Vialuce color/palette/spacing/layout/component tokens untouched.

**Logo reuse rationale (constraint resolution):** the diamond is **inline SVG** in `ChromeSidebar.tsx` (no shared asset file exists; verified). Extraction to a shared component is precluded by **G3** (`git diff --stat` must show no new component file) *and* **G4** (extracting would edit the Bliss logo branch). Inlining the identical mark in the existing `VialuceSidebar.tsx` (no new file, ChromeSidebar untouched) is therefore the only path satisfying §3 + G3 + G4. The mark geometry is byte-identical; only the two color refs are themed to Vialuce's own tokens (§1 "Vialuce's own color intact"). The diamond's `--color-indigo`/`--color-gold` are **Bliss-scoped and undefined under Vialuce** (verified: defined only inside `html[data-theme="bliss"]` at `:204-219`; every usage Bliss-scoped), so they cannot be referenced as-is under Vialuce.

**Constraint envelope confirmation:** every edit sits inside `[data-theme="vialuce"]` (CSS) or the Vialuce-only rail component. Zero edits to `[data-theme="bliss"]`/`[data-theme="dark"]`/`[data-theme="current"]` tokens or the Bliss logo branch. No `!important`, no per-component font override, no parallel font system, no new/duplicate component file. Experience-only.

---

## 2. G0 — Current-state diagnostic

### Font tokens — `[data-theme="bliss"]` (reference of record), `globals.css:229-232`
```css
--font-display: "Urbanist", system-ui, sans-serif;
--font-sans: "Inter", system-ui, sans-serif;
--font-body: var(--font-sans);
--font-mono: "DM Mono", ui-monospace, monospace;
```
Applied (Bliss): `body → var(--font-body)` (`:310`); `h1..h6 → var(--font-display)` (`:314-320`); `.uppercase.tracking-wide(r)`, `.bliss-eyebrow`, `[data-nav-section] → var(--font-mono)` (`:338-340,380,445`).

### Font tokens — `[data-theme="vialuce"]`, `globals.css:612-616`
```css
--vl-font-sans:var(--font-dm-sans),'DM Sans',system-ui,-apple-system,sans-serif;   /* body */
--vl-font-mono:var(--font-dm-mono),'DM Mono',ui-monospace,monospace;                /* labels */
--font-display:var(--font-dm-sans),system-ui,sans-serif; --font-body:var(--font-dm-sans),system-ui,sans-serif;
--font-sans:var(--font-dm-sans),system-ui,sans-serif; --font-mono:var(--font-dm-mono),monospace;
```
Applied (Vialuce): `body → var(--vl-font-sans)` (`:620`); labels `.vl-mono/.sb-lbl/.sb-sec .meta → var(--vl-font-mono)`. **No `h1..h6` rule** → headings inherit the body font.

### Nav logo conditional (which asset renders per theme today)
- **Bliss** (`ChromeSidebar.tsx:277-283`): inline diamond SVG — `<rect rotate(45)…stroke=var(--color-indigo)/>`, inner `rect fill=var(--color-indigo)`, `circle fill=var(--color-gold)`. Gated `isBliss ?`.
- **Dark/current** (`ChromeSidebar.tsx:285-287`): `V` glyph in a gradient box.
- **Vialuce** (`VialuceSidebar.tsx:127`, rendered because `ChromeSidebar.tsx:236` early-returns `<VialuceSidebar/>` under vialuce): `<div className="sb-logo"><DollarSign/></div>` — a dollar-sign glyph in a gradient box.

### App-wide font load (`globals.css:4`) — proves Urbanist/Inter/DM Mono are loaded on every theme's path
```css
@import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;700&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
```
Global (not Bliss-scoped) → already covers the Vialuce render path. `layout.tsx:2,20-27` additionally loads `DM_Sans`/`DM_Mono` via `next/font`. **No new font load needed.**

### Deltas (one line each)
- **Vialuce body fonts now vs Bliss:** DM Sans → must be **Inter**.
- **Vialuce heading fonts now vs Bliss:** DM Sans (inherited; no rule) → must be **Urbanist**.
- **Vialuce mono/label fonts now vs Bliss:** DM Mono → **DM Mono** (already parity; no change).
- **Vialuce logo now vs Bliss diamond:** dollar-sign-in-box → must be the **diamond mark**.

**§4A HALT check:** No-delta — false (clear deltas above). Constraint-collision — false (`--vl-font-*`/`--font-*` are Vialuce-scoped; `--color-indigo/gold` Bliss-scoped & unused under Vialuce). Scope-collision — false (CSS + one TSX logo swap). Missing-reference — false (Bliss diamond `ChromeSidebar.tsx:279`; Bliss font tokens `globals.css:229-232`). **No HALT.**

---

## 3. G1-G6 evidence — *filled after implementation*
## 4. Commit table (SHAs) — *filled at close*
## 5. Anti-Pattern Registry confirmation — *filled at close*
