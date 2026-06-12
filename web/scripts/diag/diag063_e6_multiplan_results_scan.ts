/**
 * DIAG-063 / E6 (secondary) — scan calculation_results for ANY (entity_id, period_id)
 * pair carrying >=2 distinct rule_set_id values, independent of current assignments.
 * READ-ONLY. Identifiers and counts only — no payout columns selected.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGE = 1000
const CAP = 200000

async function main() {
  const { count, error: cntErr } = await supabase
    .from('calculation_results')
    .select('id', { count: 'exact', head: true })
  if (cntErr) throw cntErr
  console.log(`calculation_results total rows: ${count}`)
  if ((count ?? 0) > CAP) {
    console.log(`row count exceeds scan cap (${CAP}); scanning first ${CAP} ordered by id`)
  }

  type Row = { entity_id: string; period_id: string | null; rule_set_id: string | null; batch_id: string; tenant_id: string }
  const map = new Map<string, { ruleSets: Set<string>; batches: Set<string>; rows: number; tenant: string }>()

  let fetched = 0
  for (let from = 0; from < CAP; from += PAGE) {
    const { data, error } = await supabase
      .from('calculation_results')
      .select('entity_id, period_id, rule_set_id, batch_id, tenant_id')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    fetched += data.length
    for (const r of data as Row[]) {
      if (!r.period_id || !r.rule_set_id) continue
      const key = `${r.entity_id}|${r.period_id}`
      const agg = map.get(key) ?? { ruleSets: new Set<string>(), batches: new Set<string>(), rows: 0, tenant: r.tenant_id }
      agg.ruleSets.add(r.rule_set_id)
      agg.batches.add(r.batch_id)
      agg.rows += 1
      map.set(key, agg)
    }
    if (data.length < PAGE) break
  }
  console.log(`rows scanned: ${fetched}`)
  console.log(`distinct (entity_id, period_id) pairs with non-null period+rule_set: ${map.size}`)

  const multi = Array.from(map.entries()).filter(([, v]) => v.ruleSets.size >= 2)
  console.log(`pairs with >=2 distinct rule_set_ids: ${multi.length}`)

  for (const [key, v] of multi.slice(0, 5)) {
    const [entityId, periodId] = key.split('|')
    console.log(`  entity ${entityId} period ${periodId} (tenant ${v.tenant})`)
    console.log(`    result rows: ${v.rows}, distinct rule_sets: ${v.ruleSets.size}, distinct batches: ${v.batches.size}`)
    console.log(`    rule_set_ids: ${Array.from(v.ruleSets).join(', ')}`)
    console.log(`    batch_ids: ${Array.from(v.batches).join(', ')}`)
  }
  if (multi.length === 0) {
    console.log('NO (entity, period) pair in calculation_results carries more than one rule_set_id.')
  }
}

main().catch(e => {
  console.error('ERROR:', e.message ?? e)
  process.exit(1)
})
