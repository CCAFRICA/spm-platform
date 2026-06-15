# OB-211 WS-7-rev Orchestration Plan — Agent-Governed Navigation + Demo Capabilities

**Date:** 2026-06-15 · **Orchestrated by:** CC (ultracode) · **Gate:** #515 (`28d7517e`) + HF-293 (`6254839c`) on main — confirmed. Collision: no prior WS-7 commits.

**The governing correction (architect-ruled):** the nav is verb-governed (`WorkspaceId = decide|calculate|consolidate|platform-core`); it must be **agent-governed** — **Calculation / Performance / Finance / Platform Core**. Finance is a **licensable** agent gated per tenant via the EXISTING `tenants.features` mechanism (elevated from a section-flag to an agent). **"Consolidate" was a false peer — removed.** Platform Core is **substrate** (always-on; its navigable part is config-as-settings), not a destination tab.

---

## The two disciplines

1. **Verify-then-build (the ledger is wrong both ways).** Phase 0 verifies each premise against code before any build. Initial recon already shows: **no payroll export endpoint** (real build), the **statement page exists** (verify-and-close), and **HF-293's SelfSimulateCard landed on `/stream` (IndividualStream), not `perform/statements`** (placement to verify). Build only verified gaps.
2. **Leverage, do not create (HALT-GENERAL).** The gating mechanism (`tenants.features` + the `featureFlag` filter, workspace-config.ts:123), the statement surface (OB-171), `EntityTable`, the workspace config, and HF-293's rep-own Simulate all EXIST. Reorganize / compose / verify — never a parallel nav system, gating mechanism, or greenfield surface.

---

## Phase 0 — the verify fan-out (cost-paid-once)

One read-only parallel fan-out over the **disjoint** targets: (a) nav state (verb→agent map + the Finance flag mechanism + the HALT-NAV capability-grouping check), (b) payroll export existence, (c) admin results table (EntityTable/`/operate/results` + access + G1 + drill), (d) rep statement (auto-resolution + the HF-293 slider placement), (e) the Finance **route-level** gate (denied at the route, not just hidden), (f) the drill C3 extraction shape. Output: `docs/completion-reports/WS7_REV_VERIFICATION_20260615.md` — the verified map that **replaces assumption-based scope**. HALT-0 flags anything needing an authenticated browser.

## Build orchestration — keystone-then-parallel

- **KEYSTONE (sequential, first): the nav reorganization (§2).** The agent structure defines WHERE the capabilities live, so it lands first — capability work builds against the agent homes it establishes (same shape as WS-2's keystone). Reorganize `workspace-config.ts` + `navigation.ts` onto Calculation/Performance/Finance/Platform Core; Finance gated via `tenants.features`; Consolidate removed; Platform Core as substrate (config-as-settings). **SR-34: reorganize, don't replace.**
- **THEN parallel (disjoint trees against the keystone):**
  - **Payroll export → Calculation** — a scoped, downloadable {entityId, name, hierarchy, period, payout} assembled from persisted results (SR-38 monto = engine `total_payout`; SR-39 scoped). The demo climax.
  - **Admin results table → Calculation** — close the verified gap (likely access + G1 server-COUNT + cleanliness + row-drill); the sign-off context that LEADS TO the export (one Calculation flow: review → export).
  - **Rep statement → Performance** — close the verified gap (likely rep auto-resolution); verify the HF-293 rep-own Simulate renders on this Performance surface (do not rebuild it).
- **The sequencing constraint (stated, not discovered):** the nav reorg touches WHERE surfaces live, so it lands **before** the capability placement — the capabilities need their agent homes first. The three capabilities are mutually disjoint (separate file trees: `api/.../export` + `operate/results` + `perform/statements`) and parallelize against the landed nav.
- **The shared drill (C3 `useDrillThrough`)** is a dependency the results-table row-drill consumes — **extract once, sequenced before the table build** (SR-34: remove the inline parallel on `/results`; per-surface adapter for context; HALT-C3-ADAPTER for the remainder). This is also the WS-3 enabler (R1).

## The adversarial sweep — one, batched over the build

Run ONCE over the batch (nav + the three capabilities), not per-piece. **ELEVATED:** **access-correctness** (export/statement scoped through the READ — a param change must not leak another's data) and the **Finance entitlement boundary** (a non-Finance tenant denied at the ROUTE, not just hidden). Plus right-by-luck/SR-38 (export monto + statement payout = engine value), Korean Test, scale (G1). Every HIGH fixed + re-verified.

## Merge strategy

Per-increment branches to main, dependency-ordered, each architect-SR-44-gated:
- **PR-1 `ws7-rev-phase0-verify`** (this increment): this plan + the verification report (the evidence base). Docs-only.
- **PR-2 `ws7-rev-nav-agents`**: the nav keystone (agent governance + Finance gate + Consolidate removal).
- **PR-3…N:** the C3 `useDrillThrough` extraction, then {payroll export, results table, rep statement} against the landed nav, then the batched-sweep fixes. Each its own SR-44 gate.

Never push to main directly; CC does not merge — the architect SR-44-gates each PR. The verify fan-out + the batched sweep are the cost-paid-once instruments, paid across WS-7-rev, not per-piece.

---

*OB-211 WS-7-rev Orchestration · 2026-06-15 · vialuce.ai · verify-then-build · agents govern nav · Finance = entitlement not verb · Platform Core = substrate.*
