# HF-307A: Color Pipeline Migration — HSL to OKLCH

## §0 — CC Standing Rules

Include `CC_STANDING_ARCHITECTURE_RULES.md` in full. All standing rules binding throughout.
Drafting-discipline source: `INF_Structured_Compliant_Drafting_Reference_20260513.md`.

AUTONOMY DIRECTIVE: NEVER ask yes/no. NEVER say "shall I". Act. Commit + push after every change. Git from repo root (`~/spm-platform`), NOT `web/`.

ULTRACODE: Full autonomy on execution strategy.

---

## §1 — Problem Statement

The app's Tailwind color pipeline stores bare HSL channels in CSS variables (`--primary: 240 100% 50%`) and wraps them in the config (`primary: "hsl(var(--primary) / <alpha-value>)"`). This was adequate for the original dark theme where values were hand-picked in HSL. It is now a permanent fidelity ceiling for bliss.

HF-307 correctly identified that unwrapping the pipeline during token correction would produce `hsl(hsl(...))` → broken in both themes. The solution was to convert the authoritative OKLCH values to HSL equivalents for the 13 shadcn pipeline tokens while using raw OKLCH for brand tokens. This was the right safety decision. But it means every opacity-modified color (`bg-primary/10`, `bg-muted/50` — 61 occurrences across 18 components) is computed in HSL space instead of OKLCH space, producing perceptually washed-out, hue-shifted results at low opacity. This is the root cause of the "not crisp" appearance versus the marketing reference.

**The fix:** migrate the entire color pipeline from `hsl()` to `oklch()`. Same architectural pattern — bare channels in CSS variables, color function wrapper in the Tailwind config — but in a perceptually uniform color space. Both themes get the migration. Solid colors render identically (same underlying color, different notation). Opacity-modified colors render better (perceptually linear blending instead of HSL hue-shift).

**This HF affects BOTH themes.** The `current` theme's HSL channel values are converted to OKLCH channel values. The `bliss` theme's already-converted HSL values are replaced with their authoritative OKLCH originals. Both themes benefit from cleaner opacity math.

---

## §2 — Substrate-Bound Discipline Applications

**T1-E910 (Korean Test):** Structural token names unchanged. Only the color-space encoding changes.

**DD-7 (Behavior Preservation — CRITICAL):** Solid colors (`bg-primary`, `text-foreground`, `border-border`) MUST render the same visible color in both themes after migration. The migration changes notation (HSL → OKLCH), not the target color. Opacity-modified colors will shift perceptually (intentionally, for the better) — this is the point of the migration, not a regression. The proof gate (G2) verifies solid-color parity.

**SR-39:** Does NOT fire. Presentation-layer only. No auth/RLS/session/encryption/audit surface.

---

## §3 — The Migration (mechanism)

### §3.1 — Current pipeline (what exists today)

**`web/src/app/globals.css`:**
```css
:root, .dark, [data-theme="current"] {
  --primary: 217 91% 60%;         /* bare HSL channels */
  --background: 222 84% 5%;
  /* ... 13 shadcn tokens as bare HSL channels ... */
}

[data-theme="bliss"] {
  --primary: 240.2 57.9% 33.8%;   /* OKLCH→HSL conversion from HF-307 */
  --background: 0 0% 100%;
  /* ... */
}
```

**`web/tailwind.config.ts`:**
```typescript
primary: {
  DEFAULT: "hsl(var(--primary) / <alpha-value>)",
  foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
},
```

**18 components** reference `hsl(var(--token))` directly in JSX/CSS (charts, tooltips, style attributes).

### §3.2 — Target pipeline (after migration)

**`web/src/app/globals.css`:**
```css
:root, .dark, [data-theme="current"] {
  --primary: 0.55 0.18 250;       /* bare OKLCH channels (L C H) */
  --background: 0.13 0.03 260;
  /* ... 13 shadcn tokens as bare OKLCH channels ... */
}

[data-theme="bliss"] {
  --primary: 0.34 0.16 274;       /* authoritative OKLCH, no conversion needed */
  --background: 1 0 0;
  /* ... */
}
```

**`web/tailwind.config.ts`:**
```typescript
primary: {
  DEFAULT: "oklch(var(--primary) / <alpha-value>)",
  foreground: "oklch(var(--primary-foreground) / <alpha-value>)",
},
```

**18 components:** `hsl(var(--token))` → `oklch(var(--token))`.

### §3.3 — Conversion procedure

For each of the 13 shadcn tokens in the `current` theme:
1. Take the existing bare HSL channel values (e.g., `217 91% 60%`)
2. Resolve to the concrete color (e.g., `hsl(217, 91%, 60%)` → a specific sRGB value)
3. Convert sRGB → OKLCH (via OKLab intermediate, same method used in HF-307)
4. Store as bare OKLCH channels (e.g., `0.55 0.18 250`)

For the `bliss` theme: replace the HF-307 HSL conversions with the authoritative OKLCH values directly from the production `styles.css` — no conversion needed, the source IS OKLCH.

For the Tailwind config: replace every `"hsl(var(--token) / <alpha-value>)"` with `"oklch(var(--token) / <alpha-value>)"`.

For the 18 direct consumers: replace every `hsl(var(--token))` with `oklch(var(--token))`.

---

## §4 — Constraints

1. **Solid colors must render identically.** The migration changes color-space notation, not the target color. If `--primary` was indigo before, it's still indigo after — just expressed in OKLCH instead of HSL. Proof gate G2 verifies this.

2. **Opacity-modified colors WILL change perceptually.** This is intentional and desirable — OKLCH blending is perceptually uniform (no hue shift, no saturation loss). This is the entire reason for the migration. This is NOT a DD-7 violation — it is the fix.

3. **Both themes migrated.** The `current` theme gets OKLCH channels (converted from its existing HSL). The `bliss` theme gets authoritative OKLCH (replacing the HF-307 HSL conversions). The pipeline wrapper in `tailwind.config.ts` changes once and serves both.

4. **Browser support.** OKLCH is supported in all modern browsers (Chrome 111+, Firefox 113+, Safari 15.4+). The app's target audience (enterprise LATAM) uses modern browsers. If a legacy fallback is needed, it's follow-on — not a blocker.

5. **No schema/migration/DB. No auth/RLS. No new features.**

6. **Commit + push after each logical batch. Build must pass after each.**

---

## §4A — HALT Conditions

**HALT-1 (Solid-color regression):** If any solid color (no opacity modifier) renders visibly differently after migration in either theme — STOP. The conversion is wrong. Debug the specific token's HSL→OKLCH conversion.

**HALT-2 (Component break):** If any of the 18 direct-consumer components break (runtime error, blank render, or `oklch(hsl(...))` nesting) — STOP. That component still has an `hsl()` wrapper. Find and fix before proceeding.

**HALT-3 (Build failure):** If `npm run build` or `tsc --noEmit` fails after any batch — STOP. Fix before proceeding.

---

## §5 — Proof Gates

**G1 — Pipeline wrapper.** Paste the updated `tailwind.config.ts` color definitions showing `oklch(var(--token) / <alpha-value>)` for every semantic color.

**G2 — Solid-color parity.** For at least 5 tokens (`--primary`, `--background`, `--foreground`, `--border`, `--accent`), show the before (HSL) and after (OKLCH) resolved hex values are identical (or within 1 unit RGB). Method: render both in a test script or browser, compare computed `rgb()` output. Paste evidence.

**G3 — Opacity rendering.** Under bliss, show that `bg-primary/10` renders as `oklch(0.34 0.16 274 / 0.1)` in the compiled CSS (not `hsl(... / 0.1)`). Paste the compiled CSS rule.

**G4 — 18 direct consumers.** List every component that was updated from `hsl(var(--token))` to `oklch(var(--token))`. File path + line for each.

**G5 — Current theme OKLCH values.** Paste the complete `current` theme token block showing all 13 shadcn tokens as bare OKLCH channels.

**G6 — Bliss theme OKLCH values.** Paste the complete `bliss` theme token block — now using authoritative OKLCH directly (no HSL conversion layer).

**G7 — Build clean.** `npm run build` exit-0, `tsc --noEmit` clean.

**G8 — FOUC intact.** `curl -s http://localhost:3000/login | grep '<html'` — `data-theme` present in SSR HTML.

---

## §5A — Reporting Discipline

Completion report: `~/spm-platform/HF-307A_COMPLETION_REPORT.md`.

Contents: G1–G8 evidence pasted. Commit table. The 18-component update list (G4). Explicit confirmations: both themes migrated, zero auth/RLS surface, no schema changes, marketing untouched.

Final step:
```bash
cd ~/spm-platform && rm -rf .next && npm run build && npm run dev
git add -A && git commit -m "HF-307A: completion report" && git push origin dev
gh pr create --base main --head dev \
  --title "HF-307A — Color pipeline migration: HSL to OKLCH" \
  --body "Migrates Tailwind color pipeline from hsl(var(--token)) to oklch(var(--token)). Both themes converted to bare OKLCH channels. Removes the HSL fidelity ceiling — opacity modifiers now blend in perceptually uniform OKLCH space (no hue shift, no saturation loss). 18 direct-consumer components updated. Solid colors render identically; opacity-modified colors render crisper. Zero current regression on solid fills."
```

---

## §6 — Out of Scope

- Marketing/public site
- Per-user theme preference (HF-308 → now HF-309)
- Login page / Observatory theming (HF-309)
- Visual straggler remediation (HF-308)
- Tailwind version upgrade (v3 → v4). This HF uses the v3-compatible `oklch(var(--channels) / <alpha-value>)` pattern.
- Legacy browser fallbacks for OKLCH
- New features/routes/data
- Auth/RLS/session/schema changes

---

## §6A — Residuals

- **Chart-specific color tokens.** `--chart-1` through `--chart-5` follow the same pipeline. If they also use `hsl()` wrapping, they need the same migration. CC should include them if present; if missed, follow-on.
- **CSS `color-mix()` usages.** If any component uses `color-mix(in hsl, ...)` explicitly, it needs conversion to `color-mix(in oklch, ...)`. Grep and convert if found; if missed, follow-on.
- **Edge-case opacity behavior.** OKLCH opacity blending at very low values (< 5%) can produce subtly different tints than HSL on certain hue angles. This is OKLCH being more correct, not a regression — but if any specific surface looks unexpected, log it for architect review.
- **HF-305 theme-aware palette vars.** The `--c-slate-*` / `--c-zinc-*` vars from HF-305's palette remap also use fallback hex values. These are separate from the shadcn pipeline and do not need OKLCH conversion in this HF — they're consumed directly, not through a color-function wrapper.
