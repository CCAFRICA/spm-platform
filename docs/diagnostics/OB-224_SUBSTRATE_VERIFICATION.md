# OB-224 Substrate Verification & Code Inventory (§3)

**Date:** 2026-06-20
**Branch:** `ob-224-drill-through`
**Method:** `web/scripts/ob-224-substrate-check.ts` (service-role, read-only) + parallel codebase recon (5 agents).

---

## §3.1 Database substrate (live queries)

| Table | Exists | Rows | Populated tenants | Notes |
|---|---|---|---|---|
| `calculation_traces` | ✅ | 7,813 | **BCL 510, Almacenes Mirasol 7,303** (other 11 tenants 0) | Cols: `id, tenant_id, result_id, component_name, formula, inputs, output, steps, created_at, committed_data_id, transaction_ref`. OB-217 per-transaction substrate. |
| `entity_period_outcomes` | ✅ | 745 | Meridian 201, BCL 510, MIR 34 | Cols incl. `total_payout, rule_set_breakdown, component_breakdown, lowest_lifecycle_state, attainment_summary`. Materialized rollups. |
| `profile_scope` | ✅ | **0 (empty)** | — | Schema present, unpopulated. Read-side returns empty ⇒ "all" (admin default). |
| `entity_relationships` | ✅ | 83 | **Sabor Grupo Gastronomico only** | Cols: `source_entity_id, target_entity_id, relationship_type, source, confidence, evidence, effective_from/to`. |
| `committed_data` | ✅ | 120,401 | MIR 75,227; Sabor 43,875; BCL 595; Tomi#1 400; Meridian 304 | `data_type, row_data (orig+semantic), source_date`. `calculation_traces.committed_data_id` joins here. |
| `calculation_results` | ✅ | 941 | BCL 510, Meridian 201, MIR 170, Sabor 60 | `components` = **JSON array** (see below). `batch_id` → `calculation_batches`. |
| `disputes` | ✅ | **0 (empty)** | — | Schema applied since OB-213 HALT-SCHEMA; never populated. |

**HALT-2 check — RESOLVED (not a halt):** `calculation_results.components` is a JSON **array** of component objects. Each element keys (BCL sample, len 4): `payout` (number), `details` (object), `componentId` (string, e.g. `C1-ejecutivo`), `componentName` (string, e.g. `Colocación de Crédito — Ejecutivo`), `componentType` (string, e.g. `prime_dag`). Safe to iterate as `components[]`.

**`calculation_traces` mapping:** `formula`→`formula` (string, e.g. `18 × Cantidad_Productos_Cruzados`); `inputs`→`inputs` (jsonb metric map); `output`→`output` (jsonb `{rate, pattern, metricValue, contribution, entityRawOutcome, entityStoredPayout}`); `steps`→`steps` (jsonb array, `[]` in sample); component identity stored as `component_name` (NOT id); links to source via `committed_data_id` + `transaction_ref` (e.g. `BCL-5083`). No `entity_id`/`period_id` on the trace — resolve via `result_id` → `calculation_results`.

**Test tenants:** BCL `b1c2d3e4-aaaa-bbbb-cccc-111111111111` (510 traces, cleanest); Almacenes Mirasol/MIR `972c8eb0-e3ae-4e4c-ad30-8b34804c893a` (7,303 traces); Meridian `5035b1e8-0754-4527-b7ec-9f93f85e4c79` (has outcomes, **no traces** → exercises ComponentCards fallback). **Pipeline Test Co does not exist** in the live tenants table (memory stale).

**Resolution-rule outcomes (no halt):**
- `calculation_traces` present for 2 tenants → ComponentCards renders trace detail for BCL/MIR; **fallback** to `calculation_results.components` for Meridian/others. → R-1 partial.
- `entity_period_outcomes` present → `getEntityResults` reads materialized path; fallback to `calculation_results` grouped by entity for tenants without outcomes.
- `profile_scope` empty → `resolveEntityScope` returns empty arrays = "all". Build §3.3 read-side util + admin link route. → R-6.
- `entity_relationships` Sabor-only → `/team` renders scoped list for Sabor, "no hierarchy configured" elsewhere. → R-3.

---

## §3.2 Live route / nav inventory

**Single source of truth:** `web/src/lib/navigation/workspace-config.ts` (`WORKSPACES`), consumed identically by `ChromeSidebar` (Dark/Bliss) and `VialuceSidebar` (theme=vialuce). `auth-shell.tsx` renders ONLY `ChromeSidebar`. `MissionControlRail` = legacy, not mounted. "In nav" = path appears in a `WORKSPACES` section route, reachable by the persona's capability.

| Logical (OB) | LIVE file (in nav) | Current state | OB treatment |
|---|---|---|---|
| stream | `app/stream/page.tsx` | data, **drill handlers are dead-ends** (entityId discarded) | **Add** inline DrillThroughPanel below sections |
| statements | `app/perform/statements/page.tsx` | has-data **+ existing source-tx drill** (premise stale) | **Extend**: forensic ComponentCards + DisputeInline |
| transactions | `app/data/transactions/page.tsx` | **MOCK data, toast stubs** (AP-11 violation) | **Replace** with real `getSourceTransactions` + drill |
| team | `app/insights/my-team/page.tsx` (`/perform/team` re-exports it) | industry-conditional; empty for non-hospitality | **Add** scoped EntityResultsList in the empty branch |
| approvals | `app/approvals/page.tsx` (`/govern/approvals` re-exports it) | reads **dead in-memory** `approval-routing/approval-service` | **Add** real batch read + DrillThroughPanel |
| personnel | **not in nav** — live people surface is `app/configure/people/page.tsx` (Entities) | TBD (verify in Phase 4) | **Retarget** to `/configure/people` |
| operate/calculate | `app/operate/calculate/page.tsx` | grand total only (Finding #8) | **Add** DrillThroughPanel below total |
| operate/reconciliation | `app/operate/reconciliation/page.tsx` (~1600 lines) | mature, per-entity+component drill, AI diagnose | **Extend** entity drill with comparison ComponentCards |

Legacy/orphan duplicates confirmed not-in-nav: `/performance/approvals*`, `/govern/calculation-approvals`, `/investigate/reconciliation`, `/admin/launch/*`, `/configuration/personnel` (redirect), `/my-compensation`, `/perform/compensation`.

---

## §3A Backend reuse inventory (AP-17)

| Function | File | Maps to | Reuse decision |
|---|---|---|---|
| `getCommissionStatement(sb, tenantId, entityId, periodId)` → `CommissionStatement{entity,period,totalPayout,components[],hasTraces,traceCount}` | `lib/compensation/commission-statement.ts` | getComponentTraces / getSourceTransactions | **REUSE (primary).** OB-219 assembler joins `components`→`traces`→`committed_data`. Exports `groupTracesByComponent`, `buildStatementComponents`, `isClawbackTrace`. **Do not duplicate.** |
| `getEntityResults(tenantId, entityId, {periodId})` | `lib/supabase/calculation-service.ts` | getEntityResults | REUSE per-entity; wrap with scope. |
| `getEntityPeriodOutcomes(tenantId, periodId, {entityId})`, `getEntityOutcome`, `materializeEntityPeriodOutcomes` | `calculation-service.ts` | getEntityResults (grid) | **REUSE** — best scoped-grid source (`component_breakdown`). |
| `getCalculationTraces(tenantId, resultId)` | `calculation-service.ts` | getComponentTraces (resultId path) | REUSE. |
| `getEntity`, `listEntities`, `getEntityRelationships`, `traverseGraph` | `lib/supabase/entity-service.ts` | resolveEntityScope / labels | REUSE. |
| `materializeProfileScope` ×2 (divergent) | `lib/entities/profile-scope.ts` (single-hop), `lib/supabase/entity-service.ts` (multi-hop) | profile_scope writers | **Do NOT add a 3rd.** resolveEntityScope is read-side only. (AP-17 debt flagged.) |
| `loadAdjustmentsPageData(tenantId)` | `lib/data/page-loaders.ts` | disputes reader | REUSE shape; build matching inserter. |
| `getEntityCommittedData` (AI tool, internal, cap 25) | `lib/ai/agent/tools/entity-data-tools.ts` | getSourceTransactions | Mirror SELECT as new exported lib fn. |
| `useAuth().user.{id,tenantId}`, `useTenant().currentTenant.id` | `contexts/auth-context.tsx`, `contexts/tenant-context.tsx` | all (client ids) | profileId = `user.id`; tenantId = `currentTenant.id`. |

**Build-new (gaps):** `resolveEntityScope` (read-side), `getSourceTransactions` (exported reader), `submitDispute` (inserter). Everything else reuses existing functions.

## §3B Design system & inline-drill pattern (reuse)

- `useIsVialuce()` from `@/hooks/use-is-vialuce` — two-branch: Vialuce design-spec markup vs byte-identical legacy dark/bliss fallthrough.
- Tokens scoped to `html[data-theme="vialuce"]` in `globals.css`; `.page/.phead/.card/.card.flush/.tbl/.kpi/.pill/.btn-pri` classes; DM Sans / DM Mono (all numbers).
- Primitives: `IntelligenceCard` (`@/components/intelligence/IntelligenceCard`), `StatusPill`/`AnimatedNumber` (`@/components/design-system`), `cn` (`@/lib/utils`).
- `useCurrency()` from `@/contexts/tenant-context` → `{ format, currency, symbol, locale }`. `useLocale()` from `@/contexts/locale-context` → `{ t, formatDate, formatNumber }`.
- **Inline drill pattern to model on:** `useDrillThrough<T>(resetKey)` (`@/hooks/useDrillThrough`) → `{target, open, close, isOpen}` (one-panel-at-a-time by construction); `AnomalyDrillThrough` (`@/components/results/AnomalyDrillThrough`) canonical inline panel; reference usage `app/operate/results/page.tsx:121,128,786`.

---

*OB-224 · Phase 1 complete · no HALT · proceeding to Phase 2 (data layer).*
