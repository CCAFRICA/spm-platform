/**
 * DIAG-063 / E6 (tertiary) — per-tenant multi-plan landscape. READ-ONLY.
 * For each tenant: count of rule_sets (by status), count of assignments,
 * distinct rule_set_ids appearing in assignments, distinct rule_set_ids in calculation_results.
 * UUIDs and counts only. No rule_set names, no tenant names.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGE = 1000

async function pageAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
  }
  return out
}

async function main() {
  const ruleSets = await pageAll<{ id: string; tenant_id: string; status: string }>('rule_sets', 'id, tenant_id, status')
  const assignments = await pageAll<{ id: string; tenant_id: string; rule_set_id: string; entity_id: string }>('rule_set_assignments', 'id, tenant_id, rule_set_id, entity_id')
  const results = await pageAll<{ id: string; tenant_id: string; rule_set_id: string | null }>('calculation_results', 'id, tenant_id, rule_set_id')

  const tenants = new Set<string>([...ruleSets.map(r => r.tenant_id), ...assignments.map(a => a.tenant_id)])
  console.log(`tenants with rule_sets or assignments: ${tenants.size}`)
  console.log('')
  for (const t of Array.from(tenants)) {
    const rs = ruleSets.filter(r => r.tenant_id === t)
    const statusDist = new Map<string, number>()
    for (const r of rs) statusDist.set(r.status, (statusDist.get(r.status) ?? 0) + 1)
    const asg = assignments.filter(a => a.tenant_id === t)
    const asgRs = new Set(asg.map(a => a.rule_set_id))
    const res = results.filter(r => r.tenant_id === t)
    const resRs = new Set(res.map(r => r.rule_set_id).filter(Boolean))
    console.log(`tenant ${t}`)
    console.log(`  rule_sets: ${rs.length} (${Array.from(statusDist.entries()).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'})`)
    console.log(`  assignments: ${asg.length} rows across ${asgRs.size} distinct rule_set_id(s): ${Array.from(asgRs).join(', ') || '-'}`)
    console.log(`  calculation_results: ${res.length} rows across ${resRs.size} distinct rule_set_id(s)`)
  }
}

main().catch(e => {
  console.error('ERROR:', e.message ?? e)
  process.exit(1)
})
