/**
 * HF-088 Phase 1: Clean VL Admin tenant-scoped profiles
 * Run from: spm-platform/web
 * Command: set -a && source .env.local && set +a && npx tsx scripts/hf088-clean-profiles.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('========================================');
  console.log('HF-088 PHASE 1: VL ADMIN PROFILE CLEANUP');
  console.log('========================================\n');

  // Query all VL Admin profiles
  const { data: vlProfiles, error } = await sb
    .from('profiles')
    .select('id, tenant_id, email, role, display_name')
    .eq('email', 'platform@vialuce.com');

  if (error) { console.error('Query error:', error.message); process.exit(1); }

  const platformProfiles = vlProfiles?.filter(p => p.tenant_id === null) || [];
  const tenantProfiles = vlProfiles?.filter(p => p.tenant_id !== null) || [];

  console.log(`Platform-level profiles (KEEP): ${platformProfiles.length}`);
  console.log(`Tenant-scoped profiles (DELETE): ${tenantProfiles.length}`);

  if (tenantProfiles.length > 0) {
    console.log('\nDeleting tenant-scoped profiles...');
    for (const p of tenantProfiles) {
      const { error: delErr } = await sb.from('profiles').delete().eq('id', p.id);
      if (delErr) {
        console.error(`  Failed to delete ${p.id}: ${delErr.message}`);
      } else {
        console.log(`  Deleted: ${p.id} (tenant=${p.tenant_id})`);
      }
    }
  } else {
    console.log('\nNo tenant-scoped profiles to delete. Already clean.');
  }

  // Verify final state
  console.log('\n--- VERIFICATION ---');
  const { data: remaining } = await sb
    .from('profiles')
    .select('id, tenant_id, email, role, display_name')
    .eq('email', 'platform@vialuce.com');

  const finalPlatform = remaining?.filter(p => p.tenant_id === null) || [];
  const finalTenant = remaining?.filter(p => p.tenant_id !== null) || [];

  console.log(`Platform-level profiles: ${finalPlatform.length} (expected: 1)`);
  console.log(`Tenant-scoped profiles: ${finalTenant.length} (expected: 0)`);

  const pass = finalPlatform.length === 1 && finalTenant.length === 0;
  console.log(`\nProof Gate 1: ${pass ? 'PASS' : 'FAIL'}`);
  if (finalPlatform.length === 1) {
    console.log(`  Platform profile: ${finalPlatform[0].id} role=${finalPlatform[0].role}`);
  }

  console.log('\n========================================');
  console.log('END PHASE 1');
  console.log('========================================');
}

run().catch(console.error);
