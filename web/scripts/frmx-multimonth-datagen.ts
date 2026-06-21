/**
 * HF-324 Phase 3 (O2) — extend Sabor (FRMX) from January 2024 to January–June 2024.
 *
 * Clones the 43,875 corrected January cheques into Feb–Jun with realistic variation (C4):
 *   - seasonal monthly revenue curve (not flat)
 *   - deterministic per-location ±10% monthly noise (sparklines move)
 *   - declining leakage rate over the 6 months (operator improving)
 *   - stable tip rate (±0.5% jitter)
 *   - guests / item counts ∝ revenue
 *   - full ChequeRowData contract preserved; entity_id + mesero_id preserved
 *   - new fecha/cierre/source_date in the target month; period_id → that month's period
 *
 * Idempotent: deletes all non-January committed_data rows AND non-January periods first.
 * January (the HF-321 baseline) is never modified (C5). Batch insert ≤500 with per-batch error
 * check + retry/split (HF-321 learning: Supabase reports errors in-result).
 *
 * Run from web/:  set -a && source .env.local && set +a && npx tsx scripts/frmx-multimonth-datagen.ts
 *   --dry  computes the projected 6-month gross/checks without writing.
 */
import { createClient } from '@supabase/supabase-js';

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TID = 'f7093bcc-e90b-4918-9680-69da7952dd65';
const DRY = process.argv.includes('--dry');

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return isNaN(n) ? 0 : n; };

// Deterministic [0,1) from a string seed (idempotent values, no Math.random).
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// month index 2..6 (Feb..Jun); leap 2024
const MONTHS = [2, 3, 4, 5, 6];
const DAYS_IN: Record<number, number> = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30 };
const MONTH_ES: Record<number, string> = { 1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio' };
// seasonal curve: post-holiday Feb dip, spring/summer rise (sum ≈ 5.20 → 6-mo gross ≈ MX$100M)
const MONTH_FACTOR: Record<number, number> = { 2: 0.90, 3: 0.97, 4: 1.05, 5: 1.12, 6: 1.16 };
// declining leakage multiplier (applied on top of revScale to discount/comp fields)
const LEAKAGE_DECLINE: Record<number, number> = { 2: 0.95, 3: 0.88, 4: 0.82, 5: 0.75, 6: 0.68 };

const pad = (n: number) => String(n).padStart(2, '0');

/** shift a "2024-01-DDThh:mm:ss" datetime to target month, clamping the day to the month length. */
function shiftDate(dt: string, m: number): string {
  if (!dt || !dt.includes('-')) return dt;
  const day = Math.min(parseInt(dt.substring(8, 10) || '1', 10) || 1, DAYS_IN[m]);
  const time = dt.length > 10 ? dt.substring(10) : '';
  return `2024-${pad(m)}-${pad(day)}${time}`;
}

interface Row { entity_id: string; period_id: string; source_date: string; row_data: Record<string, unknown>; }

/** which period (weekly W01–W03 by day, else monthly) a cheque belongs to in month m. */
function periodFor(day: number, periodIds: { w1: string; w2: string; w3: string; mo: string }): string {
  if (day <= 7) return periodIds.w1;
  if (day <= 14) return periodIds.w2;
  if (day <= 21) return periodIds.w3;
  return periodIds.mo;
}

function transform(src: Row, m: number): Row {
  const rd = src.row_data;
  const revScale = MONTH_FACTOR[m] * (0.9 + 0.2 * hash01(`${src.entity_id}|${m}`)); // ±10% per-location
  const tipJitter = 1 + (hash01(`tip|${rd.numero_cheque}|${m}`) - 0.5) * 0.01;       // ±0.5%
  const leak = revScale * LEAKAGE_DECLINE[m];

  const total = r2(num(rd.total) * revScale);
  const subtotal = r2(num(rd.subtotal) * revScale);
  const descuento = r2(num(rd.descuento) * leak);
  const efectivo = r2(num(rd.efectivo) * revScale);
  const tarjeta = r2(num(rd.tarjeta) * revScale);
  const guests = Math.max(1, Math.round(num(rd.numero_de_personas) * revScale));
  const fecha = shiftDate(String(rd.fecha ?? ''), m);
  const cierre = shiftDate(String(rd.cierre ?? ''), m);
  const day = parseInt(fecha.substring(8, 10) || '1', 10);

  const out: Record<string, unknown> = {
    ...rd,
    fecha, cierre,
    total, subtotal,
    subtotal_con_descuento: r2(subtotal - descuento),
    total_alimentos: r2(num(rd.total_alimentos) * revScale),
    total_bebidas: r2(num(rd.total_bebidas) * revScale),
    total_impuesto: r2(num(rd.total_impuesto) * revScale),
    efectivo, tarjeta,
    pagado: num(rd.cancelado) === 1 ? 0 : total,
    propina: r2(num(rd.propina) * revScale * tipJitter),
    descuento,
    total_descuentos: r2(num(rd.total_descuentos) * leak),
    total_cortesias: r2(num(rd.total_cortesias) * leak),
    numero_de_personas: guests,
    total_articulos: Math.max(1, Math.round(num(rd.total_articulos) * revScale)),
    // keep folio/numero_cheque unique across months
    numero_cheque: num(rd.numero_cheque) + m * 1_000_000,
    folio: num(rd.folio) + m * 1_000_000,
  };
  return { entity_id: src.entity_id, period_id: '', source_date: `2024-${pad(m)}-${pad(day)}`, row_data: out, ...{ _day: day } as unknown as object };
}

async function insertBatch(rows: Record<string, unknown>[]): Promise<number> {
  const { error } = await c.from('committed_data').insert(rows);
  if (!error) return 0;
  // retry once, then split to isolate failures
  const { error: e2 } = await c.from('committed_data').insert(rows);
  if (!e2) return 0;
  if (rows.length === 1) { console.log('  row failed:', e2.message); return 1; }
  const mid = Math.floor(rows.length / 2);
  return (await insertBatch(rows.slice(0, mid))) + (await insertBatch(rows.slice(mid)));
}

(async () => {
  console.log(`HF-324 multi-month datagen ${DRY ? '(DRY)' : '(LIVE)'} | tenant ${TID}`);

  // load all January cheques (paginate)
  const jan: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await c.from('committed_data')
      .select('entity_id, period_id, source_date, row_data')
      .eq('tenant_id', TID).eq('data_type', 'pos_cheque').range(off, off + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    jan.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const janGross = jan.reduce((s, r) => s + num(r.row_data.total), 0);
  console.log(`January cheques: ${jan.length} | gross ${janGross.toFixed(2)}`);

  // project 6-month totals
  let projGross = janGross, projChecks = jan.length;
  for (const m of MONTHS) {
    for (const src of jan) projGross += num(transform(src, m).row_data.total);
    projChecks += jan.length;
  }
  console.log(`PROJECTED 6-month gross ≈ ${projGross.toFixed(2)} (target ~MX$97M ±10%) | checks ≈ ${projChecks}`);
  if (DRY) { console.log('DRY — no writes.'); return; }

  // ── idempotent cleanup: delete non-January rows + periods ──
  const { error: delRows } = await c.from('committed_data').delete().eq('tenant_id', TID).gte('source_date', '2024-02-01');
  if (delRows) throw delRows;
  const { error: delPer } = await c.from('periods').delete().eq('tenant_id', TID).gte('start_date', '2024-02-01');
  if (delPer) throw delPer;
  console.log('cleaned non-January rows + periods');

  // ── create Feb–Jun periods (3 weekly + 1 monthly each, matching January) ──
  const periodIdByMonth: Record<number, { w1: string; w2: string; w3: string; mo: string }> = {};
  for (const m of MONTHS) {
    const mm = pad(m), last = DAYS_IN[m], name = MONTH_ES[m];
    const toInsert = [
      { label: `Semana 1 - ${name} 2024`, period_type: 'weekly', start_date: `2024-${mm}-01`, end_date: `2024-${mm}-07`, canonical_key: `2024-${mm}-W01`, status: 'closed', metadata: {} },
      { label: `Semana 2 - ${name} 2024`, period_type: 'weekly', start_date: `2024-${mm}-08`, end_date: `2024-${mm}-14`, canonical_key: `2024-${mm}-W02`, status: 'closed', metadata: {} },
      { label: `Semana 3 - ${name} 2024`, period_type: 'weekly', start_date: `2024-${mm}-15`, end_date: `2024-${mm}-21`, canonical_key: `2024-${mm}-W03`, status: 'closed', metadata: {} },
      { label: `${name} 2024`, period_type: 'monthly', start_date: `2024-${mm}-01`, end_date: `2024-${mm}-${pad(last)}`, canonical_key: `2024-${mm}`, status: 'closed', metadata: {} },
    ].map(p => ({ ...p, tenant_id: TID }));
    const { data: created, error } = await c.from('periods').insert(toInsert).select('id, canonical_key');
    if (error) throw error;
    const byKey = new Map((created ?? []).map(p => [p.canonical_key as string, p.id as string]));
    periodIdByMonth[m] = { w1: byKey.get(`2024-${mm}-W01`)!, w2: byKey.get(`2024-${mm}-W02`)!, w3: byKey.get(`2024-${mm}-W03`)!, mo: byKey.get(`2024-${mm}`)! };
  }
  console.log(`created ${MONTHS.length * 4} periods (Feb–Jun)`);

  // ── clone cheques per month, batch-insert ──
  let written = 0, failed = 0;
  for (const m of MONTHS) {
    const rows: Record<string, unknown>[] = [];
    for (const src of jan) {
      const t = transform(src, m) as Row & { _day: number };
      rows.push({
        tenant_id: TID, entity_id: t.entity_id, data_type: 'pos_cheque', metadata: {},
        period_id: periodFor(t._day, periodIdByMonth[m]), source_date: t.source_date, row_data: t.row_data,
      });
    }
    for (let i = 0; i < rows.length; i += 500) {
      failed += await insertBatch(rows.slice(i, i + 500));
      written += Math.min(500, rows.length - i);
    }
    console.log(`  ${MONTH_ES[m]}: inserted ${rows.length} (cumulative ${written}, failures ${failed})`);
  }
  if (failed > 0) { console.log(`!! ${failed} rows failed after retry/split — HALT-4`); process.exit(1); }

  // ── verify ──
  const { count: total } = await c.from('committed_data').select('id', { count: 'exact', head: true }).eq('tenant_id', TID).eq('data_type', 'pos_cheque');
  let gross = 0;
  for (let off = 0; ; off += 1000) {
    const { data } = await c.from('committed_data').select('row_data').eq('tenant_id', TID).eq('data_type', 'pos_cheque').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const p of data) gross += num((p.row_data as Record<string, unknown>).total);
    if (data.length < 1000) break;
  }
  const { count: periodCount } = await c.from('periods').select('id', { count: 'exact', head: true }).eq('tenant_id', TID);
  console.log('\n── read-back ──');
  console.log(`total pos_cheque rows = ${total} (target ~262K) | 6-month gross = ${gross.toFixed(2)} (target ~MX$97M) | periods = ${periodCount}`);
  console.log('HF-324 Phase 3 multi-month datagen COMPLETE.');
})();
