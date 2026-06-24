// OB-235 P7 proof — convergence consumes prior Level-2 comprehension from the CANONICAL surface before its
// independent AI call (TMR-C93). Deterministic (no LLM): seed comprehension_artifacts + a
// comprehension_correction signal for a synthetic tenant, recall, and prove (i) the recall reads the
// Level-2 comprehension content, (ii) a human correction on the canonical surface is overlaid, (iii) the
// enriched candidate line a warm binding call reads is strictly richer than the cold line, (iv) Korean Test
// — a Hangul column with a Hangul characterization recalls identically (keys on column name, not language).
// Run: npx tsx --env-file=.env.local scripts/_ob235-p7-proof.ts
import { createClient } from '@supabase/supabase-js';
import { recallComprehensionForColumns, enrichCandidateIdentity } from '../src/lib/learning/convergence-recall';
import { recordComprehensionCorrection } from '../src/lib/signals/comprehension-correction';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
// Real tenant (FK on tenant_id) but SYNTHETIC, prefixed field names so no real comprehension row is touched.
const T = 'f7093bcc-e90b-4918-9680-69da7952dd65'; // Sabor (real tenant)
const P = '__ob235p7_';
const C1 = `${P}amount_collected`, C2 = `${P}outstanding_balance`;
const HANGUL = `${P}판매수량`; // prefixed Hangul column — "sales quantity" (Korean Test)

async function cleanup() {
  await sb.from('comprehension_artifacts').delete().eq('tenant_id', T).in('field_name', [C1, C2, HANGUL]);
  // remove only our proof corrections (matched on the prefixed field_name inside signal_value)
  const { data } = await (sb as any).from('classification_signals').select('id, signal_value')
    .eq('tenant_id', T).eq('signal_type', 'comprehension_correction');
  const ids = (data ?? []).filter((s: any) => typeof s.signal_value?.field_name === 'string' && s.signal_value.field_name.startsWith(P)).map((s: any) => s.id);
  if (ids.length) await (sb as any).from('classification_signals').delete().in('id', ids);
}

async function main() {
  console.log('=== OB-235 P7 proof: convergence consumes prior Level-2 comprehension (canonical surface) ===\n');
  await cleanup();

  // Seed Level-2 comprehension (the OB-233 store) for three columns, one Hangul-named + Hangul-described.
  const now = new Date().toISOString();
  await sb.from('comprehension_artifacts').upsert([
    { tenant_id: T, field_name: C1, characterization: 'Cash collected per transaction', data_nature: 'currency, per-event flow', aggregation_behavior: 'summed across transactions for the entity', identifies: null, updated_at: now },
    { tenant_id: T, field_name: C2, characterization: 'Account balance outstanding', data_nature: 'currency, point-in-time stock', aggregation_behavior: 'a point-in-time value, the same on every row — take it once', identifies: null, updated_at: now },
    { tenant_id: T, field_name: HANGUL, characterization: '거래당 판매된 단위 수량', data_nature: '정수, 거래별', aggregation_behavior: '거래 전반에 걸쳐 합산됨', identifies: null, updated_at: now },
  ], { onConflict: 'tenant_id,field_name' });

  // Record a human correction on the CANONICAL surface for one field (the read-path target).
  await recordComprehensionCorrection(sb, { tenantId: T, fieldName: C2, correction: 'This is an assigned quota, NOT a balance — snapshot, never summed', actorId: 'proof' });

  // RECALL (the convergence read-path).
  const cols = [C1, C2, HANGUL, `${P}no_comprehension_col`];
  const prior = await recallComprehensionForColumns(sb, T, cols);

  const gotContent = prior.has(C1) && prior.has(C2) && prior.has(HANGUL);
  const correction = prior.get(C2)?.correction;
  const gotCorrection = !!correction && /assigned quota/.test(correction);
  const hangul = prior.get(HANGUL);
  const koreanClean = !!hangul && hangul.characterization === '거래당 판매된 단위 수량' && hangul.aggregationBehavior === '거래 전반에 걸쳐 합산됨';
  const coldMiss = !prior.has(`${P}no_comprehension_col`); // graceful absence, never an error

  // Enriched (warm) vs un-enriched (cold) candidate identity lines.
  const baseLine = `    - "${C2}" (type=measure, identity=inferred_numeric) [min=0, max=900, mean=300.00]`;
  const warmLine = enrichCandidateIdentity(baseLine, prior.get(C2));
  const coldLine = enrichCandidateIdentity(baseLine, undefined);
  const warmRicher = warmLine.length > coldLine.length && warmLine.includes('learned:') && warmLine.includes('human correction:');
  const coldUnchanged = coldLine === baseLine; // a column with no prior is byte-identical to pre-P7

  console.log('recalled Level-2 comprehension content (3 cols):', gotContent ? 'PASS' : 'FAIL');
  console.log('human correction overlaid from canonical surface :', gotCorrection ? 'PASS' : 'FAIL', `— "${correction ?? ''}"`);
  console.log('Korean Test (Hangul col + Hangul desc recalled)  :', koreanClean ? 'PASS' : 'FAIL');
  console.log('graceful miss (no comprehension → absent, no err) :', coldMiss ? 'PASS' : 'FAIL');
  console.log('cold candidate line byte-identical to pre-P7     :', coldUnchanged ? 'PASS' : 'FAIL');
  console.log('warm candidate line strictly richer than cold    :', warmRicher ? 'PASS' : 'FAIL');
  console.log('\n--- cold line (comprehension absent) ---\n' + coldLine);
  console.log('\n--- warm line (comprehension consumed) ---\n' + warmLine);

  await cleanup();
  const allPass = gotContent && gotCorrection && koreanClean && coldMiss && coldUnchanged && warmRicher;
  console.log(`\nPG-7: ${allPass ? 'PASS' : 'FAIL'}`);
  if (!allPass) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
