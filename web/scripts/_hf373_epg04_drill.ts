// HF-373 EPG-0.4 drill probe: introspect import_batches/processing_jobs, then targeted queries.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const CASA = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';
const SINCE = '2026-06-30T00:00:00Z';

async function main() {
  for (const t of ['import_batches', 'processing_jobs', 'pulse_load_jobs', 'rule_sets']) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    console.log(`=== ${t} INTROSPECT ===`);
    if (error) console.log('ERROR:', error.code, error.message);
    else if (!data?.length) console.log('EMPTY');
    else console.log('keys:', Object.keys(data[0]).join(', '));
  }

  for (const [name, tid] of [['VLTEST2', VLTEST2], ['CASA_DIAZ', CASA]] as const) {
    console.log(`\n########## ${name} ##########`);
    // import_batches last 48h
    {
      const { data, error } = await sb.from('import_batches').select('*')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(100);
      console.log(`--- import_batches (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.message);
      for (const r of (data ?? []) as any[]) {
        const m = r.metadata ?? {};
        console.log(JSON.stringify({ id: r.id, created: r.created_at, status: r.status, superseded_by: r.superseded_by, rows: r.row_count, unit: m.contentUnitId, proposal: m.proposalId, type: r.data_type ?? m.dataType }));
      }
    }
    // processing_jobs last 48h
    {
      const { data, error } = await sb.from('processing_jobs').select('*')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(60);
      console.log(`--- processing_jobs (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.message);
      for (const r of (data ?? []) as any[]) {
        const m = r.metadata ?? {};
        console.log(JSON.stringify({ id: r.id, session: r.session_id, file: r.file_name, status: r.status, created: r.created_at, proposal: m.proposal_id, phase: m.phase, phase_at: m.phase_at, err: r.error_detail ? String(r.error_detail).slice(0, 100) : null }));
      }
    }
    // pulse_load_jobs last 48h
    {
      const { data, error } = await sb.from('pulse_load_jobs').select('*')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(20);
      console.log(`--- pulse_load_jobs (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.message);
      for (const r of (data ?? []) as any[]) {
        console.log(JSON.stringify({ id: r.id, session: r.session_id, status: r.status, finalized: r.finalized, total_pulses: r.total_pulses, pulses_done: r.pulses_done ?? r.pulses_loaded, rows: r.total_rows ?? r.rows_loaded, created: r.created_at, updated: r.updated_at }));
      }
    }
  }

  // committed_data counts for the two divergent sessions, NOW
  for (const [tid, session] of [[VLTEST2, '94b838b8-080a-4bee-8fb2-77527f94ae47'], [CASA, '6291bd7c-fb5c-4ceb-ba67-f985b149a8b7']] as const) {
    const { count } = await sb.from('committed_data').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tid).eq('metadata->>proposalId', session);
    console.log(`\ncommitted_data NOW tenant=${tid} session=${session}: count=${count}`);
  }

  // rule_sets duplicate drill: the two COMISIONES DE MAQUINARIA rows — full rows (minus bulky fields)
  {
    const { data } = await sb.from('rule_sets').select('*').eq('tenant_id', CASA)
      .in('id', ['63664074-fa4e-49fc-8f45-89b23dd8ae36', '903d05b2-a4a4-4915-95ee-315a5aefc9d4']);
    console.log('\n--- CASA duplicate rule_sets drill ---');
    for (const r of (data ?? []) as any[]) {
      const slim: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        const s = JSON.stringify(v);
        slim[k] = s && s.length > 300 ? `<${s.length}B>` : v;
      }
      console.log(JSON.stringify(slim));
    }
  }
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
