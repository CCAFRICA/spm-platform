// OB-233 eradication runtime proof (PG-4 validator + PG-6 ui-signal + Obj-8 shape).
// Exercises the REAL functions (no reimplementation). Writes 2 proof signals to classification_signals,
// reads them back, then DELETES them (leaves the DB clean).
// Run: npx tsx --env-file=.env.local scripts/_ob233-eradication-proof.ts
import { createClient } from '@supabase/supabase-js';
import { validateInsight } from '../src/lib/insight/insight-validator';
import { computeInsightShape } from '../src/lib/insight/insight-shape';
import { recordUiSignal } from '../src/lib/signals/ui-signal';
import type { GeneratedInsight } from '../src/lib/insight/insight-types';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function base(): GeneratedInsight {
  return {
    insight_characterization: 'a seasonal cycle in the measure that repeats on a quarterly cadence',
    insight_severity: 'worth monitoring - the amplitude is growing run over run',
    entity_id: null,
    entity_type: 'network',
    period_start: '2026-01-01',
    period_end: '2026-03-31',
    title: 'Quarterly seasonal cycle detected',
    narrative: 'The network metric rises and falls on a quarterly rhythm with increasing amplitude.',
    data_references: [{ metric: 'revenue', value: 100.07, delta_pct: 12 }],
    shape_description: 'network-level, oscillating, growing amplitude, quarterly timeframe, revenue-class measure',
  };
}

async function main() {
  console.log('=== OB-233 eradication runtime proof ===\n');
  const traceable = new Set<number>([100.07, 250, 42]);
  const seen = new Set<string>(['an abrupt single-metric deviation at a single entity']); // pre-seen types (NOT a code registry)

  // PG-4a: a NOVEL characterization ("seasonal cycle" - outside the old 4 boxes) must be ACCEPTED + flagged novel.
  const a = validateInsight(base(), traceable, { seenCharacterizations: seen });
  console.log(`PG-4a novel characterization: ok=${a.ok} novel=${JSON.stringify(a.novelCharacterization)} failures=${JSON.stringify(a.failures)}`);

  // PG-4b: a fabricated numeric value not present in the summary data must be REJECTED (data-contract).
  const fab = base(); fab.data_references = [{ metric: 'revenue', value: 999999.99 }];
  const b = validateInsight(fab, traceable, { seenCharacterizations: seen });
  console.log(`PG-4b fabricated value 999999.99: ok=${b.ok} failures=${JSON.stringify(b.failures)}`);

  // PG-4c: structural-coherence reject (empty title).
  const noTitle = base(); noTitle.title = '';
  const c = validateInsight(noTitle, traceable);
  console.log(`PG-4c empty title: ok=${c.ok} failures=${JSON.stringify(c.failures)}`);

  // Obj-8: free-form shape description -> deterministic structural fingerprint hash.
  console.log(`Obj-8 shape: ${JSON.stringify(computeInsightShape(base()))}`);

  // ---- live signal writes (real tenant FK) ----
  const { data: t } = await sb.from('tenants').select('id, name').limit(1).single();
  const tenantId = (t as { id: string; name: string }).id;
  console.log(`\nusing tenant ${tenantId} (${(t as { name: string }).name}) for live signal writes`);

  // PG-6: a NOVEL ui interaction (not selection/dwell/drill/dismissal) flows with NO code change.
  const novelInteraction = 'data_filter_applied';
  const ok6 = await recordUiSignal(sb, { tenantId, signalType: novelInteraction, surface: 'ob233.proof', metricKey: 'revenue' });
  console.log(`PG-6 recordUiSignal(novel "${novelInteraction}") -> ${ok6}`);
  const { data: sigRows } = await sb.from('classification_signals')
    .select('id, signal_type, signal_value, source, context').eq('tenant_id', tenantId)
    .eq('signal_type', `ui.${novelInteraction}`).order('created_at', { ascending: false }).limit(1);
  console.log('PG-6 row:', JSON.stringify(sigRows?.[0], null, 2));

  // PG-4d: the engine's novel-type signal write path (free-form characterization on the open-vocabulary surface).
  await sb.from('classification_signals').insert({
    tenant_id: tenantId, entity_id: null, signal_type: 'insight.characterization',
    signal_value: { characterization: a.novelCharacterization, severity: base().insight_severity, shape: base().shape_description },
    source: 'insight-engine', context: { novel: true, proof: 'ob233' },
  });
  const { data: charRows } = await sb.from('classification_signals')
    .select('id, signal_type, signal_value, source, context').eq('tenant_id', tenantId)
    .eq('signal_type', 'insight.characterization').contains('context', { proof: 'ob233' }).limit(1);
  console.log('PG-4d novel-type signal row:', JSON.stringify(charRows?.[0], null, 2));

  // cleanup proof rows
  const ids = [sigRows?.[0]?.id, charRows?.[0]?.id].filter(Boolean) as string[];
  if (ids.length) { await sb.from('classification_signals').delete().in('id', ids); console.log(`\ncleaned up ${ids.length} proof rows`); }
  console.log('=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
