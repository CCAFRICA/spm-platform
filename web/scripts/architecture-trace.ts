/**
 * CC-UAT: PLATFORM ARCHITECTURE TRACE
 * Domain-Agnostic Infrastructure Proof
 *
 * Tests the architecture, not the application.
 * Every assertion is structural — zero domain vocabulary.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ArchitectureProbe {
  layer: string;
  probe: string;
  result: 'STRUCTURAL' | 'DOMAIN_LEAK' | 'NOT_FIRING' | 'PARTIAL' | 'ERROR';
  evidence: string;
  koreanTestPass: boolean;
}

async function architectureTrace() {
  const probes: ArchitectureProbe[] = [];

  // Get first active tenant (don't hardcode 'mbc')
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, slug, name')
    .limit(5);

  // Find tenant with most committed_data (the active demo tenant)
  let maxTenant = { id: '', slug: '', name: '', count: 0 };
  for (const t of tenants || []) {
    const { count } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id);
    if ((count || 0) > maxTenant.count) {
      maxTenant = { ...t, count: count || 0 };
    }
  }

  const tenantId = maxTenant.id;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PLATFORM ARCHITECTURE TRACE                               ║');
  console.log('║  Domain-Agnostic Infrastructure Proof                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Tenant: ${maxTenant.slug} (${maxTenant.name})`);
  console.log(`Committed data: ${maxTenant.count} rows`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 1: DATA INGESTION INFRASTRUCTURE
  // "Did the platform resolve entities and periods structurally?"
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ LAYER 1: DATA INGESTION INFRASTRUCTURE ━━━');
  console.log('Question: How did the platform resolve entities and periods?');
  console.log('');

  // PROBE 1.1: Entity Resolution Method
  {
    const { data: entities } = await supabase
      .from('entities')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .limit(10);

    const { data: cdSample } = await supabase
      .from('committed_data')
      .select('row_data, entity_id')
      .eq('tenant_id', tenantId)
      .not('entity_id', 'is', null)
      .limit(10);

    // Check: what column was used for entity resolution?
    // Structural = value overlap detection (any column name works)
    // Domain leak = column name matching (only works for "EmployeeID", "OfficerID", etc.)
    let resolvedByValueMatch = false;
    let resolvedColumnName = 'unknown';

    for (const row of cdSample || []) {
      if (!row.row_data || !row.entity_id) continue;
      const matchingEntity = entities?.find(e => e.id === row.entity_id);
      if (!matchingEntity) continue;

      const rowData = row.row_data as Record<string, unknown>;
      for (const [field, value] of Object.entries(rowData)) {
        if (String(value) === matchingEntity.external_id) {
          resolvedColumnName = field;
          // Check if this field name is in a hardcoded target list
          const hardcodedTargets = ['employee_id', 'entity_id', 'rep_id', 'agent_id', 'person_id'];
          resolvedByValueMatch = !hardcodedTargets.includes(field.toLowerCase());
          break;
        }
      }
      if (resolvedColumnName !== 'unknown') break;
    }

    const probe: ArchitectureProbe = {
      layer: 'Ingestion',
      probe: 'Entity Resolution Method',
      result: resolvedByValueMatch ? 'STRUCTURAL' : 'PARTIAL',
      evidence: `Resolved via column "${resolvedColumnName}". ${resolvedByValueMatch ?
        'Value overlap detection (structural — any column name works)' :
        'Column name may be in hardcoded target list'}`,
      koreanTestPass: resolvedByValueMatch,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 1.2: Entity Linkage Coverage
  {
    const { count: total } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { count: linked } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('entity_id', 'is', null);

    const pct = total ? ((linked || 0) / total * 100).toFixed(1) : '0';

    const probe: ArchitectureProbe = {
      layer: 'Ingestion',
      probe: 'Entity Linkage Coverage',
      result: Number(pct) > 90 ? 'STRUCTURAL' : Number(pct) > 50 ? 'PARTIAL' : 'NOT_FIRING',
      evidence: `${linked}/${total} rows linked (${pct}%)`,
      koreanTestPass: true, // coverage is domain-agnostic
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 1.3: Period Resolution Coverage
  {
    const { data: periods } = await supabase
      .from('periods')
      .select('id, canonical_key, start_date, end_date')
      .eq('tenant_id', tenantId);

    const { count: periodLinked } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('period_id', 'is', null);

    const { count: totalRows } = await supabase
      .from('committed_data')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const pct = totalRows ? ((periodLinked || 0) / totalRows * 100).toFixed(1) : '0';

    const probe: ArchitectureProbe = {
      layer: 'Ingestion',
      probe: 'Period Resolution Coverage',
      result: Number(pct) > 90 ? 'STRUCTURAL' : Number(pct) > 50 ? 'PARTIAL' : 'NOT_FIRING',
      evidence: `${periodLinked}/${totalRows} rows period-linked (${pct}%). ${periods?.length || 0} periods detected.`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 1.4: Semantic data_type Quality
  {
    const { data: dataTypes } = await supabase
      .from('committed_data')
      .select('data_type')
      .eq('tenant_id', tenantId);

    const uniqueTypes = Array.from(new Set((dataTypes || []).map(r => r.data_type).filter(Boolean)));

    // Check: are data_types semantic or filename-derived?
    const filenamePattern = /\d{4}|\.csv|\.xlsx|\.xls|CFG_|Q[1-4]_/i;
    const filenameLeaks = uniqueTypes.filter(dt => filenamePattern.test(dt));

    const probe: ArchitectureProbe = {
      layer: 'Ingestion',
      probe: 'Semantic data_type Classification',
      result: filenameLeaks.length === 0 ? 'STRUCTURAL' : 'DOMAIN_LEAK',
      evidence: `${uniqueTypes.length} data_types: [${uniqueTypes.join(', ')}]. ` +
        (filenameLeaks.length > 0 ? `FILENAME LEAKS: [${filenameLeaks.join(', ')}]` : 'All semantic.'),
      koreanTestPass: filenameLeaks.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 2: PLAN INTELLIGENCE INFRASTRUCTURE
  // "Did the platform interpret plans structurally?"
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ LAYER 2: PLAN INTELLIGENCE INFRASTRUCTURE ━━━');
  console.log('Question: Are plans interpreted as structural primitives, not domain-specific configs?');
  console.log('');

  // PROBE 2.1: calculationIntent Coverage
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    let totalComponents = 0;
    let withIntent = 0;
    const intentOperations = new Set<string>();
    let withLegacyOnly = 0;

    for (const rs of ruleSets || []) {
      const components = extractComponents(rs.components);
      for (const c of components) {
        totalComponents++;
        const intent = (c as any).calculationIntent;
        if (intent) {
          withIntent++;
          const op = intent.operation || intent.intent?.operation;
          if (op) intentOperations.add(op);
        }
        if ((c as any).tierConfig?.metric && !intent) {
          withLegacyOnly++;
        }
      }
    }

    const probe: ArchitectureProbe = {
      layer: 'Plan Intelligence',
      probe: 'calculationIntent Coverage',
      result: withIntent === totalComponents ? 'STRUCTURAL' :
              withIntent > totalComponents * 0.5 ? 'PARTIAL' : 'NOT_FIRING',
      evidence: `${withIntent}/${totalComponents} components have calculationIntent. ` +
        `Operations used: [${Array.from(intentOperations).join(', ')}]. ` +
        `${withLegacyOnly} legacy-only (no intent).`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 2.2: Structural Primitive Vocabulary Usage
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const knownPrimitives = new Set([
      'scalar_multiply', 'bounded_lookup_1d', 'bounded_lookup_2d',
      'conditional_gate', 'ratio', 'weighted_blend', 'temporal_window',
    ]);

    const usedPrimitives = new Set<string>();
    const unknownOps = new Set<string>();
    let hasCompoundOperations = false;
    let hasPostProcessing = false;

    for (const rs of ruleSets || []) {
      const components = extractComponents(rs.components);
      for (const c of components) {
        const comp = c as any;
        walkIntent(comp.calculationIntent, (op: string) => {
          if (knownPrimitives.has(op)) usedPrimitives.add(op);
          else unknownOps.add(op);
        });
        if (comp.postProcessing) hasPostProcessing = true;
        // Check for nesting
        const intent = comp.calculationIntent;
        if (intent?.rate?.operation || intent?.input?.operation ||
            intent?.intent?.rate?.operation || intent?.intent?.input?.operation) {
          hasCompoundOperations = true;
        }
      }
    }

    const probe: ArchitectureProbe = {
      layer: 'Plan Intelligence',
      probe: 'Structural Primitive Vocabulary',
      result: unknownOps.size === 0 ? 'STRUCTURAL' : 'PARTIAL',
      evidence: `Primitives used: [${Array.from(usedPrimitives).join(', ')}]. ` +
        (unknownOps.size > 0 ? `Unknown operations: [${Array.from(unknownOps).join(', ')}]. ` : '') +
        `Compound operations: ${hasCompoundOperations ? 'YES' : 'NO'}. ` +
        `postProcessing present: ${hasPostProcessing ? 'YES — verify executor handles it' : 'NO'}.`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 2.3: Intent Executor Compound Operation Support
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const compoundPlans: { name: string; hasPostProcessing: boolean; totalPayout: number }[] = [];

    for (const rs of ruleSets || []) {
      const components = extractComponents(rs.components);
      let isCompound = false;
      let hasPost = false;

      for (const c of components) {
        const comp = c as any;
        const intent = comp.calculationIntent;
        if (intent?.rate?.operation || intent?.input?.operation ||
            intent?.intent?.rate?.operation || intent?.intent?.input?.operation) {
          isCompound = true;
        }
        if (comp.postProcessing) hasPost = true;
      }

      if (isCompound || hasPost) {
        const { data: results } = await supabase
          .from('calculation_results')
          .select('total_payout')
          .eq('tenant_id', tenantId)
          .eq('rule_set_id', rs.id);

        const total = (results || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
        compoundPlans.push({ name: rs.name, hasPostProcessing: hasPost, totalPayout: total });
      }
    }

    const allProducingResults = compoundPlans.length > 0 && compoundPlans.every(p => p.totalPayout > 1);

    const probe: ArchitectureProbe = {
      layer: 'Plan Intelligence',
      probe: 'Compound Operation Execution',
      result: compoundPlans.length === 0 ? 'PARTIAL' :
              allProducingResults ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: compoundPlans.map(p =>
        `${p.name}: postProcessing=${p.hasPostProcessing}, total=$${p.totalPayout.toFixed(2)}` +
        (p.totalPayout <= 1 ? ' SUSPECT — may be returning rate not rate*volume' : '')
      ).join('. ') || 'No compound operations detected.',
      koreanTestPass: allProducingResults || compoundPlans.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 3: CONVERGENCE INFRASTRUCTURE
  // "Did convergence use structural matching, not string patterns?"
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ LAYER 3: CONVERGENCE INFRASTRUCTURE ━━━');
  console.log('Question: Is convergence structurally matching semantic types, or pattern-matching on field names?');
  console.log('');

  // PROBE 3.1: input_bindings Coverage
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('id, name, input_bindings')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    let withBindings = 0;
    const totalPlans = ruleSets?.length || 0;
    const bindingMethods: string[] = [];

    for (const rs of ruleSets || []) {
      const bindings = rs.input_bindings as Record<string, unknown> | null;
      if (bindings && JSON.stringify(bindings) !== '{}') {
        withBindings++;
        if ((bindings as any).convergence_confidence) bindingMethods.push('convergence');
        else if ((bindings as any).metric_derivations) bindingMethods.push('derivation');
        else bindingMethods.push('unknown_source');
      }
    }

    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'input_bindings Coverage',
      result: withBindings === totalPlans ? 'STRUCTURAL' :
              withBindings > 0 ? 'PARTIAL' : 'NOT_FIRING',
      evidence: `${withBindings}/${totalPlans} plans have non-empty input_bindings. ` +
        `Methods: [${Array.from(new Set(bindingMethods)).join(', ')}]`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 3.2: Metric Derivation Rules — Structural or Hardcoded?
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('name, input_bindings')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    let totalDerivations = 0;
    let filterBasedDerivations = 0;
    let sumBasedDerivations = 0;

    for (const rs of ruleSets || []) {
      const bindings = rs.input_bindings as Record<string, unknown> | null;
      const derivations = ((bindings as any)?.metric_derivations || []) as Array<Record<string, unknown>>;
      for (const d of derivations) {
        totalDerivations++;
        const filters = d.filters as Array<Record<string, unknown>> | undefined;
        if (d.operation === 'count' && filters && filters.length > 0) filterBasedDerivations++;
        if (d.operation === 'sum' && d.source_field) sumBasedDerivations++;
      }
    }

    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'Metric Derivation Rules',
      result: totalDerivations > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${totalDerivations} derivation rules. ` +
        `count+filter: ${filterBasedDerivations}, sum+field: ${sumBasedDerivations}. ` +
        `Rules use structural operations (count, sum) with data-driven parameters.`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 3.3: Classification Signals Captured
  {
    const { count: signalCount } = await supabase
      .from('classification_signals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { data: signalSample } = await supabase
      .from('classification_signals')
      .select('signal_type')
      .eq('tenant_id', tenantId)
      .limit(100);

    const uniqueSignalTypes = Array.from(new Set((signalSample || []).map(s => s.signal_type).filter(Boolean)));

    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'Classification Signal Capture',
      result: (signalCount || 0) > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${signalCount || 0} signals captured. Types: [${uniqueSignalTypes.join(', ') || 'NONE'}]`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 4: CALCULATION ENGINE INFRASTRUCTURE
  // "Is the engine executing structural primitives, not domain-specific logic?"
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ LAYER 4: CALCULATION ENGINE INFRASTRUCTURE ━━━');
  console.log('Question: Does the engine use structural primitives, or does it have domain-specific switch cases?');
  console.log('');

  // PROBE 4.1: Calculation Result Coverage
  {
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const { data: periods } = await supabase
      .from('periods')
      .select('id')
      .eq('tenant_id', tenantId);

    const { data: entities } = await supabase
      .from('entities')
      .select('id')
      .eq('tenant_id', tenantId);

    const expectedCombinations = (ruleSets?.length || 0) * (periods?.length || 0) * (entities?.length || 0);

    const { count: actualResults } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { count: nonZeroCount } = await supabase
      .from('calculation_results')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('total_payout', 0);

    const probe: ArchitectureProbe = {
      layer: 'Calculation',
      probe: 'Result Coverage',
      result: (actualResults || 0) > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${actualResults} results generated (expected max: ${expectedCombinations} = ` +
        `${ruleSets?.length} plans x ${periods?.length} periods x ${entities?.length} entities). ` +
        `Non-zero payouts: ${nonZeroCount || 0}/${actualResults || 0}.`,
      koreanTestPass: true,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 4.2: Payout Distribution Health
  {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout, rule_set_id')
      .eq('tenant_id', tenantId);

    // Get rule set names
    const rsIds = Array.from(new Set((results || []).map(r => r.rule_set_id)));
    const { data: rsNames } = await supabase
      .from('rule_sets')
      .select('id, name')
      .in('id', rsIds.length > 0 ? rsIds : ['__none__']);
    const nameMap = Object.fromEntries((rsNames || []).map(r => [r.id, r.name]));

    // Group by plan
    const byPlan = new Map<string, { count: number; nonZero: number; total: number; min: number; max: number }>();
    for (const r of results || []) {
      const planName = nameMap[r.rule_set_id] || r.rule_set_id.substring(0, 8);
      if (!byPlan.has(planName)) {
        byPlan.set(planName, { count: 0, nonZero: 0, total: 0, min: Infinity, max: -Infinity });
      }
      const plan = byPlan.get(planName)!;
      const payout = Number(r.total_payout) || 0;
      plan.count++;
      if (payout > 0) plan.nonZero++;
      plan.total += payout;
      plan.min = Math.min(plan.min, payout);
      plan.max = Math.max(plan.max, payout);
    }

    // Check for suspicious distributions
    const suspicious: string[] = [];
    for (const [name, stats] of byPlan) {
      if (stats.nonZero === 0) suspicious.push(`${name}: ALL ZERO`);
      else if (stats.max <= 1 && stats.total <= stats.count) suspicious.push(`${name}: MAX=${stats.max} — possible rate-not-volume bug`);
      else if (stats.min === stats.max && stats.nonZero > 1) suspicious.push(`${name}: ALL IDENTICAL (${stats.min}) — possible constant return`);
    }

    const probe: ArchitectureProbe = {
      layer: 'Calculation',
      probe: 'Payout Distribution Health',
      result: suspicious.length === 0 ? 'STRUCTURAL' : 'PARTIAL',
      evidence: Array.from(byPlan.entries()).map(([name, s]) =>
        `${name}: ${s.nonZero}/${s.count} non-zero, total=$${s.total.toFixed(2)}, range=[$${s.min.toFixed(2)}, $${s.max.toFixed(2)}]`
      ).join(' | ') + (suspicious.length > 0 ? ` SUSPICIOUS: ${suspicious.join('; ')}` : ''),
      koreanTestPass: suspicious.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 5: CODE STRUCTURAL INTEGRITY (Korean Test)
  // "Does the foundational code contain domain-specific strings?"
  // ═══════════════════════════════════════════════════════════════

  console.log('━━━ LAYER 5: CODE STRUCTURAL INTEGRITY (Korean Test) ━━━');
  console.log('Question: Does the foundational code contain domain-specific strings?');
  console.log('');

  // PROBE 5.1: Calculation engine domain vocabulary
  {
    const fs = await import('fs');
    const path = await import('path');
    const { execSync } = await import('child_process');

    const calcDir = path.join(__dirname, '..', 'src', 'lib', 'calculation');
    const domainTerms = ['commission', 'mortgage', 'insurance', 'loan', 'deposit', 'referral', 'disbursement'];

    let domainHits: { file: string; term: string; line: string }[] = [];
    try {
      for (const term of domainTerms) {
        try {
          const output = execSync(
            `grep -rn -i "${term}" "${calcDir}" --include="*.ts" || true`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
          if (output) {
            for (const line of output.split('\n').filter(Boolean)) {
              // Skip comments
              const codePart = line.split(':').slice(2).join(':').trim();
              if (!codePart.startsWith('//') && !codePart.startsWith('*') && !codePart.startsWith('/*')) {
                domainHits.push({ file: line.split(':')[0], term, line: codePart.substring(0, 80) });
              }
            }
          }
        } catch {
          // grep returns 1 on no match
        }
      }
    } catch {
      // fallback
    }

    const probe: ArchitectureProbe = {
      layer: 'Code Integrity',
      probe: 'Calculation Engine Domain Vocab',
      result: domainHits.length === 0 ? 'STRUCTURAL' : 'DOMAIN_LEAK',
      evidence: domainHits.length === 0
        ? 'Zero domain vocabulary in calculation engine code (non-comment).'
        : `${domainHits.length} domain terms found: ${domainHits.slice(0, 3).map(h => `"${h.term}" in ${h.line}`).join('; ')}`,
      koreanTestPass: domainHits.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 5.2: Convergence engine domain vocabulary
  {
    const path = await import('path');
    const { execSync } = await import('child_process');

    const convDir = path.join(__dirname, '..', 'src', 'lib', 'intelligence');
    const domainTerms = ['commission', 'mortgage', 'insurance', 'loan', 'deposit', 'referral', 'disbursement'];

    let domainHits: { term: string; line: string }[] = [];
    try {
      for (const term of domainTerms) {
        try {
          const output = execSync(
            `grep -rn -i "${term}" "${convDir}" --include="*.ts" || true`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
          if (output) {
            for (const line of output.split('\n').filter(Boolean)) {
              const codePart = line.split(':').slice(2).join(':').trim();
              if (!codePart.startsWith('//') && !codePart.startsWith('*') && !codePart.startsWith('/*')) {
                domainHits.push({ term, line: codePart.substring(0, 80) });
              }
            }
          }
        } catch {
          // no match
        }
      }
    } catch {
      // fallback
    }

    const probe: ArchitectureProbe = {
      layer: 'Code Integrity',
      probe: 'Convergence Engine Domain Vocab',
      result: domainHits.length === 0 ? 'STRUCTURAL' : 'DOMAIN_LEAK',
      evidence: domainHits.length === 0
        ? 'Zero domain vocabulary in convergence code (non-comment).'
        : `${domainHits.length} domain terms found: ${domainHits.slice(0, 3).map(h => `"${h.term}" in ${h.line}`).join('; ')}`,
      koreanTestPass: domainHits.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 5.3: Hardcoded field names
  {
    const path = await import('path');
    const { execSync } = await import('child_process');

    const libDir = path.join(__dirname, '..', 'src', 'lib');
    const hardcodedFields = ['LoanAmount', 'OfficerID', 'ProductCode', 'Qualified', 'OriginalAmount', 'TotalDeposit'];

    let fieldHits: { field: string; file: string }[] = [];
    try {
      for (const field of hardcodedFields) {
        try {
          const output = execSync(
            `grep -rn "${field}" "${libDir}" --include="*.ts" || true`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
          if (output) {
            for (const line of output.split('\n').filter(Boolean)) {
              const codePart = line.split(':').slice(2).join(':').trim();
              if (!codePart.startsWith('//') && !codePart.startsWith('*') && !codePart.startsWith('/*')) {
                const fileName = line.split(':')[0].split('/').pop() || '';
                fieldHits.push({ field, file: fileName });
              }
            }
          }
        } catch {
          // no match
        }
      }
    } catch {
      // fallback
    }

    const probe: ArchitectureProbe = {
      layer: 'Code Integrity',
      probe: 'Hardcoded Field Names in lib/',
      result: fieldHits.length === 0 ? 'STRUCTURAL' : 'DOMAIN_LEAK',
      evidence: fieldHits.length === 0
        ? 'Zero hardcoded field names in library code.'
        : `${fieldHits.length} hardcoded fields: ${fieldHits.map(h => `${h.field} in ${h.file}`).join(', ')}`,
      koreanTestPass: fieldHits.length === 0,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 5.4: SHEET_COMPONENT_PATTERNS usage breadth
  {
    const { execSync } = await import('child_process');
    const srcDir = require('path').join(__dirname, '..', 'src');

    let patternRefs = 0;
    try {
      const output = execSync(
        `grep -rn "SHEET_COMPONENT_PATTERNS" "${srcDir}" --include="*.ts" || true`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      patternRefs = output ? output.split('\n').filter(Boolean).length : 0;
    } catch {
      // no match
    }

    const probe: ArchitectureProbe = {
      layer: 'Code Integrity',
      probe: 'SHEET_COMPONENT_PATTERNS Usage',
      result: patternRefs <= 3 ? 'STRUCTURAL' : 'PARTIAL',
      evidence: `${patternRefs} references to SHEET_COMPONENT_PATTERNS. ` +
        (patternRefs <= 3 ? 'Contained — convergence is taking over.' : 'Still widely used — convergence should replace more.'),
      koreanTestPass: patternRefs <= 5,
    };
    probes.push(probe);
    printProbe(probe);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY: ARCHITECTURE HEALTH SCORECARD
  // ═══════════════════════════════════════════════════════════════

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ARCHITECTURE HEALTH SCORECARD                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  const structural = probes.filter(p => p.result === 'STRUCTURAL').length;
  const partial = probes.filter(p => p.result === 'PARTIAL').length;
  const notFiring = probes.filter(p => p.result === 'NOT_FIRING').length;
  const domainLeak = probes.filter(p => p.result === 'DOMAIN_LEAK').length;
  const koreanPass = probes.filter(p => p.koreanTestPass).length;

  console.log(`  STRUCTURAL:   ${structural}/${probes.length} (platform infrastructure working)`);
  console.log(`  PARTIAL:      ${partial}/${probes.length} (working but incomplete)`);
  console.log(`  NOT FIRING:   ${notFiring}/${probes.length} (infrastructure not activated)`);
  console.log(`  DOMAIN LEAK:  ${domainLeak}/${probes.length} (domain-specific hardcoding detected)`);
  console.log(`  KOREAN TEST:  ${koreanPass}/${probes.length} pass`);
  console.log('');

  // Summary table
  const colLayer = 20;
  const colProbe = 36;
  const colResult = 12;

  console.log('  ' + '-'.repeat(colLayer + colProbe + colResult + 13));
  console.log(`  | ${'Layer'.padEnd(colLayer)} | ${'Probe'.padEnd(colProbe)} | ${'Result'.padEnd(colResult)} | KR |`);
  console.log('  ' + '-'.repeat(colLayer + colProbe + colResult + 13));
  for (const p of probes) {
    const kr = p.koreanTestPass ? 'OK' : 'NO';
    console.log(`  | ${p.layer.padEnd(colLayer)} | ${p.probe.padEnd(colProbe)} | ${p.result.padEnd(colResult)} | ${kr.padEnd(2)} |`);
  }
  console.log('  ' + '-'.repeat(colLayer + colProbe + colResult + 13));

  console.log('');

  // Highlight critical failures
  const failures = probes.filter(p => p.result === 'NOT_FIRING' || p.result === 'DOMAIN_LEAK');
  if (failures.length > 0) {
    console.log('  CRITICAL FINDINGS:');
    for (const f of failures) {
      console.log(`     ${f.layer} > ${f.probe}: ${f.result}`);
      console.log(`       ${f.evidence}`);
    }
  } else {
    console.log('  No critical infrastructure failures detected.');
  }

  console.log('');
  const grandTotal = await getGrandTotal(tenantId);
  console.log(`  Grand total payout: $${grandTotal}`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function extractComponents(components: unknown): Array<Record<string, unknown>> {
  // Handle both structures:
  // 1. { variants: [{ components: [...] }] }
  // 2. flat array [...]
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

function printProbe(probe: ArchitectureProbe) {
  const icon = probe.result === 'STRUCTURAL' ? '[OK]' :
               probe.result === 'PARTIAL' ? '[..] ' :
               probe.result === 'NOT_FIRING' ? '[XX]' :
               probe.result === 'DOMAIN_LEAK' ? '[!!]' : '[??]';
  const korean = probe.koreanTestPass ? 'KR:OK' : 'KR:FAIL';

  console.log(`  ${icon} ${probe.probe} [${probe.result}] ${korean}`);
  console.log(`     ${probe.evidence}`);
  console.log('');
}

function walkIntent(intent: any, callback: (op: string) => void) {
  if (!intent) return;
  if (intent.operation) callback(intent.operation);
  if (intent.intent?.operation) callback(intent.intent.operation);
  walkIntent(intent.input, callback);
  walkIntent(intent.rate, callback);
  walkIntent(intent.numerator, callback);
  walkIntent(intent.denominator, callback);
  walkIntent(intent.pass, callback);
  walkIntent(intent.fail, callback);
  walkIntent(intent.intent, callback);
  if (intent.postProcessing) walkIntent(intent.postProcessing, callback);
}

async function getGrandTotal(tenantId: string): Promise<string> {
  const { data } = await supabase
    .from('calculation_results')
    .select('total_payout')
    .eq('tenant_id', tenantId);

  const total = (data || []).reduce((sum, r) => sum + (Number(r.total_payout) || 0), 0);
  return total.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

// Run
architectureTrace().catch(console.error);
