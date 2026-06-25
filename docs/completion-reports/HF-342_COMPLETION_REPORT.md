# HF-342 — Vialuce Theme: Logo Lockup Correction + Residual Font Parity — COMPLETION REPORT

**Branch:** `hf-342-vialuce-logo-lockup-font-parity` · **Base:** `main` · **Date:** 2026-06-25
**Channel:** SR-44 — architect browser-verifies + merges; CC does NOT merge. **Experience-only** (no engine/SQL/auth/RLS/session/schema — SR-39 does not fire).
**Predecessor:** HF-340 (Vialuce font families + diamond-logo parity, PR #597). This HF closes the two quality residuals HF-340 left: the lockup geometry (undersized/misaligned mark) and a still-visible font difference (body **weight**, not family).

---

## 1. ADR — Architecture Decision Gate (recorded BEFORE code, per §3)

**Decision.** Two corrections, both inside the `[data-theme="vialuce"]` envelope:
1. **Logo lockup** — enlarge the diamond mark (reuse the existing inline-SVG asset; raise its rendered size) and tighten the lockup gap so mark + wordmark read as a deliberate, optically-aligned lockup. Bliss is the quality reference.
2. **Residual font parity** — HF-340 aligned font *families* (DM Sans → Inter/Urbanist/DM Mono) but left the Vialuce body **weight** at `300`. Bliss body is `400`. That weight delta is the persisting visible difference. Close it at the token layer (`--vl-fw-body: 300 → 400`) and remove the one wordmark `letter-spacing` override so the wordmark matches Bliss in font/weight/spacing.

**Exact edits and their constraint-envelope placement:**

| # | File:loc | Edit | Envelope |
|---|---|---|---|
| 1 | `globals.css:616` (`--vl-fw-body`) | `300` → `400` | Vialuce-scoped token (body weight). Mirrors Bliss body `400`. **Token-layer** (§3). |
| 2 | `globals.css:640` (`.sb-brand b`) | remove `letter-spacing:.3px` | Vialuce rail wordmark spacing → `normal` = Bliss `text-sm`. **Override-removal** (§3), not a font-family patch. |
| 3 | `globals.css:638` (`.sb-brand`) | `gap:11px` → `gap:10px` | Vialuce lockup spacing — optical alignment for the enlarged mark. Lockup-only. |
| 4 | `VialuceSidebar.tsx` (brand diamond `<svg>`) | `width/height="32"` → `"40"` | Enlarge the mark. **Reuse existing inline asset — no new file/component** (G3). |

**Envelope confirmation.** Every edit sits inside `html[data-theme="vialuce"]` (CSS) or the Vialuce-only rail (`mission-control/VialuceSidebar.tsx`). Zero edits to `[data-theme="bliss"]`/`[data-theme="dark"]`/`[data-theme="current"]` tokens, the Bliss logo branch, or `ChromeSidebar.tsx`. No `!important`, no per-component font-family patch, no parallel font system, no new/duplicate asset/component. Experience-only. Wordmark **size** (15.5px) is left as the lockup's own scale — G2 requires font/weight/**spacing** parity, not size parity.

---

## 2. G0 — Diagnostic (READ-ONLY; computed from the live cascade + font-load)

### Font load (the decisive fact)
`globals.css:4` (global, both themes): `@import …Urbanist:wght@300;400;700&Inter:wght@400;500;600&DM+Mono:wght@400;500…`. **Inter is fetched only at 400/500/600 — weight 300 is NOT loaded.** `layout.tsx:64` adds DM Sans/DM Mono (`next/font`) on `<body>`; `layout.tsx:59` sets `<html>` class `vialuce ? undefined : 'dark'`.

### Matched-set computed styles — `[data-theme="bliss"]` vs `[data-theme="vialuce"]`
| Element | Bliss | Vialuce (current) | Delta |
|---|---|---|---|
| **Wordmark "Vialuce"** (rail) | `Inter` / `700` / `letter-spacing: normal` (`ChromeSidebar.tsx:291` `text-sm font-bold`; body=Inter) | `Inter` (inherits body) / `700` (`--vl-fw-bold`) / `letter-spacing: 0.3px` (`globals.css:640` `.sb-brand b`) | **letter-spacing 0.3px vs 0** (family + weight already match) |
| **Page heading** (e.g. "Intelligence Stream") | `Urbanist` (`h1..h6 → --font-display`, `:314-320`) | `Urbanist` (HF-340 `h1..h6 → --font-display`, `:625-630`) — shared content markup, aligned tokens | none |
| **Body paragraph** | `Inter` / **`400`** (`body` sets no weight → UA default 400; `:298-303,309-311`) | `Inter` / **`300`** (`body { font-weight: var(--vl-fw-body) }` = 300; `:616,622`) | **font-weight 300 vs 400** ← the residual |
| **Section label / eyebrow** (rail) | `DM Mono` (`[data-nav-section]`/`.uppercase.tracking-wide`, `:338-340,444`) | `DM Mono` (`.sb-lbl`, `:647`) | none (rail) |

**Logo lockup markup + geometry:**
| | Bliss (`ChromeSidebar.tsx:278-296`) | Vialuce (`VialuceSidebar.tsx:127-131`, `.sb-brand` `:638-641`) |
|---|---|---|
| diamond render size | `width/height="32"` | `width/height="32"` |
| viewBox | `0 0 40 40` (mark = 18-unit square rotated 45° about centre → visible ≈ 64% of box ≈ **20px** at 32px, ~7px transparent pad/side) | identical geometry |
| container | `flex items-center h-14 gap-3 (12px) px-4` | `.sb-brand { display:flex; align-items:center; gap:11px; padding:18px 18px 16px }` |
| wordmark | 14px / 700 | 15.5px / 700 / 0.3px |

**Why the mark renders small/misaligned:** the asset's viewBox bakes in ~36% transparent padding (the 18-unit diamond sits in a 40-unit box), so a 32px render shows only a ~20px mark. Beside the larger 15.5px wordmark + two-line tenant block, that reads undersized and unplaced. Fix: render the SVG at **40px** (viewBox-native 1:1 → visible mark ≈ 25.5px, no fractional scale) and set `gap:10px` so the optical mark-to-wordmark gap (~10 + 7.3 pad ≈ 17px) matches Bliss's (~12 + 5.8 ≈ 18px).

**Why the font difference persists:** Vialuce body is `font-weight:300`; Inter 300 is not in the @import, so on a path where "Inter" resolves to a **locally-installed** Inter (designers' machines commonly have it), body text renders genuine **Inter Light** while Bliss (400) renders **Regular** — the visible difference. `--vl-fw-body:300→400` matches Bliss's loaded `400` and renders identically everywhere (where 300 already rounded to 400, the token now simply agrees with Bliss — no downside).

### §4A HALT checks
- **No font delta** — FALSE (body weight 300 vs 400; wordmark spacing 0.3px vs 0).
- **Font fails to load** — assessed FALSE: Urbanist/Inter/DM Mono load app-wide (`:4`) + DM Mono via `next/font`; this is a token **weight** mismatch (Inter 300 unfetched / locally honored), not a fallback-to-system. Fix is token-layer, not a load fix.
- **Shared-markup collision** — FALSE: the logo edit is the Vialuce-only `VialuceSidebar` + Vialuce-scoped `.sb-brand`; `ChromeSidebar` (Bliss) untouched.
- **Malformed asset** — FALSE: viewBox `0 0 40 40` is square; 32→40 is uniform scaling, no distortion.
→ **No HALT.**

---

<!-- G1–G6 appended after implementation + build -->
