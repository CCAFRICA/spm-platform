// HF-221 Phase 2.4 — Replicate HF-218 calc-time verification for the succeeding BCL period (Dec 2025).
// Same replication mechanics as failing script; single period.
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
  const BCL_RULE_SET = '6008fb2c-da17-46a3-ba1e-b0181ca530a1';
  const PERIOD = { label: 'Dec 2025', id: '860b4255-23a0-48ce-9ac9-f604ad3058e1', start: '2025-12-01', end: '2025-12-31' };

  const { data: entities } = await supabase
    .from('entities')
    .select('external_id')
    .eq('tenant_id', BCL_TENANT);
  const tenantEntityExternalIds = new Set<string>(
    (entities ?? []).map(e => e.external_id).filter((x): x is string => !!x),
  );

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

  console.log(`### PERIOD ${PERIOD.label} (id=${PERIOD.id})`);

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
        .gte('source_date', PERIOD.start)
        .lte('source_date', PERIOD.end)
        .range(from, to);
      if (!data || data.length === 0) break;
      allRows.push(...(data as typeof allRows));
      if (data.length < PAGE_SIZE) break;
      page++;
    }
  }
  const sourceDateRowCount = allRows.length;

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
        .eq('period_id', PERIOD.id)
        .range(from, to);
      if (!data || data.length === 0) break;
      allRows.push(...(data as typeof allRows));
      if (data.length < PAGE_SIZE) break;
      page++;
    }
  }
  const periodIdRowCount = allRows.length - sourceDateRowCount;

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
})();
