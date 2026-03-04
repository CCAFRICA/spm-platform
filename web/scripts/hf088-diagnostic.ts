/**
 * HF-088 Phase 0: Diagnostic — read-only queries to understand current state
 * Run from: spm-platform/web
 * Command: npx tsx scripts/hf088-diagnostic.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
  console.log('=== HF-088 DIAGNOSTIC ===\n');

  // 1. Find ALL VL Admin profiles
  console.log('--- VL Admin Profiles (ALL) ---');
  const { data: allVlProfiles, error: e1 } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name, created_at')
    .eq('email', 'platform@vialuce.com');

  if (e1) console.error('Error querying profiles:', e1.message);
  console.table(allVlProfiles);

  const platformProfile = allVlProfiles?.filter(p => p.tenant_id === null);
  const tenantProfiles = allVlProfiles?.filter(p => p.tenant_id !== null);
  console.log(`\nPlatform-level profiles (KEEP): ${platformProfile?.length ?? 0}`);
  console.log(`Tenant-scoped profiles (DELETE — HF-086 damage): ${tenantProfiles?.length ?? 0}`);

  // 2. Also check by display_name pattern (in case email differs)
  console.log('\n--- Profiles with display_name "VL Platform Admin" and role "admin" ---');
  const { data: vlNameProfiles, error: e2 } = await supabase
    .from('profiles')
    .select('id, tenant_id, email, role, display_name, created_at')
    .eq('display_name', 'VL Platform Admin')
    .eq('role', 'admin');

  if (e2) console.error('Error querying by display_name:', e2.message);
  console.table(vlNameProfiles);

  // 3. Find rule_sets for Optica Luminar
  console.log('\n--- Rule Sets for Optica Luminar ---');
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .ilike('slug', '%optica%');

  if (!tenants?.length) {
    console.log('No Optica tenant found.');
  } else {
    const tenantId = tenants[0].id;
    console.log(`Tenant: ${tenants[0].name} (${tenantId})`);

    const { data: ruleSets, error: e3 } = await supabase
      .from('rule_sets')
      .select('id, name, status, created_at, metadata')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (e3) console.error('Error querying rule_sets:', e3.message);
    console.table(ruleSets?.map(rs => ({
      id: rs.id.substring(0, 8) + '...',
      name: rs.name,
      status: rs.status,
      created_at: rs.created_at,
      contentUnitId: (rs.metadata as Record<string, string>)?.contentUnitId?.substring(0, 30) || 'none',
    })));
    console.log(`Total rule_sets: ${ruleSets?.length ?? 0}`);
  }

  // 4. Verify Optica Luminar data state
  console.log('\n--- Optica Luminar Data State ---');
  if (tenants?.length) {
    const tenantId = tenants[0].id;
    const { count: entityCount } = await supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: dataCount } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: resultCount } = await supabase.from('calculation_results').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    const { count: assignmentCount } = await supabase.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);

    console.log(`Entities: ${entityCount}`);
    console.log(`Committed data: ${dataCount}`);
    console.log(`Calculation results: ${resultCount}`);
    console.log(`Rule set assignments: ${assignmentCount}`);
  }

  // 5. Other tenant health check
  console.log('\n--- Other Tenant Health Check ---');
  const tenantChecks = [
    { name: 'Pipeline Test Co', slug: 'pipeline' },
    { name: 'Caribe Financial', slug: 'caribe' },
    { name: 'Sabor Grupo', slug: 'sabor' },
  ];

  for (const t of tenantChecks) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name')
      .ilike('slug', `%${t.slug}%`)
      .maybeSingle();

    if (!tenant) {
      console.log(`${t.name}: Not found (OK if not seeded)`);
      continue;
    }

    const { count: entities } = await supabase.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    const { count: results } = await supabase.from('calculation_results').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    console.log(`${t.name}: ${entities} entities, ${results} results`);
  }

  console.log('\n=== END DIAGNOSTIC ===');
  console.log('\nIf tenant-scoped VL Admin profiles > 0 or Optica rule_sets > 0, proceed to Phase 1 cleanup.');
  console.log('If both are already 0, skip to Phase 2 verification and report clean state.');
}

diagnose().catch(console.error);
