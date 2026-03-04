/**
 * HF-088 Phase 0: Pre-cleanup diagnostic — full state capture
 * Run from: spm-platform/web
 * Command: set -a && source .env.local && set +a && npx tsx scripts/hf088-diagnostic.ts
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OPTICA_TENANT = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LAB_TENANT = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function run() {
  console.log('========================================');
  console.log('HF-088 PHASE 0: PRE-CLEANUP DIAGNOSTIC');
  console.log('========================================\n');

  // 1. VL Admin profile state
  console.log('--- 1. VL ADMIN PROFILE STATE ---');
  const { data: vlProfiles } = await sb
    .from('profiles')
    .select('id, tenant_id, email, role, display_name, created_at')
    .eq('email', 'platform@vialuce.com');

  const platformProfiles = vlProfiles?.filter(p => p.tenant_id === null) || [];
  const tenantProfiles = vlProfiles?.filter(p => p.tenant_id !== null) || [];

  console.log(`Total VL Admin profiles: ${vlProfiles?.length ?? 0}`);
  console.log(`  Platform-level (tenant_id IS NULL) — KEEP: ${platformProfiles.length}`);
  console.log(`  Tenant-scoped (tenant_id IS NOT NULL) — HF-086 DAMAGE: ${tenantProfiles.length}`);
  for (const p of tenantProfiles) {
    console.log(`    - ${p.id} tenant=${p.tenant_id} role=${p.role} created=${p.created_at}`);
  }

  // 2. Óptica Engine Contract — all 7 values
  console.log('\n--- 2. OPTICA ENGINE CONTRACT ---');
  const { count: ruleSetCount } = await sb.from('rule_sets')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);

  // Component count
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, status, components, created_at')
    .eq('tenant_id', OPTICA_TENANT);
  let componentCount = 0;
  for (const rs of ruleSets || []) {
    const comps = rs.components;
    if (Array.isArray(comps)) componentCount += comps.length;
    else if (comps && typeof comps === 'object') {
      const c = (comps as Record<string, unknown>).components;
      if (Array.isArray(c)) componentCount += c.length;
    }
  }
  console.log(`Rule sets: ${ruleSetCount} (${componentCount} components)`);
  for (const rs of ruleSets || []) {
    console.log(`  - ${rs.id.substring(0, 8)}... name="${rs.name}" status=${rs.status} created=${rs.created_at}`);
  }

  const { count: entityCount } = await sb.from('entities')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Entities: ${entityCount}`);

  const { count: periodCount } = await sb.from('periods')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Periods: ${periodCount}`);

  const { count: cdTotal } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  const { count: cdBound } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT).not('entity_id', 'is', null);
  const { count: cdSourceDate } = await sb.from('committed_data')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT).not('source_date', 'is', null);
  console.log(`Committed data: ${cdTotal} total, ${cdBound} entity-bound, ${cdSourceDate} with source_date`);

  const { count: assignmentCount } = await sb.from('rule_set_assignments')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Assignments: ${assignmentCount}`);

  const { count: resultCount } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Calculation results: ${resultCount}`);

  const { count: batchCount } = await sb.from('calculation_batches')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Calculation batches: ${batchCount}`);

  const { count: epoCount } = await sb.from('entity_period_outcomes')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', OPTICA_TENANT);
  console.log(`Entity period outcomes: ${epoCount}`);

  // 3. Unique entity identifiers
  console.log('\n--- 3. UNIQUE ENTITY IDENTIFIERS ---');
  const extIds = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await sb.from('entities')
      .select('external_id')
      .eq('tenant_id', OPTICA_TENANT)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const e of data) {
      if (e.external_id) extIds.add(e.external_id);
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Total entity rows: ${entityCount}`);
  console.log(`Distinct external_id values: ${extIds.size}`);
  console.log(`Inflation factor: ${entityCount && extIds.size ? (Number(entityCount) / extIds.size).toFixed(1) : 'N/A'}x`);

  // 4. Import batch count
  console.log('\n--- 4. IMPORT BATCHES ---');
  const { data: batches } = await sb.from('import_batches')
    .select('id, file_name, status, row_count, created_at')
    .eq('tenant_id', OPTICA_TENANT)
    .order('created_at', { ascending: true });
  console.log(`Import batches: ${batches?.length ?? 0}`);
  for (const b of batches || []) {
    console.log(`  - ${b.id.substring(0, 8)}... file="${b.file_name}" status=${b.status} rows=${b.row_count} created=${b.created_at}`);
  }

  // 5. LAB baseline
  console.log('\n--- 5. LAB BASELINE (Caribe Financial / latin-american-bank) ---');
  const { count: labResults } = await sb.from('calculation_results')
    .select('id', { count: 'exact', head: true }).eq('tenant_id', LAB_TENANT);

  let labTotal = 0;
  offset = 0;
  while (true) {
    const { data } = await sb.from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', LAB_TENANT)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) labTotal += Number(r.total_payout) || 0;
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Results: ${labResults}`);
  console.log(`Total payout: $${labTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  const labPass = labResults === 719 || labResults === 268;
  console.log(`Expected: 268 results, $8,498,311.77`);
  console.log(`Status: ${labResults === 268 && Math.abs(labTotal - 8498311.77) < 1 ? 'MATCH ✓' : 'MISMATCH — investigate'}`);

  // 6. Persona profiles to preserve
  console.log('\n--- 6. OPTICA PERSONA PROFILES (PRESERVE) ---');
  const { data: personaProfiles } = await sb.from('profiles')
    .select('id, email, display_name, role, tenant_id')
    .eq('tenant_id', OPTICA_TENANT)
    .neq('email', 'platform@vialuce.com');
  console.log(`Persona profiles: ${personaProfiles?.length ?? 0}`);
  for (const p of personaProfiles || []) {
    console.log(`  - ${p.display_name} (${p.email}) role=${p.role}`);
  }

  console.log('\n========================================');
  console.log('END DIAGNOSTIC');
  console.log('========================================');
}

run().catch(console.error);
