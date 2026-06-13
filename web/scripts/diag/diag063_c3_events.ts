/**
 * DIAG-063 / C3 — Audit trail coverage (READ-ONLY)
 *
 * Aggregates distinct platform_events.event_type values with counts, and
 * audit_logs.action + resource_type values with counts.
 *
 * Method: PostgREST has no GROUP BY, so:
 *   1) head:true count each table.
 *   2) Page the needed column(s) ONLY in 1000-row pages and aggregate client-side.
 * SELECT-only. No tenant names/slugs. No payload values printed.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE = 1000;

async function countTable(table: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`[${table}] head count ERROR: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

async function aggregateColumn(
  table: string,
  columns: string,
  keyFn: (row: Record<string, unknown>) => string,
  total: number
): Promise<Map<string, number>> {
  const agg = new Map<string, number>();
  for (let from = 0; from < total; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, Math.min(from + PAGE - 1, total - 1));
    if (error) {
      console.log(`[${table}] page from=${from} ERROR: ${error.message}`);
      break;
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const k = keyFn(row);
      agg.set(k, (agg.get(k) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
  }
  return agg;
}

function printAgg(label: string, agg: Map<string, number>) {
  const sorted = Array.from(agg.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`\n${label} (${sorted.length} distinct):`);
  for (const [k, n] of sorted) console.log(`  ${k}  -> ${n}`);
}

async function main() {
  // --- platform_events ---
  const peCount = await countTable('platform_events');
  console.log(`platform_events total rows (head:true count): ${peCount}`);
  if (peCount !== null && peCount > 0) {
    console.log(
      `method: paging event_type column only, ${PAGE}-row pages, client-side aggregation`
    );
    const peAgg = await aggregateColumn(
      'platform_events',
      'event_type, created_at',
      (r) => String(r.event_type),
      peCount
    );
    printAgg('platform_events.event_type', peAgg);
  }

  // --- audit_logs ---
  const alCount = await countTable('audit_logs');
  console.log(`\naudit_logs total rows (head:true count): ${alCount}`);
  if (alCount !== null && alCount > 0) {
    console.log(
      `method: paging action,resource_type columns only, ${PAGE}-row pages, client-side aggregation`
    );
    const alAgg = await aggregateColumn(
      'audit_logs',
      'action, resource_type, created_at',
      (r) => `${String(r.action)} | ${String(r.resource_type)}`,
      alCount
    );
    printAgg('audit_logs (action | resource_type)', alAgg);
  }
}

main().catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exit(1);
});
