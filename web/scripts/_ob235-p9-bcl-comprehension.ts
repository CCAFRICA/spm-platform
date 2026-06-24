// OB-235 P9 — BCL comprehension measurement for the PG-9 headline (Sabor's is PG-3). Cold→warm on BCL
// (real tenant) via the live generateComprehension + recognizeLabelsAndMethods, counting ALL Anthropic
// calls (comprehension + coverage-retry + label/method). Warm must be 0 incl. the label/method call.
// Run: npx tsx --env-file=.env.local scripts/_ob235-p9-bcl-comprehension.ts
import { createClient } from '@supabase/supabase-js';
import { generateComprehension } from '../src/lib/summary/comprehension-generator';
import { recognizeLabelsAndMethods } from '../src/lib/summary/summary-engine';
import { resetAnthropicCallCount, getAnthropicCallCount, getAnthropicCallCountsByLabel } from '../src/lib/ai/anthropic-stream';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
/* eslint-disable @typescript-eslint/no-explicit-any */
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function snapshot(): Promise<string> {
  const { data } = await sb.from('comprehension_artifacts').select('field_name, characterization').eq('tenant_id', BCL).order('field_name');
  return JSON.stringify(data);
}

async function main() {
  console.log('=== OB-235 P9 BCL comprehension (warm = 0 incl. label/method) ===\n');
  await (sb as any).from('structural_fingerprints').delete().eq('tenant_id', BCL).eq('classification_result->>kind', 'comprehension');
  await sb.from('comprehension_artifacts').update({ display_label: null, aggregation_method: null }).eq('tenant_id', BCL);

  resetAnthropicCallCount();
  const t0 = Date.now();
  await generateComprehension(sb, BCL);
  await recognizeLabelsAndMethods(sb, BCL);
  const coldMs = Date.now() - t0, cold = getAnthropicCallCount(), coldBy = getAnthropicCallCountsByLabel();
  const snap1 = await snapshot();
  console.log(`RUN 1 (cold):  calls=${cold}  byLabel=${JSON.stringify(coldBy)}  (+${coldMs}ms)`);

  resetAnthropicCallCount();
  const t1 = Date.now();
  await generateComprehension(sb, BCL);
  await recognizeLabelsAndMethods(sb, BCL);
  const warmMs = Date.now() - t1, warm = getAnthropicCallCount();
  const snap2 = await snapshot();
  console.log(`RUN 2 (warm):  calls=${warm}  byLabel=${JSON.stringify(getAnthropicCallCountsByLabel())}  (+${warmMs}ms)`);

  console.log('');
  console.log(`[warm == 0 incl. label/method] ${warm === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`[byte-identical reuse]         ${snap1 === snap2 ? 'PASS' : 'FAIL'}`);
  console.log(`[latency drop] cold ${coldMs}ms -> warm ${warmMs}ms ${warmMs < coldMs ? 'PASS' : 'n/a'}`);
  if (!(warm === 0 && snap1 === snap2)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
