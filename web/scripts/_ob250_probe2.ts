import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function oneRow(table: string) {
  const { data, error } = await sb.from(table).select('*').limit(1);
  if (error) { console.log(`  ERROR select-one ${table}: ${error.message}`); return null; }
  return data && data[0] ? data[0] : null;
}
async function count(table: string) {
  const { count: c, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  return error ? `ERR(${error.message})` : c;
}

async function main() {
  console.log('============ OB-250 PROBE 2: audit_logs + file.* + event-type breadth ============');

  // audit_logs (the real tenant audit table prism writes to)
  console.log('\n========== audit_logs ==========');
  const aRow = await oneRow('audit_logs');
  if (aRow) {
    console.log(`  columns: ${JSON.stringify(Object.keys(aRow))}`);
    console.log(`  count(audit_logs) = ${await count('audit_logs')}`);
    // distinct action values
    const { data: actions } = await sb.from('audit_logs').select('action').limit(2000);
    if (actions) {
      const tally: Record<string, number> = {};
      actions.forEach((r: any) => { tally[String(r.action)] = (tally[String(r.action)] || 0) + 1; });
      console.log(`  distinct action values + counts (sampled ${actions.length}): ${JSON.stringify(tally)}`);
    }
    // file.* events specifically
    const { data: fileEv } = await sb.from('audit_logs').select('*').like('action', 'file.%').limit(5);
    console.log(`  --- sample file.* audit_logs rows (${(fileEv || []).length}) ---`);
    (fileEv || []).forEach((r: any) => console.log(`    ${JSON.stringify(r)}`));
    // any tenant.* / settings.* action sample (how a settings change is recorded)
    const { data: tEv } = await sb.from('audit_logs').select('*').or('action.ilike.tenant.%,action.ilike.%settings%,action.ilike.%config%').limit(5);
    console.log(`  --- sample tenant/settings/config audit_logs rows (${(tEv || []).length}) ---`);
    (tEv || []).forEach((r: any) => console.log(`    ${JSON.stringify(r)}`));
  } else {
    console.log('  audit_logs: absent / no row');
  }

  // file_objects scan_verdict distinct
  console.log('\n========== file_objects.scan_verdict distinct ==========');
  const { data: fo } = await sb.from('file_objects').select('state,scan_verdict,clean_path,import_batch_id,promoted_at');
  if (fo) {
    const tally: Record<string, number> = {};
    fo.forEach((r: any) => { const k = `state=${r.state}|verdict=${r.scan_verdict}`; tally[k] = (tally[k] || 0) + 1; });
    console.log(`  (state,scan_verdict) tally: ${JSON.stringify(tally, null, 0)}`);
  }

  // committed_data: how many rows carry import_batch_id vs null
  console.log('\n========== committed_data import_batch linkage ==========');
  const withBatch = await sb.from('committed_data').select('*', { count: 'exact', head: true }).not('import_batch_id', 'is', null);
  const nullBatch = await sb.from('committed_data').select('*', { count: 'exact', head: true }).is('import_batch_id', null);
  console.log(`  committed_data with import_batch_id NOT null = ${withBatch.count}`);
  console.log(`  committed_data with import_batch_id IS null  = ${nullBatch.count}`);

  // platform_events broader event_type distinct (order to get variety)
  console.log('\n========== platform_events event_type breadth ==========');
  const { data: pe } = await sb.from('platform_events').select('event_type').order('created_at', { ascending: false }).limit(2000);
  if (pe) {
    const tally: Record<string, number> = {};
    pe.forEach((r: any) => { tally[String(r.event_type)] = (tally[String(r.event_type)] || 0) + 1; });
    console.log(`  distinct event_type + counts (sampled ${pe.length}): ${JSON.stringify(tally)}`);
  }

  console.log('\n============ END PROBE 2 ============');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
