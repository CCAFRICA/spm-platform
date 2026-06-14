# OB-207 — Agent-Nav Spine + Routing — Completion Report (Increment 1)

**Date:** 2026-06-14 · **Branch:** `ob-207-agent-experience-architecture` → `main`
**Governing:** Capability Board R4, DS-013, Decision 128, CLT-84-F20
**Status:** **SKELETON SHIPPED** — Phase 1 (agent-nav spine) + Phase 2 (routing convergence) delivered,
building (exit 0), verified. Phases 3–6 (cockpit, persona results, FM views, action proximity) are the
next increments — see "Scope of this increment" below.

**Collision gate:** `ls docs/.../OB-207*` → none · `git log --all | grep -i OB-207` → none. Number retained.

---

## Scope of this increment (honest delineation)

OB-207 is a 6-phase vertical slice with explicit skeleton-first discipline: *"if execution must stop,
the skeleton stands and prior phases are independently shippable."* This increment delivers the
**skeleton (the agent-nav spine)** and the **routing convergence** that the spine depends on, as a
clean, building, verified unit. The surface-hanging phases (3 cockpit, 4 persona+module results, 5
action proximity, 6 bliss/compliance) are substantial dedicated builds and are scoped as **Increment 2**
— rather than half-build four surfaces into an unverified or broken tree, this ships the structural
foundation correctly. Notably, **Phase 2 (F-1 routing) was already closed by OB-206** (PR #505), and the
**Phase-4 Manager entity×component heatmap already shipped in OB-206** — both verified below.

---

## Phase commits (SHAs)

| Phase | SHA | Scope |
|---|---|---|
| 1 — ADR | `c41ee5e3` | Agent-navigation ADR (route→agent mapping) + action-schema probe |
| 1 — spine | `70f109c6` | `WorkspaceId` union + `WORKSPACES` config + all consumers migrated |

(ADR commit precedes the spine commit on the branch.)

---

## Phase 1 — Agent-Nav Spine (PG-01, PG-02)

**ADR** (`docs/architecture/AGENT_NAVIGATION_ADR_OB207.md`): navigation reorganizes around the four
Capability-Board agents — three ACTS + Platform Core foundation. Route→agent mapping (grouping only,
**every route path unchanged** — SR-34, no URL moves, HALT-2 not triggered):

| Agent (`WorkspaceId`) | Routes |
|---|---|
| `decide` | `/stream` (HOME, default), `/operate/results` |
| `calculate` | `/operate` (cockpit), `/operate/import`, `/operate/import/history`, `/operate/calculate` |
| `consolidate` | `/operate/reconciliation`, `/financial` + all `/financial/*` |
| `platform-core` | `/configure/periods`, `/configure/people`, `/configure/users` |

**Migration (all consumers, build-verified):** `WorkspaceId` union (`types/navigation.ts`),
`WORKSPACES` + `getWorkspaceForRoute` + `getDefaultWorkspaceForRole` (`workspace-config.ts`),
`ROLE_WORKSPACE_ACCESS`/`DEFAULT_WORKSPACE_BY_ROLE`/`WORKSPACE_FEATURE_ACCESS` (`role-workspaces.ts`),
`command-registry.ts` tags, `queue-service.ts` grouping, `design/tokens.ts` characters,
`navigation-context.tsx` default, `ChromeSidebar`/`WorkspaceSwitcher` icon maps, the three
`[...slug]` catch-all stubs + `WorkspaceStub` roots. **Build exit 0.**

`/stream` is the default workspace (`decide`) for every persona (Decision 128).

---

## Phase 2 — Routing Convergence (PG-03, PG-04, PG-05) — verified (closed by OB-206)

**§4.1 entry-path enumeration (file:line → landing):**

| Path | Location | Lands |
|---|---|---|
| middleware platform-admin + tenant cookie | `middleware.ts:327` | `/stream` ✓ |
| middleware roleDefaults (all roles) | `middleware.ts:335` | `/stream` ✓ |
| tenant-context post-selection push | `tenant-context.tsx:196` | `/stream` ✓ |
| root page redirect | `app/page.tsx:21` | `/stream` ✓ |
| select-tenant single-tenant | `select-tenant/page.tsx:26` | `/` → `/stream` ✓ |

All entry paths converge on `/stream` (Decision 128). The platform-admin `/operate` early-return —
the F-1 bug — was fixed in **OB-206** (`/operate`→`/stream`, no loop: the redirect fires only on
`'/'|'/login'`). **PG-05:** no `/operate`→`/stream` or `/stream`→`/operate` counter-redirect; the
`/operate` `router.push` calls are intra-Calculate back-nav buttons, not landing redirects. SR-34
honored (no counter-redirect added).

---

## Verification (PGs in scope for this increment)

- **PG-01** agent-nav spine renders — config migrated; sidebar reads `WORKSPACES` generically. Authenticated render = SR-44.
- **PG-02** ADR committed — `AGENT_NAVIGATION_ADR_OB207.md` with the route→agent mapping. ✓
- **PG-03** platform-admin → /stream — `middleware.ts:327`. ✓ (OB-206)
- **PG-04** entry paths enumerated + converged — table above. ✓
- **PG-05** no loop / no counter-redirect — grep clean. ✓
- **PG-17** Korean Test — nav config carries zero hardcoded domain literals (agent verbs + labels are config). ✓
- **PG-18** build exit 0 — touched files warning-clean. ✓

**Deferred to Increment 2 (the surfaces hung on the skeleton):** PG-06 (cockpit Cycle/Pulse/Queue —
services exist: `compensation-clock-service`/`cycle`/`pulse`/`queue`), PG-07/08/09 (ICM persona results
— Manager heatmap already shipped OB-206; Admin anomaly actions + Individual remain), PG-10/11 (module
awareness + FM views on committed_data), PG-12/13/14 (action proximity — `agent_inbox` confirmed
present; `audit_logs` actor column differs from `actor_id`, to resolve), PG-15/16 (ambient + Bliss tokens).

---

## HALT dispositions (this increment)

- **HALT-2 (URL moves):** NOT triggered — the spine is grouping/relabeling only; every route path is
  unchanged. Deep links intact.
- All other HALTs pertain to the deferred surface phases (cockpit/results/FM/actions) and will be
  assessed in Increment 2 (the §3.3 audits show the data paths exist — per-component payout present,
  `agent_inbox` present).

---

## Residuals carried

R1 Executive persona · R2 Mobile server (FM) · R3 CompensationClockService consolidation · R4
per-component attainment persistence · R5 scale/pagination · R6 persona-scope hardening (DS-027) · R7
Warm/Hot adaptation · R8 R1 exit-criteria. Plus **section-level featureFlag gating** for the Financial
section under Consolidate may need Sidebar wiring (the flag is on the section; render-time gating to verify).

---

## ARTIFACT SYNC

```
ARTIFACT SYNC
MC: CLT-84-F20 nav IA metaphor-mix → RESOLVED by the agent-nav spine; F-1 routing → CLOSED (OB-206, re-verified). F-2/F-3/F-4/F-5 surfaces → Increment 2.
REGISTRY: NEW "Agent Navigation Spine" → L1 SPECIFIED → L2 on SR-44; Platform Core / Calculate / Decide / Consolidate established as the nav foundation.
R1: Tier C candidate "nav organized by agent; all roles land on /stream" → pending SR-44.
BOARD: all four agent rows touched at the navigation layer (the spine); the surfaces they carry are Increment 2.
SUBSTRATE: Capability-Board agents made navigational; Decision 128 enforced end-to-end; CLT-84-F20 resolved structurally.
```

---

*OB-207 Increment 1 (skeleton + routing) · 2026-06-14 · vialuce.ai*
