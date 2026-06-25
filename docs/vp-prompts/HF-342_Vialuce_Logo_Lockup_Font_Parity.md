# HF-342 — Vialuce Theme: Logo Lockup Correction + Residual Font Parity

**EXECUTION MODE: ULTRACODE.** You receive an objective (§1), an invariant set / constraints (§3), and proof gates (§4). You own execution strategy, file selection, and sequencing — there are no step-by-step instructions. Determine the work from the live repo. HALT only on a premise failure (§4A); never halt on a normal gate.

**Governing reference:** `CC_STANDING_ARCHITECTURE_RULES.md` (governs this directive).
**Predecessor:** HF-340 (Vialuce font scheme + diamond-logo parity with Bliss). This HF corrects two residual quality gaps HF-340 left: the logo **lockup** (undersized / misaligned mark) and a still-visible **font difference** between Bliss and Vialuce.
**Channel:** SR-44 — architect browser-verifies and merges. CC does NOT merge.

---

## §0 — Standing Rules
- `CC_STANDING_ARCHITECTURE_RULES.md` governs this directive.
- Commit + push after every change.
- Git from repo root (`~/spm-platform`), NOT `web/`.
- After changes: kill dev server → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before writing the completion report.
- Anti-Pattern Registry checked before build.
- Final step: `gh pr create --base main --head hf-342-vialuce-logo-lockup-font-parity`.

---

## §1 — Objective
Two corrections to the Vialuce theme (`[data-theme="vialuce"]`), both quality gaps left by HF-340:

1. **Logo lockup.** The diamond mark renders **undersized** and is **not aligned** with the "Vialuce" wordmark — the lockup looks unplaced and unsized. Enlarge the mark and align it optically with the wordmark to form a deliberate, well-proportioned lockup, properly spaced in the nav header. The **Bliss theme's lockup is the quality reference.**
2. **Residual font parity.** A visible font difference between Bliss and Vialuce **persists despite HF-340.** Identify the exact residual delta and close it so Vialuce matches Bliss.

**Visual target:** under Vialuce, the nav lockup reads as intentional (mark sized and aligned to the wordmark, as in Bliss), and every text element renders in the same font / weight / spacing as the corresponding Bliss element.

---

## §2 — Reference (establish from the live repo; do not assume)
- Theme tokens: `web/src/app/globals.css` (font tokens per HF-307 / HF-340). Bliss families: Urbanist (headings), Inter (body), DM Mono (eyebrow / mono).
- The diamond mark + wordmark lockup lives in the nav header; HF-340 pointed the Vialuce branch at the Bliss diamond asset. The **sizing and alignment** of that asset within the Vialuce header is what is wrong — the asset swap landed, the lockup geometry did not.

---

## §3 — Constraints (invariants — a breach is out-of-scope, not a feature)
- **Font: token-layer or override-removal only.** Close the delta by correcting the token or removing the element-level declaration that overrides it. PROHIBITED: `!important`, per-component font patches, a parallel/duplicate font system.
- **Logo: lockup markup + sizing only, reuse the existing asset.** Adjust the mark's rendered size and the lockup alignment / spacing in the Vialuce nav header (and/or the shared logo component's size props). PROHIBITED: new or duplicate logo asset / component.
- **Bliss and Dark/current are immutable.** Zero change to `[data-theme="bliss"]` and `[data-theme="current"]`/`[data-theme="dark"]`.
- **Vialuce non-type / non-logo surfaces are immutable.**
- **Experience-only.** No engine surface. No SQL. SR-39 does not fire (no auth/RLS/session/schema).
- **Architecture Decision Gate.** Before implementing, record in the completion report the exact token/markup edits and confirm each sits inside this envelope.

---

## §4 — Proof Gates (evidentiary — paste code / diff / computed values; no PASS/FAIL self-attestation)
- **G0 — Diagnostic (READ-ONLY, no code change).**
  - *Font:* for a matched set — the **"Vialuce" wordmark**, one page heading (e.g. "Intelligence Stream"), one body paragraph, one eyebrow / section label — paste the computed `font-family`, `font-weight`, and `letter-spacing` under `[data-theme="bliss"]` vs `[data-theme="vialuce"]`. State the exact delta(s). Paste the governing token declarations and any element-level font classes overriding them.
  - *Logo:* paste the Vialuce nav-header lockup markup — the mark's rendered width/height, the wordmark's font-size, and the container alignment (flex `align-items`, `gap`) — and the Bliss equivalent. State why the mark renders small / misaligned.
- **G1 — Font delta closed.** Re-paste the matched-element computed `font-family` / `font-weight` / `letter-spacing` under both themes — now identical.
- **G2 — Wordmark parity.** The "Vialuce" wordmark renders in the same font / weight / spacing as the Bliss wordmark. Paste its computed style under both themes. (This is the most probable source of the residual difference.)
- **G3 — Logo lockup.** Paste the corrected nav-header markup: the mark's new rendered size and the alignment / spacing. Confirm reuse of the existing asset (no new file) via `git diff --stat`.
- **G4 — Bliss untouched.** `git diff` proving zero change to Bliss tokens, the Bliss logo branch, and the Bliss lockup.
- **G5 — Dark/current untouched.**
- **G6 — Build + dev.** `tsc --noEmit` clean; `rm -rf .next && npm run build` exit-0; `npm run dev` → `localhost:3000` responds. Paste tails.

**Architect-gated (SR-44 — do NOT self-attest, do NOT merge):** browser confirmation that the Vialuce lockup reads as deliberate (mark enlarged and aligned to the wordmark) and that text matches Bliss font / weight / spacing, with Bliss + Dark visually unchanged. Open the PR and stop for architect verification + merge.

---

## §4A — HALT Conditions (PREMISE FAILURES ONLY — surface verbatim, await architect disposition)
- **No font delta.** G0 shows fonts already identical under both themes → report; do not manufacture a change.
- **Font fails to load.** The residual difference is caused by Urbanist / Inter / DM Mono failing to load on the Vialuce render path (silent fallback), not a token mismatch → different fix class; surface it.
- **Shared-markup collision.** Correcting the lockup would require mutating Bliss/Dark shared markup → stop.
- **Malformed asset.** The diamond asset's intrinsic viewBox prevents clean scaling (the mark cannot be enlarged without distortion) → surface; an asset-level fix may exceed this HF.

---

## §5 — Reporting Discipline
- Completion report: `docs/completion-reports/HF-342_COMPLETION_REPORT.md` (NOT repo root).
- Contents: ADR (§3), G0 diagnostic (the exact deltas found), G1–G6 evidence, commit table (SHAs), Anti-Pattern Registry confirmation.
- Then:

```bash
cd ~/spm-platform && rm -rf .next && npm run build && npm run dev
git add -A && git commit -m "HF-342: completion report" && git push origin hf-342-vialuce-logo-lockup-font-parity
gh pr create --base main --head hf-342-vialuce-logo-lockup-font-parity \
  --title "HF-342 — Vialuce theme: logo lockup + residual font parity with Bliss" \
  --body "Corrects two HF-340 residuals under [data-theme=vialuce]: (1) enlarges the diamond mark and aligns it with the Vialuce wordmark into a deliberate lockup (Bliss as reference), reusing the existing asset; (2) closes the remaining font delta vs Bliss at the token layer, including the wordmark. No per-component overrides, no new asset/component. Bliss + Dark unchanged (G4/G5). Experience-only. Proof gates G0-G6. HALT for architect browser verification + merge."
```

---

## §6 — Out of Scope
Bliss theme · Dark/current theme · Vialuce palette / colors / spacing / layout / components beyond the nav lockup · marketing / public site · auth/RLS/session/schema · any engine surface · the logo asset's intrinsic artwork (only its sizing and placement).

## §6A — Residuals
- If the wordmark is an image / SVG rather than live text, note it — font parity then applies only to non-wordmark text, and the wordmark becomes an asset-consistency check instead.
- Favicon / loading-spinner / email-template logo surfaces, if inconsistent — log as follow-on, not this HF.
