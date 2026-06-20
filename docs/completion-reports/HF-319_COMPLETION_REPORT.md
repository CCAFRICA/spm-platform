# HF-319 Completion Report — Vialuce Gray Surfaces: Diagnostic Root-Cause Fix

**Date:** 2026-06-20 · **Branch:** `hf-319-vialuce-gray-diagnosis` · **Implementation SHA:** `030625f7`
**Status:** Built, tsc clean, `next build` exit-0 (198/198), Korean-Test PASS, adversarial review (initial 1 FAIL → fixed → clean). **NOT merged** (SR-44).

---

## 1. DIAGNOSIS TABLE (the deliverable — traced to exact CSS cause BEFORE any fix)

Phase 1 traced each specific surface's computed style to the specific CSS rule that produces it — no grep-and-remap. Result: **two distinct root causes**, plus two of the named surfaces were already fixed.

| Surface | Component file:line | Exact class/style | CSS cause | Fix type |
|---|---|---|---|---|
| **A** `/perform` Admin KPI cards ($49,911 / 85 / …) | `perform/page.tsx:336` (HeroMetricsRow, **no JS branch**) | `bg-zinc-800/50` (Tailwind opacity utility) | Caught by the HF-317 opacity-modifier net (`globals.css:929`) → `--vl-surface` #FFFFFF. **Already white** | none — verify (premise stale) |
| **B** `/perform` Admin section cards (Distribution, Lifecycle, Locations…) | `AdminDashboard.tsx:116,481…` | inline `VL_CARD_STYLE` via `isVialuce ? VL_CARD_STYLE : CARD_STYLE` | `var(--vl-surface)` #FFFFFF (existing JS branch). **Already white** | none — verify |
| **ROOT CAUSE (the keystone 5 passes missed)** — shadcn semantic surfaces on **every** page (Cards, Badges, muted panels, borders) | 64 files use `bg-muted`, 21 use `border-border`/`bg-background` | `bg-muted` / `bg-secondary` / `bg-background` / `border-border` / `border-input` | These resolve **straight to `oklch(var(--token))`** and are **NOT reachable by the utility-class net** (which only targets `bg-zinc/slate/gray` neutral palettes). Under vialuce their values were **desaturated cool-gray** (`--muted 0.95 .008 280`, `--border/--input 0.93 .008 280`, `--background 0.97 .005 280`) | **Token-value fix (global)** |
| **C** `/operate/results` hero cards (Total Payout indigo, Distribution, Assessment) | `results/page.tsx:577,603,634` (+2 more, **no JS branch**) | inline `rgba(24,24,27,.8)` / indigo gradient | **Inline styles bypass the CSS net entirely** → render dark under Vialuce | **Component conversion** (`useIsVialuce` → white `.card`) |
| **D** "Operations Center" sidebar item | `workspace-config.ts:94`; rendered by `VialuceSidebar.tsx:159` | WORKSPACES route `/operate/lifecycle`, **not theme-aware** (both sidebars read WORKSPACES) | OB-226 absorbed it into the `/operate` cockpit; the item just redirects back | **VialuceSidebar filter** (Vialuce-scoped) |

**Why 5 prior remap passes never converged:** they extended a CSS utility-class net (`bg-zinc/slate/gray…`). But two whole categories are structurally unreachable by *any* utility-class CSS: (1) the **shadcn semantic tokens** (`bg-muted`/`bg-secondary`/`border-border` → `oklch(var(--token))` — fixed only by changing the token *value*), and (2) **inline styles** (`style={{ background: 'rgba(…)' }}` — highest specificity, fixable only at the component with `useIsVialuce`). HF-318's `.bg-muted` rule was a **no-op** (it re-assigned `bg-muted` to the same `oklch(var(--muted))` it already had).

---

## 2. Phase 2 — structural fixes (HALT-2: semantic-token blast radius)

**Token fix (the keystone) — `globals.css` `html[data-theme="vialuce"]` block.** A token-value edit is GLOBAL: because `tailwind.config.ts` emits these classes as `oklch(var(--token)/<alpha>)`, one change re-colors *every* consumer (64+ files). Scoped to the vialuce block only — Dark/Bliss/current token blocks are separate and untouched (adversarially confirmed).

| Token | Before (OKLCH → hex) | After (OKLCH → hex) |
|---|---|---|
| `--muted` | `0.95 0.008 280` → **#EAEBEE gray** | `0.9594 0.0094 279.7` → **#F0F1F8** (`--vl-line-soft`) |
| `--background` | `0.97 0.005 280` → #F4F4F7 cool-gray | `0.9711 0.0081 278.6` → **#F4F5FB** (`--vl-bg`) |
| `--border` | `0.93 0.008 280` → **#E6E6EB gray** | `0.9381 0.0123 276.1` → **#E8EAF3** (`--vl-line`) |
| `--input` | `0.93 0.008 280` → #E6E6EB gray | `0.9381 0.0123 276.1` → #E8EAF3 |

Unchanged: `--card`/`--popover` (`1 0 0` = #FFFFFF, already correct), `--accent` (gold signal), `--secondary` (already indigo-tinted). `--muted-foreground` (L 0.50) on the new `--muted` (L 0.96) = strong contrast.

**Surface C** — `results/page.tsx`: 4 inline dark hero cards → `isVialuce ?` white `.card` (Total Payout keeps an indigo left-accent + DM-Mono indigo number/labels made readable; Distribution + Assessment → white). Else-branches byte-identical.

**Surface D** — `VialuceSidebar.tsx:163`: `.filter(it => it.path !== '/operate/lifecycle')`. VialuceSidebar renders ONLY under `data-theme="vialuce"`, so inherently Vialuce-scoped; ChromeSidebar (Dark/Bliss) keeps Operations Center.

**Surfaces A/B** — verified already-white (premise stale); no change.

## 3. Phase 3 — exhaustive verification (root cause doesn't exist elsewhere)

- **Token category:** the fix is global by construction (every `bg-muted`/`bg-background`/`border-border`/`bg-secondary` consumer under vialuce now lands on the tinted-light values). 64 `bg-muted` files + 21 `border-border`/`bg-background` files fixed at once.
- **Inline-style category (the finite, per-component set):** enumerated every genuinely-unbranched direct inline-dark card (`style={{ background: 'rgba(24,24,27…` ). Fixed all that render under Vialuce on in-scope pages: `results` (×4), `perform` FinancialOnlyPerformance, `reconciliation:838`, `pay:127,140`, `monitor/quality:78`. **Final sweep: ZERO unbranched inline-dark cards remain** across `/operate` (excl. `lifecycle`, which redirects to `/operate` under Vialuce so its dark cards never render) + `/perform` + dashboards.

## 4. Adversarial verification

Independent skeptical review against all gates: token fix correctly scoped to Vialuce only (no Dark/Bliss leak; `--card`/`--popover` untouched; OKLCH plausible; contrast OK); component else-branches byte-for-byte original; Total Payout hero text made readable (no white-on-white); hooks ordered correctly; sidebar filter Vialuce-local. **Initial review caught 1 FAIL** — a missed unbranched dark card at `monitor/quality:78` — which was then fixed; re-sweep confirms zero remaining. tsc clean.

## 5. Residuals (§6A — structural)

- **Inline styles are structurally uncatchable by CSS** (highest specificity; no `@layer`/attribute-selector approach wins). The remap approach **cannot** address them — confirmed. The fix is necessarily per-component `useIsVialuce`. Remaining out-of-scope inline-dark cards: `operate/lifecycle/*` (7 — dead under Vialuce, page redirects), `platform/{Ingestion,Onboarding,Infrastructure}Tab` + `intelligence/RepTrajectory` const/else-values (admin/non-Performance-Calculation surfaces). Enumerable, not grep-discovery — future component conversion if those surfaces enter scope.
- Recharts SVG fills (chart palette) — out of scope.

## Proof gates (CC-verifiable)
Diagnosis table pasted before fixes ✓ · `tsc --noEmit` clean ✓ · `next build` exit-0 (198/198) ✓ · Korean-Test PASS ✓ · root cause verified exhaustively (token grep + inline-dark sweep) ✓ · adversarial verification ✓.

**Architect browser-verifies (SR-44):** `/perform` Admin/Manager/Rep all-white cards · `/operate/results` white `.card` + accents · no Operations Center in VialuceSidebar · Dark/Bliss unchanged.

---

## ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-226 → CLOSED (gray surfaces diagnosed to root cause + fixed structurally)
REGISTRY: Design & Experience → HF-319 SHA 030625f7
SUBSTRATE: SR-34 (diagnostic-first — traced exact CSS cause: shadcn semantic-token VALUES +
  inline styles, the two categories the utility-class net structurally cannot reach — then
  fixed at the token + component level, not another grep-and-remap pass)
```

## PR
`gh pr create --base main --head hf-319-vialuce-gray-diagnosis` — see PR for final push SHA.

---

*HF-319 · CC build complete · awaiting SR-44 architect browser-verify + merge.*
