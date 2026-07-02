// HF-373 EPG-0.4 read-only probe: finalize claim rows, telemetry audit divergence, batch supersession.
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const TENANTS: Record<string, string> = {
  VLTEST2: '5b078b52-55c9-4612-8f86-96038c198bfe',
  CASA_DIAZ: '2d9979ba-5032-48a7-bccf-1928f3e6dadf',
};
const SINCE = '2026-06-30T00:00:00Z';

async function main() {
  // ---- FP-49 introspection: import_finalize_runs ----
  {
    const { data, error } = await sb.from('import_finalize_runs').select('*').limit(1);
    console.log('=== import_finalize_runs INTROSPECT ===');
    if (error) console.log('ERROR:', error.code, error.message);
    else if (!data || data.length === 0) console.log('EMPTY TABLE (exists, zero rows)');
    else { console.log('keys:', Object.keys(data[0])); console.log('sample:', JSON.stringify(data[0])); }
  }

  for (const [name, tid] of Object.entries(TENANTS)) {
    console.log(`\n########## TENANT ${name} (${tid}) ##########`);

    // ---- import_finalize_runs rows ----
    {
      const { data, error } = await sb.from('import_finalize_runs').select('*').eq('tenant_id', tid).order('claimed_at', { ascending: false }).limit(20);
      console.log(`--- import_finalize_runs (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.code, error.message);
      for (const r of data ?? []) console.log(JSON.stringify(r));
    }

    // ---- processing_jobs last 48h ----
    {
      const { data, error } = await sb.from('processing_jobs')
        .select('id, session_id, file_name, status, error_detail, created_at, updated_at, metadata')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(60);
      console.log(`--- processing_jobs since ${SINCE} (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.code, error.message);
      for (const r of (data ?? []) as any[]) {
        const m = r.metadata ?? {};
        console.log(JSON.stringify({ id: r.id, session: r.session_id, file: r.file_name, status: r.status, created: r.created_at, updated: r.updated_at, proposal_id: m.proposal_id, phase: m.phase, phase_at: m.phase_at, err: r.error_detail ? String(r.error_detail).slice(0, 120) : null }));
      }
    }

    // ---- import_session_telemetry: recent sessions w/ audit verdicts ----
    {
      const { data, error } = await sb.from('import_session_telemetry')
        .select('import_session_id, created_at, updated_at, audit, conclusion')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(20);
      console.log(`--- import_session_telemetry since ${SINCE} (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.code, error.message);
      for (const r of (data ?? []) as any[]) {
        const a = r.audit as any;
        if (!a) { console.log(JSON.stringify({ session: r.import_session_id, created: r.created_at, audit: null })); continue; }
        console.log(JSON.stringify({
          session: r.import_session_id, created: r.created_at, auditAt: a.at, divergent: a.divergent, fields: a.fields,
          scanned_rows: a.scanned?.rows, accumulated_rows: a.accumulated?.rows,
          scanned_pulses: a.scanned?.pulses, accumulated_pulses: a.accumulated?.pulses,
          scanned_units: a.scanned?.units, accumulated_units: a.accumulated?.units,
        }));
        if (a.divergent) {
          console.log('  scanned.perUnit:    ', JSON.stringify(a.scanned?.perUnit));
          console.log('  accumulated.perUnit:', JSON.stringify(a.accumulated?.perUnit));
        }
      }
    }

    // ---- import_batches last 48h: supersession evidence ----
    {
      const { data, error } = await sb.from('import_batches')
        .select('id, created_at, status, superseded_by, row_count, source_file, metadata')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(100);
      console.log(`--- import_batches since ${SINCE} (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.code, error.message);
      for (const r of (data ?? []) as any[]) {
        const m = r.metadata ?? {};
        console.log(JSON.stringify({ id: r.id, created: r.created_at, status: r.status, superseded_by: r.superseded_by, rows: r.row_count, file: r.source_file, unit: m.contentUnitId, proposal: m.proposalId, dataType: m.dataType ?? m.data_type }));
      }
    }

    // ---- rule_sets recent: double plan-commit evidence ----
    {
      const { data, error } = await sb.from('rule_sets')
        .select('id, name, status, created_at, updated_at')
        .eq('tenant_id', tid).gte('created_at', SINCE).order('created_at', { ascending: true }).limit(60);
      console.log(`--- rule_sets since ${SINCE} (${data?.length ?? 0}) ---`);
      if (error) console.log('ERROR:', error.code, error.message);
      for (const r of data ?? []) console.log(JSON.stringify(r));
    }
  }
}
main().catch(e => { console.error('PROBE FAILED:', e); process.exit(1); });
