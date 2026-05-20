// DIAG-052 Probe 6: BCL-5005 October — DAG tree per component + evaluate() result.
//
// Loads stored intents, translates each via legacyIntentToDAG, prints the
// resulting tree, and evaluates against context built from BCL-5005's
// October committed_data + entity metadata.

import { createClient } from '@supabase/supabase-js';
import { legacyIntentToDAG, componentIntentToDAG } from '../src/lib/calculation/legacy-intent-to-dag';
import { evaluate, buildEvalContext, type EntityData } from '../src/lib/calculation/intent-executor';
import { toNumber } from '../src/lib/calculation/decimal-precision';
import type { ComponentIntent } from '../src/lib/calculation/intent-types';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const BCL_TENANT = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';
const OCT_PERIOD = '46cbc230-3d7f-480b-a0e7-199c0ea333f0';
const TARGET_EXT_ID = 'BCL-5005';

function dagShape(node: unknown, depth = 0): string {
  if (!node || typeof node !== 'object') return String(node);
  const n = node as Record<string, unknown>;
  const prefix = '  '.repeat(depth);
  if (n.prime === 'arithmetic') {
    return `${prefix}arithmetic(${n.op})\n${dagShape(((n.inputs as unknown[]) ?? [])[0], depth + 1)}\n${dagShape(((n.inputs as unknown[]) ?? [])[1], depth + 1)}`;
  }
  if (n.prime === 'conditional') {
    return `${prefix}conditional\n${prefix}  if:\n${dagShape(n.condition, depth + 2)}\n${prefix}  then:\n${dagShape(n.then, depth + 2)}\n${prefix}  else:\n${dagShape(n.else, depth + 2)}`;
  }
  if (n.prime === 'compare') {
    return `${prefix}compare(${n.op})\n${dagShape(((n.inputs as unknown[]) ?? [])[0], depth + 1)}\n${dagShape(((n.inputs as unknown[]) ?? [])[1], depth + 1)}`;
  }
  if (n.prime === 'logical') {
    const arr = (n.inputs as unknown[]) ?? [];
    return `${prefix}logical(${n.op})\n${arr.map(c => dagShape(c, depth + 1)).join('\n')}`;
  }
  if (n.prime === 'filter') {
    const p = n.predicate as { field: string; operator: string; value: unknown };
    return `${prefix}filter(${p.field} ${p.operator} ${JSON.stringify(p.value)})\n${dagShape(n.downstream, depth + 1)}`;
  }
  if (n.prime === 'scope') return `${prefix}scope(${n.boundary})\n${dagShape(n.downstream, depth + 1)}`;
  if (n.prime === 'prior_period') return `${prefix}prior_period\n${dagShape(n.downstream, depth + 1)}`;
  if (n.prime === 'aggregate') return `${prefix}aggregate(${n.op}, ${n.field})`;
  if (n.prime === 'constant') return `${prefix}constant(${n.value})`;
  if (n.prime === 'reference') return `${prefix}reference(${n.field})`;
  return `${prefix}${JSON.stringify(n).slice(0, 100)}`;
}

(async () => {
  console.log('=== PROBE 6 — BCL-5005 October DAG evaluator trace ===\n');

  // Find entity
  const { data: entity } = await sb
    .from('entities')
    .select('id, external_id, display_name, metadata')
    .eq('tenant_id', BCL_TENANT)
    .eq('external_id', TARGET_EXT_ID)
    .maybeSingle();
  if (!entity) { console.error(`Entity ${TARGET_EXT_ID} not found`); process.exit(1); }
  console.log(`Entity: ${entity.external_id} (${entity.display_name}) id=${entity.id}`);
  console.log(`Metadata: ${JSON.stringify(entity.metadata)}\n`);

  // Pull committed_data for this entity in October
  const { data: rowsRaw } = await sb
    .from('committed_data')
    .select('row_data, data_type')
    .eq('tenant_id', BCL_TENANT)
    .eq('entity_id', entity.id);
  const allEntityRows = (rowsRaw ?? []).map(r => (r.row_data && typeof r.row_data === 'object' && !Array.isArray(r.row_data))
    ? r.row_data as Record<string, unknown>
    : {});
  console.log(`committed_data rows for this entity (all periods): ${allEntityRows.length}`);
  if (allEntityRows.length > 0) {
    console.log(`Sample row keys: [${Object.keys(allEntityRows[0]).join(', ')}]`);
    console.log(`Sample row: ${JSON.stringify(allEntityRows[0]).slice(0, 400)}`);
  }
  console.log();

  // Read rule set + variants
  const { data: rs } = await sb
    .from('rule_sets')
    .select('id, name, components, input_bindings')
    .eq('tenant_id', BCL_TENANT)
    .single();
  const rsComps = rs?.components as Record<string, unknown> | null;
  const variants = (rsComps?.variants ?? []) as Array<Record<string, unknown>>;

  // Determine which variant matches this entity (use role attribute)
  const entityRole = (entity.metadata as Record<string, unknown> | null)?.role
    ?? (entity.metadata as Record<string, unknown> | null)?.position
    ?? (entity.metadata as Record<string, unknown> | null)?.employee_type;
  console.log(`Entity role attribute: ${JSON.stringify(entityRole)}`);

  // Inspect variant routing
  for (let v = 0; v < variants.length; v++) {
    const vDef = variants[v];
    console.log(`\n──── VARIANT ${v}: name="${vDef.name ?? '(unnamed)'}" matchValue=${JSON.stringify(vDef.matchValue ?? vDef.routingValue ?? vDef.eligibilityCriteria)} ────`);
    const comps = (vDef.components ?? []) as Array<Record<string, unknown>>;
    let variantTotal = 0;
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i];
      const ci = comp.calculationIntent as Record<string, unknown> | undefined;
      if (!ci) { console.log(`  Component ${i} "${comp.name}": no calculationIntent`); continue; }

      // Build ComponentIntent wrapper
      const cInt: ComponentIntent = {
        componentIndex: i,
        label: String(comp.name ?? `c${i}`),
        confidence: 1,
        dataSource: { sheetClassification: '', entityScope: 'entity', requiredMetrics: [] },
        intent: ci as ComponentIntent['intent'],
        modifiers: ((ci as Record<string, unknown>).modifiers as ComponentIntent['modifiers']) ?? [],
        metadata: {},
      };

      let dag;
      try {
        dag = componentIntentToDAG(cInt).dag;
      } catch (err) {
        console.log(`  Component ${i} "${comp.name}": translation FAILED — ${(err as Error).message}`);
        continue;
      }
      console.log(`\n  ── Component ${i}: "${comp.name}" ──`);
      console.log(`  DAG tree:`);
      console.log(dagShape(dag, 1));

      // Build context with metrics drawn from row_data (token-style match against reference fields)
      // First attempt: scan rows for the named metric fields and use them directly
      const allReferencedFields = new Set<string>();
      (function collectRefs(n: unknown) {
        if (!n || typeof n !== 'object') return;
        const node = n as Record<string, unknown>;
        if (node.prime === 'reference' && typeof node.field === 'string') allReferencedFields.add(node.field);
        for (const v of Object.values(node)) {
          if (Array.isArray(v)) v.forEach(collectRefs);
          else if (typeof v === 'object') collectRefs(v);
        }
      })(dag);
      console.log(`  References used: [${Array.from(allReferencedFields).join(', ')}]`);

      const metricsForEntity: Record<string, number> = {};
      for (const row of allEntityRows) {
        for (const field of Array.from(allReferencedFields)) {
          const stripped = field.startsWith('attr:') ? field.slice(5) : field;
          if (stripped in row && typeof row[stripped] === 'number') {
            metricsForEntity[stripped] = row[stripped] as number;
          }
        }
      }
      console.log(`  Resolved metrics from row_data: ${JSON.stringify(metricsForEntity)}`);

      const entityData: EntityData = {
        entityId: entity.id,
        metrics: metricsForEntity,
        attributes: (entity.metadata as Record<string, string | number | boolean>) ?? {},
      };
      const ctx = buildEvalContext(entityData);
      try {
        const out = toNumber(evaluate(dag, ctx));
        console.log(`  → evaluate() result: ${out.toFixed(2)}`);
        variantTotal += out;
      } catch (err) {
        console.log(`  → evaluate() FAILED: ${(err as Error).message}`);
      }
    }
    console.log(`\n  VARIANT ${v} TOTAL: ${variantTotal.toFixed(2)}`);
  }

  // Also retrieve the stored calculation_results row for this entity for comparison
  console.log('\n=== Stored calculation_results comparison ===');
  const { data: stored } = await sb
    .from('calculation_results')
    .select('total_payout, components, metrics, created_at, batch_id')
    .eq('tenant_id', BCL_TENANT)
    .eq('period_id', OCT_PERIOD)
    .eq('entity_id', entity.id)
    .order('created_at', { ascending: false });
  console.log(`Stored October rows for ${TARGET_EXT_ID}: ${stored?.length ?? 0}`);
  for (const s of (stored ?? [])) {
    console.log(`  batch=${s.batch_id} ts=${s.created_at} total_payout=${s.total_payout}`);
    const comps = s.components as Array<Record<string, unknown>> | null;
    if (Array.isArray(comps)) {
      for (let i = 0; i < comps.length; i++) {
        console.log(`    c${i} "${comps[i].componentName}" type=${comps[i].componentType} payout=${comps[i].payout}`);
      }
    }
  }
})();
