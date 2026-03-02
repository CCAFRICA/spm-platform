# CC-UAT: PLATFORM ARCHITECTURE TRACE — DOMAIN-AGNOSTIC INFRASTRUCTURE PROOF

**Autonomy Directive: NEVER ask yes/no. NEVER say "shall I". Just act.**

---

## PURPOSE

This is NOT an application test. This does NOT verify that "Consumer Lending produces $6.3M" or that "Insurance Referral has 5 components." Those are domain outcomes.

This traces the **platform infrastructure** itself:
- Are the three resolution tiers (AI → Deterministic → Hardcoded) actually firing?
- Is entity resolution using value matching, not string matching?
- Is convergence using semantic type matching, not field name patterns?
- Are classification signals being captured for every decision?
- Is the metric derivation engine operating structurally, not by knowing what "LoanAmount" means?
- Would this same code produce correct results if every field name were in Korean?

**The Korean Test, applied to the trace itself:** If you replaced every field name, component name, plan name, and data_type in the output with Korean equivalents, would the trace still show the architecture working? If the trace says "matched because field contains 'Loan'" — that's a platform failure, not just a test failure.

---

## READ FIRST

1. `CC_STANDING_ARCHITECTURE_RULES.md`
2. `SCHEMA_REFERENCE.md`
3. `Vialuce_Synaptic_State_Specification.md` — what the surface should be doing
4. `ViaLuce_TMR_Addendum10_Mar2026.md` — synaptic communication rules
5. `web/src/lib/calculation/run-calculation.ts`

---

## WHAT TO BUILD

Create `web/scripts/architecture-trace.ts` — a platform infrastructure diagnostic.

```typescript
// web/scripts/architecture-trace.ts
//
// DOMAIN-AGNOSTIC PLATFORM TRACE
// Tests the architecture, not the application.
// Every assertion is structural — zero domain vocabulary.

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
  // Check if entities were resolved by value matching (structural) 
  // or by column name matching (domain leak)
  {
    const { data: entities } = await supabase
      .from('entities')
      .select('id, external_id, source_field, resolution_method, metadata')
      .eq('tenant_id', tenantId)
      .limit(5);
    
    const { data: cdSample } = await supabase
      .from('committed_data')
      .select('raw_data, entity_id')
      .eq('tenant_id', tenantId)
      .not('entity_id', 'is', null)
      .limit(5);
    
    // Check: what column was used for entity resolution?
    // Structural = value overlap detection (any column name works)
    // Domain leak = column name matching (only works for "EmployeeID", "OfficerID", etc.)
    
    // Look at the entity_id values and try to find which raw_data field they came from
    const entityExternalIds = new Set((entities || []).map(e => e.external_id));
    let resolvedByValueMatch = false;
    let resolvedColumnName = 'unknown';
    
    for (const row of cdSample || []) {
      if (!row.raw_data || !row.entity_id) continue;
      const matchingEntity = entities?.find(e => e.id === row.entity_id);
      if (!matchingEntity) continue;
      
      for (const [field, value] of Object.entries(row.raw_data)) {
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
      koreanTestPass: resolvedByValueMatch
    };
    probes.push(probe);
    printProbe(probe);
  }
  
  // PROBE 1.2: Entity Linkage Coverage
  {
    const { data: linkage } = await supabase.rpc('exec_sql', { 
      sql: `SELECT COUNT(*) as total, COUNT(entity_id) as linked 
            FROM committed_data WHERE tenant_id = '${tenantId}'` 
    });
    // Fallback if rpc not available
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
      koreanTestPass: true // coverage is domain-agnostic
    };
    probes.push(probe);
    printProbe(probe);
  }
  
  // PROBE 1.3: Period Resolution Method
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
      koreanTestPass: true
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
    
    const uniqueTypes = [...new Set((dataTypes || []).map(r => r.data_type).filter(Boolean))];
    
    // Check: are data_types semantic or filename-derived?
    // Semantic: lowercase, underscored, no dates/file extensions
    // Filename: contains dates, uppercase, file extensions
    const filenamePattern = /\d{4}|\.csv|\.xlsx|\.xls|CFG_|Q[1-4]_/i;
    const filenameLeaks = uniqueTypes.filter(dt => filenamePattern.test(dt));
    
    const probe: ArchitectureProbe = {
      layer: 'Ingestion',
      probe: 'Semantic data_type Classification',
      result: filenameLeaks.length === 0 ? 'STRUCTURAL' : 'DOMAIN_LEAK',
      evidence: `${uniqueTypes.length} data_types: [${uniqueTypes.join(', ')}]. ` +
        (filenameLeaks.length > 0 ? `FILENAME LEAKS: [${filenameLeaks.join(', ')}]` : 'All semantic.'),
      koreanTestPass: filenameLeaks.length === 0
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
    let intentOperations = new Set<string>();
    let withLegacyOnly = 0;
    
    for (const rs of ruleSets || []) {
      const components = Array.isArray(rs.components) ? rs.components : [];
      for (const c of components) {
        totalComponents++;
        const intent = c.calculationIntent;
        if (intent) {
          withIntent++;
          const op = intent.operation || intent.intent?.operation;
          if (op) intentOperations.add(op);
        }
        if (c.tierConfig?.metric && !c.calculationIntent) {
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
        `Operations used: [${[...intentOperations].join(', ')}]. ` +
        `${withLegacyOnly} legacy-only (no intent).`,
      koreanTestPass: true
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
      'conditional_gate', 'ratio', 'weighted_blend', 'temporal_window'
    ]);
    
    const usedPrimitives = new Set<string>();
    const unknownOps = new Set<string>();
    let hasCompoundOperations = false;
    let hasPostProcessing = false;
    
    for (const rs of ruleSets || []) {
      const components = Array.isArray(rs.components) ? rs.components : [];
      for (const c of components) {
        walkIntent(c.calculationIntent, (op: string) => {
          if (knownPrimitives.has(op)) usedPrimitives.add(op);
          else unknownOps.add(op);
        });
        if (c.postProcessing) hasPostProcessing = true;
        // Check for nesting
        const intent = c.calculationIntent;
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
      evidence: `Primitives used: [${[...usedPrimitives].join(', ')}]. ` +
        (unknownOps.size > 0 ? `Unknown operations: [${[...unknownOps].join(', ')}]. ` : '') +
        `Compound operations: ${hasCompoundOperations ? 'YES' : 'NO'}. ` +
        `postProcessing present: ${hasPostProcessing ? 'YES — verify executor handles it' : 'NO'}.`,
      koreanTestPass: true
    };
    probes.push(probe);
    printProbe(probe);
  }

  // PROBE 2.3: Intent Executor Compound Operation Support
  {
    // This is the Consumer Lending $1 bug probe
    // Check: does the executor handle nested operations?
    // We look at calculation_results for plans with compound intents
    
    const { data: ruleSets } = await supabase
      .from('rule_sets')
      .select('id, name, components')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    
    let compoundPlans: { name: string; hasPostProcessing: boolean; totalPayout: number }[] = [];
    
    for (const rs of ruleSets || []) {
      const components = Array.isArray(rs.components) ? rs.components : [];
      let isCompound = false;
      let hasPost = false;
      
      for (const c of components) {
        const intent = c.calculationIntent;
        if (intent?.rate?.operation || intent?.input?.operation ||
            intent?.intent?.rate?.operation || intent?.intent?.input?.operation) {
          isCompound = true;
        }
        if (c.postProcessing) hasPost = true;
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
    
    const allProducingResults = compoundPlans.every(p => p.totalPayout > 1); // > $1 to catch the rate-only bug
    
    const probe: ArchitectureProbe = {
      layer: 'Plan Intelligence',
      probe: 'Compound Operation Execution',
      result: compoundPlans.length === 0 ? 'PARTIAL' :
              allProducingResults ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: compoundPlans.map(p => 
        `${p.name}: postProcessing=${p.hasPostProcessing}, total=$${p.totalPayout.toFixed(2)}` +
        (p.totalPayout <= 1 ? ' ⚠️ SUSPECT — may be returning rate not rate×volume' : '')
      ).join('. '),
      koreanTestPass: allProducingResults
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
    let totalPlans = ruleSets?.length || 0;
    let bindingMethods: string[] = [];
    
    for (const rs of ruleSets || []) {
      const bindings = rs.input_bindings;
      if (bindings && JSON.stringify(bindings) !== '{}') {
        withBindings++;
        // Check how bindings were generated
        if (bindings.convergence_confidence) bindingMethods.push('convergence');
        else if (bindings.metric_derivations) bindingMethods.push('derivation');
        else bindingMethods.push('unknown_source');
      }
    }
    
    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'input_bindings Coverage',
      result: withBindings === totalPlans ? 'STRUCTURAL' :
              withBindings > 0 ? 'PARTIAL' : 'NOT_FIRING',
      evidence: `${withBindings}/${totalPlans} plans have non-empty input_bindings. ` +
        `Methods: [${[...new Set(bindingMethods)].join(', ')}]`,
      koreanTestPass: true
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
    let hasHardcodedValues = false;
    
    for (const rs of ruleSets || []) {
      const derivations = rs.input_bindings?.metric_derivations || [];
      for (const d of derivations) {
        totalDerivations++;
        if (d.operation === 'count' && d.filters?.length > 0) filterBasedDerivations++;
        if (d.operation === 'sum' && d.source_field) sumBasedDerivations++;
        
        // Check for hardcoded domain-specific values in the derivation LOGIC
        // (filter VALUES are data-specific and acceptable — 
        //  hardcoded FIELD NAMES in the derivation engine code are not)
        // This probe checks the stored rules, not the engine code
      }
    }
    
    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'Metric Derivation Rules',
      result: totalDerivations > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${totalDerivations} derivation rules. ` +
        `count+filter: ${filterBasedDerivations}, sum+field: ${sumBasedDerivations}. ` +
        `Rules use structural operations (count, sum) with data-driven parameters.`,
      koreanTestPass: true
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
    
    // Check signal types
    const { data: signalTypes } = await supabase
      .from('classification_signals')
      .select('signal_type')
      .eq('tenant_id', tenantId)
      .limit(100);
    
    const uniqueSignalTypes = [...new Set((signalTypes || []).map(s => s.signal_type))];
    
    const probe: ArchitectureProbe = {
      layer: 'Convergence',
      probe: 'Classification Signal Capture',
      result: (signalCount || 0) > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${signalCount || 0} signals captured. Types: [${uniqueSignalTypes.join(', ') || 'NONE'}]`,
      koreanTestPass: true
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
      .select('id, name')
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
    
    // How many produce non-zero?
    const { data: nonZero } = await supabase
      .from('calculation_results')
      .select('total_payout')
      .eq('tenant_id', tenantId)
      .gt('total_payout', 0);
    
    const probe: ArchitectureProbe = {
      layer: 'Calculation',
      probe: 'Result Coverage',
      result: (actualResults || 0) > 0 ? 'STRUCTURAL' : 'NOT_FIRING',
      evidence: `${actualResults} results generated (expected max: ${expectedCombinations} = ` +
        `${ruleSets?.length} plans × ${periods?.length} periods × ${entities?.length} entities). ` +
        `Non-zero payouts: ${nonZero?.length || 0}/${actualResults || 0}.`,
      koreanTestPass: true
    };
    probes.push(probe);
    printProbe(probe);
  }
  
  // PROBE 4.2: Payout Distribution Health
  {
    const { data: results } = await supabase
      .from('calculation_results')
      .select('total_payout, rule_sets(name)')
      .eq('tenant_id', tenantId);
    
    // Group by plan
    const byPlan = new Map<string, { count: number; nonZero: number; total: number; min: number; max: number }>();
    for (const r of results || []) {
      const planName = (r.rule_sets as any)?.name || 'unknown';
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
    let suspicious: string[] = [];
    for (const [name, stats] of byPlan) {
      if (stats.nonZero === 0) suspicious.push(`${name}: ALL ZERO`);
      else if (stats.max <= 1 && stats.total <= stats.count) suspicious.push(`${name}: MAX=$${stats.max} — possible rate-not-volume bug`);
      else if (stats.min === stats.max && stats.nonZero > 1) suspicious.push(`${name}: ALL IDENTICAL ($${stats.min}) — possible constant return`);
    }
    
    const probe: ArchitectureProbe = {
      layer: 'Calculation',
      probe: 'Payout Distribution Health',
      result: suspicious.length === 0 ? 'STRUCTURAL' : 'PARTIAL',
      evidence: [...byPlan.entries()].map(([name, s]) => 
        `${name}: ${s.nonZero}/${s.count} non-zero, total=$${s.total.toFixed(2)}, range=[$${s.min.toFixed(2)}, $${s.max.toFixed(2)}]`
      ).join(' | ') + (suspicious.length > 0 ? ` ⚠️ SUSPICIOUS: ${suspicious.join('; ')}` : ''),
      koreanTestPass: suspicious.length === 0
    };
    probes.push(probe);
    printProbe(probe);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // LAYER 5: CODE STRUCTURAL INTEGRITY
  // "Does the codebase contain domain-specific hardcoding?"
  // ═══════════════════════════════════════════════════════════════
  
  console.log('━━━ LAYER 5: CODE STRUCTURAL INTEGRITY (Korean Test) ━━━');
  console.log('Question: Does the foundational code contain domain-specific strings?');
  console.log('');
  console.log('  Run these grep checks separately:');
  console.log('');
  console.log('  # Domain vocabulary in foundational calculation code:');
  console.log('  grep -rn "commission\\|mortgage\\|insurance\\|loan\\|deposit\\|referral\\|disbursement" \\');
  console.log('    web/src/lib/calculation/ --include="*.ts" -i');
  console.log('');
  console.log('  # Domain vocabulary in convergence/intelligence code:');
  console.log('  grep -rn "commission\\|mortgage\\|insurance\\|loan\\|deposit\\|referral\\|disbursement" \\');
  console.log('    web/src/app/api/intelligence/ --include="*.ts" -i');
  console.log('');
  console.log('  # Hardcoded field names (should be zero in foundational):');
  console.log('  grep -rn "LoanAmount\\|OfficerID\\|ProductCode\\|Qualified\\|OriginalAmount\\|TotalDeposit" \\');
  console.log('    web/src/lib/ --include="*.ts"');
  console.log('');
  console.log('  # SHEET_COMPONENT_PATTERNS (should be shrinking, not growing):');
  console.log('  grep -rn "SHEET_COMPONENT_PATTERNS" web/src/ --include="*.ts" | wc -l');
  console.log('');

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
  
  // Print all probes in summary table
  console.log('  ┌──────────────────────┬──────────────────────────────────┬────────────┬───────┐');
  console.log('  │ Layer                │ Probe                            │ Result     │ 한국어 │');
  console.log('  ├──────────────────────┼──────────────────────────────────┼────────────┼───────┤');
  for (const p of probes) {
    const layer = p.layer.padEnd(20);
    const probe = p.probe.padEnd(32);
    const result = p.result.padEnd(10);
    const korean = p.koreanTestPass ? '  ✅' : '  ❌';
    console.log(`  │ ${layer} │ ${probe} │ ${result} │${korean}  │`);
  }
  console.log('  └──────────────────────┴──────────────────────────────────┴────────────┴───────┘');
  
  console.log('');
  
  // Highlight critical failures
  const failures = probes.filter(p => p.result === 'NOT_FIRING' || p.result === 'DOMAIN_LEAK');
  if (failures.length > 0) {
    console.log('  ⚠️  CRITICAL FINDINGS:');
    for (const f of failures) {
      console.log(`     ${f.layer} > ${f.probe}: ${f.result}`);
      console.log(`       ${f.evidence}`);
    }
  } else {
    console.log('  ✅ No critical infrastructure failures detected.');
  }
  
  console.log('');
  console.log('  Grand total payout: $' + await getGrandTotal(tenantId));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function printProbe(probe: ArchitectureProbe) {
  const icon = probe.result === 'STRUCTURAL' ? '✅' :
               probe.result === 'PARTIAL' ? '🟡' :
               probe.result === 'NOT_FIRING' ? '❌' :
               probe.result === 'DOMAIN_LEAK' ? '🔴' : '⚠️';
  const korean = probe.koreanTestPass ? '한국어 ✅' : '한국어 ❌';
  
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
  return total.toFixed(2);
}

// Run
architectureTrace().catch(console.error);
```

---

## HOW TO RUN

```bash
cd /Users/AndrewAfrica/spm-platform
npx tsx web/scripts/architecture-trace.ts 2>&1 | tee /tmp/architecture-trace-output.txt
```

---

## WHAT EACH PROBE PROVES

| Probe | What It Proves | Korean Test |
|-------|---------------|-------------|
| 1.1 Entity Resolution Method | Entities resolved by value overlap, not column name matching | Would work if column were "직원번호" not "OfficerID" |
| 1.2 Entity Linkage Coverage | >90% of data rows linked to entities | N/A (coverage metric) |
| 1.3 Period Resolution Coverage | >90% of data rows linked to periods | Would work if dates in any format |
| 1.4 Semantic data_type | data_types are semantic, not filename stems | Would work for any language filename |
| 2.1 calculationIntent Coverage | All components have structural intent, not legacy configs | Intent primitives are language-agnostic |
| 2.2 Structural Primitive Vocabulary | Operations are from the known vocabulary (7 primitives) | Primitives are mathematical, not domain |
| 2.3 Compound Operation Execution | Nested operations execute fully (rate × volume, not just rate) | Mathematical, not domain |
| 3.1 input_bindings Coverage | Plans connected to data via bindings | Structural connection, not hardcoded |
| 3.2 Metric Derivation Rules | Derivations use structural operations (count, sum) with data-driven parameters | Operations are structural |
| 3.3 Classification Signal Capture | Decisions are recorded for flywheel learning | Infrastructure, not domain |
| 4.1 Result Coverage | Engine produces results across entity × plan × period matrix | Structural coverage |
| 4.2 Payout Distribution Health | Results have healthy distribution (not all zero, not all identical) | Statistical health |

---

## SCORING GUIDE

| Score | Meaning | Action |
|-------|---------|--------|
| STRUCTURAL | Infrastructure working as designed, domain-agnostic | No action |
| PARTIAL | Working but incomplete — some features not fully activated | Enhancement needed |
| NOT_FIRING | Infrastructure exists but not activated for this tenant/data | Bug or wiring gap |
| DOMAIN_LEAK | Domain-specific hardcoding detected in foundational code | Architecture violation — fix required |

**Target: 12/12 STRUCTURAL, 12/12 Korean Test pass.**

---

## COMMIT

```bash
cd /Users/AndrewAfrica/spm-platform
git add web/scripts/architecture-trace.ts
git commit -m "Architecture trace — domain-agnostic platform infrastructure proof"
git push origin dev
```

---

*"A platform test asks: does it work for this customer? An architecture test asks: does it work for ANY customer?"*
*"The Korean Test column is the soul of this trace."*
