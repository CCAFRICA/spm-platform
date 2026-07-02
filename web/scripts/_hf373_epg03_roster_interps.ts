import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const JOB = '66551591-9376-4b77-8850-db1be4af85f5';

async function main() {
  const { data, error } = await sb.from('processing_jobs')
    .select('proposal').eq('id', JOB).single();
  if (error) { console.log('err', error.message); return; }
  const units = (data.proposal as any).contentUnits as any[];
  console.log('contentUnits:', units.length);
  for (const u of units) {
    console.log('\n--- unit:', u.contentUnitId, 'tab:', u.tabName, 'classification:', u.confirmedClassification ?? u.classification, 'dataType:', u.dataType);
    const interps = u.classificationTrace?.headerComprehension?.interpretations as Record<string, any> | undefined;
    if (!interps) { console.log('  (no interpretations)'); continue; }
    console.log('  columns:', JSON.stringify(Object.keys(interps)));
    for (const [col, i] of Object.entries(interps)) {
      console.log(`  COL ${col}: scope_role=${i.scope_role} nature_role=${i.nature_role} conf=${i.confidence} identifies=${JSON.stringify(i.identifies)} data_nature=${JSON.stringify(i.data_nature)}`);
    }
    // also print bindings with entity_identifier role
    const bindings = (u.confirmedBindings ?? u.bindings ?? u.proposedBindings) as any[] | undefined;
    if (bindings) {
      for (const b of bindings) {
        console.log(`  BINDING ${b.sourceField} -> ${b.semanticRole} (conf=${b.confidence}, claimedBy=${b.claimedBy})`);
      }
    } else {
      console.log('  unit keys:', JSON.stringify(Object.keys(u)));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
