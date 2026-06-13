/**
 * DIAG-063 / E1 — temporal_adjustment execution history (READ-ONLY).
 *
 * Steps:
 *  1. Inspect ONE calculation_results row's components shape (KEYS ONLY) to
 *     learn the type-key name.
 *  2. Server-side count via PostgREST contains filter on the learned type key.
 *  3. Because temporal_adjustment is an IntentModifier discriminant (not a
 *     ComponentType), additionally page calculation_results and scan the
 *     components jsonb client-side for the string 'temporal_adjustment'
 *     anywhere in the structure (covers modifier arrays nested under
 *     metadata/intent). Coverage is stated explicitly.
 *  4. Supplementary: client-side scan of rule_sets.components for the same
 *     string — distinguishes "configured but never executed" from "never
 *     configured". Counts + UUIDs only.
 *
 * Output: counts, distinct tenant_id / period_id UUID lists, statuses only.
 * No names, no slugs, no payout values.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NEEDLE = 'temporal_adjustment';

function topLevelShape(v: unknown): string {
  if (Array.isArray(v)) return `array(len=${v.length})`;
  if (v && typeof v === 'object') return 'object';
  return typeof v;
}

async function main() {
  // ── 1. Shape inspection (keys only) ──
  const { data: sampleRows, error: sErr } = await supabase
    .from('calculation_results')
    .select('id, components')
    .limit(1);
  if (sErr) throw sErr;
  if (!sampleRows || sampleRows.length === 0) {
    console.log('calculation_results: 0 rows total — verdict trivially NEVER-EXECUTED');
    return;
  }
  const sample = sampleRows[0];
  console.log(`[1] sample row id=${sample.id}`);
  console.log(`[1] components top-level shape: ${topLevelShape(sample.components)}`);
  const comps = sample.components;
  if (Array.isArray(comps) && comps.length > 0 && comps[0] && typeof comps[0] === 'object') {
    console.log(`[1] element[0] keys: ${Object.keys(comps[0] as object).sort().join(', ')}`);
  } else if (comps && typeof comps === 'object') {
    console.log(`[1] object keys: ${Object.keys(comps as object).sort().join(', ')}`);
  }

  // ── 2. Server-side contains count on the type key ──
  // (key name confirmed from step 1 output; both common spellings counted)
  for (const typeKey of ['type', 'componentType']) {
    const { count, error } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .contains('components', JSON.stringify([{ [typeKey]: NEEDLE }]));
    if (error) {
      console.log(`[2] contains([{${typeKey}: '${NEEDLE}'}]) -> ERROR: ${error.message}`);
    } else {
      console.log(`[2] contains([{${typeKey}: '${NEEDLE}'}]) -> count=${count}`);
    }
  }

  // ── 3. Client-side full-string scan with paging ──
  const { count: totalCount, error: cErr } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true });
  if (cErr) throw cErr;
  console.log(`[3] calculation_results total rows: ${totalCount}`);

  const CAP = 50000; // coverage cap; stated in output
  const PAGE = 1000;
  const toScan = Math.min(totalCount ?? 0, CAP);
  let scanned = 0;
  let hits = 0;
  const hitTenants = new Set<string>();
  const hitPeriods = new Set<string>();
  const hitIds: string[] = [];

  for (let offset = 0; offset < toScan; offset += PAGE) {
    const { data, error } = await supabase
      .from('calculation_results')
      .select('id, tenant_id, period_id, components')
      .order('created_at', { ascending: false })
      .range(offset, Math.min(offset + PAGE, toScan) - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      scanned++;
      if (JSON.stringify(row.components).includes(NEEDLE)) {
        hits++;
        hitTenants.add(row.tenant_id);
        if (row.period_id) hitPeriods.add(row.period_id);
        if (hitIds.length < 20) hitIds.push(row.id);
      }
    }
  }
  console.log(`[3] client-side scan method: JSON.stringify(components).includes('${NEEDLE}')`);
  console.log(`[3] coverage: scanned ${scanned} of ${totalCount} rows (most recent first, cap ${CAP})`);
  console.log(`[3] rows containing '${NEEDLE}' anywhere in components: ${hits}`);
  console.log(`[3] distinct tenant_ids with hits: ${hitTenants.size} ${JSON.stringify([...hitTenants])}`);
  console.log(`[3] distinct period_ids with hits: ${hitPeriods.size} ${JSON.stringify([...hitPeriods])}`);
  if (hitIds.length) console.log(`[3] sample hit row ids (<=20): ${JSON.stringify(hitIds)}`);

  // ── 4. Supplementary: rule_sets configuration scan ──
  const { data: ruleSets, error: rErr } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, components');
  if (rErr) {
    console.log(`[4] rule_sets scan ERROR: ${rErr.message}`);
  } else {
    const rsHits = (ruleSets ?? []).filter(rs => JSON.stringify(rs.components).includes(NEEDLE));
    const rsTenants = new Set(rsHits.map(r => r.tenant_id));
    console.log(`[4] rule_sets total rows scanned: ${ruleSets?.length ?? 0}`);
    console.log(`[4] rule_sets containing '${NEEDLE}' in components: ${rsHits.length}`);
    console.log(`[4] rule_set ids with hits: ${JSON.stringify(rsHits.map(r => r.id))}`);
    console.log(`[4] distinct tenant_ids with rule_set hits: ${rsTenants.size} ${JSON.stringify([...rsTenants])}`);
  }
}

main().catch(e => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
