# OB-250 — The PRISM Capability Gate + the Data-Operations Workspace

**Status:** ready to merge (CC authored/committed/PR'd; **architect merges — SR-44**).
**Branch:** `ob-250-prism-capability-gate` (off `origin/main`, which has OB-249 #612 + HF-351 #613).
**Mode:** ULTRACODE. **Migrations:** **ZERO** — `prism_enabled` rides the existing `tenants.features` JSONB bag (the Finance-licensable precedent); the nested scanner mode rides `tenants.settings`. No DDL.

---

## §0 — CRF + PCD
- [x] Seed: `OB-250 / Cite: the prism_enabled capability-gate foundation + the data-operations menu reorg / Class: OB / Mode: ULTRACODE`.
- [x] **Collision gate:** `OB-250` + `prism_enabled` had ZERO references in source/docs; no branch/PR.
- [x] **Architecture Decision Gate** recorded (§A); reviewed by a 3-lens adversarial design panel BEFORE build (3 blockers + majors folded in).
- [x] **Discovery Gate 0 (§5.1)** cleared (§B1). **Schema Verification (§5.2)** cleared (§B2). **SR-39 (§5.3)** addressed (§A/§D).
- [x] Anti-Pattern Registry pass (§E). Build clean + dev confirmed on `localhost:3000` (§D).

---

## §A — Architecture Decision (the recorded HOW)

**Discovery (located, EXTEND not parallel):** the two-gate already exists — the **Finance** workspace gates per tenant via `featureFlag:'financial'` checked against **`tenants.features`** (the boolean bag, loaded once in `tenant-context.tsx` → `currentTenant.features` w/ `DEFAULT_FEATURES`) × per-route `requiredCapability` via `hasCapability` (the DS-014 PDP). So OB-250 is a clean extension:

1. **Flag (I4, zero migration):** `tenants.features.prism_enabled` (default **false** via `DEFAULT_FEATURES`; absent key → false → off, no DDL). Nested controls → `tenants.settings.prism.mode` (§1.7).
2. **Single read (I1):** ONE key `PRISM_FEATURE_KEY` + ONE predicate `isPrismEnabled(features)` (`lib/prism/capability.ts`), used by the workspace gate, the API routes, the middleware map, and the scanner. No scattered inline checks.
3. **Two-gate workspace (I2):** new `data-operations` WORKSPACE with `featureFlag:'prism_enabled'` × `requiredCapability:'data.import'`. The composition is folded into `canAccessWorkspace`/`getAccessibleWorkspaces` (role-workspaces.ts) — the ONE place; the 3 sidebars now call that single helper (their triplicated `.filter` removed). This also closed a latent Finance gap (the helper previously ignored the workspace-level featureFlag).
4. **User permission (I3, no new role/role-string):** reuse `data.import` (platform+admin). The 6-role set is unchanged.
5. **Menu reorg:** new **Data Operations** workspace (configurable label `DATA_OPERATIONS_LABEL`, NOT "PRISM") = Deliver(`/data/submit`) + In Progress(`/data/in-progress`) + Cleaned(`/data-operations/cleaned`, hosting the OB-249 RemediationReview). **Import** stays an ungated section (`/operate/import` + history) — local always available (I6). `getWorkspaceForRoute` exact-prefix fix so PRISM subpaths resolve to `data-operations` not the generic `/data` (B2).
6. **Edit-Tenant toggle (I10):** `PrismCapabilityToggle` in `BillingUsageTab` (the per-tenant Active-Modules surface) → **dedicated** `PATCH /api/platform/tenants/[id]/prism` (VL-Admin) that writes ONLY `features.prism_enabled` + an `audit_logs` row — **decoupled from billing** (NOT the modules route, which mutates bundle_discount/monthly_total).
7. **Import source (I6/I7):** local always; `ClearedSourcePanel` (self-gating) shows the PRISM shelf from `GET /api/prism/cleared` (promoted+clean+`import_batch_id` null) only when on. Consume (`POST`) creates an import_batch + links `import_batch_id` → the file leaves the shelf (clearing ≠ importing), handing clean bytes to the existing worker.
8. **Off-state (I5):** flag off → workspace + shelf vanish; committed_data persists; Audit (`/admin/audit`) + Transactions (`/data/transactions`) are NOT in the feature map → reachable. Quarantine/hold-resolution (`/operate/import/quarantine`) deliberately NOT moved into the gated workspace and NOT feature-gated → held files always resolvable (non-orphaning; I5 overrides §1.5's relocation of hold-resolution).
9. **Server-side deep-link gate (SR-39):** `WORKSPACE_FEATURES` exact-path map (`/data/submit`, `/data/in-progress`, `/data-operations`) + `requiredFeatureForPath` → **middleware** loads the EFFECTIVE tenant's features (platform→cookie, else→profile) and redirects to `/unauthorized`, fail-closed. NEVER the bare `/data` or `/operate` prefix (so `/data/transactions` [I5] + `/operate/import` [I6] stay open). PLUS the API routes (`isPrismEnabledForTenant`, service-role) — the functional gate.
10. **Nesting (§1.7):** `getPrismScanMode(settings)` read by `scan-worker` (only runs when PRISM active), default `enforce` = byte-identical. Establishes the structure; interim behavior + per-agent toggle UI out of scope.

### Design-review blockers folded in (pre-build): server-side deep-link gate; gate EXACT subpaths only (never /data|/operate prefix); getWorkspaceForRoute /data collision fix; quarantine non-orphaning (I5); decouple toggle from billing; single key+predicate.

---

## §B — Discovery & Schema gates

### §B1 — Discovery Gate 0 (PASS)
Located + extended: per-tenant settings = `tenants.features` (boolean bag) + `tenants.settings` (config) — NO `tenant_settings` table; capability model = `hasCapability`/`ROLE_CAPABILITIES`/`profiles.capabilities`; nav = `WORKSPACES` + `featureFlag`/`requiredCapability` (Finance precedent); PRISM surfaces = `/data/submit`,`/data/in-progress`,`/operate/import*`, OB-249 RemediationReview; edit-Tenant = `BillingUsageTab` @ `/select-tenant` → `PATCH …/modules`. Corrected directive premise: **no per-tenant scanner mode existed** (env-only) → OB-250 establishes it as the §1.7 instance.

### §B2 — Schema Verification (FP-49, PASS — live columns pasted)
- `tenants`: `…, settings(jsonb), features(jsonb), …` (features bag: financial/compensation/transactions/…; prism_enabled added).
- `profiles`: `…, role, capabilities(text[])` (roles: admin/platform/cda/manager/member).
- `file_objects`: `…, state, scan_verdict, clean_path, import_batch_id, …` — "cleared" = `state='promoted' ∧ scan_verdict='clean' ∧ clean_path set ∧ import_batch_id IS NULL`.
- `committed_data`: 340,177 rows — persists independent of any flag.
- `import_batches`, `audit_logs` (`id,tenant_id,profile_id,action,resource_type,resource_id,changes,metadata,…`).
**No DDL** — `prism_enabled` ∈ features JSONB (default-merge), nested mode ∈ settings JSONB, `file_objects.import_batch_id` already exists.

---

## §4 — Proof gates (evidence)

Unit tests (`node --test`, 13 pass) + a real-substrate e2e (`scripts/_ob250_e2e_proof.ts`, self-cleanup) + greps. Screenshots architect-verified (SR-44).

- **P1 flag-on derives surfaces** — `canAccessWorkspace('admin','data-operations',{prism_enabled:true})===true`; `getAccessibleWorkspaces('admin',{prism_enabled:true})` includes `data-operations`; ClearedSourcePanel renders only when on. (unit test + e2e toggle). *Screenshot: architect.*
- **P2 flag-off reverts, data persists** — e2e: data-tenant `committed_data` **75227 → 75227 UNCHANGED** across the toggle; `requiredFeatureForPath('/data/transactions')===null` & `('/admin/audit')` ungated. The flag write touches ONLY `features`.
- **P3 the four-cell matrix** — unit test: (on×has-perm)→visible; (off×has-perm)→hidden; (on×no-perm)→hidden; (off×no-perm)→hidden.
- **P4 single source of truth** — grep: every `prism_enabled` runtime read goes through `isPrismEnabled` / the `featureFlag` binding (`PRISM_FEATURE_KEY`) / `WORKSPACE_FEATURES`; no scattered inline `if`.
- **P5 capability-derived, no role-string, no new role** — `CANONICAL_ROLES` unchanged (6); grep of the gating path = zero role-name literals (unit test).
- **P6 local import unconditional** — grep: `src/app/api/import/sci/*` has **0** `isPrismEnabled` gates; only `/api/prism/*` (4) gated.
- **P7 PRISM source shows only cleared** — e2e: cleared file on shelf=true; uncleared (infected_held) absent=true; after consume (import_batch_id set) off-shelf=true (clearing≠importing).
- **P8 no parallel auth path** — `prism_enabled` ∈ `tenants.features` (the scanner-mode-adjacent mechanism Finance uses); gate via `hasCapability` + the existing nav; no new store/gating logic.
- **P9 Decision 158 untouched** — OB-249 remediation tests **23/23 pass**; grep: ZERO LLM refs in the gating/derivation path.
- **I10 audited** — e2e: `audit_logs` row `action='tenant.prism_toggled' changes={prism_enabled:{from,to}}` written. (Append-only enforcement is a noted follow-up; the change is RECORDED.)

---

## §C — Server-side deep-link gate (SR-39, the design-review blocker)
The menu hide is NOT the gate. Two server enforcers: **middleware** (`requiredFeatureForPath` + effective-tenant `features` read → `/unauthorized`, fail-closed) for the PRISM PAGES, and the **PRISM API routes** (`isPrismEnabledForTenant`, service-role) for the DATA/ACTIONS. Both at EXACT subpaths only; `/data/transactions` (I5) + `/operate/import` (I6) provably ungated (unit test). Toggle is VL-Admin-only (GET+PATCH) + audited.

## §D — Build / test / dev
tsc clean (only pre-existing hf350 test error remains, untouched); 13 OB-250 unit tests + 23 OB-249 tests pass; `rm -rf .next && npm run build` clean (BUILD_ID present; new routes compiled); `npm run dev` → `localhost:3000` HTTP 307.

## §E — Anti-Pattern Registry (§6A) — PASS
No scattered gate checks (one predicate); no role-string/no new role (capability-derived, grep-clean); no parallel auth path (extends features+RBAC+nav); no registry/set-membership (structural feature/capability); no committed-history destruction on toggle-off (P2); no PRISM block on local import (P6); no uncleared file in the shelf (P7); no LLM in gating (P9); no one-tenant special-casing; "PRISM" never user-facing (label `Data Operations`); no scope bleed (held-file actions / standing remediation / selective revert / bypass writers / other renames untouched).

## §F — Files
**New:** `lib/prism/{capability,tenant-feature}.ts`; `app/api/prism/cleared/route.ts`; `app/api/platform/tenants/[tenantId]/prism/route.ts`; `app/data-operations/cleaned/page.tsx`; `components/platform/PrismCapabilityToggle.tsx`; `components/prism/ClearedSourcePanel.tsx`; `lib/prism/__tests__/capability.test.ts`; `lib/navigation/__tests__/ob250-prism-gate.test.ts`; `scripts/_ob250_{probe,e2e_proof}.ts`.
**Edited (extensions):** `types/tenant.ts`, `types/navigation.ts`, `lib/navigation/{workspace-config,role-workspaces,queue-service}.ts`, `lib/auth/{permissions,auth-logger}.ts`, `middleware.ts`, `components/navigation/{ChromeSidebar,mission-control/VialuceSidebar,mission-control/WorkspaceSwitcher}.tsx`, `components/platform/BillingUsageTab.tsx`, `app/operate/import/page.tsx`, `app/api/prism/{prepare,commit,files}/route.ts`, `lib/prism/scan-worker.ts`.

## §H — Post-build adversarial code review (6-agent, find→verify) — fixes applied
3 confirmed issues, all fixed + re-verified (tsc clean, 13 unit + 23 OB-249 tests pass, e2e green, build clean):
1. **MAJOR — consume double-import race** (`/api/prism/cleared` POST): the optimistic `.is('import_batch_id', null)` guard's 0-row result was ignored and the batch/job were created unconditionally → two concurrent consumers could double-ingest one cleared file. **Fix:** atomic claim-first — create the batch (FK target), then a guarded `.update(...).is(null).select('id').maybeSingle()`; on a lost race (no row) undo the orphan batch and `409`, creating NO job. Only the winner hands off to the worker. One clearing → at most one consume (I7).
2. **MAJOR (same root, 2nd reviewer)** — confirmed + same fix.
3. **MINOR — navigation-context shared composition** : `canAccessWorkspace` was called without tenant features at 3 sites (+ PersonaSwitcher), so the client redirect skipped the feature gate (the server middleware still blocked the deep-link, so not a security hole — but I1 coherence + the doc comment). **Fix:** thread `currentTenant.features` into all four calls (+ useCallback deps) so the client genuinely shares the single two-gate composition and a flag-off `data-operations` deep link redirects to default.

## §G — SR-39 note
Touches access control + tenant-capability + data visibility. Verified: toggle privileged (VL-Admin) + audited (I10); two-gate unbypassable server-side (middleware + API, both gates independent); off-state shows committed data (Audit/Transactions ungated) without leaking PRISM surfaces. Consistent with SOC 2 CC6 / DS-014 / Decision 123.
