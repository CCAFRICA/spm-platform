import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const OPTICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  // Check ALL distinct data_types and their metadata
  let offset = 0;
  const seen = new Set<string>();
  const dateFields = new Map<string, string>();

  while (offset < 200000) {
    const { data: rows } = await sb.from('committed_data')
      .select('data_type, metadata')
      .eq('tenant_id', OPTICA_ID)
      .range(offset, offset + 999);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const dt = row.data_type;
      if (seen.has(dt)) continue;
      seen.add(dt);

      const meta = row.metadata as Record<string, unknown> | null;
      const roles = meta?.semantic_roles as Record<string, { role: string }> | undefined;
      if (roles) {
        for (const [field, info] of Object.entries(roles)) {
          if (['transaction_date', 'period_marker', 'event_timestamp'].includes(info.role)) {
            dateFields.set(field, `${dt} → ${info.role}`);
            console.log(`FOUND: data_type="${dt}" field="${field}" role="${info.role}"`);
          }
        }
      }
    }

    offset += rows.length;
    if (rows.length < 1000) break;
  }

  console.log(`\nScanned ${offset} rows, ${seen.size} unique data_types`);
  console.log('Date fields:', dateFields.size > 0 ? Array.from(dateFields.entries()).map(([k, v]) => `${k} (${v})`).join(', ') : 'NONE');

  // Also check: what do the first few rows of EACH data_type look like?
  for (const dt of Array.from(seen)) {
    const { data: sample } = await sb.from('committed_data')
      .select('row_data')
      .eq('tenant_id', OPTICA_ID)
      .eq('data_type', dt)
      .limit(1);
    if (sample && sample.length > 0) {
      const keys = Object.keys(sample[0].row_data as Record<string, unknown>).filter(k => !k.startsWith('_'));
      console.log(`\n${dt}: ${keys.join(', ')}`);
      // Check for date-like values
      const rd = sample[0].row_data as Record<string, unknown>;
      for (const [k, v] of Object.entries(rd)) {
        if (k.startsWith('_')) continue;
        if (typeof v === 'number' && v > 40000 && v < 50000) {
          const d = new Date((v - 25569) * 86400 * 1000);
          console.log(`  ${k}: ${v} → ${d.toISOString().split('T')[0]} (Excel serial)`);
        }
      }
    }
  }
}

run();
