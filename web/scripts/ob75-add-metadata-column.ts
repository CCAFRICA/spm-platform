import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('=== OB-75: Verify metadata column on import_batches ===\n');

  // Test 1: Try to insert a row with metadata
  const testTenant = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';
  const { data: testBatch, error: insertErr } = await supabase
    .from('import_batches')
    .insert({
      tenant_id: testTenant,
      file_name: '__metadata_column_test__',
      file_type: 'test',
      status: 'test',
      row_count: 0,
      metadata: { test: true } as unknown,
    } as Record<string, unknown>)
    .select('id, metadata')
    .single();

  if (insertErr) {
    if (insertErr.message.includes('metadata')) {
      console.log('COLUMN DOES NOT EXIST: metadata column missing from import_batches');
      console.log(`Error: ${insertErr.message}`);
      console.log('\n=== MANUAL ACTION REQUIRED ===');
      console.log('Run this SQL in Supabase Dashboard > SQL Editor:');
      console.log("ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;");
      console.log('\nThen re-run this script to verify.');
    } else {
      console.log('Insert failed for other reason:', insertErr.message);
    }
    return;
  }

  console.log('COLUMN EXISTS! Test insert succeeded.');
  console.log('Test row:', JSON.stringify(testBatch));

  // Clean up test row
  if (testBatch?.id) {
    await supabase.from('import_batches').delete().eq('id', testBatch.id);
    console.log('Test row cleaned up.');
  }

  console.log('\nMetadata column is ready for AI context persistence.');
}

run().catch(console.error);
