# OB-70 COMPLETION REPORT

## Title: Calculation Trigger + Entity Visibility + Platform Polish

## Summary

OB-70 addressed 6 missions spanning the calculation lifecycle, entity visibility,
navigation, dispute wiring, hardcoding cleanup, and empty state hardening.

---

## Phase 0: Diagnostic + Architecture Decision Record

### Proof Gate P0-1: Diagnostic committed
- `OB-70_DIAGNOSTIC.md` — 6-section root cause analysis
- Root cause: "Run Preview" calls `transitionLifecycle()` which needs an existing batch, but none exists

### Proof Gate P0-2: ADR committed
- `OB-70_ARCHITECTURE_DECISION.md` — 3 decisions with Option A/B analysis
- D1: Wire operate page to POST /api/calculation/run
- D2: Replace canvas with Supabase entity table
- D3: Extend entity query with external_id

---

## Mission 1: Wire Calculation Trigger (P0 Blocker)

### Proof Gate M1-1: "Run Preview" fires POST /api/calculation/run
- `web/src/app/operate/page.tsx` — `handleAdvance()` intercepts DRAFT→PREVIEW transition
- POSTs to `/api/calculation/run` with `{ tenantId, periodId, ruleSetId }`
- Loading spinner shown during calculation
- Error banner shown if calculation fails
- On success: `reloadData()` refreshes all page state

### Proof Gate M1-2: ruleSetId passed from page-loaders
- `web/src/lib/data/page-loaders.ts` — Added `ruleSetId` to `OperatePageData` interface
- `planRes.data?.id ?? null` extracted from rule_sets query

### Proof Gate M1-3: Build clean after Mission 1
- ✅ `npm run build` passed with zero errors

---

## Mission 2: Fix Personnel Page + Entity Roster

### Proof Gate M2-1: ReactFlow/Canvas dependency removed
- `web/src/app/configure/people/page.tsx` — Complete rewrite
- Removed: `ReactFlowProvider`, `OrganizationalCanvas`, `@xyflow/react`
- Removed: redirect button to `/workforce/personnel`

### Proof Gate M2-2: Supabase entity table with 5 columns
- External ID (`entities.external_id`) — monospace font
- Name (`entities.display_name`) — bold
- Type (`entities.entity_type`) — color-coded badge
- Status (`entities.status`) — color-coded badge
- Created (`entities.created_at`) — formatted date

### Proof Gate M2-3: Server-side pagination
- `.range(page * 25, (page + 1) * 25 - 1)` with `{ count: 'exact' }`
- Previous/Next buttons with page counter
- Total count displayed: "24,833 entities registered"

### Proof Gate M2-4: Search by name or external ID
- `.or('display_name.ilike.%search%,external_id.ilike.%search%')`
- 400ms debounce + Enter key support
- Type and status filter dropdowns

### Proof Gate M2-5: Try/catch error handling
- Fetch wrapped in try/catch/finally
- Console error logging on failure
- Loading state always cleared in finally block

---

## Mission 3: Entity Names in Results

### Proof Gate M3-1: external_id included in entity query
- `web/src/lib/data/page-loaders.ts` line 165: `.select('id, display_name, external_id')`

### Proof Gate M3-2: Display format "Name (ExternalID)"
- `entityNames` Map construction: `e.external_id ? \`${e.display_name} (${e.external_id})\` : e.display_name`
- Used in operate cockpit for top/bottom entity rankings

---

## Mission 4: Sidebar + Disputes + Page Status

### Proof Gate M4-1: /configure/users added to sidebar
- `web/src/components/navigation/Sidebar.tsx` — Configuration children
- Entry: `{ name: "Users", href: "/configure/users", module: "configuration" }`

### Proof Gate M4-2: Personnel link updated to real page
- Changed from `/configuration/personnel` (redirect stub) to `/configure/people` (Supabase entity table)

### Proof Gate M4-3: Disputes page wired to GET /api/disputes
- `web/src/app/transactions/disputes/page.tsx` — Complete rewrite
- Fetches from `/api/disputes` (Supabase-backed)
- Real DB schema: id, category, status, description, amount_disputed, created_at
- Status values: open, investigating, resolved, rejected, escalated
- Category labels: bilingual (en/es)
- Empty state: context-aware per filter tab

### Proof Gate M4-4: Dispute analytics wired to real data
- `web/src/app/insights/disputes/page.tsx` — Complete rewrite
- Removed demo chart components (DisputeFunnelChart, ResolutionOutcomesChart, etc.)
- Computes stats from real dispute data: total, open, resolved, resolution rate
- Category breakdown with horizontal bar chart computed from actual data
- Amount summary cards shown only when data exists

### Proof Gate M4-5: Page status updated
- `web/src/lib/navigation/page-status.ts`:
  - `/configure/people` → 'active'
  - `/transactions/disputes` → 'active'
  - `/insights/disputes` → 'active'
  - Removed `/transactions/disputes` from 'coming' section

---

## Mission 5: Hardcoding Cleanup

### Proof Gate M5-1: Spanish labels converted to English
- `insights/performance/page.tsx` — 12 labels fixed
  - Ingresos Totales → Total Revenue
  - Ticket Promedio → Avg Ticket
  - Total Propinas → Total Tips
  - Impuestos → Taxes
  - Rendimiento por Región → Performance by Region
  - Ventas → Sales
  - Top 5 Franquicias → Top 5 Franchises
  - Franquicias que Necesitan Atención → Franchises Needing Attention
  - Desglose por Producto → Product Breakdown
  - Alimentos/Bebidas → Food/Beverages
  - Métodos de Pago/Efectivo/Tarjeta → Payment Methods/Cash/Card
  - cheques cancelados → cancelled checks

- `insights/compensation/page.tsx` — 10 labels fixed
  - Comisión → Commission
  - Ventas Totales del Período → Total Period Sales
  - cheques atendidos → checks served
  - Propinas → Tips
  - Progreso a Meta → Goal Progress
  - Meta del período → Period goal
  - Meta alcanzada! → Goal reached!
  - Compensación - Mi Franquicia → Compensation - My Franchise
  - Mi Posición → My Ranking
  - Ranking de Franquicias → Franchise Ranking
  - de N franquicias → of N franchises
  - Dic → Dec, Actual → Current

- `insights/my-team/page.tsx` — 8 labels fixed
  - Total Comisiones → Total Commission
  - Ventas Totales → Total Sales
  - Ticket Promedio → Avg Ticket
  - Total Propinas → Total Tips
  - Comparación contra ticket promedio objetivo → Comparison against target average ticket
  - Objetivo → Target
  - Ranking de Franquicias por Ventas → Franchise Ranking by Sales
  - Histórico de Ventas - Todas las Franquicias → Sales History - All Franchises
  - Vista de rendimiento regional (N franquicias, N meseros) → Regional performance view (N franchises, N servers)

### Proof Gate M5-2: Demo module files unchanged
- `lib/demo/frmx-data-generator.ts` — FRMX restaurant schema (intentional)
- `lib/demo/frmx-demo-provisioner.ts` — FRMX restaurant schema (intentional)

---

## Mission 6: Empty States + Integration CLT

### Proof Gate M6-1: Empty state audit (5 pages)
| Page | Loading | Empty State | Error Handling |
|------|---------|-------------|----------------|
| /operate | ✅ Spinner | ✅ Icon + CTA | ✅ try/catch + error banner |
| /configure/people | ✅ Text | ✅ Contextual | ✅ try/catch/finally |
| /transactions/disputes | ✅ Spinner | ✅ Context-aware | ✅ try/catch |
| /insights/disputes | ✅ Spinner | ✅ Partial | ✅ try/catch |
| /my-compensation | ✅ Spinner | ✅ Lifecycle-aware | ✅ try/catch |

### 9-Point CLT Checklist

1. **Build clean**: ✅ `npm run build` — zero errors, warnings only (pre-existing)
2. **No new .single() calls**: ✅ All new queries use `.maybeSingle()` or `.select()` (no `.single()`)
3. **No schema invention**: ✅ All columns verified against SCHEMA_REFERENCE.md
4. **Entity display**: ✅ `display_name (external_id)` format in operate cockpit
5. **Sidebar navigation**: ✅ Users + Personnel linked to real pages
6. **Dispute wiring**: ✅ Both pages fetch from GET /api/disputes
7. **Calculation trigger**: ✅ Run Preview → POST /api/calculation/run
8. **Empty states**: ✅ All 5 audited pages have loading + empty states
9. **English labels**: ✅ 30 Spanish labels converted to English across 3 files

---

## Files Modified

| File | Mission | Change |
|------|---------|--------|
| `web/src/app/operate/page.tsx` | M1 | Calculation trigger wiring |
| `web/src/lib/data/page-loaders.ts` | M1, M3 | ruleSetId + external_id |
| `web/src/app/configure/people/page.tsx` | M2, M6 | Complete rewrite: entity table |
| `web/src/components/navigation/Sidebar.tsx` | M4 | Users link + Personnel path fix |
| `web/src/app/transactions/disputes/page.tsx` | M4 | Complete rewrite: real API |
| `web/src/app/insights/disputes/page.tsx` | M4 | Complete rewrite: real stats |
| `web/src/lib/navigation/page-status.ts` | M4 | 3 pages → 'active' |
| `web/src/app/insights/performance/page.tsx` | M5 | 12 Spanish labels → English |
| `web/src/app/insights/compensation/page.tsx` | M5 | 10 Spanish labels → English |
| `web/src/app/insights/my-team/page.tsx` | M5 | 8 Spanish labels → English |

## Commits

| Hash | Description |
|------|-------------|
| 46dc496 | OB-70: Commit prompt for traceability |
| a2e113d | OB-70 Phase 0 + ADR: Diagnostic and architecture decisions |
| bef2975 | OB-70 Mission 1: Wire calculation trigger |
| db4db31 | OB-70 Missions 2-4: Personnel + entity names + sidebar + disputes |
| 00caf6d | OB-70 Mission 5: Hardcoding cleanup |
| (next)  | OB-70 Mission 6 + Phase Final: Completion report + empty state fix |
