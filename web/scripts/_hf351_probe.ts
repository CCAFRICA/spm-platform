import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
(async () => {
  // 1. MIR entity domain (external_ids) — what value-domain overlap compares against
  const { data: ents } = await sb.from('entities').select('external_id, entity_type, display_name').eq('tenant_id', MIR).limit(2000);
  const indiv = (ents ?? []).filter(e => e.entity_type === 'individual');
  const domain = new Set(indiv.map(e => String(e.external_id).trim()));
  console.log(`MIR entities: ${ents?.length} total, ${indiv.length} individual. Sample external_ids:`, indiv.slice(0,5).map(e=>e.external_id));
  // 2. A MIR transaction committed_data row: columns + stored entity_id_field
  const { data: cd } = await sb.from('committed_data').select('data_type, row_data, metadata').eq('tenant_id', MIR).eq('data_type', 'transaction').limit(1);
  const r0 = (cd ?? [])[0];
  if (r0) {
    console.log('\nMIR transaction row columns:', Object.keys(r0.row_data as any).filter(k=>!k.startsWith('_')));
    console.log('stored metadata.entity_id_field:', (r0.metadata as any)?.entity_id_field);
  }
  // 3. cardinality + domain-overlap of each identifier-ish column across MIR transaction rows
  const { data: rows } = await sb.from('committed_data').select('row_data').eq('tenant_id', MIR).eq('data_type', 'transaction').limit(5000);
  const flat = (rows ?? []).map(r => r.row_data as Record<string,unknown>);
  const cols = new Set<string>(); for (const rd of flat) for (const k of Object.keys(rd)) if (!k.startsWith('_')) cols.add(k);
  console.log(`\nMIR transaction: ${flat.length} rows. Per-column [distinct, repeatRatio=rows/distinct, domainOverlap%]:`);
  for (const c of Array.from(cols)) {
    const vals = new Set<string>(); let nonNull=0, overlap=0;
    for (const rd of flat) { const v=rd[c]; if (v==null) continue; const s=String(v).trim(); if(!s) continue; nonNull++; vals.add(s); }
    for (const v of Array.from(vals)) if (domain.has(v)) overlap++;
    const ratio = vals.size>0 ? (nonNull/vals.size).toFixed(2) : '—';
    const ov = vals.size>0 ? ((overlap/vals.size)*100).toFixed(0) : '0';
    if (vals.size > 1) console.log(`  ${c.padEnd(24)} distinct=${String(vals.size).padStart(6)} repeatRatio=${ratio.padStart(7)} domainOverlap=${ov.padStart(3)}%`);
  }
})().catch(e=>console.log('threw:', e instanceof Error?e.message:String(e)));
