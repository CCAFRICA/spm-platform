import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const projectRef = url.replace('https://', '').split('.')[0];

async function run() {
  console.log('Project ref:', projectRef);

  // Method 1: Try Supabase Management API
  try {
    const mgmtResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: "ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;" }),
    });
    console.log('Management API status:', mgmtResp.status);
    const mgmtText = await mgmtResp.text();
    console.log('Response:', mgmtText.substring(0, 500));

    if (mgmtResp.ok) {
      console.log('Migration executed via Management API');
    }
  } catch (e) {
    console.log('Management API failed:', e);
  }

  // Verify column exists
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('import_batches')
    .select('id, metadata')
    .limit(1);

  if (error) {
    console.log('Column verification FAILED:', error.message);
    console.log('');
    console.log('=== MANUAL MIGRATION REQUIRED ===');
    console.log('Run this SQL in Supabase Dashboard > SQL Editor:');
    console.log("ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;");
  } else {
    console.log('Column verification PASSED:', JSON.stringify(data));
  }
}

run().catch(console.error);
