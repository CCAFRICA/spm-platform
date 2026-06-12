/**
 * DIAG-063 / E6 — Multi-plan concurrency (READ-ONLY)
 *
 * 1) Page rule_set_assignments, group client-side by entity_id.
 * 2) Find entities with >=2 ACTIVE assignments to DISTINCT rule_sets
 *    (active = effective_from null-or-past AND effective_to null-or-future, as of today).
 * 3) For candidate entities, read calculation_results (identifiers only, no payout columns)
 *    and find ONE entity with >=2 distinct rule_set_id values in the SAME period.
 *
 * Output: UUIDs, counts, dates, types only. No payout values. No tenant names/slugs.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGE = 1000

interface Assignment {
  id: string
  tenant_id: string
  rule_set_id: string
  entity_id: string
  effective_from: string | null
  effective_to: string | null
  assignment_type: string
}

async function main() {
  // Total assignment count (head-only)
  const { count: totalAssignments, error: cntErr } = await supabase
    .from('rule_set_assignments')
    .select('id', { count: 'exact', head: true })
  if (cntErr) throw cntErr
  console.log(`rule_set_assignments total rows: ${totalAssignments}`)

  // Page all assignments
  const all: Assignment[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('rule_set_assignments')
      .select('id, tenant_id, rule_set_id, entity_id, effective_from, effective_to, assignment_type')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as Assignment[]))
    if (data.length < PAGE) break
  }
  console.log(`paged assignments fetched: ${all.length}`)

  const today = new Date().toISOString().slice(0, 10)
  const isActive = (a: Assignment) =>
    (a.effective_from === null || a.effective_from <= today) &&
    (a.effective_to === null || a.effective_to >= today)

  // Group by entity_id -> distinct active rule_set_ids
  const byEntity = new Map<string, Assignment[]>()
  for (const a of all) {
    const arr = byEntity.get(a.entity_id) ?? []
    arr.push(a)
    byEntity.set(a.entity_id, arr)
  }
  console.log(`distinct entity_ids with any assignment: ${byEntity.size}`)

  const candidates: { entity_id: string; tenant_id: string; ruleSets: string[]; rows: Assignment[] }[] = []
  for (const [entityId, rows] of Array.from(byEntity.entries())) {
    const active = rows.filter(isActive)
    const distinctRs = Array.from(new Set(active.map(r => r.rule_set_id)))
    if (distinctRs.length >= 2) {
      candidates.push({ entity_id: entityId, tenant_id: rows[0].tenant_id, ruleSets: distinctRs, rows: active })
    }
  }
  console.log(`entities with >=2 ACTIVE assignments to distinct rule_sets: ${candidates.length}`)

  // Distribution of distinct-active-rule_set counts
  const dist = new Map<number, number>()
  for (const [, rows] of Array.from(byEntity.entries())) {
    const n = new Set(rows.filter(isActive).map(r => r.rule_set_id)).size
    dist.set(n, (dist.get(n) ?? 0) + 1)
  }
  console.log('distribution (distinct active rule_sets per entity -> entity count):')
  for (const [k, v] of Array.from(dist.entries()).sort((a, b) => a[0] - b[0])) {
    console.log(`  ${k} -> ${v}`)
  }

  // assignment_type distribution
  const typeDist = new Map<string, number>()
  for (const a of all) typeDist.set(a.assignment_type, (typeDist.get(a.assignment_type) ?? 0) + 1)
  console.log('assignment_type distribution (all rows):')
  for (const [k, v] of Array.from(typeDist.entries())) console.log(`  ${k}: ${v}`)

  if (candidates.length === 0) {
    console.log('NO entity with >=2 active distinct rule_set assignments found in data.')
    return
  }

  // Show up to 5 sample candidates (identifiers only)
  console.log('\nsample candidates (up to 5):')
  for (const c of candidates.slice(0, 5)) {
    console.log(`  entity ${c.entity_id} (tenant ${c.tenant_id})`)
    for (const r of c.rows) {
      console.log(
        `    assignment ${r.id} rule_set ${r.rule_set_id} type=${r.assignment_type} from=${r.effective_from} to=${r.effective_to}`
      )
    }
  }

  // For each candidate (cap 25), check calculation_results for >=2 distinct rule_set_ids in one period
  console.log('\nchecking calculation_results for candidates (cap 25)...')
  let proven = false
  for (const c of candidates.slice(0, 25)) {
    const { data: results, error } = await supabase
      .from('calculation_results')
      .select('id, batch_id, rule_set_id, period_id, created_at')
      .eq('entity_id', c.entity_id)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw error
    const rows = results ?? []
    const byPeriod = new Map<string, typeof rows>()
    for (const r of rows) {
      const key = String(r.period_id)
      const arr = byPeriod.get(key) ?? []
      arr.push(r)
      byPeriod.set(key, arr)
    }
    for (const [periodId, prs] of Array.from(byPeriod.entries())) {
      const distinctRs = Array.from(new Set(prs.map(r => r.rule_set_id)))
      if (distinctRs.length >= 2) {
        proven = true
        console.log(`\nPROOF: entity ${c.entity_id} (tenant ${c.tenant_id})`)
        console.log(`  period ${periodId}: ${prs.length} calculation_results rows, ${distinctRs.length} distinct rule_set_ids`)
        for (const rs of distinctRs) {
          const rsRows = prs.filter(r => r.rule_set_id === rs)
          const batches = Array.from(new Set(rsRows.map(r => r.batch_id)))
          console.log(`    rule_set ${rs}: ${rsRows.length} result row(s), batch(es): ${batches.join(', ')}`)
        }
        break
      }
    }
    if (proven) break
    console.log(
      `  entity ${c.entity_id}: ${rows.length} calculation_results rows, periods with results: ${byPeriod.size}, max distinct rule_sets in one period: ${Math.max(0, ...Array.from(byPeriod.values()).map(p => new Set(p.map(r => r.rule_set_id)).size))}`
    )
  }
  if (!proven) {
    console.log('\nNO candidate entity has calculation_results with >=2 distinct rule_set_ids in a single period (within cap of 25 candidates checked).')
  }
}

main().catch(e => {
  console.error('ERROR:', e.message ?? e)
  process.exit(1)
})
