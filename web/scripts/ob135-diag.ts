// OB-135 Phase 0 Diagnostic
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== 0A: CLASSIFICATION_SIGNALS TABLE STATUS ===');
  const { count, error: countErr } = await sb
    .from('classification_signals')
    .select('*', { count: 'exact', head: true });
  if (countErr) {
    console.log('ERROR:', countErr.message);
  } else {
    console.log('Total signals in DB:', count);
  }

  const { data: samples } = await sb
    .from('classification_signals')
    .select('signal_type, confidence, source, created_at')
    .limit(10);
  console.log('Sample signals:', JSON.stringify(samples, null, 2));

  // Group by signal_type
  const { data: allSignals } = await sb
    .from('classification_signals')
    .select('signal_type');
  if (allSignals && allSignals.length > 0) {
    const types = new Map<string, number>();
    for (const s of allSignals) {
      types.set(s.signal_type, (types.get(s.signal_type) || 0) + 1);
    }
    console.log('Signal types:', Object.fromEntries(types));
  } else {
    console.log('Signal types: NONE (empty table)');
  }
}

main().catch(console.error);
