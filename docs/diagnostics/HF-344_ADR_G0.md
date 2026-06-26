# HF-344 — Architecture Decision Record + G0 (before code)

*Persona-Conditional Panel Rendering: Display-Layer Scoping*
*2026-06-26 · vialuce.ai · Substrate: DS-013 · DS-014 §8.2 · Decision 123 · DD-7*
*Standing rules embedded: CC_STANDING_ARCHITECTURE_RULES.md v3.0. Drafting: INF_Structured_Compliant_Drafting_Reference_20260513.md.*

---

## Sequence / branch / HALT-D

- **HF-344** is the next available number (HF-343 abandoned, PR #600 closed without merge).
- Branch `hf-344-persona-conditional-panel-rendering` cut fresh from `main`.
- **HALT-D evaluated.** `main` HEAD is `cfb1ee97` (DIAG-077 docs commit), **not** `9cda286b`. The delta from `9cda286b` is exactly ONE docs-only commit (`cfb1ee97` DIAG-077 spatial map, +1061 lines, no code). HF-343 code artifacts (`resolveAuthenticatedScope`, `useAuthScope`, `scopeIsDeny`/`scopeIsNarrowed`) are **absent** — the revert held. HALT-D does NOT fire (its trigger is "HF-343 changes present"). The DIAG-077 doc is the architect's authoritative scope map and directly informs this HF; branching from `cfb1ee97` is correct.

---

## ARCHITECTURE DECISION RECORD

**Problem:** When the VL admin persona switcher selects "Rep" or "Manager," ICM/Intelligence pages still render tenant-wide aggregate panels (Period Total $58,406, System Health / 85 entities, Top Accelerator, Population Distribution, leaderboards) — numbers a rep or manager must never see. The persona-switcher *preview* of each role is therefore wrong. This is a **display-layer** defect: what RENDERS per persona, not what data is ACCESSIBLE.

### Option A — Display-layer conditional gating in page files (CHOSEN)
Read the existing effective persona (`usePersona().persona`, or `usePersonaTheme().persona` where already imported) on each affected page and gate the tenant-wide panel JSX behind `persona === 'admin'`. Rep/manager render only their persona-specific dashboard (`/perform`) or a reduced state (Intelligence pages).
  - Scale test (10x): N/A — JSX conditionals, no new data/transport. Works at any scale.
  - AI-first: no hardcoding; reads the existing persona value (Korean Test irrelevant — structural).
  - Transport: no data through HTTP bodies; no new fetches.
  - Atomicity: pure render conditionals; no state mutation, no failure surface.

### Option B — Authorization-layer scope fix (REJECTED — this is the subsequent OB)
Close `ALL_INSIGHTS_SCOPE` (empty-means-all), make `resolveEntityScope` fail-CLOSED, stand up a real `profile_scope` producer, re-derive tenant+entity scope server-side from the authenticated session, capability-derive navigation.
  - Rejected: that is DIAG-077's full platform-wide OB (8 shared data fns, 35 surfaces, server hardening, auth-context extension). Out of this HF's blast radius. HF-344 is the **display-layer interim** that makes the walkthrough correct NOW; the data-layer fix is separate and larger (§6A residual 1).

### Option C — Extract shared panels into a persona-gated wrapper component (REJECTED)
Lift the tenant-wide panels into a new `<TenantWidePanels>` component gated once.
  - Rejected: Phase 0 found every affected page is HALT-C **SAFE** — the tenant-wide panels are contiguous, discrete JSX blocks gateable in-file. A wrapper extraction would touch >3 files and the shared dashboard/panel components (forbidden by PG-7), adding blast radius for no benefit.

**CHOSEN: Option A** because it is the minimal, behavior-preserving (DD-7) change that satisfies the directive's display-layer mandate with zero edits to data functions, contexts, navigation, permissions, or dashboard/panel components.
**REJECTED: Option B** (subsequent OB scope), **Option C** (unnecessary blast radius; HALT-C is SAFE everywhere).

### GOVERNING PRINCIPLES EVALUATION (Decisions 123 & 124)
- **G1 (Standard):** DS-014 §4/§8.2 — the role→visibility matrix (member→own, manager→team, admin→all). DS-013 — persona determines content adapted to role.
- **G2 (Architectural embodiment):** the persona value is the single render gate; admin path is byte-identical (DD-7), so the change is structurally a *subtraction* for non-admins — no new surface to drift. (Note: this HF embodies the *display* of the matrix, not its *enforcement* — enforcement is the Option-B OB. Stated transparently per GP-1.)
- **G3 (Traceability):** each gated block is a single `{persona === 'admin' && (…)}` wrapper in the page file — auditable from the diff alone.
- **G4 (Discipline):** cognitive-fit / role-appropriate information scent (DS-013/DS-014) — a viewer sees only the population they belong to.
- **G5 (Abstraction):** the gate keys on the abstract persona ('admin'|'manager'|'rep'), domain-agnostic; works for any tenant/domain.
- **G6 (Innovation boundary):** no new mechanism — reuses the existing persona context.

---

## SCOPE (confirmed by Phase 0 codebase map — 11 candidate pages analyzed)

### IN SCOPE — 8 ICM/Intelligence pages (page-file JSX only)
| Page | Treatment | Persona read |
|---|---|---|
| `/perform` | full-persona-dashboard: gate shared ICM panels + PeriodCards to admin; rep/manager → their RepDashboard/ManagerDashboard only | `usePersona().persona` (l.114) |
| `/stream` | gate IcmStream tenant-wide panels (`isAdmin`); keep persona-scoped InsightNarrative; reduced state | `usePersonaTheme().persona` → `isAdmin` (l.456) |
| `/insights` | gate body + PeriodCards; reduced state | `usePersonaTheme().persona` (l.55) |
| `/insights/compensation` | gate ICM money-lens body + PeriodCards; reduced state (hospitality branch left — Financial) | `usePersonaTheme().persona` (l.106) |
| `/insights/performance` | gate ICM standings branch; reduced state (hospitality "Executive View — National" branch left — Financial) | `usePersonaTheme().persona` (l.123) |
| `/insights/analytics` | gate body + PeriodCards; reduced state | `usePersonaTheme().persona` (l.64) |
| `/insights/trends` | gate body; reduced state (no PeriodCards on this surface) | `usePersonaTheme().persona` (l.79) |
| `/acceleration` | gate Stat/Top-Performers/Movers/Coaching + PeriodCards; KEEP rep "My Rank"; manager reduced | `usePersona().persona` (l.63) |

### EXCLUDED (with reason)
- `/my-compensation` (+ re-export `/perform/compensation`) — own-entity scoped (`extractEmployeeId(user.email)`); no tenant aggregates.
- `/perform/statements` — entity-scoped at the read layer (`scope.entityIds`/`entityId`).
- `/insights/my-team` (+ re-export `/perform/team`) — renders the **hospitality/restaurant** branch (Financial, separate scope per DIAG-077 §5.F) and the non-hospitality branch already attempts `resolveEntityScope`; page does not import persona.
- **Hospitality branches inside `/insights/compensation` and `/insights/performance`** — DIAG-077 tags these "Financial — separate scope." Deferred to the Financial persona directive.
- `/financial/*` (11 pages) — Financial separate scope (§6, DIAG-077 §5.F).
- `/operate/*` — `RequireCapability`-gated admin/calculate-workspace surfaces (DIAG-077 §5.C "correctly admin-scoped"); a real member cannot reach them, and the persona switcher does not drop the VL admin's capabilities.

### HALT evaluation
- **HALT-A** (provider not wrapped): NOT triggered. Every affected page resolves persona (directly via `usePersona` or indirectly via `usePersonaTheme`, which reads `usePersona`), so `PersonaProvider` is wrapped on all of them.
- **HALT-B** (dashboards missing): NOT triggered. `AdminDashboard`/`ManagerDashboard`/`RepDashboard` exist at `components/dashboards/` and render on `/perform`.
- **HALT-C** (un-wrappable structure / >3-file extraction): NOT triggered on any page — Phase 0 verified every tenant-wide block is contiguous, discrete JSX gateable in-file. All 8 pages are surgical single-file changes.
- **HALT-D** (HEAD ≠ 9cda286b): evaluated above — does not fire (docs-only delta; HF-343 code absent).

---

## Behavior preservation (DD-7) discipline

Every gated block is wrapped so the **admin branch contains the original JSX verbatim** (`{persona === 'admin' && (…original…)}` or `persona === 'admin' ? (…original…) : (…reduced…)`). A fragment adds no DOM. Admin renders byte-identical; the only behavioral change is rep/manager see LESS. No panel is added.

## Reconciliation-channel separation

No ground-truth values in this work. The only figures referenced ($58,406 / 85 entities / $1,505) are from architect screenshots documenting the current (wrong) behavior. No calculation, no recompute, no recon target.

## Residuals carried (see completion report §Residuals)

1. **RepDashboard / ManagerDashboard $0 (data-state, out of blast radius).** `getRepDashboardData` only falls back to the top entity when `entityId` is **null**; persona-context passes a non-null *sample* individual entity that may have no `entity_period_outcomes` row → $0. `getManagerDashboardData` receives brand **location** IDs but outcomes are keyed by individual entities → $0/0. Both are persona-context scope-resolution issues (PG-6 forbids editing persona-context) — diagnosed, not fixed here.
2. **DIAG-077 platform-wide authorization OB** remains the prerequisite for the real fix.
3. **Hospitality/Financial branches** inside Intelligence pages deferred to the Financial persona directive.
4. **PDR-05** (persona-switcher integration) unchanged.
