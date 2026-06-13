// DIAG-064 §4 supplement (READ-ONLY): the morning warm run's per-sheet final
// classifications from its durable signals — the repair target map.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await sb.from('classification_signals')
    .select('sheet_name, classification, signal_value, created_at')
    .eq('tenant_id', '3d354bfa-b298-48dd-88a0-9f8c5a00be4e')
    .eq('signal_type', 'comprehension:unit_state')
    .eq('context->>importSessionId', 'd8085364-72b1-4c6f-9d9e-20606fb14831')
    .order('created_at', { ascending: true });
  const latest = new Map<string, string>();
  for (const r of (data ?? [])) {
    const sv = (r.signal_value ?? {}) as Record<string, unknown>;
    if (sv.state === 'classified' || sv.state === 'bound') {
      if (r.classification && r.sheet_name) latest.set(r.sheet_name as string, r.classification as string);
    }
  }
  console.log(`morning warm run (d8085364) final classifications — ${latest.size} sheets:`);
  for (const [sheet, cls] of Array.from(latest.entries()).sort()) console.log(`  ${sheet.padEnd(24)} ${cls}`);
}
main();
