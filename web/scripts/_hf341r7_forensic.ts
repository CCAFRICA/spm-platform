/**
 * HF-341 R7 — Evidence Gate forensic probe (READ-ONLY, paginated). Captures the
 * real domain-value reality the directive's hypotheses must be checked against.
 * Run: cd web && npx tsx scripts/_hf341r7_forensic.ts
 */
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const OUT = '/private/tmp/claude-501/-Users-AndrewAfrica-spm-platform/54eab214-5c1a-4c83-8cdc-a47a9ecadd6a/scratchpad/mir_forensic.json';
type Any = Record<string, unknown>;

async function fetchAll(table: string, sel: string): Promise<Any[]> {
  const out: Any[] = []; let from = 0; const page = 1000;
  for (;;) {
    const { data, error } = await sb.from(table).select(sel).eq('tenant_id', MIR).range(from, from + page - 1);
    if (error) { console.error(`${table} error:`, error.message); break; }
    if (!data || data.length === 0) break;
    out.push(...(data as Any[]));
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function main() {
  const dump: Any = {};

  // ── committed_data: all buckets, distinct categorical values ──
  const cd = await fetchAll('committed_data', 'id, entity_id, data_type, row_data, source_date');
  console.log(`\n=== committed_data: ${cd.length} rows total ===`);
  const byType = new Map<string, Any[]>();
  for (const r of cd) { const t = (r.data_type as string) || '_null'; (byType.get(t) ?? byType.set(t, []).get(t)!).push(r); }
  const buckets: Any[] = [];
  for (const [t, rows] of byType) {
    const sample = rows[0]?.row_data as Any | undefined;
    const cols = sample ? Object.keys(sample) : [];
    const withEid = rows.filter(r => r.entity_id != null).length;
    // distinct values for low-cardinality (categorical) columns
    const distinct: Any = {};
    for (const c of cols) {
      const vals = new Set<string>();
      for (const r of rows) { const v = (r.row_data as Any)[c]; if (v != null) vals.add(String(v)); if (vals.size > 25) break; }
      if (vals.size <= 25) distinct[c] = [...vals];
    }
    console.log(`\n  bucket '${t}': ${rows.length} rows | entity_id-set=${withEid} | cols=[${cols.join(', ')}]`);
    for (const [c, vs] of Object.entries(distinct)) console.log(`      ${c} distinct(${(vs as string[]).length}): ${JSON.stringify(vs)}`);
    buckets.push({ data_type: t, rows: rows.length, withEntityId: withEid, columns: cols, distinctCategorical: distinct, sampleRow: sample, sampleDates: rows.slice(0, 3).map(r => r.source_date) });
  }
  dump.buckets = buckets;

  // ── full convergence bindings per plan ──
  const rs = await fetchAll('rule_sets', 'id, name, input_bindings, components');
  console.log(`\n=== convergence_bindings (full) ===`);
  const planBindings: Any[] = [];
  for (const r of rs) {
    const ib = r.input_bindings as Any | null;
    const cb = (ib?.convergence_bindings as Any) ?? null;
    console.log(`\n  [${r.name}]`);
    console.log('    ' + JSON.stringify(cb, null, 2).replace(/\n/g, '\n    '));
    planBindings.push({ name: r.name, convergence_bindings: cb, metric_derivations: ib?.metric_derivations ?? null, metric_mappings: ib?.metric_mappings ?? null });
  }
  dump.planBindings = planBindings;

  // ── entities: count + distribution ──
  const ents = await fetchAll('entities', 'id, external_id, display_name, entity_type, metadata');
  console.log(`\n=== entities: ${ents.length} ===`);
  const isNum = (s: string | null) => !!s && /^\d{5,}$/.test(String(s).trim());
  const numIds = ents.filter(e => isNum(e.external_id as string));
  const nameIds = ents.filter(e => !isNum(e.external_id as string));
  console.log(`  numeric(DNI-like) external_id: ${numIds.length}`);
  console.log(`  non-numeric external_id:       ${nameIds.length}`);
  console.log(`  by entity_type: ${JSON.stringify([...ents.reduce((m, e) => m.set(String(e.entity_type), (m.get(String(e.entity_type)) ?? 0) + 1), new Map<string, number>())])}`);
  console.log(`  sample numeric:     ${numIds.slice(0, 6).map(e => `${e.external_id}(${e.display_name})`).join(' | ')}`);
  console.log(`  sample non-numeric: ${nameIds.slice(0, 6).map(e => `${e.external_id}(${e.display_name})`).join(' | ')}`);
  dump.entities = { total: ents.length, numeric: numIds.length, nonNumeric: nameIds.length, all: ents.map(e => ({ external_id: e.external_id, display_name: e.display_name, type: e.entity_type })) };

  // ── comprehension: identifies expressions for entity-id candidate fields ──
  const comp = await fetchAll('comprehension_artifacts', 'field_name, characterization, data_nature, identifies, relationships, display_label, source_import_batch_id');
  console.log(`\n=== comprehension_artifacts: ${comp.length} (entity-id candidate fields) ===`);
  const idLike = comp.filter(c => /dni|nombre|vendedor|empleado|cedula|id_/i.test(String(c.field_name)));
  for (const c of idLike) console.log(`  ${c.field_name}: identifies=${JSON.stringify(c.identifies)} nature=${JSON.stringify(c.data_nature)} char=${JSON.stringify(c.characterization)?.slice(0,80)}`);
  dump.comprehension = comp.map(c => ({ field_name: c.field_name, identifies: c.identifies, data_nature: c.data_nature, characterization: c.characterization, batch: c.source_import_batch_id }));

  writeFileSync(OUT, JSON.stringify(dump, null, 2));
  console.log(`\nFull dump → ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
