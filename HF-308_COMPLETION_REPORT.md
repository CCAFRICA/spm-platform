# HF-308 — Visual Straggler Remediation — Completion Report

**Date:** 2026-06-18 · **Branch:** `dev` · **HEAD:** `de6b61d4` · **PR:** #541 (`dev`→`main`, no new PR per §5A).
**Status:** BUILT — `next build` exit-0, `tsc` clean. **Zero current-theme regression** (every mechanism is current-safe by construction — see G6).

## Mechanisms (all current-safe by construction)
1. **`bliss:` Tailwind variant** (`&:is([data-theme="bliss"] *)`) — bliss-only utilities; `current` never sees them.
2. **Theme-aware straggler vars** (`--strag-*`) — inline dark-hex backgrounds → vars whose `current` value is the EXACT original hex and `bliss` value is light. Byte-safe at current, light under bliss.
3. **Bliss-scoped CSS overrides** on light-context utility classes — only apply under `[data-theme="bliss"]`.

## G1 — Page-specific dark surfaces ✓
Directive's named Cat-1 (6) + the larger tail the G4 walk surfaced (§1: "anything dark not Observatory-admin is in scope"):
| Surface | Original | Replacement |
|---|---|---|
| `upgrade/page.tsx` (4) | inline `#020617`/`#0F172A` | `var(--strag-deep)` / `var(--strag-panel)` |
| root `page.tsx` (1) | inline `#020617` | `var(--strag-deep)` |
| `operate/reconciliation` back/action btns | `#7c3aed` | `var(--strag-violet)` (indigo under bliss) |
| `insights`/`acceleration`/`data` page gradients | `dark:from-slate-950 …` | **already light under bliss via HF-305** (not real stragglers) |
| **Tail (G4):** `financial/{location,server,products,patterns,leakage,timeline}`, `operate/{lifecycle,briefing}`, `canvas/{OrganizationalCanvas,panels/EntityDetail,NewRelationship,ImpactPreview}`, `agents/AgentInbox`, `dashboards/WelcomeCard`, `signup` | inline `#0f172a`/`#0a0e1a`/`#18181b`/`#1e293b`/`#27272a`/`#3f3f46` backgrounds + `#3f3f46`/`#7c3aed` button-state ternaries | `var(--strag-panel/-app/-z9/-s8/-z8/-z7/-violet)` |

**G4 final:** `0` dark-surface inline-hex backgrounds remain on tenant-facing pages (excl login/admin/observatory). Status hexes (`#34d399`, `#059669`, `#2d2f8f` indigo brand) correctly left untouched.

## G2 — text-white classified (94 tenant-facing; 7-agent workflow)
| Disposition | Count | Notes |
|---|---|---|
| **Converted** (`+ bliss:text-foreground`) | **2** | body text: `perform/page.tsx` h1; `PeriodRibbon` active label (on `bg-violet-600/20` translucent tint) |
| **Kept** `text-white` | **90** | button/badge/status labels on colored backgrounds — correct white in BOTH themes |
| **Deferred (ambiguous)** | **1** | `test-ds` page-root on a dynamic, non-bliss-aware persona gradient (HALT-2) |
| **Deferred (login, §6)** | **1** | login page → HF-309 |
| Sum | **94** | (+16 admin/platform occurrences out of scope, §6) |
Finding: `text-white` is overwhelmingly correct-as-is (button/badge labels); the HF-305 "109 body-text" concern was largely a false alarm. Conversions are additive `bliss:` only → zero current risk.

## G3 — Light-context inversions resolved ✓ (bliss-scoped overrides)
| Class | Count | Override under bliss |
|---|---|---|
| `bg-slate-100`, `bg-gray-100` | 29 + 13 | `oklch(var(--secondary))` (indigo-soft, light) |
| `bg-slate-200` | 15 | `oklch(var(--muted))` |
| `text-slate-900` | 22 | `oklch(var(--foreground))` (ink) — also overrides `dark:text-white` pairs |
| `text-slate-700` | 30 | `oklch(var(--muted-foreground))` |
| `from-slate-50`/`to-slate-100` gradients | 18 + 18 | **not stragglers** — paired with `dark:from-slate-950`, already invert to light via HF-305 |
All 109 light-context class occurrences resolve correctly under bliss; current untouched (overrides are `[data-theme="bliss"]`-scoped).

## G4 — Full bliss walk (final honest inventory)
Tenant-facing: **0** dark-surface inline-hex backgrounds remain. Remaining (all out of scope or correct-as-is):
- **§6 deferred:** Observatory/admin (1,211 inline hex + 16 text-white), login page, `bg-white/5`/`bg-black/50` decoratives.
- **Correct-as-is:** dark hexes used as TEXT color on light surfaces (e.g. `ChromeSidebar` `#3f3f46`/`#71717a` — dark text reads fine on light; not flipped); `ManagerDashboard` `#18181b` text on a colored severity badge.
- **Deferred (1):** `test-ds` page-root on a dynamic persona gradient (HALT-2).
- **Third-party:** shadcn Dialog/Popover/DropdownMenu internals — surface during browser SR (architect).

## G5 — Build clean ✓
`tsc --noEmit` exit 0; `npm run build` exit 0 (every batch). One mid-pass tooling slip (a multi-line perl arg broke the first sweep) — caught and redone with a clean single-line pass; no broken commit.

## G6 — Current unchanged ✓
Every mechanism is current-safe by construction: `--strag-*` current values = the EXACT original hexes (verified); the `bliss:` variant and the Cat-3 CSS overrides apply only under `[data-theme="bliss"]`; the 2 text-white conversions are additive `bliss:text-foreground`. No `[data-theme="current"]` rule, the shadcn pipeline, or any current literal changed.

## Commit table
| Batch | SHA | What |
|---|---|---|
| 1 | `2d5f971c` | `bliss:` variant + Cat-1 inline-hex (upgrade/root/reconcile) + Cat-3 light-context overrides |
| 2 | `e1b8f4bc` | Cat-2 text-white (workflow: 2 converted / 90 kept / 1 deferred) |
| 3 | `de6b61d4` | G4 tail: financial/canvas/agents/etc. inline-hex backgrounds + button-state ternaries |
| report | (this) | HF-308 report |

## Confirmations
Both-theme-safe · zero current regression · no Observatory (§6) · no layout/structure changes (color/text only) · no schema/DB · no auth/RLS · marketing untouched.

## Residuals
- Login + Observatory + admin text-white (§6, → HF-309 / standalone).
- `test-ds` dynamic persona-gradient text-white (1, HALT-2).
- Dark hexes used as text-color (correct-as-is on light; not flipped).
- Per-component pixel polish (spacing/shadow/radius) — refinement-level, post-SR.

---

*HF-308 · Visual straggler remediation · 2026-06-18 · vialuce.ai · Cat 1/2/3 + G4 tail remediated current-safe; tenant-facing dark inline-hex backgrounds = 0.*
