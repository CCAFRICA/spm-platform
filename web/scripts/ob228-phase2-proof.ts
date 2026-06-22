/**
 * OB-228 Phase 2 proof — exercises the plan-surface data layer against LIVE MIR.
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/ob228-phase2-proof.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getPlanStructure, getVisiblePlans, getComponentDistribution, getBaselineOutcomes, analyzeComponent, personaFromIdentity } from '../src/lib/plan-surface';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const TID = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';

async function main() {
  // persona seam (admin, unrestricted)
  const scope = personaFromIdentity({ id: 'x', tenantId: TID, role: 'admin', capabilities: ['icm.configure_plans'] }, null);
  console.log('=== PERSONA SEAM ===');
  console.log(`  persona=${scope.persona} isAdmin=${scope.isAdmin} canEdit=${scope.canEdit} unrestricted=${scope.unrestricted}`);

  const plans = await getVisiblePlans(TID, scope, sb);
  console.log(`\n=== getVisiblePlans → ${plans.length} plans ===`);
  for (const p of plans) {
    console.log(`  "${p.name}" v${p.version} status=${p.status} variants=${p.variants.length} components=${p.componentCount} conf=${p.confidence} shapeUnrecognized=${p.shapeUnrecognized}`);
    for (const v of p.variants) {
      for (const c of v.components) {
        const view = analyzeComponent(c);
        console.log(`    • [${c.componentType}] "${c.name}" isKnownType=${c.isKnownType} bind=${c.binding.column ?? '∅'}`);
        console.log(`        view.shape=${view.shape} summary="${view.summary}"`);
        console.log(`        measure=${view.measureField}(${view.measureVia}) scope=${view.scopeBoundary} breaks=${JSON.stringify(view.breaks)} bandRef=${view.bandReferenceField} clawback=${view.isClawback}`);
        console.log(`        steps=${view.steps.map((s) => s.kind + ':' + s.label).join(' | ')}`);
      }
    }
  }

  // distribution proof: pick the wholesale plan (resolves) + clawback (HALT-2)
  console.log('\n=== getComponentDistribution (period: Mar 2025) ===');
  const { data: periods } = await sb.from('periods').select('id,label').eq('tenant_id', TID).order('start_date');
  const mar = periods.find((p: any) => /Mar/i.test(p.label)) ?? periods[2];
  for (const p of plans) {
    for (const v of p.variants) {
      for (const c of v.components) {
        const dist = await getComponentDistribution(p.id, c.id, mar.id, sb);
        const head = `  [${p.name.slice(0, 22)}] "${c.name.slice(0, 28)}"`;
        if (!dist.resolved) { console.log(`${head} → UNRESOLVED (HALT-2): ${dist.note}`); continue; }
        console.log(`${head} → resolved grain=${dist.grain} total=${dist.totalEntities} col=${dist.measureColumn}`);
        console.log(`      buckets: ${dist.buckets.map((b) => `${b.label}=${b.entityCount}`).join('  ')}`);
      }
    }
  }

  // baseline proof (MIR uncalculated → expect empty)
  console.log('\n=== getBaselineOutcomes (Mar 2025) ===');
  const base = await getBaselineOutcomes(plans[0].id, mar.id, sb);
  console.log(`  baseline rows for "${plans[0].name}" = ${base.length} ${base.length === 0 ? '(MIR uncalculated — consequence baseline ABSENT, HALT-4 seam)' : ''}`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
