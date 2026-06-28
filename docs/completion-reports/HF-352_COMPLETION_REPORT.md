# HF-352 — Tenant Management Surface (Clean Slate · Delete Tenant · Agent/Feature Toggles)

**Status:** ready to merge (CC authored/committed/PR'd; **architect merges — SR-44**).
**Branch:** `hf-352-tenant-management` (off `origin/main` — has OB-249/OB-250/HF-351).
**Mode:** ULTRACODE. **Migrations:** **ZERO** (surface + APIs + reuse; no schema change).

---

## §0 — CRF + PCD
- [x] Seed: `HF-352 / Platform-Core tenant management — clean-slate + delete + agent toggles; the prism toggle had no reachable home / ULTRACODE`.
- [x] **Collision gate:** only the directive doc references HF-352; no code/branch/PR collision.
- [x] **Architecture Decision Gate** recorded (§A); 3-lens adversarial design review pre-build (2 blockers + majors folded in).
- [x] **Discovery Gate 0 (§5.1)** + **Schema/FK Gate (§5.2)** + **SR-39 (§5.3)** cleared (§B).
- [x] Anti-Pattern Registry pass (§E). Build clean; dev confirmed on `localhost:3000` (§D).

---

## §A — Architecture (recorded)

A Platform-Core admin-only surface at **`/admin/tenants`** (`RequireCapability platform.system_config`; the `/admin` middleware gate maps to the same capability), matching the /admin shell, added to the platform-core › operations nav (`platform.system_config`). One tenant at a time: **Clean Slate** (selective per-category wipe, tenant preserved), **Delete Tenant** (complete removal), **Agent/Feature toggles** (the relocated OB-250 `PrismCapabilityToggle` — now its one reachable home).

- **Deletion engine** `src/lib/platform/tenant-deletion.ts` — every delete is `.eq('tenant_id', target)` (I1, structural confinement); `CLEAN_SLATE_CATEGORIES` (the directive's 5, dependents-first); `runCleanSlate` (selected categories, tenant+profiles preserved, per-table reporting); `runDeleteTenant` (all tenant-scoped tables dependents-first + the tenant row, 23503-guarded + verify-absent).
- **Confirmation** `src/lib/platform/confirm-challenge.ts` — server-issued signed challenge (HMAC over the service key, bound to {action, tenantId}, ~2-min window) + typed tenant name; both verified server-side before any delete (I2).
- **Routes** (all gate via `authorizePlatformObservability()` — capability `platform.system_config`, no role-string, no new role, I5): `GET /api/platform/tenants` (list), `GET …/[id]/data-summary`, `GET …/[id]/confirm-challenge`, `POST …/[id]/clean-slate`, `POST …/[id]/delete`, and the relocated `…/[id]/prism` (GET/PATCH — migrated OFF the OB-250 role-string `requireVlAdmin` to the capability gate, I7).
- **Audit** (I6): clean-slate → `audit_logs` (tenant survives), audit-FIRST + error-checked (fail-closed); delete → `platform_events` with `tenant_id=NULL` (survives the deletion that erases tenant-scoped `audit_logs`), written + verified BEFORE the sweep.

### §5.2 FK graph — VERIFIED; design-review blockers folded in
- `dependentsFirstConfirmed = TRUE`; the directive order respects the live FK graph.
- **B1 (cross-category cascade):** `entities` ON DELETE CASCADE → `calculation_results`/`entity_period_outcomes`/`summary_artifacts` (Calc) + `rule_set_assignments` (Plan). App-level category filtering can't stop a DB cascade → `CATEGORY_REQUIRES = { entity: ['calc','plan'] }`, server-rejected (422) if violated + UI auto-checks companions; the order deletes calc+plan first so the entity cascade hits empty tables. (`committed_data.entity_id → entities SET NULL` preserves Data rows.)
- **B2 (delete audit survival):** `audit_logs.tenant_id ON DELETE CASCADE` → routed to `platform_events` tenant_id=NULL.
- **EDGE-1:** `calculation_traces.committed_data_id → committed_data ON DELETE NO ACTION` (col nullable) → Data-layer wipe NULLs those refs first (preserving calc traces, reported as `unlinkedCalcTraces`).
- **EDGE-2 (delete completeness):** `DELETE FROM tenants` does not cascade cleanly → `DELETE_TENANT_TABLES` explicitly removes the `reference_data→reference_items→alias_registry` NO-ACTION chain + the no-FK orphans + live-only (skip-if-missing); dead `approval_queue` dropped.

---

## §B — Discovery / Schema / Compliance gates
- **§5.1:** located + reused — platform gate `platform.system_config` via `authorizePlatformObservability()`; nav platform-core›operations; visual language /admin pages + `RequireCapability`; `clear-tenant.ts`/`remove-ghost-tenants.ts` deletion patterns; `audit-logger.ts`; OB-250 prism route+component.
- **§5.2 (FK graph pasted in §A):** every named table has `tenant_id` (per-tenant delete feasible); the directive order verified; the NO-ACTION blockers/orphans/cascades enumerated. **No DDL.**
- **§5.3 SR-39:** destructive ops platform-admin-only (capability gate on every route); two-step server-enforced (challenge + name, before any delete); tenant-confinement structural (`.eq('tenant_id')` everywhere); audited (incl. survivable delete audit). SOC 2 CC6 / DS-014 / Decision 123 consistent.

---

## §4 — Proof gates (evidence)

Real-substrate e2e on **disposable dummy tenants only** (`scripts/_hf352_e2e_proof.ts` — creates dummy A + B, B as the confinement control, both deleted at end; I9) + 9 unit tests + greps.

- **P1 selective Clean Slate** — wipe `intelligence` on A: `classification_signals 1→0`, `structural_fingerprints 1→0`; other categories unchanged (`committed_data 2, entities 2, calc_results` preserved); tenant A record present; no errors.
- **P2 dependents-first, no FK error** — full Clean Slate: all 11 named tables → 0 for A; per-table statuses all `deleted` (incl. `calculation_traces:2, calculation_results:1`); no FK violation; tenant A preserved.
- **P2b EDGE-1** — Data-only wipe with a `calculation_traces.committed_data_id` reference: `committed_data 2→0`, `calc_traces preserved 2→2`, `unlinkedCalcTraces=1`, **no FK error**.
- **P3 tenant-scope confinement (the critical proof)** — control tenant B identical across ALL named tables before/after EVERY A operation (P1, P2b, P2, P4): `true` each time.
- **P4 Delete Tenant** — A fully removed (`tenants` row absent, dependents 0); B untouched.
- **P5 server-enforced confirmation** — both destructive routes verify `confirmName === tenant.name` (non-empty) AND `verifyChallenge(...)` BEFORE `runCleanSlate`/`runDeleteTenant` (code paste); challenge unit tests prove empty/tampered/expired/cross-action rejected.
- **P6 admin/platform-only** — all 6 routes call `authorizePlatformObservability()` (grep); zero role-string literals in the gating path (only a comment notes the removed `requireVlAdmin`); `CANONICAL_ROLES` unchanged (no new role).
- **P7 the toggle works from here** — `PrismCapabilityToggle` mounted on `/admin/tenants` (reuses the OB-250 GET/PATCH route, now capability-gated); the flag flips (e2e: B `prism_enabled` false→true); audited in `audit_logs`.
- **P8 audit** — clean-slate writes `audit_logs` (initiated, fail-closed + completed); delete writes `platform_events` (tenant_id=NULL), which **survives** the tenant deletion (e2e: `B2: deletion audit row SURVIVES = ✓`).
- **P9 visual match** — surface + components provided; architect-verified screenshot (SR-44).

---

## §C — Partial-failure (I8)
Every delete is wrapped; results are reported per table (`deleted` count / `skipped_missing` / `skipped_no_tenant_id` / `error`); a missing table or absent tenant_id is skipped, not fatal; deletes are idempotent (re-run safe). The final `DELETE tenants` catches `23503`, reports the blocking relation, and leaves a recoverable state (dependents removed, tenant preserved); on success the tenant row is verified absent before reporting success.

## §D — Build / test / dev
tsc clean (only the pre-existing hf350 test error remains, untouched); **45/45** unit tests (HF-352 9 + OB-250 13 + OB-249 23 — no regression); `rm -rf .next && npm run build` clean (BUILD_ID present; surface + 5 new routes compiled); `npm run dev` → `localhost:3000` HTTP 307.

## §E — Anti-Pattern Registry (§6A) — PASS
No unbounded destructive op (every delete tenant-scoped, I1); no single-click/client-only destruction (server two-step, I2); no FK-order violation (dependents-first, verified, B1/EDGE-1 handled); no role-string/new role/parallel auth path (one capability gate, I5/I7); no registry/set-membership (structural capability); no silent partial corruption (per-table reporting, I8); no duplicate toggle home (consolidated to /admin/tenants); no destructive proof on a real tenant (disposable dummies, I9); no LLM/data-pipeline change (I10).

## §G — Post-build adversarial code review (6-agent, find→verify) — fixes applied
2 confirmed issues (3 findings, 2 the same root), both fixed + re-verified (45/45 tests, tsc/build clean, e2e green):
1. **MAJOR — incomplete entity cascade-closure (I8/I4 truthful ledger).** Deleting `entities` ON DELETE CASCADE also wipes `reassignment_events` + `period_entity_state` (not in any category → silently deleted, absent from the ledger) and SET-NULLs `committed_data`/`classification_signals.entity_id` (unreported). (`disputes`'s 003 entity FK is *stale* — ob213 recreated it without one — so unaffected.) The cascade is FK-forced (NOT NULL), so it cannot be prevented — only made **truthful**. **Fix:** `runCleanSlate` pre-counts the FK-forced collateral and returns `collateralEffects[]` (cascade_delete + set_null), surfaced in the response + audit; the B1 comment now enumerates the full closure. e2e dummy C proves it: `reassignment_events cascade_delete` + `committed_data`/`classification_signals set_null` reported, preserved rows kept, no FK error.
2. **MINOR — P3 confinement asserted over only the 11 clean-slate tables.** **Fix:** the e2e now asserts the control tenant B is byte-identical across the **full 40-table delete superset** before/after every operation (incl. the cascade tables).

## §F — Files
**New:** `lib/platform/{tenant-deletion,confirm-challenge}.ts` (+ `__tests__/`); `app/api/platform/tenants/route.ts` + `…/[tenantId]/{data-summary,confirm-challenge,clean-slate,delete}/route.ts`; `app/admin/tenants/page.tsx`; `components/platform/DestructiveConfirmModal.tsx`; `scripts/_hf352_{probe,e2e_proof}.ts`.
**Edited:** `app/api/platform/tenants/[tenantId]/prism/route.ts` (capability gate), `components/platform/BillingUsageTab.tsx` (toggle removed), `lib/navigation/workspace-config.ts` (nav route).
