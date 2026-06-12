/**
 * DIAG-063 / E2 — Period-scoped plan assignment (READ-ONLY)
 *
 * Counts how many rule_set_assignments and rule_sets rows actually carry
 * effective_from / effective_to values. Counts only — no tenant names,
 * no payout values, no row contents.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function count(table: string, mod?: (q: any) => any): Promise<number | string> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (mod) q = mod(q);
  const { count: c, error } = await q;
  if (error) return `ERROR: ${error.message}`;
  return c ?? 0;
}

async function main() {
  const out: Record<string, number | string> = {};

  out['rule_set_assignments.total'] = await count('rule_set_assignments');
  out['rule_set_assignments.effective_from_not_null'] = await count(
    'rule_set_assignments', q => q.not('effective_from', 'is', null));
  out['rule_set_assignments.effective_to_not_null'] = await count(
    'rule_set_assignments', q => q.not('effective_to', 'is', null));

  out['rule_sets.total'] = await count('rule_sets');
  out['rule_sets.effective_from_not_null'] = await count(
    'rule_sets', q => q.not('effective_from', 'is', null));
  out['rule_sets.effective_to_not_null'] = await count(
    'rule_sets', q => q.not('effective_to', 'is', null));
  out['rule_sets.status_active'] = await count(
    'rule_sets', q => q.eq('status', 'active'));

  for (const [k, v] of Object.entries(out)) {
    console.log(`${k} = ${v}`);
  }
}

main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1); });
