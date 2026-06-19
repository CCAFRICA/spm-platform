# HF-313 — Vialuce Theme: Browser-Verified Blocking Defects — Completion Report

*Branch: `hf-313-vialuce-browser-fixes` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Verification model (R2): CC proves code-level; architect proves visual fidelity at PR review.*
*Diagnostic-first: every architect hypothesis was traced against the live code before fixing — and **two were wrong**.*

---

## Per-defect diagnosis + fix

### Defect 4 — Observatory "Dark" not honoring (commit `3d529ccd`)
**Architect hypothesis (WRONG):** the selector writes the display label `'Dark'` instead of `'current'`.
**Actual root cause:** `FeatureFlagsTab.setTheme(theme: AppTheme)` already sends the **internal** value
(`theme` from `THEME_ORDER` = `current|bliss|vialuce`, rendered via `THEME_LABELS[theme]`) — verified, no
value/label bug (so HALT-2 N/A — nothing wrote `'Dark'`). The real reason "Dark" didn't take effect:
`layout.tsx:45` gives a **per-user `profiles.preferences.theme` precedence over the global
`active_ui_theme`** (HF-309 design). An admin who set a personal theme while testing won't see a global
change.
**Fix:** after the global PATCH succeeds, also `POST /api/user/theme` to sync the acting admin's per-user
preference to the new theme, so the Observatory selection honors for them (users without a personal
override already get the global default).

### Defect 1 — washed-out content area (commits `65107007` + `1289c815`)
**Architect hypothesis (WRONG):** the `[data-theme="vialuce"]` OKLCH values for `--card`/etc. are dark.
**Actual root cause (two compounding):**
1. `darkMode: ["class"]` + `layout.tsx:52` hardcoded `className="dark"` on `<html>` for **every** theme →
   all `dark:` Tailwind variants fired under vialuce (a light theme).
2. Content components are written for the always-dark app: **315** unconditional dark surface utilities
   (`bg-zinc-800`, `bg-slate-900`, …) + **110** light-text utilities (`text-white`, …) across **58 files**,
   with no light alternative — dark cards on the light bg regardless of `.dark`. Vialuce was **also missing
   every content-compat remap bliss ships** (`bg-slate-100`, `text-slate-900`, `app-navbar`, modal scrim —
   vialuce=0 / bliss=1 for all). The tokens themselves are correct (see token audit below).
This is the **§HALT-1 / per-page-adoption class** — acknowledged; the structural fix is per-page design-class
adoption (§6A). Interim fix:
1. `layout.tsx`: drop `.dark` for vialuce only (`className={activeTheme === 'vialuce' ? undefined : 'dark'}`)
   — fixes well-formed `light-base dark:override` components by rendering their light base. Current keeps
   `.dark`; **bliss unchanged** (OOS).
2. `globals.css`: scoped utility remaps (mirroring bliss's HF-308, extended to dark surfaces/text/borders +
   modal scrim) — `bg-{slate,zinc,gray,neutral}-{800,900,950}` → `--vl-surface`; light text → `--vl-text`;
   muted → `--vl-text-muted`; dark borders → `--vl-line`. **Unlayered** → wins over `@layer utilities` and
   `dark:` pairs without `!important`. Documented collateral: an intentionally-dark custom element flips
   light (shadcn buttons are SAFE — they use `--primary-foreground`, not `.text-white`).

### Defect 2 — persona switcher duplicated (commit `597c03a6`)
**Root cause:** `auth-shell.tsx` rendered `<PersonaSwitcher />` (the `fixed bottom-4` floating bar)
unconditionally, duplicating VialuceSidebar's docked persona under vialuce.
**Fix:** moved it into `AuthShellInner` (which has `useIsVialuce`) and gated `{!isVialuce && <PersonaSwitcher />}`
— renders only for Dark/Bliss; still inside the required providers; VialuceSidebar's persona untouched.

### Defect 3 — per-user theme toggle inaccessible (commit `9236ea21`)
**Root cause:** under vialuce, `ChromeSidebar` swaps in `VialuceSidebar`, which had **no** theme toggle
(`UserIdentity`, where it lives for Dark/Bliss, isn't rendered) → the per-user override was unreachable.
**Fix:** added a 3-option `.sb-theme` toggle to the VialuceSidebar footer (`THEME_ORDER` + `THEME_LABELS`),
same mechanism as `UserIdentity` (`POST /api/user/theme` → reload); scoped `.sb-theme` CSS.

---

## Token audit (post-fix) — Defect 1 tokens were already correct
```
--card:            1 0 0          → #FFFFFF  (pure white)            ✓ white
--card-foreground: 0.24 0.11 274  → ~#2B2A6B (dark indigo text)      ✓ near-black
--background:      0.97 0.005 280 → ~#F4F5FB (light lavender)        ✓ light
--popover:         1 0 0          → #FFFFFF                          ✓ white
--secondary:       0.97 0.025 274 → light indigo tint               ✓ light
--muted:           0.95 0.008 280 → light                           ✓ light
--border:          0.93 0.008 280 → ~#E8EAF3                        ✓ light line
strag scale:       --strag-panel #FFFFFF, --strag-app #F4F5FB, --strag-s0/s2 #1A1A2E (dark text)  ✓
```
The OKLCH values were never the problem — the dark rendering came from the `.dark` class + hardcoded
dark utilities in content components, not the token chain.

## Scoping verification
```
grep -c 'html[data-theme="vialuce"]' globals.css → 195  (176 pre-D1 + remap + colored-CTA restore), 0 unscoped
new utility remaps: all prefixed html[data-theme="vialuce"] (Dark/Bliss unaffected)
layout className change: vialuce only — current & bliss keep 'dark'
tsc --noEmit: exit 0 · Korean Test: PASS · npm run build: exit 0
```

---

## Adversarial verification (5 independent skeptics)

| Dimension | Verdict | Severity |
|---|---|---|
| D1 — `.dark` drop + surface remap | mechanism confirmed; **collateral found → fixed** | major→resolved |
| D4 — precedence / dual-write | **confirmed** | none |
| D2 — persona hide | **confirmed** | none |
| D3 — per-user toggle | **confirmed** | none |
| Regression / scoping (Dark/Bliss) | **confirmed byte-identical** | none |

- **D1 (mechanism confirmed, one real regression fixed):** verified the `.dark` drop is vialuce-only
  (current/bliss keep it), all remaps scoped, shadcn buttons safe (`--primary-foreground`, not
  `.text-white`), the deep-indigo shell untouched (`.sb`/`.top` use `--vl-nav`, not slate utilities), and
  token resolution intact without `.dark`. **But** the `.text-white` flip forced dark navy onto saturated
  colored CTAs (`bg-blue-600 text-white`, etc. — not remapped) → illegible. **Fixed** (`f42201aa`):
  restore light text on saturated colored backgrounds (specificity (0,3,1) > (0,2,1) flip).
  Remaining accepted collateral (documented band-aid): intentionally-dark elements (`bg-zinc-950`
  full-screen, code panels) flip light under vialuce — resolved by per-page adoption (§6A).
- **D4 (confirmed):** the selector sends internal values (no value/label bug); per-user precedence over
  global is the real cause; the dual-write makes the selection take effect on reload; the synced value is
  in the API VALID set. (Side note: the admin then carries a personal override — inherent to the design.)
- **D2 (confirmed):** PersonaSwitcher renders exactly once, gated `!isVialuce`, still inside the required
  providers; VialuceSidebar's docked persona untouched; one switcher per theme.
- **D3 (confirmed):** the footer toggle POSTs the internal value, is crash-safe, scoped, and
  active-state-correct.
- **Regression (confirmed):** the className ternary keeps `'dark'` for both current AND bliss; every
  globals.css rule is vialuce-scoped; the PersonaSwitcher relocation is visually inert (`position:fixed`).
  Dark/Bliss DOM/behavior byte-identical.

---

## SHA / PR
Commits: directive `00dcea55` · D4 `3d529ccd` · D1 `65107007`+`1289c815`+`f42201aa` (colored-CTA fix-up)
· D2 `597c03a6` · D3 `9236ea21`. PR: (added on creation). DO NOT MERGE — SR-44.

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-222 → four blocking defects fixed: washed-out content (root cause was the always-on .dark class
    + hardcoded dark utilities, NOT the OKLCH tokens — architect hypothesis corrected); legacy persona
    duplication hidden under vialuce; per-user theme toggle restored in the VialuceSidebar footer;
    Observatory "Dark" honoring (root cause was per-user precedence, NOT value/label — architect
    hypothesis corrected; dual-write sync added).
REGISTRY: Design & Experience → HF-313 SHA.
BOARD: Design & Experience — Vialuce content renders light; theme switching fully functional.
SUBSTRATE: SR-34 exercised (diagnostic-first; structural .dark fix + scoped remaps, not 416 band-aids);
    two stated hypotheses falsified by tracing the live code.
```

## Out of scope / Residuals (per directive §6/§6A)
1. **Per-page structural adoption (~39 routes / 58 components with hardcoded dark utilities)** — the
   utility remap is a documented band-aid (HALT-1 acknowledged); the structural fix is per-page
   design-class adoption per the HF-312 pattern.
2. **Potential data fix** — HALT-2 did NOT fire (no `'Dark'` was ever persisted; the selector always sent
   internal values), so no data cleanup is needed.
3. **First-paint flash** — `useIsVialuce()`/the `.dark`-drop resolve server-side in `data-theme`; the
   className is server-rendered too, so no client flip for the dark-class. Architect confirms at review.
