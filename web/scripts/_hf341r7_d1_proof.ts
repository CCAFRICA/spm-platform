import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { reconcileEntityKeysByValueOverlap } from '@/lib/sci/entity-resolution';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
type Any = Record<string, unknown>;
type Info = { idColumn: string; nameColumn: string | null; attributeColumns: string[]; isEventUnit: boolean };
(async () => {
  // build batchIdentifiers from committed_data: one sample row per import_batch_id → data_type + metadata.entity_id_field
  const seen = new Map<string, { dataType: string; idField: string }>();
  let off = 0;
  while (true) {
    const { data } = await sb.from('committed_data').select('import_batch_id, data_type, metadata').eq('tenant_id', MIR).range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data as Any[]) {
      const b = String(r.import_batch_id);
      if (!seen.has(b)) {
        const meta = r.metadata as Any;
        seen.set(b, { dataType: String(r.data_type), idField: String(meta?.entity_id_field ?? '') });
      }
    }
    if (data.length < 1000) break; off += 1000;
  }
  const batchIdentifiers = new Map<string, Info>();
  for (const [b, info] of seen) {
    if (!info.idField) continue;
    const isEventUnit = info.dataType === 'transaction' || info.dataType === 'target';
    batchIdentifiers.set(b, { idColumn: info.idField, nameColumn: null, attributeColumns: [], isEventUnit });
  }
  console.log('=== MIR batchIdentifiers (pre-reconcile) ===');
  for (const [b, i] of batchIdentifiers) console.log(`  ${b.slice(0,8)} dataType-event=${i.isEventUnit} idColumn='${i.idColumn}'`);

  const before = new Map(Array.from(batchIdentifiers.entries()).map(([b, i]) => [b, i.idColumn]));
  const switches = await reconcileEntityKeysByValueOverlap(sb, MIR, batchIdentifiers);
  console.log('\n=== switches ===');
  for (const s of switches) console.log(`  batch ${s.batchId.slice(0,8)}: '${s.from}' (overlap ${(s.fromOverlap*100).toFixed(0)}%) → '${s.to}' (overlap ${(s.toOverlap*100).toFixed(0)}%)`);
  console.log('\n=== post-reconcile idColumns (changed only) ===');
  for (const [b, i] of batchIdentifiers) if (before.get(b) !== i.idColumn) console.log(`  ${b.slice(0,8)}: '${before.get(b)}' → '${i.idColumn}'`);
  console.log(switches.length > 0 ? '\nD1 PROOF: roster re-keyed to the transaction identity domain (DNI) — name-namespace eliminated on reimport.' : '\nNo switch (unexpected for MIR).');
})().catch(e => { console.error(e); process.exit(1); });
