/**
 * OB-228 Phase 3 render proof — renders the canvas renderers to static HTML against
 * LIVE MIR data (Prove Don't Describe, no browser needed). Proves: every MIR component
 * renders non-empty markup via its dispatched renderer; the band tables/rates/clawback
 * appear; and an UNKNOWN componentType renders via the GenericComponentRenderer fallback
 * (the Korean-Test proof) — never errors, never empty.
 * Run from web/: set -a && source .env.local && set +a && npx tsx scripts/ob228-phase3-render-proof.ts
 */
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getVisiblePlans, analyzeComponent, personaFromIdentity, getComponentDistribution, normalizeComponent } from '../src/lib/plan-surface';
import { resolveRenderer } from '../src/components/plan-surface/renderers';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) as any;
const TID = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  const scope = personaFromIdentity({ id: 'x', tenantId: TID, role: 'admin', capabilities: ['icm.configure_plans'] }, null);
  const plans = await getVisiblePlans(TID, scope, sb);
  const { data: periods } = await sb.from('periods').select('id,label').eq('tenant_id', TID).order('start_date');
  const mar = periods.find((p: any) => /Mar/i.test(p.label)) ?? periods[2];

  console.log(`=== RENDER PROOF — ${plans.length} MIR plans, period "${mar.label}" ===\n`);
  let rendered = 0, withDist = 0;
  for (const p of plans) {
    console.log(`PLAN "${p.name}" (${p.componentCount} components)`);
    for (const v of p.variants) {
      for (const c of v.components) {
        const view = analyzeComponent(c);
        const dist = await getComponentDistribution(p.id, c.id, mar.id, sb);
        const Renderer = resolveRenderer(c.componentType);
        const html = renderToStaticMarkup(React.createElement(Renderer, { component: c, view, distribution: dist }));
        const text = strip(html);
        const ok = html.length > 0 && text.length > 0;
        if (ok) rendered++;
        if (dist.resolved) withDist++;
        console.log(`  • "${c.name}" → renderer=${Renderer.name} html=${html.length}b dist=${dist.resolved ? `resolved(${dist.totalEntities})` : 'flagged'}`);
        console.log(`      rendered text: "${text.slice(0, 150)}${text.length > 150 ? '…' : ''}"`);
      }
    }
  }

  // Korean-Test rendered proof: an UNKNOWN componentType + Hangul field → generic fallback renders it
  const unknown = normalizeComponent({ id: 'k', name: '한국어 구성요소', componentType: '미지의_유형', someConfig: { 값: 42, 율: 0.15 } }, 0);
  const KRenderer = resolveRenderer(unknown.componentType);
  const khtml = renderToStaticMarkup(React.createElement(KRenderer, { component: unknown, view: analyzeComponent(unknown), distribution: null }));
  const ktext = strip(khtml);
  console.log(`\n=== KOREAN TEST (rendered) ===`);
  console.log(`  unknown componentType "미지의_유형" → renderer=${KRenderer.name}`);
  console.log(`  html=${khtml.length}b non-empty=${khtml.length > 0}; contains Hangul name=${khtml.includes('한국어 구성요소')}`);
  console.log(`  rendered text: "${ktext.slice(0, 120)}"`);

  console.log(`\n=== SUMMARY ===`);
  console.log(`  components rendered non-empty: ${rendered}`);
  console.log(`  components with resolved live distribution: ${withDist}`);
  console.log(`  Korean-Test fallback renders unknown type: ${KRenderer.name === 'GenericComponentRenderer' && khtml.length > 0}`);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
