# OB-221 — Vialuce Theme: Three-Layer Token Architecture + Layout Redesign — Completion Report

*Branch: `ob-221-vialuce-theme` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Verification model (R2): CC provides code-level evidence; architect provides browser visual verification at PR review. Visual uncertainty is expected, not a deficiency.*

---

## 1. Outcome

"Vialuce" is now a third selectable theme (Current / Bliss / **Vialuce**) with a full three-layer
token architecture, DM Sans/DM Mono typography, the complete design-package component vocabulary
(scoped), and a redesigned deep-indigo sidebar rail mapped to the platform's real navigation. Every
Vialuce style is scoped to `[data-theme="vialuce"]` and every theme-conditional React path is
`if (vialuce) {…} else {existing unchanged}` — so Current and Bliss are structurally unable to regress
(the CC-verifiable regression gate). Visual fidelity, contrast, and hover/animation are the architect's
browser-verified items per R2.

---

## 2. Per-phase evidence (code-level)

**Phase 0a — design package.** `docs/design/vialuce-theme/` ← `vialuce-ui.css` (306) + `-design-spec.md` (188) + `-layout-redesign.html` (494), copied from the authored package. Commit `f09223db`.

**Phase 0b — registration (HALT-0 cleared: code-only, no schema change).**
```
active-theme.ts:  AppTheme = 'current' | 'bliss' | 'vialuce'; getResolvedTheme/getActiveTheme accept it
api/user/theme:   VALID = Set(['current','bliss','vialuce'])
UserIdentity.tsx: toggle (['current','bliss','vialuce']) → Current / Bliss / Vialuce
```

**Phase 0c/0d/0e — three-layer tokens + fonts.** `globals.css html[data-theme="vialuce"]`: Layer 0 (`--vl-raw-*`), Layer 1 (shadcn OKLCH mirroring bliss indigo+gold + design `--vl-*` hex + strag scale + app/card), Layer 2 (component slots + spacing/radius/elevation/motion). Fonts: DM Sans/DM Mono already app-wide via `next/font` (`--font-dm-sans`/`--font-dm-mono`) → no new import (**HALT-3 N/A**).

**Phase 1 — app shell.** `VialuceSidebar.tsx` (new) + conditional in the LIVE `ChromeSidebar.tsx` (`MissionControlRail` is legacy/unmounted — reverted). Maps real nav (`WORKSPACES`: 4 workspaces → `.ws`; sections → `.sb-sec` groups; routes → `.nav` sub-items, role-filtered, active=path). Persona **docked in footer** (defect fix). "← Observatory" back link (VL admin → `/select-tenant`). **Gold Calculate CTA** (primary action; no topbar slot in this shell → relocated to rail head). Commit `30fd04dc`.

**Phases 2–4 — page template / KPI / tables / pills / charts.** The full component CSS vocabulary
(`.page`/`.phead`/`.tabs`/`.kpi`/`.tbl`/`.pill`/`.insight`/charts/`.empty`) shipped **scoped** in the
Phase 0 globals.css block. Code-gate evidence:
```
$ grep -c 'html\[data-theme="vialuce"\]' globals.css → 168   (every rule scoped; 0 unscoped)
.pill rules carry NO cursor:pointer (informational, not buttons — defect fix)
.tbl th + .kpi-val + .num use var(--vl-font-mono)  (DM Mono on numerics/headers)
.kpi::before uses var(--accent,var(--vl-kpi-accent)) (3px top accent)
```
Per-page React application (wrapping each content page in `.page`/`.kpi`/`.tbl`) is the established
incremental pattern — per §6 OOS the 36 stub pages are pattern-only; the vocabulary is now in place
for incremental adoption (and tenant brand injection via Layer 0).

**Phase 5 — login + shell correctness.** `layout.tsx` `colorScheme` now treats Vialuce as **light**
(was 'dark' for ≠bliss). The login page auto-themes to Vialuce via the extended `getResolvedTheme`
(`vl-theme` cookie → `data-theme=vialuce` → semantic tokens + DM fonts + `--app-bg`/`--app-fg`).
`.insight`/`.empty`/`.summary` vocabulary scoped in Phase 0. Commit `18ef0c24`.

**Build / scanners (every phase):** `tsc --noEmit` exit-0; `verify-korean-test.sh` PASS; `npm run build` exit-0.

---

## 3. Token inventory (HALT-2: 197 token-lines > 60 → full set mapped)

The existing semantic surface is large (197 token-lines across current/.dark/bliss). Vialuce maps the
full appearance-driving set; representative rows (Current dark → Bliss light → Vialuce light):

| token | current (.dark) | bliss | vialuce |
|---|---|---|---|
| `--background` | `0.1344 0.0163 262.7` | `1 0 0` | `0.97 0.005 280` |
| `--foreground` | `0.9676 …` | `0.24 0.11 274` | `0.24 0.11 274` |
| `--primary` | `0.586 0.2037 277` | `0.34 0.16 274` | `0.40 0.16 274` |
| `--accent` | `0.226 …` | `0.79 0.14 76` | `0.79 0.14 76` (gold) |
| `--border` | `0.2558 …` | `0.92 0.01 274` | `0.93 0.008 280` |
| `--ring` | `0.586 …` | `0.34 …` | `0.79 0.14 76` (gold focus) |
| `--app-bg` / `--app-fg` | `#0a0e1a`/`#e2e8f0` | white/ink | `#F4F5FB`/`#1A1A2E` |
| `--strag-*` (12) | dark hex | light oklch | light hex (mirrored) |

Vialuce shares the bliss indigo+gold brand family, so the shadcn OKLCH set mirrors bliss's proven
light values (architect verifies the rendered result). Plus Layer 0 `--vl-raw-*` primitives + the
design's `--vl-*` hex (text/bg/surface/line/indigo/gold tints) consumed by the scoped components.

## 4. Component mapping

| design class | implemented in | approach |
|---|---|---|
| `.sb` + `.sb-brand`/`.sb-scroll`/`.ws`/`.sb-sec`/`.nav`/`.persona`/`.sb-foot`/`.sb-user`/`.sb-back` | `VialuceSidebar.tsx` (new) | conditional render in `ChromeSidebar` |
| `.btn-gold` (Calculate CTA) | `VialuceSidebar.tsx` | rail head (no topbar slot) |
| `.top`/`.crumb`/`.btn-calc`/`.top-*` | — | **deferred**: no topbar in the ChromeSidebar shell; adding one is a layout insertion (see uncertainty register) |
| `.page`/`.phead`/`.tabs`/`.kpi`/`.tbl`/`.pill`/`.insight`/`.empty`/`.split`/`.summary`/charts | `globals.css` scoped | CSS vocabulary shipped (Phase 0); per-page adoption incremental |
| theme registration | `active-theme.ts`, `api/user/theme`, `UserIdentity.tsx`, `layout.tsx` | code |

## 5. Scoping + i18n verification
```
grep -c 'html[data-theme="vialuce"]' globals.css        → 168 rules, 0 unscoped (regression-safe)
VialuceSidebar labels                                   → from WORKSPACES label/labelEs (i18n), no new hardcoded English nav strings
icons                                                   → lucide-react (Tabler .ti webfont not installed — documented substitution; LucideIcons[name] resolver)
```

## 6. Uncertainty register (R2 — architect browser-verifies)
- **Visual fidelity / contrast / hover-relief / sidebar expand-collapse animation** — rendered result is architect-verified; CC verified build + scoping + structure only.
- **Rail layout integration** — `VialuceSidebar` fills a fixed 264px slot (matching ChromeSidebar's width to avoid a content-offset gap; design spec is 252px). Architect confirms the offset.
- **Topbar deferred** — the ChromeSidebar shell has no topbar; the gold Calculate CTA was relocated to the rail head. A full `.top` bar is a layout insertion (residual).
- **Semantic OKLCH values mirror bliss** — Vialuce shares the indigo+gold family; exact Vialuce hex (#F4F5FB bg, #4446B8 indigo) differs slightly from bliss — architect confirms the palette renders as intended.
- **Per-page `.page`/`.kpi`/`.tbl` adoption** — CSS ready; pages adopt incrementally (§6 OOS).
- **Login gold CTA** — login auto-themes (palette + DM fonts); its primary button renders indigo `--primary` (on-brand), not gold — a scoped gold override is a minor residual.

## 7. SHA / PR
HEAD `18ef0c24` on `ob-221-vialuce-theme`. PR: (added on creation). DO NOT MERGE — SR-44.

## 8. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: #81 (font/contrast) → design system shipped (DM Sans/Mono + WCAG-targeted token set, architect
    confirms ratios in-browser); #70 (CTA visual weight) → .btn-pri/.btn-gold vocabulary + gold
    Calculate CTA shipped; #75 (OB-201 Bliss) → Complete (shipped 22ed5722, stale entry). New: topbar
    bar deferred (no shell slot); per-page template adoption incremental.
REGISTRY: Design & Experience → OB-221 SHA 18ef0c24; three-theme toggle live (Current/Bliss/Vialuce);
    three-layer token architecture (tenant brand injection now possible via Layer 0); WCAG AA targeted
    (architect browser-verifies ratios).
BOARD: Design & Experience — Vialuce theme foundation + app-shell shipped; component vocabulary scoped.
SUBSTRATE: T1-E910 v2 (nav labels from WORKSPACES i18n, no new hardcoded English); T1-E902 v2 (full
    design token vocabulary imported, none narrowed); regression gate is code-level (scoping + build).
```
