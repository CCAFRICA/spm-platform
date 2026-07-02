/** HF-373 EPG-C1 — the REAL structural selector (the one all three import surfaces
 * now consume) over the LIVE VLTEST2 roster recognition trace + rows. */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { findHcEntityIdCandidates, selectEntityIdFieldStructural, readTenantEntityDomain } from '../src/lib/sci/commit-content-unit';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const T = '5b078b52-55c9-4612-8f86-96038c198bfe';
(async () => {
  // live roster job's stored classification trace (the model's recognition at import)
  const { data: job } = await sb.from('processing_jobs').select('id, file_name, proposal').eq('id', '66551591-9376-4b77-8850-db1be4af85f5').single();
  const units = (job!.proposal as { contentUnits?: Array<Record<string, unknown>> })?.contentUnits ?? [];
  const roster = units[0] as { classificationTrace?: Record<string, unknown>; tabName?: string };
  console.log(`job ${job!.id} file=${job!.file_name} unit=${roster.tabName}`);
  const candidates = findHcEntityIdCandidates(roster.classificationTrace);
  console.log(`model-recognized entity-scope identifier candidates: [${candidates.join(', ')}]`);
  // live roster rows
  const { data: rows } = await sb.from('committed_data').select('row_data').eq('tenant_id', T).eq('data_type', 'entity').limit(200);
  const rowData = (rows ?? []).map(r => r.row_data as Record<string, unknown>);
  console.log(`live roster rows: ${rowData.length}`);
  // (a) creation-time shape: cold domain (entities not yet created on a clean-slate import)
  const selCold = selectEntityIdFieldStructural(candidates, rowData, new Set(), 'entity');
  console.log(`COLD (creation, empty domain): chosen="${selCold.chosen}" reason=${selCold.reason}`);
  // (b) commit-time shape: populated domain (entities created 0.46s earlier)
  const domain = await readTenantEntityDomain(sb as never, T);
  const selWarm = selectEntityIdFieldStructural(candidates, rowData, domain, 'entity');
  console.log(`WARM (commit, domain=${domain.size}): chosen="${selWarm.chosen}" reason=${selWarm.reason}`);
  // current corrupted persisted state (pre-fix), for contrast
  const { data: meta } = await sb.from('committed_data').select('metadata').eq('tenant_id', T).eq('data_type', 'entity').limit(1);
  console.log(`persisted (PRE-FIX import) metadata.entity_id_field = ${JSON.stringify((meta?.[0]?.metadata as Record<string, unknown>)?.entity_id_field)} (repaired by the Phase J clean-slate re-import)`);
})().catch(e => { console.log('threw:', e instanceof Error ? e.stack : String(e)); process.exit(1); });
