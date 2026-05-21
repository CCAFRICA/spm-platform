// HF-222 Phase 6.3.3 — surface verbatim recalc values for BCL + Meridian + CRP.
// NO RECONCILIATION INTERPRETATION. Verbatim only per T2-E46.

import { createClient } from '@supabase/supabase-js';

const TENANTS: Record<string, string> = {
  BCL: 'b1c2d3e4-aaaa-bbbb-cccc-111111111111',
  Meridian: '5035b1e8-0754-4527-b7ec-9f93f85e4c79',
  CRP: 'e44bbcb1-2710-4880-8c7d-a1bd902720b7',
};

const MERIDIAN_REFERENCE_EXTERNAL_ID = '70010';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: periods } = await sb.from('periods')
    .select('id, tenant_id, label, start_date')
    .in('tenant_id', Object.values(TENANTS))
    .order('start_date');
  const { data: ruleSets } = await sb.from('rule_sets')
    .select('id, name, tenant_id').in('tenant_id', Object.values(TENANTS));
  const { data: results } = await sb.from('calculation_results')
    .select('tenant_id, rule_set_id, period_id, entity_id, total_payout, components, metrics, attainment, metadata, created_at')
    .in('tenant_id', Object.values(TENANTS));
  const { data: outcomes } = await sb.from('entity_period_outcomes')
    .select('tenant_id, entity_id, period_id, total_payout, materialized_at')
    .in('tenant_id', Object.values(TENANTS));
  const { data: entities } = await sb.from('entities')
    .select('id, tenant_id, external_id, display_name')
    .in('tenant_id', Object.values(TENANTS));

  for (const [label, tid] of Object.entries(TENANTS)) {
    console.log(`\n============================================================`);
    console.log(`========== ${label} (${tid}) ==========`);
    console.log(`============================================================`);

    const tPeriods = (periods ?? []).filter(p => p.tenant_id === tid);
    const tResults = (results ?? []).filter(r => r.tenant_id === tid);
    const tOutcomes = (outcomes ?? []).filter(o => o.tenant_id === tid);
    const tEntities = (entities ?? []).filter(e => e.tenant_id === tid);
    const tRules = (ruleSets ?? []).filter(r => r.tenant_id === tid);

    console.log(`\n--- ${label} Inventory ---`);
    console.log(`rule_sets: ${tRules.length}, periods: ${tPeriods.length}, entities: ${tEntities.length}, calculation_results: ${tResults.length}, entity_period_outcomes: ${tOutcomes.length}`);

    if (tResults.length === 0) {
      console.log(`\n--- ${label}: NO CALCULATION RESULTS ---`);
      continue;
    }

    // --- Grand totals per (rule_set, period) ---
    console.log(`\n--- ${label} Grand Totals per (rule_set × period) ---`);
    const grandTotals: Record<string, { rs: string; rsName: string; p: string; pLabel: string; pStart: string; sum: number; rows: number; createdAtMin: string; createdAtMax: string }> = {};
    for (const r of tResults) {
      const key = `${r.rule_set_id}|${r.period_id}`;
      if (!grandTotals[key]) {
        const rsName = tRules.find(x => x.id === r.rule_set_id)?.name ?? '<unknown>';
        const pr = tPeriods.find(x => x.id === r.period_id);
        grandTotals[key] = {
          rs: r.rule_set_id!, rsName, p: r.period_id!,
          pLabel: pr?.label ?? '<unknown>', pStart: pr?.start_date ?? '<unknown>',
          sum: 0, rows: 0, createdAtMin: r.created_at, createdAtMax: r.created_at,
        };
      }
      grandTotals[key].sum += Number(r.total_payout ?? 0);
      grandTotals[key].rows++;
      if (r.created_at < grandTotals[key].createdAtMin) grandTotals[key].createdAtMin = r.created_at;
      if (r.created_at > grandTotals[key].createdAtMax) grandTotals[key].createdAtMax = r.created_at;
    }
    const sortedKeys = Object.keys(grandTotals).sort((a, b) => grandTotals[a].pStart.localeCompare(grandTotals[b].pStart));
    for (const k of sortedKeys) {
      const g = grandTotals[k];
      console.log(`  rule_set=${g.rsName} | period=${g.pLabel} (${g.pStart}) | grand_total=$${g.sum.toFixed(2)} | rows=${g.rows} | created_at=${g.createdAtMin}..${g.createdAtMax}`);
    }

    // --- Per-period component breakdown (aggregated) ---
    console.log(`\n--- ${label} Per-Period Component Breakdown ---`);
    const compBreakdown: Record<string, Record<string, number>> = {};
    for (const r of tResults) {
      const pLabel = tPeriods.find(x => x.id === r.period_id)?.label ?? '<unknown>';
      if (!compBreakdown[pLabel]) compBreakdown[pLabel] = {};
      const components = Array.isArray(r.components) ? r.components : [];
      for (const c of components as Array<{ componentName?: string; payout?: number }>) {
        const name = c.componentName ?? '<unnamed>';
        compBreakdown[pLabel][name] = (compBreakdown[pLabel][name] ?? 0) + Number(c.payout ?? 0);
      }
    }
    for (const pLabel of Object.keys(compBreakdown).sort()) {
      console.log(`  ${pLabel}:`);
      const total = Object.values(compBreakdown[pLabel]).reduce((a, b) => a + b, 0);
      for (const [comp, sum] of Object.entries(compBreakdown[pLabel]).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${comp}: $${sum.toFixed(2)}`);
      }
      console.log(`    [sum-of-components: $${total.toFixed(2)}]`);
    }

    // --- Per-reference-entity totals ---
    let refEntity: { id: string; external_id: string; display_name: string } | null = null;
    if (label === 'Meridian') {
      const e = tEntities.find(x => x.external_id === MERIDIAN_REFERENCE_EXTERNAL_ID);
      if (e) refEntity = { id: e.id, external_id: e.external_id, display_name: e.display_name };
    } else {
      // BCL / CRP: first entity-external-id sorted ascending that has calc results.
      const entitiesWithResults = new Set(tResults.map(r => r.entity_id));
      const candidates = tEntities
        .filter(e => entitiesWithResults.has(e.id))
        .sort((a, b) => (a.external_id ?? '').localeCompare(b.external_id ?? ''));
      if (candidates.length > 0) refEntity = { id: candidates[0].id, external_id: candidates[0].external_id, display_name: candidates[0].display_name };
    }
    console.log(`\n--- ${label} Reference Entity ---`);
    if (!refEntity) {
      console.log(`  <no reference entity available>`);
    } else {
      console.log(`  external_id=${refEntity.external_id} | display_name=${refEntity.display_name} | id=${refEntity.id}`);
      const refResults = tResults.filter(r => r.entity_id === refEntity!.id);
      for (const rr of refResults.sort((a, b) => {
        const pa = tPeriods.find(x => x.id === a.period_id)?.start_date ?? '';
        const pb = tPeriods.find(x => x.id === b.period_id)?.start_date ?? '';
        return pa.localeCompare(pb);
      })) {
        const pLabel = tPeriods.find(x => x.id === rr.period_id)?.label ?? '<unknown>';
        const rsName = tRules.find(x => x.id === rr.rule_set_id)?.name ?? '<unknown>';
        console.log(`  period=${pLabel} | rule_set=${rsName} | total_payout=$${Number(rr.total_payout ?? 0).toFixed(2)}`);
        const compsTyped = rr.components as Array<{ componentName?: string; componentId?: string; payout?: number; details?: unknown }> | null;
        if (Array.isArray(compsTyped)) {
          for (const c of compsTyped) {
            console.log(`    component=${c.componentName ?? c.componentId ?? '<unnamed>'} | payout=$${Number(c.payout ?? 0).toFixed(2)}`);
          }
        }
        console.log(`    metrics=${JSON.stringify(rr.metrics)}`);
        console.log(`    attainment=${JSON.stringify(rr.attainment)}`);
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
