/**
 * DIAG-063 / E6 (detail) — tenant with 2 active rule_sets: population overlap and
 * period-level concurrency of calculation_results. READ-ONLY. Identifiers/counts only.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TENANT = 'f7093bcc-e90b-4918-9680-69da7952dd65'

async function main() {
  const { data: asg, error: aErr } = await supabase
    .from('rule_set_assignments')
    .select('entity_id, rule_set_id, effective_from, effective_to, assignment_type')
    .eq('tenant_id', TENANT)
    .limit(1000)
  if (aErr) throw aErr

  const byRs = new Map<string, Set<string>>()
  for (const a of asg ?? []) {
    const s = byRs.get(a.rule_set_id) ?? new Set<string>()
    s.add(a.entity_id)
    byRs.set(a.rule_set_id, s)
  }
  console.log(`tenant ${TENANT}: ${asg?.length ?? 0} assignment rows`)
  const rsIds = Array.from(byRs.keys())
  for (const rs of rsIds) {
    console.log(`  rule_set ${rs}: ${byRs.get(rs)!.size} assigned entities`)
  }
  if (rsIds.length === 2) {
    const [a, b] = rsIds
    const overlap = Array.from(byRs.get(a)!).filter(e => byRs.get(b)!.has(e))
    console.log(`  entity overlap between the two rule_sets: ${overlap.length}`)
  }
  const fromTo = new Set((asg ?? []).map(a => `from=${a.effective_from} to=${a.effective_to} type=${a.assignment_type}`))
  console.log(`  distinct (effective_from, effective_to, type) tuples: ${Array.from(fromTo).join(' | ')}`)

  const { data: res, error: rErr } = await supabase
    .from('calculation_results')
    .select('id, entity_id, rule_set_id, period_id, batch_id, created_at')
    .eq('tenant_id', TENANT)
    .limit(1000)
  if (rErr) throw rErr

  const byRsPeriod = new Map<string, { rows: number; batches: Set<string>; entities: Set<string>; created: Set<string> }>()
  for (const r of res ?? []) {
    const key = `${r.rule_set_id}|${r.period_id}`
    const agg = byRsPeriod.get(key) ?? { rows: 0, batches: new Set<string>(), entities: new Set<string>(), created: new Set<string>() }
    agg.rows += 1
    agg.batches.add(r.batch_id)
    agg.entities.add(r.entity_id)
    agg.created.add(String(r.created_at).slice(0, 19))
    byRsPeriod.set(key, agg)
  }
  console.log(`\ncalculation_results rows: ${res?.length ?? 0}`)
  console.log('grouped by (rule_set_id, period_id):')
  for (const [key, v] of Array.from(byRsPeriod.entries()).sort()) {
    const [rs, period] = key.split('|')
    console.log(`  rule_set ${rs} period ${period}:`)
    console.log(`    rows=${v.rows} entities=${v.entities.size} batches=${Array.from(v.batches).join(', ')}`)
    console.log(`    created_at (distinct, second precision): ${Array.from(v.created).sort().join(' | ')}`)
  }

  // Period-level concurrency: periods served by >=2 rule_sets
  const periodsByRs = new Map<string, Set<string>>()
  for (const [key] of Array.from(byRsPeriod.entries())) {
    const [rs, period] = key.split('|')
    const s = periodsByRs.get(period) ?? new Set<string>()
    s.add(rs)
    periodsByRs.set(period, s)
  }
  for (const [period, rsSet] of Array.from(periodsByRs.entries())) {
    console.log(`period ${period}: results from ${rsSet.size} distinct rule_set(s)`)
  }
}

main().catch(e => {
  console.error('ERROR:', e.message ?? e)
  process.exit(1)
})
