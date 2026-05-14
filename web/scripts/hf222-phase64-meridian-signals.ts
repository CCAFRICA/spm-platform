// HF-222 Phase 6.4 M.3 — Meridian classification_signals trace post-Phase-6.3 recalc.
import { createClient } from '@supabase/supabase-js';

const MERIDIAN = '5035b1e8-0754-4527-b7ec-9f93f85e4c79';
const SINCE = '2026-05-13T23:00:00Z';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // (a) Per-type counts + time range.
  const { data: all } = await sb.from('classification_signals')
    .select('signal_type, created_at')
    .eq('tenant_id', MERIDIAN)
    .gt('created_at', SINCE);

  const agg: Record<string, { count: number; earliest: string; latest: string }> = {};
  for (const s of all ?? []) {
    if (!agg[s.signal_type]) agg[s.signal_type] = { count: 0, earliest: s.created_at, latest: s.created_at };
    agg[s.signal_type].count++;
    if (s.created_at < agg[s.signal_type].earliest) agg[s.signal_type].earliest = s.created_at;
    if (s.created_at > agg[s.signal_type].latest) agg[s.signal_type].latest = s.created_at;
  }
  console.log('=== signal_type counts (Meridian, since ' + SINCE + ') ===');
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${k}: count=${v.count}, earliest=${v.earliest}, latest=${v.latest}`);
  }

  // (b) Up to 3 example rows per signal_type with full signal_value.
  console.log('\n=== Example signal_value JSONB per signal_type (up to 3 per type, most recent) ===');
  for (const signalType of Object.keys(agg)) {
    const { data: examples } = await sb.from('classification_signals')
      .select('signal_type, signal_value, confidence, source, created_at')
      .eq('tenant_id', MERIDIAN)
      .eq('signal_type', signalType)
      .gt('created_at', SINCE)
      .order('created_at', { ascending: false })
      .limit(3);
    console.log(`\n--- ${signalType} (${examples?.length ?? 0} examples) ---`);
    for (const ex of examples ?? []) {
      console.log(`created_at=${ex.created_at} source=${ex.source} confidence=${ex.confidence}`);
      console.log(JSON.stringify(ex.signal_value, null, 2));
      console.log('');
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
