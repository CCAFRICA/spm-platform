#!/usr/bin/env npx tsx
/**
 * Verification script for HF-023 Phase 3
 * Validates all proof gates for Optica Luminar seed data
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TENANT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
let passed = 0;
let failed = 0;

function gate(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}: ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}: ${detail}`);
  }
}

async function main() {
  console.log('=== HF-023 Phase 3: Verification ===\n');

  // G1: Tenant
  const { data: tenant } = await sb.from('tenants').select('id, name').eq('id', TENANT_ID).single();
  gate('G1 Tenant', !!tenant, tenant?.name || 'NOT FOUND');

  // G2: Auth users
  const { data: { users } } = await sb.auth.admin.listUsers();
  const olUsers = users.filter(u => u.email?.includes('opticaluminar'));
  gate('G2 Auth Users', olUsers.length === 3, `${olUsers.length} users`);

  // G3: Profiles
  const { data: profiles } = await sb.from('profiles').select('display_name, role, capabilities').eq('tenant_id', TENANT_ID);
  gate('G3 Profiles', (profiles?.length || 0) === 3, `${profiles?.length} profiles: ${profiles?.map(p => p.display_name).join(', ')}`);

  // G4: Entities
  const { data: entities } = await sb.from('entities').select('id, entity_type').eq('tenant_id', TENANT_ID);
  gate('G4 Entities', (entities?.length || 0) === 22, `${entities?.length} entities`);
  if (entities) {
    const types: Record<string, number> = {};
    for (const e of entities) {
      types[e.entity_type] = (types[e.entity_type] || 0) + 1;
    }
    console.log(`         Types: ${JSON.stringify(types)}`);
  }

  // G5: Relationships
  const { data: rels } = await sb.from('entity_relationships').select('id').eq('tenant_id', TENANT_ID);
  gate('G5 Relationships', (rels?.length || 0) >= 21, `${rels?.length} relationships`);

  // G6: Rule set
  const { data: rs } = await sb.from('rule_sets').select('id, name, components').eq('tenant_id', TENANT_ID);
  const compCount = Array.isArray(rs?.[0]?.components) ? (rs[0].components as unknown[]).length : 0;
  gate('G6 Rule Set', (rs?.length || 0) === 1 && compCount === 6, `${rs?.[0]?.name} with ${compCount} components`);

  // G7: Assignments
  const { data: assignments } = await sb.from('rule_set_assignments').select('id').eq('tenant_id', TENANT_ID);
  gate('G7 Assignments', (assignments?.length || 0) === 12, `${assignments?.length} assignments`);

  // G8: Period
  const { data: period } = await sb.from('periods').select('label, status').eq('tenant_id', TENANT_ID);
  gate('G8 Period', (period?.length || 0) === 1, `${period?.[0]?.label} (${period?.[0]?.status})`);

  // G9: Committed data
  const { data: cd } = await sb.from('committed_data').select('id').eq('tenant_id', TENANT_ID);
  gate('G9 Committed Data', (cd?.length || 0) >= 18, `${cd?.length} rows`);

  // G10: Calculation batch
  const { data: batch } = await sb.from('calculation_batches').select('lifecycle_state').eq('tenant_id', TENANT_ID);
  gate('G10 Calc Batch', batch?.[0]?.lifecycle_state === 'APPROVED', `${batch?.[0]?.lifecycle_state}`);

  // G11: Calculation results
  const { data: results } = await sb.from('calculation_results').select('id').eq('tenant_id', TENANT_ID);
  gate('G11 Calc Results', (results?.length || 0) === 12, `${results?.length} results`);

  // G12: Entity period outcomes
  const { data: outcomes } = await sb.from('entity_period_outcomes').select('id').eq('tenant_id', TENANT_ID);
  gate('G12 Outcomes', (outcomes?.length || 0) === 12, `${outcomes?.length} outcomes`);

  // G13: Platform admin (capabilities is JSONB array, use @> operator via .contains with JSON)
  const { data: platformAdmin } = await sb.from('profiles').select('display_name, capabilities').contains('capabilities', '["manage_tenants"]' as unknown as string[]);
  gate('G13 Platform Admin', (platformAdmin?.length || 0) > 0, `${platformAdmin?.map(p => p.display_name).join(', ')}`);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
