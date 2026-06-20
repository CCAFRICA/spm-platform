# HF-317 — Vialuce: Opacity-Modifier Gray-Card Fix — Completion Report

*Branch: `hf-317-vialuce-gray-cards` · 2026-06-20 · DO NOT MERGE (SR-44)*

## Root cause (diagnostic-first)
Browser verification of HF-316 showed gray card backgrounds on `/operate` (Pipeline Readiness +
Incentive Compensation). These are **not** dark utilities the HF-313/314/316 safety net targets — they
are **Tailwind opacity-modifier variants**: `/operate/page.tsx:543` and `:613` use
`bg-zinc-800/50 border border-zinc-700`. The modifier emits a **separate class** (`bg-zinc-800/50` →
`.bg-zinc-800\/50`); the safety net only matched the **bare** `.bg-zinc-800`. On the light Vialuce
background, a dark color at 50% alpha renders as a **mid-gray card**.

It is the shared dark-app card idiom — codebase inventory: **67× `bg-zinc-800/50`, 41× `bg-zinc-900/50`,
24× `/30`, 23× `/40` …, 55× `border-zinc-800/60`** across many files → **fix once globally** (directive).

## Fix (one scoped CSS block, `globals.css`)
Attribute-substring remaps catch **every opacity %** per dark shade in one rule each, with a
`:not([class*=":<util>/"])` guard so only BASE surfaces flip (variant-prefixed `hover:`/`focus:` forms
keep their HF-314 hover treatment; verified no responsive-prefixed dark-opacity bg exists, so the guard
leaves nothing gray):
- dark **neutral + colored** bg with any opacity (`bg-{zinc,slate,gray,neutral,stone}-{700..950}/NN`,
  `bg-{blue,sky,indigo,purple,violet}-{800,900,950}/NN`) → `var(--vl-surface)` (white).
- dark **borders** with any opacity (`border-{zinc,slate,gray}-{600..900}/NN`) → `var(--vl-line)`.

Specificity (0,3,1) + unlayered → beats the `@layer utilities` opacity utility. Scoped to
`[data-theme="vialuce"]` → Dark/Bliss untouched. The `/operate` cards' bare `border-zinc-700` was
already → `--vl-line` (HF-313), so a `bg-zinc-800/50 border border-zinc-700` card now renders as a
white surface with a hairline `--vl-line` border (design-spec `.card` look minus shadow).

## Verification
```
/operate classes covered: bg-zinc-800/ + border-zinc-700/ remaps present
scoped vialuce rules: 250 (was 220) ; 0 unscoped
tsc: n/a (CSS-only) ; Korean Test: PASS ; npm run build: exit-0
BCL: byte-identical (CSS-only, no engine/runtime change)
```

## SHA / PR
Commit: HF-317 `<sha>`. PR #561. DO NOT MERGE — SR-44 (architect browser-verifies).

## Out of scope / residuals
Text inside these cards (`text-zinc-200/400`) is already remapped (HF-313). Recharts SVG internals +
inner viz sub-components carry from HF-316. No new dark/gray surface class families remain uncovered
(bare + opacity variants now both handled).
