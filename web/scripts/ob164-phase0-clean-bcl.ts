#!/usr/bin/env npx tsx
/**
 * OB-164 Phase 0: Clean BCL — Remove Seeded Data
 *
 * Deletes ALL data from the BCL tenant EXCEPT:
 *   - The tenant record itself
 *   - The admin profile (admin@bancocumbre.ec)
 *   - The auth user record
 *
 * Also deletes demo auth users (fernando@, valentina@) since they'll be recreated.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob164-phase0-clean-bcl.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BCL_TENANT_ID = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const ADMIN_EMAIL = 'admin@bancocumbre.ec';
const DEMO_EMAILS = ['fernando@bancocumbre.ec', 'valentina@bancocumbre.ec'];

// Meridian / Pipeline Test Co tenant for regression check
const MERIDIAN_TENANT_ID = 'f0f0f0f0-aaaa-bbbb-cccc-dddddddddddd';

async function count(table: string, tenantId: string): Promise<number> {
  const { count: c, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) return -1;
  return c ?? 0;
}

async function deleteRows(table: string, tenantId: string): Promise<number> {
  // Count first
  const before = await count(table, tenantId);
  if (before <= 0) return 0;

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('tenant_id', tenantId);

  if (error) {
    console.error(`  ERROR deleting from ${table}: ${error.message}`);
    return 0;
  }
  return before;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 0: CLEAN BCL — Remove Seeded Data');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Phase 0A: Inventory ──────────────────────────────────────
  console.log('── Phase 0A: Current BCL Data Inventory ──\n');

  const tables = [
    'calculation_traces', 'approval_requests', 'disputes',
    'reconciliation_sessions', 'calculation_results', 'calculation_batches',
    'entity_period_outcomes', 'period_entity_state', 'committed_data',
    'classification_signals', 'alias_registry', 'reference_items',
    'reference_data', 'ingestion_events', 'ingestion_configs',
    'import_batches', 'rule_set_assignments', 'entity_relationships',
    'profile_scope', 'reassignment_events', 'entities', 'periods',
    'rule_sets', 'audit_logs', 'usage_metering', 'synaptic_density',
    'profiles',
  ];

  const inventory: Record<string, number> = {};
  for (const t of tables) {
    const c = await count(t, BCL_TENANT_ID);
    inventory[t] = c;
    if (c > 0) console.log(`  ${t}: ${c}`);
  }
  console.log();

  // ── Phase 0B: Delete in dependency order ─────────────────────
  console.log('── Phase 0B: Deleting BCL data (dependency order) ──\n');

  const deleteOrder = [
    'calculation_traces',
    'approval_requests',
    'disputes',
    'reconciliation_sessions',
    'calculation_results',
    'calculation_batches',
    'entity_period_outcomes',
    'period_entity_state',
    'committed_data',
    'classification_signals',
    'alias_registry',
    'reference_items',
    'reference_data',
    'ingestion_events',
    'ingestion_configs',
    'import_batches',
    'rule_set_assignments',
    'entity_relationships',
    'profile_scope',
    'reassignment_events',
    'entities',
    'periods',
    'rule_sets',
    'audit_logs',
    'usage_metering',
    'synaptic_density',
  ];

  let totalDeleted = 0;
  for (const t of deleteOrder) {
    const deleted = await deleteRows(t, BCL_TENANT_ID);
    if (deleted > 0) {
      console.log(`  ${t}: ${deleted} rows deleted`);
      totalDeleted += deleted;
    }
  }
  console.log(`\n  Total rows deleted: ${totalDeleted}\n`);

  // ── Phase 0C: Delete demo profiles (keep admin) ─────────────
  console.log('── Phase 0C: Delete demo profiles (keep admin) ──\n');

  // Find admin profile to preserve
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (adminProfile) {
    console.log(`  Admin profile preserved: ${adminProfile.display_name} (${adminProfile.id})`);
  }

  // Delete non-admin profiles
  const { data: otherProfiles } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .eq('tenant_id', BCL_TENANT_ID)
    .neq('email', ADMIN_EMAIL);

  if (otherProfiles && otherProfiles.length > 0) {
    for (const p of otherProfiles) {
      const { error } = await supabase.from('profiles').delete().eq('id', p.id);
      if (error) {
        console.error(`  ERROR deleting profile ${p.email}: ${error.message}`);
      } else {
        console.log(`  Deleted profile: ${p.display_name} (${p.email})`);
      }
    }
  } else {
    console.log('  No non-admin profiles to delete');
  }

  // Delete demo auth users
  console.log('\n  Cleaning demo auth users...');
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  if (allUsers?.users) {
    for (const email of DEMO_EMAILS) {
      const user = allUsers.users.find(u => u.email === email);
      if (user) {
        const { error } = await supabase.auth.admin.deleteUser(user.id);
        if (error) {
          console.error(`  ERROR deleting auth user ${email}: ${error.message}`);
        } else {
          console.log(`  Deleted auth user: ${email}`);
        }
      }
    }
  }

  // ── Phase 0D: Verify clean state ────────────────────────────
  console.log('\n── Phase 0D: Verify clean state ──\n');

  let allClean = true;
  for (const t of deleteOrder) {
    const c = await count(t, BCL_TENANT_ID);
    if (c > 0) {
      console.log(`  WARNING: ${t} still has ${c} rows`);
      allClean = false;
    }
  }

  const profileCount = await count('profiles', BCL_TENANT_ID);
  if (profileCount === 1) {
    console.log(`  profiles: 1 (admin only) ✓`);
  } else {
    console.log(`  WARNING: profiles has ${profileCount} rows (expected 1)`);
    allClean = false;
  }

  // Verify tenant still exists
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', BCL_TENANT_ID)
    .maybeSingle();

  if (tenant) {
    console.log(`  Tenant preserved: ${tenant.name} ✓`);
  } else {
    console.log('  ERROR: Tenant record missing!');
    allClean = false;
  }

  if (allClean) {
    console.log('\n  BCL CLEAN STATE VERIFIED ✓');
  } else {
    console.log('\n  WARNING: Some data remains');
  }

  // ── Phase 0E: Verify admin survives ─────────────────────────
  console.log('\n── Phase 0E: Verify admin profile ──\n');

  const { data: adminCheck } = await supabase
    .from('profiles')
    .select('id, email, display_name, role')
    .eq('tenant_id', BCL_TENANT_ID)
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (adminCheck) {
    console.log(`  ✓ Admin: ${adminCheck.display_name} (${adminCheck.email})`);
    console.log(`    Role: ${adminCheck.role}`);
    console.log(`    ID: ${adminCheck.id}`);
  } else {
    console.log('  ERROR: Admin profile not found!');
  }

  // ── Phase 0F: Verify Meridian untouched ─────────────────────
  console.log('\n── Phase 0F: Verify Meridian (Pipeline Test Co) untouched ──\n');

  const meridianChecks = [
    'entities', 'committed_data', 'rule_sets', 'calculation_results',
  ];

  for (const t of meridianChecks) {
    const c = await count(t, MERIDIAN_TENANT_ID);
    console.log(`  ${t}: ${c} rows`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  OB-164 Phase 0: COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
