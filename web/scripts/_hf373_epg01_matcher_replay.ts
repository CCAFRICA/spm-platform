// HF-373 EPG-0.1 read-only probe: replay matchComponentsToData predicates over LIVE VLTEST2 data
// Replicates convergence-service.ts logic byte-for-byte (Pass 1 predicate :1550-1556, tokenize :4118,
// inventoryData field_identities read :1411-1419) WITHOUT calling convergeBindings (no writes, no LLM).
import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const VLTEST2 = '5b078b52-55c9-4612-8f86-96038c198bfe';
const RS = '91f822b1-186e-419b-9627-64d801fe323f';

const STOP_WORDS = new Set(['the','and','for','per','ins','cfg','q1','q2','q3','q4','2024','2025','2026','plan','program']);
function tokenize(name: string): string[] {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/[^a-z0-9]+/g, '_').split('_').filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

async function main() {
  // Reproduce inventoryData sampling (visible batches, 50 rows each)
  const { data: batchRows } = await sb.from('import_batches').select('id, superseded_by, status').eq('tenant_id', VLTEST2);
  const visible = (batchRows ?? []).filter((b: any) => b.status === 'completed' && !b.superseded_by).map((b: any) => b.id);
  console.log('visible batches:', visible.length, 'of', batchRows?.length);

  type P = { dataType: string; structuralTypes: Set<string>; natureRoles: Set<string>; cols: Set<string> };
  const partitions = new Map<string, P>();
  for (const id of visible) {
    const { data: rows } = await sb.from('committed_data').select('data_type, row_data, metadata').eq('tenant_id', VLTEST2).eq('import_batch_id', id).not('data_type', 'is', null).limit(50);
    for (const r of rows ?? []) {
      const rd = (r as any).row_data; if (!rd) continue;
      const sig = Object.keys(rd).filter(k => !k.startsWith('_')).sort().join(',');
      const pk = `${(r as any).data_type}␟${sig}`;
      if (!partitions.has(pk)) partitions.set(pk, { dataType: (r as any).data_type, structuralTypes: new Set(), natureRoles: new Set(), cols: new Set() });
      const p = partitions.get(pk)!;
      const fis = (r as any).metadata?.field_identities as Record<string, any> | undefined;
      if (fis) for (const [col, fi] of Object.entries(fis)) { p.cols.add(col); if (fi?.structuralType) p.structuralTypes.add(String(fi.structuralType)); if (fi?.natureRole) p.natureRoles.add(String(fi.natureRole)); }
    }
  }
  console.log('\npartitions:', partitions.size);
  let anyPass1 = false;
  for (const [pk, p] of partitions) {
    // EXACT Pass 1 predicate (convergence-service.ts:1551-1553)
    const hasMeasure = Array.from(p.structuralTypes).some(st => st === 'measure');
    const hasIdentifier = Array.from(p.structuralTypes).some(st => st === 'identifier');
    console.log(`\n[partition] data_type=${p.dataType} cols=${p.cols.size}`);
    console.log(`  Pass1: hasMeasure(structuralType==='measure')=${hasMeasure} hasIdentifier(structuralType==='identifier')=${hasIdentifier} -> candidate=${hasMeasure && hasIdentifier}`);
    console.log(`  structuralType values (truncated): ${Array.from(p.structuralTypes).map(s => JSON.stringify(s.slice(0, 60))).join(' | ').slice(0, 400)}`);
    console.log(`  natureRole values (bare primitives, DROPPED by reader): ${Array.from(p.natureRoles).join(', ') || '(none)'}`);
    if (hasMeasure && hasIdentifier) anyPass1 = true;
  }
  console.log('\n>>> Pass 1 structuralCandidates possible anywhere:', anyPass1);

  // Pass 3 token overlap: component names vs data_types
  const { data: rsRows } = await sb.from('rule_sets').select('components').eq('id', RS);
  const variants = (rsRows![0] as any).components.variants as any[];
  const compNames = new Set<string>();
  for (const v of variants) for (const c of v.components) compNames.add(c.name);
  const dataTypes = Array.from(new Set(Array.from(partitions.values()).map(p => p.dataType)));
  console.log('\ndata_types present:', dataTypes.join(', '));
  for (const name of compNames) {
    const compTokens = tokenize(name);
    for (const dt of dataTypes) {
      const dtTokens = tokenize(dt);
      const overlap = compTokens.filter(t => dtTokens.some(d => d.includes(t) || t.includes(d)));
      const score = overlap.length / Math.max(compTokens.length, 1);
      console.log(`  Pass3 "${name}" [${compTokens.join(',')}] vs "${dt}" [${dtTokens.join(',')}] -> overlap=[${overlap.join(',')}] score=${score}`);
    }
  }

  // extractComponents metric-mining shape scan: which keys exist anywhere in components JSON?
  const cjson = JSON.stringify((rsRows![0] as any).components);
  for (const needle of ['sourceSpec', 'tierConfig', 'calculationMethod', '"operation"', 'onTrue', 'onFalse', '"prime"', '"condition"', 'ratioInput', 'baseInput']) {
    console.log(`  components JSON contains ${needle}: ${cjson.includes(needle)}`);
  }
}
main();
