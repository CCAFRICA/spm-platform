# HF-327 — Theme Health Inventory

**The reusable governance baseline for Vialuce token compliance (Rule 30).** Re-run the grep patterns below against any new UI to audit token compliance. This is the theme equivalent of SCHEMA_REFERENCE_LIVE.md — always consulted, never assumed.

**Date:** 2026-06-21 · **Branch:** `hf-327-theme-sweep` · **Method:** ripgrep audit of `web/src` (excl. `__tests__`, `node_modules`, `.next`) + per-file context triage.

## Architecture (why only inline styles + style constants are genuine bugs)
The HF-316/HF-317 global CSS **safety net** (`globals.css`, `html[data-theme="vialuce"]` block) **retargets Tailwind utility CLASSES** (`bg-zinc-*`, `bg-slate-*/gray-*/neutral-* 600-950`, `text-zinc-*`, `border-zinc-*`, `dark:` classes, and the HF-317 **opacity-modifier** variants `bg-zinc-900/50` → `var(--vl-surface)` at `globals.css:944`). So **class-based greys are already handled under Vialuce.** The genuine residual bugs are:
- **Category 1 — inline `style={{}}` rgba/hex** (bypasses the class net).
- **Category 4 — named `*_STYLE` constants** with hardcoded colors (bypass the net).

The fix pattern (HF-319/HF-324): make the inline style `useIsVialuce`-aware — `isVialuce ? { background: 'var(--vl-surface)' } : ORIGINAL` — keeping the **Dark/Bliss else-branch byte-identical** (HALT-4). **Never** replace a hardcoded grey with a hardcoded Vialuce hex.

## Verified Vialuce token vocabulary (`globals.css` `data-theme="vialuce"` block)
| Token | Value | Use |
|---|---|---|
| `--vl-surface` | `#FFFFFF` | card/panel background (**not** `--vl-surface-primary` — fictional) |
| `--vl-bg` | `#F4F5FB` | recessed/page background |
| `--vl-line` | `#E8EAF3` | hairline / border |
| `--vl-line-soft` | `#F0F1F8` | soft divider |
| `--vl-text` / `--vl-text-muted` / `--vl-text-soft` | `#1A1A2E` / `#5B637C` / `#8A90A6` | text tiers |
| `--vl-kpi-accent` / `--vl-cta-signal` | indigo `#4446B8` / gold `#E8A838` | accent / CTA |
| `--vl-success` / `--vl-danger` | `#15936A` / `#DC5454` | status |

## TOTALS
- Cat-1 inline dark rgba/hex grep hits: ~170 lines across ~42 files. Most are **already-correct** (`isVialuce` else-branches, `var(--strag-*)` retargeted, class-net-caught) or **data-driven (R-12)** / **pre-auth (no theme context)**.
- **Genuine user-facing bugs FIXED this HF: 4 files** (F1–F4).
- **Genuine VL-admin-internal cluster DOCUMENTED (deferred): Observatory tabs** (same card pattern).
- **Dispositioned as not-a-bug:** pre-auth pages, canvas data-viz, data-driven palettes, `var()` fallbacks.

## GENUINE BUGS — FIXED (F1–F4, user-facing)
| # | File:line | Current value | Renders | Token | Persona/route |
|---|---|---|---|---|---|
| F1 | `components/operate/OperateSelector.tsx:54,64` | `background:'rgba(9,9,11,0.5)'` + `borderBottom:'1px solid rgba(39,39,42,0.6)'` | selector bar (every Operate page) | `var(--vl-surface)` / `var(--vl-line)` | All / `/operate*` |
| F2 (PG-2) | `components/platform/ModelConfigTab.tsx:96` | `background:'rgba(30,41,59,0.5)'` | task rows (2 sections) | `var(--vl-surface)` | VL Admin / Observatory→Model Config |
| F3 | `components/agents/AgentInbox.tsx:50,67,118,119` | borders `#1E293B`, read-item bg `#0B1120` | agent intelligence cards | `var(--vl-line)` / `var(--vl-bg)` | All / `/perform` |
| F4 | `components/layout/PersonaLayout.tsx:34` | `PERSONA_GRADIENTS[...]` near-black gradient | page wrapper | `var(--vl-bg)` | Manager/Rep / `/perform` |

**PG-1 (`/financial/leakage` location ranking cards): NOT A BUG** — `bg-zinc-900/50` is a Tailwind class already retargeted to `var(--vl-surface)` by the HF-317 opacity-modifier net (`globals.css:944`). No fix — adding one would be a redundant no-op.

## GENUINE BUGS — DEFERRED (Observatory VL-admin cluster)
Same uniform card pattern as HF-324's `CARD_STYLE`: ungated inline `background:'rgba(24,24,27,0.8)', border:'1px solid rgba(39,39,42,0.6)'` on card wrappers. VL-admin-only Observatory tabs (lower demo-priority than customer surfaces). Fix = the F1 pattern per file (add `useIsVialuce`; `rgba(24,24,27,0.8)`→`var(--vl-surface)`, `rgba(39,39,42,0.6)`→`var(--vl-line)`; **do NOT** touch the data-driven status colors `rgba(16,185,129,…)`/`rgba(239,68,68,…)` — R-12).
| File | grep hits (card bg + status) | Genuine card-bg bugs |
|---|---|---|
| `components/platform/InfrastructureTab.tsx` | 13 | `:87, :196` (+ more rounded-2xl cards) |
| `components/platform/IngestionTab.tsx` | 8 | card wrappers |
| `components/platform/ObservatoryTab.tsx` | 6 | card wrappers |
| `components/platform/BillingUsageTab.tsx` | 5 | card wrappers |
| `components/platform/FeatureFlagsTab.tsx` | 2 | card wrappers |
| `components/platform/AIIntelligenceTab.tsx` | 2 | card wrappers |
→ A focused **Observatory theme pass** (one PR) applies F1 to these 6 files. Tracked here as the governance follow-up.

## NOT A BUG — dispositioned
- **Pre-auth pages** (`app/login`, `app/signup`, `app/upgrade`, `app/global-error`): render **before any tenant/theme context** (no `useTenant`/`useIsVialuce` — Vialuce only applies post-login). Their dark styling is intentional; out of theme scope.
- **Canvas / react-flow** (`components/canvas/**`: EntityDetailPanel, NewRelationshipPanel, ImpactPreviewPanel, nodes/edges, CanvasToolbar/Legend): the organizational canvas is a specialized data-visualization surface (react-flow); node/edge colors are data-driven and/or library-themed (**R-11 third-party / R-12 data-driven**).
- **Data-driven palettes** (`components/insights/ComponentBars.tsx` `SHADES`, status-indicator rgbas): intentional, not token-based (**R-12**).
- **`var()` fallbacks** (`components/financial/ChequeList.tsx` `var(--vl-surface, rgba(...))`): the rgba is the CSS-var fallback that resolves to the token under Vialuce — **correct**.
- **`*_STYLE` constants already isVialuce-aware**: `operate/reconciliation/page.tsx` `CARD_STYLE` (HF-324 `cardStyle` ternary), `dashboards/AdminDashboard.tsx` + `RepDashboard.tsx` (`VL_*_STYLE` Vialuce variants present) — correct.

## Re-audit commands (Rule 30 governance)
```bash
# Cat-1 candidate genuine bugs: inline dark rgba/hex in files NOT importing useIsVialuce
rg -l "rgba\(\s*(0|1|2|3)[0-9]?\s*," web/src --glob '*.tsx' -g '!**/__tests__/**' | \
  xargs -I{} sh -c 'rg -q useIsVialuce "{}" || echo "{}"'
# Cat-4 named style constants with hardcoded colors
rg -n "(CARD_STYLE|PANEL_STYLE|HERO_STYLE|_STYLE)\s*=\s*\{" web/src --glob '*.tsx'
```
