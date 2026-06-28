# HF-352 — Tenant Management Surface (Clean Slate · Delete Tenant · Agent/Feature Toggles)

**Mode:** ULTRACODE — objective + invariants + proof gates. CC owns the HOW: surface composition, routes, transaction strategy, sequencing. **Scope narrowing is a HALT condition.**

**Why.** Two operational gaps. (1) Per-tenant agent/feature toggling has **no home a platform admin can reach** — the PRISM capability toggle (OB-250) was placed inside the tenant/billing surface, where it is not surfaced for the operator; PRISM cannot currently be enabled from the Platform Core / Observatory side. (2) Every clean-slate of a test tenant currently requires **hand-written SQL in the Supabase SQL Editor.** This surface replaces both: a Platform-Core, admin-only **Tenant Management** surface with three capabilities — Clean Slate (selective per-category wipe, tenant record preserved), Delete Tenant (complete removal), and Agent/Feature toggles (the correct home for `prism_enabled` and future platform toggles). This is the **most destructive surface in the platform**; its safety gates are non-negotiable and lead the design.

---

## §0 — Header & cross-links

| Field | Value |
|---|---|
| Work item | **HF-352** *(architect-assigned; work is build-shaped — reclassify as OB if preferred. CC runs a collision gate against the live repo and HALTs on collision.)* |
| Repo | `CCAFRICA/spm-platform` — app under `web/`, **git from repo root**. Branch off `main`: `hf-352-tenant-management` (or CC's chosen name). |
| Standing rules | `CC_STANDING_ARCHITECTURE_RULES.md` at top · DD-1…DD-12. Commit + push after every change. Kill dev → `rm -rf .next` → `npm run build` → `npm run dev` → confirm `localhost:3000` before the completion report. |
| Binds | DS-014 / Decision 126 (capability-derived access; `scope_level:'platform'`; **no new role, no role-string**) · the OB-250 `prism_enabled` mechanism + its dedicated PATCH route (**reuse**, no parallel path) · the existing Platform-Core surface + visual language (**match**) · multi-tenant isolation / SR-2 · Decision 123 (compliance is architecture) · SR-39 · Decision 158 (preserved — no LLM in this surface) |
| Architect-only (SR-44) | Browser verification of the surface + the toggle in both flag states; `gh pr` **merge**; production sign-off. CC authors / commits / PRs; **never merges; never self-attests browser truth.** |

### CRF + PCD — visible checklist (CC confirms before building)
- [ ] Seed logged: `HF-352 / Cite: Platform-Core tenant management — clean-slate + delete + agent toggles; the prism toggle has no reachable home / Mode: ULTRACODE`.
- [ ] **Collision gate:** `HF-352` unused in the live repo. HALT on collision.
- [ ] **Architecture Decision Gate** recorded before the build is accepted (§5.1 discovery + chosen design).
- [ ] **Discovery Gate 0 (§5.1)** cleared.
- [ ] **Schema Verification Gate (§5.2 / FP-49)** cleared — live schema **and FK graph** of every table touched, queried and pasted, BEFORE any destructive SQL.
- [ ] **SR-39 gate (§5.3)** cleared — destructive ops + access control.
- [ ] Anti-Pattern Registry (§6A) checked.
- [ ] CC paste block: **this file is the prompt (DD-11).** Ends at §6A; nothing follows.

---

## §1 — Objective

A **Platform-Core, admin-only Tenant Management surface** (`scope_level:'platform'`), matching the existing Platform-Core visual language, with three capabilities operating on **one tenant at a time**:

1. **Clean Slate** — selectable categories (checkboxes + Select All), each independently selectable, deleted **dependents-first** in this production-tested order; the **tenant record is preserved**:
   1. **Calculation layer** — `calculation_traces`, `calculation_results`, `entity_period_outcomes`, `summary_artifacts`
   2. **Plan/assignment layer** — `rule_set_assignments`, `rule_sets`
   3. **Entity layer** — `entity_relationships`, `entities`
   4. **Data layer** — `committed_data`
   5. **Intelligence layer** — `classification_signals`, `structural_fingerprints`
2. **Delete Tenant** — removes the tenant record **and all associated data across all tables.** Complete removal.
3. **Agent/Feature toggles** — per-tenant on/off for platform agents/features. **This is the correct home for the `prism_enabled` toggle** (reusing the OB-250 dedicated PATCH route + component); it generalizes to future toggles. If a PRISM toggle was placed elsewhere (e.g. the billing/tenant surface) by OB-250, **consolidate it here** so toggling has **one authoritative home**.

---

## §2 — Scope

**In scope:** the Tenant Management surface; the three capabilities above; the shared **two-step confirmation** safety component (built once, used by both destructive actions); server-side confirmation enforcement; audit of every destructive action and toggle; relocation/consolidation of the `prism_enabled` toggle into this surface (reusing the OB-250 route).

**Out of scope (named):**
- **Bulk / multi-tenant operations** — one tenant at a time.
- **Undo / soft-delete / restore-from-backup** of a deleted tenant — Delete Tenant is complete removal by design; recovery is a separate concern.
- **New platform features beyond the three capabilities.**
- **The data pipeline / engine / membrane / remediation internals** — untouched. No LLM anywhere in this surface (Decision 158 preserved by construction).
- **Re-deriving the delete order** — the order above is production-tested; CC **verifies** the live FK graph matches it (§5.2), it does not redesign it.

---

## §3 — Invariants (the constraints CC holds; each verified in §4)

- **I1 — Tenant-scope confinement (THE invariant).** Every destructive operation is bounded to **exactly the target tenant** (`tenant_id = target`); no operation can touch another tenant's rows. This is **structural, not conventional** — there is no code path by which a clean-slate or delete reaches a second tenant. (Multi-tenant isolation / SR-2.)
- **I2 — Server-enforced two-step confirmation.** Step 1: a modal **naming the tenant and the specific action**. Step 2: **type a confirmation code** (the tenant name or a displayed random code) before execution. The destructive **API requires the confirmation token and rejects without it** — the UI gate is not the security boundary. **No single-click destructive action exists**, client or server.
- **I3 — Dependents-first delete order.** Clean Slate deletes in the order in §1 (calculation → plan → entity → data → intelligence), respecting FK dependencies; no FK-violation path. CC confirms the live FK graph matches before writing deletes (§5.2).
- **I4 — Clean Slate preserves the tenant; Delete Tenant removes it.** Categories are independently selectable; selecting a subset wipes only those categories' tables for that tenant, leaving the rest intact and the tenant record present.
- **I5 — Admin/platform-only, capability-derived.** The surface and **every** destructive/toggle endpoint gate on `scope_level:'platform'` via the **existing** capability model — **no role-name literal, no new role, no parallel auth path.**
- **I6 — Every destructive action and toggle is audited immutably** — actor, tenant, action, categories (for clean-slate), before/after (for toggle), timestamp.
- **I7 — Reuse, don't duplicate.** The `prism_enabled` toggle reuses the OB-250 dedicated PATCH route + component; the gating reuses the capability model; the surface reuses Platform-Core visual language. No parallel routes/stores/styling. The prior toggle placement is consolidated, not duplicated.
- **I8 — Partial-failure safety.** A Clean Slate that fails mid-operation leaves the tenant in a **defined, recoverable state** (transactional per category, or explicit reporting of exactly what was and was not deleted) — never silent partial corruption.
- **I9 — Proof on disposable tenants only.** All destructive proof runs on **test/dummy tenants, never a real tenant**; the e2e demonstrates a real clean-up of an actual dummy tenant. No real-tenant ground-truth values enter this directive (reconciliation channel separation).
- **I10 — Constitutional set preserved.** Decision 158 and the data-pipeline boundaries are untouched — this surface contains no inference and alters no committed-data processing.

---

## §4 — Proof gates (evidentiary — pasted query results, code, grep; PASS/FAIL self-attestation NOT accepted)

- **P1 — Selective Clean Slate.** On a dummy tenant, select one category (e.g. calculation layer) → those tables' rows for that tenant → **0**; **other categories' rows for that tenant UNCHANGED**; the **tenant record present**. *Evidence: before/after counts per category.*
- **P2 — Dependents-first, no FK error.** A full Clean Slate completes in order with **no FK-violation**. *Evidence: the ordered operation log; zero FK errors.*
- **P3 — Tenant-scope confinement (I1, the critical proof).** A clean-slate or delete on tenant A leaves **tenant B's rows in every named table identical** (count before == count after). *Evidence: tenant-B counts before/after across all tables — proves no cross-tenant reach.*
- **P4 — Delete Tenant.** Complete removal: the tenant record and all associated rows across all tables **gone**; **another tenant untouched**. *Evidence: counts.*
- **P5 — Server-enforced confirmation (I2).** A destructive API call **without** the confirmation token is **rejected**; **with** the correct token, executes. *Evidence: the rejected call + the accepted call.*
- **P6 — Admin/platform-only (I5).** A non-platform user cannot reach the surface **or** the destructive/toggle APIs. *Evidence: the gate; grep showing capability check, no role-string.*
- **P7 — The toggle works from here (the unblock).** `prism_enabled` toggles via the **existing OB-250 route** from this surface → the flag flips → a tenant that was PRISM-disabled now reads enabled (its Data-Operations workspace + PRISM import source become reachable). *Evidence: the toggle action + the flag state change + the audit row.*
- **P8 — Audit (I6).** Every destructive action and every toggle writes an audit row with the required fields. *Evidence: the rows.*
- **P9 — Visual language matches Platform Core (architect-verified, SR-44).** *CC provides the components + the data; the architect verifies the screenshot.*

---

## §5 — Discovery, schema & compliance gates (run BEFORE building)

### §5.1 — Discovery Gate 0 (locate and EXTEND/MATCH; HALT if substrate absent)
Locate and record: the existing **Platform-Core surface + its visual language** (match it); the existing **capability model** + the `scope_level:'platform'` gate; the existing **tenant list / selection**; the **OB-250 `prism_enabled` PATCH route + toggle component** (reuse); and any **prior agent/feature-toggle surface** that "existed previously and was removed or never completed" — if found, restore/complete rather than reinvent. HALT if the platform-scope capability gate cannot be located.

### §5.2 — Schema Verification Gate (FP-49 — CRITICAL, destructive)
Before **any** DELETE, **query the live schema AND the foreign-key graph** of every named table — `calculation_traces`, `calculation_results`, `entity_period_outcomes`, `summary_artifacts`, `rule_set_assignments`, `rule_sets`, `entity_relationships`, `entities`, `committed_data`, `classification_signals`, `structural_fingerprints`, plus the tenant record's table — and **paste the verified schema + FK relationships**. **Confirm the dependents-first order in §1 matches the live FK graph**; if a dependency is found that the stated order would violate, **HALT and surface** (do not silently reorder). No destructive SQL ships without this proof. Migrations, if any: CC authors + commits; architect applies via SQL Editor (SR-44); CC verifies via `tsx`. No psql/CLI/`exec_sql` RPC.

### §5.3 — SR-39 Compliance Gate
Touches access control + destructive data operations + tenant isolation → verify against **SOC 2 CC6**, **OWASP**, **NIST SP 800-63B**, **DS-014**, **Decision 123**. Specifically: destructive ops are platform-admin-only; the two-step confirmation is server-enforced (I2); operations are tenant-scope-confined and unbypassable (I1); every action is audited (I6).

---

## §6 — Completion report & PR

- Completion report at **`docs/completion-reports/HF-352_COMPLETION_REPORT.md`** (NOT the repo root). Include: the recorded Architecture Decision Gate (located surfaces + chosen design), **every §4 proof gate with pasted evidence**, the §5.1/§5.2/§5.3 gate evidence (the FK-graph confirmation explicitly), and the Anti-Pattern Registry pass.
- Final step: **`gh pr create --base main`** with a descriptive title + body. CC stops at "ready to merge." **The architect merges (SR-44).**

---

## §6A — Anti-Pattern Registry (checked every build) + closeout

- **No unbounded destructive operation** (I1) — every delete is tenant-scoped; no cross-tenant reach.
- **No single-click / client-only destruction** (I2) — two-step, server-enforced.
- **No FK-order violation** (I3) — dependents-first, verified against the live graph.
- **No role-string / no new role / no parallel auth path** (I5/I7) — capability-derived; reuse the existing model, the OB-250 route, the Platform-Core language.
- **No registry / set-membership validation** — gate on structural capability, not an allowed-role list.
- **No silent partial corruption** (I8) — partial failure is recoverable and reported.
- **No duplicate toggle home** (I7) — one authoritative place to toggle; the prior placement consolidated.
- **No destructive proof on a real tenant** (I9) — disposable tenants only.
- **No LLM in this surface; no data-pipeline change** (I10) — Decision 158 preserved.

*This file is the prompt (DD-11). It ends here. Nothing follows §6A.*
