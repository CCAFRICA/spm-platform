/**
 * DIAG-063 / C1 — disputes table live existence probe (READ-ONLY)
 * - head:true count of disputes table
 * - select one row and print its KEYS ONLY (no content values)
 * Run: cd web && set -a && source .env.local && set +a && npx tsx scripts/diag/diag063_c1_disputes.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // 1) head:true count — table existence + row count
  const { count, error: countError } = await supabase
    .from('disputes')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.log('COUNT ERROR:', countError.code, countError.message)
  } else {
    console.log('disputes row count:', count)
  }

  // 2) one row, KEYS ONLY (no values printed)
  const { data, error: rowError } = await supabase
    .from('disputes')
    .select('*')
    .limit(1)

  if (rowError) {
    console.log('ROW ERROR:', rowError.code, rowError.message)
  } else if (!data || data.length === 0) {
    console.log('row keys: <no rows in table>')
  } else {
    console.log('row keys:', Object.keys(data[0]).join(', '))
  }
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e)
  process.exit(1)
})
