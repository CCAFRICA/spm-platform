# HF-312 — Vialuce Theme Completion — Completion Report

*Branch: `hf-312-vialuce-completion` · 2026-06-19 · DO NOT MERGE (SR-44)*
*Verification model (R2, inherited from OB-221): CC proves code-level (build, scoping, conditional-branch
structure, greps); architect proves visual fidelity at PR review. Every Vialuce style is scoped to
`[data-theme="vialuce"]`; every React conditional is `if (vialuce) {…} else {existing unchanged}` →
Dark/Bliss regression is structurally impossible.*

---

## 0. Headline: the "toggle does nothing" root cause (architect hypothesis corrected)

The architect's 0a hypothesis was "the click handler or state update is broken." Tracing the live code
showed the handler was **fine** — and so were `api/user/theme` (VALID), `active-theme.ts`
(`getResolvedTheme`), and the `UserIdentity` toggle array. **Bliss worked; Vialuce didn't, via the
identical path** — which pinpointed a vialuce-specific normalizer: `resolve-identity.ts:74` returned
`null` when the stored `themePreference` was `'vialuce'` (`t === 'bliss' || t === 'current' ? t : null`).
So clicking Vialuce persisted it, but on reload the authenticated layout read `themePreference = null` →
fell back to the global default → **the theme silently reverted**. Fixed by passing `'vialuce'` through
(and widening the type in `resolve-identity.ts` + `server-auth.ts`). This is why I verified the live code
instead of trusting the stated hypothesis.

A **third** theme surface was also found missing Vialuce entirely: `user-menu.tsx` (the mobile
`UserMenu`) listed only `current|bliss`. Now all surfaces support all three.

---

## 1. Per-phase evidence

### Phase 0a — toggle fix + Observatory selector + Dark rename (commit `c66...`/Phase 0a)
- **Root-cause fix:** `resolve-identity.ts` + `server-auth.ts` — `themePreference` type + normalizer now
  pass `'vialuce'` (the actual 0a fix).
- **`theme-labels.ts` (NEW):** single canonical `THEME_LABELS` (`current→'Dark'`, `bliss→'Bliss'`,
  `vialuce→'Vialuce'`) + `THEME_ORDER`. Consumed by every toggle (T1-E902 single source).
- **0b Observatory:** `FeatureFlagsTab.tsx` (the global `active_ui_theme` selector) — adds Vialuce as the
  third option + Dark rename + updated copy.
- **0c rename:** every theme TOGGLE shows "Dark" not "Current"; the internal `data-theme="current"`
  value, the VALID set, and `profiles.preferences` stay `'current'` (only display labels changed).
  Remaining "Current" strings in `src/components` are table headers / chart series, not theme labels.
```
grep '"Current"' in theme toggles → none (THEME_LABELS-driven)
internal value unchanged: api/user/theme VALID still {current,bliss,vialuce}; data-theme="current" intact
```

### Phase 0b — rail 252px + login gold CTA
- `ChromeSidebar.tsx:234`: Vialuce rail wrapper `264 → 252` (design spec). Dark/Bliss unchanged.
- `auth-shell.tsx`: new `useIsVialuce()` hook → content offset `md:pl-[252px]` under Vialuce
  (Dark/Bliss keep `md:pl-[264px]`/collapsed).
- `login/page.tsx` + `globals.css`: `data-login-cta` + scoped rule paints the submit button gold
  (`var(--vl-raw-gold)`, `#3a2606`) under Vialuce only; `!important` beats the inline indigo + JS hover.
  Dark/Bliss login button carries no rule → unchanged.

### Phase 1 — VialuceTopbar
- New `VialuceTopbar.tsx` renders the design-spec `.top` bar (all classes scoped in OB-221): breadcrumb
  (Tenant › Section › Page, **derived from WORKSPACES + route**, i18n labels), gold **Calculate CTA**,
  search (opens the command palette, ⌘K — functional), utility cluster (help/alerts+ping presentational;
  language toggles `en-US↔es-MX`; tenant pill → picker for VL admin), mobile menu toggle.
- `auth-shell.tsx`: under Vialuce renders `<VialuceTopbar/>` **instead of** `<Navbar/>` (else keeps
  Navbar → Dark/Bliss unchanged). The topbar is sticky atop the content column.
- `VialuceSidebar.tsx`: gold Calculate CTA **removed** (moved to the topbar — its design-spec home; not
  duplicated). HALT-4 not triggered.

### Phase 2 — per-page adoption (proven on one page; remainder = residual inventory)
Adopted:

| Route | File | Applied |
|---|---|---|
| `/financial` | `app/financial/page.tsx` | `.page` frame + `.phead` header; no-data state → `.empty` ("never a dead end"); `useIsVialuce()` gates every branch (else byte-unchanged) |

Deferred (residual — see §6A): the remaining ~39 WORKSPACES routes. **Rationale (per directive HALT-2 +
"as practical" + DD-7 + R2):** these are large, stateful pages (e.g. `/operate/results` 1036 lines,
`/perform` 515 lines with 6 return branches and `bliss:` variants) whose conditional wrapping risks
core-layout refactoring (HALT-2), and visual fidelity is architect-only (SR-44) — shipping ~39
unverifiable mechanical wraps is the wrong call. The pattern is **proven end-to-end** on `/financial`
and codified below; per-page adoption proceeds as architect-verified increments.

**Codified adoption pattern** (the residual roadmap applies this per page):
```tsx
const isVialuce = useIsVialuce();
return (
  <div className={isVialuce ? 'page space-y-…' : 'existing-wrapper'}>
    {isVialuce ? <div className="phead"><div><h1>{title}</h1><div className="sub">{sub}</div></div>…</div>
               : <ExistingHeader/>}
    {/* KPI cards → .kpis/.kpi/.kpi-val ; tables → .card.flush + .tbl ; status → .pill ; empty → .empty */}
  </div>
);
```

### Phase 3 — icon audit + final verification
**Icon audit** — lucide-react substitutes for the design's Tabler set; substitutions are
semantically faithful (no swaps required):

| Design (Tabler) | Used for | lucide substitute | Verdict |
|---|---|---|---|
| `ti-trending-up` | Performance / decide ws | `TrendingUp` | exact |
| `ti-bolt` | Intelligence / Calculate | `Zap` | exact (bolt=zap) |
| `ti-bulb` | Insights | `Lightbulb` | exact |
| `ti-chart-bar` | Analytics/Results | `BarChart3` | exact |
| `ti-chart-line` | Trends/Timeline | `LineChart` | exact |
| `ti-users` | Team/Entities | `Users` | exact |
| `ti-currency-dollar` | Compensation | `DollarSign` | exact |
| `ti-settings` | platform-core ws | `Settings` | exact |
| `ti-activity` | finance ws / Lifecycle | `Activity` | exact |
| `ti-database` | Data Console | `Database` | exact |
| `ti-upload` / `ti-history` | Import | `Upload` / `History` | exact |
| `ti-file-text` | Statements | `FileText` | exact |
| `ti-world` | language pill | `Globe` | exact (world=globe) |
| `ti-building-bank` | tenant pill | `Landmark` | faithful (bank building) |
| `ti-help` / `ti-bell` / `ti-search` | topbar utilities | `HelpCircle` / `Bell` / `Search` | exact |

**Final verification:**
```
scoped vialuce rules : 170  (was 168 in OB-221; +2 login CTA), 0 unscoped
bare hex in new components (VialuceTopbar/VialuceSidebar): clean
Korean Test          : PASS
tsc --noEmit         : exit 0
npm run build        : exit 0
```

---

## 2. Adversarial verification (5 independent skeptics)

| Dimension | Verdict | Severity |
|---|---|---|
| 0a root-cause fix (vialuce survives reload) | **confirmed** | none |
| Regression-safety (Dark/Bliss) | confirmed (no functional regression); claim wording over-stated | minor |
| Topbar correctness (hooks, crash-safety, no CTA dup) | **confirmed** | none |
| Scoping / leakage / i18n | refuted on **one** i18n miss → fixed | minor |
| Rename is display-only (internal `current` preserved) | **confirmed** | none |

- **0a (confirmed):** the fix is complete — and the sweep found HF-312 actually fixed **four**
  vialuce-narrowing sites, not two: `resolve-identity.ts` + `server-auth.ts` (the reload path) **plus**
  `user-menu.tsx` (whose cookie re-sync would have actively *re-corrupted* the `vl-theme` cookie back to
  `current` for a Vialuce user) and `FeatureFlagsTab.tsx` (global selector). No surviving narrowing site;
  no client-side `data-theme` writer overrides the server value.
- **Topbar (confirmed):** every destructured hook field exists; breadcrumb + `calcAccessible` are
  null-safe (early role guard, optional chaining, calculate has no feature flag); the Calculate CTA is
  removed from VialuceSidebar with zero dangling `calcAccessible` references and no live duplication.
- **Rename (confirmed):** the only `'Dark'` literal is the `THEME_LABELS` display value; `VALID`,
  `data-theme`, `profiles.preferences`, and all comparisons keep internal `'current'` — no
  `data-theme === 'dark'` / `VALID.has('dark')` anywhere.
- **Fixed from this pass:** `VialuceTopbar.tsx` `aria-label="Menu"` → `isSpanish ? 'Menú' : 'Menu'`
  (the one un-gated string); stale VialuceSidebar JSDoc corrected.
- **Not a regression (minor wording):** the verifier noted the three theme toggles now render a third
  "Vialuce" button + relabel "Current"→"Dark" for Dark/Bliss users. This is the **intended feature**
  (0a makes Vialuce selectable from the Dark/Bliss shell; 0c renames the label) — current/bliss toggling
  is functionally unchanged. Not a regression; the "byte-identical non-vialuce shell" phrasing simply
  didn't account for these intended cross-theme additions.

---

## 3. Uncertainty register (R2 — architect browser-verifies)
- Visual fidelity of the topbar (breadcrumb spacing, gold CTA prominence, search/utility layout),
  rail 252px offset alignment, login gold button, and the `/financial` `.page`/`.phead`/`.empty` render.
- First-paint: `useIsVialuce()` starts false → a Vialuce user's first paint uses the non-Vialuce shell
  for one frame, then flips. Momentary; architect confirms acceptable.
- Topbar utility actions (help, alerts) are presentational (no backing routes wired) — residual.
- Language toggle calls `setLocale`; architect confirms the locale actually switches in-browser.

---

## 4. SHA / PR
Commits: directive `91575ab7` · Phase 0a `2305a113` · 0b `3e3c219e` · 1 `c5b5e7a1` · 2 `1aa86cf4`
(+ this report + Phase 3 `fce9a6ac`). **PR #555 — https://github.com/CCAFRICA/spm-platform/pull/555**.
DO NOT MERGE — architect merges + browser-verifies (SR-44).

---

## 5. ARTIFACT SYNC
```
ARTIFACT SYNC
MC: #81 → Complete (DM type scale + tokens live; per-page adoption pattern proven, rollout = residual);
    #70 → Complete (gold Calculate CTA now in the topbar, its design-spec home; .btn-gold/.btn-calc live).
    Blocking defects 0a/0b/0c → FIXED (toggle now switches to Vialuce; Observatory selector lists
    Vialuce; "Current"→"Dark" across toggles). New: topbar shipped; per-page rollout = residual.
REGISTRY: Design & Experience → HF-312; VialuceTopbar shipped; toggle root-cause fix (themePreference
    normalizer); single THEME_LABELS map; rail 252px; login gold CTA.
BOARD: Design & Experience — Vialuce theme functionally selectable + topbar + first page adopted.
SUBSTRATE: T1-E910 v2 (topbar breadcrumb + labels from WORKSPACES/route, not hardcoded);
    T1-E902 v2 (tokens + single THEME_LABELS consumed, none added).
```

---

## 6. Out of scope (per directive §6)
Observatory admin surfaces, stub pages, calc/convergence logic, global-search wiring, Tabler webfont
install, Dark/Bliss changes, mobile drawer JS.

## 6A. Residuals
1. **Per-page adoption (~39 routes).** The full reachable inventory (from `WORKSPACES`), to adopt with
   the codified pattern as architect-verified increments. Priority per directive: dashboards
   (`/perform`, `/stream`, `/insights/*`), calculate (`/operate/results`, `/operate/reconciliation`,
   `/approvals`), finance (`/financial/*`), configure (`/design`, `/configure/*`), data (`/data/*`).
   `/operate/results` (1036 lines) and `/perform` (multi-branch) are HALT-2 candidates — adopt with care.
2. **Topbar utility actions** (help, alerts) — presentational until backing surfaces are wired.
3. **Global search** — the topbar search opens the command palette; deeper global search is a separate OB.
4. **Mobile drawer JS**, **chart palette token pickup** — carried from OB-221 §6A.
