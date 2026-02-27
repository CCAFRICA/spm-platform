/**
 * OB-107 Phase 5: Caribe Financial data cleanup
 * - Delete pre-2024 periods (created from HireDate on roster)
 * - Reactivate latest version of each archived plan
 */

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CARIBE_TENANT = 'fa6a48c5-56dc-416d-9b7d-9c93d4882251';

async function run() {
  // 1. Delete pre-2024 periods
  const { data: deleted, error: delErr } = await sb
    .from('periods')
    .delete()
    .eq('tenant_id', CARIBE_TENANT)
    .lt('start_date', '2024-01-01')
    .select('id, canonical_key');

  console.log('Deleted pre-2024 periods:', deleted?.length || 0, delErr?.message || '');
  if (deleted) {
    for (const p of deleted) {
      console.log('  Deleted:', p.canonical_key);
    }
  }

  // 2. Verify remaining periods
  const { data: remaining } = await sb
    .from('periods')
    .select('id, canonical_key, start_date')
    .eq('tenant_id', CARIBE_TENANT);

  console.log('Remaining periods:', remaining?.length || 0);
  if (remaining) {
    for (const p of remaining) {
      console.log('  ', p.canonical_key, p.start_date);
    }
  }

  // 3. Find latest version of each unique plan name
  const { data: rs } = await sb
    .from('rule_sets')
    .select('id, name, status, created_at')
    .eq('tenant_id', CARIBE_TENANT)
    .order('created_at', { ascending: false });

  const latestByName = new Map<string, { id: string; name: string; status: string }>();
  for (const r of rs || []) {
    if (!latestByName.has(r.name)) {
      latestByName.set(r.name, r);
    }
  }

  console.log('\nUnique plans:', latestByName.size);
  for (const [name, r] of latestByName) {
    console.log(' ', r.status, name, r.id.substring(0, 8));
  }

  // 4. Activate latest version of each plan (skip already active)
  const toActivate: Array<{ id: string; name: string }> = [];
  for (const [, r] of latestByName) {
    if (r.status !== 'active') {
      toActivate.push({ id: r.id, name: r.name });
    }
  }

  console.log('\nPlans to activate:', toActivate.length);

  for (const plan of toActivate) {
    const { error: actErr } = await sb
      .from('rule_sets')
      .update({ status: 'active' })
      .eq('id', plan.id);

    console.log('  Activated:', plan.name, plan.id.substring(0, 8), actErr?.message || 'OK');
  }

  // 5. Verify final state
  const { data: final } = await sb
    .from('rule_sets')
    .select('id, name, status')
    .eq('tenant_id', CARIBE_TENANT)
    .eq('status', 'active');

  console.log('\nActive plans after reactivation:', final?.length || 0);
  if (final) {
    for (const r of final) {
      console.log(' ', r.name, r.id.substring(0, 8));
    }
  }
}

run().catch(console.error);
