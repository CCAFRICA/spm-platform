// OB-212 Prereq-2 — measure BCL componentId landscape across two periods (design the export). READ-ONLY.
// Confirms: variant spread (homogeneous?), the per-component value field, entity overlap, and which
// period pair maximizes REAL component-level deltas. Run from web/:
//   set -a && source .env.local && set +a && npx tsx scripts/ob212-bcl-recon-measure.ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const j = (v: unknown, n = 300) => { const s = JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
const short = (id: unknown) => (typeof id === 'string' ? id.slice(0, 8) : String(id));
const compVal = (c: any) => Number(c?.outputValue ?? c?.payout ?? c?.value ?? 0);
const compId = (c: any) => String(c?.id ?? c?.componentId ?? '');
const compName = (c: any) => String(c?.name ?? c?.componentName ?? c?.label ?? '');

type Row = { ext: string; total: number; comps: any[] };
async function loadBatch(batchId: string): Promise<Map<string, Row>> {
  const { data: cr } = await sb.from('calculation_results').select('entity_id, total_payout, components').eq('tenant_id', BCL).eq('batch_id', batchId);
  const ids = (cr ?? []).map((r: any) => r.entity_id);
  const extById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ents } = await sb.from('entities').select('id, external_id').in('id', ids.slice(i, i + 200));
    (ents ?? []).forEach((e: any) => extById.set(e.id, e.external_id ?? e.id));
  }
  const m = new Map<string, Row>();
  (cr ?? []).forEach((r: any) => { const ext = extById.get(r.entity_id) ?? r.entity_id; m.set(ext, { ext, total: Number(r.total_payout), comps: Array.isArray(r.components) ? r.components : [] }); });
  return m;
}

async function main() {
  console.log('================ BCL RECON MEASURE (read-only) ================');

  // batches
  const { data: batches } = await sb.from('calculation_batches').select('id, period_id, entity_count, lifecycle_state, created_at').eq('tenant_id', BCL).order('created_at', { ascending: false });
  const pids = Array.from(new Set((batches ?? []).map((b: any) => b.period_id).filter(Boolean)));
  const { data: periods } = pids.length ? await sb.from('periods').select('id, name, start_date, end_date').in('id', pids as string[]) : { data: [] } as any;
  const pname = (id: string) => (periods ?? []).find((p: any) => p.id === id)?.name ?? short(id);
  console.log('\n=== BCL batches ===');
  (batches ?? []).forEach((b: any) => console.log(`  batch=${short(b.id)} FULL=${b.id} period="${pname(b.period_id)}" entities=${b.entity_count} state=${b.lifecycle_state} ${String(b.created_at).slice(0,10)}`));

  // pick the two most-recent FULL (entity_count===85) batches as A and B
  const full = (batches ?? []).filter((b: any) => b.entity_count >= 80);
  if (full.length < 2) { console.log('  !! fewer than 2 full batches — adjust'); return; }
  const A = full[0], B = full[1];
  console.log(`\n=== chosen: Period A (expected) = ${short(A.id)} "${pname(A.period_id)}" · Period B (platform/VL) = ${short(B.id)} "${pname(B.period_id)}" ===`);
  console.log(`  A.full=${A.id}  A.period=${A.period_id}`);
  console.log(`  B.full=${B.id}  B.period=${B.period_id}`);

  const mapA = await loadBatch(A.id);
  const mapB = await loadBatch(B.id);
  console.log(`  A entities=${mapA.size} · B entities=${mapB.size}`);

  // raw component object keys (confirm value field) + sample
  const sampleComp = Array.from(mapA.values())[0]?.comps?.[0];
  console.log(`  raw component object keys: ${j(sampleComp ? Object.keys(sampleComp) : [])} · sample=${j(sampleComp, 240)}`);

  // variant spread: distinct sorted componentId-sets across A
  const idSetCount = new Map<string, number>();
  for (const r of mapA.values()) { const key = r.comps.map(compId).sort().join('|'); idSetCount.set(key, (idSetCount.get(key) ?? 0) + 1); }
  console.log(`\n=== variant spread (distinct componentId-sets across Period A entities) ===`);
  Array.from(idSetCount.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  (${n} entities) ids=[${k}]`));

  // per-entity component-delta census (A as expected/file, B as VL): same componentId in both
  const overlap = Array.from(mapA.keys()).filter((ext) => mapB.has(ext));
  console.log(`\n=== cross-period component-delta census (A=file, B=VL) · overlap=${overlap.length} entities ===`);
  let entitiesWithCompDelta = 0, totalCompCompared = 0, redC = 0, amberC = 0, exactC = 0; let falseGreenLike = 0;
  const examples: string[] = [];
  for (const ext of overlap) {
    const a = mapA.get(ext)!, b = mapB.get(ext)!;
    const bById = new Map(b.comps.map((c) => [compId(c), c]));
    let anyDelta = false; const parts: string[] = [];
    for (const ca of a.comps) {
      const cb = bById.get(compId(ca));
      const fileV = compVal(ca), vlV = cb ? compVal(cb) : 0;
      const delta = fileV - vlV; const dp = vlV !== 0 ? Math.abs(delta / vlV) : (fileV !== 0 ? 1 : 0);
      totalCompCompared++;
      if (dp === 0) exactC++; else if (dp <= 0.05) {} else if (dp <= 0.15) amberC++; else redC++;
      if (Math.abs(delta) > 0) anyDelta = true;
      parts.push(`${compName(ca)}:${fileV}vs${vlV}${cb ? '' : '(NOID)'}`);
    }
    if (anyDelta) entitiesWithCompDelta++;
    const totDp = b.total !== 0 ? Math.abs((a.total - b.total) / b.total) : 0;
    if (totDp <= 0.01 && a.comps.some((ca) => { const cb = bById.get(compId(ca)); const vlV = cb ? compVal(cb) : 0; return vlV !== 0 && Math.abs((compVal(ca) - vlV) / vlV) > 0.10; })) falseGreenLike++;
    if (examples.length < 6) examples.push(`  [${ext}] A.total=${a.total} B.total=${b.total} | ${parts.join('  ')}`);
  }
  console.log(`  entities with ≥1 component delta: ${entitiesWithCompDelta}/${overlap.length}`);
  console.log(`  component comparisons: ${totalCompCompared} · red(>15%)=${redC} amber(5-15%)=${amberC} exact=${exactC}`);
  console.log(`  false-green-like entities (total≈ but a component >10%): ${falseGreenLike}`);
  console.log('  examples:'); examples.forEach((e) => console.log(e));
  console.log('\n================ END MEASURE ================');
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
