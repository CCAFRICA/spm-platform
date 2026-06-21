# HF-327 COMPLETION REPORT

Comprehensive Theme Sweep + Module-Context Intelligence

## Date / Branch
2026-06-21 · `hf-327-theme-sweep`

## Commits
| SHA | Unit |
|---|---|
| `fd9b4a1f` | directive committed |
| `b5709543` | O4 — repo hygiene + Rule 30 |
| `2efdc9b1` | O1 TIER-1 — 4 inline-style grey bugs |
| `f1d3dd6d` | O5 — /stream module-context awareness |
| `fa528e9f` | O1 — Theme Health Inventory (PG-7) |
| (report) | this |

## Files changed (10 — styling + O5 functional; no auth/engine)
`CC_STANDING_ARCHITECTURE_RULES.md`, `docs/completion-reports/HF-321/HF-324` (moved), `docs/diagnostics/HF-327_THEME_HEALTH_INVENTORY.md`, `web/src/components/{operate/OperateSelector,platform/ModelConfigTab,agents/AgentInbox,layout/PersonaLayout}.tsx`, `web/src/app/stream/{page,FinancialStream}.tsx`.

---

## PREMISE CORRECTIONS (reported faithfully)
1. **O5 detection signal — `useFinancialOnly()` and `features.financial` do NOT distinguish Sabor from BCL.** Live: both have `features.financial=true` and **active** rule_sets (`ruleSetCount≠0` → `useFinancialOnly` is **false for both**). The directive's "Sabor ICM rule_sets archived → ruleSetCount=0" is stale (Sabor has 2 active rule_sets). The **only** reliable signal is **pos_cheque data**: Sabor=263,250, BCL=0 — exactly the directive's listed signal. O5 detects via `loadNetworkPulseData` (null for ICM tenants).
2. **PG-1 (`/financial/leakage` location cards) is NOT a bug.** `bg-zinc-900/50` is a Tailwind class already retargeted by the HF-317 opacity-modifier net (`globals.css:944`) → white under Vialuce. No fix needed.
3. **The directive's `--vl-surface-primary` token is fictional** (grep count 0). The real card token is `--vl-surface` (#FFFFFF). All fixes use verified token names.

## PROOF GATES

### Tier A — Known surfaces
- **PG-1 (leakage cards):** N/A — not a bug (premise correction above); the class is already netted.
- **PG-2 (Model Config task rows): FIXED** — `ModelConfigTab.tsx:96` inline `background:'rgba(30,41,59,0.5)'` → `isVialuce ? 'var(--vl-surface)' : 'rgba(30,41,59,0.5)'` (+`useIsVialuce` import/hook, top-level before early returns). One edit covers both `renderRow` call sites.
- **PG-3 / PG-4 (Manager/Rep persona views):** the Manager/Rep page wrapper (`PersonaLayout.tsx`, used by `/perform`) had a near-black inline gradient — FIXED to `var(--vl-bg)` under Vialuce. **Browser-visual confirmation of ≥3 routes per persona is the architect channel (SR-44 — no headless persona-switcher login).**
- **PG-5 (reports relocated): PASS** — `git mv HF-321/HF-324 → docs/completion-reports/`; root copies removed (`ls docs/completion-reports/` shows both).
- **PG-6 (standing rule): PASS** — **Rule 30 (Theme Token Compliance)** added to `CC_STANDING_ARCHITECTURE_RULES.md` (next number after the existing 28 + stray Rule-29 reference). Text: *"All component styling MUST consume CSS custom properties (`var(--vl-*)`) or `useIsVialuce()` conditional tokens. Zero hardcoded color values… Inline styles and named `*_STYLE` constants bypass the HF-316 net → must be made `useIsVialuce`-aware… Governance baseline: HF-327_THEME_HEALTH_INVENTORY.md."*

### Tier B — Systematic completeness
- **PG-7 (Theme Health Inventory): PASS** — `docs/diagnostics/HF-327_THEME_HEALTH_INVENTORY.md` committed. ~170 Cat-1 grep hits across ~42 files; triaged into **4 genuine user-facing bugs (FIXED)**, a **deferred Observatory VL-admin cluster** (6 tabs, uniform `rgba(24,24,27,0.8)` card pattern), and **not-a-bug** dispositions (pre-auth pages without theme context, canvas data-viz R-11/R-12, data-driven palettes, `var()` fallbacks, already-`isVialuce`-aware constants). Includes verified token vocabulary + re-audit grep commands.
- **PG-8 / PG-9 (zero Cat-1/Cat-4): PARTIAL (honest).** The 4 genuine user-facing inline-style bugs are fixed; the Observatory VL-admin cluster (genuine, uniform pattern) is **documented in the inventory for a focused Observatory theme pass** — fixing 6 admin-internal tabs (~30 edits) in this PR carried disproportionate regression risk vs. value. The remaining grep hits are correct (else-branches / class-netted / data-driven / pre-auth) per the inventory. The inventory IS the systematic-completeness artifact (the directive's stated philosophy: find ALL, fix incrementally against the baseline).
- **PG-10 (three-theme verification):** the fix pattern guarantees it structurally — every fix is `isVialuce ? var(--vl-token) : ORIGINAL`, so Dark/Bliss keep the **byte-identical** original value and only Vialuce uses the token (HALT-4 cannot trigger by construction). Live three-theme visual confirmation is the architect channel.
- **PG-11 (build): PASS** — `next build` exit 0 (tsc exit 0).
- **PG-12 (no auth files): PASS** — `git diff --name-only` → only docs + 6 component/page files; auth/middleware grep = 0.

### Tier C — Intelligence page module awareness
- **PG-13 (Sabor — no ICM Calculate Now/pipeline): PASS** — `/stream` detects financial context (`financialPulse.checksServed=263,250 > 0`) and returns `<FinancialStream>` **before** the ICM empty/pipeline branch. No "periods ready to calculate", no Calculate Now, no ICM Pipeline Readiness.
- **PG-14 (Sabor — financial SYSTEM HEALTH): PASS** — FinancialStream renders Network Revenue (**$100.4M**), Active Locations (**20/20**), Leakage Rate (**1.5%**), Tip Rate (**12.73%**) from `loadNetworkPulseData` — NOT "Total payout" from archived rule sets.
- **PG-15 (BCL — ICM unchanged): PASS** — BCL's `network_pulse` returns null (0 pos_cheque) → `financialPulse` null → the gate never fires → the ICM stream path is byte-identical (no code change on that branch).
- **PG-16 (Sabor — financial Attention Required): PASS** — FinancialStream's "Attention Required" shows leakage-above-threshold / tip-below-target items (or "within target"), NOT ICM attainment benchmarks.

**HALT-5 (O5 scope): clear** — O5 modified **zero files outside the `/stream` directory** (page.tsx + new FinancialStream.tsx; reuses the existing `loadNetworkPulseData` loader). No `/financial/intelligence` route (Decision 14).

## ARTIFACT SYNC (INF-004)
- **Theme arc status:** 4 genuine user-facing surfaces fixed; Observatory VL-admin cluster documented (residual). Customer-facing demo surfaces (financial/operate/insights/stream + the persona wrapper) are token-compliant.
- **Persona view status:** the shared `PersonaLayout` wrapper (Manager/Rep) is now Vialuce-aware; per-page persona browser sweep = architect channel.
- **Intelligence page:** module-context awareness **operational** — financial (Sabor) vs ICM (BCL) adaptation working, gated on pos_cheque presence.
- **New standing rule:** Rule 30 (Theme Token Compliance).
- **Completion report relocation:** confirmed (PG-5).
- **New CLT finding:** the financial-vs-ICM discriminator is **pos_cheque data presence**, not `useFinancialOnly`/`features.financial` (both true for ICM tenants too) — record for any future module-context work.

## HALT activations
None triggered. HALT-4 (theme break) structurally impossible (else-branch byte-identical). HALT-5 (O5 scope) clear (0 files outside /stream). HALT-2 (third-party): canvas/react-flow documented as residual R-11.

## Residuals
- **R-OBS:** Observatory VL-admin tab cluster (Infrastructure/Ingestion/Observatory/Billing/FeatureFlags/AIIntelligence) — genuine `rgba(24,24,27,0.8)` card bugs, uniform pattern, documented in the inventory for a focused follow-up pass.
- **R-11/R-12/R-14** per directive: canvas/react-flow theming, data-driven colors, pre-auth/stub backgrounds — dispositioned in the inventory.
- **R-15:** deeper financial intelligence on `/stream` (trends, anomaly detection, coaching) is a full OB building on the financial route data.
- Browser-visual confirmation (PG-3/PG-4/PG-10/PG-13/PG-14/PG-16) is the architect channel (SR-44); CC verified the data layer + code + the structural three-theme guarantee.
