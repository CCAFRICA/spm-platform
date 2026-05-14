// HF-221 Phase 2.3 — Replicate HF-218 calc-time verification against 5 failing BCL periods.
//
// The engine's at-calc-time verification at route.ts:1816-1847 reads:
//   const batchEntityMap = dataByBatch.get(eidBindingRaw.source_batch_id);
//   const distinctValues = batchEntityMap
//     ? new Set(Array.from(batchEntityMap.keys()).filter(k => k && k.length > 0))
//     : new Set<string>();
//
// dataByBatch is built (route.ts:717-766) from period-scoped committedData by indexing
// row_data[entityCol] per import_batch_id. We replicate the period-scoped fetch + dataByBatch
// construction + distinct-count + intersection_ratio. Per T2-E46 we report numbers only.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
  const BCL_RULE_SET = '6008fb2c-da17-46a3-ba1e-b0181ca530a1';

  // Failing periods (per directive 2.3)
  const PERIODS = [
    { label: 'Oct 2025', id: '97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22', start: '2025-10-01', end: '2025-10-31' },
    { label: 'Nov 2025', id: 'e845f8f9-feda-46cd-a90d-5736afd00a41', start: '2025-11-01', end: '2025-11-30' },
    { label: 'Jan 2026', id: '6e3f1b6a-716d-4bc3-930b-75935e41159d', start: '2026-01-01', end: '2026-01-31' },
    { label: 'Feb 2026', id: '25c9b256-539f-4379-bce0-27f5a5724425', start: '2026-02-01', end: '2026-02-28' },
    { label: 'Mar 2026', id: '22155f28-e804-4b1a-870f-7e7b5de2dbaf', start: '2026-03-01', end: '2026-03-31' },
  ];

  // Tenant entity external_ids (baseline for intersection)
  const { data: entities } = await supabase
    .from('entities')
    .select('external_id')
    .eq('tenant_id', BCL_TENANT);
  const tenantEntityExternalIds = new Set<string>(
    (entities ?? []).map(e => e.external_id).filter((x): x is string => !!x),
  );

  // Convergence bindings (source_batch_id + column per component)
  const { data: ruleSet } = await supabase
    .from('rule_sets')
    .select('input_bindings')
    .eq('id', BCL_RULE_SET)
    .maybeSingle();
  const ib = (ruleSet?.input_bindings ?? {}) as Record<string, unknown>;
  const cbAll = (ib.convergence_bindings ?? {}) as Record<string, Record<string, { source_batch_id?: string; column?: string }>>;

  console.log('=== Convergence bindings (entity_identifier per component) ===');
  for (const [compKey, compBind] of Object.entries(cbAll)) {
    const eid = compBind.entity_identifier;
    console.log(`  ${compKey}: column=${eid?.column ?? '<unset>'} source_batch_id=${eid?.source_batch_id ?? '<unset>'}`);
  }
  console.log(`Tenant entity external_id set size: ${tenantEntityExternalIds.size}`);
  console.log('');

  // For each failing period, replicate engine verification PER COMPONENT
  for (const period of PERIODS) {
    console.log(`### PERIOD ${period.label} (id=${period.id})`);

    // Period-scoped committedData fetch (mirrors route.ts:524-601 hybrid path)
    const allRows: Array<{ import_batch_id: string | null; row_data: Record<string, unknown> | null }> = [];

    // Path 1: source_date range
    {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('import_batch_id, row_data')
          .eq('tenant_id', BCL_TENANT)
          .not('source_date', 'is', null)
          .gte('source_date', period.start)
          .lte('source_date', period.end)
          .range(from, to);
        if (!data || data.length === 0) break;
        allRows.push(...(data as typeof allRows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const sourceDateRowCount = allRows.length;

    // Path 2 (only if source_date returned nothing): period_id fallback
    if (sourceDateRowCount === 0) {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('import_batch_id, row_data')
          .eq('tenant_id', BCL_TENANT)
          .eq('period_id', period.id)
          .range(from, to);
        if (!data || data.length === 0) break;
        allRows.push(...(data as typeof allRows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const periodIdRowCount = allRows.length - sourceDateRowCount;

    // Path 3: period-agnostic rows (period_id IS NULL AND source_date IS NULL)
    {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('import_batch_id, row_data')
          .eq('tenant_id', BCL_TENANT)
          .is('period_id', null)
          .is('source_date', null)
          .range(from, to);
        if (!data || data.length === 0) break;
        allRows.push(...(data as typeof allRows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const totalRowsFetched = allRows.length;

    console.log(`  committedData fetch: source_date=${sourceDateRowCount} period_id_fallback=${periodIdRowCount} period_agnostic=${totalRowsFetched - sourceDateRowCount - periodIdRowCount} total=${totalRowsFetched}`);

    // Build dataByBatch (route.ts:717-766 replica)
    // Collect all known entity columns across bindings
    const entityColsByBatch = new Map<string, string>();
    for (const compBind of Object.values(cbAll)) {
      const eid = compBind.entity_identifier;
      if (eid?.source_batch_id && eid?.column) {
        entityColsByBatch.set(eid.source_batch_id, eid.column);
      }
    }
    const knownEntityCols = Array.from(new Set(Array.from(entityColsByBatch.values())));
    const dataByBatch = new Map<string, Map<string, Array<Record<string, unknown>>>>();
    for (const row of allRows) {
      const batchId = row.import_batch_id;
      if (!batchId) continue;
      let entityCol = entityColsByBatch.get(batchId);
      if (!entityCol && knownEntityCols.length > 0) entityCol = knownEntityCols[0];
      if (!entityCol) continue;
      const rd = (row.row_data && typeof row.row_data === 'object' && !Array.isArray(row.row_data))
        ? row.row_data as Record<string, unknown> : {};
      const entityKey = String(rd[entityCol] ?? '').trim();
      if (!entityKey) continue;
      if (!dataByBatch.has(batchId)) dataByBatch.set(batchId, new Map());
      const entityMap = dataByBatch.get(batchId)!;
      if (!entityMap.has(entityKey)) entityMap.set(entityKey, []);
      entityMap.get(entityKey)!.push(rd);
    }
    console.log(`  dataByBatch: ${dataByBatch.size} batches indexed`);
    console.log(`  dataByBatch batch IDs present: ${Array.from(dataByBatch.keys()).join(', ')}`);
    console.log('');

    // Per-component verification replica (route.ts:1816-1846)
    for (const [compKey, compBind] of Object.entries(cbAll)) {
      const eid = compBind.entity_identifier;
      const eidColumn = eid?.column;
      const sourceBatchId = eid?.source_batch_id;
      if (!eidColumn || !sourceBatchId) {
        console.log(`  ${compKey}: SKIPPED (no entity_identifier binding)`);
        continue;
      }
      const batchEntityMap = dataByBatch.get(sourceBatchId);
      const distinctValues = batchEntityMap
        ? new Set(Array.from(batchEntityMap.keys()).filter(k => k && k.length > 0))
        : new Set<string>();
      let totalBatchRows = 0;
      if (batchEntityMap) {
        for (const arr of Array.from(batchEntityMap.values())) totalBatchRows += arr.length;
      }
      let intersectionCount = 0;
      for (const v of Array.from(distinctValues)) {
        if (tenantEntityExternalIds.has(v)) intersectionCount++;
      }
      const cardinalityRatio = totalBatchRows > 0 ? distinctValues.size / totalBatchRows : 0;
      const intersectionRatio = distinctValues.size > 0 && tenantEntityExternalIds.size > 0
        ? intersectionCount / distinctValues.size : 0;
      const proposedConf = cardinalityRatio * intersectionRatio;
      console.log(`  ${compKey}:`);
      console.log(`    eidColumn=${eidColumn} source_batch_id=${sourceBatchId}`);
      console.log(`    batchEntityMap_present=${!!batchEntityMap}`);
      console.log(`    distinct=${distinctValues.size} totalBatchRows=${totalBatchRows}`);
      console.log(`    intersection_count=${intersectionCount} (vs ${tenantEntityExternalIds.size} tenant entities)`);
      console.log(`    cardinality_ratio=${cardinalityRatio.toFixed(4)} intersection_ratio=${intersectionRatio.toFixed(4)} score=${proposedConf.toFixed(4)}`);
      console.log(`    bindingVerified=${proposedConf > 0}`);
    }
    console.log('---');
  }
})();
