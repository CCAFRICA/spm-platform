/**
 * OB-258 P0.4 read-only probe — capability + persona substrate.
 *
 * READ-ONLY (FP-49 live verification): lists every tenant (id,name,slug) and every
 * profiles row (id,role,capabilities,tenant_id,display_name) so the governance report
 * can see the real persisted capability sets and which profiles belong to VLTEST2.
 *
 * Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/_ob258_p04_caps_probe.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name');
  if (tErr) throw new Error(`tenants: ${tErr.message}`);
  console.log('=== tenants (id, name, slug) ===');
  for (const t of tenants ?? []) {
    console.log(`${t.id}  ${t.name}  slug=${t.slug}`);
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, role, capabilities, tenant_id, display_name')
    .order('role');
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  console.log(`\n=== profiles (${profiles?.length ?? 0} rows) ===`);
  for (const p of profiles ?? []) {
    const caps = Array.isArray(p.capabilities) ? p.capabilities : p.capabilities;
    console.log(
      `id=${p.id}\n  role=${p.role}  tenant_id=${p.tenant_id}  display_name=${p.display_name}\n  capabilities=${JSON.stringify(caps)}`,
    );
  }
}

main().catch((e) => {
  console.error('PROBE FAILED:', e);
  process.exit(1);
});
