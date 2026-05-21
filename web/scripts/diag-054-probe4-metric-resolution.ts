// DIAG-054 Probe 4: metric resolution simulation for BCL-5001 October.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const TARGET_EXT_ID = 'BCL-5003'; // has transactional data; BCL-5001 is manager-only
const OCT_SOURCE_DATE = '2025-10-01'; // committed_data filters by source_date (period_id is null at import)

function extractRefs(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const refs = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.prime === 'reference' && typeof o.field === 'string') { refs.add(o.field); return; }
    if (o.prime === 'aggregate' && typeof o.field === 'string') { refs.add(o.field); return; }
    if (Array.isArray(o.inputs)) for (const c of o.inputs as unknown[]) walk(c);
    if (o.downstream) walk(o.downstream);
    if (o.condition) walk(o.condition);
    if (o.then) walk(o.then);
    if (o.else) walk(o.else);
  };
  walk(node);
  return Array.from(refs);
}

(async () => {
  // Find entity
  const { data: entity } = await sb
    .from('entities')
    .select('id, external_id, display_name, metadata')
    .eq('tenant_id', BCL)
    .eq('external_id', TARGET_EXT_ID)
    .maybeSingle();
  if (!entity) { console.log(`Entity ${TARGET_EXT_ID} not found`); return; }

  console.log('=== DIAG-054 Probe 4: BCL-5001 metric resolution ===');
  console.log(`Entity: ${entity.external_id} "${entity.display_name}" id=${entity.id}`);
  console.log(`Metadata: ${JSON.stringify(entity.metadata)}\n`);

  // Pull all October committed_data rows (period_id is null at import — engine binds by source_date)
  const { data: rowsByExt } = await sb
    .from('committed_data')
    .select('row_data, data_type, source_date, entity_id')
    .eq('tenant_id', BCL)
    .eq('source_date', OCT_SOURCE_DATE);
  console.log(`committed_data rows with source_date=${OCT_SOURCE_DATE}: ${rowsByExt?.length ?? 0}`);

  // Filter for this entity in row_data
  const myRows = (rowsByExt ?? []).filter(r => {
    const rd = r.row_data as Record<string, unknown> | null;
    if (!rd) return false;
    const eid = rd.ID_Empleado ?? rd.id_empleado ?? rd.entity_id;
    return String(eid).trim() === TARGET_EXT_ID;
  });
  console.log(`October rows matching ${TARGET_EXT_ID}: ${myRows.length}\n`);

  if (myRows.length === 0) {
    console.log('No rows. Cannot simulate metric resolution.');
    return;
  }

  console.log('--- Raw row_data for matched rows ---');
  for (const r of myRows) {
    console.log(`data_type=${r.data_type} entity_id=${r.entity_id}`);
    console.log(JSON.stringify(r.row_data, null, 2));
  }
  console.log();

  // Get bindings
  const { data: allRs } = await sb
    .from('rule_sets')
    .select('id, components, input_bindings, updated_at')
    .eq('tenant_id', BCL)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  if (!allRs || allRs.length === 0) { console.log('NO ACTIVE BCL RULE SET'); return; }
  const rs = allRs[0];
  const ib = rs.input_bindings as Record<string, unknown>;
  const convBindings = (ib.convergence_bindings ?? {}) as Record<string, Record<string, unknown>>;

  // Flatten components
  const flat: Array<{ idx: number; name: string; intent?: unknown }> = [];
  const comps = rs.components as Record<string, unknown>;
  if (Array.isArray(comps.variants)) {
    let i = 0;
    for (const v of comps.variants as Array<Record<string, unknown>>) {
      if (Array.isArray(v.components)) {
        for (const c of v.components as Array<Record<string, unknown>>) {
          flat.push({ idx: i, name: String(c.name), intent: c.calculationIntent });
          i++;
        }
      }
    }
  }

  // For each component, simulate metric resolution
  for (const c of flat) {
    console.log(`────────────────────────────────────────`);
    console.log(`Component ${c.idx}: "${c.name}"`);
    const binding = convBindings[`component_${c.idx}`] as Record<string, Record<string, unknown>> | undefined;
    if (!binding) { console.log('  no bindings'); continue; }
    const refs = extractRefs(c.intent);
    console.log(`  DAG references: [${refs.join(', ')}]`);

    const metrics: Record<string, number> = {};
    for (const field of refs) {
      const fb = binding[field] as Record<string, unknown> | undefined;
      if (!fb?.column) {
        console.log(`  ${field}: ⚠ NO binding.column`);
        continue;
      }
      const column = String(fb.column);
      const scale = fb.scale_factor as number | undefined;

      // Find raw value: scan myRows for a row that has this column
      let raw: number | null = null;
      let foundIn = '';
      for (const r of myRows) {
        const rd = r.row_data as Record<string, unknown> | null;
        if (!rd) continue;
        if (column in rd) {
          const v = rd[column];
          if (typeof v === 'number') { raw = v; foundIn = String(r.data_type); break; }
          if (typeof v === 'string' && !isNaN(Number(v))) { raw = Number(v); foundIn = String(r.data_type); break; }
        }
      }
      const scaled = raw === null ? null : (scale ? raw * scale : raw);
      console.log(`  ${field} → binding.column="${column}" raw=${raw} (from data_type=${foundIn}) scale=${scale ?? 'none'} scaled=${scaled}`);
      if (scaled !== null) metrics[field] = scaled;
    }
    console.log(`  → metrics map for evaluate(): ${JSON.stringify(metrics)}`);
  }
})();
