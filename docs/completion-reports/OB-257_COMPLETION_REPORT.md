# OB-257 COMPLETION REPORT — Revenue Agent

**Date:** 2026-07-01 · **Branch:** `ob-257-revenue-agent` · **Mode:** ULTRACODE
**Status:** All code objectives (P0, ADR, O1–O4, review-hardening) COMPLETE, build green, 583/583 tests. **HALT-3 PAUSE ACTIVE at the O5 activation gates:** migration `20260704_ob257_summary_rollups.sql` is authored + committed and awaits architect SQL Editor application; PG-2..PG-7 execute after it (CC-executable parts scripted below; browser parts are SR-44 architect actions with the click-path checklist in §7).

---

## §1 Commits (all pushed to `origin/ob-257-revenue-agent`)

| SHA | What |
|---|---|
| `2cd80120` | Directive committed (`docs/vp-prompts/OB-257_DIRECTIVE_20260701.md`) |
| `bddace75` | P0 discovery report + 13 read-only probe scripts (`docs/diagnostics/OB-257_P0_DISCOVERY.md`) |
| `b0d17b00` | Architecture Decision Record (Section B gate, committed BEFORE implementation) |
| `48cde0d1` | HALT-3: `summary_rollups` migration authored (SQL Verification Gate passed live) |
| `bcd8cf69` | Contract module (`lib/revenue/types.ts`) + functional entitlement predicate |
| `7b4f9f3a` | Wave 1: O1 entitlement+nav, O2 serving+materializer+activation, O2a pure-move extraction, O4 insights, O3 client foundation (29 files) |
| `053aaf8f` | Wave 2: the 8 Revenue surfaces + PG-4 truth-derivation script (9 files, 3,081 insertions) |
| `887f8d3a` | Review fixes: 10 verified findings from the adversarial multi-agent review (20 files) |

## §2 What was built (per objective)

**O1 — Entitlement + navigation.** `revenue_enabled` key in `TenantFeatures` + `DEFAULT_FEATURES` (default-OFF, licensable; decoupled from billing keys per the OB-252 precedent). New `revenue` workspace in `WORKSPACES` (8 bilingual routes, `featureFlag: REVENUE_FEATURE_KEY`) — the Observatory entitlement toggle row and the entitlement-API key validation DERIVE structurally from this one declaration (`getToggleableAgents()`/`toggleableFeatureKeys()`), zero further registration. Server deep-link gate: `WORKSPACE_FEATURES += { prefix: '/revenue', feature: 'revenue_enabled' }` (permissions.ts:368; enforced by middleware.ts:413-436 → redirect `/unauthorized`, fail-closed). Client gate: `app/revenue/layout.tsx` FeatureGate (exact Financial precedent). Functional API gate: `isRevenueEnabledForTenant()` (PRISM precedent) on all three `/api/revenue/*` routes — closing for Revenue the API-gate gap Finance has (P0 item 3; not replicated). Tenant-setup form carries the bilingual key. WorkspaceId union ripple (5 compile-forced Record maps) handled per the documented OB-250 precedent; the OB-252 derivation test's pinned key set updated 4→5.

**O2 — Serving layer + activation.** Role resolution (`lib/revenue/role-resolution.ts`) is a thin adapter over HF-337 `recognize()` for three surfaces — `revenue.measure` (required), `revenue.dimension.location`, `revenue.dimension.category` — self-priming `surface_bindings` cache, C2 absences carrying the recognizer's reason verbatim. Entity/temporal roles resolve structurally from the import pipeline's own outputs (`committed_data.entity_id`, `period_id ?? source_date∈period-range`). ONE materializer (`lib/revenue/materializer.ts`): two paged streaming scans (entity-attribute dimension map, then measure reduce; pages discarded — DIAG-078-safe), measure-provenance discipline (measure field spanning >1 `data_type` → C2 fail-loud ambiguity, no silent choice), rollups written to the NEW `summary_rollups` table in 4 writer-owned namespaces (`revenue_period`, `revenue_entity_period`, `revenue_dimension_period`, `revenue_meta`) with idempotent own-namespace replace + canonicalized noop detection (PG-2 re-run evidence). THREE callers, one function (single cascade): import finalize (post-insights, fire-and-forget per the flywheel idiom), the entitlement PATCH false→true flip (the toggle IS the activation trigger), and `POST /api/revenue/activate` (platform-gated deterministic re-run, maxDuration 300). Serving: `POST /api/revenue/data` — 8 modes, reads rollups + `entity_period_outcomes` + `period_outcomes` sentinels ONLY (zero `committed_data`, zero recognition at read time; roles come from the `revenue_meta` row), scope-honoring fail-closed (see SR-39 block). AP-17 share surface: `buildTimelineResponse` + pure math helpers extracted VERBATIM from the financial route into `lib/serving/` (financial route imports them back); `pagedScan`/`pagedRows` shared reader.

**O3 — The 8 surfaces** (`app/revenue/*`): Revenue Pulse (hero row w/ pace-vs-trailing-mean labeled arithmetic + trend + period table + InsightSlot + discovery row), Growth Bridge (diverging waterfall w/ transparent-base floating bars, honest grain caption, drill table), Revenue Mix & Mix-Shift (shift-first diverging bars + stacked composition ≤6+Other + tables), Seller Distribution (leaderboard w/ rank movement + Lorenz curve vs equality diagonal), Concentration & Risk (CR1/CR4/CR8 tiles + decliners w/ trend evidence; empty decliners = explicit healthy finding), Incentive Yield (first-class: yield heroes, honest null-yield line, entity yield vs median, cost-side component decomposition w/ honesty caption, InsightSlot), Temporal Patterns (honest month grain; no fabricated heatmap), Geography (ranking + mix-over-time + member table; full C2 absence when location unresolved). Every page: 3–6 distinct component types, reference frame on every quantitative element, loading/error/notMaterialized/role-absence states via `StructuredAbsence`, bilingual throughout, Layer-2 tokens/ds003-tokens only.

**O4 — Insights.** `generateRevenueInsights()`: four deterministic RANK-BASED classes (momentum_shift, mix_shift, concentration_alert CR-ratio moves, incentive_yield_outlier divergence-from-median) — zero tuning constants (top-N caps documented as presentation bounds); rows in `intelligence_artifacts` with `source='revenue-insight'` + `context.kind`, free-form prose `artifact_type` (no enum — table contract honored). Existing `generateInsights()` wipe scoped to its own source (+ legacy NULL-source rows) — behavior-neutral today (P0-verified), ends the cross-writer wipe hazard. `GET /api/revenue/insights` is the FIRST reader of `intelligence_artifacts` ever; `InsightSlot` renders it when `intelligence_enabled`, else the entitlement-aware bilingual upsell placeholder (PLG hook) with NO computation.

## §3 Review hardening (adversarial multi-agent review, 25 agents; 10 verified findings, ALL FIXED in `887f8d3a`)

1. Measure-provenance discipline (quota/target rows sharing the measure field name would inflate revenue → multi-class ambiguity now C2 fail-loud). 2. SR-39 scope was never SENT by Revenue clients → all 8 pages now derive scope via `usePersona()` exactly like the Financial pages. 3. Scope was ignored by entity-grain bridge/mix + yield payout sums → scope now governs everything entity-derivable; dimension-grain sections return an explicit absence under scope (fail-closed; `scope=[]` → empty). 4. Un-paged insight reads (silent 1000-row truncation) → paged. 5. Unresolved-measure runs left stale rollups+insights being served → all namespaces cleared + insights re-run. 6. Entitlement PATCH lacked `maxDuration` for inline activation → 300. 7. Concurrent-materializer duplicate-row race → unique grain index added to the (unapplied) migration; second inserter fails loudly, re-run heals. 8. Finalize's 300s budget carried two whole-tenant scans → revenue step moved post-insights, fire-and-forget (flywheel idiom); `/api/revenue/activate` is the deterministic re-run. 9. Insight-engine wipe now also covers legacy NULL-source rows. 10. Four hand-rolled pagination loops → one shared `lib/serving/paged.ts`.

## §4 Korean Test EPG (DD-5 pasted body + DD-4 scoped greps)

Role-resolution function body (the ONLY place roles are derived — zero field names):

```ts
export async function resolveRevenueRoles(
  sb: SupabaseClient,
  tenantId: string,
): Promise<{ roles: RevenueRoles; absences: RoleAbsence[] }> {
  const roles = {} as RevenueRoles;
  const absences: RoleAbsence[] = [];

  for (const key of Object.keys(REVENUE_SURFACES) as RevenueRoleKey[]) {
    const spec = REVENUE_SURFACES[key];
    const r = await recognize(sb, tenantId, spec.surface, spec.purpose);
    let role: ResolvedRevenueRole;
    if (r.status === 'resolved' && r.fields[0]) {
      role = {
        status: 'resolved',
        field_name: r.fields[0].field_name,
        display_label: r.fields[0].display_label,
        confidence: r.fields[0].confidence,
      };
    } else {
      const reason = r.status === 'unresolved' ? r.reason : 'recognition returned no fields';
      role = { status: 'unresolved', reason };
      absences.push({ role: key, reason });
    }
    roles[key] = role;
  }

  return { roles, absences };
}
```

Scoped greps over this directive's new modules (DD-4), run post-fixes:

```
$ grep -rnE "Monto|Sucursal|mesero_id|propina|pos_cheque|alimentos" \
    src/lib/revenue src/app/api/revenue src/app/revenue src/components/revenue src/lib/serving
EMPTY (exit 1)
$ grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|bg-(red|green|blue|amber|emerald|yellow|purple|rose|orange)-" \
    src/app/revenue src/components/revenue
EMPTY (exit 1)
```

Schema naming: `summary_rollups(dimension_role, dimension_member, data_type, metrics)` — recognition output + tenant data as VALUES, zero domain vocabulary in columns (the `mesero_id`-class violation does not recur).

## §5 SR-39 evidence block (access control)

Both gates exist and deny, not decorate:
- **Menu gate LIVE:** `canAccessWorkspace(role, ws, enabledFeatures)` checks `featureFlag` (`role-workspaces.ts:68-75`); ALL callers pass `(currentTenant?.features ?? {})` (ChromeSidebar:183, VialuceSidebar:63, WorkspaceSwitcher:53, navigation-context:153/229/259, PersonaSwitcher:78).
- **Route gate SERVER-side:** `permissions.ts:368: { prefix: '/revenue', feature: 'revenue_enabled' }` → `middleware.ts:413-436` loads the effective tenant's features (platform admins via `vialuce-tenant-id` cookie), `isFeatureEnabled` fail-closed → redirect `/unauthorized` + `auth.permission.feature_denied` audit log.
- **Client gate:** `app/revenue/layout.tsx` `<FeatureGate feature="revenue_enabled" redirectTo="/unauthorized">`.
- **Functional API gate:** all three `/api/revenue/*` routes call `isRevenueEnabledForTenant()` (service-role read, fail-closed) → 403 — the PRISM precedent, which Financial's API routes lack (named gap, not replicated).
- **Scope (F-8/F-9):** every page sends explicit `scopeEntityIds` for non-`canSeeAll` personas; route fails CLOSED (explicit `[]` → empty results; scoped callers get entity-grain data only; un-scopable dimension aggregates return a named absence).
- **PG-1 pre-state (live DB + dev server, 2026-07-01):**
```
GET /revenue (unauthenticated): HTTP 307 -> http://localhost:3000/login?redirect=%2Frevenue
BCL tenants.features: {"financial":true,"compensation":false,"prism_enabled":false}
revenue_enabled key present: false
summary_rollups: TABLE ABSENT (Could not find the table 'public.summary_rollups' in the schema cache)
BCL revenue.* surface_bindings rows: 0
BCL revenue-insight artifacts: 0
```
- Browser denial proof for an authenticated un-entitled user (menu absent AND `/revenue` → `/unauthorized`) is an SR-44 architect action — checklist §7 step 2. DS-014/Decision 123 verified: the gate is middleware architecture + API-layer checks, not navigation cosmetics.

## §6 Proof gates PG-1..PG-8

| Gate | Status | Evidence |
|---|---|---|
| PG-1 pre-state | **PASS (server-side)** + architect browser step | §5 block above; browser part = checklist step 2 |
| PG-2 activation | **PREPARED — blocked on migration** | Architect toggles Revenue ON for BCL in Observatory (checklist step 3); the PATCH response carries the full `activation` MaterializeResult (rows scanned, rollups written, duration); idempotent re-run via `POST /api/revenue/activate` returns `noop:true`. No import performed anywhere in the path. |
| PG-3 render | **PREPARED — blocked on migration** | Checklist step 4 (all 8 surfaces on BCL); CC captures dev-server log lines with response codes/times per surface |
| PG-4 truth match | **PREPARED — script committed** | `web/scripts/ob257-pg4-truth-derivation.ts` — independent reduce over `committed_data` via the PERSISTED recognition binding (`surface_bindings['revenue.measure']`), reported verbatim served-vs-derived per period, zero interpretation |
| PG-5 progressive performance | **PREPARED** | Repeat load of `/revenue` after activation; timing from dev/prod logs — serving path reads only rollup rows (order: 1–510 rows for BCL, the OB-237 wired-mode class) |
| PG-6 Finance regression | **CODE-LEVEL PASS** + architect browser step | Shared-file DD-6 table §8: financial route diff = 141 lines, ONLY moved-helper deletions + 2 imports (bodies verified byte-identical with `export ` stripped); `summary-read.ts` + `surface-binding-recognition.ts` UNTOUCHED (same blob SHA). 583/583 tests. Browser value-match on a sampled Sabor mode = checklist step 6 |
| PG-7 theme | **PREPARED** | Checklist step 7 (theme selector on `/revenue`); code-level: zero color literals (grep §4), all chart internals via ds003-tokens `var(--vl-*)` patterns |
| PG-8 build clean | **PASS** | Fresh sequence per standing rules: kill dev → `rm -rf .next` → `npm run build` exit 0 (BUILD_ID `kTyaTEDVCM8qhtSQjEd3h`) → `npm run dev` → `localhost:3000` HTTP 307 (auth redirect, server live). Tail: `ƒ Middleware 77.7 kB / ○ (Static) prerendered as static content / ƒ (Dynamic) server-rendered on demand`. Tests: `583 pass / 0 fail`. All 8 `/revenue*` routes + 3 `/api/revenue/*` routes in the build manifest. |

## §7 ARCHITECT VERIFICATION CHECKLIST (SR-44 gates — execute in order, report back)

1. **Apply the migration** (SQL Editor): paste `web/supabase/migrations/20260704_ob257_summary_rollups.sql` (table + 3 indexes + unique grain index + RLS). Then tell CC — CC verifies live via `npx tsx --env-file=.env.local scripts/ob257-verify-migration.ts`.
2. **PG-1 browser:** log in with BCL as the effective tenant (platform admin + tenant switcher). Confirm: no Revenue menu group in any sidebar; direct navigation to `/revenue` lands on `/unauthorized`. Screenshot both.
3. **PG-2 activation click-path:** Platform Observatory → Tenant Management → Banco Cumbre del Litoral → Entitlements → toggle **Revenue** ON. No import, no file touch. The response carries the activation result; CC then captures the backfill log + runs the idempotency re-run (`POST /api/revenue/activate`, expects `noop:true`) and pastes both.
4. **PG-3 render:** with BCL effective, visit `/revenue`, `/revenue/bridge`, `/revenue/mix`, `/revenue/sellers`, `/revenue/concentration`, `/revenue/yield`, `/revenue/patterns`, `/revenue/geography`. Expect real values on all; `/revenue/mix` + `/revenue/geography` sections depending on the category/product dimension will show the explicit structured-absence block (BCL has no product column — P0-verified, correct behavior, not a defect). Note anything that renders empty WITHOUT a named absence (that would be a C2 violation).
5. **PG-5:** reload `/revenue` twice; confirm repeat-load speed (no recomputation).
6. **PG-6:** with Sabor effective, spot-check `/financial/pulse` and `/financial/timeline` — values unchanged vs. pre-branch.
7. **PG-7:** on `/revenue`, switch themes via the theme selector (Dark, Bliss, Vialuce) — no hardcoded-color artifacts; screenshots for two themes.
8. **Ratifications requested (P0 §8):** (a) loan-placement-as-revenue semantics for BCL (recognition resolved `Monto_Colocacion` @0.82 — Decision 158 honored; reject → HALT-2 disposition returns to architect); (b) `summary_rollups` Clean Slate disposition (currently in the `calc` category + `DELETE_TENANT_TABLES` — the HF-370 drift guard forced a disposition; pure leaf, outbound-CASCADE FKs only; move to ARCHITECT_REVIEW if preferred); (c) the OB-231→HF-337 premise correction and the environment pin (this evidence set is the `.env.local` database).

## §8 DD-6 shared-file integrity table (pre → post blob SHA)

| File | Pre | Post | Nature of change |
|---|---|---|---|
| `api/financial/data/route.ts` | `fa98dabb` | `b57bc619` | PURE MOVE only (helpers → `lib/serving/`, imports back; bodies byte-identical) |
| `lib/insight/insight-engine.ts` | `2c744720` | `3b990cc0` | Wipe scoped to own source + NULL-source legacy (behavior-neutral today, P0-verified) |
| `api/import/sci/finalize-import/route.ts` | `c715870c` | `19211892` | One additive block: post-insights fire-and-forget revenue step, entitlement-gated |
| `platform/tenants/[tenantId]/entitlement/route.ts` | `f8be5c60` | `e0df5723` | Additive: activation trigger on false→true + `maxDuration` |
| `types/tenant.ts` | `c1bf2b90` | `b42e95d1` | Additive key |
| `lib/navigation/workspace-config.ts` | `7b003950` | `cd8d6c6f` | Additive workspace |
| `lib/auth/permissions.ts` | `676e0084` | `38e50d5c` | Additive WORKSPACE_FEATURES entry |
| `lib/summary/summary-read.ts` | `bb4275e1` | `bb4275e1` | **UNTOUCHED** (consumed as-is) |
| `lib/comprehension/surface-binding-recognition.ts` | `cc1aa7f5` | `cc1aa7f5` | **UNTOUCHED** (consumed as-is) |

## §9 Residuals (named)

1. **Pre-existing:** BOTH summary-engine paths (JS `summary-engine.ts:245` + RPC) wipe `summary_artifacts` TENANT-WIDE on finalize, destroying calc-produced `period_outcomes` sentinels until the next calc run — pre-dates OB-257; `summary_rollups` sidesteps it for revenue; the engine defect itself is unaddressed (future HF).
2. Enterprise-scale (5M+ rows) activation derivation wants a SQL write-time reduce (the `compute_summary_artifacts` precedent) — JS paged path is the operative one (fine through Sabor-class 263K; scale table in the ADR); not shipped because CC cannot iterate on SQL it cannot execute (SR-44).
3. Sub-period revenue grains (day/hour) for tenants whose data supports them — same class as the OB-237 staff/patterns residual. Multi-level geography (region above branch) likewise.
4. Revenue activation for Robles/Casa Diaz/CRP/Meridian — mechanical once the BCL proof stands (directive §6).
5. Finance API-route functional entitlement gate gap (P0 item 3) — Revenue does not replicate it; fixing Finance is out of scope here.
6. `salesFinance` half-dead key (nav → nonexistent route; Finance industry template default-true) — flagged in P0, untouched.
7. Fire-and-forget dispatches in finalize-import (flywheel + now revenue) share the serverless post-response-death risk class; `/api/revenue/activate` is the deterministic recovery.
8. Predictive revenue intelligence (Thalamus joint-recognition) — the four shipped classes are deterministic comparisons per the directive; predictive classes are a Thalamus-arc item.
9. Pre-existing TS2802 in two committed SCI test files (`hf350`/`hf370` tests) under raw `tsc --noEmit` — never gated build/tests; untouched.

## §10 P0 premise corrections (architect channel — full detail in `docs/diagnostics/OB-257_P0_DISCOVERY.md`)

(1) OB-231 ≠ convergence-driven financial serving (that is HF-337 + OB-229/237; merged, Sabor-only, `pos_cheque`-gated). (2) HALT-2 not triggered: recognition derives BCL's revenue role (`Monto_Colocacion` @0.82) with zero reimport — ratification requested. (3) BCL has no product dimension anywhere (C2 absences on product decompositions are correct). (4) BCL's 6 periods are `open`, not closed (inert for serving). (5) OB-253 Thalamus is read-time; the write-time insight mechanism is OB-232 (`intelligence_artifacts` — which had ZERO readers before OB-257). (6) OB-211's gate defects were already fixed by OB-250/252 — O1 replicated the fixed pattern. (7) Environment pin: all evidence here is the `.env.local` database; recent HF-371/372 live proofs are recorded against a different environment.

---

```
ARTIFACT SYNC
MC: [OB-257 → code-complete, HALT-3 pause at activation gates; new items: summary-engine tenant-wide
     wipe defect (pre-existing, residual 1); Finance API functional-gate gap (residual 5);
     salesFinance half-dead key (residual 6)]
REGISTRY: [entitlement-gate row → add OB-257 evidence (menu+route+API three-layer deny, SR-39 block §5);
           MSP row → add summary_rollups (period/dimension grain store, wipe-immune);
           retire: none; proposed L-level Δ: activation-from-signals L0→L1 on PG-1..PG-5 completion]
R1: [entitlement-gated agent surfaces → BUILT+server-verified, browser gate pending architect (§7.2);
     agent activation without reimport → BUILT (toggle→materializer→rollups→insights, zero file touch),
     live proof pending migration + §7.3]
BOARD: [now: Revenue agent code-complete on branch, 8 surfaces + serving + insights + activation;
        gap: migration application + PG-2..PG-7 execution; ev: P0 report, ADR, 583/583, review 10/10 fixed;
        ef: ~8 waves (2 impl workflows, 1 review workflow, 25+18 agents); fl: HALT-3 active, HALT-2/4
        cleared by evidence; lane: agent activation / revenue persona]
SUBSTRATE: [exercised: HF-337 recognition (self-priming binding proven on a NON-POS tenant), OB-237 MSP
            (extended with a grain-honest rollup store), OB-252 structural toggle derivation (5th agent key
            with zero registration), C2 structured absence end-to-end; candidate ICA captures:
            measure-provenance ambiguity discipline (multi-class fail-loud); writer-owned namespace
            replace as the idempotency idiom; entitlement-toggle-as-activation-trigger]
```

---

# O5 EXECUTION ADDENDUM (2026-07-01, post-merge of PR #655; migration applied by architect)

**Migration verified live (FP-49):**
```
$ npx tsx --env-file=.env.local scripts/ob257-verify-migration.ts
summary_rollups EXISTS. total rows: 0
all summary_rollups columns present (grain + metrics + computed_at)
```

**PG-2 — ACTIVATION: PASS.** `revenue_enabled` flipped false→true for BCL (CLI equivalent of the toggle; the Observatory click-path remains available and no-ops idempotently). The single materializer ran — no import, no file touch, no classification pass:
```
features BEFORE: {"financial":true,"compensation":false,"prism_enabled":false}
features AFTER : {"financial":true,"compensation":false,"prism_enabled":false,"revenue_enabled":true}
[trace] revenue-roles measure=resolved location=resolved category=unresolved
[trace] revenue-pass1 dimensionEntities=location:85
[trace] revenue-pass2 scanned=595 withMeasure=510 attributed=510 unattributed=0
[trace] revenue-rollups-written period=6 entityPeriod=510 dimensionPeriod=66 (+1 meta)
[trace] revenue-insights-done written=13
RESULT 1: ok=true, durationMs=11185, rollupsWritten={period:6, entityPeriod:510, dimensionPeriod:66}
```
Roles (persisted in the `revenue_meta` row): measure=`Monto_Colocacion`@0.82 (**byte-matches the P0 probe** — deterministic recognition), location=`Sucursal_ID`@0.95 (entity-attribute dimension: 85 entities mapped, 11 branch members × 6 periods = 66 dimension rollups), category=unresolved "no satisfying field" (correct — BCL has no product column; C2 absence). `measure_provenance: {data_type:"transaction", rows:510}` — single-class, unambiguous.
Idempotency re-run:
```
[trace] revenue-rollups-noop rows=582 (data identical to existing -- meta refreshed only)
RUN: {"ok":true,"noop":true,"durationMs":2345}
```
**Defect found + fixed during PG-2:** the first re-run returned `noop:false` — the meta row's role-absence reason carries the recognizer's cache marker (`'cached: ...'`), which flips between the priming run and re-encounters. FIX (this branch): the noop compare is scoped to the three DATA namespaces; the meta row is state and refreshes every run. Regression-proven live: category binding cache invalidated (forces fresh recognition + drifted reason) → re-run still `noop:true` with data untouched.

**PG-4 — TRUTH MATCH: PASS (values verbatim, served vs derived, per period — no interpretation):**
```
DERIVATION FIELD (from persisted recognition): Monto_Colocacion
committed_data rows scanned: 595; measure rows unattributed to a period: 0
period          | derived (committed_data) | served (revenue_period rollup) | rows d/s
October 2025    | 8834638.59               | 8834638.59                     | 85/85
November 2025   | 8841645.1                | 8841645.1                      | 85/85
December 2025   | 10204372.25              | 10204372.25                    | 85/85
January 2026    | 8958073.63               | 8958073.63                     | 85/85
February 2026   | 9433305.44               | 9433305.44                     | 85/85
March 2026      | 10121470.56              | 10121470.56                    | 85/85
TOTAL           | 56393505.57              | 56393505.57                    |
```

**PG-5 — PROGRESSIVE PERFORMANCE (serving half): PASS.** Repeat pulse-mode serving reads (exactly what `/api/revenue/data` performs): 7 rollup rows + 6 period rows per encounter, 214ms → 94ms → 111ms — materialization speed, zero recomputation (activation cost paid once: 11.2s). Browser repeat-load = architect checklist step 5.

**O4 activation promise: KEPT.** Activation (not import) lit up insights: 13 `source='revenue-insight'` artifacts — momentum_shift:4, mix_shift:3, concentration_alert:2, incentive_yield_outlier:4.

**Verification on this branch:** fresh `rm -rf .next && npm run build` exit 0 (BUILD_ID `Wdqtqho3og6Km-Lw1kFja`); 583/583 tests; only the 2 known pre-existing TS2802s in raw tsc.

**Remaining architect gates (checklist §7):** PG-1 browser denial screenshots (un-entitled tenant — note BCL is now entitled; use another tenant or toggle off/on), PG-3 8-surface browser render, PG-5 browser repeat-load, PG-6 Sabor Finance spot-check, PG-7 theme pass, plus the three ratifications (§7.8).
