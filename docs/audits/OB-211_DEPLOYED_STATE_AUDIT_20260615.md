# OB-211 Comprehensive Deployed-State Audit — every route × reachability × render

**Authored:** 2026-06-15 (architect channel) · **Repo:** `CCAFRICA/spm-platform`, deployed `vialuce.ai` · **Gate:** main `1dae916e`
**Type:** READ-ONLY whole-surface regression audit. No code change. Fixes (re-home / retire / RCA) are SEPARATE increments scoped from here.
**Method:** every `page.tsx` enumerated (128) and classified against the live nav registration (`web/src/lib/navigation/workspace-config.ts`), the middleware reachability gate (`web/src/middleware.ts`, `canAccessWorkspace`), redirect stubs, inbound-link analysis, and live BCL data probes. Nothing sampled.

---

## §0 — EXECUTIVE SUMMARY (+ an honest correction to the premise)

**The bug class is real and large:** of **128** page routes, the nav registers **17**; the command palette (`getAllRoutes()`) also surfaces only those 17. After subtracting redirect stubs, dynamic drill-targets, and auth/system pages, **~81 routes are genuinely ORPHANED** — real pages that deploy and (for a platform-admin) render if you type the URL, but have **no nav path and no inbound link**. This is exactly the architect's "entire pages missing."

**Correction to the directive's stated cause (SR-42 — surface honestly):** the directive hypothesizes the **Phase A reorg orphaned these routes**. Git history does **not** support that. The Phase A commit (`966eb0ab`, PR #520) dropped **zero** registered nav items — it only *moved* three families (`/operate/results`→Calculation, `/operate/reconciliation`→Calculation, `/financial/*`→the new Finance agent) and removed the "Consolidate" label. The orphaned families (`/insights`, `/investigate`, `/govern`, `/design`, `/data`, `/perform/*`, `/acceleration`, `/approvals`, `/configuration`, `/my-compensation`, `/notifications`, `/workforce`, `/operations`, `/admin/*`, …) **were never registered in any nav config** — not in the OB-207 pre-reorg nav (`0dc32609`) and (except `/perform` and `/admin/launch/*`) not even in the OB-97 original (`68177e32`). **Their orphaning predates the agent-nav lineage entirely.** Phase A is "not guilty" of dropping them; it also did not *fix* the pre-existing orphan backlog. The remediation is the same either way — but the cause is "these routes were never wired into nav," not "the reorg deleted them."

**Three sub-findings that resolve the architect's specific reports:**
- **"Old Results page missing":** `/operate/results` IS in nav (under **Calculation**, moved there by Phase A from Performance). If the architect expected it under Performance/Decide, that's the move, not a deletion. The OLD results-style surfaces (`/investigate/*`) are orphaned (and `/investigate` index redirects to `/operate`).
- **Reachability:** `canAccessWorkspace` returns `true` for any path whose prefix isn't in `WORKSPACE_CAPABILITIES`, and a **platform-admin holds every capability** — so a platform-admin reaches **all 128 routes by URL**. ORPHANED here = "renders, absent from menu," not "blocked." (Managers/reps ARE blocked from capability-gated prefixes — see §1 persona column.)
- **Simulate "still inactive on BCL":** **not a Phase D regression — it's persona + data.** The architect tested as **platform-admin → `admin` persona → `AdminStream`, which by design never renders the rep close-the-gap card (`SelfSimulateCard`)**. And on BCL's live data the gap path can't populate anyway (attainment band fails; rule_set has no classifiable `components[]`). Detail in §3.

**Largest single remediation lever:** OLD surfaces stranded alongside NEW ones (duplicate families) — §2. Retiring/redirecting those removes most of the 81.

---

## §1 — THE INVENTORY (all 128 routes, classified)

**Classes:** `NAV` = registered menu item · `REDIRECT` = redirect stub to the current surface (handled, not a bug) · `CONTEXTUAL` = dynamic `[param]`/`[...slug]` or a genuine drill-target reached from a reachable page · `AUTH/SYS` = login/mfa/error/landing · `ORPHANED` = real page, no nav, no inbound link, not dynamic → **the bug class** · `DEPRECATED?` = likely dead (flagged, not assumed).
**Persona gate** = the `WORKSPACE_CAPABILITIES` prefix capability (blank = unrestricted; platform-admin passes all). **Gated prefixes:** `/admin`→`platform.system_config`, `/operate`→`data.import`, `/configure`+`/configuration`→`tenant.edit_settings`, `/govern`→`data.approve_results`, `/data`→`data.import`, `/financial`→`view.team_results`.

### Registered (NAV) — 17
| Route | Agent / section | Roles (capability) |
|---|---|---|
| `/stream` | Performance → Intelligence | view.intelligence_stream |
| `/operate` | Calculation → Lifecycle (Cockpit) | data.import |
| `/operate/lifecycle` | Calculation → Lifecycle (Ops Center) | data.advance_lifecycle |
| `/operate/import` | Calculation → Import | data.import |
| `/operate/import/history` | Calculation → Import | data.import |
| `/operate/calculate` | Calculation → Calculate | data.calculate |
| `/operate/results` | Calculation → Results *(Phase A: moved from Performance)* | view.all_results (platform/admin/manager) |
| `/operate/reconciliation` | Calculation → Reconciliation *(Phase A: moved from Consolidate)* | data.reconcile |
| `/financial` | Finance → Financial *(feature-gated `financial`)* | platform/admin/manager/sales_rep |
| `/financial/pulse` | Finance → Financial | (same) |
| `/financial/timeline` | Finance → Financial | (same) |
| `/financial/performance` | Finance → Financial | (same) |
| `/financial/staff` | Finance → Financial | (same) |
| `/financial/leakage` | Finance → Financial | platform/admin/manager |
| `/configure/periods` | Platform Core → Periods | tenant.configure_periods |
| `/configure/people` | Platform Core → People | view.all_entities |
| `/configure/users` | Platform Core → System | tenant.manage_users |

### Redirect stubs (REDIRECT — handled) — 12
| Route | Redirects to | Note |
|---|---|---|
| `/` | `/stream` or `/select-tenant` | middleware landing logic |
| `/admin/launch` | `/stream` | index only; children render (orphaned) |
| `/data/import` | `/operate/import` | |
| `/data/imports` | `/operate/import` | |
| `/design` | `/configure` | index; specific children render (orphaned) |
| `/design/[...slug]` | `/configure` | catch-all |
| `/govern` | `/configure` | index; children render (orphaned) |
| `/govern/[...slug]` | `/configure` | catch-all |
| `/investigate` | `/operate` | index; children render (orphaned) |
| `/investigate/[...slug]` | `/operate` | catch-all |
| `/operate/import/enhanced` | `/operate/import` | |
| `/performance` | `/perform` | client redirect; `/perform` itself is orphaned |
| `/operations` | renders `/operations/rollback` | `export { default } from './rollback/page'` (alias, not a true redirect) |

> Note `/operations` is listed for completeness (13 rows) — it aliases an orphaned page, so it's effectively orphaned reach.

### Contextual (dynamic / genuine drill-targets) — 9
| Route | Reached from |
|---|---|
| `/configure/[...slug]` | dynamic catch-all |
| `/operate/[...slug]` | dynamic catch-all |
| `/perform/[...slug]` | dynamic catch-all |
| `/financial/location/[id]` | drill from Finance pages |
| `/financial/server/[id]` | drill from Finance pages (rep redirect target) |
| `/investigate/trace/[entityId]` | drill-target (entity trace) |
| `/data/transactions/new` | drill from `/data/transactions` (parent orphaned) |
| `/performance/approvals/payouts` | linked from `/performance/approvals` (parent orphaned) |
| `/performance/approvals/payouts/[id]` | drill from the payouts list |

### Auth / system — 8
`/login` · `/signup` · `/select-tenant` · `/unauthorized` · `/upgrade` · `/auth/mfa/enroll` · `/auth/mfa/verify` · (`/` counted above)

### Flagged DEPRECATED? — 1
`/test-ds` — a design-system test page; should not ship to prod. (Confirm + delete.)

### ORPHANED — ~81 (the bug class), grouped by family
Each below is a **real page, no nav entry, no inbound link, not dynamic**. Reachable by a platform-admin via direct URL (renders); blocked for lower roles where the prefix is capability-gated.

| Family | Orphaned routes | Prefix gate | Render dependency |
|---|---|---|---|
| **`/insights/*`** (OLD performance intelligence) | `/insights`, `/insights/analytics`, `/insights/compensation`, `/insights/my-team`, `/insights/performance`, `/insights/sales-finance`, `/insights/trends` | none (unrestricted) | tenant data; some persona-scoped |
| **`/investigate/*`** (OLD results/recon) | `/investigate/adjustments`, `/investigate/audit`, `/investigate/entities`, `/investigate/reconciliation` | none | calc results / batch present |
| **`/govern/*`** (OLD governance) | `/govern/access`, `/govern/approvals`, `/govern/audit-reports`, `/govern/calculation-approvals`, `/govern/data-lineage` | `data.approve_results` | approvals/audit data |
| **`/design/*`** (OLD plan design) | `/design/budget`, `/design/goals`, `/design/plans/new` | none | rule_sets present |
| **`/data/*`** (OLD import/data) | `/data`, `/data/import/enhanced`, `/data/operations`, `/data/quality`, `/data/readiness`, `/data/reports`, `/data/transactions` | `data.import` | committed_data present |
| **`/configuration/*`** (OLD config — dup of `/configure`) | `/configuration`, `/configuration/locations`, `/configuration/personnel`, `/configuration/teams`, `/configuration/terminology` | `tenant.edit_settings` | tenant config |
| **`/configure/*`** (CURRENT family, pages not in the 3-item nav) | `/configure`, `/configure/data-specs`, `/configure/locations`, `/configure/organization/locations`, `/configure/organization/teams`, `/configure/system`, `/configure/teams`, `/configure/users/invite` | `tenant.edit_settings` | tenant config; `users/invite` should drill from `/configure/users` (no link → broken drill) |
| **`/perform/*`** (OLD persona perf landing — superseded by `/stream`) | `/perform`, `/perform/compensation`, `/perform/statements`, `/perform/team`, `/perform/trends` | none | persona + calc results |
| **`/performance/*`** (OLD perf approvals/goals) | `/performance/adjustments`, `/performance/approvals`, `/performance/approvals/plans`, `/performance/goals` | none | approvals/results data |
| **`/operations/*`** (OLD ops) | `/operations/audits`, `/operations/audits/logins`, `/operations/data-readiness`, `/operations/messaging`, `/operations/rollback` | none | audit/ops data |
| **`/operate/*`** (CURRENT family, pages not in nav & not cockpit-linked) | `/operate/approve`, `/operate/briefing`, `/operate/import/quarantine`, `/operate/monitor/operations`, `/operate/monitor/quality`, `/operate/monitor/readiness`, `/operate/pay` | `data.import` | calc/lifecycle state (0 inbound links — NOT drill-reachable) |
| **`/admin/*`** (platform-admin tools) | `/admin/access-control`, `/admin/audit`, `/admin/users`, `/admin/tenants/new`, `/admin/launch/calculate`, `/admin/launch/calculate/diagnostics`, `/admin/launch/plan-import`, `/admin/launch/reconciliation` | `platform.system_config` | platform role |
| **`/workforce/*`** (OLD people/teams/roles — dup of `/configure` people/teams) | `/workforce/permissions`, `/workforce/personnel`, `/workforce/roles`, `/workforce/teams` | none | entities present |
| **`/financial/*`** (CURRENT family, pages not in the 6-item Finance nav) | `/financial/patterns`, `/financial/products`, `/financial/summary` | `view.team_results` | financial feature + pos data |
| **Standalone** | `/acceleration`, `/approvals`, `/my-compensation`, `/notifications`, `/spm/alerts`, `/integrations/catalog` | none | varies (see §2) |

---

## §2 — ORPHAN + DUPLICATE-SURFACE ANALYSIS (the core finding)

The dominant pattern is **OLD surfaces stranded alongside NEW ones**. The reorg(s) built the new surface and (for some) added an index/[...slug] redirect, but **never retired the OLD specific sub-pages** — they still deploy as orphans. Each pair below: which is CURRENT, which is OLD/orphaned, and the disposition.

| OLD (orphaned) surface | CURRENT surface (nav) | In pre-reorg nav? | Disposition |
|---|---|---|---|
| `/insights/*` | `/stream` (Performance) | **No** (never in nav) | **Retire or redirect** `/insights/*` → `/stream`. Add `[...slug]` redirect like `/investigate` already has. |
| `/investigate/*` (children) | `/operate/results`, `/operate/reconciliation` | No | Index already redirects → `/operate`. **Add redirects for the children** (`/investigate/adjustments|audit|entities|reconciliation`) or retire. |
| `/configuration/*` | `/configure/*` | No | **Retire** the whole `/configuration` family (dup of `/configure`). Redirect → `/configure/...`. |
| `/data/*` | `/operate/import`, `/operate/monitor/*` | No | `/data/import`+`/data/imports` already redirect; **redirect/retire the rest** (`/data`, `/data/quality|readiness|reports|operations|transactions|import/enhanced`). |
| `/perform/*` + `/performance/*` | `/stream` (+ `/operate/results`) | No (`/perform` was in OB-97 only) | `/performance`→`/perform` already; **`/perform` itself is orphaned** → redirect `/perform*`→`/stream` or **re-home** if still the canonical statement surface (see Simulate §3 — `SelfSimulateCard` only renders in `/stream`'s rep persona, so `/perform/statements` may be the *intended* rep statement surface; **architect decision: is the rep statement `/stream` or `/perform/statements`?**). |
| `/workforce/*` | `/configure/people`, `/configure/teams` | No | **Retire** (dup) or redirect → `/configure/...`. |
| `/operations/*` | `/operate/lifecycle`, `/operate/monitor/*` | No | **Retire/redirect** → `/operate/...`. |
| `/govern/*` (children) | `/operate` (approvals), `/configure` | No | Index already redirects → `/configure`; **retire/redirect children** or re-home audit/approvals. |
| `/design/*` (children) | `/configure` | No | Index already redirects; **retire/redirect children** (`/design/budget|goals|plans/new`). |
| `/financial/{patterns,products,summary}` | `/financial/*` (6 in nav) | No (were in OB-97 nav, dropped by OB-207) | **Re-home into Finance nav** if still wanted, else retire. CURRENT-surface pages, just unlisted. |

**Routes that are NOT duplicates — genuine destinations missing a home (re-home, don't retire):**
- `/admin/access-control`, `/admin/audit`, `/admin/users`, `/admin/tenants/new` → **Platform Core** (platform-admin tools that should be in the menu for platform role). `/admin/launch/*` are superseded by `/operate/*` (launch index already redirects → `/stream`) → retire.
- `/notifications` → a **global** surface (bell icon / header), not a workspace item — add to chrome, not a workspace section.
- `/approvals` → consolidate with the OTHER approval surfaces (`/operate/approve`, `/performance/approvals`, `/govern/approvals`, `/govern/calculation-approvals`) — **4+ approval pages exist**; architect picks the canonical one and retires the rest.
- `/my-compensation` → the rep self-statement; reconcile with `/perform/statements` and the rep `/stream` card (pick one).
- `/acceleration` → performance accelerator; re-home under Performance or retire if superseded by `/stream`.
- `/integrations/catalog` → Platform Core (integrations) if the feature is live, else DEPRECATED?.
- `/spm/alerts` → re-home (alerts) or retire.

**Duplication hot-spots (architect must pick canonical):**
- **Approvals:** `/approvals`, `/operate/approve`, `/performance/approvals`, `/govern/approvals`, `/govern/calculation-approvals` — five surfaces.
- **People/teams config:** `/configure/people|teams`, `/configuration/personnel|teams`, `/workforce/personnel|teams|roles`, `/configure/organization/teams` — three+ families.
- **Audit:** `/admin/audit`, `/investigate/audit`, `/govern/audit-reports`, `/operations/audits` — four surfaces.
- **Data readiness/quality:** `/data/readiness|quality`, `/operations/data-readiness`, `/operate/monitor/readiness|quality` — three families.

---

## §3 — DEPLOYED RENDER CHECKLIST (architect-executed on vialuce.ai)

> CC's env can't hold a real authenticated browser session (SR-44) — run these as platform-admin on BCL. For each: what RENDER vs BLANK/ERROR means.

### 3.1 — NAV-reachable (click the menu): confirm each renders
For each of the 17, navigate via the agent → section and confirm it renders (not blank/500):
- **Performance →** Intelligence = `/stream`
- **Calculation →** `/operate`, `/operate/lifecycle`, `/operate/import`, `/operate/import/history`, `/operate/calculate`, `/operate/results`, `/operate/reconciliation`
- **Finance →** `/financial`, `/financial/pulse`, `/financial/timeline`, `/financial/performance`, `/financial/staff`, `/financial/leakage` *(only if BCL has feature `financial` — note BCL is a bank; if Finance agent is absent in BCL's nav, that's the feature gate, not a bug)*
- **Platform Core →** `/configure/periods`, `/configure/people`, `/configure/users`
- RENDER = wired+reachable ✓. BLANK/ERROR = a real defect (separate fix).

### 3.2 — Orphan confirmation (type the URL): proves exists-but-unreachable
Type `vialuce.ai/<path>` for a sample of each orphaned family (e.g. `/insights`, `/investigate/entities`, `/data/quality`, `/perform/statements`, `/admin/users`, `/approvals`, `/my-compensation`, `/notifications`, `/workforce/teams`, `/financial/summary`):
- **PAGE RENDERS** = confirmed ORPHAN (exists + deploys, just unreachable from nav) → re-home/retire per §2.
- **404** = the page was deleted (not orphaned) — update this audit.
- **/unauthorized redirect** = the prefix is capability-gated and your role lacks it (shouldn't happen for platform-admin; if it does, note it).

### 3.3 — SIMULATE on BCL (the architect's specific report) — RCA'd from code + live data

**Finding: Simulate is inactive on BCL because of (A) persona and (B) data — NOT a Phase D regression.**

**(A) Persona — by design.** Platform-admin → `'admin'` persona (`persona-context.tsx:84`) → `AdminStream`, which **does not contain `SelfSimulateCard`** (the rep close-the-gap card renders only in `IndividualStream`, `stream/page.tsx:825-832`). Admin's only Simulate surface is the population `OptimizationCard` (`stream/page.tsx:624-632`), gated by `opportunities.length>0` + a `hasModel` per-opportunity check (`OptimizationCard.tsx:61,74-76`) — if no qualifying opportunity, the button is disabled ("Simulation needs tier data").
- **Architect check:** to see `SelfSimulateCard` at all, switch to a **rep** persona (PersonaSwitcher or log in as a BCL rep) on `/stream`.

**(B) Data — live BCL probe (service-role, 2026-06-15):**
- BCL active rule_set `54fe1094` ("Plan de Comisiones — Banca Minorista 2025-2026") stores its logic in **`input_bindings.convergence_bindings`**; its **`components` field is non-array** → the regime classifier (`performance-regime.ts:62-71`, reads `componentDef.metadata.intent`) has **no `components[]` to classify** → regime defaults to 1 → **no regime-2 gap path**.
- A sample BCL `calculation_result` shows **entity attainment `{"overall": 0}`**, per-component `attainment = undefined`, `metadata.intent = absent`, payouts present (180/180/90/100).
- The gap-sim guard is `regime===2 && att>=1 && att<100 && payout>0` (`intelligence-stream-loader.ts:618`). The Phase D HIGH fix (entity-level attainment fallback, `loader:612`) resolves `att` to the **entity overall = 0** → `att>=1` is **FALSE** → every component is dropped. **The fallback can't help when the fallback value is itself 0.**
- **Conclusion:** on BCL's loaded data, Simulate is **correctly inactive** — no component is in the 1–100% attainment band and the rule_set has no classifiable `components[]`. This is **data/config-gated, not a broken fix.**

**Architect's decisive verification (to distinguish data-gated vs genuine regression):**
1. Pick a tenant/period where a **regime-2** component has **`1 ≤ attainment < 100` and `payout > 0`** AND the rule_set's `components[*].metadata.intent` is present (i.e. a classifiable component array — Sabor or any tenant whose plan was imported with the compositional-intent grammar, not BCL's convergence-bindings shape).
2. Log in as a **rep** of that tenant → `/stream` → expect `SelfSimulateCard` to render with the close-the-gap slider.
   - **Renders** → the Phase D fix holds; BCL was simply data-gated.
   - **Still absent with qualifying data + rep persona** → genuine regression — escalate (a separate RCA/fix), check `loader:612/618` and `classifyComponentRegime`.
3. For the **admin** population card: confirm the tenant has regime-2 gap opportunities (`computeOptimizationOpportunities`, `loader:762-792`) so `OptimizationCard` has `opportunities.length>0` and `hasModel` true.

---

## §4 — DISPOSITION (what to do — each a SEPARATE increment)

| Bucket | Routes | Action (separate increment) |
|---|---|---|
| **Re-home into the agent nav** | `/admin/access-control|audit|users|tenants/new` → **Platform Core**; `/financial/{patterns,products,summary}` → **Finance**; `/notifications` → global chrome; (decide canonical) `/perform/statements` or `/my-compensation` → **Performance** rep statement; `/acceleration` → **Performance**; `/integrations/catalog` → **Platform Core** | Add `WORKSPACES` section entries (and, for notifications, a chrome item). One PR per agent. |
| **Retire / redirect (OLD duplicates)** | `/configuration/*`, `/workforce/*`, `/operations/*`, `/insights/*`, `/data/*` (non-redirected), `/perform/*`+`/performance/*` (if `/stream` is canonical), `/govern/*` & `/design/*` children, `/admin/launch/*` | Convert each to a redirect stub to its CURRENT surface (the pattern `/investigate`/`/govern`/`/design` indexes already use), or delete. Resolves most of the ~81. |
| **De-duplicate (pick canonical, retire rest)** | Approvals ×5, Audit ×4, People/Teams config ×3, Data-readiness ×3 | Architect picks the canonical surface per concern; retire/redirect the others. |
| **Fix broken drill** | `/configure/users/invite` (0 inbound from `/configure/users`) | Wire the "Invite" CTA on `/configure/users` (separate fix). |
| **RCA / verify (Simulate)** | `/stream` rep card + admin `OptimizationCard` | **Not a confirmed bug** — verify per §3.3 on qualifying data + rep persona. Only escalate if it fails with qualifying data. BCL itself is data-gated (attainment 0, no classifiable components). |
| **Confirm + delete** | `/test-ds` | Remove the test page from prod. |
| **No action (correct)** | the 17 NAV, the 12 REDIRECT stubs, the 9 CONTEXTUAL drill/dynamic, the 8 AUTH/SYS | Working as intended. |

**Counts:** 128 total · 17 nav · ~12 redirect · ~9 contextual · 8 auth/sys · 1 deprecated-flag · **~81 orphaned** (the remediation backlog, mostly OLD-surface duplicates).

---

## §5 — REPRODUCE (read-only probes)

```
# nav vs inventory
find web/src/app -name page.tsx | sed -E 's#^web/src/app##; s#/page\.tsx$##; s#^$#/#' | sort   # 128 routes
# nav registration: web/src/lib/navigation/workspace-config.ts (17 route.path entries)
# reachability gate: web/src/middleware.ts:160-166 (api 401), :364 canAccessWorkspace; web/src/lib/auth/permissions.ts:331-338 + WORKSPACE_CAPABILITIES
# BCL Simulate data probes:
npx tsx --env-file=.env.local web/scripts/ob211-audit-bcl-simulate.ts
npx tsx --env-file=.env.local web/scripts/ob211-audit-bcl-verify.ts
```
Git provenance: reorg `966eb0ab` (PR #520); pre-reorg nav `0dc32609:web/src/lib/navigation/workspace-config.ts`; OB-97 original `68177e32`.

### Flagged unknowns (architect verifies on deployed)
- Each orphan's **render vs 404** on deployed (§3.2) — CC confirmed they exist as pages + reachable-by-URL in code; the live render is the architect's check.
- Whether `/perform/statements` vs `/stream` rep card vs `/my-compensation` is the **intended** rep statement surface — a product decision, not derivable from code.
- Simulate on **qualifying** data (§3.3) — needs a rep session on a tenant with regime-2 in-band components; BCL does not qualify.

---

### One-line status for the artifact sync
Whole-surface audit complete: 128 routes classified (17 nav / ~12 redirect / ~9 contextual / 8 auth / 1 test / **~81 orphaned**). Honest correction: Phase A dropped **zero** nav items (it moved results/recon/financial + dropped "Consolidate"); the ~81 orphans **predate** the agent-nav lineage — mostly OLD surfaces (`/insights`,`/configuration`,`/data`,`/workforce`,`/operations`,`/perform*`) stranded beside the NEW ones, plus genuine homeless destinations (`/admin/*`, `/notifications`, `/financial/{patterns,products,summary}`). Simulate "inactive on BCL" = persona (admin never gets the rep card) + data (BCL attainment 0, rule_set has no classifiable components) — **not** a Phase D regression; verify on qualifying data as a rep. Remediation = re-home / retire-redirect / de-dup / one broken-drill fix — each a separate increment scoped here. Pending the architect's deployed render walk.
