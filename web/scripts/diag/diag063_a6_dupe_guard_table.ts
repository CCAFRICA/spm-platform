// DIAG-063 / A6 — Duplicate-execution guard: live verification of plan_interpretation_runs
// READ-ONLY: head:true counts only. No tenant names/slugs. No payout values.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function count(label: string, status?: string) {
  let q = supabase.from('plan_interpretation_runs').select('*', { count: 'exact', head: true });
  if (status) q = q.eq('status', status);
  const { count: c, error } = await q;
  if (error) {
    console.log(`${label}: ERROR ${error.code ?? ''} ${error.message}`);
    return;
  }
  console.log(`${label}: ${c}`);
}

async function main() {
  await count('plan_interpretation_runs total');
  // status values are registry-derived from src/lib/sci/plan-idempotency.ts (claimRun/completeRun/failRun)
  await count("status='completed'", 'completed');
  await count("status='in_progress'", 'in_progress');
  await count("status='failed'", 'failed');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
