// OB-235 P6 proof — the Multiplier-of-five. ONE Level-2 comprehension correction fans into five updates:
// (1) tenant comprehension, (2) foundational pattern, (3) domain pattern, (4) the next convergence read
// (P7), (5) surface_bindings invalidation. Real consumer + real tables; Sabor tenant; synthetic field /
// surface / domain / pattern signature so no real data is touched.
// Run: npx tsx --env-file=.env.local scripts/_ob235-p6-proof.ts
import { createClient } from '@supabase/supabase-js';
import { consumeComprehensionCorrection, comprehensionPatternSignature } from '../src/lib/learning/correction-consumer';
import { recordComprehensionCorrection } from '../src/lib/signals/comprehension-correction';
import { aggregateFoundational, aggregateDomain } from '../src/lib/calculation/flywheel-pipeline';
import { recallComprehensionForColumns } from '../src/lib/learning/convergence-recall';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const T = 'f7093bcc-e90b-4918-9680-69da7952dd65'; // Sabor (real tenant)
const FIELD = '__ob235p6_field';
const SURFACE = '__ob235p6_surface';
const FP = '__ob235p6_fp';
const DOMAIN = '__ob235p6_domain';
const CORRECTION = 'This field is an assigned quota measured per period, not a running balance';

async function cleanup() {
  await sb.from('comprehension_artifacts').delete().eq('tenant_id', T).eq('field_name', FIELD);
  await (sb as any).from('surface_bindings').delete().eq('tenant_id', T).eq('surface_id', SURFACE);
  await (sb as any).from('domain_patterns').delete().eq('domain_id', DOMAIN);
  const sig = comprehensionPatternSignature({ data_nature: 'x', aggregation_behavior: 'x', characterization: CORRECTION });
  await (sb as any).from('foundational_patterns').delete().eq('pattern_signature', sig);
  const { data } = await (sb as any).from('classification_signals').select('id, signal_value').eq('tenant_id', T).eq('signal_type', 'comprehension_correction');
  const ids = (data ?? []).filter((s: any) => s.signal_value?.field_name === FIELD).map((s: any) => s.id);
  if (ids.length) await (sb as any).from('classification_signals').delete().in('id', ids);
}

async function main() {
  console.log('=== OB-235 P6 proof: the Multiplier-of-five (one correction → five updates) ===\n');
  await cleanup();
  const now = new Date().toISOString();

  // Seed the field's comprehension (the ORIGINAL, to-be-corrected interpretation).
  const seedArt = { data_nature: 'currency', relationships: null, aggregation_behavior: 'summed across rows', identifies: null };
  await sb.from('comprehension_artifacts').upsert({
    tenant_id: T, field_name: FIELD, characterization: 'A running balance that accumulates across transactions',
    ...seedArt, updated_at: now,
  }, { onConflict: 'tenant_id,field_name' });

  // The signature the consumer will target (from the CORRECTED shape — characterization := correction).
  const sig = comprehensionPatternSignature({ ...seedArt, characterization: CORRECTION });
  // Seed foundational + domain HIGH so the correction's lowering delta shows a clear shift.
  const seedDelta = [{ patternSignature: sig, confidence: 0.95, executionCount: 10, anomalyRate: 0, learnedBehaviors: { seeded: true } }];
  await aggregateFoundational({ tenantId: 'seed-tenant', domainId: DOMAIN, densityUpdates: seedDelta });
  await aggregateDomain({ tenantId: 'seed-tenant', domainId: DOMAIN, densityUpdates: seedDelta });

  // Seed a surface_bindings row that RESOLVED against the field (the to-be-invalidated binding).
  await (sb as any).from('surface_bindings').upsert({
    tenant_id: T, structural_fingerprint_hash: FP, surface_id: SURFACE, purpose_text: 'some purpose',
    resolved_fields: [{ field_name: FIELD, display_label: 'X', confidence: 0.9 }], confidence: 0.9, recognized_by: 'proof', updated_at: now,
  }, { onConflict: 'tenant_id,structural_fingerprint_hash,surface_id' });

  const fBefore = (await (sb as any).from('foundational_patterns').select('confidence_mean').eq('pattern_signature', sig).maybeSingle()).data?.confidence_mean;
  const dBefore = (await (sb as any).from('domain_patterns').select('confidence_mean').eq('pattern_signature', sig).eq('domain_id', DOMAIN).maybeSingle()).data?.confidence_mean;

  // ── INJECT one correction on the canonical surface, then consume it ──────────────────────────────────
  await recordComprehensionCorrection(sb, { tenantId: T, fieldName: FIELD, correction: CORRECTION, actorId: 'proof' });
  const r = await consumeComprehensionCorrection(sb, { tenantId: T, fieldName: FIELD, correction: CORRECTION, domainId: DOMAIN });

  // ── Verify the five updates ─────────────────────────────────────────────────────────────────────────
  const art = (await sb.from('comprehension_artifacts').select('characterization').eq('tenant_id', T).eq('field_name', FIELD).maybeSingle()).data;
  const m1 = art?.characterization === CORRECTION;

  const fAfter = (await (sb as any).from('foundational_patterns').select('confidence_mean').eq('pattern_signature', sig).maybeSingle()).data?.confidence_mean;
  const m2 = typeof fAfter === 'number' && typeof fBefore === 'number' && fAfter < fBefore;

  const dAfter = (await (sb as any).from('domain_patterns').select('confidence_mean').eq('pattern_signature', sig).eq('domain_id', DOMAIN).maybeSingle()).data?.confidence_mean;
  const m3 = typeof dAfter === 'number' && typeof dBefore === 'number' && dAfter < dBefore;

  const bindingGone = !(await (sb as any).from('surface_bindings').select('id').eq('tenant_id', T).eq('surface_id', SURFACE).maybeSingle()).data;
  const m5 = r.bindingsInvalidated >= 1 && bindingGone;

  // Multiplier 4 — the next CONVERGENCE recall now reads the corrected comprehension + the correction overlay.
  const prior = await recallComprehensionForColumns(sb, T, [FIELD]);
  const m4 = prior.get(FIELD)?.characterization === CORRECTION && !!prior.get(FIELD)?.correction;

  console.log(`(1) tenant comprehension updated:   "${art?.characterization}"  ${m1 ? 'PASS' : 'FAIL'}`);
  console.log(`(2) foundational confidence shifted: ${fBefore?.toFixed?.(4)} → ${fAfter?.toFixed?.(4)}  ${m2 ? 'PASS' : 'FAIL'}`);
  console.log(`(3) domain confidence shifted:       ${dBefore?.toFixed?.(4)} → ${dAfter?.toFixed?.(4)}  ${m3 ? 'PASS' : 'FAIL'}`);
  console.log(`(4) next convergence recall reflects: corrected=${prior.get(FIELD)?.characterization === CORRECTION} correctionOverlay=${!!prior.get(FIELD)?.correction}  ${m4 ? 'PASS' : 'FAIL'}`);
  console.log(`(5) surface_bindings invalidated:    count=${r.bindingsInvalidated} gone=${bindingGone}  ${m5 ? 'PASS' : 'FAIL'}`);

  await cleanup();
  const pass = m1 && m2 && m3 && m4 && m5;
  console.log(`\nPG-6 (Multiplier-of-five): ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
