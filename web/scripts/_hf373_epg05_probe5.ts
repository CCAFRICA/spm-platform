// HF-373 EPG-0.5 read-only probe 5: column count from staged CSV; 07-01 pulse count per unit.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // A) parse first data line of a staged CSV -> row_data key count
  const path = `${CASA}/committed/2065cb12-c118-454a-956e-878970312206.csv`;
  const { data: blob } = await sb.storage.from('ingestion-raw').download(path);
  const buf = Buffer.from(await blob!.arrayBuffer());
  const text = buf.subarray(0, 100000).toString('utf8');
  const line1 = text.split('\n')[1] ?? '';
  // CSV fields are quoted with "" escaping; extract 5th field (row_data)
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line1.length; i++) {
    const c = line1[i];
    if (inQ) {
      if (c === '"') {
        if (line1[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { fields.push(cur); cur = ''; }
  }
  fields.push(cur);
  console.log('csv fields:', fields.length);
  const rowData = JSON.parse(fields[4]);
  const meta = JSON.parse(fields[5]);
  console.log('row_data key count:', Object.keys(rowData).length, '(incl _sheetName/_rowIndex)');
  console.log('row_data bytes:', Buffer.byteLength(fields[4], 'utf8'), 'metadata bytes:', Buffer.byteLength(fields[5], 'utf8'));
  console.log('metadata keys:', Object.keys(meta));
  const fi = meta.field_identities ?? {};
  console.log('field_identities cols:', Object.keys(fi).length);
  console.log('sample identity keys:', Object.keys(fi[Object.keys(fi)[0]] ?? {}));

  // B) 07-01 batches grouped by contentUnitId
  const { data: batches } = await sb.from('import_batches')
    .select('id, row_count, created_at, completed_at, metadata, status')
    .eq('tenant_id', CASA)
    .gte('created_at', '2026-07-01T05:45:00Z').lte('created_at', '2026-07-01T06:30:00Z')
    .order('created_at').limit(500);
  const byUnit: Record<string, { n: number; rows: number; first: string; last: string }> = {};
  for (const b of batches ?? []) {
    const cu = ((b.metadata as Record<string, unknown>)?.contentUnitId as string) ?? 'unknown';
    byUnit[cu] = byUnit[cu] ?? { n: 0, rows: 0, first: b.created_at, last: b.created_at };
    byUnit[cu].n += 1;
    byUnit[cu].rows += b.row_count ?? 0;
    byUnit[cu].last = b.created_at;
  }
  console.log('\n=== 07-01 batches by content unit ===');
  for (const [cu, s] of Object.entries(byUnit)) console.log(cu, JSON.stringify(s));

  // failed-run batch metadata (which unit, proposal)
  const { data: fb } = await sb.from('import_batches').select('*').eq('id', '02d85774-bbe5-4b36-b1e6-e788ef51303c').single();
  console.log('\n=== failed batch full row ===');
  console.log(JSON.stringify(fb, null, 1).slice(0, 1500));
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
