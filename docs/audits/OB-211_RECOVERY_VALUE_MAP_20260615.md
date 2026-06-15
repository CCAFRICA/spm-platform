# OB-211 Recovery Value Map — substance scan of the 81 orphaned pages

**Authored:** 2026-06-15 (architect channel) · **Repo:** `CCAFRICA/spm-platform` · **Gate:** main `1dae916e` + the deployed-state audit (`docs/audits/OB-211_DEPLOYED_STATE_AUDIT_20260615.md`, the route inventory).
**Type:** READ-ONLY substance scan + a TEMPORARY walkable menu (the `/recovery` page). Purpose: turn the 81 orphans into a recoverable-value map the architect can WALK and then decide keep / absorb / discard. No recovery build here.

**Method (no fabrication):** every orphaned `page.tsx` was MEASURED — `web/scripts/ob211-substance-scan.sh` (reproducible): **lines / unique JSX components / handlers / data-hooks / stub-markers**, plus the page's self-describing top doc-comment / heading. Substance class is from those numbers; MIR mapping is cross-referenced to the capability profile; lineage is **content-derived (maturity, doc-comment provenance, stub density) — NOT git** (HALT-LINEAGE: every page shares one migration commit date; creation order is NOT asserted from git).

**MIR source caveat (honest):** the named input `MIR_CAPABILITY_STATUS_PROFILE_R1_20260612` is **not committed to this repo**. I used the in-repo `docs/diagnostics/DIAG-063_MIR_DEMO_CAPABILITY_ASSESSMENT_OUTPUT.md` (the capability table: #8 statements E3, #11 results-dashboard E2/E3, #12 Disputes E4, #13 adjustments/approval E4, #14 audit E4, #15 company-view E1/E3) **plus the states the directive states explicitly** (Disputes 🔴, statements 🟠, Results 🟡, Company view 🟡 at `/perform`, Audit 🟠). Where a page maps to a capability the profile doesn't cover, it's marked **no-MIR (VISION)**.

---

## §A — SUMMARY

| Substance class | Count | Meaning |
|---|---:|---|
| **SUBSTANTIVE** | ~40 | real components + data-hooks/handlers, low stub density — recoverable design work |
| **PARTIAL** | ~16 | real UI but heavy stub/mock markers or dead handlers (renders, doesn't fully act) |
| **EMPTY / stub** | ~25 | trivial line count, ~0 components/actions — **auto-flagged DISCARD (architect never walks these)** |

| Priority lane | What it is | Walk? |
|---|---|---|
| **MIR-CRITICAL** | serves a 🔴/🟠 MIR demo capability (Disputes/Adjustments, Approvals, Statements, Audit) | **walk first** |
| **MIR-SUPPORTING** | serves a 🟡 MIR capability (Results dashboard, Company view, data quality/readiness) | walk |
| **VISION** | substantive, no MIR map — recoverable design capital (Insights BI, RBAC, accelerator, ops, finance extras) | walk |
| **DISCARD** | EMPTY/stub | **do not walk** — confirm the list, then remove |

**Headline:** the orphan set is **not 81 mistakes** — ~56 pages carry real, recoverable substance (statements, adjustments, approvals, audit, the entire Insights BI suite, RBAC, payroll, rollback). ~25 are empty skeletons. The richest stranded work: `/perform/statements` (655L/28 data-hooks), `/admin/launch/calculate` (1124L/40), `/workforce/personnel` (853L), the 7-page `/insights/*` BI suite, `/performance/adjustments` (476L), `/acceleration` (635L).

---

## §B — LINEAGE CLUSTERS (content-derived — NOT git)

Each cluster: the CURRENT/canonical surface, the stranded variants, and the content signal for "most-developed." **Indication only — the architect confirms canonical by viewing.**

**C1 — Performance dashboards** (Results 🟡 / Company view 🟡)
- Canonical (nav): **`/stream`** — uses the current persona-stream loader + `OptimizationCard`.
- Variants: **`/insights/*`** (7 pages: analytics, performance, compensation, trends, my-team, sales-finance, index) — standalone BI dashboards, *no* persona-dispatch → an **earlier** expression (the "visualization vision"); **`/perform`** (OB-105 "Module-Aware Persona Dashboard", 515L) — a *distinct, still-substantive* expression the MIR profile points to for **Company view 🟡**; **`/data/reports`** (revenue reporting).
- Empty/stranded: `/perform/{compensation,team,trends}` (7L skeletons).
- *Signal:* `/stream` is canonical; `/insights/*` is the recoverable BI suite (VISION); `/perform` is a KEEP candidate for company-view.

**C2 — Approvals** (🟠 MIR-CRITICAL) — five surfaces
- **`/approvals`** ("Approval Center — central hub for ALL approval requests", 378L) — self-describes as the general hub → likely canonical.
- **`/performance/approvals`** ("Pending", 338L) + **`/performance/approvals/plans`** (424L) + `/performance/approvals/payouts` (drill) — performance-scoped.
- **`/govern/calculation-approvals`** ("Calculation Approval Center — AI risk assessment", 297L) — calc-scoped.
- Empty: `/govern/approvals`, `/operate/approve`.
- *Signal:* `/approvals` is the intended hub; the others are capability-specific → **absorb into `/approvals` or keep as its sub-tabs**; retire the empties.

**C3 — Adjustments / Disputes** (🔴 MIR-CRITICAL)
- **`/performance/adjustments`** ("Adjustments — outcome adjustments, credits, corrections", OB-73, 476L/23 data-hooks) — canonical, substantive.
- Empty: `/investigate/adjustments`.
- *Note:* MIR **Disputes 🔴** is a flow gap (DIAG-063 #12: schema E4 / flag E3 / resolve+audit E3 / recalc E3) — this page is the nearest surface; the recovery build wires the dispute flow beneath it.

**C4 — Statements** (🟠 MIR-CRITICAL) — two rep-facing expressions
- **`/perform/statements`** ("Commission Statement — entity-scoped payout + component breakdown", OB-171, 655L/28 data-hooks) — most mature.
- **`/my-compensation`** ("My Compensation — personal performance dashboard", OB-34, 522L).
- *Signal:* two expressions of the rep statement. **This is the audit's open product question** (rep statement = `/stream` card vs `/perform/statements` vs `/my-compensation`) — architect decides by viewing.

**C5 — Audit** (🟠 MIR-CRITICAL) — four surfaces
- **`/admin/audit`** ("Total Entries", 575L, 3 stub) — most mature, lowest stub density → canonical candidate.
- **`/operations/audits`** (563L, **12 stub**) + **`/operations/audits/logins`** (303L, 11 stub) — older, stubby variant.
- Empty: `/investigate/audit`, `/govern/audit-reports`, `/govern/data-lineage`.
- *Signal:* `/admin/audit` is the mature expression; `/operations/audits*` is earlier (high stub density); empties stranded.

**C6 — People / Teams / Roles / RBAC** (config / no-MIR → VISION)
- Canonical (nav): **`/configure/people`**.
- Richest stranded work: **`/workforce/*`** — personnel (853L), teams (584L), roles (491L), permissions (492L) — the most-developed people+RBAC suite.
- RBAC sub-cluster: **`/admin/access-control`** (397L) + `/workforce/{permissions,roles}` — three RBAC expressions.
- Also: `/configuration/{locations(407L),terminology(381L)}` substantive; `/configuration/{personnel,teams}` empty.
- *Signal:* the people/RBAC vision is richest in `/workforce/*`; **absorb into Platform Core `/configure/*`**.

**C7 — Config landings / settings**
- Two landings: **`/configure`** ("Configure Workspace Landing", 169L) vs **`/configuration`** ("View Only Mode", 276L). `/configuration/terminology` (381L) is a unique recoverable capability (terminology customization). Empties: `/configure/{system,data-specs,organization/locations,organization/teams}`.

**C8 — Data console / import / quality** (MIR-SUPPORTING)
- Canonical (nav): **`/operate/import`** + `/operate/monitor/*`.
- Variants: **`/data`** ("Records Today" console) + `/data/{quality(404L),transactions(199L),reports,operations,readiness}`; **`/data/import/enhanced`** (4306L! — the massive OLD import UI, superseded by `/operate/import`).
- Quality/readiness sub-cluster (5 expressions): `/data/quality`, `/operate/monitor/quality`, `/operations/data-readiness` (539L), `/operate/monitor/readiness`, `/data/readiness`.
- *Signal:* `/operate/*` canonical; `/data/*` is the older data console; **retire/absorb**.

**C9 — Calculate / period-close console**
- Canonical (nav): **`/operate/calculate`**.
- Variant: **`/admin/launch/calculate`** (1124L/40 data-hooks — big OLD period-close console) + **`/admin/launch/calculate/diagnostics`** (409L — calc-prereq checker, possibly worth recovering as a diagnostics tool). Empties: `/admin/launch/{plan-import,reconciliation}`.

**C10–C16 (smaller):** C10 `/operate/pay` (Payroll Overview, 342L). C11 `/operate/import/quarantine` (Quarantine Resolution, 314L). C12 Finance extras `/financial/{patterns,products,summary}` (all substantive; re-home into Finance). C13 Ops `/operations/rollback` (587L), `/operations/messaging` (405L). C14 Standalone: `/acceleration` (635L accelerator/SPIFF), `/notifications` (514L), `/spm/alerts` (398L), `/integrations/catalog` (509L). C15 `/admin/tenants/new` (831L tenant onboarding). C16 Plan design `/design/{budget,goals,plans/new}` (empty/stub → DISCARD).

---

## §C — THE FULL MAP (all 81, grouped by priority lane)

Metrics = **L**ines / **J**SX-components / **H**andlers / **D**ata-hooks / **S**tub-markers. Class = SUB(stantive) / PART(ial) / EMPTY.

### LANE 1 — MIR-CRITICAL (walk first)
| Path | Inferred name | Class | L/J/H/D/S | What it does | MIR | Cluster |
|---|---|---|---|---|---|---|
| `/performance/adjustments` | Adjustments (credits/corrections) | SUB | 476/20/13/23/4 | manage outcome adjustments → recalc | **Disputes/Adjustments 🔴** | C3 |
| `/approvals` | Approval Center (all requests) | SUB | 378/30/5/13/3 | central approval hub | **Approvals 🟠** | C2 |
| `/performance/approvals` | Approvals — Pending | SUB | 338/23/4/12/0 | performance approval queue | **Approvals 🟠** | C2 |
| `/performance/approvals/plans` | Plan Approvals | SUB | 424/23/4/12/0 | plan-change approvals | **Approvals 🟠** | C2 |
| `/govern/calculation-approvals` | Calculation Approval Center | SUB | 297/21/6/9/1 | calc approvals + AI risk | **Approvals 🟠** | C2 |
| `/perform/statements` | Commission Statement | SUB | 655/10/7/28/1 | entity-scoped payout+component breakdown | **Statements 🟠** | C4 |
| `/my-compensation` | My Compensation | SUB | 522/33/4/16/0 | rep personal performance dashboard | **Statements 🟠** | C4 |
| `/admin/audit` | Audit — Total Entries | SUB | 575/41/8/9/3 | audit trail viewer | **Audit 🟠** | C5 |
| `/operations/audits` | Audit log (ops) | PART | 563/36/5/7/12 | audit log (stubby variant) | **Audit 🟠** | C5 |
| `/operations/audits/logins` | Login audit | PART | 303/27/4/6/11 | login audit (stubby) | **Audit 🟠** | C5 |
| `/investigate/adjustments` | — | EMPTY | 2/0/0/0/0 | skeleton | Disputes 🔴 | C3 → DISCARD |
| `/govern/approvals` | — | EMPTY | 2/0/0/0/0 | skeleton | Approvals 🟠 | C2 → DISCARD |
| `/operate/approve` | — | EMPTY | 7/0/0/0/0 | skeleton | Approvals 🟠 | C2 → DISCARD |
| `/investigate/audit` | — | EMPTY | 2/0/0/0/0 | skeleton | Audit 🟠 | C5 → DISCARD |
| `/govern/audit-reports` | — | EMPTY | 2/0/0/0/0 | skeleton | Audit 🟠 | C5 → DISCARD |
| `/govern/data-lineage` | — | EMPTY | 2/0/0/0/0 | skeleton | Audit/lineage 🟠 | C5 → DISCARD |

### LANE 2 — MIR-SUPPORTING (walk)
| Path | Inferred name | Class | L/J/H/D/S | What it does | MIR | Cluster |
|---|---|---|---|---|---|---|
| `/perform` | Module-aware persona dashboard | SUB | 515/13/6/15/0 | persona/company landing (OB-105) | **Company view 🟡** | C1 |
| `/insights` | Insights — Average Outcome | SUB | 374/23/1/9/0 | BI overview | **Results 🟡** | C1 |
| `/insights/analytics` | Advanced Analytics Dashboard | SUB | 526/32/13/8/0 | KPIs, drill-down, export | **Results 🟡** | C1 |
| `/insights/performance` | Team Performance Score | SUB | 730/35/1/6/1 | performance BI | **Results 🟡** | C1 |
| `/insights/compensation` | Compensation — Current Period | SUB | 581/36/1/7/2 | comp BI | **Results 🟡** | C1 |
| `/insights/trends` | Trends | SUB | 587/35/2/3/1 | trend BI | **Results 🟡** | C1 |
| `/insights/my-team` | Team performance overview | SUB | 398/16/1/6/2 | manager team BI | **Results 🟡** | C1 |
| `/insights/sales-finance` | Sales-Finance Overview | SUB | 330/16/0/9/1 | sales/finance BI | **Results 🟡** | C1 |
| `/data/reports` | Reports — Total Revenue | SUB | 224/21/4/4/0 | revenue reporting | **Results 🟡** | C1/C8 |
| `/data/quality` | Data Quality | SUB | 404/24/5/14/0 | data quality issues | data-quality | C8 |
| `/operations/data-readiness` | Data Readiness | SUB | 539/41/11/3/4 | readiness scoring | data-readiness | C8 |
| `/operate/monitor/quality` | Monitor — Data Quality | SUB | 174/13/2/2/0 | quality monitor | data-quality | C8 |
| `/data/transactions` | All Transactions | SUB | 199/14/9/8/4 | transaction browser | import surface | C8 |
| `/operate/import/quarantine` | Quarantine Resolution | SUB | 314/13/9/10/0 | resolve quarantined imports | import surface | C11 |
| `/data` | Data console — Records Today | PART | 367/22/0/0/1 | data landing (no data-hooks → mock) | import surface | C8 |
| `/data/operations` | Data operations | PART | 247/23/2/1/1 | ops console | import surface | C8 |
| `/data/readiness` | Readiness (thin) | PART | 44/5/1/4/0 | readiness (thin) | data-readiness | C8 |
| `/operate/monitor/readiness` | Monitor — Readiness | PART | 170/11/0/1/0 | readiness monitor | data-readiness | C8 |
| `/operate/monitor/operations` | Monitor — Operations | PART | 87/7/0/1/0 | ops monitor | import surface | C8 |
| `/data/import/enhanced` | Data Package Import (OLD) | PART | 4306/44/25/68/5 | massive OLD import UI (superseded) | import surface | C8 |

### LANE 3 — VISION (substantive, no MIR map — recoverable design capital)
| Path | Inferred name | Class | L/J/H/D/S | What it does | Cluster |
|---|---|---|---|---|---|
| `/acceleration` | Accelerator — Participants | SUB | 635/26/3/2/1 | SPIFF/accelerator program UI | C14 |
| `/notifications` | Notifications | SUB | 514/25/12/16/2 | global notifications center | C14 |
| `/spm/alerts` | Alerts | SUB | 398/25/10/5/3 | alert management | C14 |
| `/integrations/catalog` | Integrations Catalog | PART | 509/38/18/7/12 | integrations directory | C14 |
| `/admin/access-control` | Access Control (RBAC) | SUB | 397/35/11/15/0 | role/permission editor | C6 |
| `/workforce/permissions` | Permissions (RBAC) | SUB | 492/35/10/14/3 | permission matrix | C6 |
| `/workforce/roles` | Roles | SUB | 491/31/15/16/1 | role management | C6 |
| `/workforce/personnel` | Personnel | PART | 853/44/21/15/17 | personnel mgmt (high stub) | C6 |
| `/workforce/teams` | Teams | PART | 584/48/16/6/14 | team mgmt (high stub) | C6 |
| `/configuration` | Config landing (View Only Mode) | SUB | 276/29/1/3/4 | config hub | C7 |
| `/configuration/terminology` | Terminology customization | SUB | 381/27/12/11/2 | per-tenant terminology | C7 |
| `/configuration/locations` | Locations | PART | 407/36/12/7/15 | location config (high stub) | C6/C7 |
| `/configure/users/invite` | User Invite + entity promotion | SUB | 305/31/8/15/3 | invite users, link entities | C6 (Platform Core) |
| `/admin/launch/calculate` | Period Close / Calculation (OLD) | SUB | 1124/51/18/40/2 | OLD calc console (superseded) | C9 |
| `/admin/launch/calculate/diagnostics` | Calculation Diagnostics | SUB | 409/19/2/17/1 | calc prereq checker | C9 |
| `/operate/pay` | Payroll Overview | SUB | 342/20/4/14/0 | payroll status/finalization | C10 |
| `/operations/rollback` | Rollback Management | SUB | 587/38/16/18/4 | rollbacks, checkpoints, resets | C13 |
| `/operations/messaging` | Messaging | PART | 405/29/6/6/16 | messaging (high stub) | C13 |
| `/admin/tenants/new` | New Tenant (onboarding) | PART | 831/23/17/9/6 | platform tenant provisioning | C15 |
| `/financial/patterns` | Operational Patterns | SUB | 378/22/3/14/1 | hourly/day heatmap (POS) | C12 (Finance) |
| `/financial/products` | Product Mix Dashboard | SUB | 368/30/1/9/0 | category analysis (POS) | C12 (Finance) |
| `/financial/summary` | Operating Summary (P&L) | SUB | 340/23/1/9/0 | P&L per-location | C12 (Finance) |
| `/configure` | Configure landing | PART | 169/7/1/2/0 | config landing | C7 |
| `/configure/locations` | Locations (configure) | PART | 71/5/2/1/0 | location config | C7 |
| `/configure/teams` | Teams (configure) | PART | 67/4/2/1/0 | team config | C7 |

### LANE 4 — DISCARD (EMPTY/stub — confirm, then remove; **architect does NOT walk these**)
`/investigate/adjustments` · `/investigate/audit` · `/investigate/entities` · `/investigate/reconciliation` · `/govern/access` · `/govern/approvals` · `/govern/audit-reports` · `/govern/data-lineage` · `/design/budget` · `/design/goals` · `/design/plans/new` · `/configuration/personnel` · `/configuration/teams` · `/configure/data-specs` · `/configure/system` · `/configure/organization/locations` · `/configure/organization/teams` · `/perform/compensation` · `/perform/team` · `/perform/trends` · `/operate/approve` · `/operate/briefing` · `/admin/users` · `/admin/launch/plan-import` · `/admin/launch/reconciliation` · `/performance/goals` ("Goals not yet implemented" per its own doc-comment)
> All ≤~50 lines with ~0 components/actions, or self-declared not-implemented. **Auto-flagged — architect confirms the list, then they're removed in the retire/redirect increment.** Not wired into the temp menu.

---

## §D — HOW TO WALK (the temporary menu)

**The walkable menu is the `/recovery` page** (`web/src/app/recovery/page.tsx`) — platform-admin-only, **NOT part of the agent nav** (zero changes to `workspace-config.ts` or the four agents — SR-34). It lists every SUBSTANTIVE+PARTIAL page (Lanes 1–3), grouped by priority lane, each tagged with its inferred name, substance class, MIR map+state, lineage cluster, and metrics, with an "open ↗" link (new tab).

- **Walk URL:** `vialuce.ai/recovery` (log in as platform-admin first). Non-platform roles are redirected to `/unauthorized`.
- **Design choice (why a standalone page, not a sidebar workspace):** maximal reversibility + zero agent-nav blast radius. Per SR-34, the temp surface must be "a separate platform-admin-only section, NOT part of the agent-governed nav." A standalone gated page is exactly that and is **removable in one file delete** (`rm web/src/app/recovery/page.tsx`) with no nav edit to revert. (If you'd prefer a sidebar entry instead, that's a one-line follow-up — flagged, not done, to avoid touching the four-agent nav.)
- **Clearly temporary:** the page renders a removal banner and carries a `// TEMP — OB-211 recovery scaffolding; delete after the walk` header.

**The walk → the decision (next directive, not this one):** per page/cluster the architect decides **KEEP** (recover + wire the platform beneath the design — for MIR-critical, DIAG-063 already specifies the build: Disputes E4, statements E2/E3, audit E4, approvals/recalc E4), **ABSORB** (merge into the canonical sibling — e.g. the 5 approval surfaces → `/approvals`; `/workforce/*` → `/configure`), or **DISCARD** (the Lane-4 empties + superseded variants). That decision set scopes the recovery BUILD directive.

---

## §E — REPRODUCE
```
bash web/scripts/ob211-substance-scan.sh           # the measured table (lines/jsx/handlers/data-hooks/stubs)
# walk surface: web/src/app/recovery/page.tsx  → vialuce.ai/recovery (platform-admin)
```
**Flagged unknowns (architect resolves by viewing):** pages whose purpose the doc-comment/heading didn't reveal are tagged "view to identify" in `/recovery`; canonical-vs-stranded within each cluster is content-*indicated*, architect-*confirmed*; the `MIR_CAPABILITY_STATUS_PROFILE_R1` file was absent so DIAG-063 + the directive's stated states were used (re-map if the R1 profile differs).

### One-line status for the artifact sync
81 orphans scanned + measured: ~40 SUBSTANTIVE / ~16 PARTIAL / ~25 EMPTY. Lineage clustered from CONTENT not git (16 clusters; canonical-vs-stranded indicated per cluster). MIR-mapped (DIAG-063 + directive states; the R1 profile file is not in-repo — noted). Priority-laned: MIR-CRITICAL (adjustments/approvals×5/statements×2/audit), MIR-SUPPORTING (Insights BI×7/perform/data-quality), VISION (RBAC, accelerator, payroll, rollback, finance extras, tenant onboarding). A standalone platform-admin-only `/recovery` page wires the substantive set in, tagged + prioritized, removable in one delete (SR-34: no agent-nav change). Empties auto-flagged DISCARD (not walked). Pending the architect's walk → keep/absorb/discard → the recovery-build directive.
