# OB-211 Phase A — Agent-Governed Nav Keystone: Completion Report

**Date:** 2026-06-15 · **Branch:** `ob211-phaseA-nav-agents` · **Gate:** #519 (Stage 1) on main (`0dc32609`). · **The keystone:** defines where surfaces live (the results-table placement, the Finance gating). The opening verify fan-out (6 agents) re-grounded all four phases on current main first.

## Opening verify fan-out — all premises CONFIRMED on current main
- **A (nav):** `WorkspaceId` verb-based; `/operate/results→'decide'` override (`:257`); the inert menu gate (`:223` short-circuit + `ChromeSidebar:180` omits `enabledFeatures`); ChromeSidebar **already** gates by workspace-level `ws.featureFlag` (`:168-174`) against `currentTenant.features` (the lever for the fix); regrouping needs **no** schema change.
- **B:** the results-table double-gate (`isVLAdmin` blocks tenant admin), G1 (`results.length` off `calculation-service.ts:385`), the two inline drill states (`:113/:119`), the export hierarchy gap (HALT-EXPORT — `entity_relationships`, a `traverseGraph` helper exists but isn't wired client-side).
- **D:** the 5 `parseTiers` sites (594/734/835/1050/1091, all gate `tiers.length<2`; 594+734 are Simulate proper); the loader does **not** import the classifier; **`classifyComponentRegime` is a CLEAN call from the loader — no adapter** (the `ComponentDef` index signature admits `metadata.intent`; same `rule_sets.components` source). This collapses Phase D to a convergence.

## Phase A — the reorganization (SR-34: reorganize, don't replace)
Internal IDs retained for minimal blast radius (the user-facing identity is the agent **label**):
- **Performance** (`decide`) — `/stream`. (Results moved OUT.)
- **Calculation** (`calculate`) — cockpit/import/calculate **+ Results** (moved from `decide`) **+ Reconciliation** (moved from Consolidate). The sign-off→export flow.
- **Finance** (`finance`, was `consolidate`) — `/financial/*` only; **`featureFlag: 'financial'` at the WORKSPACE level** → ChromeSidebar's existing `ws.featureFlag` check drops the whole Finance agent for a non-Finance tenant (the menu reflection of WS7-A's route gate — Finance now gated at **both** layers).
- **Platform Core** — substrate (`/configure/*`).
- **"Consolidate" REMOVED.** `getWorkspaceForRoute`: `/operate/results→calculate`, `/operate/reconciliation→calculate`, `/financial→finance`.

**The Finance menu-gate fix (elegant):** rather than plumb `enabledFeatures` through the inert section path, the Finance agent is gated at the **workspace** level — `ChromeSidebar:170-172` already reads `ws.featureFlag` against `currentTenant.features`, dormant only because no workspace used it. Adding `featureFlag:'financial'` to the `finance` workspace activates it. No ChromeSidebar change.

## Re-verify
- `consolidate`→`finance` type change surfaced **7 consumers** (`Record<WorkspaceId,…>` maps in ChromeSidebar, WorkspaceSwitcher, queue-service, role-workspaces ×4) — all renamed; tsc caught every one (nothing silently broke). Two more dead keys (WorkspaceStub, tokens) aligned. **Zero workspace-keyed `consolidate` refs remain.**
- `npx tsc --noEmit` → **0**; `npm run build` → **exit 0, ✓ Compiled successfully**.
- Finance entitlement (code-level): workspace `featureFlag:'financial'` + ChromeSidebar `ws.featureFlag` gate → a non-Finance tenant's sidebar drops Finance; combined with WS7-A's route gate, Finance is gated at **menu + route**.

## Gates
- HALT-GENERAL honored: reorganized the existing nav (no parallel system); the Finance gate reuses the existing workspace-level check.
- HALT-NAV did NOT fire (regrouping = data, no schema change — fan-out confirmed).
- SR-44 (render): the sidebar shows Calculation/Performance/Finance/Platform Core; Finance absent for a non-Finance tenant; results under Calculation — architect confirms on the live tenant.

---

*OB-211 Phase A · 2026-06-15 · the agent-governed nav keystone. Parallel arms next: Phase B (verified fixes) ∥ Phase D (Simulate convergence — the strategic co-phase, NOT deferred) ∥ Phase C (RLS plan).*
