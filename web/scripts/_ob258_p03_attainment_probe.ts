// OB-258 P0.3 Attainment Record Probe (read-only, service-role).
// Per-tenant counts of calculation_results, non-empty attainment counts,
// min/max total_payout, and sample attainment JSONB values (prefer non-zero).
// No writes. Run: npx tsx scripts/_ob258_p03_attainment_probe.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log('=== OB-258 P0.3 Attainment Probe ===\n');

  // 1. Full tenant list
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name');
  if (tErr) { console.error('tenants query failed:', tErr.message); process.exit(1); }
  console.log(`TENANTS (${tenants!.length}):`);
  for (const t of tenants!) console.log(`  ${t.id}  slug=${t.slug}  name=${t.name}`);

  // 2. Per-tenant calculation_results counts + attainment stats
  console.log('\nPER-TENANT calculation_results:');
  const tenantsWithRows: string[] = [];
  for (const t of tenants!) {
    const { count, error } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id);
    if (error) { console.log(`  ${t.slug}: COUNT ERROR ${error.message}`); continue; }
    if (!count) { console.log(`  ${t.slug}: 0 rows`); continue; }
    tenantsWithRows.push(t.id);

    // non-empty attainment: attainment JSONB != '{}'
    const { count: nonEmpty } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id)
      .not('attainment', 'eq', '{}');

    // non-zero attainment.overall
    const { count: nonZeroOverall } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id)
      .not('attainment->>overall', 'is', null)
      .neq('attainment->>overall', '0');

    // min / max total_payout
    const { data: minRow } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', t.id)
      .order('total_payout', { ascending: true })
      .limit(1);
    const { data: maxRow } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', t.id)
      .order('total_payout', { ascending: false })
      .limit(1);

    console.log(
      `  ${t.slug}: rows=${count} nonEmptyAttainment=${nonEmpty ?? 'ERR'} ` +
      `nonZeroOverall=${nonZeroOverall ?? 'ERR'} ` +
      `minPayout=${minRow?.[0]?.total_payout ?? 'n/a'} maxPayout=${maxRow?.[0]?.total_payout ?? 'n/a'}`
    );
  }

  // 3. Sample attainment JSONB (prefer non-zero overall)
  console.log('\nSAMPLE attainment JSONB (prefer non-zero overall):');
  const { data: nonZeroSamples, error: nzErr } = await supabase
    .from('calculation_results')
    .select('tenant_id, batch_id, entity_id, period_id, rule_set_id, total_payout, attainment')
    .not('attainment->>overall', 'is', null)
    .neq('attainment->>overall', '0')
    .limit(3);
  if (nzErr) console.log('  non-zero sample query error:', nzErr.message);

  let samples = nonZeroSamples ?? [];
  if (samples.length < 3) {
    console.log(`  (only ${samples.length} non-zero-overall rows platform-wide; padding with any rows)`);
    const { data: anySamples } = await supabase
      .from('calculation_results')
      .select('tenant_id, batch_id, entity_id, period_id, rule_set_id, total_payout, attainment')
      .order('created_at', { ascending: false })
      .limit(3 - samples.length);
    samples = samples.concat(anySamples ?? []);
  }
  const slugById = new Map(tenants!.map(t => [t.id, t.slug]));
  for (const s of samples) {
    console.log(
      `  tenant=${slugById.get(s.tenant_id) ?? s.tenant_id} batch=${s.batch_id} period=${s.period_id} ` +
      `entity=${s.entity_id} total_payout=${s.total_payout}\n    attainment=${JSON.stringify(s.attainment)}`
    );
  }

  // 4. Distinct attainment key shapes observed (sampled) + metrics keys of one row per tenant-with-rows
  console.log('\nATTAINMENT KEY SHAPES (sample up to 1000 rows platform-wide):');
  const { data: shapeRows } = await supabase
    .from('calculation_results')
    .select('attainment')
    .limit(1000);
  const shapeCounts = new Map<string, number>();
  for (const r of shapeRows ?? []) {
    const keys = r.attainment && typeof r.attainment === 'object'
      ? Object.keys(r.attainment as object).sort().join(',') || '(empty)'
      : '(null/non-object)';
    shapeCounts.set(keys, (shapeCounts.get(keys) ?? 0) + 1);
  }
  for (const [shape, n] of shapeCounts) console.log(`  keys=[${shape}] x${n}`);

  // 5. entity_period_outcomes.attainment_summary shapes (sampled)
  console.log('\nentity_period_outcomes.attainment_summary shapes (sample up to 1000):');
  const { data: epoRows, error: epoErr } = await supabase
    .from('entity_period_outcomes')
    .select('tenant_id, attainment_summary')
    .limit(1000);
  if (epoErr) console.log('  query error:', epoErr.message);
  const epoShapes = new Map<string, number>();
  for (const r of epoRows ?? []) {
    const keys = r.attainment_summary && typeof r.attainment_summary === 'object'
      ? Object.keys(r.attainment_summary as object).sort().join(',') || '(empty)'
      : '(null/non-object)';
    epoShapes.set(keys, (epoShapes.get(keys) ?? 0) + 1);
  }
  for (const [shape, n] of epoShapes) console.log(`  keys=[${shape}] x${n}`);

  // 6. One full sample row's components JSONB (structure proof) from a tenant with rows
  if (tenantsWithRows.length > 0) {
    console.log('\nSAMPLE components JSONB (one row, first tenant with rows):');
    const { data: compSample } = await supabase
      .from('calculation_results')
      .select('tenant_id, entity_id, period_id, total_payout, components, metrics, attainment')
      .eq('tenant_id', tenantsWithRows[0])
      .limit(1);
    if (compSample?.[0]) {
      const row = compSample[0];
      console.log(`  tenant=${slugById.get(row.tenant_id)} entity=${row.entity_id} period=${row.period_id} total_payout=${row.total_payout}`);
      const comps = Array.isArray(row.components) ? row.components : [];
      console.log(`  components count=${comps.length}`);
      if (comps[0]) console.log(`  components[0]=${JSON.stringify(comps[0]).slice(0, 1500)}`);
      const mkeys = row.metrics && typeof row.metrics === 'object' ? Object.keys(row.metrics as object) : [];
      console.log(`  metrics keys=[${mkeys.join(', ')}]`);
      console.log(`  attainment=${JSON.stringify(row.attainment)}`);
    }
  }

  // 7. Samples of the NON-'overall' attainment shapes (who has them, are they non-zero?)
  console.log('\nALTERNATE-SHAPE attainment samples:');
  for (const keyProbe of ['total', 'weighted_score']) {
    const { data: alt } = await supabase
      .from('calculation_results')
      .select('tenant_id, batch_id, entity_id, period_id, total_payout, attainment')
      .not(`attainment->>${keyProbe}`, 'is', null)
      .limit(2);
    for (const s of alt ?? []) {
      console.log(
        `  [has ${keyProbe}] tenant=${slugById.get(s.tenant_id) ?? s.tenant_id} batch=${s.batch_id} ` +
        `period=${s.period_id} entity=${s.entity_id} total_payout=${s.total_payout}\n    attainment=${JSON.stringify(s.attainment)}`
      );
    }
  }

  // 8. One full BCL row (non-zero payout tenant) — components + metrics + attainment
  console.log('\nSAMPLE full row (banco-cumbre-litoral, non-zero payout):');
  const { data: bclRow } = await supabase
    .from('calculation_results')
    .select('tenant_id, batch_id, entity_id, period_id, total_payout, components, metrics, attainment')
    .eq('tenant_id', 'b1c2d3e4-aaaa-bbbb-cccc-111111111111')
    .gt('total_payout', 0)
    .limit(1);
  if (bclRow?.[0]) {
    const row = bclRow[0];
    console.log(`  entity=${row.entity_id} period=${row.period_id} batch=${row.batch_id} total_payout=${row.total_payout}`);
    console.log(`  components=${JSON.stringify(row.components).slice(0, 2000)}`);
    console.log(`  metrics=${JSON.stringify(row.metrics).slice(0, 800)}`);
    console.log(`  attainment=${JSON.stringify(row.attainment)}`);
  }

  console.log('\n=== DONE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
