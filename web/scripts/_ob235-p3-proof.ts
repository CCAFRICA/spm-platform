// OB-235 P3 proof — comprehension recall: warm pass = 0 Anthropic calls INCLUDING the label/method call.
// Cold→warm on Sabor (existing committed_data; no re-upload). The single total counter in
// streamAnthropicText counts ALL three call types (comprehension, coverage-retry, label/method).
// Run: npx tsx --env-file=.env.local scripts/_ob235-p3-proof.ts
import { createClient } from '@supabase/supabase-js';
import { generateComprehension } from '../src/lib/summary/comprehension-generator';
import { recognizeLabelsAndMethods } from '../src/lib/summary/summary-engine';
import { resetAnthropicCallCount, getAnthropicCallCount, getAnthropicCallCountsByLabel } from '../src/lib/ai/anthropic-stream';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const SABOR = 'f7093bcc-e90b-4918-9680-69da7952dd65';

async function snapshot(): Promise<string> {
  const { data } = await sb.from('comprehension_artifacts').select('field_name, characterization').eq('tenant_id', SABOR).order('field_name');
  return JSON.stringify(data);
}

async function main() {
  console.log('=== OB-235 P3 proof: comprehension recall (warm = 0, incl. label/method) ===\n');

  // Force a true COLD state: drop the comprehension fingerprint + null labels/methods (so recall misses
  // AND the label/method call must run cold — proving the counter captures it).
  await (sb as any).from('structural_fingerprints').delete().eq('tenant_id', SABOR).eq('classification_result->>kind', 'comprehension');
  await sb.from('comprehension_artifacts').update({ display_label: null, aggregation_method: null }).eq('tenant_id', SABOR);
  console.log('forced cold: dropped comprehension fingerprint + nulled labels/methods\n');

  // RUN 1 — cold
  resetAnthropicCallCount();
  const t0 = Date.now();
  await generateComprehension(sb, SABOR);
  await recognizeLabelsAndMethods(sb, SABOR);
  const coldMs = Date.now() - t0;
  const cold = getAnthropicCallCount();
  const coldByLabel = getAnthropicCallCountsByLabel();
  const snap1 = await snapshot();
  console.log(`RUN 1 (cold):  total Anthropic calls = ${cold}  byLabel=${JSON.stringify(coldByLabel)}  (+${coldMs}ms)`);

  // RUN 2 — warm
  resetAnthropicCallCount();
  const t1 = Date.now();
  await generateComprehension(sb, SABOR);
  await recognizeLabelsAndMethods(sb, SABOR);
  const warmMs = Date.now() - t1;
  const warm = getAnthropicCallCount();
  const warmByLabel = getAnthropicCallCountsByLabel();
  const snap2 = await snapshot();
  console.log(`RUN 2 (warm):  total Anthropic calls = ${warm}  byLabel=${JSON.stringify(warmByLabel)}  (+${warmMs}ms)`);

  console.log('');
  console.log(`[warm == 0 INCLUDING label/method]  ${warm === 0 ? 'PASS' : 'FAIL'}  (cold counted ${cold}, incl. ${coldByLabel['label+method'] ?? 0} label/method call(s))`);
  console.log(`[byte-identical comprehension reuse] ${snap1 === snap2 ? 'PASS' : 'FAIL'}`);
  console.log(`[latency drop] cold ${coldMs}ms -> warm ${warmMs}ms : ${warmMs < coldMs ? 'PASS' : 'n/a'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
