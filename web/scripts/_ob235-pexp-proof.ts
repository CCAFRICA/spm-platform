// OB-235 P-EXP proof — cross-tenant expression-binding inheritance (the guarded layer). Donor = Sabor,
// Receiver = BCL (both real tenants; FK satisfied). A SYNTHETIC surface_id is used so NO real binding is
// touched. recognize() computes the fingerprint from the receiver's FULL comprehension, so we read BCL's
// real comprehension, compute the fingerprint, and seed a donor surface_bindings row at that fingerprint.
// Proves: (i) inherit at cold-start with 0 recognition LLM calls at discounted confidence; (ii) the
// verification guard FIRING — an inherited prior that fails the receiving-comprehension check is DISCARDED
// and the tenant's own LLM recognition runs; (iii) HF-337 PG-PATHA re-proven (same-tenant read-back
// fromCache=true, no LLM); (iv) NO-REGISTRY (separate grep). Run: npx tsx --env-file=.env.local scripts/_ob235-pexp-proof.ts
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { recognize } from '../src/lib/comprehension/surface-binding-recognition';
import { purposeCharacterizationSimilarity, VERIFY_THRESHOLD, INHERITANCE_DISCOUNT } from '../src/lib/learning/expression/binding-inheritance';
import { resetAnthropicCallCount, getAnthropicCallCount } from '../src/lib/ai/anthropic-stream';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const DONOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';                 // Sabor
const RECEIVER = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';             // BCL
const SURFACE = '__ob235pexp.synthetic_surface';                     // synthetic — no real binding touched
const SEP = '␟';                                                     // must match surface-binding-recognition.ts SEP

function fingerprintOf(names: string[]): string {
  return createHash('sha256').update(names.slice().sort().join(SEP)).digest('hex');
}
async function cleanup() {
  await sb.from('surface_bindings').delete().in('tenant_id', [DONOR, RECEIVER]).eq('surface_id', SURFACE);
  const { data } = await (sb as any).from('classification_signals').select('id, signal_value')
    .in('tenant_id', [DONOR, RECEIVER]).eq('signal_type', 'surface_binding_recognition');
  const ids = (data ?? []).filter((s: any) => s.signal_value?.surface_id === SURFACE).map((s: any) => s.id);
  if (ids.length) await (sb as any).from('classification_signals').delete().in('id', ids);
}

async function main() {
  console.log('=== OB-235 P-EXP proof: cross-tenant expression-binding inheritance ===\n');
  await cleanup();

  // Receiver comprehension drives the fingerprint + supplies the field characterizations the guard checks.
  const { data: comp } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, display_label').eq('tenant_id', RECEIVER);
  const rows = (comp ?? []) as any[];
  if (rows.length === 0) { console.error('BCL has no comprehension — cannot run P-EXP proof'); process.exit(1); }
  const fingerprint = fingerprintOf(rows.map((r) => r.field_name));
  console.log(`receiver=BCL comprehension fields=${rows.length} fingerprint=${fingerprint.slice(0, 16)}…\n`);

  // PASS case: a purpose that ECHOES one field's characterization (high lexical overlap → verify PASS).
  const fieldMatch = rows.find((r) => typeof r.characterization === 'string' && r.characterization.trim().split(/\s+/).length >= 4) ?? rows[0];
  const purpose = String(fieldMatch.characterization); // the surface's purpose == that field's own characterization → max overlap
  // FAIL case: the field whose characterization has the LOWEST overlap with that same purpose (verify FAIL).
  let fieldMismatch = rows[0]; let lo = Infinity;
  for (const r of rows) {
    if (r.field_name === fieldMatch.field_name) continue;
    const s = purposeCharacterizationSimilarity(purpose, String(r.characterization ?? ''));
    if (s < lo) { lo = s; fieldMismatch = r; }
  }
  const simMatch = purposeCharacterizationSimilarity(purpose, String(fieldMatch.characterization ?? ''));
  const simMismatch = purposeCharacterizationSimilarity(purpose, String(fieldMismatch.characterization ?? ''));
  console.log(`PASS field="${fieldMatch.field_name}" sim=${simMatch.toFixed(3)} (≥ ${VERIFY_THRESHOLD})`);
  console.log(`FAIL field="${fieldMismatch.field_name}" sim=${simMismatch.toFixed(3)} (< ${VERIFY_THRESHOLD})\n`);

  const seedDonor = async (resolvedField: any, conf: number) => {
    await sb.from('surface_bindings').upsert({
      tenant_id: DONOR, structural_fingerprint_hash: fingerprint, surface_id: SURFACE, purpose_text: purpose,
      resolved_fields: [{ field_name: resolvedField.field_name, display_label: resolvedField.display_label ?? null, confidence: conf }],
      confidence: conf, recognized_by: 'proof-donor', updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,structural_fingerprint_hash,surface_id' });
  };

  // ── (i) INHERIT at cold-start: verify PASS → discounted prior, 0 LLM calls ───────────────────────────
  await seedDonor(fieldMatch, 0.9);
  await sb.from('surface_bindings').delete().eq('tenant_id', RECEIVER).eq('surface_id', SURFACE); // receiver cold
  resetAnthropicCallCount();
  const r1 = await recognize(sb, RECEIVER, SURFACE, purpose);
  const c1 = getAnthropicCallCount();
  const inheritOk = r1.status === 'resolved' && (r1 as any).inherited === true && c1 === 0
    && Math.abs(r1.confidence - 0.9 * INHERITANCE_DISCOUNT) < 1e-6 && r1.fields[0]?.field_name === fieldMatch.field_name;
  console.log(`(i) inherit cold-start: status=${r1.status} inherited=${(r1 as any).inherited} llmCalls=${c1} conf=${r1.status === 'resolved' ? r1.confidence : '-'} (donor 0.9 ×${INHERITANCE_DISCOUNT}=${0.9 * INHERITANCE_DISCOUNT}) → ${inheritOk ? 'PASS' : 'FAIL'}`);

  // ── (iii) HF-337 PG-PATHA re-proven: same-tenant read-back, fromCache=true, NO LLM ───────────────────
  resetAnthropicCallCount();
  const r2 = await recognize(sb, RECEIVER, SURFACE, purpose);
  const c2 = getAnthropicCallCount();
  const pathaOk = (r2 as any).fromCache === true && c2 === 0 && r2.status === 'resolved';
  console.log(`(iii) PG-PATHA read-back: fromCache=${(r2 as any).fromCache} llmCalls=${c2} → ${pathaOk ? 'PASS' : 'FAIL'} (additive edit did not regress the cache path)`);

  // ── (ii) VERIFICATION GUARD FIRES: verify FAIL → prior DISCARDED → own LLM recognition runs ───────────
  await sb.from('surface_bindings').delete().eq('tenant_id', RECEIVER).eq('surface_id', SURFACE); // receiver cold again
  await seedDonor(fieldMismatch, 0.9); // donor now binds a field whose receiving characterization fails the guard
  resetAnthropicCallCount();
  const r3 = await recognize(sb, RECEIVER, SURFACE, purpose);
  const c3 = getAnthropicCallCount();
  const guardOk = (r3 as any).inherited !== true && c3 >= 1; // discarded the prior, ran its own recognition
  console.log(`(ii) guard fires: inherited=${(r3 as any).inherited ?? false} llmCalls=${c3} (≥1 = own recognition ran) status=${r3.status} → ${guardOk ? 'PASS' : 'FAIL'}`);

  await cleanup();
  const allPass = inheritOk && pathaOk && guardOk;
  console.log(`\nPG-EXP: ${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
