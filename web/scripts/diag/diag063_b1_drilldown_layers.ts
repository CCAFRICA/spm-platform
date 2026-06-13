/**
 * DIAG-063 / B1 — Drill-down layer data probe (READ-ONLY)
 *
 * Verifies which "five layers of proof" layers exist as DATA:
 *   L1 total            -> calculation_results.total_payout (existence only, value never printed)
 *   L2 components       -> calculation_results.components JSONB (keys only)
 *   L3 inputs           -> components[].details keys / calculation_results.metrics key count
 *   L4 trace steps      -> calculation_traces rows + metadata.intentTraces
 *   L5 source rows      -> committed_data rows for the same entity
 *
 * CHANNEL SEPARATION: no payout values, no row_data values — counts, UUIDs,
 * booleans, key names (registry-derived), timestamps only.
 * SELECT-only via supabase-js. No language-specific data literals (Korean test).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function headCount(table: string, filters?: Record<string, string>): Promise<number | string> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filters ?? {})) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) return `ERROR: ${error.message}`;
  return count ?? 0;
}

async function main() {
  // ── Global layer-data counts ──
  console.log('── table counts (global) ──');
  for (const t of ['calculation_batches', 'calculation_results', 'calculation_traces', 'committed_data', 'entities']) {
    console.log(`${t}: ${await headCount(t)}`);
  }

  // ── Sample 3 most recent calculation_results (structure only) ──
  const { data: results, error } = await supabase
    .from('calculation_results')
    .select('id, tenant_id, batch_id, entity_id, components, metrics, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
  if (error) { console.log(`calculation_results sample ERROR: ${error.message}`); return; }

  console.log('\n── calculation_results sample (3 most recent; structure only) ──');
  for (const r of results ?? []) {
    const comps = Array.isArray(r.components) ? (r.components as Array<Record<string, unknown>>) : [];
    const firstKeys = comps.length ? Object.keys(comps[0]).sort() : [];
    const detailKeys = comps.length && comps[0].details && typeof comps[0].details === 'object'
      ? Object.keys(comps[0].details as object).sort() : [];
    const metricsKeyCount = r.metrics && typeof r.metrics === 'object' ? Object.keys(r.metrics as object).length : 0;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const intentTraces = Array.isArray(meta.intentTraces) ? (meta.intentTraces as unknown[]).length : 0;
    console.log(JSON.stringify({
      result_id: r.id,
      tenant_id: r.tenant_id,
      batch_id: r.batch_id,
      entity_id: r.entity_id,
      entity_id_is_uuid: UUID_RE.test(String(r.entity_id)),
      created_at: r.created_at,
      components_count: comps.length,
      first_component_keys: firstKeys,
      first_component_details_keys: detailKeys,
      metrics_top_level_key_count: metricsKeyCount,
      metadata_keys: Object.keys(meta).sort(),
      metadata_intentTraces_count: intentTraces,
    }, null, 2));
  }

  // ── Per-layer drill data for the most recent result's entity ──
  const probe = (results ?? [])[0];
  if (probe) {
    console.log('\n── drill-down availability for most recent result ──');
    console.log(`calculation_traces rows for result ${probe.id}: ${await headCount('calculation_traces', { result_id: probe.id })}`);
    console.log(`committed_data rows for entity ${probe.entity_id} (source-row layer): ${await headCount('committed_data', { tenant_id: probe.tenant_id, entity_id: probe.entity_id })}`);

    const { data: ent, error: entErr } = await supabase
      .from('entities')
      .select('id, external_id, created_at')
      .eq('id', probe.entity_id)
      .maybeSingle();
    if (entErr) console.log(`entities lookup ERROR: ${entErr.message}`);
    else if (!ent) console.log('entities lookup: no entities row with id = calculation_results.entity_id');
    else console.log(JSON.stringify({
      entity_row_found: true,
      entity_id: ent.id,
      external_id_is_numeric: /^\d+$/.test(String(ent.external_id ?? '')),
      external_id_equals_entity_id: String(ent.external_id ?? '') === String(ent.id),
    }));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
