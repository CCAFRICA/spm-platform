// OB-200 Phase 5 verification: read calculation_results post-recalc and
// report per-component totals, per-period totals, and convergence binding
// shape so architect can paste numbers into the completion report.
//
// Run AFTER a calc has fired through the browser (BCL October + all periods;
// CRP all plans). Reads calculation_results directly via service-role.
//
// Run from /Users/AndrewAfrica/spm-platform/web:
//   set -a && source .env.local && set +a
//   npx tsx scripts/ob200-report-results.ts

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const CRP = 'e44bbcb1-2710-4880-8c7d-a1bd902720b7';

interface CalcResult {
  entity_id: string;
  period_id: string;
  component_index: number;
  outcome: number | null;
  calculation_run_id: string;
}

interface Period {
  id: string;
  start_date: string;
  end_date: string;
  label?: string | null;
}

async function reportTenant(tenantId: string, name: string): Promise<void> {
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`${name} (${tenantId})`);
  console.log(`════════════════════════════════════════════════════════════════`);

  // 1) Bindings snapshot
  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, name, status, input_bindings, components')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  console.log(`\n--- Bindings shape ---`);
  for (const rs of ruleSets ?? []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const cb = (ib && typeof ib === 'object' && ib.convergence_bindings)
      ? ib.convergence_bindings as Record<string, Record<string, unknown>>
      : {};
    const derivs = Array.isArray(ib?.metric_derivations)
      ? ib.metric_derivations as Array<Record<string, unknown>>
      : [];
    console.log(`Rule set ${rs.id} "${rs.name}": ${Object.keys(cb).length} component bindings, ${derivs.length} derivations`);
    for (const compKey of Object.keys(cb).sort()) {
      const fields = cb[compKey];
      const lines: string[] = [];
      for (const role of Object.keys(fields).sort()) {
        const fb = fields[role] as Record<string, unknown>;
        const col = fb?.column ?? '(none)';
        const scale = fb?.scale_factor ?? 'none';
        const filters = Array.isArray(fb?.filters) ? (fb.filters as unknown[]).length : 0;
        lines.push(`    ${role} → ${col} (scale=${scale}, filters=${filters})`);
      }
      console.log(`  ${compKey}:\n${lines.join('\n')}`);
    }
    if (derivs.length > 0) {
      console.log(`  derivations (first 8):`);
      for (const d of derivs.slice(0, 8)) {
        const m = d.metric;
        const op = d.operation;
        const src = d.source_field ?? '-';
        const f = Array.isArray(d.filters) ? (d.filters as unknown[]).length : 0;
        const scope = d.scope ? JSON.stringify(d.scope) : 'none';
        console.log(`    ${m}: ${op} on ${src}, ${f} filters, scope=${scope}`);
      }
    }
  }

  // 2) Periods
  const { data: periods } = await sb
    .from('periods')
    .select('id, start_date, end_date, label')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: true });
  const periodMap = new Map<string, Period>();
  for (const p of (periods as Period[] | null) ?? []) periodMap.set(p.id, p);

  // 3) Latest calc per period
  console.log(`\n--- Per-period grand totals (latest calc) ---`);
  for (const p of (periods as Period[] | null) ?? []) {
    const { data: latestRun } = await sb
      .from('calculation_results')
      .select('calculation_run_id, created_at')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const runId = latestRun?.[0]?.calculation_run_id;
    if (!runId) {
      console.log(`  ${p.label ?? p.start_date}: no calc`);
      continue;
    }
    const { data: results } = await sb
      .from('calculation_results')
      .select('entity_id, period_id, component_index, outcome')
      .eq('tenant_id', tenantId)
      .eq('period_id', p.id)
      .eq('calculation_run_id', runId);
    const rows = (results as CalcResult[] | null) ?? [];
    const total = rows.reduce((acc, r) => acc + (Number(r.outcome) || 0), 0);
    const byComp: Record<number, number> = {};
    for (const r of rows) {
      byComp[r.component_index] = (byComp[r.component_index] ?? 0) + (Number(r.outcome) || 0);
    }
    const compTotals = Object.keys(byComp).sort((a, b) => Number(a) - Number(b))
      .map(k => `c${k}=${byComp[Number(k)].toFixed(2)}`)
      .join(' ');
    console.log(`  ${p.label ?? p.start_date}: grand=$${total.toFixed(2)} | ${compTotals} | run=${runId.slice(0,8)} rows=${rows.length}`);
  }
}

(async () => {
  await reportTenant(BCL, 'BCL');
  await reportTenant(CRP, 'CRP');
})();
