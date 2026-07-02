# OB-257 P0 DISCOVERY — Revenue Agent

**Date:** 2026-07-01
**Branch:** `ob-257-revenue-agent` (directive committed at `2cd80120`)
**Method:** 6 parallel discovery agents + 1 adversarial completeness critic (ULTRACODE workflow), all claims backed by pasted live-DB queries (tsx service-role scripts under `web/scripts/ob257-p0-*.ts`, all read-only) and file:line code citations. This database (`web/.env.local`) is the evidence source throughout.

**HALT DISPOSITIONS (summary):**
- **HALT-1: CLEAR.** OB-257 unconsumed (item 1).
- **HALT-2: NOT TRIGGERED on its literal terms** — BCL's `convergence_bindings` carry no revenue identity (first clause TRUE), but a Decision-158-compliant zero-reimport derivation EXISTS and was empirically proven (second clause FALSE): the merged HF-337 `recognize()` mechanism resolves BCL's revenue purpose to `Monto_Colocacion` @0.82 from live comprehension artifacts (item 4). Residual architect ratifications are named in §8 — none blocks proceeding; each is reported, not silently decided.
- **HALT-3: ANTICIPATED** — a new rollup table is structurally required (item 5 + §7); migration will be authored at the SQL Verification Gate and paused for architect application per directive §3.2.
- **HALT-4: NOT TRIGGERED** — the convergence-driven serving mechanism is MERGED and unregressed; but the directive's attribution to "OB-231" is a premise error (item 2), and the Financial route was never operative for BCL (it is `pos_cheque`-gated). The activation proof stands on O2's new Revenue serving, which consumes the same merged mechanism.

**PREMISE CORRECTIONS (architect channel):**
1. **OB-231 is not the convergence-serving effort.** In this repo OB-231 = "Free-Form Column Characterization" (comprehension layer, PR #583, merged 2026-06-22). The convergence-driven Financial serving the directive describes = **HF-337** (surface-binding recognition + finance repoint, `7f31053c`, on main) + OB-229 (Summary Engine) + OB-237 (materialized serving). Merged, operative for Sabor; never wired for BCL.
2. **Financial serving is only partially recognition-driven**: 4 of 11 modes use `recognize()`; 7 modes hardcode Spanish POS metric keys; the entire route is gated on `data_type='pos_cheque'` (9 occurrences). BCL's artifacts are `data_type='transaction'` → every Financial mode returns empty for BCL today.
3. **BCL is a banking ICM tenant with no literal revenue-transaction rows.** Its 510 "transaction" rows are monthly per-employee performance snapshots; monetary sales measures are `Monto_Colocacion` (loan placement) and `Depositos_Nuevos_Netos` (net new deposits). "Revenue" for BCL = sales-production volume, subject to architect ratification (§8).
4. **BCL's 6 periods are all `status='open'`** (directive said "6 closed periods"). Verified inert: no serving or calculation path filters on period status (critic grep, §6 evidence).
5. **OB-253 Thalamus is NOT the write-time insight mechanism** (it is read-time, consumed only by `/api/data/overview`). The existing write-time mechanism is the OB-232 Insight Engine → `intelligence_artifacts` (item 7).
6. **OB-211's entitlement defects are already fixed** (OB-250/OB-252): menu gate live, `/financial` server-gated in middleware + client FeatureGate. O1 replicates the fixed pattern (item 3).
7. **Environment pin (O5 risk):** this database has no `committed_data` newer than 2026-06-21, while HF-371/372 live proofs (2026-07-01) are recorded elsewhere — those ran against a different environment. All OB-257 proof gates must be gathered against ONE pinned environment; this report's facts describe the `.env.local` database.

---

## Item 1 — Sequence number: OB-257 UNCONSUMED

```
$ ls docs/vp-prompts/ | grep -i "OB-257\|OB_257"
OB-257_DIRECTIVE_20260701.md          <- this directive itself (pre-placed, committed 2cd80120)
$ ls docs/completion-reports/ | grep -i "OB-257\|OB_257"
(empty — exit 1)
$ git branch --show-current && git log --oneline -2
ob-257-revenue-agent
2cd80120 OB-257: commit directive (Revenue Agent - entitled agent, activation-from-signals, revenue intelligence surfaces)
2bd8db2b HF-372: Restore the import process end-to-end — Casa Diaz imports, recognition uncorrupted, construction deterministic, status truthful (#654)
```

## Item 2 — OB-231 status (HALT-4 gate)

**Verdict: the convergence-driven serving mechanism is MERGED and OPERATIVE on main; the directive's "OB-231" attribution is a premise error; nothing regressed — the un-converted parts were never built. HALT-4 not triggered.**

- OB-231's real identity: `docs/vp-prompts/OB-231_DIRECTIVE_20260622.md` — "Free-Form Column Characterization: Remove Fixed Role Vocabulary" (import/comprehension layer, proof tenant MIR). PR #583 MERGED 2026-06-22T12:46:21Z, squash `22e4884c`, ancestor of main (verified `git merge-base --is-ancestor`). Zero financial-serving scope.
- The described work is **HF-337** "Surface Binding Recognition — recognizer + finance repoint" (`7f31053c`, on main), on top of HF-336 (`182e2bd5`, Sabor binding population), OB-229 (`a543c706`, Summary Engine), OB-237 (PR #598, `0095c26f`, materialized serving).
- Financial route: `web/src/app/api/financial/data/route.ts` (POST, 1549 lines, 11 modes). Recognition-driven modes (call `recognize()` from `web/src/lib/comprehension/surface-binding-recognition.ts`): `network_pulse` (route.ts:360-380), `leakage` (:412-419), `timeline` (:787-793), `products` (:923-929). Hardcoded-Spanish-key modes: `performance` (:513-520 — `m.total, m.propina, m.total_alimentos, m.total_bebidas, m.total_descuentos, m.total_cortesias`), `summary` (:856-861), `location_detail` (:1127-1143), `server_detail` (:1240-1248), `cheques` drill-through (:1335-1341, `row_data->>mesero_id` etc. + Spanish category enum). `ChequeRowData` (route.ts:24-48) declares the 23-column Spanish POS contract.
- Whole-route data_type contract: `'pos_cheque'` appears 9× in route.ts. BCL summary_artifacts: `{transaction: 510, period_outcomes: 6}` — **never `pos_cheque`** → Financial serving is structurally inert for BCL.
- Live `surface_bindings`: exactly 10 rows, ALL tenant Sabor (`f7093bcc-e90b-4918-9680-69da7952dd65`), e.g. revenue→[total,pagado]@0.95, tips→[propina]@0.99. **BCL: 21 `comprehension_artifacts`, 0 `surface_bindings`** (recognition is self-priming on first encounter — see item 4).
- No hardcoded tenant IDs in the financial serving path (grep clean); tenant is session-derived via `resolveCallerTenant` (OB-246). The strongest per-tenant contract is at the MATERIALIZATION layer: `summary_artifacts_fine` + `staff_rollup`/`patterns_rollup` tiers were populated only by one-off scripts hardcoding the Sabor tenant id and Spanish field mappings (`web/scripts/ob237-populate-fine-sabor.ts:12-25`, `ob237-populate-rollups-sabor.ts:32,72`) — no production writer exists for the fine tier.

## Item 3 — Entitlement mechanism (live-read)

**Shape:** `tenants.features` is a flat jsonb OBJECT (string→boolean; live-verified for all 16 tenants). Canonical read: `isFeatureEnabled()` (`web/src/lib/tenant/feature-flags.ts:28-40`) — explicit boolean wins → `DEFAULT_FEATURES` fallback → fail-closed false. Typed contract + defaults SSOT: `web/src/types/tenant.ts:28-74` (15 boolean keys: compensation, performance, salesFinance, transactions, forecasting, gamification, learning, coaching, whatsappIntegration, mobileApp, apiAccess, financial, prism_enabled, intelligence_enabled, compensation_enabled; + optional `lifecyclePipeline` string).

**Live tenant rows (verbatim):**
```
BCL   b1c2d3e4-aaaa-bbbb-cccc-111111111111: {"financial":true,"compensation":false,"prism_enabled":false}
Sabor f7093bcc-e90b-4918-9680-69da7952dd65: {"icm":true,"import":true,"disputes":true,"financial":true,"reconciliation":true}
(16 tenants scanned; distinct live keys: apiAccess, coaching, compensation, disputes, financial, forecasting,
 gamification, icm, import, learning, mobileApp, performance, prism_enabled, reconciliation, salesFinance,
 transactions, whatsappIntegration — NO 'revenue'-like key anywhere; collision-free)
```
BCL's `compensation:false` is the documented STALE BILLING key — `types/tenant.ts:46-52` records that agent keys (`*_enabled`) are deliberately DECOUPLED from billing keys. Naming precedent for the new key: **`revenue_enabled`** (OB-252 pattern), default-OFF (licensable, like `financial`/`prism_enabled`).

**Menu gate LIVE (OB-211 inert-gate defect fixed):** `canAccessWorkspace(role, ws, enabledFeatures)` (`role-workspaces.ts:68-75`) checks `ws.featureFlag`; ALL callers pass `(currentTenant?.features ?? {})`: `ChromeSidebar.tsx:183`, `VialuceSidebar.tsx:63`, `WorkspaceSwitcher.tsx:53`, `navigation-context.tsx:153/229/259`, `PersonaSwitcher.tsx:78`.

**Route gate (two layers, the Financial precedent):**
- SERVER: `middleware.ts:413-436` — `requiredFeatureForPath()` over `WORKSPACE_FEATURES` (`permissions.ts:357-388`; `'/financial'→'financial'`), effective tenant = platform admins via `vialuce-tenant-id` cookie, others via profile identity; fail-closed → redirect `/unauthorized` + `auth.permission.feature_denied` log.
- CLIENT: `app/financial/layout.tsx:16-22` — `<FeatureGate feature="financial" redirectTo="/unauthorized">`.

**Observatory toggle surface (OB-252):** `TenantManagementTab.tsx` EntitlementSection (:320-398) renders `getToggleableAgents()` (STRUCTURALLY derived from `WORKSPACES` entries carrying `featureFlag` — `workspace-config.ts:542-557`) → `PATCH /api/platform/tenants/[tenantId]/entitlement` (validates against `toggleableFeatureKeys()`, service-role write, audit_logs row, gate = `authorizePlatformObservability()` = `platform.system_config` capability). It does NOT use `resolveActor()` and does not need to — target tenant is the explicit URL param (not HF-357-class).

**Consumer classification (DD-2):** LIVE = feature-flags.ts (predicate); types/tenant.ts (SSOT); tenant-context.tsx:91/101/253-256/306-311 (client merge + hooks); feature-gate.tsx (FeatureGate; sole route consumer financial/layout.tsx:18); middleware.ts:413-436; permissions.ts:357-397; workspace-config.ts:51/108/199/245 (featureFlags) + :542-557 (toggleable derivation); role-workspaces.ts:68-87; entitlement/route.ts (the ONE writer); prism/capability.ts + prism/tenant-feature.ts → 4 PRISM API routes (the only FUNCTIONAL API-layer gates); modules/route.ts:48-66 (BILLING writer, separate keys); creation writers (signup, platform/tenants/create, admin/tenants/create, provisioning-engine.ts:372-396, admin/tenants/new form). INERT/DEAD = `components/navigation/Sidebar.tsx` (zero importers), `PrismCapabilityToggle.tsx` (zero mounts), `api/platform/tenant-config/route.ts` (no caller).

**Canonical recipe for `revenue_enabled` (all gates derive from ~3 declarations):**
1. Add key to `TenantFeatures` + `DEFAULT_FEATURES` (false).
2. Declare a new WORKSPACES entry with `featureFlag: 'revenue_enabled'` → menu gate, Observatory toggle row, entitlement-API validation, capability intersection ALL derive automatically.
3. Add `{ prefix: '/revenue', feature: 'revenue_enabled' }` to `WORKSPACE_FEATURES` (server deep-link gate).
4. `app/revenue/layout.tsx` FeatureGate (Financial precedent).
5. Functional API gate on the Revenue serving route (PRISM precedent `isPrismEnabledForTenant` — **note: Financial's API routes lack this today; a known gap** the Revenue agent will not replicate).
6. Tenant-setup surface: `admin/tenants/new/page.tsx` feature list (the critic found the Observatory recipe alone misses this directive requirement).

**Adjacent-key caution (critic):** `salesFinance` is live-but-half-dead — nav-gated to a NONEXISTENT `/insights/sales-finance` route (`Sidebar.tsx:137` — dead sidebar; but `admin/tenants/new/page.tsx:70,118` + Finance industry template `provisioning-engine.ts:127` set it). Revenue naming/menu-group must not collide or be confused with it.

## Item 4 — Convergence revenue-role coverage (HALT-2 gate)

**Storage:** convergence bindings live on `rule_sets.input_bindings.convergence_bindings` (JSONB; NO dedicated table) — shape `component_N → dag_field → {column, confidence, field_identity{structuralType, contextualIdentity}, reduction, filters, learning_provenance}` (`web/src/types/convergence-bindings.ts:4-6,17-80`). Writer: `convergeBindings` (`lib/intelligence/convergence-service.ts:273`) persisted via `api/calculation/run/route.ts:294,312`. Readers: `run/route.ts:448`, `lib/results/field-identity.ts:33`. Per-field comprehension prose additionally in `comprehension_artifacts` (read by `lib/learning/convergence-recall.ts:33-75`).

**BCL live bindings (1 rule_set `7f5370df` "Plan de Comisiones — Banca Minorista 2025-2026", 8 components, verbatim dump in agent evidence):** 9 distinct bindings — `period→Periodo` (temporal/reporting_period_date @0.775), `entity_identifier→ID_Empleado` (identifier, field_identity @0.99 — binding-level confidence anomalously 0.1667), and 7 ICM measures: `Monto_Colocacion`→loan_placement_amount @0.95, `Depositos_Nuevos_Netos`→net_new_deposits_amount @0.97, `Meta_Colocacion`/`Meta_Depositos` targets, `Indice_Calidad_Cartera`→portfolio_quality_index, `Cantidad_Productos_Cruzados`→cross_sold_products_count, `Infracciones_Regulatorias`→regulatory_infractions_count. **NO binding carries a revenue/transaction-amount identity; NO product or location binding.**

**BCL role-class verdict:** revenue measure — NOT in convergence_bindings; product dimension — NOT RESOLVABLE and cannot be (no product column exists anywhere in BCL data; `Cantidad_Productos_Cruzados` is a count MEASURE); temporal — RESOLVABLE (`Periodo`); entity — RESOLVABLE (`ID_Empleado` @0.99); location — present in raw payloads + comprehension (`Sucursal` on transaction rows; `Sucursal_ID`/`Region` on entity rows) but NOT convergence-bound.

**Sabor live bindings (2 active rule_sets, identical component_0 covering all 27 pos_cheque columns; provenance `hf-336-standalone`):** revenue measure RESOLVABLE (`total`→revenue @0.95 + full decomposition: subtotal/net_revenue/food_revenue/beverage_revenue/tips/tax/payment split); temporal RESOLVABLE (`fecha`→transaction_datetime @0.99); entity RESOLVABLE (`mesero_id`→server_identifier @0.99); location RESOLVABLE (`numero_franquicia`→location_identifier @0.93, multi-location values live); product dimension NOT RESOLVABLE AS A DIMENSION (check-grain POS, no item/SKU column — mix only via food/beverage MEASURES; categorical dims available: service_type, payment_method, shift_category).

**HALT-2 analysis (the decisive evidence).** The directive's HALT-2 is a CONJUNCTION: *lacks a convergence-resolvable revenue-measure role* **AND** *no Decision-158-compliant derivation exists without reimport*. First clause TRUE (above). Second clause EMPIRICALLY FALSE — the critic ran the exact HF-337 `recognize()` LLM step (byte-identical SYSTEM prompt from `surface-binding-recognition.ts`, the Financial route's own revenue purpose text verbatim from route.ts:361, temp 0) against BCL's live 21 comprehension artifacts, NO persist:

```
$ npx tsx --env-file=.env.local scripts/ob257-p0-h-critic-halt2-probe.ts
BCL comprehension_artifacts: 21 fields: _rowIndex, Periodo, Monto_Colocacion, Pct_Meta_Depositos,
Depositos_Nuevos_Netos, Indice_Calidad_Cartera, Cumplimiento_Colocacion, Infracciones_Regulatorias,
Cantidad_Productos_Cruzados, ID_Empleado, Nivel_Cargo, Sucursal_ID, Region, _sheetName, Nombre_Completo,
Sucursal, Cargo, Meta_Depositos, Meta_Colocacion, ID_Gerente, Fecha_Ingreso
model: claude-sonnet-4-6 | purpose: the primary monetary amount of money earned or charged as the gross
outcome of each transaction or sale
LLM recognition result (NOT persisted): {
  "satisfying_fields": [ { "field": "Monto_Colocacion", "confidence": 0.82 } ],
  "unresolved": false
}
```

`recognize()` is self-priming (`surface-binding-recognition.ts:65-170`: comprehension read → cached `surface_bindings` → one temp-0 LLM call on miss → persist) — a zero-reimport, zero-hardcode, zero-keyword-scan derivation. **HALT-2 not triggered.** Residual architect ratifications in §8. Caveat: single temp-0 probe with one purpose text; the real first-encounter `recognize()` will persist whatever it resolves; location purposes (`Sucursal_ID`/`Region`) were NOT probed but are comprehended fields of the same kind.

**BINDING-STORE DESIGN FORK (ADR item — the directive's "convergence layer's per-tenant bindings" is ambiguous between two stores):** (a) `rule_sets.input_bindings.convergence_bindings` — calculation-input bindings, keyed to plan DAG fields, only exists where a plan references the field (hence no revenue identity for BCL); (b) `surface_bindings` via `recognize()` — serving-layer role resolution over comprehension artifacts, self-priming, the Financial serving precedent (HF-337). O2's ADR will select (b) with (a) consulted read-only where identities already exist; rationale in the ADR.

## Item 5 — Materialization coverage + write-time cascade

**Family:** `summary_artifacts` (import-triggered writer `lib/summary/summary-engine.ts` — RPC `compute_summary_artifacts` for no-comprehension tenants, `backfillSummariesJs` for comprehension tenants like BCL; PLUS calculation-triggered `period_outcomes` sentinel at `run/route.ts:3752-3775`); `entity_period_outcomes` (calculation-triggered, `run/route.ts:3675-3720`); `summary_artifacts_fine` (+ embedded `staff_rollup`/`patterns_rollup`/`patterns_meta` namespaces) — **script-only writers, in NO cascade**.

**Import cascade (single, coalesced per HF-371):** `finalize-import/route.ts` — entity resolution → assignments → generateComprehension → **runSummaryEngine (:132)** → completeFinalize → markJobsByProposal → **generateInsights (:157)** → flywheel backstop (:169). Dispatchers: client fire, execute-bulk `waitUntil` (HF-362), finalize-sweep cron.

**BCL coverage (live):** `summary_artifacts` 516 = 510 `transaction` rows at ENTITY×MONTH grain — metric keys are SEMANTIC DISPLAY LABELS (`'Monto de Colocación'`, `'Depósitos Nuevos Netos'`, `'Meta de Colocación'`, `'% Meta Depósitos'`, `'Índice Calidad Cartera'`, `'Productos Cruzados'`…), `period_id=NULL`, `summary_date` ∈ exactly the 6 periods' start_dates (1:1 join verified) — plus 6 `period_outcomes` payout sentinels (period_id SET; `{total_payout, entity_count, component_totals_by_name…}` — compensation, not revenue). `summary_artifacts_fine` = 0. `entity_period_outcomes` = 510 (85×6, all `lowest_lifecycle_state='PREVIEW'`). `committed_data` = 595 (85 entity + 510 transaction).

**Sabor coverage (live):** `summary_artifacts` 2,520 `pos_cheque` at ENTITY×DAY grain (period_id NULL, 2024-01-01→06-21). `summary_artifacts_fine` 88,640: `pos_cheque` 88,459 at entity×mesero×date×hour; `staff_rollup` 40; `patterns_rollup` 140; `patterns_meta` 1. `entity_period_outcomes` = 0. `committed_data` = 263,250 all `pos_cheque`.

**Revenue-grain gap (defines O2 backfill scope for BCL):**
1. Revenue-by-period (tenant×period totals): MISSING — derivable by reducing the 510 entity×month artifacts (committed_data not strictly required for measures).
2. Revenue-by-entity-period: SUBSTANTIVELY PRESENT (the 510 artifacts) but `period_id=NULL` — deterministic join `summary_date = periods.start_date` verified 1:1.
3. Revenue-by-dimension (Sucursal/Region/Cargo): ENTIRELY MISSING and NOT derivable from artifacts — the Summary Engine aggregates only `typeof === 'number'` fields (`summary-engine.ts:94-101`; RPC `jsonb_typeof='number'`), so text dimensions were dropped. MUST derive from `committed_data.row_data` (510 rows) + entity rows.
4. Hour/sub-entity grain: N/A for BCL (monthly snapshots, no timestamps).

**Storage-shape constraint (probed):** `summary_artifacts.entity_id` is **FK NOT NULL by design** (OB-229 migration comment: "rows with NULL entity_id (FK NOT NULL on summary_artifacts) … are skipped"). The calc sentinel BORROWS `outcomeRows[0].entity_id` (run/route.ts:3752) to satisfy it; the fine tier does the same (`patterns_meta` global row carries a borrowed entity_id + `sub_entity_id=''`; 0 NULL entity_id/sub_entity_id rows live; no committed DDL exists for the fine table). Period-grain and dimension-grain revenue rollups therefore have NO semantically honest home in the existing tables → **a new rollup table is structurally required (HALT-3 flow)**.

**WIPE HAZARDS (both confirmed, gate O2 design):**
- `backfillSummariesJs` deletes `summary_artifacts` TENANT-WIDE (`summary-engine.ts:245`, no data_type filter) on every import finalize for comprehension tenants (BCL qualifies) — and the critic confirmed the RPC path is identical (`20260622_ob229_summary_engine.sql:31`: `DELETE FROM summary_artifacts WHERE tenant_id = p_tenant_id;`). Anything stored in `summary_artifacts` outside the engine's own output is destroyed on the next finalize — this already silently destroys the calc-produced `period_outcomes` sentinels (pre-existing defect, flagged §8).
- `generateInsights()` delete-and-replaces ALL tenant `intelligence_artifacts` per run (`insight-engine.ts:196`, unscoped by source) — revenue insights written by a separate writer would be wiped at the next finalize unless the wipe is scoped by `source`.

**Serving reads (AP-17 sharing surface):** exported: `lib/summary/summary-read.ts` (`getSummaryArtifacts` — already `{dataType, entityId, from, to}`-parameterized — + `sumMetric/rollupByEntity/rollupByDate/networkTotals`). Route-LOCAL (must be extracted to share): `getFineArtifacts` (route.ts:168), `getRollupRows` (:212), `buildTimelineResponse` (:681, pure/source-agnostic), all 11 mode aggregators. Period-payout reader: `lib/insights/intelligence-data.ts` `getPeriodRollup/getPeriodTotal` (O(1) sentinel read — the Incentive Yield join surface).

## Item 6 — Finance visualization inventory (copy/incorporate map)

**Pages (11 routes, all `'use client'`, all behind the layout FeatureGate):** landing `/financial` (brand health + report discovery + commentary; rep persona auto-redirects to `/financial/server/{id}`), pulse, timeline, performance, staff, leakage (+cheques drill), patterns (7×24 heatmap), products, summary (P&L), location/[id], server/[id]. One serving endpoint: POST `/api/financial/data`, 11 modes, dispatch route.ts:1417-1537; client wrapper `lib/financial/financial-data-service.ts` (single `fetch`, :289-307).

**(a) SHAREABLE AS-IS:** `getSummaryArtifacts`/`sumMetric`/`rollupByEntity`/`rollupByDate`/`networkTotals` (summary-read.ts); `recognize()` (surface-binding-recognition.ts — parameterized by surface+purpose, no domain vocabulary); the **DS-003 component library** `components/insights/ds003/` (17 components: HeroMetric — reference frame REQUIRED by type, GaugeMetric, HorizontalBar, StackedBar, DistributionPosition, NeighborhoodLeaderboard, Sparkline, SparkTrend, ThresholdArea, PrioritySortedList, ConfigurablePipeline, SteppedProgress, StubAction, Panel, ValidityVerdict, IntelligenceElement + PersonaThemeProvider/DensityGate); shadcn ui primitives + recharts; math helpers `n/round2/makeBuckets/weekIndex/percentileRank` and `buildTimelineResponse` (pure but file-local — need export).

**(b) SHAREABLE WITH PARAMETERIZATION (all 11 aggregators; all module-PRIVATE in route.ts — extraction to lib/ is a prerequisite, DD-6/DD-7 discipline):** missing parameters per function: `dataType` (hardcoded `'pos_cheque'` 9×); measure resolution (4 modes hardcode surface ids `financial.network_pulse.*`; 6 modes hardcode raw Spanish keys `m.total/m.propina/…`); grouping hierarchy (brand = `entity_type='organization' && metadata.role==='brand'`, route.ts:127-149; staff join `metadata.mesero_id` :596-597); thresholds/targets hardcoded (tipTarget 12, leakageThreshold 3, 2.5/3.5, PI weights 40/30/30, magic denominators /500, /20 — route.ts:318-320, 478, 637-641, 1267-1271); server-side user-facing strings (P&L labels 'Gross Revenue', leakage categories 'Cancelaciones/Descuentos/Cortesías', tier names 'Estrella/Destacado…' WITH Tailwind classes in API payloads — route.ts:467-469, 886-900, 1273-1278).

**(c) NOT APPLICABLE to the revenue persona:** food/bev product-mix semantics, POS leakage taxonomy, avg service-minutes (cierre−fecha), tip-rate brand-health heuristics, server tier ladder, legacy manual-cheque stack (`lib/financial/financial-constants.ts` 23-column Spanish contract + parsers — localStorage-era, not the serving path).

**Idiom notes for O3:** Finance pages hand-roll Card+recharts and do NOT use the ds003 library — Revenue consumes ds003 directly (the directive's DS-003 rules map onto it; `HeroMetric.context` is typed non-optional). Theme: three-layer tokens in `globals.css` (Layer 2 slots :600-604 — `--vl-kpi-accent`, `--vl-cta-primary`, `--vl-status-success/danger` …); dual-render `useIsVialuce` branch pattern; DO-NOT-COPY: `BRAND_PALETTE` hex array (route.ts:125), landing raw Tailwind color classes (financial/page.tsx:144-146), DEAD reference frame (`finalizeNetworkPulse` hardcodes `revenueChange:0` — route.ts:312-316; Revenue must compute real prior-period deltas). i18n: inline `isSpanishLocale()` ternaries via `useLocale()`; 5 of 10 Finance sub-pages are English-only (timeline, leakage, patterns, products, summary) — not a pattern to copy; Revenue is bilingual from birth. Currency: `useCurrency()` from tenant-context.

## Item 7 — Intelligence artifact hook

**The existing write-time mechanism is the OB-232 Insight Engine** — `generateInsights()` (`lib/insight/insight-engine.ts:165-262`): deterministic digest over summary_artifacts → temp-0 LLM → validate → INSERT `intelligence_artifacts`; idempotency = DELETE all tenant artifacts then reinsert (:196). Trigger: finalize-import step 5 (:157), post-critical-path (HF-372 Phase D); manual admin trigger `/api/admin/insights/generate`. **`calculation/run` does NOT trigger insights** — so the O2 activation backfill (which bypasses finalize-import) must invoke revenue-insight generation itself, exactly as directive §3.4 requires.

**Storage shape** (`20260622_ob232_intelligence_artifacts_recovery.sql`, live-verified): id, tenant_id NOT NULL, entity_id nullable, period_id nullable (NULL on all 22 live rows — period scope lives in `context.period_start/period_end`), `artifact_type` TEXT **free-form prose by design** (22 distinct strings, no enum — DS-030 C0/Korean Test), severity TEXT free-form, title NOT NULL, narrative, data_references jsonb, shape_description, structural_fingerprint_hash, `source` TEXT ('insight-engine' on all 22), context jsonb, source_import_batch_id; RLS tenant_isolation. Live: 22 rows (BCL 8, Sabor 7, MIR 7).

**CRITICAL GAP: `intelligence_artifacts` has ZERO readers anywhere in the app** (repo-wide grep; PC-4 comment in the writer confirms). What renders as "insights" today is a DIFFERENT same-named engine: `lib/intelligence/insight-engine.ts` (deterministic, client-side, OB-98) → InsightPanel on /perform dashboards; /insights pages read summary_artifacts directly. **O4 builds the FIRST reader** of intelligence_artifacts (the Revenue insight slot), gated by `intelligence_enabled` (default-ON), with a NEW upsell placeholder (no PLG component exists in code; nearest primitive = FeatureGate `fallback` prop).

**Attach-point design constraints:** (1) sequence/scope the tenant-wide wipe — revenue-insight rows need a `source` discriminator (e.g., `'revenue-insight'`) and the existing wipe scoped `.eq('source','insight-engine')` (behavior-neutral today: all 22 live rows carry that source); (2) the four fixed revenue classes discriminate via `source`/`context.kind`, NEVER an `artifact_type` enum (table contract); (3) do NOT wire into `lib/intelligence/insight-engine.ts` (naming trap).

## §8 — Architect flags (report-only; none blocks execution)

1. **Ratify revenue semantics for BCL:** the revenue-measure role resolves to `Monto_Colocacion` (loan placement) @0.82 — "what was sold" for a banking ICM tenant. The Revenue agent will treat recognition output as authoritative (Decision 158); if the architect rejects loan-placement-as-revenue, that is a HALT-2 disposition to send back.
2. **BCL product dimension is structurally absent** (no product column in any BCL payload) — Mix/Growth-Bridge product decompositions will render C2 explicit absence for BCL; entity/location/role dimensions carry the decomposition instead.
3. **Binding-store selection** (item 4 fork): O2 ADR selects `recognize()`/`surface_bindings` (HF-337 serving precedent, self-priming). Flagged for ratification.
4. **Pre-existing defect (not OB-257's to widen):** BOTH summary-engine paths wipe `summary_artifacts` tenant-wide on finalize, destroying calc-produced `period_outcomes` sentinels until the next calculation run. O2's new-table design sidesteps it for revenue rollups; the underlying defect is a named residual.
5. **Fine-tier rollups have no production writer** (Sabor one-offs) — any Revenue mode reusing that tier inherits staleness; O2 does not build on it for the BCL proof.
6. **Environment pin for O5:** proof gates will be executed against THIS `.env.local` database + localhost dev server unless the architect directs production; served-vs-derived numbers must come from the same pinned environment.
7. **BCL periods all `status='open'`** (directive premise said closed) — verified inert for serving.
8. **Sabor "financial-only" folklore is stale:** Sabor has 2 ACTIVE rule_sets (`ruleSetCount=2`, `useFinancialOnly()=false`); the `use-financial-only.ts` doc comment is wrong. No O1/O3 design may assume Sabor hides ICM nav.

## §9 — Probe-script inventory (all read-only, no existing file modified)

`web/scripts/ob257-p0-b-ob231-serving-probe.ts`, `ob257-p0-c-tenant-features.ts`, `ob257-p0-d-convergence-bindings.ts`, `ob257-p0-d-sabor-cd.ts`, `ob257-p0-d-sabor-types.ts`, `ob257-p0-d-sabor-types2.ts`, `ob257-p0-e-materialization-coverage.ts`, `ob257-p0-e-periods-probe.ts`, `ob257-p0-f-sabor-tenant.ts`, `ob257-p0-g-intelligence-artifacts.ts`, `ob257-p0-h-critic-gaps.ts`, `ob257-p0-h-critic-halt2-probe.ts` (one temp-0 LLM call, persist deliberately skipped), `ob257-p0-i-fine-nullability.ts`. Committed with this report for reproducibility.
