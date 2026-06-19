# HF-314 — Vialuce Theme: Comprehensive Content Parity + Design Spec Adoption — Completion Report

*Branch: `hf-314-vialuce-content-parity` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Verification model (R2): CC proves code-level; architect proves visual fidelity at PR review.*

---

## 1. CSS parity audit (§3.0) — premise corrected

The directive's §1 premise ("Bliss has comprehensive remaps; Vialuce has an incomplete subset") is
**stale**. Measured against the live `globals.css`:

| | utility remaps (bg/text/border) |
|---|---|
| `[data-theme="bliss"]` | **6** (`bg-slate-100`, `bg-slate-200`, `bg-gray-100`, `text-slate-700`, `text-slate-900`, `bg-black/80` scrim) |
| `[data-theme="vialuce"]` (post-HF-313) | **45** (bg/text/border across zinc/slate/gray/neutral 700–950 + colored-CTA restore) |

Vialuce already **exceeds** Bliss and covers **every** Bliss remap (diff of Bliss→Vialuce selectors:
0 missing). The washed-out report was the **pre-HF-313** state. This phase added the §3.0.4 categories
neither theme covered (divide / ring / placeholder / `hover:bg` dark / dark-neutral gradient stops →
light tokens), so a remapped white card gets light dividers/rings/hovers. **210 scoped rules, 0 unscoped.**
The genuinely-remaining "washed out" was **flatness** (remapped white cards lacked `.card` border/shadow
hierarchy) — addressed by the design-spec adoption in §2 below. Commit `5a052fd1`.

## 2. Theme toggle placement (§3.1)
The `.sb-theme` per-user toggle (HF-313) was persistently visible. Now revealed only behind the
`.sb-user` chevron expansion (`userExpanded` state + `ChevronUp` + rotation CSS); collapsed shows only
persona + user info. Commit `320031e0`.

## 3. Design-spec adoption — route inventory (§3.2/§3.3) — COMPLETE

Every route reachable from VialuceSidebar's `WORKSPACES` config was adopted under the `useIsVialuce()`
conditional (non-Vialuce else-branch byte-identical). Executed via a 7-agent fan-out (one per workspace
sub-group). **46 routes processed; 0 skipped by complexity.** Commit `d0be439f`.

| Workspace | Routes | Applied (per route) |
|---|---|---|
| **decide** | `/stream` | page, phead, pactions, **insight**, empty |
| | `/perform` | page, phead, empty |
| | `/acceleration` | page, phead |
| | `/insights`, `/insights/analytics`, `/insights/performance`, `/insights/compensation`, `/insights/trends`, `/insights/my-team`, `/insights/sales-finance` | page, phead (+pactions/empty per page) |
| **calculate** | `/operate`, `/operate/lifecycle`, `/operate/calculate`, `/operate/results`, `/operate/pay`, `/operate/reconciliation`, `/perform/statements`, `/performance/adjustments`, `/approvals` | page, phead (+pactions/empty per page) |
| **finance** | `/financial` (HF-312) + `/financial/{pulse,timeline,performance,staff,leakage,patterns,products,summary}` | page, phead (+pactions/empty per page) |
| **platform-core** | `/operate/import`, `/operate/import/history`, `/operate/import/quarantine`, `/configure/people`, `/configure/periods`, `/configure/users`, `/configuration/terminology`, `/configuration/locations`, `/admin/access-control`, `/admin/audit`, `/data`, `/data/quality`, `/data/transactions`, `/data/reports`, `/notifications`, `/integrations/catalog`, `/operations/messaging`, `/operations/rollback` | page, phead (+pactions/empty per page) |

**Two pages with reduced treatment (documented, not skips):**
- `/design` — a 6-line **server component** whose body is `redirect('/configure')` (OB-97: design
  workspace eliminated). No JSX/hooks → cannot host `useIsVialuce`/`.page`. Left byte-identical (correct).
- `/configure/users` — a thin wrapper rendering `<UserAdminConsole/>` (a sub-component). Got `.page`
  frame; no `.phead` (the page renders no header itself — the sub-component carries it).

**Adoption pattern (regression-safe):** `const isVialuce = useIsVialuce()`; root → `.page` under
Vialuce else existing; header → `.phead` (real i18n title/subtitle) else existing; inline KPI/table/
status/empty content → `.kpi`/`.tbl`/`.pill`/`.empty` where rendered inline. Content rendered by
imported sub-components is NOT edited — it inherits color parity from the §3.0 remaps.

## 4. Verification
```
files changed: 45 page files (+1851 / -407) + globals.css + VialuceSidebar
tsc --noEmit : exit 0 (project-wide, after all adoption)
npm run build: exit 0
Korean Test  : PASS (agents reused existing isSpanish/useLocale strings — no new hardcoded English)
scoping      : 210 'html[data-theme="vialuce"]' rules, 0 unscoped; 45 pages carry the isVialuce conditional
```

## 5. Adversarial verification (else-branch preservation, gating, i18n, JSX)

5 independent skeptics reviewed the full 45-file `git diff` (one per workspace chunk), checking the
main risks of a parallel multi-file edit. **All 5 chunks: CLEAN, zero issues.**

| Chunk | Verdict |
|---|---|
| decide (10 files) | **clean** |
| calculate (9) | **clean** |
| finance (8) | **clean** |
| platform-a (8) | **clean** |
| platform-b (11) | **clean** |

Confirmed across all files: (1) every `.page`/`.phead`/`.kpi`/`.tbl`/`.pill`/`.empty`/`.insight` is
gated by `isVialuce` (literal-className grep found zero unconditional usages; belt-and-suspenders, the
classes are also CSS-scoped to `[data-theme="vialuce"]`); (2) Dark/Bliss else-branches are
**byte-identical** to the base commit (verified via `git show 320031e0`); (3) i18n — localized files
thread `isSpanish` through new `.phead`/`.empty`; English-only files reuse the original hardcoded
English (permitted); no new hardcoded strings; (4) JSX correct — ternary arms mutually exclusive (no
double-render), `key` props preserved, no unclosed tags; (5) no lost functionality — all
`onClick`/`onValueChange`/`href`/`router.push`/export handlers preserved across the wrap. Only
intentional design-spec choices noted (decorative icons omitted from some `.phead`s; tenant name moved
to `.sub`) — no behavioral impact.

---

## 6. SHA / PR
Commits: directive `16733cb0` · Phase 0 `5a052fd1` · Phase 1 `320031e0` · Phases 2-3 `d0be439f` (+ report).
PR: (added on creation). DO NOT MERGE — SR-44.

## 7. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-222 → CLOSED (content at full Bliss parity + design-spec vocabulary on all reachable routes);
    #81 → Complete (design system on all pages); #70 → Complete (CTA vocabulary on all pages).
    Diagnostic correction: directive §1 premise stale — Vialuce remap coverage already exceeded Bliss
    (45 vs 6); the residual washed-out was FLATNESS, fixed by .page/.phead/.card adoption.
REGISTRY: Design & Experience → HF-314 SHA d0be439f; all 46 reachable routes at design-spec quality.
BOARD: Design & Experience — Vialuce content parity complete; toggle behind profile expansion.
SUBSTRATE: SR-34 (structural — CSS parity + design-class adoption, not 58 band-aids); T1-E910
    (i18n reused, no new hardcoded labels); regression-safe else-branch on every page.
```

## 8. Out of scope / Residuals (§6/§6A)
1. **Sub-component deep adoption** — pages whose KPIs/tables/cards render via imported components
   (SystemHealthCard, KPICard, DataTable, etc.) get color parity from the §3.0 remaps but not the
   `.kpi`/`.tbl` design treatment; converting those sub-components is a follow-on.
2. **Chart library palette** — Recharts may need per-chart color props for the indigo ramp.
3. **Intentionally-dark elements** — code/console panels flip light under the remaps; explicit
   preservation is a follow-on if any are design-intended dark.
4. **`/design`** — redirect-only server component; nothing to adopt.
