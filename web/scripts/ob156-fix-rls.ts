import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Create RLS policies for ingestion-raw bucket
  // Service role already bypasses RLS, but the browser client needs policies
  const policies = [
    {
      name: 'Allow authenticated uploads',
      sql: `CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ingestion-raw');`,
    },
    {
      name: 'Allow authenticated reads',
      sql: `CREATE POLICY "Allow authenticated reads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ingestion-raw');`,
    },
    {
      name: 'Allow service role all',
      sql: `CREATE POLICY "Allow service role all on ingestion-raw" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'ingestion-raw') WITH CHECK (bucket_id = 'ingestion-raw');`,
    },
  ];

  for (const p of policies) {
    const { error } = await sb.rpc('exec_sql', { sql: p.sql });
    if (error) {
      // Try via direct SQL
      console.log(`Policy "${p.name}": ${error.message}`);
    } else {
      console.log(`Policy "${p.name}": OK`);
    }
  }

  // Actually, let's just try a direct upload test to see what's happening
  console.log('\nDirect upload test:');
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Key starts with:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20));

  const { data: buckets } = await sb.storage.listBuckets();
  console.log('Buckets:', buckets?.map(b => `${b.name} (public: ${b.public})`));

  const testPath = 'test_rls/test.txt';
  const { error } = await sb.storage
    .from('ingestion-raw')
    .upload(testPath, new Uint8Array([72, 101, 108, 108, 111]), {
      contentType: 'text/plain',
      upsert: true,
    });
  console.log('Upload:', error?.message || 'OK');
  if (!error) {
    await sb.storage.from('ingestion-raw').remove([testPath]);
  }
}
run().catch(console.error);
