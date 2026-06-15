# WS-7-rev Phase-0 Verification — Nav State + The Three Capabilities (verify-then-build)

**Date:** 2026-06-15 · **Method:** 6-agent read-only fan-out against main. · **Gate:** #515 + HF-293 on main. · **HALT-0:** production renders flagged architect-SR-44.

**Headline — the ledger is wrong both ways, decisively.** The directive's three "demo capabilities to build" mostly **already exist**; verify-first instead surfaced **two pre-existing confidentiality/entitlement bugs** (the elevated dimensions) that the directive assumed were fine. The build scope shifts from "build capabilities" to **reorganize the nav + close the verified access/entitlement gates**.

---

## §1 — Nav state (the keystone basis)

| Finding | Verdict | Evidence |
|---|---|---|
| `WorkspaceId` is verb-based (`decide/calculate/consolidate/platform-core`); labels are verbs (+ Platform Core noun foundation) | **EXISTS-OK** (misalignment confirmed) | `navigation.ts:21`; `workspace-config.ts:30/62/102/139` |
| route→agent map clean: decide→Performance (`/stream`, `/operate/results`), calculate→Calculation (cockpit/import/calculate), consolidate **split** {reconciliation→Calculation, financial→Finance}, platform-core→Platform Core (`/configure/*`) | **EXISTS-OK** | `workspace-config.ts:44-169`; override `:257` `/operate/results→decide` |
| **AGENT grouping needs NO schema change** — regrouping routes into Workspace/Section is data, not type (OB-207 already did this; `featureFlag` exists at both Workspace and Section level) | **NO HALT-NAV** | `navigation.ts:23-53`; header `workspace-config.ts:6-7` |
| **Finance menu gate is INERT** — the `featureFlag:'financial'` section filter (`:222-224`) is short-circuited because **no caller passes `enabledFeatures`**; `tenants.features.financial` gates nothing → the financial section renders for **any** tenant | **PARTIAL-CLOSE (real bug)** | `:123` flag; `:223` `if (!enabledFeatures) return true`; `ChromeSidebar.tsx:180` (2 args); `tenant.ts:40/57` |

**Note:** `/operate/results` currently lives under `decide` (Performance) via the `:257` override, but the ruling places the admin results table in **Calculation** (sign-off→export). The nav reorg moves it.

---

## §2 — The three capabilities (verify-first — most already exist)

| Capability | Directive assumed | **Verified reality** | Real work |
|---|---|---|---|
| **Payroll export** (→Calculation) | "likely the real build (none found)" | **EXISTS** — `generatePayrollCSV()` (`calculation-lifecycle-service.ts:490-550`) wired via `handleExportPayroll()` (`admin/launch/calculate/page.tsx:406-442`), client Blob download `{tenant}_{period}_Results.csv`. Columns: Entity ID ✓, Name ✓ (persisted `metadata.entityName`), Total ✓ (`total_payout`), period (summary only). **hierarchy ABSENT** (HALT-EXPORT — hierarchy lives in `entity_relationships`, not denormalized onto `calculation_results`). | **Not a build.** Verify; surface in the Calculation results flow; name the hierarchy gap. |
| **Admin results table** (→Calculation) | "likely access + G1 + cleanliness" | **EXISTS** — inline `<Table>` (`operate/results/page.tsx:795-982`): ID/Name/Store/components/Total + expandable L4/L3/L2 + **row drill** (`expandedEntity` + "Full Trace →" `/investigate/trace/[entityId]`). But: **(a) access double-gate bug** — outer `RequireCapability view.all_results` admits tenant admin, inner `isVLAdmin` (platform-only) **blocks** them → a tenant admin is locked out of a table the matrix says they can see. **(b) G1** — `entityCount = results.length` off an **unbounded** read (`calculation-service.ts:385-389`, caps ~1000). | **Fix access double-gate + G1 server COUNT.** Row drill already exists. |
| **Rep statement** (→Performance) | "verify-and-close (rep auto-resolution)" | **TWO surfaces.** The **secure** rep home **EXISTS** at `/stream` IndividualStream — entity resolved server-trust-side from the authenticated profile (`persona-context: auth_user_id→profile→entity`), no param/picker, leak-safe, **and HF-293's SelfSimulateCard renders there** (`stream/page.tsx:826`). **But `perform/statements` is a SEPARATE, LEAKY surface (HALT-ACCESS):** reads `?entityId` unguarded (`:92`), unrestricted entity picker (`:357-386`), auto-selects `entities[0]` if no param (`:143-145`) → **anyone can view any entity's full payout/breakdown/trajectory/raw transactions** (SR-39 violation). | **The secure home exists (/stream).** The real fix is **closing the `perform/statements` leak** (scope through the read, or gate it as a scoped viewer). |

---

## §3 — The elevated dimensions, found as real pre-existing bugs

**HALT-ACCESS #1 — Finance route gate (entitlement boundary).** `/financial/*` is gated **only at the sidebar menu, only by role capability** (`permissions.ts:324` `/financial→view.team_results`), never by `tenants.features`, never at the route (no `financial/layout.tsx`, no route guard, middleware reads no features). **A non-Finance tenant's manager (role-capable) can navigate directly to `/financial` and see financial data.** `FeatureGate` + `useFinancialOnly` exist but are used only to filter the menu.

**HALT-ACCESS #2 — `perform/statements` param-leak** (above) — the statement surface has no persona/scope guard; the param + picker expose any entity in the tenant.

These are the two ELEVATED sweep dimensions (access-correctness + Finance entitlement) — found as **actual existing defects**, not hypotheticals. They are the highest-priority real work.

---

## §4 — Drill (C3 useDrillThrough)

`useDrillThrough` is **not** extracted; the drill is inline (`drillAnomaly` state `:119` + `expandedEntity` `:113` — two mechanisms). **NO HALT-C3-ADAPTER** — both contexts are recoverable from in-scope data. Extraction shape: `useDrillThrough<T>()` = `{target, open, close}` over one `useState<T|null>`, with `open` firing the **existing** `captureStreamSignal` (no new path) + reset-on-batch; the per-surface **view** (`AnomalyDrillThrough` vs the L4/L3/L2 panel) and **context adapter** stay out of the hook. The row drill already exists; the extraction unifies the two states (the WS-3 enabler, R1).

---

## §5 — Revised, evidence-driven build scope (build only verified gaps)

**Nav keystone (§2 of the directive):**
1. Reorganize `workspace-config.ts`/`navigation.ts` → agent-governed (Calculation/Performance/Finance/Platform Core); relabel verbs→agents; remove Consolidate (regroup its two sections — reconciliation→Calculation, financial→Finance); Platform Core as substrate (config-as-settings). **Regrouping, no schema change.**
2. **Fix the inert Finance menu gate** — pass `currentTenant.features` at the render call sites so the financial section actually gates.
3. Move `/operate/results` decide→Calculation.

**The two HALT-ACCESS closures (highest priority — the elevated dimensions):**
4. **Finance route gate** — add a `tenants.features['financial']` guard at the route (a `financial/layout.tsx` or middleware feature-check), so a non-Finance tenant is **denied at the route**, not just hidden.
5. **`perform/statements` leak** — scope through the read: a rep resolves to their own entity (or the secure `/stream` home is the rep path); the picker/param is ownership/scope-checked (HALT-4: never another's statement).

**The verified fixes (not builds):**
6. Admin results table: collapse the access double-gate (let a `view.all_results` tenant admin in) + **G1 server COUNT** (the existing `count:'exact'` helpers).
7. `useDrillThrough` extraction (refactor; the WS-3 enabler).
8. Payroll export: verify + name the hierarchy gap (HALT-EXPORT) — assemble what's persisted; do not fabricate.

**The batched adversarial sweep** runs once over the above (access-correctness + Finance entitlement elevated — now closing real bugs).

---

*WS-7-rev Phase-0 Verification · 2026-06-15 · vialuce.ai · verify-then-build proved the directive's builds mostly exist and surfaced two real access/entitlement bugs as the actual scope.*
