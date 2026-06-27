import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { reconcileComponentLiterals } from '@/lib/intelligence/convergence-service';
import { reconcileEntityKeysByValueOverlap } from '@/lib/sci/entity-resolution';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
type Any = Record<string, unknown>;
const TENANTS = { BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111', Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79' };
async function fetchAll(t: string, s: string, tenant: string): Promise<Any[]> {
  const o: Any[] = []; let f = 0;
  for (;;) { const { data, error } = await sb.from(t).select(s).eq('tenant_id', tenant).range(f, f + 999);
    if (error) { console.error(error.message); break; } if (!data?.length) break; o.push(...(data as Any[])); if (data.length < 1000) break; f += 1000; }
  return o;
}
async function main() {
  for (const [name, tid] of Object.entries(TENANTS)) {
    console.log(`\n══════ ${name} (${tid.slice(0,8)}) NEUTRALITY ══════`);
    // (1) literal-reconciliation neutrality: build sample domain from committed_data, run over each plan's DAGs
    const cd = await fetchAll('committed_data', 'data_type, row_data', tid);
    const sampleDomain = new Map<string, Set<string>>();
    for (const r of cd.slice(0, 4000)) {
      const rd = r.row_data as Any; if (!rd) continue;
      for (const [k, v] of Object.entries(rd)) {
        if (k.startsWith('_') || typeof v !== 'string') continue;
        if (!sampleDomain.has(k)) sampleDomain.set(k, new Set());
        const s = sampleDomain.get(k)!; if (s.size < 50) s.add(v.trim());
      }
    }
    const plans = await fetchAll('rule_sets', 'id, name, components', tid);
    let totalRewrites = 0, totalFailures = 0;
    for (const p of plans) {
      const copy = JSON.parse(JSON.stringify(p.components));
      const out = await reconcileComponentLiterals(copy, sampleDomain, tid, sb);
      if (out.rewrites.length || out.failures.length) console.log(`  [${p.name}] rewrites=${JSON.stringify(out.rewrites)} failures=${out.failures.map(f=>f.value)}`);
      totalRewrites += out.rewrites.length; totalFailures += out.failures.length;
    }
    console.log(`  literal-reconciliation: ${totalRewrites} rewrite(s), ${totalFailures} failure(s) across ${plans.length} plan(s) → ${totalRewrites === 0 && totalFailures === 0 ? 'NEUTRAL ✓' : 'NOT NEUTRAL ✗'}`);

    // (2) entity-key value-overlap neutrality
    const seen = new Map<string, { dataType: string; idField: string }>();
    for (const r of cd) { /* need import_batch_id+metadata; re-query */ }
    const cd2 = await fetchAll('committed_data', 'import_batch_id, data_type, metadata', tid);
    const batchMap = new Map<string, { idColumn: string; nameColumn: string | null; attributeColumns: string[]; isEventUnit: boolean }>();
    const firstSeen = new Set<string>();
    for (const r of cd2) {
      const b = String(r.import_batch_id); if (firstSeen.has(b)) continue; firstSeen.add(b);
      const meta = r.metadata as Any; const idField = String(meta?.entity_id_field ?? ''); if (!idField) continue;
      const dt = String(r.data_type);
      batchMap.set(b, { idColumn: idField, nameColumn: null, attributeColumns: [], isEventUnit: dt === 'transaction' || dt === 'target' });
    }
    const switches = await reconcileEntityKeysByValueOverlap(sb, tid, batchMap);
    if (switches.length) for (const s of switches) console.log(`  switch: ${s.from}→${s.to} (batch ${s.batchId.slice(0,8)})`);
    console.log(`  entity-key overlap: ${switches.length} switch(es) across ${batchMap.size} batch(es) → ${switches.length === 0 ? 'NEUTRAL ✓' : 'NOT NEUTRAL ✗'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
