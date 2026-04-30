/**
 * Phase 4 Audit — Cluster A (G7 + G11) — Live signal-surface inspection
 *
 * Probes:
 * - S-SIGNAL-G11-01: signal-type / source distribution + cross-run aggregation evidence
 * - S-SIGNAL-G7-01: signal-type distribution across SCI agents
 * - S-CODE-G7-02 Step 2: per-JSONB-column key vocabulary inspection
 * - S-SCHEMA-G7-01: classification_signals three-level signal_type support (live row inspection)
 *
 * No tenant scoping — architectural inspection across all rows.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function section(title: string) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

async function inspectClassificationSignals() {
  section('classification_signals — full inspection (S-SIGNAL-G11-01 + S-SIGNAL-G7-01 + S-SCHEMA-G7-01)');

  const { data: signals, error } = await supabase
    .from('classification_signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.log('ERROR:', error.message);
    return;
  }

  console.log(`Total rows fetched: ${signals?.length ?? 0}`);
  if (!signals || signals.length === 0) return;

  console.log('\n--- Sample row (full structure) ---');
  console.log(JSON.stringify(signals[0], null, 2));

  console.log('\n--- All distinct top-level columns present in returned rows ---');
  const allCols = new Set<string>();
  for (const r of signals) {
    Object.keys(r as Record<string, unknown>).forEach(k => allCols.add(k));
  }
  console.log(JSON.stringify([...allCols].sort(), null, 2));

  console.log('\n--- run_id presence check (any column whose name matches /run/) ---');
  const runCols = [...allCols].filter(c => /run/i.test(c));
  console.log('Run-related columns:', runCols);
  for (const c of runCols) {
    const populated = signals.filter(r => (r as Record<string, unknown>)[c] != null).length;
    console.log(`  ${c}: ${populated}/${signals.length} rows populated`);
  }

  console.log('\n--- Distinct signal_type values + counts ---');
  const typeMap: Record<string, number> = {};
  for (const r of signals) {
    const t = (r as Record<string, unknown>).signal_type as string;
    typeMap[t] = (typeMap[t] ?? 0) + 1;
  }
  console.log(JSON.stringify(typeMap, null, 2));

  console.log('\n--- Three-level signal_type support (DS-021 / Decision 64 v2: classification: / comprehension: / convergence:) ---');
  const types = Object.keys(typeMap);
  const cls = types.filter(t => t.startsWith('classification:'));
  const com = types.filter(t => t.startsWith('comprehension:'));
  const conv = types.filter(t => t.startsWith('convergence:') || t.startsWith('convergence_'));
  const sci = types.filter(t => t.startsWith('sci:'));
  const training = types.filter(t => t.startsWith('training:'));
  const other = types.filter(t => !cls.includes(t) && !com.includes(t) && !conv.includes(t) && !sci.includes(t) && !training.includes(t));
  console.log(`classification:* prefix → ${cls.length} types: ${JSON.stringify(cls)}`);
  console.log(`comprehension:* prefix → ${com.length} types: ${JSON.stringify(com)}`);
  console.log(`convergence:* / convergence_* → ${conv.length} types: ${JSON.stringify(conv)}`);
  console.log(`sci:* prefix → ${sci.length} types: ${JSON.stringify(sci)}`);
  console.log(`training:* prefix → ${training.length} types: ${JSON.stringify(training)}`);
  console.log(`other → ${other.length} types: ${JSON.stringify(other)}`);

  console.log('\n--- Distinct source values + counts ---');
  const srcMap: Record<string, number> = {};
  for (const r of signals) {
    const s = ((r as Record<string, unknown>).source as string) ?? '<null>';
    srcMap[s] = (srcMap[s] ?? 0) + 1;
  }
  console.log(JSON.stringify(srcMap, null, 2));

  console.log('\n--- Distinct decision_source values + counts (if column exists) ---');
  const dsMap: Record<string, number> = {};
  for (const r of signals) {
    const ds = ((r as Record<string, unknown>).decision_source as string | undefined);
    const key = ds === undefined ? '<column-absent>' : ds === null ? '<null>' : ds;
    dsMap[key] = (dsMap[key] ?? 0) + 1;
  }
  console.log(JSON.stringify(dsMap, null, 2));

  console.log('\n--- signal_value JSONB top-level keys (S-CODE-G7-02 Step 2) ---');
  const svKeys = new Set<string>();
  for (const r of signals) {
    const sv = (r as Record<string, unknown>).signal_value as Record<string, unknown> | null;
    if (sv && typeof sv === 'object') Object.keys(sv).forEach(k => svKeys.add(k));
  }
  console.log(JSON.stringify([...svKeys].sort(), null, 2));

  console.log('\n--- context JSONB top-level keys (S-CODE-G7-02 Step 2) ---');
  const ctxKeys = new Set<string>();
  for (const r of signals) {
    const c = (r as Record<string, unknown>).context as Record<string, unknown> | null;
    if (c && typeof c === 'object') Object.keys(c).forEach(k => ctxKeys.add(k));
  }
  console.log(JSON.stringify([...ctxKeys].sort(), null, 2));

  console.log('\n--- Per-tenant row distribution ---');
  const tenants: Record<string, number> = {};
  for (const r of signals) {
    const t = (r as Record<string, unknown>).tenant_id as string;
    tenants[t] = (tenants[t] ?? 0) + 1;
  }
  console.log(JSON.stringify(tenants, null, 2));
}

async function inspectJsonbColumn(table: string, col: string, label?: string) {
  const tag = label ?? `${table}.${col}`;
  console.log(`\n--- ${tag} ---`);
  const { data, error } = await supabase
    .from(table)
    .select(col)
    .not(col, 'is', null)
    .limit(50);
  if (error) {
    console.log(`ERROR (${tag}): ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`${tag}: no populated rows (limit 50)`);
    return;
  }
  const keys = new Set<string>();
  let arrayCount = 0;
  let objectCount = 0;
  for (const r of data) {
    const v = (r as Record<string, unknown>)[col];
    if (Array.isArray(v)) {
      arrayCount++;
      // For arrays, look at first element's keys if objects
      if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
        Object.keys(v[0] as Record<string, unknown>).forEach(k => keys.add(`[].${k}`));
      }
    } else if (v && typeof v === 'object') {
      objectCount++;
      Object.keys(v as Record<string, unknown>).forEach(k => keys.add(k));
    }
  }
  console.log(`${tag}: rows=${data.length}, arrays=${arrayCount}, objects=${objectCount}`);
  console.log(`top-level keys: ${JSON.stringify([...keys].sort())}`);
}

async function inspectPrivateSignalChannels() {
  section('Candidate private signal channels (S-CODE-G7-02 Step 1+2)');

  // synaptic_density.learned_behaviors (run-to-run learned state)
  await inspectJsonbColumn('synaptic_density', 'learned_behaviors');

  // foundational_patterns.learned_behaviors (cross-tenant aggregated learning)
  await inspectJsonbColumn('foundational_patterns', 'learned_behaviors');

  // domain_patterns.learned_behaviors
  await inspectJsonbColumn('domain_patterns', 'learned_behaviors');

  // structural_fingerprints.classification_result + column_roles (run-to-run reuse)
  await inspectJsonbColumn('structural_fingerprints', 'classification_result');
  await inspectJsonbColumn('structural_fingerprints', 'column_roles');

  // rule_sets.input_bindings (architect-named candidate: plan_agent_seeds)
  await inspectJsonbColumn('rule_sets', 'input_bindings');
  await inspectJsonbColumn('rule_sets', 'components');
  await inspectJsonbColumn('rule_sets', 'metadata');

  // committed_data.metadata (semantic role transport)
  await inspectJsonbColumn('committed_data', 'metadata');

  // calculation_results.metrics, .attainment, .components, .metadata
  await inspectJsonbColumn('calculation_results', 'metrics');
  await inspectJsonbColumn('calculation_results', 'metadata');

  // calculation_traces — likely contains agent intent transport
  await inspectJsonbColumn('calculation_traces', 'inputs');
  await inspectJsonbColumn('calculation_traces', 'output');
  await inspectJsonbColumn('calculation_traces', 'steps');

  // entity_period_outcomes.metadata
  await inspectJsonbColumn('entity_period_outcomes', 'metadata');

  // import_batches.metadata + error_summary
  await inspectJsonbColumn('import_batches', 'metadata');
  await inspectJsonbColumn('import_batches', 'error_summary');

  // ingestion_events.classification_result, validation_result
  await inspectJsonbColumn('ingestion_events', 'classification_result');
  await inspectJsonbColumn('ingestion_events', 'validation_result');

  // processing_jobs.classification_result, proposal
  await inspectJsonbColumn('processing_jobs', 'classification_result');
  await inspectJsonbColumn('processing_jobs', 'proposal');

  // tenants.settings, features (configuration not signal — for completeness)
  await inspectJsonbColumn('tenants', 'settings');
  await inspectJsonbColumn('tenants', 'features');
}

async function tableRowCounts() {
  section('Row counts (substrate state snapshot)');
  const tables = [
    'classification_signals',
    'committed_data',
    'rule_sets',
    'calculation_results',
    'calculation_traces',
    'synaptic_density',
    'foundational_patterns',
    'domain_patterns',
    'structural_fingerprints',
    'processing_jobs',
    'ingestion_events',
    'import_batches',
    'entity_period_outcomes',
    'tenants',
  ];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) console.log(`${t}: ERROR ${error.message}`);
    else console.log(`${t}: ${count ?? 0} rows`);
  }
}

async function main() {
  await tableRowCounts();
  await inspectClassificationSignals();
  await inspectPrivateSignalChannels();
  console.log('\n=== END AUDIT ===\n');
}

main().catch(e => { console.error('AUDIT FAILED:', e); process.exit(1); });
