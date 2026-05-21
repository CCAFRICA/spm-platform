// HF-244 Phase 3: clean up tenants with multiple active rule_sets.
//
// For each tenant, queries rule_sets with status='active' ordered by
// created_at DESC. Keeps the most recent active row and sets all others
// to status='superseded'. Logs every change.
//
// Run from /Users/AndrewAfrica/spm-platform/web:
//   set -a && source .env.local && set +a
//   npx tsx scripts/hf244-supersede-duplicate-rulesets.ts

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface RuleSetRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  created_at: string;
}

(async () => {
  // Find all (tenant_id, count) where count > 1 for active rule_sets.
  const { data: actives, error } = await sb
    .from('rule_sets')
    .select('id, tenant_id, name, status, created_at')
    .eq('status', 'active')
    .order('tenant_id', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }

  const rows = (actives ?? []) as RuleSetRow[];
  const byTenant = new Map<string, RuleSetRow[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenant_id) ?? [];
    list.push(r);
    byTenant.set(r.tenant_id, list);
  }

  let totalSuperseded = 0;
  let tenantsFixed = 0;

  for (const [tenantId, list] of Array.from(byTenant.entries())) {
    if (list.length <= 1) continue;
    tenantsFixed += 1;
    console.log(`\n═══ Tenant ${tenantId} ═══`);
    console.log(`  Found ${list.length} active rule_sets:`);
    for (const r of list) {
      console.log(`    ${r.id} | "${r.name}" | created=${r.created_at}`);
    }
    // First entry is most recent (DESC order). Keep it; supersede the rest.
    const [keep, ...supersede] = list;
    console.log(`  Keep:       ${keep.id} (newest)`);
    for (const r of supersede) {
      const { error: updErr } = await sb
        .from('rule_sets')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (updErr) {
        console.log(`  Supersede FAILED ${r.id}: ${updErr.message}`);
        continue;
      }
      totalSuperseded += 1;
      console.log(`  Superseded: ${r.id}`);
    }
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Tenants with multi-active state: ${tenantsFixed}`);
  console.log(`Total rule_sets superseded:      ${totalSuperseded}`);
})();
