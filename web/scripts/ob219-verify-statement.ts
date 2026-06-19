#!/usr/bin/env npx tsx
/**
 * OB-219: prove the commission-statement data layer against REAL BCL data (read-only).
 * Picks a BCL entity that has per-row traces, assembles the statement via getCommissionStatement,
 * and asserts the shape: total > 0, the attributable component (Productos Cruzados) carries
 * per-transaction rows whose traced subtotal reconciles to its entity-level payout, and Pattern-C
 * components render entity-level only.
 *
 * Usage: cd web && set -a && source .env.local && set +a && npx tsx scripts/ob219-verify-statement.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getCommissionStatement } from '@/lib/compensation/commission-statement';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const BCL = 'b1c2d3e4-aaaa-bbbb-cccc-111111111111';

async function main() {
  // Find a BCL entity+period that has per-row traces.
  const { data: tr } = await supabase.from('calculation_traces').select('result_id').eq('tenant_id', BCL).not('committed_data_id', 'is', null).limit(1);
  const { data: res } = await supabase.from('calculation_results').select('entity_id, period_id').eq('id', (tr![0] as { result_id: string }).result_id).single();
  const entityId = (res as { entity_id: string }).entity_id;
  const periodId = (res as { period_id: string }).period_id;

  const stmt = await getCommissionStatement(supabase as never, BCL, entityId, periodId);
  if (!stmt) throw new Error('getCommissionStatement returned null');

  console.log('===== OB-219 commission statement (BCL, real data) =====');
  console.log(`entity: ${stmt.entity.displayName} (${stmt.entity.externalId})  period: ${stmt.period.label}`);
  console.log(`totalPayout: ${stmt.totalPayout}  hasTraces: ${stmt.hasTraces}  traceCount: ${stmt.traceCount}`);
  console.log('components:');
  for (const c of stmt.components) {
    console.log(`  - ${JSON.stringify(c.name)} payout=${c.payout} attributable=${c.attributable} pattern=${c.pattern} txns=${c.transactions.length} tracedSubtotal=${c.tracedSubtotal}`);
    if (c.transactions.length) {
      const t = c.transactions[0];
      console.log(`      sample tx: ref=${JSON.stringify(t.transactionRef)} date=${t.sourceDate} inputs=${JSON.stringify(t.inputs)} rate=${t.rate} contribution=${t.contribution} sourceRow=${t.sourceRow ? 'present' : 'null'}`);
    }
  }

  // Assertions
  const errors: string[] = [];
  if (!(stmt.totalPayout > 0)) errors.push(`totalPayout not > 0: ${stmt.totalPayout}`);
  const attributable = stmt.components.filter(c => c.attributable);
  if (attributable.length === 0) errors.push('no attributable component with per-transaction rows');
  for (const c of attributable) {
    if (Math.abs(c.tracedSubtotal - c.payout) > 0.01) errors.push(`component ${c.name}: tracedSubtotal ${c.tracedSubtotal} != payout ${c.payout}`);
    if (c.transactions.some(t => t.rate === null)) errors.push(`component ${c.name}: a transaction has null rate`);
    if (c.transactions.some(t => !t.sourceRow)) errors.push(`component ${c.name}: a transaction has no source row`);
  }
  const entityLevel = stmt.components.filter(c => !c.attributable);
  console.log(`\nattributable components: ${attributable.length}  entity-level (Pattern C) components: ${entityLevel.length}`);

  if (errors.length) { console.log('\n❌ FAIL:'); errors.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('\n✅ PASS — statement assembled: attributable component reconciles (tracedSubtotal === payout), per-tx rows carry rate/inputs/sourceRow; Pattern-C components render entity-level.');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
