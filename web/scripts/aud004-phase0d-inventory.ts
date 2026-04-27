/**
 * AUD-004 Phase 0D — Signal surface inventory
 * Read-only DB queries. No mutations.
 */
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function exists(table: string): Promise<{ exists: boolean; sample?: unknown; error?: string }> {
  try {
    const { data, error, count } = await sb.from(table).select('*', { count: 'exact', head: false }).limit(1);
    if (error) return { exists: false, error: error.message };
    return { exists: true, sample: data?.[0], error: count !== null ? `total_rows=${count}` : undefined };
  } catch (e) {
    return { exists: false, error: String(e) };
  }
}

async function main() {
  console.log('=== Step 0D.1 — Schema verification (table existence + sample row) ===\n');

  const tables = [
    'classification_signals',
    'foundational_classification_signals',
    'domain_classification_signals',
    'rule_sets',
    'synaptic_density',
  ];

  for (const t of tables) {
    const r = await exists(t);
    if (r.exists) {
      console.log(`TABLE ${t}: EXISTS (${r.error ?? ''})`);
      if (r.sample) {
        console.log(`  Columns from sample row:`);
        for (const k of Object.keys(r.sample)) {
          const v = (r.sample as Record<string, unknown>)[k];
          const tname = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
          console.log(`    ${k}: ${tname}`);
        }
      } else {
        console.log(`  (no sample row available — table empty?)`);
      }
    } else {
      console.log(`TABLE ${t}: NOT EXISTS or NOT EXPOSED — error="${r.error}"`);
    }
    console.log();
  }

  console.log('\n=== Step 0D.4 — signal_type universe ===\n');

  const { data: rows, error } = await sb
    .from('classification_signals')
    .select('signal_type, tenant_id');

  if (error) {
    console.log(`ERROR: ${error.message}`);
  } else if (!rows) {
    console.log('No rows returned');
  } else {
    const byType = new Map<string, { count: number; tenants: Set<string> }>();
    for (const r of rows as Array<{ signal_type: string; tenant_id: string }>) {
      if (!byType.has(r.signal_type)) byType.set(r.signal_type, { count: 0, tenants: new Set() });
      const e = byType.get(r.signal_type)!;
      e.count++;
      e.tenants.add(r.tenant_id);
    }
    const sorted = Array.from(byType.entries()).sort((a, b) => b[1].count - a[1].count);
    console.log(`signal_type | rows | distinct_tenants`);
    console.log(`-----------|------|-----------------`);
    for (const [type, e] of sorted) {
      console.log(`${type} | ${e.count} | ${e.tenants.size}`);
    }
    console.log(`\nTotal rows: ${rows.length}, distinct signal_type: ${byType.size}`);
  }

  console.log('\n=== Step 0D.5 — Plan-comprehension signal check ===\n');

  const { data: pcRows, error: pcError } = await sb
    .from('classification_signals')
    .select('signal_type, source')
    .or(
      `signal_type.ilike.%comprehension%,signal_type.ilike.%plan_interpretation%,signal_type.ilike.%agent_activity%,source.eq.plan_interpretation`
    );

  if (pcError) {
    console.log(`ERROR: ${pcError.message}`);
  } else {
    const pcMap = new Map<string, number>();
    for (const r of (pcRows || []) as Array<{ signal_type: string; source: string | null }>) {
      const k = `signal_type='${r.signal_type}', source='${r.source ?? '(null)'}'`;
      pcMap.set(k, (pcMap.get(k) ?? 0) + 1);
    }
    if (pcMap.size === 0) {
      console.log('NO ROWS MATCHED the plan-comprehension filter.');
    } else {
      console.log(`Found ${(pcRows || []).length} rows across ${pcMap.size} (signal_type, source) pairs:`);
      for (const [k, c] of Array.from(pcMap.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${k} -> ${c} rows`);
      }
    }
  }

  console.log('\n=== Step 0D.6 — Seeds path inventory (rule_sets) ===\n');

  const { data: rsRows, error: rsError } = await sb
    .from('rule_sets')
    .select('id, name, status, input_bindings, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);

  if (rsError) {
    console.log(`ERROR: ${rsError.message}`);
  } else {
    console.log(`Active rule_sets returned: ${(rsRows || []).length}`);
    let withSeeds = 0;
    let seedShapes = new Map<string, number>();
    for (const r of (rsRows || []) as Array<{ id: string; name: string; status: string; input_bindings: Record<string, unknown> | null; created_at: string }>) {
      const ib = r.input_bindings ?? {};
      const has = 'plan_agent_seeds' in ib;
      const shape = has
        ? (Array.isArray(ib.plan_agent_seeds) ? 'array' : typeof ib.plan_agent_seeds)
        : '—';
      seedShapes.set(shape, (seedShapes.get(shape) ?? 0) + 1);
      if (has) withSeeds++;
    }
    console.log(`Rule sets with input_bindings.plan_agent_seeds present: ${withSeeds} of ${(rsRows || []).length}`);
    console.log(`Shape distribution (— = absent):`);
    for (const [s, c] of Array.from(seedShapes.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${s}: ${c}`);
    }

    console.log('\nDetailed list (id | name | status | seeds_state | seeds_shape | created_at):');
    for (const r of (rsRows || []) as Array<{ id: string; name: string; status: string; input_bindings: Record<string, unknown> | null; created_at: string }>) {
      const ib = r.input_bindings ?? {};
      const has = 'plan_agent_seeds' in ib;
      const shape = has ? (Array.isArray(ib.plan_agent_seeds) ? 'array' : typeof ib.plan_agent_seeds) : 'absent';
      console.log(`  ${r.id} | ${r.name} | ${r.status} | ${has ? 'PRESENT' : 'absent'} | ${shape} | ${r.created_at}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
