/**
 * CC-UAT: CALCULATION PIPELINE TRACE — FORENSIC EVIDENCE
 *
 * Traces ONE entity through the COMPLETE calculation pipeline for every
 * plan and period. Reveals the actual processing logic at every decision
 * point — not summaries, not totals, but the exact path.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function extractComponents(components: unknown): Array<Record<string, unknown>> {
  // Handle { variants: [{ components: [...] }] } or flat array
  if (Array.isArray(components)) return components;
  if (components && typeof components === 'object') {
    const obj = components as Record<string, unknown>;
    const variants = obj.variants as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(variants) && variants[0]) {
      const inner = variants[0].components;
      if (Array.isArray(inner)) return inner;
    }
  }
  return [];
}

function extractMetricNameFromIntent(intent: any): string {
  if (!intent) return 'UNKNOWN';
  // Direct metric reference
  if (intent.metric) return intent.metric;
  // input.sourceSpec.field is how AI-generated intents reference metrics
  if (intent.input?.sourceSpec?.field) return intent.input.sourceSpec.field;
  if (intent.input?.sourceSpec?.metric) return intent.input.sourceSpec.metric;
  if (intent.input?.metric) return intent.input.metric;
  // String source with metric: prefix
  if (intent.input?.source && typeof intent.input.source === 'string') {
    const src = intent.input.source;
    if (src !== 'metric' && src !== 'ratio' && src !== 'constant') return src.replace(/^metric:/, '');
  }
  if (intent.rate?.input?.sourceSpec?.field) return intent.rate.input.sourceSpec.field;
  if (intent.rate?.input?.metric) return intent.rate.input.metric;
  // Walk nested operations
  if (intent.input?.operation) return extractMetricNameFromIntent(intent.input);
  if (intent.rate?.operation) return extractMetricNameFromIntent(intent.rate);
  if (intent.intent) return extractMetricNameFromIntent(intent.intent);
  // conditional_gate: check onTrue/onFalse
  if (intent.onTrue) return extractMetricNameFromIntent(intent.onTrue);
  if (intent.condition?.left?.sourceSpec?.field) return intent.condition.left.sourceSpec.field;
  return 'UNKNOWN';
}

function describeOperand(operand: any): string {
  if (operand === undefined) return 'UNDEFINED';
  if (operand === null) return 'NULL';
  if (typeof operand === 'number') return `${operand} (literal)`;
  if (typeof operand === 'string') return `"${operand}" (string ref)`;
  if (operand.metric) return `metric("${operand.metric}")`;
  if (operand.source) {
    if (typeof operand.source === 'string') return `source("${operand.source}")`;
    return `source(${JSON.stringify(operand.source).substring(0, 80)})`;
  }
  if (operand.sourceSpec) return `sourceSpec(${JSON.stringify(operand.sourceSpec).substring(0, 80)})`;
  if (operand.operation) return `OPERATION(${operand.operation})`;
  return JSON.stringify(operand).substring(0, 100);
}

function traceIntentExecution(intent: any, depth: number, prefix: string) {
  const indent = '  '.repeat(depth);

  if (!intent || !intent.operation) {
    if (intent?.intent?.operation) {
      traceIntentExecution(intent.intent, depth, prefix);
      return;
    }
    console.log(`${prefix}${indent}NO OPERATION`);
    return;
  }

  console.log(`${prefix}${indent}Operation: ${intent.operation}`);

  switch (intent.operation) {
    case 'scalar_multiply':
      console.log(`${prefix}${indent}  input: ${describeOperand(intent.input)}`);
      console.log(`${prefix}${indent}  rate: ${describeOperand(intent.rate)}`);
      if (intent.input?.operation) {
        console.log(`${prefix}${indent}  input is NESTED OPERATION:`);
        traceIntentExecution(intent.input, depth + 2, prefix);
      }
      if (intent.rate?.operation) {
        console.log(`${prefix}${indent}  rate is NESTED OPERATION:`);
        traceIntentExecution(intent.rate, depth + 2, prefix);
      }
      console.log(`${prefix}${indent}  -> result = input * rate`);
      break;

    case 'bounded_lookup_1d':
      console.log(`${prefix}${indent}  input: ${describeOperand(intent.input)}`);
      console.log(`${prefix}${indent}  boundaries: ${JSON.stringify(intent.boundaries)}`);
      console.log(`${prefix}${indent}  outputs: ${JSON.stringify(intent.outputs)}`);
      console.log(`${prefix}${indent}  isMarginal: ${intent.isMarginal ?? 'UNDEFINED (treated as false)'}`);
      if (intent.isMarginal) {
        console.log(`${prefix}${indent}  -> returns output[tier] * inputValue`);
      } else {
        console.log(`${prefix}${indent}  -> returns output[tier] as-is`);
      }
      break;

    case 'bounded_lookup_2d':
      console.log(`${prefix}${indent}  rowInput: ${describeOperand(intent.rowInput)}`);
      console.log(`${prefix}${indent}  colInput: ${describeOperand(intent.colInput)}`);
      console.log(`${prefix}${indent}  rowBoundaries: ${JSON.stringify(intent.rowBoundaries)}`);
      console.log(`${prefix}${indent}  colBoundaries: ${JSON.stringify(intent.colBoundaries)}`);
      break;

    case 'conditional_gate':
      console.log(`${prefix}${indent}  condition: ${JSON.stringify(intent.condition)}`);
      console.log(`${prefix}${indent}  pass: ${describeOperand(intent.pass)}`);
      console.log(`${prefix}${indent}  fail: ${describeOperand(intent.fail)}`);
      break;

    case 'ratio':
      console.log(`${prefix}${indent}  numerator: ${describeOperand(intent.numerator)}`);
      console.log(`${prefix}${indent}  denominator: ${describeOperand(intent.denominator)}`);
      break;

    default:
      console.log(`${prefix}${indent}  Full: ${JSON.stringify(intent).substring(0, 300)}`);
  }
}

function simulateDerivation(
  derivation: Record<string, unknown>,
  byType: Map<string, Array<Record<string, unknown>>>,
  prefix: string,
): number {
  const sourcePattern = (derivation.source_pattern || derivation.sourceDataType) as string;
  const operation = derivation.operation as string;
  const filters = (derivation.filters || []) as Array<Record<string, unknown>>;
  const sourceField = (derivation.source_field || derivation.sourceField) as string | undefined;

  // Find matching rows by data_type
  let matchingRows: Array<Record<string, unknown>> = [];
  for (const [dt, rows] of byType) {
    if (sourcePattern && dt.includes(sourcePattern)) {
      matchingRows = [...rows];
      break;
    }
  }

  console.log(`${prefix}  Source pattern "${sourcePattern}" -> ${matchingRows.length} candidate rows`);

  // Apply filters
  for (const filter of filters) {
    const before = matchingRows.length;
    matchingRows = matchingRows.filter(row => {
      const val = String(row[filter.field as string] ?? '');
      const target = String(filter.value ?? '');
      if (filter.operator === 'eq') return val === target || val.toLowerCase() === target.toLowerCase();
      if (filter.operator === 'neq') return val !== target;
      if (filter.operator === 'contains') return val.toLowerCase().includes(target.toLowerCase());
      return val === target;
    });
    console.log(`${prefix}  Filter ${filter.field}=${filter.value}: ${before} -> ${matchingRows.length} rows`);
  }

  if (operation === 'count') {
    console.log(`${prefix}  COUNT = ${matchingRows.length}`);
    return matchingRows.length;
  }
  if (operation === 'sum' && sourceField) {
    const sum = matchingRows.reduce((s, row) => s + (Number(row[sourceField]) || 0), 0);
    console.log(`${prefix}  SUM(${sourceField}) = ${sum}`);
    return sum;
  }

  console.log(`${prefix}  Unknown operation "${operation}" -> 0`);
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// MAIN TRACE
// ═══════════════════════════════════════════════════════════════

async function traceEntity() {
  // Find MBC tenant (mexican-bank-co)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', 'mexican-bank-co')
    .single();

  if (!tenant) {
    // Fallback: find tenant with most committed_data
    const { data: tenants } = await supabase.from('tenants').select('id, slug, name').limit(10);
    let best = { id: '', slug: '', name: '', count: 0 };
    for (const t of tenants || []) {
      const { count } = await supabase.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id);
      if ((count || 0) > best.count) best = { ...t, count: count || 0 };
    }
    if (!best.id) { console.log('No tenant with data found'); return; }
    return traceForTenant(best.id, best.slug, best.name);
  }

  return traceForTenant(tenant.id, tenant.slug, tenant.name);
}

async function traceForTenant(tenantId: string, slug: string, name: string) {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CALCULATION PIPELINE TRACE — FORENSIC EVIDENCE            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Tenant: ${slug} (${name})`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: SELECT TRACE ENTITY
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ SECTION 1: ENTITY SELECTION ━━━');

  // Find entity with most committed_data rows
  const { data: entityRows } = await supabase
    .from('committed_data')
    .select('entity_id')
    .eq('tenant_id', tenantId)
    .not('entity_id', 'is', null);

  const countMap = new Map<string, number>();
  for (const row of entityRows || []) {
    countMap.set(row.entity_id, (countMap.get(row.entity_id) || 0) + 1);
  }

  const sortedEntities = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
  if (sortedEntities.length === 0) {
    console.log('No entities with committed data found.');
    return;
  }

  const traceEntityId = sortedEntities[0][0];

  const { data: entity } = await supabase
    .from('entities')
    .select('*')
    .eq('id', traceEntityId)
    .single();

  if (!entity) {
    console.log(`Entity ${traceEntityId} not found.`);
    return;
  }

  console.log(`Selected entity: ${entity.display_name} (${entity.external_id})`);
  console.log(`  ID: ${entity.id}`);
  console.log(`  Committed data rows: ${sortedEntities[0][1]}`);
  if (entity.metadata) {
    console.log(`  Metadata: ${JSON.stringify(entity.metadata).substring(0, 200)}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: PLAN ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ SECTION 2: PLAN ASSIGNMENTS ━━━');

  const { data: assignments } = await supabase
    .from('rule_set_assignments')
    .select('rule_set_id')
    .eq('entity_id', traceEntityId)
    .eq('tenant_id', tenantId);

  const assignedRsIds = (assignments || []).map(a => a.rule_set_id);

  // Load all active rule sets for this tenant (entity may not be assigned to all)
  const { data: allRuleSets } = await supabase
    .from('rule_sets')
    .select('id, name, components, input_bindings, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // Filter to assigned ones
  const ruleSets = (allRuleSets || []).filter(rs => assignedRsIds.includes(rs.id));

  console.log(`Assigned to ${ruleSets.length} plan(s) (of ${allRuleSets?.length || 0} active):`);
  for (const rs of ruleSets) {
    const components = extractComponents(rs.components);
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = ((bindings as any)?.metric_derivations || []) as unknown[];
    console.log(`  - ${rs.name} (${rs.id.substring(0, 8)})`);
    console.log(`    Components: ${components.length}`);
    console.log(`    Derivation rules: ${derivations.length}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: PERIODS
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ SECTION 3: PERIODS ━━━');

  const { data: periods } = await supabase
    .from('periods')
    .select('id, label, canonical_key, start_date, end_date')
    .eq('tenant_id', tenantId)
    .order('start_date');

  for (const p of periods || []) {
    console.log(`  ${p.canonical_key} (${p.label}): ${p.start_date} -> ${p.end_date}  [${p.id.substring(0, 8)}]`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: PER-PLAN TRACE
  // ═══════════════════════════════════════════════════════════════

  for (const rs of ruleSets) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  PLAN: ${rs.name}`);
    console.log(`║  ID: ${rs.id}`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // 4A: Component structure
    const components = extractComponents(rs.components);

    console.log('');
    console.log('  --- COMPONENT STRUCTURE ---');
    for (let i = 0; i < components.length; i++) {
      const c = components[i] as any;
      console.log(`  [${i}] "${c.name || c.id || 'unnamed'}"`);
      console.log(`      type: ${c.type || c.componentType || 'UNDEFINED'}`);
      console.log(`      enabled: ${c.enabled === undefined ? 'UNDEFINED (treated as true)' : c.enabled}`);

      // tierConfig
      if (c.tierConfig) {
        console.log(`      tierConfig.metric: "${c.tierConfig.metric || 'UNDEFINED'}"`);
        const tiers = c.tierConfig.tiers as Array<Record<string, unknown>> | undefined;
        if (tiers) {
          const values = tiers.map((t: any) => t.value ?? t.payout ?? '?');
          console.log(`      tierConfig.tiers: ${tiers.length} tiers, values=[${values.join(', ')}]`);
        }
      } else {
        console.log(`      tierConfig: NONE`);
      }

      // calculationIntent
      if (c.calculationIntent) {
        const op = c.calculationIntent.operation || c.calculationIntent.intent?.operation || 'N/A';
        console.log(`      calculationIntent: YES (${op})`);
        console.log(`      intent: ${JSON.stringify(c.calculationIntent).substring(0, 250)}`);
      } else {
        console.log(`      calculationIntent: NO`);
      }

      // postProcessing
      if (c.postProcessing) {
        console.log(`      postProcessing: ${JSON.stringify(c.postProcessing).substring(0, 200)}`);
      }
      console.log('');
    }

    // 4B: input_bindings
    console.log('  --- INPUT_BINDINGS ---');
    const bindings = rs.input_bindings as Record<string, unknown> | null;
    const derivations = ((bindings as any)?.metric_derivations || []) as Array<Record<string, unknown>>;
    if (derivations.length === 0) {
      console.log('  EMPTY — no metric derivation rules');
    } else {
      for (const d of derivations) {
        const filters = (d.filters || []) as Array<Record<string, unknown>>;
        const filterStr = filters.map(f => `${f.field}${f.operator || '='}${f.value}`).join(' AND ');
        console.log(`  metric="${d.metric}", op=${d.operation}, source="${d.source_pattern}"${d.source_field ? ', field=' + d.source_field : ''}${filterStr ? ', WHERE ' + filterStr : ''}`);
      }
    }
    console.log('');

    // 4C: Per-period trace
    for (const period of periods || []) {
      console.log(`  --- PERIOD: ${period.canonical_key} (${period.label}) ---`);

      // 4C.1: Committed data for this entity + period
      const { data: entityData } = await supabase
        .from('committed_data')
        .select('data_type, row_data')
        .eq('tenant_id', tenantId)
        .eq('entity_id', traceEntityId)
        .eq('period_id', period.id);

      console.log(`  Committed data rows: ${entityData?.length || 0}`);

      const byType = new Map<string, Array<Record<string, unknown>>>();
      for (const row of entityData || []) {
        const rd = row.row_data as Record<string, unknown>;
        if (!byType.has(row.data_type)) byType.set(row.data_type, []);
        byType.get(row.data_type)!.push(rd);
      }

      for (const [dt, rows] of byType) {
        console.log(`    ${dt}: ${rows.length} rows`);
        if (rows.length <= 3) {
          for (const r of rows) {
            const fields = Object.entries(r)
              .filter(([k, v]) => !k.startsWith('_') && (typeof v === 'number' || (typeof v === 'string' && v.length < 40)))
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            console.log(`      ${fields.substring(0, 200)}`);
          }
        } else {
          // Summarize numeric fields
          const firstRow = rows[0];
          const numericFields = Object.entries(firstRow)
            .filter(([k, v]) => !k.startsWith('_') && typeof v === 'number')
            .map(([k]) => k);

          for (const field of numericFields.slice(0, 6)) {
            const values = rows.map(r => Number(r[field]) || 0);
            const sum = values.reduce((a, b) => a + b, 0);
            console.log(`      ${field}: SUM=${sum.toFixed(2)}, COUNT=${values.length}`);
          }
        }
      }

      // 4C.2: Metric resolution + derivation simulation
      console.log('');
      console.log('  -- METRIC RESOLUTION --');

      for (let i = 0; i < components.length; i++) {
        const c = components[i] as any;
        const intent = c.calculationIntent;

        console.log(`  Component [${i}]: "${c.name || 'unnamed'}"`);

        if (c.enabled === false) {
          console.log(`    SKIPPED: enabled === false`);
          console.log('');
          continue;
        }

        // Legacy evaluator path
        const tierMetric = c.tierConfig?.metric;
        const compType = c.type || c.componentType;
        if (tierMetric) {
          console.log(`    Legacy path: tierConfig.metric="${tierMetric}"`);
        } else {
          console.log(`    Legacy path: tierConfig.metric=UNDEFINED -> evaluator returns $0`);
        }
        if (compType) {
          console.log(`    componentType: "${compType}"`);
        } else {
          console.log(`    componentType: UNDEFINED -> no switch case -> legacy $0`);
        }

        // Intent path
        if (intent) {
          const metricName = extractMetricNameFromIntent(intent);
          console.log(`    Intent path: operation="${intent.operation || intent.intent?.operation}"`);
          console.log(`    Expected metric: "${metricName}"`);

          // Check derivation
          const matchingDeriv = derivations.find(d => d.metric === metricName);
          if (matchingDeriv) {
            console.log(`    Derivation FOUND for "${metricName}":`);
            simulateDerivation(matchingDeriv, byType, '    ');
          } else {
            console.log(`    Derivation: NONE for "${metricName}"`);

            // Check if metric exists in raw data
            let foundInData = false;
            for (const [dt, rows] of byType) {
              if (rows.length > 0 && metricName in rows[0]) {
                const sum = rows.reduce((s, r) => s + (Number(r[metricName]) || 0), 0);
                console.log(`    Direct field match in ${dt}: SUM=${sum}`);
                foundInData = true;
                break;
              }
            }
            if (!foundInData) {
              console.log(`    Field "${metricName}" NOT found in any data_type`);
            }
          }

          // Intent execution trace
          console.log('    -- INTENT EXECUTION TRACE --');
          traceIntentExecution(intent, 0, '    ');

          // postProcessing
          if (c.postProcessing) {
            console.log('    -- POST PROCESSING --');
            console.log(`    ${JSON.stringify(c.postProcessing)}`);
            console.log(`    OB-120 transform: ${c.postProcessing.rateFromLookup ? 'YES -> wraps in scalar_multiply' : 'NO'}`);
          }
        } else {
          console.log(`    Intent path: NO calculationIntent`);
        }

        console.log('');
      }

      // 4C.3: Actual stored result
      console.log('  -- STORED CALCULATION RESULT --');

      const { data: results } = await supabase
        .from('calculation_results')
        .select('total_payout, components, metrics, attainment, metadata')
        .eq('tenant_id', tenantId)
        .eq('entity_id', traceEntityId)
        .eq('period_id', period.id)
        .eq('rule_set_id', rs.id);

      if (results && results.length > 0) {
        const result = results[0];
        console.log(`  total_payout: $${Number(result.total_payout).toFixed(2)}`);

        // Component payouts
        const compResults = (result.components || []) as Array<Record<string, unknown>>;
        for (const cr of compResults) {
          console.log(`    ${cr.componentName}: $${Number(cr.payout || 0).toFixed(2)} (${cr.componentType || 'no type'})`);
          if (cr.details) {
            const det = cr.details as Record<string, unknown>;
            // Show key details without flooding
            const keyFields = ['evaluatorType', 'source', 'intentOperation', 'tierMatched', 'metricUsed'];
            const shown = Object.entries(det)
              .filter(([k]) => keyFields.includes(k) || k === 'metricValue' || k === 'rate')
              .map(([k, v]) => `${k}=${typeof v === 'number' ? (v as number).toFixed(4) : v}`);
            if (shown.length > 0) {
              console.log(`      details: ${shown.join(', ')}`);
            }
          }
        }

        // Metrics summary
        const metrics = result.metrics as Record<string, number> | null;
        if (metrics) {
          const nonZero = Object.entries(metrics).filter(([, v]) => typeof v === 'number' && v !== 0);
          if (nonZero.length > 0) {
            console.log(`    metrics (non-zero): ${nonZero.map(([k, v]) => `${k}=${(v as number).toFixed(2)}`).join(', ')}`);
          }
        }
      } else {
        console.log(`  NO STORED RESULT for this entity/period/plan`);
      }

      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: ENTITY SUMMARY
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ SECTION 5: ENTITY SUMMARY ━━━');

  const { data: allResults } = await supabase
    .from('calculation_results')
    .select('total_payout, rule_set_id, period_id')
    .eq('tenant_id', tenantId)
    .eq('entity_id', traceEntityId);

  // Build lookup maps
  const rsNameMap = Object.fromEntries(ruleSets.map(rs => [rs.id, rs.name]));
  const periodLabelMap = Object.fromEntries((periods || []).map(p => [p.id, p.canonical_key]));

  let entityTotal = 0;
  for (const r of allResults || []) {
    const payout = Number(r.total_payout) || 0;
    entityTotal += payout;
    console.log(`  ${rsNameMap[r.rule_set_id] || r.rule_set_id.substring(0, 8)} | ${periodLabelMap[r.period_id] || r.period_id.substring(0, 8)} | $${payout.toFixed(2)}`);
  }
  console.log(`  ENTITY TOTAL: $${entityTotal.toFixed(2)}`);

  // Grand total
  const { data: grandTotalRows } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', tenantId);

  const gt = (grandTotalRows || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
  console.log(`  GRAND TOTAL (all entities): $${gt.toFixed(2)}`);
  console.log(`  This entity = ${entityTotal > 0 ? ((entityTotal / gt) * 100).toFixed(1) : '0'}% of total`);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TRACE COMPLETE                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run
traceEntity().catch(console.error);
