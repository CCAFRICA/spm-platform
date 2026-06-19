# HF-311 — Architecture Decision Record

## Problem
Eleven open theme-system items remain (OB-201 + HF-305..310). The load-bearing code item is **Item 3**: the VL-Admin Observatory renders ~402 inline hex colors across 10 `web/src/components/platform/*` files. Inline styles have the highest CSS specificity — a `[data-theme="bliss"]` stylesheet rule cannot override them — so under bliss the Observatory stays dark-on-light (broken). They must be made theme-responsive without changing the `current` theme by a single byte.

## Options

**Option A — Bliss-scoped stylesheet overrides targeting Observatory elements.**
- Works at 10x? Yes (CSS). AI-first? N/A (presentation). Transport? No. Atomicity? N/A.
- REJECTED: inline styles beat stylesheet specificity; overrides would not apply without `!important` floods, which would also leak into `current`.

**Option B — Edit inline hexes to conditional JS (`theme === 'bliss' ? lightHex : darkHex`).**
- Works at 10x? Yes. AI-first? N/A. Transport? No. Atomicity? N/A.
- REJECTED: threads theme state through 10 components and 402 sites; high regression surface; couples presentation to a JS theme read.

**Option C — Replace each inline hex with a byte-safe CSS custom property (`var(--strag-*)`).**
- Each var's `[data-theme="current"]` value = the EXACT original hex → `current` render is byte-identical (computed style unchanged). `[data-theme="bliss"]` value = a light/ink equivalent.
- Works at 10x? Yes (pure CSS cascade). AI-first? N/A. Transport? No. Atomicity? per-file commits, build-gated.
- **CHOSEN.** It is the only option that is (a) zero-regression for `current` by construction, (b) theme-responsive for bliss, and (c) the mechanism HF-308 already established for tenant-facing stragglers (`--strag-*`). Extends an existing, proven pattern.

**CHOSEN: Option C** — byte-safe `--strag-*` custom properties. **REJECTED: A** (specificity), **B** (regression surface + coupling).

## Scope discipline (Item 3)
Per the directive: convert **background and primary-text** hexes only. Surface darks (slate/zinc 700–950) → light surfaces; neutral text lights (slate 50–500) → ink scale. Status accents (emerald/amber/red/blue) and brand violet/indigo are decorative accents that remain legible on white — left as-is, logged in the report. No layout/structure changes (HALT-2). shadcn primitives overridden via scoped CSS, never forked (Item 7).

## Governing Principles (Decisions 123/124)
- **G1 Standard:** WCAG 2.1 contrast — bliss surfaces/text must clear AA on a white ground.
- **G2 Embodiment:** the byte-safe `var()` indirection IS the zero-regression guarantee (computed `current` style is provably the original hex), not a "we tested it" assertion.
- **G4 Discipline:** opponent-process color + contrast theory (same basis as the OB-201 bliss palette).
- **G5 Abstraction:** the `--strag-*` indirection is domain-agnostic — any inline-hex surface, any tenant.
- **SR-39:** does not fire (presentation layer; no calculation/RLS/schema).

## Constraints (binding)
HALT-1 zero `current` regression (every replaced hex maps to a var whose `current` value = that exact hex). HALT-2 Observatory convert-not-redesign. Korean Test: semantic var names. Commit + push per batch; build green per batch.
