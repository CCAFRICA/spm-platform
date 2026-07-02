// OB-257 P0 Discovery Item 4 — convergence revenue-role coverage (READ-ONLY).
// Dumps live convergence bindings (rule_sets.input_bindings) + comprehension_artifacts +
// committed_data samples for BCL and Sabor. Run: npx tsx scripts/ob257-p0-d-convergence-bindings.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function resolveSabor(): Promise<{ id: string; name: string } | null> {
  const { data, error } = await sb.from('tenants').select('id, name').ilike('name', '%sabor%');
  if (error) { console.log('SABOR_LOOKUP_ERROR:', JSON.stringify(error)); return null; }
  console.log('SABOR CANDIDATES:', JSON.stringify(data));
  return data && data.length > 0 ? data[0] : null;
}

async function dumpBindings(label: string, tenantId: string) {
  console.log(`\n========== ${label} (${tenantId}) — rule_sets.input_bindings ==========`);
  const { data: ruleSets, error } = await sb
    .from('rule_sets')
    .select('id, name, status, updated_at, input_bindings')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });
  if (error) { console.log('RS_ERROR:', JSON.stringify(error)); return; }
  console.log(`rule_sets count: ${ruleSets?.length ?? 0}`);
  for (const rs of ruleSets ?? []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    console.log(`\n--- rule_set ${rs.id} | name="${rs.name}" | status=${rs.status} | updated=${rs.updated_at}`);
    console.log(`    input_bindings keys: ${ib ? Object.keys(ib).join(', ') : 'NULL'}`);
    const cb = ib?.convergence_bindings as Record<string, Record<string, unknown>> | undefined;
    if (cb && typeof cb === 'object') {
      for (const [compKey, fields] of Object.entries(cb)) {
        console.log(`    [convergence_bindings] ${compKey}:`);
        for (const [field, b] of Object.entries(fields as Record<string, unknown>)) {
          console.log(`        ${field} => ${JSON.stringify(b)}`);
        }
      }
    } else {
      console.log('    convergence_bindings: ABSENT/EMPTY');
    }
    const md = ib?.metric_derivations;
    if (Array.isArray(md) && md.length > 0) {
      console.log(`    [metric_derivations] (${md.length}):`);
      for (const d of md as Array<Record<string, unknown>>) console.log(`        ${JSON.stringify(d)}`);
    } else {
      console.log('    metric_derivations: ABSENT/EMPTY');
    }
    // any other keys, print raw (truncated)
    if (ib) {
      for (const k of Object.keys(ib)) {
        if (k === 'convergence_bindings' || k === 'metric_derivations') continue;
        console.log(`    [other key ${k}]: ${JSON.stringify(ib[k])?.slice(0, 600)}`);
      }
    }
  }
}

async function dumpComprehension(label: string, tenantId: string) {
  console.log(`\n========== ${label} — comprehension_artifacts (per-field comprehension) ==========`);
  const { data, error } = await sb
    .from('comprehension_artifacts')
    .select('field_name, data_type, structural_type, data_nature, identifies, aggregation_behavior, characterization, confidence, updated_at')
    .eq('tenant_id', tenantId)
    .order('field_name', { ascending: true })
    .limit(200);
  if (error) {
    console.log('CA_ERROR (retry w/ select *):', JSON.stringify(error));
    const { data: d2, error: e2 } = await sb.from('comprehension_artifacts').select('*').eq('tenant_id', tenantId).limit(200);
    if (e2) { console.log('CA_ERROR2:', JSON.stringify(e2)); return; }
    if (d2 && d2.length) console.log('COLUMNS:', Object.keys(d2[0]).join(', '));
    for (const r of d2 ?? []) console.log(JSON.stringify(r).slice(0, 500));
    return;
  }
  console.log(`rows: ${data?.length ?? 0}`);
  for (const r of data ?? []) {
    console.log(`  ${r.field_name} | data_type=${r.data_type ?? ''} structural=${r.structural_type ?? ''} nature=${JSON.stringify(r.data_nature)} identifies=${JSON.stringify(r.identifies)} agg=${JSON.stringify(r.aggregation_behavior)} conf=${r.confidence}`);
    if (r.characterization) console.log(`      characterization: ${String(r.characterization).slice(0, 220)}`);
  }
}

async function dumpCommittedData(label: string, tenantId: string) {
  console.log(`\n========== ${label} — committed_data sample ==========`);
  // distinct data_types + counts
  const { data: types, error: tErr } = await sb
    .from('committed_data')
    .select('data_type')
    .eq('tenant_id', tenantId)
    .limit(5000);
  if (tErr) { console.log('CD_TYPE_ERROR:', JSON.stringify(tErr)); return; }
  const counts: Record<string, number> = {};
  for (const r of types ?? []) counts[r.data_type ?? 'NULL'] = (counts[r.data_type ?? 'NULL'] ?? 0) + 1;
  console.log('data_type counts (first 5000 rows):', JSON.stringify(counts));
  for (const dt of Object.keys(counts)) {
    const { data: rows, error } = await sb
      .from('committed_data')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('data_type', dt === 'NULL' ? null : dt)
      .limit(2);
    if (error) { console.log(`CD_ROW_ERROR(${dt}):`, JSON.stringify(error)); continue; }
    for (const row of rows ?? []) {
      console.log(`\n  --- data_type=${dt} row id=${row.id}`);
      console.log(`  top-level columns: ${Object.keys(row).join(', ')}`);
      const payload = row.data ?? row.payload ?? row.row_data ?? null;
      if (payload && typeof payload === 'object') {
        console.log(`  payload keys: ${Object.keys(payload).join(', ')}`);
        console.log(`  payload sample: ${JSON.stringify(payload).slice(0, 900)}`);
      } else {
        console.log(`  payload column not found; full row: ${JSON.stringify(row).slice(0, 900)}`);
      }
    }
  }
}

async function main() {
  const { data: bclTenant } = await sb.from('tenants').select('id, name').eq('id', BCL).single();
  console.log('BCL TENANT:', JSON.stringify(bclTenant));
  const sabor = await resolveSabor();

  await dumpBindings('BCL', BCL);
  await dumpComprehension('BCL', BCL);
  await dumpCommittedData('BCL', BCL);

  if (sabor) {
    await dumpBindings('SABOR', sabor.id);
    await dumpComprehension('SABOR', sabor.id);
    await dumpCommittedData('SABOR', sabor.id);
  } else {
    console.log('\nSABOR TENANT NOT FOUND');
  }
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
