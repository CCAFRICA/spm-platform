import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('=== OB-75 POST-IMPORT VERIFICATION ===\n');

  // 1. Import batches + AI context
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, file_name, status, row_count, metadata')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false });

  console.log(`Import batches: ${batches?.length ?? 0}`);
  for (const b of (batches ?? [])) {
    const meta = b.metadata as Record<string, unknown> | null;
    const aiCtx = meta?.ai_context as { sheets?: unknown[] } | undefined;
    console.log(`  ${b.id}: ${b.file_name} | status=${b.status} | rows=${b.row_count} | AI context: ${aiCtx?.sheets ? aiCtx.sheets.length + ' sheets' : 'NONE'}`);
    if (aiCtx?.sheets) {
      for (const s of aiCtx.sheets as Array<{ sheetName: string; matchedComponent: string | null }>) {
        console.log(`    Sheet: "${s.sheetName}" → component: "${s.matchedComponent}"`);
      }
    }
  }

  // 2. Entities
  const { count: entityCount } = await supabase
    .from('entities')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nEntities: ${entityCount}`);

  // 3. Periods
  const { data: periods } = await supabase
    .from('periods')
    .select('id, canonical_key, start_date, end_date')
    .eq('tenant_id', TENANT_ID)
    .order('canonical_key');
  console.log(`\nPeriods: ${periods?.length ?? 0}`);
  for (const p of (periods ?? [])) {
    console.log(`  ${p.canonical_key}: ${p.start_date} to ${p.end_date} (id=${p.id})`);
  }

  // 4. Committed data
  const { count: dataCount } = await supabase
    .from('committed_data')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nCommitted data rows: ${dataCount}`);

  // Per-period breakdown
  if (periods && periods.length > 0) {
    for (const p of periods) {
      const { count: periodDataCount } = await supabase
        .from('committed_data')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID)
        .eq('period_id', p.id);
      console.log(`  ${p.canonical_key}: ${periodDataCount} rows`);
    }
  }

  // 5. Data types (sheets)
  const { data: dataTypes } = await supabase
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', TENANT_ID)
    .limit(1000);

  const typeSet = new Set((dataTypes ?? []).map(d => d.data_type));
  console.log(`\nData types (sheets): ${Array.from(typeSet).join(', ')}`);

  // 6. Rule sets
  const { data: ruleSets } = await supabase
    .from('rule_sets')
    .select('id, name')
    .eq('tenant_id', TENANT_ID);
  console.log(`\nRule sets: ${ruleSets?.length ?? 0}`);
  for (const rs of (ruleSets ?? [])) {
    console.log(`  ${rs.id}: ${rs.name}`);
  }

  // 7. Assignments
  const { count: assignCount } = await supabase
    .from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID);
  console.log(`\nRule set assignments: ${assignCount}`);

  // Find January 2024 period
  const jan2024 = periods?.find(p => p.canonical_key === '2024-01');
  if (jan2024) {
    console.log(`\n=== JANUARY 2024 READY FOR CALCULATION ===`);
    console.log(`Period ID: ${jan2024.id}`);
    console.log(`Rule Set ID: ${ruleSets?.[0]?.id ?? 'NONE'}`);
  }
}

run().catch(console.error);
