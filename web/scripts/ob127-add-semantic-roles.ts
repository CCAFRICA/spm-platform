/**
 * OB-127: Add semantic_roles column to committed_data table
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob127-add-semantic-roles.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  // Approach: Store semantic_roles inside the existing metadata JSONB column
  // since we can't ALTER TABLE via the Supabase client library.
  // Check if we can read/write to metadata.semantic_roles

  const { data, error } = await supabase
    .from('committed_data')
    .select('id, metadata')
    .eq('tenant_id', 'a630404c-0777-4f6d-b760-b8a190ecd63c')
    .limit(1);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Sample metadata:', JSON.stringify(data?.[0]?.metadata));

  // Test: write semantic_roles into metadata
  if (data && data[0]) {
    const existingMeta = (data[0].metadata || {}) as Record<string, unknown>;
    const { error: upErr } = await supabase
      .from('committed_data')
      .update({ metadata: { ...existingMeta, semantic_roles_test: true } })
      .eq('id', data[0].id);

    if (upErr) {
      console.log('Update failed:', upErr.message);
    } else {
      console.log('Metadata write OK — semantic_roles can be stored in metadata JSONB');
      // Revert
      await supabase
        .from('committed_data')
        .update({ metadata: existingMeta })
        .eq('id', data[0].id);
    }
  }

  // Alternative: Try using the database SQL endpoint via Management API
  // Extract project reference from URL
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)/);
  const projectRef = match ? match[1] : '';
  console.log('Project ref:', projectRef);

  // Try the Supabase Management API to run SQL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const sqlResult = await fetch(`${url}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
  });
  console.log('REST API status:', sqlResult.status);
}

main().catch(console.error);
