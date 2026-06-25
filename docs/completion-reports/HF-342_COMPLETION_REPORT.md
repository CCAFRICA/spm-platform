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

## 3. G1–G6 evidence

### G1 — Font delta closed (matched-element computed styles now identical)
| Element | `[data-theme="bliss"]` | `[data-theme="vialuce"]` (edited) | Match |
|---|---|---|---|
| Body paragraph | `Inter` / `400` / `normal` | `Inter` / **`400`** (`--vl-fw-body:400`, `:619`) / `normal` | ✓ |
| Page heading | `Urbanist` / Tailwind-class weight | `Urbanist` (`:628-633`) / same shared markup | ✓ |
| Section label (rail) | `DM Mono` | `DM Mono` (`.sb-lbl`) | ✓ |
| Wordmark | `Inter` / `700` / `normal` | `Inter` / `700` / `normal` (see G2) | ✓ |

The sole edited token: `--vl-fw-body: 300 → 400`. Its only consumer is the Vialuce `body` rule (`:625`), so the blast radius is exactly the body base weight — Vialuce body text now renders Inter `400`, identical to Bliss.

### G2 — Wordmark parity (computed style under both themes)
| | Bliss (`ChromeSidebar.tsx:291`, `text-sm font-bold`) | Vialuce (`.sb-brand b`, edited) |
|---|---|---|
| font-family | `Inter` (body) | `Inter` (inherits body) |
| font-weight | `700` | `700` (`--vl-fw-bold`) |
| letter-spacing | `normal` | `normal` (0.3px **removed**) |
**font / weight / spacing now match.** (Size 15.5px vs 14px is the lockup's own scale; G2 governs font/weight/spacing, not size.)

### G3 — Logo lockup (corrected markup; existing asset reused)
`VialuceSidebar.tsx` diamond `<svg>` now `width="40" height="40"` (was 32) — viewBox-native 1:1, so the ~64%-fill mark renders ≈ **25.5px visible** (was ~20px). `.sb-brand` `gap: 10px` (was 11) keeps the optical mark→wordmark gap (~10 + 7.3px viewBox-pad ≈ 17px) aligned with Bliss (~12 + 5.8 ≈ 18px). `align-items:center` (unchanged) centres the enlarged mark against the two-line wordmark block.
Asset reuse confirmed — `git diff --stat`: `globals.css | 11`, `VialuceSidebar.tsx | 6`, **2 files changed, 0 new files** (no new/duplicate asset or component).

### G4 — Bliss untouched
`git diff` touches only `globals.css` (inside `html[data-theme="vialuce"]`, `:613-645`) and the Vialuce-only `VialuceSidebar.tsx`. Guard grep over the `+/-` lines for `data-theme="bliss"` / `ChromeSidebar` / `--color-indigo` / `--color-gold` → **NONE**. The only "bliss" strings in the diff are explanatory comments. `ChromeSidebar.tsx` (Bliss + Dark rail) is not in the changeset.

### G5 — Dark/current untouched
Same diff: zero change to `[data-theme="dark"]`/`[data-theme="current"]`. No edits outside the `html[data-theme="vialuce"]` block (CSS) or the Vialuce-only rail. The Dark/current `V`-glyph branch in `ChromeSidebar.tsx` is untouched.

### G6 — Build + dev
- `npx tsc --noEmit` → exit **0** (clean).
- `rm -rf .next && npm run build` → exit **0** (full route table emitted).
- `npm run dev` → `✓ Ready in 1201ms`; `curl localhost:3000` → **HTTP 307** (app responds; auth/tenant redirect).

### Architect-gated (SR-44 — NOT self-attested)
Browser confirmation under Vialuce that the lockup reads as deliberate (40px mark optically aligned to the wordmark) and that body text now renders the same weight as Bliss, with Bliss + Dark visually unchanged. PR opened; **CC stops for architect verification + merge.**

---

## 4. Commit table
| SHA | Description |
|---|---|
| `035cb6aa` | HF-342 ADR + G0 diagnostic (before code) |
| `3dafa16c` | HF-342 implementation — diamond 40px + gap 10px + `--vl-fw-body:400` + wordmark spacing |
| _(this)_ | HF-342 completion report (G1–G6) |

## 5. Anti-Pattern Registry confirmation
- **No new file / no duplicate component or asset:** the diamond is the existing inline SVG, resized in place; `git diff --stat` shows 0 new files.
- **No `!important`:** none added.
- **No per-component font-family patch / no parallel font system:** font parity is one **token-value** edit (`--vl-fw-body`) + one **override-removal** (wordmark `letter-spacing`). No element-targeted font-family hacks, no duplicate font layer.
- **Bliss/Dark immutable:** zero edits to their tokens, logo branches, or `ChromeSidebar.tsx` (G4/G5).
- **AI-First / scale / transport / atomicity:** N/A (experience-only CSS + one TSX size attr; no data path).

## 6. Residuals / follow-ons (§6A)
- **Content eyebrows** (shared `.uppercase.tracking-wider` markup): Bliss maps these to DM Mono (`globals.css:338-340`); Vialuce has no equivalent content-eyebrow → mono rule, so they inherit body Inter. The **rail** section labels already match (both DM Mono). Closing the content-eyebrow family delta would add a Vialuce content rule touching surfaces beyond the nav lockup (§6 boundary) and may be intentional Vialuce design — **logged as a follow-on**, not this lockup-focused HF.
- The orphaned `.sb-logo` rule (`globals.css:643`, unused since HF-340's swap) is left in place (dead but harmless; removing it is unrelated cleanup).

## 7. HALT outcomes
None fired. §4A: no-delta (false — body weight 300 vs 400, wordmark spacing 0.3 vs 0); font-fails-to-load (false — fonts load app-wide; this was a weight-token mismatch, fixed at the token layer); shared-markup collision (false — Vialuce-only rail + scoped CSS); malformed asset (false — square viewBox, uniform 32→40 scale). Bliss/Dark regression: none (G4/G5).

