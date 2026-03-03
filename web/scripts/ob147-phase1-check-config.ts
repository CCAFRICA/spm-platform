/**
 * OB-147 Phase 1: Check population_config and AI context for roster identification
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const tenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  const { data: rs } = await supabase
    .from('rule_sets')
    .select('population_config, metadata')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  console.log('population_config:', JSON.stringify(rs?.population_config, null, 2));
  console.log('metadata:', JSON.stringify(rs?.metadata, null, 2));

  // Check AI context from import_batches
  const { data: batches } = await supabase
    .from('import_batches')
    .select('id, metadata')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(5);

  for (const b of (batches ?? [])) {
    const m = b.metadata as Record<string, unknown> | null;
    const ai = m?.ai_context as { sheets?: unknown[] } | undefined;
    if (ai?.sheets) {
      console.log('\nAI context sheets from batch', b.id, ':', JSON.stringify(ai.sheets, null, 2));
    } else {
      console.log('\nBatch', b.id, ': no AI context');
    }
  }

  // Check what data_type values are in the data for Enero 2024 where entity_id is NOT NULL
  // and check the entity count per sheet to identify the roster heuristically
  const { data: enero } = await supabase
    .from('periods')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canonical_key', '2024-01')
    .single();

  if (enero) {
    console.log('\n--- Sheet heuristic analysis ---');
    const sheets = new Map<string, Set<string>>();
    const PAGE_SIZE = 1000;

    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const { data } = await supabase
        .from('committed_data')
        .select('entity_id, data_type')
        .eq('tenant_id', tenantId)
        .eq('period_id', enero.id)
        .not('entity_id', 'is', null)
        .range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        if (!row.entity_id || !row.data_type) continue;
        if (!sheets.has(row.data_type)) sheets.set(row.data_type, new Set());
        sheets.get(row.data_type)!.add(row.entity_id);
      }
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    for (const [sheetName, entitySet] of Array.from(sheets.entries()).sort((a, b) => a[1].size - b[1].size)) {
      // Count total rows for this sheet
      const { count } = await supabase
        .from('committed_data')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('period_id', enero.id)
        .eq('data_type', sheetName)
        .not('entity_id', 'is', null);

      const rowsPerEntity = count ? (count / entitySet.size).toFixed(1) : 'N/A';
      console.log(`  ${sheetName}:`);
      console.log(`    unique entities: ${entitySet.size}, total rows: ${count}, rows/entity: ${rowsPerEntity}`);
      if (count && entitySet.size > 0 && count / entitySet.size <= 1.5) {
        console.log(`    *** ROSTER CANDIDATE (1 row per entity) ***`);
      }
    }
  }
}

main().catch(console.error);
