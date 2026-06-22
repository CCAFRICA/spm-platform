/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OB-228 Phase 5 proof — Confidence Topology (③) + Provenance (④) against LIVE MIR.
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob228-phase5-proof.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getVisiblePlans, personaFromIdentity, buildPlanTopology, getProvenance, getCorrectionHistory } from '../src/lib/plan-surface';
import { resolveBindingColumns } from '../src/lib/plan-surface/binding-status';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const TID = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

async function main() {
  const scope = personaFromIdentity({ id: 'p5', tenantId: TID, role: 'admin', capabilities: ['icm.configure_plans'] }, null);
  const plans = await getVisiblePlans(TID, scope, sb);

  // precise per-column existence probe (same as the plans route)
  const allColumns = plans.flatMap((p) => p.variants.flatMap((v) => v.components.map((c) => c.binding.column)));
  const present = await resolveBindingColumns(sb, TID, allColumns);
  console.log(`  bound columns present in committed_data: ${Array.from(present).join(', ')}`);

  console.log('\n=== CONFIDENCE TOPOLOGY (Concept 3) ===');
  let totalNeedsReview = 0;
  for (const p of plans) {
    const resolved: Record<string, boolean> = {};
    for (const v of p.variants) for (const c of v.components) resolved[c.id] = c.binding.column ? present.has(c.binding.column) : false;
    const topo = buildPlanTopology(p, resolved);
    totalNeedsReview += topo.needsReviewCount;
    console.log(`\n  "${p.name}" — Needs Review: ${topo.needsReviewCount} (worst=${topo.worst})`);
    for (const v of p.variants) for (const c of v.components) {
      const a = topo.components[c.id];
      console.log(`    [${a.severity.toUpperCase().padEnd(8)}] ${c.name} — bindingResolved=${a.bindingResolved} conf=${a.confidence}`);
      console.log(`        reason: ${a.reasons[0]}`);
    }
  }
  console.log(`\n  TOTAL components needing review across MIR: ${totalNeedsReview}`);

  console.log('\n=== PROVENANCE THREAD (Concept 4) ===');
  for (const p of plans) {
    for (const v of p.variants) for (const c of v.components) {
      const prov = getProvenance(c, p.confidence);
      console.log(`\n  "${c.name}"`);
      console.log(`    source note: ${prov.sourceNote ? '"' + prov.sourceNote.slice(0, 130) + (prov.sourceNote.length > 130 ? '…' : '') + '"' : '(none)'}`);
      console.log(`    method=${prov.constructionMethod} confidence=${prov.confidence} binding=${prov.binding.column ?? '∅'} (${prov.binding.matchReason})`);
      console.log(`    fieldRefs: ${prov.binding.fieldRefs.map((f) => f.field + ':' + f.via).join(', ')}`);
    }
  }

  // correction history (the Comision component edited in the Phase 4 proof should have a signal)
  console.log('\n=== CORRECTION HISTORY (classification_signals) ===');
  const comision = plans.find((p: any) => /MAYORISTA/.test(p.name))!.variants[0].components[0];
  const ruleSetId = plans.find((p: any) => /MAYORISTA/.test(p.name))!.id;
  const hist = await getCorrectionHistory(ruleSetId, comision.id, sb);
  console.log(`  "${comision.name}" corrections: ${hist.length}`);
  for (const h of hist.slice(0, 5)) console.log(`    ${h.signalType} @ ${h.at} — ${JSON.stringify(h.detail).slice(0, 120)}`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
