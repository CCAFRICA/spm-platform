# OB-152 Phase 0: Consumer Map + LAB Baseline

## CONSUMER MAP (committed_data × period_id)

### ENGINE consumers (queries committed_data with period_id for calculation):

1. `web/src/app/api/calculation/run/route.ts:219` — ENGINE — Main data fetch (paginated, .eq('period_id', periodId))
2. `web/src/app/api/calculation/run/route.ts:310` — ENGINE — Prior period delta fetch (.eq('period_id', priorPeriodId))
3. `web/src/app/api/calculation/run/route.ts:536` — ENGINE — AI context batch fetch (.eq('period_id', periodId))
4. `web/src/lib/calculation/run-calculation.ts:873` — ENGINE — Main data fetch (paginated, .eq('period_id', periodId))
5. `web/src/lib/calculation/run-calculation.ts:936` — ENGINE — Prior period delta fetch (.eq('period_id', priorPeriodId))
6. `web/src/lib/calculation/run-calculation.ts:1087` — ENGINE — AI context batch fetch (.eq('period_id', periodId))

### DASHBOARD consumers (read committed_data with period_id for display):

7. `web/src/lib/data/page-loaders.ts:401` — DASHBOARD — Period data count check
8. `web/src/app/transactions/page.tsx:133-139` — DASHBOARD — Transaction list display

### IMPORT consumers (write period_id to committed_data):

9. `web/src/app/api/import/sci/execute/route.ts:1358` — IMPORT — postCommitConstruction binds period_id
10. `web/src/app/api/import/sci/execute/route.ts:348` — IMPORT — detectAndCreatePeriods (creates periods + assigns)

### DATA SERVICE consumers:

11. `web/src/lib/supabase/data-service.ts:189` — DATA SERVICE — getCommittedData with optional periodId filter
12. `web/src/lib/supabase/data-service.ts:227` — DATA SERVICE — getCommittedDataByPeriod
13. `web/src/lib/supabase/data-service.ts:495,503` — DATA SERVICE — Additional committed_data queries

### OTHER consumers (not committed_data table):

- route.ts:962, route.ts:1114, run-calculation.ts:1280 — These are on calculation_results, NOT committed_data

## BLAST RADIUS

- **6 ENGINE** consumers of committed_data × period_id (3 in route.ts, 3 in run-calculation.ts)
- **2 DASHBOARD** consumers
- **2 IMPORT** consumers (SCI execute)
- **3 DATA SERVICE** consumers

**Phase 2 targets: ONLY the 6 ENGINE consumers. Dashboard/Import/Data Service remain unchanged.**

---

## ENGINE FUNCTION: Primary data fetch

### File: `web/src/app/api/calculation/run/route.ts`, lines 209-246

```typescript
// ── 4. Fetch committed data (OB-75: paginated, no 1000-row cap) ──
const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];
let dataPage = 0;
while (true) {
  const from = dataPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: page } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .range(from, to);

  if (!page || page.length === 0) break;
  committedData.push(...page);
  if (page.length < PAGE_SIZE) break;
  dataPage++;
}

// OB-128: Also fetch period-agnostic data (period_id IS NULL)
let nullPeriodPage = 0;
while (true) {
  const from = nullPeriodPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: page } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .is('period_id', null)
    .range(from, to);

  if (!page || page.length === 0) break;
  committedData.push(...page);
  if (page.length < PAGE_SIZE) break;
  nullPeriodPage++;
}
```

### File: `web/src/lib/calculation/run-calculation.ts`, lines 863-880

```typescript
// ── 4. Fetch committed data (OB-75: paginated, no 1000-row cap) ──
const committedData: Array<{ entity_id: string | null; data_type: string; row_data: Json }> = [];
let dataPage = 0;
while (true) {
  const from = dataPage * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: page } = await supabase
    .from('committed_data')
    .select('entity_id, data_type, row_data')
    .eq('tenant_id', tenantId)
    .eq('period_id', periodId)
    .range(from, to);

  if (!page || page.length === 0) break;
  committedData.push(...page);
  if (page.length < PAGE_SIZE) break;
  dataPage++;
}
```

---

## SCI PERIOD CREATION: `web/src/app/api/import/sci/execute/route.ts`, lines 916-1011

`detectAndCreatePeriods()` — extracts year-month from date fields via semantic role bindings, creates periods table records, then `postCommitConstruction()` (line 1307-1370) binds period_id on committed_data rows.

Called from:
- Target pipeline: line 348
- Transaction pipeline: line 543

---

## LAB BASELINE

- **268 results, $8,498,311.77** — PASS
- Committed data: **1625 total**, **1563 with period_id** (62 rows with NULL period_id)
- Tenant: `latin-american-bank` (a630404c-0777-4f6d-b760-b8a190ecd63c)

---

## KEY OBSERVATIONS

1. **TWO parallel engine files**: `route.ts` (API endpoint) and `run-calculation.ts` (library). Both have identical data-fetch patterns. Both must get hybrid path.
2. **route.ts has OB-128 null-period fetch** that run-calculation.ts lacks — route.ts already handles period-agnostic data.
3. **Prior period delta fetch** exists in both files — also needs hybrid path.
4. **AI context fetch** uses period_id to find import_batch_id — this is a metadata lookup, not data for calculation. Can stay on period_id.
5. **SCI execute creates periods AND binds period_id** — both must be modified in Phase 3.
