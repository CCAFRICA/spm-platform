import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function run() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Test');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log('Buffer type:', typeof xlsxBuffer, xlsxBuffer.constructor.name);
  console.log('Buffer length:', xlsxBuffer.length || xlsxBuffer.byteLength);

  // Try as Uint8Array
  const uint8 = new Uint8Array(xlsxBuffer instanceof ArrayBuffer ? xlsxBuffer : xlsxBuffer.buffer);
  console.log('Uint8Array length:', uint8.length);

  const storagePath = `${T}/${Date.now()}_test.xlsx`;
  const { error } = await sb.storage
    .from('ingestion-raw')
    .upload(storagePath, uint8, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.log('Upload failed:', error.message);
  } else {
    console.log('Upload OK:', storagePath);
    await sb.storage.from('ingestion-raw').remove([storagePath]);
    console.log('Cleaned up');
  }
}
run().catch(console.error);
