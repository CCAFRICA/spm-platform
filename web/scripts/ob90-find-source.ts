/**
 * OB-90: Find the original source of store size data
 * Check import_batches, file references, and any unmapped fields
 */
import { createClient } from '@supabase/supabase-js';

const TENANT_ID = 'dfc1041e-7c39-4657-81e5-40b1cea5680c';
const PERIOD_ID = '30dbb4e9-d2d0-4f81-9b50-a6b9e44ba20c';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Check import_batches
  console.log('=== Import Batches ===');
  const { data: batches } = await sb.from('import_batches')
    .select('id, filename, status, metadata, created_at')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  for (const b of batches || []) {
    console.log(`  ${b.filename} (${b.status}) - ${b.created_at}`);
    const meta = b.metadata as Record<string, unknown> | null;
    if (meta) {
      console.log(`    Metadata keys: ${Object.keys(meta).join(', ')}`);
      if (meta.ai_context) {
        const ctx = meta.ai_context as Record<string, unknown>;
        if (ctx.sheets) {
          const sheets = ctx.sheets as Array<Record<string, unknown>>;
          for (const s of sheets) {
            console.log(`    Sheet: ${s.sheetName} → ${s.matchedComponent}`);
          }
        }
      }
      if (meta.sheet_names) console.log(`    Sheets: ${JSON.stringify(meta.sheet_names)}`);
      if (meta.fieldMaps) {
        const fm = meta.fieldMaps as Record<string, unknown>;
        for (const [sheet, mapping] of Object.entries(fm)) {
          console.log(`    Field map ${sheet}: ${JSON.stringify(mapping)}`);
        }
      }
    }
  }

  // Check data_uploads
  console.log('\n=== Data Uploads ===');
  const { data: uploads } = await sb.from('data_uploads')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`  Found ${uploads?.length || 0} uploads`);
  for (const u of uploads || []) {
    console.log(`  ${u.filename} (${u.status})`);
  }

  // Check: what import_batch_id values are in committed_data?
  console.log('\n=== Import Batch IDs in committed_data ===');
  const { data: batchIds } = await sb.from('committed_data')
    .select('import_batch_id')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', PERIOD_ID)
    .not('import_batch_id', 'is', null)
    .limit(100);
  const uniqueBatchIds = new Set((batchIds || []).map(r => r.import_batch_id));
  console.log(`  Unique batch IDs: ${uniqueBatchIds.size}`);
  for (const bid of Array.from(uniqueBatchIds)) {
    console.log(`    ${bid}`);
    // Look up this batch
    const { data: batch } = await sb.from('import_batches')
      .select('filename, metadata')
      .eq('id', bid)
      .single();
    if (batch) {
      console.log(`      File: ${batch.filename}`);
      const meta = batch.metadata as Record<string, unknown> | null;
      if (meta?.ai_context) {
        const ctx = meta.ai_context as Record<string, unknown>;
        if (ctx.sheets) {
          for (const s of (ctx.sheets as Array<Record<string, unknown>>)) {
            console.log(`      Sheet: ${s.sheetName} → matched: ${s.matchedComponent}`);
          }
        }
      }
    }
  }

  // Check: ALL string fields in Base_Venta_Individual that might be store size
  console.log('\n=== ALL string fields in Base_Venta_Individual ===');
  const { data: samples } = await sb.from('committed_data')
    .select('row_data')
    .eq('tenant_id', TENANT_ID)
    .eq('period_id', PERIOD_ID)
    .eq('data_type', 'Base_Venta_Individual')
    .limit(5);

  if (samples) {
    const allStringFields = new Map<string, Set<string>>();
    for (const s of samples) {
      const rd = s.row_data as Record<string, unknown>;
      for (const [k, v] of Object.entries(rd)) {
        if (typeof v === 'string') {
          if (!allStringFields.has(k)) allStringFields.set(k, new Set());
          allStringFields.get(k)!.add(v);
        }
      }
    }
    for (const [k, vals] of Array.from(allStringFields.entries())) {
      console.log(`  ${k}: ${Array.from(vals).slice(0, 3).join(', ')}`);
    }
  }

  // Check: what if the optical sales column metric should use Base_Venta_Tienda
  // BUT divided by the number of optometrist departments or some other factor?
  // What about field "Fecha Corte" (cutoff date)?

  // Also check: is there a file_storage or similar table?
  console.log('\n=== Checking for file storage tables ===');
  const tables = ['file_storage', 'files', 'uploads', 'documents', 'file_uploads'];
  for (const table of tables) {
    try {
      const { count } = await sb.from(table)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', TENANT_ID);
      if (count !== null && count > 0) {
        console.log(`  ${table}: ${count} rows`);
      }
    } catch {
      // Table doesn't exist
    }
  }
}

main().catch(console.error);
