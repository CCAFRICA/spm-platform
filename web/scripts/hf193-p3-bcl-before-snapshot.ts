// HF-193 Phase 3.1.b — Read-only BCL "before" snapshot.
// Resolves BCL tenant by name; lists rule_sets with seeds-key presence.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('BLOCKED: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: tenants, error: tenantErr } = await sb
    .from('tenants')
    .select('id, name')
    .or('name.ilike.%banco%,name.ilike.%cumbre%,name.ilike.%BCL%,name.ilike.%bcl%');
  if (tenantErr) {
    console.error('Tenant lookup failed:', tenantErr.message);
    process.exit(1);
  }
  console.log('BCL tenant candidates:', JSON.stringify(tenants, null, 2));

  if (!tenants || tenants.length === 0) {
    console.error('No BCL tenant candidate found. Tenant lookup returned empty.');
    process.exit(1);
  }

  for (const t of tenants) {
    const { data: ruleSets, error: rsErr } = await sb
      .from('rule_sets')
      .select('id, name, status, created_at, input_bindings')
      .eq('tenant_id', t.id)
      .order('created_at', { ascending: false });
    if (rsErr) {
      console.error(`rule_sets lookup failed for ${t.name}:`, rsErr.message);
      continue;
    }
    const annotated = (ruleSets ?? []).map(rs => ({
      id: rs.id,
      name: rs.name,
      status: rs.status,
      created_at: rs.created_at,
      has_plan_agent_seeds: !!(rs.input_bindings && typeof rs.input_bindings === 'object' && 'plan_agent_seeds' in (rs.input_bindings as object)),
      input_bindings_keys: rs.input_bindings && typeof rs.input_bindings === 'object'
        ? Object.keys(rs.input_bindings as object)
        : [],
    }));
    console.log(`\nrule_sets for tenant ${t.name} (${t.id}):`);
    console.log(JSON.stringify(annotated, null, 2));
  }
}

main().catch(err => {
  console.error('Top-level error:', err);
  process.exit(1);
});
