/** HF-373 EPG-0.10 read-only probe: Casa Diaz rule_sets — introspection + MAQUINARIA duplicates + COMISION GARANTIZADA components. */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CASA_DIAZ = '2d9979ba-5032-48a7-bccf-1928f3e6dadf';

async function main() {
  // FP-49: introspect rule_sets shape
  const { data: one, error: e0 } = await sb.from('rule_sets').select('*').limit(1);
  if (e0) throw e0;
  console.log('=== rule_sets Object.keys(row) ===');
  console.log(JSON.stringify(Object.keys(one![0] ?? {})));

  const { data: rows, error } = await sb
    .from('rule_sets')
    .select('id, name, status, created_at, updated_at, version, metadata, cadence_config')
    .eq('tenant_id', CASA_DIAZ)
    .order('created_at', { ascending: true });
  if (error) throw error;
  console.log(`\n=== Casa Diaz rule_sets: ${rows!.length} rows (ALL statuses) ===`);
  for (const r of rows!) {
    console.log(`\n--- id=${r.id} name="${r.name}" status=${r.status} created_at=${r.created_at} version=${r.version}`);
    console.log(`    metadata=${JSON.stringify(r.metadata)}`);
  }

  // COMISION GARANTIZADA full components
  const { data: gar, error: e2 } = await sb
    .from('rule_sets')
    .select('id, name, status, components, input_bindings, description')
    .eq('tenant_id', CASA_DIAZ)
    .ilike('name', '%GARANTIZADA%');
  if (e2) throw e2;
  console.log(`\n=== COMISION GARANTIZADA rows: ${gar!.length} ===`);
  for (const g of gar!) {
    console.log(`\n--- id=${g.id} name="${g.name}" status=${g.status}`);
    console.log(`description=${JSON.stringify(g.description)}`);
    console.log(`components (verbatim):`);
    console.log(JSON.stringify(g.components, null, 2));
    console.log(`input_bindings=${JSON.stringify(g.input_bindings)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
