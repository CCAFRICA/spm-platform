import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const tid = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';

async function run() {
  // 1.1 Tenant Record
  console.log('=== 1.1 TENANT RECORD ===');
  const { data: tenant } = await s.from('tenants').select('id, name, slug, locale, currency, settings, created_at').eq('id', tid).single();
  if (tenant) {
    const settings = (tenant.settings as Record<string, unknown>) ?? {};
    console.log(JSON.stringify({
      id: tenant.id, name: tenant.name, slug: tenant.slug,
      locale: tenant.locale, currency: tenant.currency,
      industry: settings.industry || null, domain: settings.domain || null,
      created_at: tenant.created_at
    }, null, 2));
  } else {
    console.log('NOT FOUND');
  }

  // 1.2 Engine Contract
  console.log('\n=== 1.2 ENGINE CONTRACT ===');
  const tables = ['rule_sets', 'entities', 'committed_data', 'periods', 'rule_set_assignments', 'reference_data', 'reference_items', 'calculation_results', 'import_batches'];
  const counts: Record<string, number | null> = {};
  for (const t of tables) {
    const { count } = await s.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
    counts[t] = count;
  }
  console.log(JSON.stringify(counts, null, 2));

  // 2.1 All Rule Sets
  console.log('\n=== 2.1 ALL RULE SETS ===');
  const { data: ruleSets } = await s.from('rule_sets').select('id, name, status, version, effective_from, effective_to, components, input_bindings, created_at').eq('tenant_id', tid).order('created_at');
  if (ruleSets) {
    for (const rs of ruleSets) {
      const comp = rs.components as any;
      console.log(JSON.stringify({
        id: rs.id, name: rs.name, status: rs.status, version: rs.version,
        effective_from: rs.effective_from, effective_to: rs.effective_to,
        comp_type: typeof comp === 'object' && comp !== null ? (Array.isArray(comp) ? 'array' : (comp.variants ? 'variants_object' : 'object')) : typeof comp,
        comp_size: JSON.stringify(comp).length,
        has_bindings: rs.input_bindings !== null,
        bindings_size: rs.input_bindings ? JSON.stringify(rs.input_bindings).length : 0,
        created_at: rs.created_at
      }, null, 2));
    }
  }

  // 2.2 Latest Rule Set - Variant Structure
  console.log('\n=== 2.2 VARIANT STRUCTURE ===');
  if (ruleSets && ruleSets.length > 0) {
    const latest = ruleSets[ruleSets.length - 1];
    const comp = latest.components as any;
    if (comp?.variants && Array.isArray(comp.variants)) {
      console.log(`variant_count: ${comp.variants.length}`);
      for (let i = 0; i < comp.variants.length; i++) {
        const v = comp.variants[i];
        console.log(JSON.stringify({
          variant_index: i, name: v.name, variantName: v.variantName,
          role: v.role, description: v.description,
          component_count: v.components?.length || 0
        }));
      }
    } else if (Array.isArray(comp)) {
      console.log(`No variants wrapper. Components is array with ${comp.length} items.`);
    } else {
      console.log('Components structure:', Object.keys(comp || {}));
    }
  }

  // 2.3 Component Details - Variant 0
  console.log('\n=== 2.3 COMPONENT DETAILS (Variant 0) ===');
  if (ruleSets && ruleSets.length > 0) {
    const comp = ruleSets[ruleSets.length - 1].components as any;
    const components = comp?.variants?.[0]?.components || (Array.isArray(comp) ? comp : []);
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      console.log(JSON.stringify({
        idx: i, name: c.name, calculationType: c.calculationType,
        has_intent: !!c.calculationIntent,
        intent_operation: c.calculationIntent?.operation || null,
        has_tierConfig: !!c.tierConfig,
        has_matrixConfig: !!c.matrixConfig,
        size: JSON.stringify(c).length
      }));
    }
  }

  // 2.4 Component Details - Variant 1
  console.log('\n=== 2.4 COMPONENT DETAILS (Variant 1) ===');
  if (ruleSets && ruleSets.length > 0) {
    const comp = ruleSets[ruleSets.length - 1].components as any;
    const components = comp?.variants?.[1]?.components || [];
    if (components.length === 0) {
      console.log('No variant 1 or no components in variant 1');
    }
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      console.log(JSON.stringify({
        idx: i, name: c.name, calculationType: c.calculationType,
        has_intent: !!c.calculationIntent,
        intent_operation: c.calculationIntent?.operation || null,
        size: JSON.stringify(c).length
      }));
    }
  }

  // 2.5 input_bindings
  console.log('\n=== 2.5 INPUT BINDINGS ===');
  if (ruleSets && ruleSets.length > 0) {
    const latest = ruleSets[ruleSets.length - 1];
    console.log('bindings_type:', typeof latest.input_bindings);
    console.log('bindings:', JSON.stringify(latest.input_bindings, null, 2));
  }

  // 2.6 First Component JSON
  console.log('\n=== 2.6 FIRST COMPONENT JSON ===');
  if (ruleSets && ruleSets.length > 0) {
    const comp = ruleSets[ruleSets.length - 1].components as any;
    const first = comp?.variants?.[0]?.components?.[0] || (Array.isArray(comp) ? comp[0] : null);
    console.log(JSON.stringify(first, null, 2));
  }

  // 3.1 Classification Signals
  console.log('\n=== 3.1 CLASSIFICATION SIGNALS ===');
  const { data: signals } = await s.from('classification_signals').select('id, source_file_name, sheet_name, classification, confidence, decision_source, scope, signal_type, structural_fingerprint, classification_trace, vocabulary_bindings, created_at').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(20);
  if (signals) {
    console.log(`Total signals returned: ${signals.length}`);
    for (const sig of signals) {
      console.log(JSON.stringify({
        id: sig.id?.substring(0, 8),
        file: sig.source_file_name, sheet: sig.sheet_name,
        classification: sig.classification, confidence: sig.confidence,
        decision: sig.decision_source, scope: sig.scope, type: sig.signal_type,
        has_fp: !!sig.structural_fingerprint,
        has_trace: !!sig.classification_trace,
        has_vocab: !!sig.vocabulary_bindings,
        created: sig.created_at
      }));
    }
  }

  // 3.2 Convergence Signals
  console.log('\n=== 3.2 CONVERGENCE SIGNALS ===');
  const { data: convSignals } = await s.from('classification_signals').select('classification, confidence, decision_source, agent_scores, created_at').eq('tenant_id', tid).like('signal_type', '%convergence%').order('created_at', { ascending: false }).limit(10);
  if (convSignals && convSignals.length > 0) {
    for (const cs of convSignals) {
      console.log(JSON.stringify(cs));
    }
  } else {
    console.log('No convergence signals found');
    // Try broader search
    const { data: allTypes } = await s.from('classification_signals').select('signal_type').eq('tenant_id', tid);
    if (allTypes) {
      const types = [...new Set(allTypes.map(t => t.signal_type))];
      console.log('Signal types found:', types);
    }
  }

  // 4.1 Import Batches
  console.log('\n=== 4.1 IMPORT BATCHES ===');
  const { data: batches } = await s.from('import_batches').select('id, file_name, file_type, row_count, status, error_summary, created_at, completed_at').eq('tenant_id', tid).order('created_at');
  if (batches && batches.length > 0) {
    for (const b of batches) {
      console.log(JSON.stringify({
        id: b.id?.substring(0, 8), file: b.file_name, type: b.file_type,
        rows: b.row_count, status: b.status,
        error: b.error_summary ? String(b.error_summary).substring(0, 100) : null,
        created: b.created_at, completed: b.completed_at
      }));
    }
  } else {
    console.log('No import batches found');
  }

  // 5.1 Duplicate Rule Sets
  console.log('\n=== 5.1 DUPLICATE RULE SETS ===');
  if (ruleSets) {
    const nameMap = new Map<string, string[]>();
    for (const rs of ruleSets) {
      const existing = nameMap.get(rs.name) || [];
      existing.push(rs.id);
      nameMap.set(rs.name, existing);
    }
    let hasDupes = false;
    for (const [name, ids] of nameMap.entries()) {
      if (ids.length > 1) {
        console.log(`DUPLICATE: "${name}" x${ids.length}: ${ids.join(', ')}`);
        hasDupes = true;
      }
    }
    if (!hasDupes) console.log('No duplicates');
  }

  // 5.2 Orphaned Data
  console.log('\n=== 5.2 ORPHANED DATA ===');
  const { count: entityCount } = await s.from('entities').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  const { count: assignmentCount } = await s.from('rule_set_assignments').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  console.log(`entities: ${entityCount}, assignments: ${assignmentCount}`);
  if ((entityCount || 0) > 0 && (assignmentCount || 0) === 0) {
    console.log('WARNING: Entities exist but no assignments');
  }

  // 6.1 Foundational Patterns
  console.log('\n=== 6.1 FOUNDATIONAL PATTERNS ===');
  const { data: fp } = await s.from('foundational_patterns').select('pattern_signature, confidence_mean, total_executions, tenant_count, learned_behaviors').like('pattern_signature', 'sci:%').order('total_executions', { ascending: false }).limit(10);
  if (fp && fp.length > 0) {
    for (const p of fp) {
      console.log(JSON.stringify({
        sig: p.pattern_signature, confidence: p.confidence_mean,
        executions: p.total_executions, tenants: p.tenant_count,
        has_behaviors: !!p.learned_behaviors
      }));
    }
  } else {
    console.log('No SCI foundational patterns');
    const { count: fpCount } = await s.from('foundational_patterns').select('id', { count: 'exact', head: true });
    console.log(`Total foundational_patterns rows: ${fpCount}`);
  }

  // 6.2 Domain Patterns
  console.log('\n=== 6.2 DOMAIN PATTERNS ===');
  const { data: dp } = await s.from('domain_patterns').select('pattern_signature, domain_id, confidence_mean, total_executions').order('total_executions', { ascending: false }).limit(10);
  if (dp && dp.length > 0) {
    for (const p of dp) {
      console.log(JSON.stringify(p));
    }
  } else {
    console.log('No domain patterns');
    const { count: dpCount } = await s.from('domain_patterns').select('id', { count: 'exact', head: true });
    console.log(`Total domain_patterns rows: ${dpCount}`);
  }
}

run().catch(e => console.error('SCRIPT ERROR:', e));
