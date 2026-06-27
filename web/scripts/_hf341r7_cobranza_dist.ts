import { config } from 'dotenv'; config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIR = '972c8eb0-e3ae-4e4c-ad30-8b34804c893a';
type Any = Record<string, unknown>;
async function fetchAll(table: string, sel: string): Promise<Any[]> {
  const out: Any[] = []; let from = 0;
  for (;;) { const { data, error } = await sb.from(table).select(sel).eq('tenant_id', MIR).range(from, from + 999);
    if (error) { console.error(error.message); break; } if (!data?.length) break; out.push(...(data as Any[])); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const cd = await fetchAll('committed_data', 'entity_id, data_type, row_data, source_date');
  const ents = await fetchAll('entities', 'id, external_id, display_name');
  const nameOf = new Map(ents.map(e => [String(e.id), `${e.external_id}/${e.display_name}`]));
  // June cobranza per entity
  const cob = cd.filter(r => { const rd = r.row_data as Any; return rd && 'Saldo_Pendiente' in rd && String(r.source_date).slice(0,7) === '2025-06'; });
  const byEnt = new Map<string, Any[]>();
  for (const r of cob) { const e = String(r.entity_id); (byEnt.get(e) ?? byEnt.set(e, []).get(e)!).push(r); }
  console.log(`\n=== June cobranza: ${cob.length} rows, ${byEnt.size} entities ===`);
  const rows: Any[] = [];
  for (const [e, rs] of byEnt) {
    const cobrado = rs.reduce((s, r) => s + (Number((r.row_data as Any).Monto_Cobrado) || 0), 0);
    const saldos = rs.map(r => Number((r.row_data as Any).Saldo_Pendiente) || 0);
    const snap = saldos[0];
    const rate = snap ? cobrado / snap : Infinity;
    rows.push({ e, cobrado, snap, rate, paid: rate > 0.7, payout: rate > 0.7 ? cobrado * 0.015 : 0 });
  }
  rows.sort((a, b) => (a.rate as number) - (b.rate as number));
  let blocked = 0, total = 0;
  for (const r of rows) { if (!r.paid) blocked++; total += r.payout as number;
    console.log(`  ${(nameOf.get(String(r.e))||r.e).padEnd(30)} rate=${(r.rate as number).toFixed(2).padStart(8)} cobrado=${Math.round(r.cobrado as number).toString().padStart(9)} snap=${Math.round(r.snap as number).toString().padStart(9)} → ${r.paid?'PAID '+Math.round(r.payout as number):'BLOCKED(0)'}`); }
  console.log(`\n  snapshot-rate model: ${blocked} blocked / ${rows.length} sellers | grandTotal June = ${Math.round(total)}`);
  // alt model: collected/(collected+saldo)
  let blocked2 = 0, total2 = 0;
  for (const r of rows) { const rate2 = (r.cobrado as number)/((r.cobrado as number)+(r.snap as number)); const paid2 = rate2 > 0.7; if(!paid2) blocked2++; if(paid2) total2 += (r.cobrado as number)*0.015; }
  console.log(`  ALT collected/(collected+saldo): ${blocked2} blocked | grandTotal=${Math.round(total2)}`);
})().catch(e => { console.error(e); process.exit(1); });
