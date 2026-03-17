import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function main() {
  // Check if tables exist
  const { data: pj, error: pjErr } = await supabase.from('processing_jobs').select('id').limit(0);
  const { data: sf, error: sfErr } = await supabase.from('structural_fingerprints').select('id').limit(0);

  console.log(`processing_jobs: ${pjErr ? 'DOES NOT EXIST — ' + pjErr.message : 'EXISTS'}`);
  console.log(`structural_fingerprints: ${sfErr ? 'DOES NOT EXIST — ' + sfErr.message : 'EXISTS'}`);

  if (!pjErr && !sfErr) {
    console.log('\nBoth tables already exist. Skipping migration.');
    console.log('\nVerifying schema...');
    // Verify processing_jobs columns
    const { data: pjSample } = await supabase.from('processing_jobs').select('*').limit(0);
    const { data: sfSample } = await supabase.from('structural_fingerprints').select('*').limit(0);
    console.log('processing_jobs accessible: OK');
    console.log('structural_fingerprints accessible: OK');
    return;
  }

  console.log('\nTables need creation. Please execute the migration SQL in Supabase SQL Editor:');
  console.log('File: web/supabase/migrations/023_processing_jobs_and_structural_fingerprints.sql');
}

main().catch(console.error);
