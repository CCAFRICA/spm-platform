/**
 * OB-90 Mission 4D: Fix optical_achievement_percentage for ALL employees
 *
 * Root cause: OB-88 enrichment used threshold `cumplimiento < 3` to decide
 * when to multiply by 100. Employees with >300% attainment (Cumplimiento >= 3)
 * were left with the raw ratio instead of percentage.
 *
 * Fix: Set optical_achievement_percentage = Cumplimiento * 100 for ALL rows.
 * The field name says "percentage" so it should always be in percentage form.
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== OB-90 Mission 4D: Fix optical_achievement_percentage ===\n');

  // Fetch ALL Base_Venta_Individual rows
  const allRows: Array<{
    id: string;
    entity_id: string | null;
    period_id: string | null;
    import_batch_id: string | null;
    data_type: string;
    row_data: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
  }> = [];
  let page = 0;
  while (true) {
    const { data } = await sb.from('committed_data')
      .select('id, entity_id, period_id, import_batch_id, data_type, row_data, metadata')
      .eq('tenant_id', TENANT_ID)
      .eq('period_id', PERIOD_ID)
      .eq('data_type', 'Base_Venta_Individual')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < 1000) break;
    page++;
  }
  console.log(`Base_Venta_Individual rows: ${allRows.length}`);

  // Fix optical_achievement_percentage for each row
  let fixedCount = 0;
  let alreadyCorrectCount = 0;
  const fixes: Array<{ empId: string; store: string; old: number; new: number; cumplimiento: number }> = [];

  for (const row of allRows) {
    const rd = row.row_data;
    const cumplimiento = typeof rd.Cumplimiento === 'number' ? rd.Cumplimiento : 0;
    const currentOAP = typeof rd.optical_achievement_percentage === 'number' ? rd.optical_achievement_percentage : 0;
    const correctOAP = cumplimiento * 100;

    if (Math.abs(currentOAP - correctOAP) < 0.001) {
      alreadyCorrectCount++;
      continue;
    }

    fixes.push({
      empId: String(rd.num_empleado || ''),
      store: String(rd.num_tienda || ''),
      old: currentOAP,
      new: correctOAP,
      cumplimiento,
    });

    rd.optical_achievement_percentage = correctOAP;
    // Also fix attainment to be consistent (decimal ratio)
    rd.attainment = cumplimiento;
    fixedCount++;
  }

  console.log(`Already correct: ${alreadyCorrectCount}`);
  console.log(`Fixed: ${fixedCount}`);

  if (fixes.length > 0) {
    console.log(`\nFixes applied:`);
    for (const f of fixes.slice(0, 20)) {
      console.log(`  Emp ${f.empId} Store ${f.store}: Cumpl=${f.cumplimiento} OAP ${f.old} → ${f.new}`);
    }
    if (fixes.length > 20) console.log(`  ... (${fixes.length - 20} more)`);
  }

  // Verify: check high-attainment employees are now correct
  const highAttainment = allRows.filter(r => {
    const c = typeof r.row_data.Cumplimiento === 'number' ? r.row_data.Cumplimiento : 0;
    return c >= 3;
  });
  console.log(`\nHigh attainment (>300%) employees: ${highAttainment.length}`);
  for (const r of highAttainment) {
    const rd = r.row_data;
    console.log(`  Emp ${rd.num_empleado}: Cumpl=${rd.Cumplimiento} OAP=${rd.optical_achievement_percentage}`);
  }

  // Update committed_data
  if (fixedCount === 0) {
    console.log('\nNo fixes needed!');
    return;
  }

  console.log('\nUpdating committed_data...');
  const ids = allRows.map(r => r.id);

  // Delete all
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await sb.from('committed_data').delete().in('id', ids.slice(i, i + 500));
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
  console.log(`  Deleted ${ids.length} rows`);

  // Re-insert
  const insertRows = allRows.map(r => ({
    tenant_id: TENANT_ID,
    entity_id: r.entity_id,
    period_id: r.period_id,
    import_batch_id: r.import_batch_id,
    data_type: r.data_type,
    row_data: r.row_data,
    metadata: r.metadata,
  }));

  for (let i = 0; i < insertRows.length; i += 500) {
    const { error } = await sb.from('committed_data').insert(insertRows.slice(i, i + 500));
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }
  console.log(`  Inserted ${insertRows.length} rows`);

  console.log('\n✓ Mission 4D complete: optical_achievement_percentage fixed for all rows');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
