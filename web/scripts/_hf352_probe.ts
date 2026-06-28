import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NAMED_TABLES = [
  'calculation_traces',
  'calculation_results',
  'entity_period_outcomes',
  'summary_artifacts',
  'rule_set_assignments',
  'rule_sets',
  'entity_relationships',
  'entities',
  'committed_data',
  'classification_signals',
  'structural_fingerprints',
];

async function getCount(table: string, tenantId?: string): Promise<string> {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { count, error } = await q;
  if (error) return `ERROR(${error.message})`;
  return String(count ?? 0);
}

async function main() {
  console.log('========== HF-352 PROBE (READ-ONLY) ==========');
  console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('');

  console.log('========== PER-TABLE SCHEMA + COUNT ==========');
  const tableInfo: Record<string, { hasTenantId: boolean; exists: boolean; count: string }> = {};
  for (const t of NAMED_TABLES) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    if (error) {
      console.log(`\n--- ${t} ---`);
      console.log(`  EXISTS? probably NO. error: ${error.message}`);
      tableInfo[t] = { hasTenantId: false, exists: false, count: `ERROR(${error.message})` };
      continue;
    }
    const cols = data && data.length > 0 ? Object.keys(data[0]) : null;
    const count = await getCount(t);
    let hasTenantId: boolean;
    if (cols) {
      hasTenantId = cols.includes('tenant_id');
    } else {
      // empty table: probe tenant_id directly
      const { error: tErr } = await sb.from(t).select('tenant_id').limit(1);
      hasTenantId = !tErr;
    }
    tableInfo[t] = { hasTenantId, exists: true, count };
    console.log(`\n--- ${t} ---`);
    console.log(`  total row count: ${count}`);
    console.log(`  has 'tenant_id' column: ${hasTenantId}`);
    console.log(`  columns: ${cols ? JSON.stringify(cols) : '(table empty — could not derive from row; tenant_id probe=' + hasTenantId + ')'}`);
  }

  console.log('\n========== TENANTS ==========');
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id,name,slug');
  if (tErr) {
    console.log('  ERROR listing tenants:', tErr.message);
  } else {
    for (const t of tenants ?? []) {
      console.log(`  ${t.id}  |  ${t.name}  |  ${t.slug}`);
    }
  }

  // Per-tenant baselines
  const probeTenants = [
    { id: 'abb9da8d', label: 'guess Test#A1' },
    { id: '03d28288', label: 'guess Tomi Test#1' },
    { id: '972c8eb0', label: 'guess Almacenes Mirasol' },
  ];

  // Resolve full ids from listed tenants by prefix
  const resolved: { id: string; name: string }[] = [];
  for (const p of probeTenants) {
    const match = (tenants ?? []).find((t: any) => t.id.startsWith(p.id));
    if (match) resolved.push({ id: match.id, name: match.name });
  }

  // Also include any tenant whose name matches Test/Tomi/dummy/sandbox
  const disposableRe = /test|tomi|dummy|sandbox/i;
  const disposables = (tenants ?? []).filter((t: any) => disposableRe.test(t.name));
  console.log('\n========== DISPOSABLE TENANT CANDIDATES (name match Test/Tomi/dummy/sandbox) ==========');
  for (const t of disposables) {
    console.log(`  ${t.id}  |  ${t.name}  |  ${t.slug}`);
  }

  // Build the set of tenants we want per-tenant baselines for
  const baselineSet = new Map<string, string>();
  for (const r of resolved) baselineSet.set(r.id, r.name);
  for (const d of disposables) baselineSet.set(d.id, d.name);

  console.log('\n========== PER-TENANT ROW COUNTS (baselines) ==========');
  for (const [id, name] of baselineSet) {
    console.log(`\n>>> Tenant ${id} | ${name}`);
    for (const t of NAMED_TABLES) {
      if (!tableInfo[t]?.exists) {
        console.log(`    ${t}: (table missing)`);
        continue;
      }
      if (!tableInfo[t]?.hasTenantId) {
        console.log(`    ${t}: (no tenant_id column — not tenant-scoped)`);
        continue;
      }
      const c = await getCount(t, id);
      console.log(`    ${t}: ${c}`);
    }
  }

  console.log('\n========== audit_logs SHAPE ==========');
  const { data: alData, error: alErr } = await sb.from('audit_logs').select('*').limit(1);
  if (alErr) {
    console.log('  audit_logs ERROR:', alErr.message);
  } else {
    const alCols = alData && alData.length > 0 ? Object.keys(alData[0]) : null;
    const { count: alCount } = await sb.from('audit_logs').select('*', { count: 'exact', head: true });
    console.log('  row count:', alCount ?? 0);
    console.log('  columns:', alCols ? JSON.stringify(alCols) : '(empty table — no row to derive columns)');
  }

  console.log('\n========== END PROBE ==========');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
