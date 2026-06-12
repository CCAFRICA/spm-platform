/**
 * DIAG-063 / B3 — Payroll export headless invocation (READ-ONLY).
 *
 * Invokes the real export service function generatePayrollCSV()
 * (src/lib/calculation/calculation-lifecycle-service.ts:490) exactly as
 * src/app/admin/launch/calculate/page.tsx handleExportPayroll() does,
 * sourcing rows via service-role SELECTs only. No writes of any kind.
 *
 * Output discipline (channel separation):
 *  - tenant referenced by UUID only; tenant name is NEVER queried or printed
 *    (the function's tenantName metadata param is fed the tenant UUID).
 *  - First 5 CSV lines printed with ALL digits redacted to '#', except the
 *    entity UUID identifier in column 1 which is restored verbatim.
 */
import { createClient } from '@supabase/supabase-js';
import { generatePayrollCSV } from '../../src/lib/calculation/calculation-lifecycle-service';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Discover the most recent calculation batch that has results
  // (structural query, registry-free; tenant referenced by UUID only).
  const { data: batches, error: batchErr } = await supabase
    .from('calculation_batches')
    .select('id, tenant_id, period_id, lifecycle_state, entity_count, created_at')
    .gt('entity_count', 0)
    .order('created_at', { ascending: false })
    .limit(10);
  if (batchErr) throw batchErr;
  if (!batches || batches.length === 0) {
    console.log('NO_BATCH_FOUND in calculation_batches with entity_count > 0');
    return;
  }
  let batch: (typeof batches)[number] | null = null;
  for (const b of batches) {
    const { count } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', b.id);
    if ((count ?? 0) > 0) {
      batch = b;
      break;
    }
  }
  if (!batch) {
    console.log('NO_BATCH_WITH_RESULTS among 10 most recent batches');
    return;
  }
  const TENANT_ID = batch.tenant_id as string;
  console.log('tenant_id:', TENANT_ID);
  console.log('batch_id:', batch.id);
  console.log('period_id:', batch.period_id);
  console.log('lifecycle_state:', batch.lifecycle_state);
  console.log('entity_count:', batch.entity_count);
  console.log('created_at:', batch.created_at);

  // Results for that batch — same source the page export reads (batchResults).
  const { data: results, error: resErr } = await supabase
    .from('calculation_results')
    .select('entity_id, total_payout, components, metadata')
    .eq('tenant_id', TENANT_ID)
    .eq('batch_id', batch.id)
    .limit(6);
  if (resErr) throw resErr;
  console.log('results_fetched:', results?.length ?? 0);

  // Identical mapping to handleExportPayroll() in admin/launch/calculate/page.tsx.
  const resultsForExport = (results ?? []).map((r) => {
    const comps = Array.isArray(r.components) ? r.components : [];
    const meta = r.metadata as Record<string, unknown> | null;
    return {
      entityId: r.entity_id as string,
      entityName: (meta?.entityName as string) || (r.entity_id as string),
      totalPayout: (r.total_payout as number) || 0,
      components: comps.map((c: unknown) => {
        const comp = c as Record<string, unknown>;
        return {
          componentName: String(comp.componentName || comp.component_name || ''),
          outputValue: Number(comp.outputValue || comp.output_value || 0),
        };
      }),
    };
  });

  const csvContent = generatePayrollCSV(resultsForExport, {
    tenantName: TENANT_ID, // UUID, never the tenant name (anonymization rule)
    periodId: batch.period_id as string,
    batchState: batch.lifecycle_state as string,
    currency: 'USD',
    locale: 'en-US',
  });

  const lines = csvContent.split('\n');
  console.log('csv_total_lines:', lines.length);
  console.log('--- first 5 lines (all digits redacted to #; entity UUID in col 1 restored) ---');
  const idByRedacted = new Map(
    resultsForExport.map((r) => [r.entityId.replace(/\d/g, '#'), r.entityId])
  );
  lines.slice(0, 5).forEach((line, i) => {
    if (i === 0) {
      console.log(line); // header: column names only, no values
      return;
    }
    let redacted = line.replace(/\d/g, '#');
    const firstCell = redacted.split(',')[0];
    const realId = idByRedacted.get(firstCell);
    if (realId) redacted = realId + redacted.slice(firstCell.length);
    console.log(redacted);
  });
}

main().catch((e) => {
  console.error('SCRIPT_ERROR:', e?.message ?? e);
  process.exit(1);
});
