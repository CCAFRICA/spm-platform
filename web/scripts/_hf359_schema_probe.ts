// HF-359 (FP-49) — READ-ONLY live probe. No writes, no DDL, no import. SR-44 safe.
//   from web/:  npx tsx scripts/_hf359_schema_probe.ts
// Confirms: (1) the ingestion-raw bucket's file_size_limit (the runtime limit Part A's budget derives
// from); (2) audit_logs.changes column type (Part C payload); (3) import_session_telemetry shape (Part B).
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function columnsOf(table: string): Promise<string[]> {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) return [`<error ${error.code ?? ''}: ${error.message}>`];
  return data && data.length ? Object.keys(data[0]) : ['<no rows>'];
}

async function main() {
  console.log('=== HF-359 FP-49 PROBE (read-only) ===\n');

  // (1) Storage limit discovery — the KEY Part A input.
  console.log('— ingestion-raw bucket (getBucket) —');
  const { data: bucket, error: bErr } = await sb.storage.getBucket('ingestion-raw');
  if (bErr) console.log(`  getBucket error: ${bErr.message}`);
  else console.log(`  id=${bucket.id} public=${bucket.public} file_size_limit=${bucket.file_size_limit} allowed_mime=${JSON.stringify(bucket.allowed_mime_types)}`);
  console.log('— listBuckets (cross-check file_size_limit field shape) —');
  const { data: buckets, error: lErr } = await sb.storage.listBuckets();
  if (lErr) console.log(`  listBuckets error: ${lErr.message}`);
  else for (const b of buckets) console.log(`    ${b.name.padEnd(18)} file_size_limit=${b.file_size_limit ?? 'null'}`);

  // (2) audit_logs — Part C payload column.
  console.log('\n— audit_logs columns —');
  console.log('  ', (await columnsOf('audit_logs')).join(', '));
  const { data: auditSample } = await sb.from('audit_logs').select('changes, metadata').eq('action', 'tenant.clean_slate').order('created_at', { ascending: false }).limit(1);
  console.log('  latest clean_slate changes keys:', auditSample?.[0]?.changes ? Object.keys(auditSample[0].changes) : '(none yet)');

  // (3) import_session_telemetry — Part B shape.
  console.log('\n— import_session_telemetry columns —');
  console.log('  ', (await columnsOf('import_session_telemetry')).join(', '));

  console.log('\n=== PROBE COMPLETE (zero writes) ===');
}
main().catch((e) => { console.error('[FATAL]', e instanceof Error ? e.message : e); process.exit(1); });
