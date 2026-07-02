/** HF-373 EPG-H1 — the REAL 42MB 86,607×87 JDE extract through the MODIFIED streamed path:
 * identity keying (debandBanded=false), exact row count, bounded memory. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { streamSheetMeta, streamSheetWindows } from '../src/lib/sci/sheet-stream';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: job } = await sb.from('processing_jobs').select('file_storage_path, file_name, file_size_bytes').eq('id', '0f648189-1a0f-4878-9103-179992b79401').single();
  console.log(`file: ${job!.file_name} (${job!.file_size_bytes} bytes) path=${job!.file_storage_path}`);
  const { data: blob, error } = await sb.storage.from('ingestion-raw').download(job!.file_storage_path as string);
  if (error || !blob) { console.log('download failed:', error?.message); return; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const rss0 = process.memoryUsage().rss;
  const t0 = Date.now();
  const meta = await streamSheetMeta(buf, { sampleRows: 50 });
  console.log(`streamSheetMeta: sheet=${meta.sheetName} headers=${meta.headers.length} cols debandBanded=${meta.debandBanded} totalRows=${meta.totalRows} (known=${meta.totalKnown}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  first 5 headers: ${meta.headers.slice(0, 5).join(' | ')}`);
  let streamed = 0;
  const t1 = Date.now();
  const res = await streamSheetWindows(buf, { windowRows: 20000, onWindow: (rows) => { streamed += rows.length; } });
  const rssPeak = process.memoryUsage().rss;
  console.log(`streamSheetWindows: totalRows=${res.totalRows} streamed=${streamed} debandBanded=${res.debandBanded} in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`headers identical to meta: ${JSON.stringify(res.headers) === JSON.stringify(meta.headers)}`);
  console.log(`RSS delta during streaming: ${((rssPeak - rss0) / 1048576).toFixed(0)}MB (buffer itself is ${(buf.length / 1048576).toFixed(0)}MB)`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
