# HF-340 — Vialuce Theme: Font Scheme + Logo Parity with Bliss

**EXECUTION MODE: ULTRACODE.** You receive an objective (§1), an invariant set / constraints (§3), and proof gates (§4). You own execution strategy, file selection, and sequencing — there are no step-by-step instructions, and none are coming. Determine the work from the live repo. HALT only on a premise failure (§4A); never halt on a normal gate.

**Governing reference:** `CC_STANDING_ARCHITECTURE_RULES.md` (governs this directive).
**Theme lineage:** OB-201 (theme toggle) · HF-305–311 (Bliss design system) · OB-221 / HF-312–319 / OB-224–226 (Vialuce theme).
**Channel:** SR-44 — architect browser-verifies and merges. CC does NOT merge.

---

## §0 — Standing Rules
- `CC_STANDING_ARCHITECTURE_RULES.md` governs this directive.
- Commit + push after every change.
- Git from repo root (`~/spm-platform`), NOT `web/`.
- After changes: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before writing the completion report.
- Anti-Pattern Registry checked before build.
- Final step: `gh pr create --base main --head hf-340-vialuce-font-logo-parity`.

---

## §1 — Objective
Under `[data-theme="vialuce"]`, achieve exact parity with the **Bliss** theme on two dimensions — and only these two:

1. **Fonts.** Headings render in **Urbanist**, body in **Inter**, mono / eyebrow-section labels in **DM Mono** — the identical families Bliss renders. Bliss's font declarations are the reference of record.
2. **Logo.** The nav renders the **same diamond Vialuce logo asset** Bliss renders — same asset, reused.

**Visual target:** a user toggling Dark → Bliss → Vialuce sees the Vialuce theme carry Bliss's exact type system and the Bliss diamond mark, with Vialuce's own color/layout otherwise intact.

---

## §2 — Reference (establish from the live repo; do not assume)
- Theme tokens live in `web/src/app/globals.css` (per HF-307, which pasted the Bliss token block from that file). The Vialuce theme uses the three-layer token architecture (Layer 0 primitives → Layer 1 semantic → Layer 2 component slots) from the OB-221 arc.
- The Bliss diamond logo renders via a theme conditional in the nav (per OB-201 §3.2 / HF-307 G4). Locate the exact asset and conditional; that asset is what Vialuce must reuse.

---

## §3 — Constraints (invariants — a breach is out-of-scope, not a feature)
- **Token-layer only.** Correct the Vialuce font tokens so the semantic chain resolves to Urbanist/Inter/DM Mono, mirroring Bliss's values. **PROHIBITED:** `!important`, per-component font overrides, a parallel/duplicate font system. Parity by alignment/subtraction — not a new layer.
- **Asset reuse only.** Render the existing Bliss diamond asset under Vialuce. **PROHIBITED:** new or duplicate logo component files.
- **Bliss and Dark/current are immutable in this HF.** Zero change to `[data-theme="bliss"]` and `[data-theme="current"]`/`[data-theme="dark"]`.
- **Vialuce non-type/non-logo surfaces are immutable.** Colors, palette, spacing, layout, components, behavior — untouched.
- **Experience-only.** No engine surface. No SQL. SR-39 does not fire (no auth/RLS/session/schema). If any of these would be required, that is a premise failure (§4A).
- **Architecture Decision Gate.** Before implementing, record in the completion report the exact tokens/files you will edit and confirm each sits inside this constraint envelope.

---

## §4 — Proof Gates (evidentiary — paste code / diff / terminal; no PASS/FAIL self-attestation)
- **G0 — Current-state diagnostic.** Paste the font-token declarations for `[data-theme="bliss"]` and `[data-theme="vialuce"]` (Layer 0 + semantic `--font-*`), the nav logo conditional (which asset renders under each theme today), and the app-wide font load (`@font-face`/import for Urbanist/Inter/DM Mono). State the delta in one line each: Vialuce fonts now vs. Bliss; Vialuce logo now vs. Bliss diamond.
- **G1 — Font parity.** Bliss font-token block and the edited Vialuce font-token block, side by side; families match.
- **G2 — Fonts loaded.** Import / `@font-face` proving Urbanist + Inter + DM Mono are loaded on the Vialuce render path (no silent system fallback).
- **G3 — Logo parity.** Nav logo conditional showing the `vialuce` branch now renders the same diamond asset as `bliss`; paste the asset path; `git diff --stat` confirming no new component file.
- **G4 — Bliss untouched.** `git diff` proving zero change to Bliss tokens and the Bliss logo branch.
- **G5 — Dark/current untouched.** Same, for current/dark.
- **G6 — Build + dev.** `tsc --noEmit` clean; `rm -rf .next && npm run build` exit-0; `npm run dev` → `localhost:3000` responds. Paste tails.

**Architect-gated (SR-44 — do NOT self-attest, do NOT merge):** browser confirmation that, under Vialuce, headings/body/labels render in Urbanist/Inter/DM Mono (not fallback) and the diamond logo renders, with Bliss + Dark visually unchanged. Open the PR and stop for architect verification + merge.

---

## §4A — HALT Conditions (PREMISE FAILURES ONLY — surface verbatim, await architect disposition)
- **No delta.** G0 shows Vialuce already matches Bliss fonts and logo → do not manufacture a change; report and stop.
- **Constraint collision.** Achieving font parity would require mutating a token Bliss/Dark also read (cannot change Vialuce without changing them) → stop.
- **Scope collision.** Parity would require engine / auth / RLS / session / schema surface → stop.
- **Missing reference.** The Bliss diamond asset or Bliss font tokens cannot be located in the repo → stop.

*An accidental regression to Bliss/Dark is a constraint breach caught by G4/G5 — fix it and re-prove. It is not a HALT.*

---

## §5 — Reporting Discipline
- Completion report: `docs/completion-reports/HF-340_COMPLETION_REPORT.md` (NOT repo root).
- Contents: ADR (§3), G0–G6 evidence, commit table (SHAs), Anti-Pattern Registry confirmation (no duplicate component, no `!important`/per-component override, no parallel font system).
- Then:

```bash
cd ~/spm-platform && rm -rf .next && npm run build && npm run dev
git add -A && git commit -m "HF-340: completion report" && git push origin hf-340-vialuce-font-logo-parity
gh pr create --base main --head hf-340-vialuce-font-logo-parity \
  --title "HF-340 — Vialuce theme: font scheme + logo parity with Bliss" \
  --body "Aligns [data-theme=vialuce] font tokens to Bliss (Urbanist headings / Inter body / DM Mono labels) at the token layer, and renders the Bliss diamond logo under vialuce by reusing the existing asset. No per-component overrides, no duplicate components. Bliss + Dark unchanged (G4/G5). Experience-only; no engine/auth/RLS/schema. Proof gates G0-G6. HALT for architect browser verification + merge."
```

---

## §6 — Out of Scope
Marketing/public site · Bliss theme · Dark/current theme · Vialuce palette/colors/spacing/layout/components · per-user/per-tenant theme preference · auth/RLS/session/schema · any engine surface.

## §6A — Residuals
- Additional Vialuce logo surfaces beyond the nav (favicon, loading spinner, email templates) — log as follow-on, not this HF.
- Font-load latency on first Vialuce render — a follow-on HF may add `<link rel="preload">`. Not in scope.
