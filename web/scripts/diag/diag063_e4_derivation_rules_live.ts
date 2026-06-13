// DIAG-063 / E4 — Filtered metric derivation: live-rule census (READ-ONLY).
// Counts metric_derivations rules in rule_sets.input_bindings by operation and
// filter presence. Structural output only: UUIDs, counts, operations, filter
// operators, filter counts. No tenant names, no filter VALUES, no payout data.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface DerivRule {
  metric?: string;
  operation?: string;
  source_field?: string;
  filters?: Array<{ field?: string; operator?: string; value?: unknown }>;
}

async function main() {
  const { data, error } = await supabase
    .from('rule_sets')
    .select('id, tenant_id, status, input_bindings')
    .limit(1000);
  if (error) { console.error('query error:', error.message); process.exit(1); }

  let ruleSetsWithDerivations = 0;
  const opCounts: Record<string, number> = {};
  const opFilteredCounts: Record<string, number> = {};
  const examples: string[] = [];

  for (const rs of data ?? []) {
    const ib = rs.input_bindings as Record<string, unknown> | null;
    const derivs = (ib?.metric_derivations as DerivRule[] | undefined) ?? [];
    if (!Array.isArray(derivs) || derivs.length === 0) continue;
    ruleSetsWithDerivations++;
    for (const d of derivs) {
      const op = d.operation ?? 'unknown';
      opCounts[op] = (opCounts[op] ?? 0) + 1;
      const filterCount = Array.isArray(d.filters) ? d.filters.length : 0;
      if (filterCount > 0) {
        opFilteredCounts[op] = (opFilteredCounts[op] ?? 0) + 1;
        if ((op === 'sum' || op === 'count') && examples.length < 6) {
          const operators = (d.filters ?? []).map(f => f.operator ?? '?').join(',');
          examples.push(
            `rule_set=${rs.id} tenant=${rs.tenant_id} status=${rs.status} ` +
            `op=${op} filters=${filterCount} operators=[${operators}] ` +
            `has_source_field=${Boolean(d.source_field)}`,
          );
        }
      }
    }
  }

  console.log(`rule_sets scanned: ${(data ?? []).length}`);
  console.log(`rule_sets with metric_derivations: ${ruleSetsWithDerivations}`);
  console.log(`derivation rules by operation:`, JSON.stringify(opCounts));
  console.log(`derivation rules WITH filters by operation:`, JSON.stringify(opFilteredCounts));
  console.log(`sum/count-with-filters examples (structural fields only):`);
  for (const e of examples) console.log('  ' + e);
}

main();
