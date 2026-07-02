// OB-257 P0 completeness-critic HALT-2 second-clause probe (NO DB WRITES, no persist).
// HALT-2 says: "BCL ... lacks a convergence-resolvable revenue-measure role AND no
// Decision-158-compliant derivation exists without reimport." The convergence agent proved the
// first clause (rule_sets convergence_bindings carry no revenue identity). This probe tests the
// second clause empirically: run the EXACT HF-337 recognize() LLM step (same SYSTEM prompt, same
// payload shape, same purpose text the Financial route uses for its revenue surface) against BCL's
// live comprehension_artifacts — WITHOUT step-4 persistence (no surface_bindings write, no signal).
// Run: npx tsx --env-file=.env.local scripts/ob257-p0-h-critic-halt2-probe.ts
import { createClient } from '@supabase/supabase-js';
import { streamAnthropicText, stripFences, parseJsonObjectTolerant } from '../src/lib/ai/anthropic-stream';
import { defaultModel } from '../src/lib/ai/model-policy';
/* eslint-disable @typescript-eslint/no-explicit-any */

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

// Verbatim from surface-binding-recognition.ts (SYSTEM) — byte-identical prompt.
const SYSTEM = [
  'You match a data analysis SURFACE to the comprehended field(s) that satisfy its purpose.',
  'You are given a free-form analytical PURPOSE and the list of comprehended FIELDS (each with a free-form',
  'characterization of what it means). Decide which field(s) — if any — satisfy the purpose, by MEANING.',
  'There is NO fixed list of answers and NO categories: judge each field by its characterization against',
  'the purpose, in the data\'s own terms.',
  'Return ONLY a JSON object: {"satisfying_fields":[{"field":"<exact field name>","confidence":0.0-1.0}],',
  '"unresolved":<true if NO field satisfies the purpose>}. Order by confidence, best first. If nothing',
  'satisfies the purpose, return an empty array and unresolved=true — do not force a weak match.',
].join('\n');

// The Financial route's live revenue purpose (route.ts:361), reused verbatim as the probe purpose.
const PURPOSE = 'the primary monetary amount of money earned or charged as the gross outcome of each transaction or sale';

(async () => {
  const { data: comp, error } = await sb.from('comprehension_artifacts')
    .select('field_name, characterization, data_nature, relationships, aggregation_behavior, identifies, display_label')
    .eq('tenant_id', BCL);
  if (error) { console.log('comprehension read ERR:', error.message); process.exit(1); }
  const rows = (comp ?? []) as any[];
  console.log(`BCL comprehension_artifacts: ${rows.length} fields:`, rows.map(r => r.field_name).join(', '));

  const user = JSON.stringify({
    purpose: PURPOSE,
    fields: rows.map((r) => ({
      field: r.field_name, characterization: r.characterization, data_nature: r.data_nature,
      relationships: r.relationships, aggregation_behavior: r.aggregation_behavior, identifies: r.identifies,
    })),
  });
  const model = defaultModel();
  console.log('model:', model, '| purpose:', PURPOSE);
  const text = await streamAnthropicText({ model, system: SYSTEM, user, maxTokens: 1500, label: 'ob257-critic-halt2-probe' });
  const parsed = parseJsonObjectTolerant(stripFences(text));
  console.log('LLM recognition result (NOT persisted):', JSON.stringify(parsed, null, 2));
})();
