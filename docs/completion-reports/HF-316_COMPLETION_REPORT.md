# HF-316 — Vialuce Exhaustive Dark-Surface Elimination (Two-Prong) — Completion Report

*Branch: `hf-316-vialuce-exhaustive-sweep` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Verification model (R2): CC proves code-level; architect proves visual at PR review.*

---

## 0. Why two prongs (the trace-and-miss pattern, ended)

Five prior HFs scoped by tracing from known surfaces inward; each time dark components outside the trace
surfaced. HF-316 stops tracing: **Prong 1 (CSS safety net) is exhaustive by UTILITY FAMILY, not by
trace** — so no component can hide a dark surface. Prong 2 raises polish. If Prong 2 misses a component,
Prong 1 still catches it → the user never sees a dark card.

## 1. Prong 1 — CSS safety net (the floor). Commit `36c319bd`.

Data-driven from a full `web/` inventory (grep counts of every dark utility). Current coverage extended
to **every dark family found**:

| Dark utility (inventory) | Top counts | Coverage |
|---|---|---|
| `bg-{zinc,slate,gray,neutral}-{700,800,900,950}` | zinc-800×192, zinc-900×104, slate-800×88 | HF-313/314 ✓ |
| `bg-{blue,sky,purple,indigo,violet}-{800,900,950}` | blue-900×15, blue-950×8, sky-900×5, purple-900×5 | **HF-316 → surface** |
| `bg-stone-{700..950}`, `bg-black`, `bg-[#0A0E1A]` | bg-black×12 | HF-313 (black) + **HF-316 (stone, hex)** |
| `text-white` / `text-{zinc,slate,gray}-{50,100,200,300}` | zinc-50×251, slate-50×195, white×126 | HF-313 → text token ✓ |
| `border-{zinc,slate,gray}-{600,700,800,900}` | zinc-800×141, zinc-700×94 | HF-313/314 (700-900) + **HF-316 (600)** |
| `divide-*-{700,800}`, `ring-*`, `placeholder-*` | — | HF-314 ✓ |
| gradient `from/to/via-{neutral}-{800,900,950}` | — | HF-314 ✓ |
| gradient `from/to-{blue,purple,indigo,sky}-{900,950}` | from-blue-950, from-purple-950 | **HF-316** |

**Critical interaction fix:** the HF-313 colored-CTA text-white restore (`[class*="bg-blue-"]` → keep
white) would have kept text white on a now-remapped `bg-blue-900`→white surface (white-on-white). HF-316
narrowed the restore with `:not([class*="-800"]):not([class*="-900"]):not([class*="-950"])` → a saturated
**mid-shade** CTA (`bg-blue-600 text-white`) keeps white text; a **dark colored surface** (`bg-blue-900`)
lets its text flip to dark. Only DARK shades touched.

**220 scoped `[data-theme="vialuce"]` rules**, all unlayered (win over `@layer utilities` + `dark:` pairs).
CSS-only → BCL/runtime byte-identical. Verification:
```
grep -c 'html[data-theme="vialuce"]' globals.css → 220 ; 0 unscoped
build exit-0 ; Korean Test PASS
```

## 2. Prong 2 — component design-spec conversion (the ceiling). Commit `ad33abe5`.

4-agent fan-out converted the highest dark-density content components the operate/calculate/import/users/
briefing pages render (outside HF-315's intelligence/design-system/results scope), to design-spec
vocabulary under `useIsVialuce()` (else-branch byte-identical — pure insertions, +1745/−28):

| Component | Design-spec applied |
|---|---|
| `calculate/PlanResults` | `.kpi` summary, `.card.flush`+`.tbl` entity table, `.pill` attainment, `.bar` breakdown |
| `users/UserAdminConsole` | `.card.flush`+`.tbl` directory, `.pill` credential/role state, `.empty` |
| `platform/OnboardingTab` | `.kpi` pipeline summary, `.card` pipeline, `.pill` lifecycle, `.empty` |
| `briefing/AdminBriefing` | `.kpi` hero, `.card` sections, `.tbl` top/attention lists |
| `briefing/IndividualBriefing` | `.insight` AI narrative, `.kpi` earnings, `.tbl` leaderboard |
| `briefing/ManagerBriefing` | `.kpi`/`.card`/`.tbl` |
| `sci/{SCIProposal,ImportReadyState,SCIUpload,ExecutionProgress}` | `.card`/design-spec surfaces |

Hooks declared before early returns (rules-of-hooks). Inner viz sub-components (steppers/histograms/
sparklines) left to the Prong-1 safety net (readable). **Legacy mission-control components
(ChromeSidebar, CycleIndicator) excluded** — under Vialuce, ChromeSidebar early-returns VialuceSidebar,
so their dark utilities render only under Dark/Bliss (not a Vialuce dark-surface).

## 3. Verification
```
tsc --noEmit : exit 0 (project-wide) · Korean Test : PASS · npm run build : exit 0
Prong 2 diff : +1745 / -28 (overwhelmingly insertions → else-branches preserved)
```

## 4. Adversarial verification — 3 chunks, ALL CLEAN

3 independent skeptics reviewed the full Prong-2 diff. **All 3 chunks: clean, zero issues.**

| Chunk | Files | Verdict |
|---|---|---|
| prong2-a | PlanResults, UserAdminConsole, OnboardingTab | **clean** (651 insertions / 0 deletions) |
| prong2-b | Admin/Individual/Manager Briefing | **clean** (final `return`→EOF identical to base in all 3) |
| prong2-c | SCIProposal, ImportReadyState, SCIUpload, ExecutionProgress | **clean** |

Confirmed across all 10 files: (1) `useIsVialuce()` is the first hook, before any early return
(rules-of-hooks — incl. the subtlety that `AnimatedNumber`'s hooks belong to that child, not the
briefing components); (2) else-branches **byte-identical** to base (`git show 36c319bd`) — overwhelmingly
pure insertions, the one deletion being a backward-compatible optional-prop signature; every design class
inside an `isVialuce` guard (none unconditional → Dark/Bliss untouched); (3) JSX balanced, `key` props
preserved, no double-render; (4) **all handlers preserved** (UserAdminConsole's 14 onClick/onValueChange,
PlanResults row-expand/Full-Trace/pagination/sort, OnboardingTab invite flow); (5) no new hardcoded
English (existing literals reused).

---

## 5. SHA / PR
Commits: directive `68ac2b61` · Prong 1 `36c319bd` · Prong 2 `ad33abe5` (+ report). PR: (added on creation).
DO NOT MERGE — SR-44.

## 6. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: CLT-223 → CLOSED. Two-prong: Prong 1 CSS safety net covers EVERY dark utility family (data-driven
    inventory: neutral + colored 800-950 + stone + hex + borders + gradients) → zero dark surfaces survive
    under Vialuce regardless of component coverage. Prong 2 converted the high-density content components
    (PlanResults/UserAdminConsole/OnboardingTab/briefings/SCI) to design-spec polish. Trace-and-miss
    pattern ended (safety net is by-family, not by-trace).
REGISTRY: Design & Experience → HF-316 SHA ad33abe5; 220 scoped vialuce rules.
SUBSTRATE: SR-34 (exhaustive — two-prong); regression-safe else-branches (BCL byte-identical; Prong 2
    pure insertions); colored-CTA restore narrowed to mid-shades (no white-on-white on dark surfaces).
```

## 6A. Out of scope / Residuals
Chart-library internal SVG fills (Recharts), Observatory admin surfaces, engine/data logic. Inner viz
sub-components rendered by the converted components rely on the Prong-1 CSS (readable, not full design-spec).
