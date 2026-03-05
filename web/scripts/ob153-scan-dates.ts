import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Get semantic roles to find date field
  const { data: sample } = await sb.from('committed_data')
    .select('metadata')
    .eq('tenant_id', OPTICA_ID)
    .limit(1);

  const meta = sample?.[0]?.metadata as Record<string, unknown>;
  const roles = meta?.semantic_roles as Record<string, { role: string }> | undefined;
  console.log('Semantic roles:', JSON.stringify(roles, null, 2));

  // Find date field name from semantic roles
  const dateFields: string[] = [];
  if (roles) {
    for (const [field, info] of Object.entries(roles)) {
      if (['transaction_date', 'period_marker', 'event_timestamp'].includes(info.role)) {
        dateFields.push(field);
      }
    }
  }
  console.log('Date fields:', dateFields);

  if (dateFields.length === 0) {
    console.log('No date fields found from semantic roles');
    return;
  }

  // Scan dates from the identified field
  const periodMap = new Map<string, number>();
  let offset = 0;

  while (offset < 10000) {
    const { data: rows } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', OPTICA_ID)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const rd = row.row_data as Record<string, unknown>;
      for (const field of dateFields) {
        const val = rd[field];
        if (typeof val === 'number' && val > 40000 && val < 50000) {
          const date = new Date((val - 25569) * 86400 * 1000);
          const y = date.getUTCFullYear();
          const m = date.getUTCMonth() + 1;
          const key = `${y}-${String(m).padStart(2, '0')}`;
          periodMap.set(key, (periodMap.get(key) || 0) + 1);
        }
      }
    }

    offset += rows.length;
    if (rows.length < 1000) break;
  }

  const sorted = Array.from(periodMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  console.log('\nDetected periods from date fields only:');
  for (const [key, count] of sorted) {
    console.log(`  ${key}: ${count} rows`);
  }
}

run();
