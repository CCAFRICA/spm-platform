import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Get one result and see ALL columns
  const { data, error } = await sb.from('calculation_results')
    .select('*')
    .eq('batch_id', '98b96d6b-9b3a-4508-abda-f92c7ba5d708')
    .limit(1);

  if (error) {
    console.log('Error:', error);
    return;
  }

  if (data && data[0]) {
    console.log('Column names:', Object.keys(data[0]));
    // Print each column with truncated value
    for (const [k, v] of Object.entries(data[0])) {
      const val = typeof v === 'object' ? JSON.stringify(v)?.substring(0, 200) : String(v);
      console.log(`  ${k}: ${val}`);
    }
  } else {
    console.log('No results found');
  }
}

main().catch(console.error);
