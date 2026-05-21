// HF-221 Phase 2.5 — Direct committed_data counts per period via service-role + TypeScript aggregation.
//
// Note: BCL stores rows with period_id IS NULL and source_date IN range (OB-152 hybrid).
// Mirrors the engine fetch path (route.ts:524-601): source_date range first; period_id
// fallback if zero rows; plus period-agnostic (period_id IS NULL AND source_date IS NULL).
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
  const PERIODS = [
    { label: 'Oct 2025', id: '97f3fdd8-1a6e-4693-ae32-c3a8a4d1bc22', start: '2025-10-01', end: '2025-10-31' },
    { label: 'Nov 2025', id: 'e845f8f9-feda-46cd-a90d-5736afd00a41', start: '2025-11-01', end: '2025-11-30' },
    { label: 'Dec 2025', id: '860b4255-23a0-48ce-9ac9-f604ad3058e1', start: '2025-12-01', end: '2025-12-31' },
    { label: 'Jan 2026', id: '6e3f1b6a-716d-4bc3-930b-75935e41159d', start: '2026-01-01', end: '2026-01-31' },
    { label: 'Feb 2026', id: '25c9b256-539f-4379-bce0-27f5a5724425', start: '2026-02-01', end: '2026-02-28' },
    { label: 'Mar 2026', id: '22155f28-e804-4b1a-870f-7e7b5de2dbaf', start: '2026-03-01', end: '2026-03-31' },
  ];

  for (const period of PERIODS) {
    // Mirror engine hybrid fetch
    const rows: Array<{ row_data: Record<string, unknown> | null; entity_id: string | null; source_date: string | null; data_type: string | null; import_batch_id: string | null; period_id: string | null }> = [];

    // Path 1: source_date in range
    {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('row_data, entity_id, source_date, data_type, import_batch_id, period_id')
          .eq('tenant_id', BCL_TENANT)
          .not('source_date', 'is', null)
          .gte('source_date', period.start)
          .lte('source_date', period.end)
          .range(from, to);
        if (!data || data.length === 0) break;
        rows.push(...(data as typeof rows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const sourceDateCount = rows.length;

    // Path 2: period_id direct (only if source_date returned 0)
    if (sourceDateCount === 0) {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('row_data, entity_id, source_date, data_type, import_batch_id, period_id')
          .eq('tenant_id', BCL_TENANT)
          .eq('period_id', period.id)
          .range(from, to);
        if (!data || data.length === 0) break;
        rows.push(...(data as typeof rows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const periodIdCount = rows.length - sourceDateCount;

    // Path 3: period-agnostic
    {
      let page = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data } = await supabase
          .from('committed_data')
          .select('row_data, entity_id, source_date, data_type, import_batch_id, period_id')
          .eq('tenant_id', BCL_TENANT)
          .is('period_id', null)
          .is('source_date', null)
          .range(from, to);
        if (!data || data.length === 0) break;
        rows.push(...(data as typeof rows));
        if (data.length < PAGE_SIZE) break;
        page++;
      }
    }
    const periodAgnosticCount = rows.length - sourceDateCount - periodIdCount;

    const idEmpleadoValues = new Set<string>();
    let rowsWithIdKey = 0;
    const dataTypes = new Set<string>();
    const sourceDates = new Set<string>();
    const entityIds = new Set<string>();
    const importBatchIds = new Set<string>();

    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown> | null;
      if (rd && 'ID_Empleado' in rd) {
        rowsWithIdKey++;
        const v = rd['ID_Empleado'];
        if (v !== null && v !== undefined) {
          idEmpleadoValues.add(String(v));
        }
      }
      if (row.entity_id) entityIds.add(row.entity_id);
      if (row.data_type) dataTypes.add(row.data_type);
      if (row.source_date) sourceDates.add(String(row.source_date));
      if (row.import_batch_id) importBatchIds.add(row.import_batch_id);
    }

    console.log(`PERIOD ${period.label} (period_id=${period.id}):`);
    console.log(`  fetch_paths: source_date=${sourceDateCount} period_id=${periodIdCount} period_agnostic=${periodAgnosticCount} total=${rows.length}`);
    console.log(`  distinct_id_empleado_jsonb_text: ${idEmpleadoValues.size}`);
    console.log(`  distinct_entity_id_fk: ${entityIds.size}`);
    console.log(`  rows_with_id_empleado_key: ${rowsWithIdKey}`);
    console.log(`  distinct_import_batch_ids: ${Array.from(importBatchIds).join(', ')}`);
    console.log(`  distinct_source_dates: ${Array.from(sourceDates).sort().join(', ')}`);
    console.log(`  distinct_data_types: ${Array.from(dataTypes).sort().join(', ')}`);
    console.log('---');
  }
})();
