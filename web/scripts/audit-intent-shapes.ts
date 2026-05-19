// HF-238 Phase 0: Legacy intent shape inventory.
// Enumerates every distinct calculationIntent operation, source type,
// modifier shape, and metric_derivation shape across all active tenants.
// Read-only. Produces a coverage map for legacyIntentToDAG / legacyDerivationToDAG.

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Walk a JSON tree and collect every distinct shape under a key
function walkCollect(node: unknown, collector: Map<string, Set<string>>, path: string = '') {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkCollect(item, collector, `${path}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;

  // Capture operation discriminators
  if (typeof obj.operation === 'string') {
    if (!collector.has('operation')) collector.set('operation', new Set());
    collector.get('operation')!.add(obj.operation);
  }
  if (typeof obj.source === 'string') {
    if (!collector.has('source')) collector.set('source', new Set());
    collector.get('source')!.add(obj.source);
  }
  if (typeof obj.modifier === 'string') {
    if (!collector.has('modifier')) collector.set('modifier', new Set());
    collector.get('modifier')!.add(obj.modifier);
  }
  if (typeof obj.prime === 'string') {
    if (!collector.has('prime')) collector.set('prime', new Set());
    collector.get('prime')!.add(obj.prime);
  }

  for (const [k, v] of Object.entries(obj)) {
    walkCollect(v, collector, path ? `${path}.${k}` : k);
  }
}

// Capture full intent shape signatures (top-level operation + which keys it carries)
function intentSignature(intent: Record<string, unknown> | null | undefined): string {
  if (!intent || typeof intent !== 'object') return 'null';
  const op = intent.operation ?? '<no-operation>';
  const keys = Object.keys(intent).filter(k => k !== 'operation').sort();
  return `${op} :: { ${keys.join(', ')} }`;
}

// Capture modifier full shape (modifier + keys)
function modifierSignature(mod: Record<string, unknown>): string {
  const modType = mod.modifier ?? '<no-modifier>';
  const keys = Object.keys(mod).filter(k => k !== 'modifier').sort();
  return `${modType} :: { ${keys.join(', ')} }`;
}

// Capture derivation full shape
function derivationSignature(d: Record<string, unknown>): string {
  const op = d.operation ?? '<no-operation>';
  const keys = Object.keys(d).sort();
  return `${op} :: { ${keys.join(', ')} }`;
}

async function main() {
  // List all tenants
  const { data: tenants } = await sb
    .from('tenants')
    .select('id, name, status')
    .order('name');

  console.log('=== Active tenants ===');
  for (const t of tenants ?? []) console.log(`  ${t.id}  ${t.name}  (${t.status})`);

  // All rule_sets
  const { data: ruleSets } = await sb
    .from('rule_sets')
    .select('id, tenant_id, name, status, components, input_bindings');

  console.log(`\n=== Total rule_sets: ${(ruleSets ?? []).length} ===`);

  const intentSignatures = new Set<string>();
  const sourceTypes = new Set<string>();
  const modifierSignatures = new Set<string>();
  const operationTypes = new Set<string>();
  const derivationSignatures = new Set<string>();
  const allShapes = new Map<string, Set<string>>();

  // Track plans by tenant for downstream reporting
  const planCountByTenant = new Map<string, number>();

  // Variant/non-variant flag
  let plansWithVariants = 0;
  let plansFlat = 0;

  for (const rs of ruleSets ?? []) {
    const tenantId = rs.tenant_id as string;
    planCountByTenant.set(tenantId, (planCountByTenant.get(tenantId) ?? 0) + 1);

    const components = rs.components as Record<string, unknown> | null;
    if (!components) continue;

    // Flatten variants if present
    const flatComponents: Array<Record<string, unknown>> = [];
    if (Array.isArray(components.variants)) {
      plansWithVariants++;
      for (const variant of components.variants as Array<Record<string, unknown>>) {
        if (Array.isArray(variant.components)) {
          flatComponents.push(...(variant.components as Array<Record<string, unknown>>));
        }
      }
    } else if (Array.isArray(components.components)) {
      plansFlat++;
      flatComponents.push(...(components.components as Array<Record<string, unknown>>));
    } else if (Array.isArray(components)) {
      plansFlat++;
      flatComponents.push(...(components as unknown as Array<Record<string, unknown>>));
    } else {
      // Single component or other shape
      flatComponents.push(components);
    }

    for (const comp of flatComponents) {
      const ci = comp.calculationIntent as Record<string, unknown> | undefined;
      if (ci) {
        intentSignatures.add(intentSignature(ci));
        walkCollect(ci, allShapes);

        if (Array.isArray(ci.modifiers)) {
          for (const mod of ci.modifiers as Array<Record<string, unknown>>) {
            modifierSignatures.add(modifierSignature(mod));
          }
        }
      }
      // Also walk calculationMethod (legacy parallel shape)
      const cm = comp.calculationMethod as Record<string, unknown> | undefined;
      if (cm) walkCollect(cm, allShapes);
    }

    // Walk metric_derivations
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivs = ib?.metric_derivations as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(derivs)) {
      for (const d of derivs) {
        derivationSignatures.add(derivationSignature(d));
      }
    }
  }

  // Aggregate operation types from allShapes
  if (allShapes.has('operation')) {
    for (const o of allShapes.get('operation')!) operationTypes.add(o);
  }
  if (allShapes.has('source')) {
    for (const s of allShapes.get('source')!) sourceTypes.add(s);
  }

  console.log('\n=== Plan counts by tenant ===');
  for (const [tid, count] of planCountByTenant.entries()) {
    const t = tenants?.find(x => x.id === tid);
    console.log(`  ${t?.name ?? tid}: ${count} rule_sets`);
  }
  console.log(`\n  Plans with variants: ${plansWithVariants}`);
  console.log(`  Plans without variants: ${plansFlat}`);

  console.log('\n=== Distinct operation types (legacy intent operation field) ===');
  for (const o of [...operationTypes].sort()) console.log(`  ${o}`);

  console.log('\n=== Distinct source types (legacy intent IntentSource.source field) ===');
  for (const s of [...sourceTypes].sort()) console.log(`  ${s}`);

  console.log('\n=== Distinct intent signatures (operation + carried keys) ===');
  for (const sig of [...intentSignatures].sort()) console.log(`  ${sig}`);

  console.log('\n=== Distinct modifier signatures (modifier + carried keys) ===');
  for (const sig of [...modifierSignatures].sort()) console.log(`  ${sig}`);

  console.log('\n=== Distinct metric_derivation signatures (operation + carried keys) ===');
  for (const sig of [...derivationSignatures].sort()) console.log(`  ${sig}`);

  // Check for prime-format intents already present (new format detection)
  const primeFound = allShapes.has('prime') ? [...allShapes.get('prime')!] : [];
  console.log('\n=== Prime-format intents already in production ===');
  console.log(primeFound.length > 0 ? primeFound.join(', ') : '  (none — all stored intents are legacy format)');
}

main().catch(e => { console.error(e); process.exit(1); });
