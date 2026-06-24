// OB-235 P5 proof — cross-tenant DATA flywheel: foundational/domain aggregation + cold-start priors +
// privacy firewall. Uses the REAL flywheel-pipeline.ts (extended) + the REAL spec consolidation against the
// REAL foundational_patterns/domain_patterns tables (synthetic pattern signatures; these tables carry NO
// tenant_id by schema, so synthetic rows touch no tenant). Proves:
//   (A) aggregation writes STRUCTURAL rows (mean + variance + merged learned_behaviors) to both tables;
//   (B) the cross-tenant rows carry ZERO tenant-identifying fields (the grep + schema confirm it);
//   (C) cold-start: a fresh pattern loads a prior (confidence > 0.5) and reaches light_trace SOONER than a
//       true-cold baseline → strictly FEWER full_trace encounters.
// Run: npx tsx --env-file=.env.local scripts/_ob235-p5-proof.ts
import { createClient } from '@supabase/supabase-js';
import { aggregateFoundational, aggregateDomain, loadColdStartPriors, applyPriorsToEmptyDensity, COLD_START_DISCOUNT } from '../src/lib/calculation/flywheel-pipeline';
import { createSynapticSurface, getExecutionMode, initializePatternDensity, writeSynapse, consolidateSurface } from '../src/lib/calculation/synaptic-surface';
import type { SynapticDensity } from '../src/lib/calculation/synaptic-types';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const SIG = '__ob235p5_sig';
const DOMAIN = '__ob235p5_domain';

async function cleanup() {
  await (sb as any).from('foundational_patterns').delete().like('pattern_signature', '__ob235p5_%');
  await (sb as any).from('domain_patterns').delete().eq('domain_id', DOMAIN);
}

// Simulate K encounters from a starting confidence using the REAL spec consolidation; count full_trace ones.
function fullTraceEncounters(startConfidence: number, K: number): { full: number; trace: string[] } {
  const density: SynapticDensity = new Map([[SIG, {
    signature: SIG, confidence: startConfidence, totalExecutions: 0, lastAnomalyRate: 0,
    lastCorrectionCount: 0, executionMode: 'full_trace', learnedBehaviors: {},
  }]]);
  let full = 0; const trace: string[] = [];
  for (let k = 0; k < K; k++) {
    const mode = getExecutionMode(createSynapticSurface(density), SIG); // mode for THIS encounter
    trace.push(`${density.get(SIG)!.confidence.toFixed(3)}:${mode}`);
    if (mode === 'full_trace') full++;
    const cs = createSynapticSurface(density); // consolidate the encounter (runConf 0.97, no anomaly)
    cs.stats.entityCount = 100;
    initializePatternDensity(cs, SIG, 0);
    writeSynapse(cs, { type: 'confidence', componentIndex: 0, value: 0.97, detail: SIG, timestamp: 0 });
    const { densityUpdates } = consolidateSurface(cs);
    for (const u of densityUpdates) density.get(SIG)!.confidence = u.newConfidence;
  }
  return { full, trace };
}

async function main() {
  console.log('=== OB-235 P5 proof: cross-tenant data flywheel — aggregation, cold-start, privacy ===\n');
  await cleanup();

  // (A) AGGREGATION — two tenants contribute the SAME structural pattern (tenantId used only for counting,
  //     never stored). Second contribution exercises the UPDATE path (variance + learned_behaviors merge).
  const mk = (conf: number, behaviors: Record<string, unknown>) => ({
    patternSignature: SIG, confidence: conf, executionCount: 100, anomalyRate: 0.02, learnedBehaviors: behaviors,
  });
  await aggregateFoundational({ tenantId: 'tenant-A', domainId: DOMAIN, densityUpdates: [mk(0.99, { shape_depth: 3 })] });
  await aggregateFoundational({ tenantId: 'tenant-B', domainId: DOMAIN, densityUpdates: [mk(0.95, { fanout: 4 })] });
  await aggregateDomain({ tenantId: 'tenant-A', domainId: DOMAIN, densityUpdates: [mk(0.99, { shape_depth: 3 })] });
  await aggregateDomain({ tenantId: 'tenant-B', domainId: DOMAIN, densityUpdates: [mk(0.95, { fanout: 4 })] });

  const { data: f } = await (sb as any).from('foundational_patterns').select('*').eq('pattern_signature', SIG).maybeSingle();
  const { data: d } = await (sb as any).from('domain_patterns').select('*').eq('pattern_signature', SIG).eq('domain_id', DOMAIN).maybeSingle();
  const wroteStructural = !!f && f.tenant_count === 2 && typeof f.confidence_mean === 'number'
    && typeof f.confidence_variance === 'number' && f.confidence_variance > 0
    && f.learned_behaviors && 'shape_depth' in f.learned_behaviors && 'fanout' in f.learned_behaviors;
  console.log(`(A) foundational row: tenant_count=${f?.tenant_count} mean=${f?.confidence_mean?.toFixed?.(4)} variance=${f?.confidence_variance?.toFixed?.(6)} behaviors=${JSON.stringify(f?.learned_behaviors)}`);
  console.log(`    domain row: tenant_count=${d?.tenant_count} behaviors=${JSON.stringify(d?.learned_behaviors)}`);
  console.log(`    [aggregation writes structural mean+variance+merged behaviors] ${wroteStructural ? 'PASS' : 'FAIL'}`);

  // (B) PRIVACY FIREWALL — the cross-tenant rows carry NO tenant-identifying field (schema has no tenant_id).
  const idKeys = /tenant_id|entity_id|source_file|display_name|raw_value/i; // tenant_count is permitted structural
  const fKeys = Object.keys(f ?? {}).filter((k) => idKeys.test(k));
  const dKeys = Object.keys(d ?? {}).filter((k) => idKeys.test(k));
  const firewallOk = fKeys.length === 0 && dKeys.length === 0;
  console.log(`(B) tenant-identifying columns on cross-tenant rows: foundational=[${fKeys}] domain=[${dKeys}]  [firewall] ${firewallOk ? 'PASS' : 'FAIL'}`);

  // (C) COLD-START — a fresh tenant loads the prior (confidence > 0.5) and reaches light_trace SOONER.
  const priors = await loadColdStartPriors(DOMAIN);
  const prior = priors.get(SIG);
  const coldDensity = applyPriorsToEmptyDensity(priors);
  const seededConf = coldDensity.get(SIG)?.confidence ?? 0;
  const K = 3;
  const coldStart = fullTraceEncounters(seededConf, K);   // begins at prior × 0.6
  const trueCold = fullTraceEncounters(0.5, K);            // begins at the default 0.5 (no prior)
  const confAbove = seededConf > 0.5;
  const fewerFull = coldStart.full < trueCold.full;
  console.log(`(C) prior confidence_mean=${prior?.confidence?.toFixed(4)} → discounted ×${COLD_START_DISCOUNT}=${seededConf.toFixed(4)} (>0.5: ${confAbove})`);
  console.log(`    cold-start encounters: [${coldStart.trace.join(', ')}] → full_trace=${coldStart.full}`);
  console.log(`    true-cold  encounters: [${trueCold.trace.join(', ')}] → full_trace=${trueCold.full}`);
  console.log(`    [cold-start: conf>0.5 AND fewer full_trace ops] ${confAbove && fewerFull ? 'PASS' : 'FAIL'}`);

  await cleanup();
  const pass = wroteStructural && firewallOk && confAbove && fewerFull;
  console.log(`\nPG-5: ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
