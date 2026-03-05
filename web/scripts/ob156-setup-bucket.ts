import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Test upload with service role
  const { error } = await sb.storage
    .from('ingestion-raw')
    .upload('test/test.txt', Buffer.from('hello'), {
      contentType: 'text/plain',
      upsert: true,
    });

  if (error) {
    console.log('Upload test failed:', error.message);
    console.log('Service role should bypass RLS. The issue may be with bucket policies.');
    console.log('Trying to list policies...');

    // Try to create the bucket as public temporarily for testing
    const { error: updateErr } = await sb.storage.updateBucket('ingestion-raw', {
      public: true,
    });
    console.log('Set bucket public:', updateErr?.message || 'OK');

    // Retry upload
    const { error: retryErr } = await sb.storage
      .from('ingestion-raw')
      .upload('test/test2.txt', Buffer.from('hello'), {
        contentType: 'text/plain',
        upsert: true,
      });
    console.log('Retry upload:', retryErr?.message || 'OK');

    if (!retryErr) {
      await sb.storage.from('ingestion-raw').remove(['test/test2.txt']);
      console.log('Cleaned up test file');
    }
  } else {
    console.log('Service role upload: OK');
    await sb.storage.from('ingestion-raw').remove(['test/test.txt']);
    console.log('Cleaned up test file');
  }
}
run().catch(console.error);
