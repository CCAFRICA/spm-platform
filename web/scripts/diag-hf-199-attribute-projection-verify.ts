// HF-199 D3 verification probe — confirm entities.temporal_attributes is populated
// with attribute projections (e.g., Tipo_Coordinador for Meridian) post entity-resolution.
// Read-only.
//
// Run: cd web && npx tsx scripts/diag-hf-199-attribute-projection-verify.ts [tenantId]
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.+)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key);

const TENANT = process.argv[2] ?? '5035b1e8-0754-4527-b7ec-9f93f85e4c79'; // default Meridian

interface TemporalAttr { key: string; value: unknown; effective_from: string; effective_to: string | null }

async function main() {
  console.log(`=== HF-199 D3 attribute projection verify (tenant=${TENANT}) ===`);

  const { data: entities, count } = await sb
    .from('entities')
    .select('id, external_id, display_name, temporal_attributes', { count: 'exact' })
    .eq('tenant_id', TENANT)
    .limit(100);

  if (!entities) {
    console.log('No entities for tenant.');
    return;
  }

  let withAttrs = 0;
  let totalAttrRecords = 0;
  const attrKeySet = new Set<string>();
  const samples: Array<{ name: string; attrs: TemporalAttr[] }> = [];

  for (const e of entities) {
    const ta = (e.temporal_attributes ?? []) as TemporalAttr[];
    if (Array.isArray(ta) && ta.length > 0) {
      withAttrs++;
      totalAttrRecords += ta.length;
      for (const a of ta) attrKeySet.add(a.key);
      if (samples.length < 3) {
        samples.push({ name: e.display_name as string, attrs: ta });
      }
    }
  }

  console.log(`total entities (limit 100): ${entities.length}`);
  console.log(`total entities for tenant: ${count}`);
  console.log(`entities with temporal_attributes populated: ${withAttrs}`);
  console.log(`total attribute records across sample: ${totalAttrRecords}`);
  console.log(`distinct attribute keys: [${Array.from(attrKeySet).sort().join(', ')}]`);
  console.log('\nsample entities (first 3 with attrs):');
  for (const s of samples) {
    console.log(`  ${s.name}:`);
    for (const a of s.attrs) {
      console.log(`    ${a.key} = ${JSON.stringify(a.value)} (from=${a.effective_from} to=${a.effective_to ?? 'null'})`);
    }
  }

  // Verdict
  const verdict = withAttrs > 0 ? 'PROJECTION OPERATIVE' : 'PROJECTION ABSENT (D3 unfixed)';
  console.log(`\nVerdict: ${verdict}`);
}

main().catch(e => { console.error(e); process.exit(1); });
